/**
 * Les fonctions d'actions (plan du langage de base, tâche 1) : une fonction
 * sans « rendre » est une suite d'actions, appelée seule sur une ligne d'un
 * événement : « vider_panier() ». Elle s'écrit en haut du fichier ou dans une
 * page.
 *
 * L'appel est déplié ici, avant l'analyse : il est remplacé par le corps de la
 * fonction, précédé d'une variable locale par valeur reçue. L'analyse et les
 * cibles voient donc des actions ordinaires d'un événement, avec leurs règles
 * et leur code produit habituels.
 */
import type { DefinitionFonction, Instruction, Programme } from './ast.js';
import { ErreurSyntaxique } from './erreurs.js';

/** Vrai si un « rendre » apparaît quelque part dans ces instructions. */
export function contientRendre(instructions: Instruction[]): boolean {
  return instructions.some((i) => i.type === 'Rendre' || enfants(i).some(contientRendre));
}

/** Les suites d'instructions contenues dans une instruction (si, boucles, selon, événements…). */
function enfants(instruction: Instruction): Instruction[][] {
  const listes: Instruction[][] = [];
  const objet = instruction as unknown as Record<string, unknown>;
  for (const cle of ['corps', 'alors', 'sinon']) if (Array.isArray(objet[cle])) listes.push(objet[cle] as Instruction[]);
  if (Array.isArray(objet.cas)) for (const c of objet.cas as { corps: Instruction[] }[]) listes.push(c.corps);
  const action = objet.action as { corps?: Instruction[] } | undefined;
  if (action && typeof action === 'object' && Array.isArray(action.corps)) listes.push(action.corps);
  return listes;
}

/** Une copie du corps où chaque valeur reçue porte son nouveau nom (« nom » → « nom_saluer »). */
function renommer<T>(valeur: T, noms: Map<string, string>): T {
  const copie = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(copie);
    if (!v || typeof v !== 'object') return v;
    const objet = v as Record<string, unknown>;
    const resultat: Record<string, unknown> = {};
    for (const [cle, contenu] of Object.entries(objet)) resultat[cle] = copie(contenu);
    if ((objet.type === 'Reference' || objet.type === 'Affectation') && typeof objet.nom === 'string' && noms.has(objet.nom)) {
      resultat.nom = noms.get(objet.nom);
    }
    // « {nom} », « {client.ville} », « {prix en FC} » dans un texte.
    if (objet.type === 'variable' && typeof objet.valeur === 'string') {
      resultat.valeur = objet.valeur.replace(/^[^.\s]+/, (debut) => noms.get(debut) ?? debut);
    }
    return resultat;
  };
  return copie(valeur) as T;
}

/**
 * Déplie les appels de fonctions d'actions dans tout le programme, et retire
 * ces fonctions de la liste des fonctions de calcul. Rend leurs noms, pour
 * que l'analyse explique un appel employé comme une valeur.
 */
export function deplierFonctionsActions(programme: Programme): string[] {
  const enHaut = new Map(programme.fonctions.filter((f) => !contientRendre(f.corps)).map((f) => [f.nom, f]));
  programme.fonctions = programme.fonctions.filter((f) => !enHaut.has(f.nom));
  const noms = new Set(enHaut.keys());
  const utilises = new Map<string, number>();

  const deplier = (instructions: Instruction[], fonctions: Map<string, DefinitionFonction>, pile: string[]): Instruction[] =>
    instructions.flatMap((instruction): Instruction[] => {
      for (const liste of enfants(instruction)) liste.splice(0, liste.length, ...deplier(liste, fonctions, pile));
      if (instruction.type !== 'Execution') return [instruction];
      const definition = fonctions.get(instruction.nom);
      if (!definition) return [instruction];
      if (pile.includes(instruction.nom)) {
        throw new ErreurSyntaxique(`« ${instruction.nom} » s'appelle elle-même : une fonction d'actions ne peut pas se rappeler (elle ne s'arrêterait jamais).`, instruction.ligne);
      }
      if (instruction.arguments.length !== definition.parametres.length) {
        const attendu = definition.parametres.length;
        throw new ErreurSyntaxique(
          `« ${instruction.nom} » attend ${attendu} valeur${attendu > 1 ? 's' : ''}${attendu ? ` (${definition.parametres.map((p) => p.nom).join(', ')})` : ''} ; ici, ${instruction.arguments.length}.`,
          instruction.ligne,
        );
      }
      // Chaque appel a ses propres variables locales : « nom_saluer », puis « nom_saluer_2 »…
      const fois = (utilises.get(instruction.nom) ?? 0) + 1;
      utilises.set(instruction.nom, fois);
      const nouveaux = new Map(definition.parametres.map((p) => [p.nom, `${p.nom}_${instruction.nom}${fois > 1 ? `_${fois}` : ''}`]));
      const locales: Instruction[] = definition.parametres.map((p, i) => ({ type: 'Variable', nom: nouveaux.get(p.nom)!, valeur: instruction.arguments[i], ligne: instruction.ligne }));
      return [...locales, ...deplier(renommer(definition.corps, nouveaux), fonctions, [...pile, instruction.nom])];
    });

  for (const lieu of [...programme.pages, ...programme.composants, ...(programme.entete ? [programme.entete] : []), ...(programme.pied ? [programme.pied] : [])]) {
    // Les fonctions écrites dans la page : seulement des fonctions d'actions.
    const locales = lieu.corps.filter((i): i is DefinitionFonction => i.type === 'Fonction');
    for (const f of locales) {
      if (contientRendre(f.corps)) {
        throw new ErreurSyntaxique(`« ${f.nom} » rend une valeur : une fonction de calcul s'écrit en haut du fichier, pour servir à toutes les pages.`, f.ligne);
      }
      noms.add(f.nom);
    }
    const fonctions = new Map([...enHaut, ...locales.map((f): [string, DefinitionFonction] => [f.nom, f])]);
    lieu.corps = deplier(lieu.corps.filter((i) => i.type !== 'Fonction'), fonctions, []);
  }
  return [...noms];
}
