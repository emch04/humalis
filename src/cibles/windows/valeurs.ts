/**
 * Les valeurs et les conditions Humalis en expressions C#. Toute valeur est un `object?`
 * (rien, nombre, texte, vrai ou faux, liste, fiche) : les opérations du langage passent
 * par la classe V de la bibliothèque, qui les fait comme sur le web.
 */
import type { PartieVariable, PartiesTexte, Test, Valeur } from '../../ri/types.js';
import { estCombine } from '../../ri/types.js';
import { chaineCs, cleJson, nomMethode, nombreCs } from './noms.js';

/** Comment un nom se lit et s'écrit dans le code : une variable suivie (Signal), une variable locale, un calcul. */
export interface Lieu {
  /** L'expression qui lit la valeur. */
  lire: string;
  /** Le Signal à écrire (variable de page, partagée, filtre). */
  signal?: string;
  /** La variable C# à affecter (variable locale, de boucle, paramètre de fonction). */
  locale?: string;
}

/** Un champ de la page : son Signal et sa sorte. */
export interface ChampPage {
  signal: string;
  sorte: string;
  libelle: string;
  cle: string;
}

export interface Portee {
  variables: Map<string, Lieu>;
  champs: Map<string, ChampPage>;
  fonctions: Set<string>;
}

export class ExpressionsCs {
  private numero = 0;

  constructor(
    readonly portee: Portee,
    private readonly refuser: (quoi: string) => void,
  ) {}

  /** Un nom unique pour une variable de lambda (« hE1 »). */
  nouveauNom(base: string): string {
    return `h${base}${++this.numero}`;
  }

  /** Exécute `faire` avec des noms en plus dans la portée, puis la remet comme avant. */
  avec<T>(noms: [string, Lieu][], faire: () => T): T {
    const avant = new Map(this.portee.variables);
    for (const [nom, lieu] of noms) this.portee.variables.set(nom, lieu);
    try {
      return faire();
    } finally {
      this.portee.variables.clear();
      for (const [n, l] of avant) this.portee.variables.set(n, l);
    }
  }

  variable(nom: string): string {
    const lieu = this.portee.variables.get(nom);
    if (!lieu) {
      this.refuser(`la variable « ${nom} », inconnue ici,`);
      return '(object?)null';
    }
    return lieu.lire;
  }

  /** La valeur en C#, de type object?. */
  expr(v: Valeur): string {
    switch (v.type) {
      case 'texte':
        return this.texte(v);
      case 'nombre':
        return nombreCs(v.valeur);
      case 'booleen':
        return v.valeur ? 'true' : 'false';
      case 'rien':
        return '(object?)null';
      case 'liste':
        return `V.ListeDe(${v.elements.map((e) => this.expr(e)).join(', ')})`;
      case 'variable':
        return this.variable(v.nom);
      case 'champ': {
        const champ = this.portee.champs.get(v.id);
        if (!champ) {
          this.refuser(`le champ « ${v.id} », introuvable dans cette page,`);
          return '""';
        }
        return `${champ.signal}.Lire()`;
      }
      case 'calcul': {
        const nom = { '+': 'Plus', '-': 'Moins', '*': 'Fois', '/': 'Divise' }[v.operateur];
        return `V.${nom}(${this.expr(v.gauche)}, ${this.expr(v.droite)})`;
      }
      case 'compte':
        return `V.Compte(${this.expr(v.liste)})`;
      case 'fiche':
        return `V.FicheDe(${v.champs.map((c) => `(${chaineCs(cleJson(c.nom))}, ${this.expr(c.valeur)})`).join(', ')})`;
      case 'appel':
        if (!this.portee.fonctions.has(v.nom)) {
          this.refuser(`la fonction « ${v.nom} », inconnue ici,`);
          return '(object?)null';
        }
        return `Fonctions.${nomMethode(v.nom)}(${v.arguments.map((a) => this.expr(a)).join(', ')})`;
      case 'agregat':
        return `V.${{ moyenne: 'Moyenne', somme: 'Somme', minimum: 'Minimum', maximum: 'Maximum' }[v.operation]}(${this.expr(v.liste)})`;
      case 'arrondi':
        return `V.Arrondi(${this.expr(v.valeur)}, ${v.chiffres ?? 0})`;
      case 'hasard':
        return `V.Hasard(${this.expr(v.minimum)}, ${this.expr(v.maximum)})`;
      case 'dateDuJour':
        return v.maintenant ? 'V.Maintenant()' : 'V.Aujourdhui()';
      case 'dateDecalee':
        return `V.Decaler(${this.expr(v.date)}, ${this.expr(v.nombre)}, ${chaineCs(v.unite)}, ${v.signe})`;
      case 'joursEntre':
        return `V.JoursEntre(${this.expr(v.debut)}, ${this.expr(v.fin)})`;
      case 'champs':
        return `V.Champs(${this.expr(v.liste)}, ${chaineCs(cleJson(v.champ))})`;
      case 'filtre': {
        const element = this.nouveauNom('E');
        const page = new Map(this.portee.variables);
        const noms: [string, Lieu][] = v.champs.map((c) => [c, { lire: `V.Champ(${element}, ${chaineCs(cleJson(c))})` }]);
        const condition = this.avec(noms, () => this.condition(v.test, page));
        return `V.Filtrer(${this.expr(v.liste)}, ${element} => ${condition})`;
      }
      case 'test':
        return `(${this.condition(v.test)})`;
      case 'tri':
        return `V.Trier(${this.expr(v.liste)}, ${v.champ !== undefined ? chaineCs(cleJson(v.champ)) : 'null'}, ${v.decroissant})`;
      case 'groupement':
        return `V.Grouper(${this.expr(v.liste)}, ${chaineCs(cleJson(v.champ))})`;
      case 'premier':
        return `V.Premier(${this.expr(v.liste)})`;
      case 'premiers':
        return `V.Premiers(${this.expr(v.nombre)}, ${this.expr(v.liste)})`;
      case 'operationTexte':
        return `V.${{ majuscules: 'Majuscules', minuscules: 'Minuscules', longueur: 'Longueur', initiales: 'Initiales' }[v.operation]}(${this.expr(v.valeur)})`;
      case 'remplacement':
        return `V.Remplacer(${this.expr(v.cherche)}, ${this.expr(v.remplace)}, ${this.expr(v.dans)})`;
      case 'champDonnee':
        return `V.Champ(${this.expr(v.objet)}, ${chaineCs(cleJson(v.champ))})`;
      case 'utilisateur':
        if (v.etat === 'connecte') return 'Session.Connecte';
        if (v.etat === 'admin') return 'Session.Admin';
        return `Session.ARole(${v.etat.slice(5).split(',').map((r) => chaineCs(r.trim())).join(', ')})`;
      case 'etatRequete':
        return `Etat(${chaineCs(v.variable)}).Est(${chaineCs(v.etat)})`;
      case 'erreurRequete':
        return `V.T(Etat(${chaineCs(v.variable)}).Message.Lire())`;
      case 'mouvementReduit':
        return '!SystemParameters.ClientAreaAnimation';
      case 'themeSombre':
        return 'Apparence.Sombre';
    }
  }

  /** Une valeur en texte C# (string). */
  enTexte(v: Valeur): string {
    if (v.type === 'texte') return this.texte(v);
    return `V.T(${this.expr(v)})`;
  }

  /** Une valeur en nombre C# (double). */
  enNombre(v: Valeur): string {
    if (v.type === 'nombre') return nombreCs(v.valeur);
    return `V.N(${this.expr(v)})`;
  }

  /** Un texte et ses {variables}, écrits à la française. Les autres langues viendront avec « changer langue ». */
  texte(v: Extract<Valeur, { type: 'texte' }>): string {
    return this.parties(v.parties);
  }

  parties(parties: PartiesTexte): string {
    if (parties.length === 0) return '""';
    const morceaux = parties.map((p) => ('texte' in p ? chaineCs(p.texte) : this.partie(p)));
    return morceaux.length === 1 && 'texte' in parties[0] ? morceaux[0] : morceaux.length === 1 ? morceaux[0] : `(${morceaux.join(' + ')})`;
  }

  private partie(p: PartieVariable): string {
    const valeur = p.expression ?? this.cheminVersValeur(p.variable);
    const e = this.expr(valeur);
    let lu: string;
    if (p.pluriel) lu = `V.Accorder(${e}, ${chaineCs(p.pluriel)})`;
    else if (p.format === 'nombre') lu = `V.Nombre(${e})`;
    else if (p.format === 'date') lu = `V.Date(${e})`;
    else if (p.format === 'dateLongue') lu = `V.DateLongue(${e})`;
    else if (p.format === 'depuis') lu = `V.Depuis(${e})`;
    else if (p.format === 'lettres') lu = `V.EnLettres(${e})`;
    else if (p.format === 'Ko' || p.format === 'Mo') lu = `V.Taille(${e}, ${chaineCs(p.format)})`;
    else if (p.format) lu = `V.Argent(${e}, ${chaineCs(p.format)})`;
    else lu = `V.T(${e})`;
    return p.majuscule ? `V.AvecMajuscule(${lu})` : lu;
  }

  private cheminVersValeur(chemin: string): Valeur {
    const [premier, ...reste] = chemin.split('.');
    return reste.reduce<Valeur>((objet, champ) => ({ type: 'champDonnee', objet, champ }), { type: 'variable', nom: premier });
  }

  // ─── Conditions ──────────────────────────────────────────────────────────

  /** Une condition C# (bool). `droitePage` : dans « produits dont … », la droite d'une comparaison garde le sens de la page. */
  condition(test: Test, droitePage?: Map<string, Lieu>): string {
    if (estCombine(test)) {
      const partie = (t: Test) => `(${this.condition(t, droitePage)})`;
      return `${partie(test.gauche)} ${test.operateur === 'et' ? '&&' : '||'} ${partie(test.droite)}`;
    }
    if (test.negation) return `!(${this.condition({ ...test, negation: false }, droitePage)})`;
    const gauche = this.expr(test.gauche);
    const droite = (): string => {
      if (!test.droite) return '(object?)null';
      if (!droitePage) return this.expr(test.droite);
      const ici = new Map(this.portee.variables);
      this.portee.variables.clear();
      for (const [n, l] of ici) if (!droitePage.has(n)) this.portee.variables.set(n, l);
      for (const [n, l] of droitePage) this.portee.variables.set(n, l);
      try {
        return this.expr(test.droite);
      } finally {
        this.portee.variables.clear();
        for (const [n, l] of ici) this.portee.variables.set(n, l);
      }
    };
    switch (test.operateur) {
      case 'vrai':
        return `V.B(${gauche})`;
      case 'faux':
        return `!V.B(${gauche})`;
      case 'vide':
        return `V.Vide(${gauche})`;
      case 'rien':
        return `(${gauche} is null)`;
      case 'dans':
        return `V.Contient(${droite()}, ${gauche})`;
      case 'contient':
        return `V.Contient(${gauche}, ${droite()})`;
      case 'commencePar':
        return `V.CommencePar(${gauche}, ${droite()})`;
      case 'finitPar':
        return `V.FinitPar(${gauche}, ${droite()})`;
      case 'egal':
        return `V.Egal(${gauche}, ${droite()})`;
      case 'different':
        return `!V.Egal(${gauche}, ${droite()})`;
      case 'inferieur':
        return `(V.Comparer(${gauche}, ${droite()}) < 0)`;
      case 'superieur':
        return `(V.Comparer(${gauche}, ${droite()}) > 0)`;
      case 'inferieurOuEgal':
        return `(V.Comparer(${gauche}, ${droite()}) <= 0)`;
      case 'superieurOuEgal':
        return `(V.Comparer(${gauche}, ${droite()}) >= 0)`;
    }
  }
}
