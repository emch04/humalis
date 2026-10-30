import { ligneLocale } from '../fichiers.js';
import type { Element, Formulaire, Instruction, Page } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';

export interface ElementRecense {
  noeud: Element;
  /** Identifiant stable, utilisé par la représentation intermédiaire. */
  id: string;
  nom?: string;
  /** Le contenu de l'élément, quand c'est un texte écrit entre guillemets. */
  libelle?: string;
  ligne: number;
}

/** Un bloc « formulaire "…" : » de la page, avec les champs qu'il envoie. */
export interface FormulaireRecense {
  noeud: Formulaire;
  /** « formulaire_message » : l'identifiant du formulaire dans la représentation intermédiaire. */
  id: string;
  nom: string;
  /** Les identifiants des champs du formulaire, dans l'ordre. */
  champs: string[];
  ligne: number;
}

export type Resolution =
  | { ids: string[] }
  | { erreur: 'inconnu' }
  | { erreur: 'ambigu'; lignes: [number, number] };

/** « Se connecter » devient « se_connecter », « Réussite ! » « reussite ». */
export function simplifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Les éléments affichés par une page, avec leur nom, leur libellé et
 * leur identifiant. Les événements ne créent pas d'éléments : ceux qui
 * s'y trouvent sont refusés par l'analyse.
 */
export class ElementsPage {
  readonly elements: ElementRecense[] = [];
  readonly formulaires: FormulaireRecense[] = [];
  private readonly ids = new Map<Element, string>();
  private readonly idsPris = new Set<string>();

  constructor(page: Page, diagnostics: Diagnostic[]) {
    this.recenser(page.corps, diagnostics);
  }

  idDe(noeud: Element): string | undefined {
    return this.ids.get(noeud);
  }

  /** L'élément recensé sous cet identifiant. */
  parId(id: string): ElementRecense | undefined {
    return this.elements.find((e) => e.id === id);
  }

  /** Les éléments affichés par un bloc (le corps d'une boucle, par exemple). */
  elementsDe(instructions: Instruction[]): ElementRecense[] {
    const noeuds = new Set<Element>();
    parcourirVue(instructions, (i) => noeuds.add(i));
    return this.elements.filter((e) => noeuds.has(e.noeud));
  }

  /** Les formulaires d'un bloc de la vue (le corps d'une boucle, par exemple). */
  formulairesDe(instructions: Instruction[]): FormulaireRecense[] {
    const noeuds = new Set<Formulaire>();
    parcourirVue(instructions, () => {}, (f) => noeuds.add(f));
    return this.formulaires.filter((f) => noeuds.has(f.noeud));
  }

  /** Cherche d'abord parmi les noms, puis parmi les libellés. */
  resoudre(texte: string, genre?: Element['element'], parmi?: ElementRecense[]): Resolution {
    const candidats = (parmi ?? this.elements).filter(
      (e) => !genre || e.noeud.element === genre,
    );

    const parNom = candidats.filter((e) => e.nom === texte);
    if (parNom.length > 0) return { ids: parNom.map((e) => e.id) };

    const parLibelle = candidats.filter((e) => e.libelle === texte);
    if (parLibelle.length === 0) return { erreur: 'inconnu' };
    if (parLibelle.length > 1) {
      return { erreur: 'ambigu', lignes: [parLibelle[0].ligne, parLibelle[1].ligne] };
    }
    // Un seul élément, même répété par une boucle : on vise chacun d'eux.
    return { ids: [parLibelle[0].id] };
  }

  private recenser(instructions: Instruction[], diagnostics: Diagnostic[], formulaire?: FormulaireRecense): void {
    for (const instruction of instructions) {
      if (instruction.type === 'Element') {
        const id = this.ajouter(instruction, diagnostics);
        if (formulaire && instruction.element === 'champ') formulaire.champs.push(id);
      } else if (instruction.type === 'Condition') {
        this.recenser(instruction.alors, diagnostics, formulaire);
        this.recenser(instruction.sinon, diagnostics, formulaire);
      } else if (instruction.type === 'Boucle' || instruction.type === 'Bloc' || instruction.type === 'Fenetre') {
        this.recenser(instruction.corps, diagnostics, formulaire);
      } else if (instruction.type === 'Formulaire') {
        // Un formulaire dans un formulaire est refusé par l'analyse : ses champs vont au premier.
        const recense = formulaire ?? this.ajouterFormulaire(instruction);
        this.recenser(instruction.corps, diagnostics, recense);
      }
    }
  }

  private ajouterFormulaire(noeud: Formulaire): FormulaireRecense {
    const base = `formulaire_${simplifier(noeud.nom) || `ligne_${noeud.ligne}`}`;
    let id = base;
    for (let n = 2; this.idsPris.has(id); n++) id = `${base}_${n}`;
    this.idsPris.add(id);
    const recense: FormulaireRecense = { noeud, id, nom: noeud.nom, champs: [], ligne: noeud.ligne };
    this.formulaires.push(recense);
    return recense;
  }

  private ajouter(noeud: Element, diagnostics: Diagnostic[]): string {
    const contenu = noeud.contenu;
    const libelle =
      contenu.type === 'Chaine' && contenu.parties.every((p) => p.type === 'texte')
        ? contenu.parties.map((p) => p.valeur).join('')
        : undefined;

    if (noeud.nom !== undefined) {
      const deja = this.elements.find((e) => e.nom === noeud.nom);
      if (deja) {
        diagnostics.push({
          gravite: 'erreur',
          message: `le nom « ${noeud.nom} » est déjà donné à un élément (ligne ${deja.ligne}).`,
          ligne: noeud.ligne,
        });
      }
    }

    const base =
      (noeud.nom !== undefined && simplifier(noeud.nom)) ||
      (libelle !== undefined && simplifier(libelle) && `${noeud.element}_${simplifier(libelle)}`) ||
      `${noeud.element}_ligne_${ligneLocale(noeud.ligne)}`;

    let id = base;
    for (let n = 2; this.idsPris.has(id); n++) id = `${base}_${n}`;
    this.idsPris.add(id);
    this.ids.set(noeud, id);

    this.elements.push({ noeud, id, nom: noeud.nom, libelle, ligne: noeud.ligne });
    return id;
  }
}

/** Parcourt les éléments et les formulaires d'un bloc de la vue (conditions, boucles, formulaires et blocs compris). */
function parcourirVue(
  instructions: Instruction[],
  element: (e: Element) => void,
  formulaire: (f: Formulaire) => void = () => {},
): void {
  for (const i of instructions) {
    if (i.type === 'Element') element(i);
    else if (i.type === 'Condition') {
      parcourirVue(i.alors, element, formulaire);
      parcourirVue(i.sinon, element, formulaire);
    } else if (i.type === 'Boucle' || i.type === 'Bloc' || i.type === 'Fenetre') parcourirVue(i.corps, element, formulaire);
    else if (i.type === 'Formulaire') {
      formulaire(i);
      parcourirVue(i.corps, element, formulaire);
    }
  }
}
