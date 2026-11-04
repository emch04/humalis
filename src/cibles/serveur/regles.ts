/**
 * Les valeurs que le serveur décide à la création d'une fiche : « au depart »,
 * « calcule », « au plus », « du site » et « creer … dans … ». Rien de la
 * requête ne peut les remplacer ; les règles d'accès restent celles des packs.
 */
import type { RegleChampRI, ServeurRI, ValeurLieeRI } from '../../ri/types.js';
import { camel, pascal } from '../web/noms.js';

const chaine = (texte: string) => JSON.stringify(texte);
const cle = (champ: string) => `fiche[${chaine(camel(champ))}]`;

type Donnee = ServeurRI['donnees'][number];
type Route = ServeurRI['routes'][number];

const decide = (regle: RegleChampRI | undefined) => regle?.genre === 'depart' || regle?.genre === 'nombreDe' || regle?.genre === 'somme';

/** Les champs que seul le serveur remplit à la création : ceux de la donnée, et ceux que « dans » remplit sur cette route. */
export function champsDuServeur(donnee: Donnee, route?: Route): string[] {
  const dans = (route?.creations ?? []).flatMap((c) => (c.dans !== undefined ? [c.dans] : []));
  return donnee.champs.filter((c) => decide(c.regle) || dans.includes(c.nom)).map((c) => camel(c.nom));
}

const champsDuSite = (donnee: Donnee) => donnee.champs.filter((c) => c.regle?.genre === 'site').map((c) => camel(c.nom));

/** Le dernier argument de verifierEnvoi ; rien si la donnée n'a pas de règle, pour que le code produit ne change pas. */
export function reglesEnvoi(donnee: Donnee, route: Route): string {
  const serveur = champsDuServeur(donnee, route);
  const site = champsDuSite(donnee);
  const nonVides = donnee.champs.filter((c) => c.nonVide).map((c) => camel(c.nom));
  if (serveur.length === 0 && site.length === 0 && nonVides.length === 0) return '';
  return `, { duServeur: ${JSON.stringify(serveur)}, duSite: ${JSON.stringify(site)}${nonVides.length > 0 ? `, nonVides: ${JSON.stringify(nonVides)}` : ''} }`;
}

/** Vrai si la création de cette donnée passe par une fonction « completer… ». */
const aCompleter = (donnee: Donnee) => donnee.champs.some((c) => decide(c.regle) || c.regle?.genre === 'auPlus');

/** La fonction qui écrit, dans la fiche reçue, ce que le serveur décide : l'ordre importe (les calculs lisent les autres champs). */
function fonctionCompleter(donnee: Donnee): string {
  const lignes: string[] = [];
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre === 'depart') lignes.push(`        ${cle(nom)} = ${regle.valeur.genre === 'aujourdhui' ? "new Date().toISOString().slice(0, 10)" : JSON.stringify(regle.valeur.valeur)};`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre !== 'auPlus') continue;
    lignes.push(`        const plafond${pascal(nom)} = await plafondDe(stockages.${camel(regle.donnee)}, ${chaine(camel(regle.par))}, ${cle(regle.par)}, ${chaine(camel(regle.prix))});
        if (typeof ${cle(nom)} !== 'number' || ${cle(nom)} < 0 || ${cle(nom)} > plafond${pascal(nom)}) return { erreur: \`le champ « ${camel(nom)} » doit être entre 0 et \${plafond${pascal(nom)}}\` };`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre === 'nombreDe') lignes.push(`        ${cle(nom)} = Array.isArray(${cle(regle.liste)}) ? ${cle(regle.liste)}.length : 0;`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre !== 'somme') continue;
    lignes.push(`        const somme${pascal(nom)} = await sommeDesPrix(stockages.${camel(regle.donnee)}, ${cle(regle.liste)}, ${chaine(camel(regle.prix))});
        if (typeof somme${pascal(nom)} === 'string') return { erreur: \`le champ « ${camel(regle.liste)} » : \${somme${pascal(nom)}}\` };
        ${cle(nom)} = somme${pascal(nom)}${regle.plus !== undefined ? ` + Number(${cle(regle.plus)})` : ''};`);
  }
  return `      // Ce que le serveur décide pour « ${donnee.nom} » : la requête ne peut pas le choisir.
      const completer${pascal(donnee.nom)} = async (recu: Record<string, unknown>): Promise<{ valeur: Record<string, unknown> } | { erreur: string }> => {
        const fiche: Record<string, unknown> = { ...recu };
${lignes.join('\n')}
        return { valeur: fiche };
      };
`;
}

/** Les fonctions « completer… » de ce serveur. */
export function codeCompleter(serveur: ServeurRI): string {
  return serveur.donnees.filter(aCompleter).map(fonctionCompleter).join('');
}

const importsVerifier = (serveur: ServeurRI) => {
  const regles = serveur.donnees.flatMap((d) => d.champs.map((c) => c.regle?.genre));
  return [...(regles.includes('auPlus') ? ['plafondDe'] : []), ...(regles.includes('somme') ? ['sommeDesPrix'] : [])];
};
export const noms = importsVerifier;

function valeurLiee(valeur: ValeurLieeRI, parent: string): string {
  if (valeur.genre === 'champ') return `${parent}[${chaine(camel(valeur.champ))}]`;
  if (valeur.genre === 'aujourdhui') return 'new Date().toISOString().slice(0, 10)';
  return JSON.stringify(valeur.valeur);
}

/** Le corps de POST : vérifier, compléter, créer les fiches liées, créer, répondre. */
export function codeCreation(serveur: ServeurRI, route: Route, donnee: Donnee, schema: string, emails: string): string {
  const nom = camel(route.donnee);
  const verifier = `const envoi = verifierEnvoi(${schema}, req.body, true${reglesEnvoi(donnee, route)});`;
  const creations = route.creations ?? [];
  if (!aCompleter(donnee) && creations.length === 0 && emails === '') {
    return `          ${verifier}
          if ('erreur' in envoi) res.status(400).json({ erreur: envoi.erreur });
          else res.status(201).json(await stockages.${nom}.creer(envoi.valeur));`;
  }
  const lignes = [
    `          ${verifier}`,
    `          if ('erreur' in envoi) {`,
    `            res.status(400).json({ erreur: envoi.erreur });`,
    `            return;`,
    `          }`,
  ];
  if (aCompleter(donnee)) {
    lignes.push(
      `          const complete = await completer${pascal(donnee.nom)}(envoi.valeur);`,
      `          if ('erreur' in complete) {`,
      `            res.status(400).json({ erreur: complete.erreur });`,
      `            return;`,
      `          }`,
      `          const recue = complete.valeur;`,
    );
  } else lignes.push(`          const recue: Record<string, unknown> = envoi.valeur;`);
  creations.forEach((creation, i) => {
    const liee = serveur.donnees.find((d) => d.nom === creation.donnee)!;
    const valeurs = `{ ${creation.valeurs.map((v) => `${chaine(camel(v.champ))}: ${valeurLiee(v.valeur, 'recue')}`).join(', ')} }`;
    lignes.push(`          // « creer ${creation.donnee} » : la fiche liée vient de ce que le serveur a vérifié.`);
    if (aCompleter(liee)) {
      lignes.push(
        `          const liee${i} = await completer${pascal(liee.nom)}(${valeurs});`,
        `          if ('erreur' in liee${i}) {`,
        `            res.status(400).json({ erreur: liee${i}.erreur });`,
        `            return;`,
        `          }`,
        `          const creee${i} = await stockages.${camel(liee.nom)}.creer(liee${i}.valeur);`,
      );
    } else lignes.push(`          const creee${i} = await stockages.${camel(liee.nom)}.creer(${valeurs});`);
    if (creation.dans !== undefined) lignes.push(`          recue[${chaine(camel(creation.dans))}] = creee${i}.id;`);
  });
  lignes.push(`          const cree = await stockages.${nom}.creer(recue);`, `          res.status(201).json(cree);`);
  if (emails !== '') lignes.push(`          // La réponse est partie : un e-mail raté ne fait pas échouer la création.`, emails);
  return lignes.join('\n');
}
