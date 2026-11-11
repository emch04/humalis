/**
 * Le serveur en mémoire de la machine : le bloc « serveur » du programme, joué directement depuis
 * sa représentation intermédiaire (données, routes, droits, règles, actions, résumés, comptes,
 * temps réel, tâches), sans base ni pack à installer. Les adresses, les codes de réponse et les
 * messages sont ceux du serveur produit par `humalis compile --cible serveur` : la page ne voit pas la différence.
 * Ce qui ne peut pas tourner pour de vrai est dit par limites.ts, jamais simulé en silence.
 */
import type { ConditionRegleRI, FiltreServeurRI, InstructionServeurRI, OperandeRI, QuiPeut, RegleChampRI, ServeurRI, TestServeurRI, ValeurLieeRI, ValeurServeurRI } from '../../ri/types.js';
import { camel } from '../../cibles/web/noms.js';
import { simplifier } from '../../analyse/elements.js';
import { Refus, Stockage, Transactions, agreger, contient, enTexte, estVide, lireFiltres, resumer, schemaDe, verifierEnvoi, type Enregistrement, type Filtres, type ReglesEnvoi, type Schema } from './base.js';
import { Comptes, DUREES, MOT_DE_PASSE_FAIBLE, ROLE_RETIRE, jetonAleatoire, motDePasseDEssai, motDePasseSolide, verifierMotDePasse, hacher, type Compte, type SessionOuverte } from './comptes.js';
import { limitesDuServeur, type Limite } from './limites.js';

export interface Requete {
  methode: string;
  /** Le chemin sans la requête (« /api/produits »). */
  chemin: string;
  requete: URLSearchParams;
  /** Les en-têtes, en minuscules. */
  entetes: Record<string, string>;
  /** Le corps déjà lu comme JSON ; undefined s'il n'y en a pas. */
  corps?: unknown;
}

export interface Reponse {
  statut: number;
  entetes: Record<string, string | string[]>;
  json?: unknown;
  /** Un flux d'annonces (temps réel) : on s'y abonne, on rend de quoi se désabonner. */
  direct?: (envoyer: (texte: string) => void) => () => void;
}

/** Un envoi que la machine a gardé au lieu de l'envoyer. */
export interface Envoi {
  id: number;
  quand: number;
  genre: 'email' | 'notification' | 'activite';
  a: string;
  sujet?: string;
  texte: string;
  lien?: string;
}

export interface OptionsServeur {
  /** L'adresse où la machine sert l'application (pour les liens des e-mails captés). */
  adresse: string;
  /** L'adresse de chaque page par son nom (cheminsDesPages). */
  chemins?: Map<string, string>;
  maintenant?: () => number;
  /** Ce que la machine dit dans son journal (envois captés, tâche en échec…). */
  journal?: (message: string) => void;
}

type Route = ServeurRI['routes'][number];
type Donnee = ServeurRI['donnees'][number];
type Action = 'lire' | 'creer' | 'modifier' | 'supprimer';

const slug = (nom: string) => simplifier(nom).replace(/_/g, '-');
const introuvable = (donnee: string) => `aucun « ${donnee} » avec cet identifiant`;
const REFUS_FICHES = "vous n'avez pas accès à ces fiches";
const decide = (regle: RegleChampRI | undefined) => regle?.genre === 'depart' || regle?.genre === 'nombreDe' || regle?.genre === 'somme' || regle?.genre === 'groupe' || regle?.genre === 'auteur';
const aujourdhui = () => new Date().toISOString().slice(0, 10);

interface Travail {
  ecrites: Map<string, Set<string>>;
  apres: (() => void)[];
}
const nouveauTravail = (): Travail => ({ ecrites: new Map(), apres: [] });
function noter(travail: Travail, donnee: string, groupe?: unknown): void {
  const groupes = travail.ecrites.get(donnee) ?? new Set<string>();
  if (typeof groupe === 'string') groupes.add(groupe);
  travail.ecrites.set(donnee, groupes);
}

interface Portee {
  egal: Record<string, string>;
  test?: (fiche: Record<string, unknown>) => boolean;
}
interface RegleAcces {
  roles: string[] | 'connecte' | 'admin' | 'tout_le_monde';
  test?: (fiche: Record<string, unknown>, moi: Compte) => boolean;
}
interface Separation {
  champ: string;
  parCompte: boolean;
}

const concerne = (regle: RegleAcces, moi: Compte) => regle.roles === 'connecte' || regle.roles === 'tout_le_monde' || (Array.isArray(regle.roles) && regle.roles.includes(moi.role));

function porteeDe(moi: Compte | undefined, separation: Separation | null, regles: RegleAcces[] | undefined): Portee | null {
  if (!moi || moi.role === 'admin') return { egal: {} };
  const egal: Record<string, string> = {};
  if (separation) {
    const valeur = separation.parCompte ? moi.id : moi[separation.champ];
    if (typeof valeur !== 'string' || valeur === '') return null;
    egal[separation.champ] = valeur;
  }
  if (!regles) return { egal };
  const permises = regles.filter((regle) => concerne(regle, moi));
  if (permises.length === 0) return null;
  if (permises.some((regle) => !regle.test)) return { egal };
  return { egal, test: (fiche) => permises.some((regle) => regle.test!(fiche, moi)) };
}
const dansPortee = (fiche: Record<string, unknown>, portee: Portee) => Object.entries(portee.egal).every(([champ, valeur]) => fiche[champ] === valeur) && (!portee.test || portee.test(fiche));

const rolesDe = (qui: QuiPeut): RegleAcces['roles'] => (qui.startsWith('role:') ? qui.slice(5).split(',') : (qui as 'connecte' | 'admin' | 'tout_le_monde'));
const operande = (o: OperandeRI, fiche: Record<string, unknown>, moi: Compte): unknown => (o.genre === 'valeur' ? o.valeur : (o.genre === 'fiche' ? fiche : moi)[camel(o.champ)]);
const regleDeCondition = (c: ConditionRegleRI): RegleAcces => ({
  roles: rolesDe(c.qui),
  test: (fiche, moi) => {
    const gauche = operande(c.gauche, fiche, moi);
    const droite = operande(c.droite, fiche, moi);
    return c.dans ? Array.isArray(droite) && droite.includes(gauche) : gauche !== undefined && gauche === droite;
  },
});

export interface Etat {
  donnees: { nom: string; fiches: Enregistrement[] }[];
  comptes: { id: string; email: string; role: string; invitation: boolean }[];
  boite: Envoi[];
  limites: Limite[];
  taches: string[];
  paiements: { route: string; donnee: string; champ: string }[];
}

export class ServeurMemoire {
  readonly stockages = new Map<string, Stockage>();
  readonly comptes: Comptes;
  readonly boite: Envoi[] = [];
  readonly limites: Limite[];
  /** Les comptes d'essai créés au démarrage, avec leur mot de passe : dits une fois. */
  readonly comptesDEssai: { email: string; role: string; motDePasse: string }[] = [];
  private readonly transactions: Transactions;
  private readonly maintenant: () => number;
  private readonly ecoutes = new Map<string, Set<(texte: string) => void>>();
  private annonces = new Set<string>();
  private minuteur: ReturnType<typeof setTimeout> | undefined;
  private minuteurTaches: ReturnType<typeof setInterval> | undefined;
  private derniereTache = new Map<string, string>();
  private numeroEnvoi = 0;

  constructor(readonly serveur: ServeurRI, private readonly options: OptionsServeur) {
    this.maintenant = options.maintenant ?? Date.now;
    this.comptes = new Comptes(this.maintenant);
    for (const d of serveur.donnees) this.stockages.set(d.nom, new Stockage());
    this.transactions = new Transactions(() => [...this.stockages.values()]);
    this.limites = limitesDuServeur(serveur);
  }

  /** Reprend les données d'une version précédente du programme : ce qui garde son nom garde ses fiches. */
  reprendre(ancien: ServeurMemoire): void {
    for (const [nom, stock] of ancien.stockages) {
      const ici = this.stockages.get(nom);
      if (!ici) continue;
      const champs = new Set(this.serveur.donnees.find((d) => d.nom === nom)!.champs.map((c) => camel(c.nom)));
      for (const [id, ligne] of stock.lignes) ici.lignes.set(id, Object.fromEntries(Object.entries(ligne).filter(([cle]) => cle === 'id' || champs.has(cle))) as Enregistrement);
    }
    this.comptes.reprendre(ancien.comptes);
    this.boite.push(...ancien.boite);
    this.numeroEnvoi = ancien.numeroEnvoi;
    this.comptesDEssai.push(...ancien.comptesDEssai);
    this.derniereTache = ancien.derniereTache;
  }

  /** Les données de départ, puis les comptes d'essai (un admin et un compte par rôle déclaré). */
  async demarrer(avecComptes = true): Promise<void> {
    for (const depart of this.serveur.departs ?? []) {
      const stock = this.stockages.get(depart.donnee);
      const donnee = this.serveur.donnees.find((d) => d.nom === depart.donnee);
      if (!stock || !donnee || stock.lignes.size > 0) continue;
      const defauts = Object.fromEntries(donnee.champs.flatMap((c) => (c.regle?.genre === 'depart' && c.regle.valeur.genre === 'valeur' ? [[camel(c.nom), c.regle.valeur.valeur]] : [])));
      for (const fiche of depart.fiches) stock.creer({ ...defauts, ...Object.fromEntries(Object.entries(fiche).map(([k, v]) => [camel(k), v])) });
    }
    if (avecComptes) {
      // Un compte d'essai par rôle : ceux qui manquent (premier lancement, rôle ajouté au programme) sont créés.
      const motDePasse = this.comptesDEssai[0]?.motDePasse ?? motDePasseDEssai();
      for (const role of ['admin', ...(this.serveur.roles ?? [])]) {
        const email = `${slug(role)}@machine.humalis`;
        if (this.comptes.parEmail(email)) continue;
        await this.comptes.creer(email, role, motDePasse, this.champsDeGroupeParDefaut());
        this.comptesDEssai.push({ email, role, motDePasse });
      }
    }
    this.minuteurTaches ??= this.serveur.taches?.length ? setInterval(() => void this.tourner(), 60_000) : undefined;
    (this.minuteurTaches as { unref?: () => void } | undefined)?.unref?.();
  }
  arreter(): void {
    if (this.minuteurTaches) clearInterval(this.minuteurTaches);
    this.minuteurTaches = undefined;
    for (const ecoute of this.ecoutes.values()) ecoute.clear();
  }

  /** Un compte d'essai appartient à un groupe d'essai : sans lui, une donnée séparée « par boutique » ne montrerait rien. */
  private champsDeGroupeParDefaut(): Record<string, string> {
    return Object.fromEntries(this.champsDeGroupe().map((champ) => [champ, 'essai']));
  }

  async creerCompteDEssai(email: string, role: string, motDePasse: string, champs: Record<string, unknown> = {}): Promise<Compte> {
    return this.comptes.creer(email, role, motDePasse, champs);
  }

  etat(): Etat {
    return {
      donnees: this.serveur.donnees.map((d) => ({ nom: d.nom, fiches: this.stock(d.nom).lister() })),
      comptes: [...this.comptes.comptes.values()].filter((c) => c.role !== ROLE_RETIRE).map((c) => ({ id: c.id, email: c.email, role: c.role, invitation: c.invitation === true })),
      boite: [...this.boite],
      limites: this.limites,
      taches: (this.serveur.taches ?? []).map((t) => t.nom),
      paiements: this.serveur.routes.flatMap((r) => (r.apresPaiement ? (r.payables ?? []).map((champ) => ({ route: r.adresse, donnee: r.donnee, champ })) : [])),
    };
  }

  private stock(donnee: string): Stockage {
    return this.stockages.get(donnee)!;
  }
  private donnee(nom: string): Donnee {
    return this.serveur.donnees.find((d) => d.nom === nom)!;
  }
  private schema(donnee: Donnee): Schema {
    return Object.fromEntries(donnee.champs.map((c) => [camel(c.nom), schemaDe(c.type)]));
  }
  private captee(envoi: Omit<Envoi, 'id' | 'quand'>): void {
    this.boite.push({ ...envoi, id: ++this.numeroEnvoi, quand: this.maintenant() });
    this.options.journal?.(`${envoi.genre === 'email' ? 'E-mail capté (pas envoyé)' : 'Notification captée (pas envoyée)'} pour ${envoi.a}${envoi.sujet ? ` : ${envoi.sujet}` : ''}`);
  }

  // ─── Le temps réel ────────────────────────────────────────────────────────

  private annoncer(cle: string): void {
    this.annonces.add(cle);
    this.minuteur ??= setTimeout(() => {
      this.minuteur = undefined;
      const cles = [...this.annonces];
      this.annonces.clear();
      for (const c of cles) for (const envoyer of this.ecoutes.get(c) ?? []) envoyer('data: change\n\n');
    }, 100);
  }
  private terminer(travail: Travail): void {
    for (const [donnee, groupes] of travail.ecrites) {
      this.annoncer(donnee);
      for (const groupe of groupes) this.annoncer(`${donnee}|${groupe}`);
    }
    for (const envoi of travail.apres) envoi();
  }
  private ecouter(cle: string): Reponse['direct'] {
    return (envoyer) => {
      const liste = this.ecoutes.get(cle) ?? new Set();
      this.ecoutes.set(cle, liste);
      liste.add(envoyer);
      envoyer(': ouvert\n\n');
      const battement = setInterval(() => envoyer('event: present\ndata: 1\n\n'), 25_000);
      (battement as { unref?: () => void }).unref?.();
      return () => {
        clearInterval(battement);
        liste.delete(envoyer);
      };
    };
  }

  // ─── Les tâches planifiées ────────────────────────────────────────────────

  private periode(frequence: NonNullable<ServeurRI['taches']>[number]['frequence'], maintenant: Date): string | null {
    const deux = (n: number) => String(n).padStart(2, '0');
    const jour = `${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}`;
    if (frequence.genre === 'heure') return `${jour}T${deux(maintenant.getHours())}`;
    if (frequence.genre === 'semaine' && maintenant.getDay() !== frequence.jour) return null;
    const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
    const prevu = frequence.heure * 60 + frequence.minute;
    return minutes >= prevu && minutes < prevu + 60 ? jour : null;
  }
  private async tourner(): Promise<void> {
    for (const tache of this.serveur.taches ?? []) {
      const periode = this.periode(tache.frequence, new Date(this.maintenant()));
      if (periode === null || this.derniereTache.get(tache.nom) === periode) continue;
      this.derniereTache.set(tache.nom, periode);
      await this.lancerTache(tache.nom);
    }
  }
  /** Lance une tâche tout de suite (le panneau, les tests) : elle fait ce qu'elle ferait à l'heure dite. */
  async lancerTache(nom: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
    const tache = (this.serveur.taches ?? []).find((t) => t.nom === nom);
    if (!tache) return { ok: false, erreur: `la tâche « ${nom} » n'existe pas` };
    const travail = nouveauTravail();
    try {
      await this.transactions.executer(() => this.jouer(tache.corps, { fiches: new Map(), locaux: new Map(), travail }));
      this.terminer(travail);
      return { ok: true };
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      this.options.journal?.(`La tâche « ${nom} » a échoué : ${message}`);
      return { ok: false, erreur: message };
    }
  }

  /** « payer » à la main (panneau de la machine) : ce que le programme fait après un paiement confirmé. */
  async marquerPaye(adresse: string, id: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
    const route = this.serveur.routes.find((r) => r.adresse === adresse && r.apresPaiement);
    if (!route) return { ok: false, erreur: "cette route n'attend pas de paiement" };
    const travail = nouveauTravail();
    const donnee = this.donnee(route.donnee);
    try {
      await this.transactions.executer(async () => {
        const fiche = this.stock(route.donnee).trouver(id);
        if (!fiche) throw new Refus(introuvable(route.donnee));
        if (fiche.paye === true) throw new Refus('déjà payé');
        const payee = this.stock(route.donnee).modifier(id, { paye: true })!;
        noter(travail, route.donnee, donnee.par ? payee[camel(donnee.par)] : undefined);
        await this.jouer(route.apresPaiement!, { fiches: new Map([[route.donnee, payee]]), locaux: new Map(), travail });
      });
      this.terminer(travail);
      return { ok: true };
    } catch (erreur) {
      return { ok: false, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  }

  // ─── Les instructions « seul gerant peut faire … » ────────────────────────

  private valeur(v: ValeurServeurRI, e: Contexte): unknown {
    switch (v.genre) {
      case 'valeur': return v.valeur;
      case 'aujourdhui': return aujourdhui();
      case 'champ': return e.fiches.get(v.fiche)?.[v.champ === 'id' ? 'id' : camel(v.champ)];
      case 'local': return e.locaux.get(camel(v.nom));
      case 'utilisateur': return e.moi?.[camel(v.champ)];
      case 'texte': return v.parties.map((p) => ('texte' in p ? p.texte : enTexte(this.valeur(p.valeur, e)))).join('');
      case 'calcul': {
        const a = Number(this.valeur(v.gauche, e));
        const b = Number(this.valeur(v.droite, e));
        return v.operateur === '+' ? a + b : v.operateur === '-' ? a - b : v.operateur === '*' ? a * b : a / b;
      }
    }
  }
  private test(t: TestServeurRI, e: Contexte): boolean {
    if (t.genre === 'combinaison') return t.operateur === 'et' ? this.test(t.gauche, e) && this.test(t.droite, e) : this.test(t.gauche, e) || this.test(t.droite, e);
    const a = this.valeur(t.gauche, e);
    const b = t.droite ? this.valeur(t.droite, e) : undefined;
    const brut: Record<string, () => boolean> = {
      egal: () => a === b,
      different: () => a !== b,
      inferieur: () => Number(a) < Number(b),
      superieur: () => Number(a) > Number(b),
      inferieurOuEgal: () => Number(a) <= Number(b),
      superieurOuEgal: () => Number(a) >= Number(b),
      vide: () => estVide(a),
      vrai: () => a === true,
      faux: () => a === false,
      rien: () => a === undefined || a === null,
      contient: () => contient(a, b),
      commencePar: () => enTexte(a).startsWith(enTexte(b)),
      finitPar: () => enTexte(a).endsWith(enTexte(b)),
      dans: () => contient(b, a),
    };
    const resultat = brut[t.operateur]?.() ?? false;
    return t.negation ? !resultat : resultat;
  }
  /** La lecture filtrée : les égalités sur un champ, le reste ensuite ; « id » se compare après. */
  private lecture(donnee: string, filtres: FiltreServeurRI[], e: Contexte, egalEnPlus: Record<string, unknown> = {}): Enregistrement[] {
    const parBase = filtres.filter((f) => f.operateur === 'egal' && f.champ !== 'id');
    const apres = filtres.filter((f) => !parBase.includes(f));
    const egal = { ...Object.fromEntries(parBase.map((f) => [camel(f.champ), this.valeur(f.valeur, e)])), ...egalEnPlus };
    const lignes = this.stock(donnee).lister({ egal: egal as Filtres['egal'] });
    return lignes.filter((ligne) => apres.every((f) => {
      const a = ligne[f.champ === 'id' ? 'id' : camel(f.champ)];
      const b = this.valeur(f.valeur, e);
      return f.operateur === 'egal' ? a === b : f.operateur === 'different' ? a !== b : f.operateur === 'superieur' ? Number(a) > Number(b) : Number(a) < Number(b);
    }));
  }
  private egalDuGroupe(donnee: string, e: Contexte): Record<string, unknown> {
    const par = this.donnee(donnee).par;
    return par && e.groupeImpose?.champ === par ? { [camel(par)]: e.groupeImpose.fiche[camel(par)] } : {};
  }
  private groupeDe(donnee: string, fiche: Record<string, unknown>): unknown {
    const par = this.donnee(donnee).par;
    return par ? fiche[camel(par)] : undefined;
  }

  private async jouer(liste: InstructionServeurRI[], e: Contexte): Promise<void> {
    for (const i of liste) await this.instruction(i, e);
  }
  private async instruction(i: InstructionServeurRI, e: Contexte): Promise<void> {
    switch (i.type) {
      case 'si':
        await this.jouer(this.test(i.test, e) ? i.alors : i.sinon, e);
        return;
      case 'pourChaque':
        for (const fiche of this.lecture(i.donnee, i.filtres, e, this.egalDuGroupe(i.donnee, e))) {
          e.fiches.set(i.variable, fiche);
          await this.jouer(i.corps, e);
        }
        return;
      case 'calcul':
        e.locaux.set(camel(i.nom), agreger(i.operation, this.lecture(i.donnee, i.filtres, e, this.egalDuGroupe(i.donnee, e)), i.champ !== undefined ? camel(i.champ) : undefined));
        return;
      case 'changer': {
        const fiche = e.fiches.get(i.fiche)!;
        const modifiee = this.stock(i.donnee).modifier(fiche.id, { [camel(i.champ)]: this.valeur(i.valeur, e) });
        if (modifiee) Object.assign(fiche, modifiee);
        noter(e.travail, i.donnee, this.groupeDe(i.donnee, fiche));
        return;
      }
      case 'supprimer': {
        const fiche = e.fiches.get(i.fiche)!;
        this.stock(i.donnee).supprimer(fiche.id);
        noter(e.travail, i.donnee, this.groupeDe(i.donnee, fiche));
        return;
      }
      case 'refuser':
        throw new Refus(enTexte(this.valeur(i.message, e)));
      case 'creer': {
        const liee = this.donnee(i.donnee);
        const groupe = liee.par && i.groupeDe ? { [camel(liee.par)]: e.fiches.get(i.groupeDe)?.[camel(liee.par)] } : {};
        const valeurs = { ...Object.fromEntries(i.valeurs.map((v) => [camel(v.champ), this.valeur(v.valeur, e)])), ...groupe };
        const complete = this.aCompleter(liee) ? await this.completer(liee, valeurs) : { valeur: valeurs };
        if ('erreur' in complete) throw new Refus(complete.erreur);
        this.stock(i.donnee).creer(complete.valeur);
        noter(e.travail, i.donnee, liee.par ? complete.valeur[camel(liee.par)] : undefined);
        return;
      }
      case 'email': {
        const sujet = enTexte(this.valeur(i.sujet, e));
        const texte = enTexte(this.valeur(i.texte, e));
        const a = i.a.genre === 'admins' ? this.adressesDesAdmins() : [enTexte(this.valeur(i.a.valeur, e))];
        e.travail.apres.push(() => { for (const adresse of a) this.captee({ genre: 'email', a: adresse, sujet, texte }); });
        return;
      }
      case 'notification': {
        const titre = enTexte(this.valeur(i.titre, e));
        const texte = enTexte(this.valeur(i.texte, e));
        const boutons = i.boutons?.length ? ` [boutons : ${i.boutons.join(', ')}]` : '';
        const destinataires = this.destinataires(i.a, e);
        e.travail.apres.push(() => { for (const a of destinataires) this.captee({ genre: 'notification', a, sujet: titre, texte: texte + boutons }); });
        return;
      }
      case 'activite': {
        const destinataires = this.destinataires(i.a, e);
        e.travail.apres.push(() => { for (const a of destinataires) this.captee({ genre: 'activite', a, texte: `activité « ${i.nom} » mise à jour` }); });
        return;
      }
    }
  }
  private adressesDesAdmins(): string[] {
    return [...this.comptes.comptes.values()].filter((c) => c.role === 'admin').map((c) => c.email);
  }
  private destinataires(a: Extract<InstructionServeurRI, { type: 'notification' }>['a'], e: Contexte): string[] {
    if (a.genre === 'compte') {
      const id = enTexte(this.valeur(a.valeur, e));
      return [this.comptes.comptes.get(id)?.email ?? id];
    }
    const groupe = a.groupe ? { champ: camel(a.groupe.champ), valeur: e.fiches.get(a.groupe.fiche)?.[camel(a.groupe.champ)] } : undefined;
    return [...this.comptes.comptes.values()].filter((c) => a.roles.includes(c.role) && (!groupe || c[groupe.champ] === groupe.valeur)).map((c) => c.email);
  }

  // ─── Ce que le serveur décide d'un champ ─────────────────────────────────

  private champsDuServeur(donnee: Donnee, route?: Route): string[] {
    const dans = (route?.creations ?? []).flatMap((c) => (c.dans !== undefined ? [c.dans] : []));
    return donnee.champs.filter((c) => decide(c.regle) || dans.includes(c.nom)).map((c) => camel(c.nom));
  }
  private reglesEnvoi(donnee: Donnee, route: Route): ReglesEnvoi {
    return {
      duServeur: this.champsDuServeur(donnee, route),
      duSite: donnee.champs.filter((c) => c.regle?.genre === 'site').map((c) => camel(c.nom)),
      nonVides: donnee.champs.filter((c) => c.nonVide).map((c) => camel(c.nom)),
      fixes: donnee.champs.filter((c) => c.regle?.genre === 'auteur').map((c) => camel(c.nom)),
      adresseDuSite: this.options.adresse,
    };
  }
  private async completer(donnee: Donnee, recu: Record<string, unknown>): Promise<{ valeur: Record<string, unknown> } | { erreur: string }> {
    const fiche: Record<string, unknown> = { ...recu };
    for (const { nom, regle } of donnee.champs) if (regle?.genre === 'depart') fiche[camel(nom)] = regle.valeur.genre === 'aujourdhui' ? aujourdhui() : regle.valeur.valeur;
    for (const { nom, regle } of donnee.champs) {
      if (regle?.genre !== 'auPlus') continue;
      const valeur = fiche[camel(nom)];
      const cle = fiche[camel(regle.par)];
      const [reference] = typeof cle === 'string' || typeof cle === 'number' ? this.stock(regle.donnee).lister({ egal: { [camel(regle.par)]: cle } }) : [];
      const plafond = reference ? Number(reference[camel(regle.prix)]) || 0 : 0;
      if (typeof valeur !== 'number' || valeur < 0 || valeur > plafond) return { erreur: `le champ « ${camel(nom)} » doit être entre 0 et ${plafond}` };
    }
    for (const { nom, regle } of donnee.champs) if (regle?.genre === 'nombreDe') fiche[camel(nom)] = Array.isArray(fiche[camel(regle.liste)]) ? (fiche[camel(regle.liste)] as unknown[]).length : 0;
    for (const { nom, regle } of donnee.champs) {
      if (regle?.genre !== 'somme') continue;
      const ids = Array.isArray(fiche[camel(regle.liste)]) ? (fiche[camel(regle.liste)] as unknown[]).map(String) : [];
      const differents = new Set(ids);
      if (differents.size > 200) return { erreur: `le champ « ${camel(regle.liste)} » : la liste est trop longue` };
      const prix = new Map<string, number>();
      for (const id of differents) {
        const trouve = this.stock(regle.donnee).trouver(id);
        if (!trouve) return { erreur: `le champ « ${camel(regle.liste)} » : « ${id} » n'existe pas` };
        prix.set(id, Number(trouve[camel(regle.prix)]) || 0);
      }
      const somme = ids.reduce((total, id) => total + prix.get(id)!, 0);
      fiche[camel(nom)] = somme + (regle.plus !== undefined ? Number(fiche[camel(regle.plus)]) : 0);
    }
    return { valeur: fiche };
  }
  private aCompleter(donnee: Donnee): boolean {
    return donnee.champs.some((c) => (decide(c.regle) && c.regle?.genre !== 'groupe' && c.regle?.genre !== 'auteur') || c.regle?.genre === 'auPlus');
  }

  // ─── Les requêtes ─────────────────────────────────────────────────────────

  async traiter(requete: Requete): Promise<Reponse> {
    const cookies = lireCookies(requete.entetes.cookie);
    const contexte: ContexteRequete = { requete, cookies, posees: [] };
    if (!cookies.astratra_csrf) {
      const neuf = jetonAleatoire(16);
      contexte.posees.push(`astratra_csrf=${neuf}; Path=/; SameSite=Lax`);
      cookies.astratra_csrf = neuf;
    }
    const autorisation = requete.entetes.authorization ?? '';
    contexte.parJeton = /^Bearer\s/i.test(autorisation);
    contexte.jeton = contexte.parJeton ? autorisation.replace(/^Bearer\s+/i, '') : cookies.astratra_session;
    contexte.moi = this.comptes.lireJeton(contexte.jeton);
    let reponse: Reponse;
    try {
      reponse = await this.aiguiller(contexte);
    } catch (erreur) {
      if (erreur instanceof Refus) reponse = rep(400, { erreur: erreur.message });
      else {
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        this.options.journal?.(`Erreur du serveur : ${message}`);
        reponse = rep(500, { erreur: 'une erreur est survenue sur le serveur' });
      }
    }
    if (contexte.posees.length > 0) reponse.entetes['set-cookie'] = [...([] as string[]).concat(reponse.entetes['set-cookie'] ?? []), ...contexte.posees];
    return reponse;
  }

  private async aiguiller(c: ContexteRequete): Promise<Reponse> {
    const { chemin } = c.requete;
    if (chemin.startsWith('/auth/') || chemin === '/auth') return this.auth(c, chemin.slice('/auth'.length).replace(/\/+$/, '') || '/');
    for (const route of this.serveur.routes) {
      const base = `/api/${route.adresse.replace(/^\/+/, '')}`;
      if (chemin === base || chemin.startsWith(`${base}/`)) return this.route(c, route, chemin.slice(base.length).split('/').filter(Boolean));
    }
    if (this.serveur.routeMonCompte && chemin === `/api/${this.serveur.routeMonCompte.adresse.replace(/^\/+/, '')}`) return this.monCompte(c);
    const comptes = this.serveur.routeComptes;
    if (comptes) {
      const base = `/api/${comptes.adresse.replace(/^\/+/, '')}`;
      if (chemin === base || chemin.startsWith(`${base}/`)) return this.routeComptes(c, chemin.slice(base.length).split('/').filter(Boolean));
    }
    return rep(404, { erreur: "cette adresse n'existe pas sur ce serveur" });
  }

  /** Les gardes : null si la personne passe, sinon la réponse de refus. `ouverte` : une règle « si » décide ensuite fiche par fiche. */
  private garde(qui: QuiPeut | null, c: ContexteRequete, ouverte = false): Reponse | null {
    if (qui === null) return ouverte ? this.garde('connecte', c) : rep(403, { erreur: "cette action n'est permise à personne" });
    if (qui === 'tout_le_monde') return null;
    if (!c.moi) return rep(401, { erreur: 'connectez-vous pour continuer' });
    if (ouverte || qui === 'connecte') return null;
    if (qui === 'admin') return c.moi.role === 'admin' ? null : rep(403, { erreur: 'cette action est réservée à un admin' });
    return c.moi.role === 'admin' || qui.slice(5).split(',').includes(c.moi.role) ? null : rep(403, { erreur: "cette action n'est pas permise à votre rôle" });
  }
  private csrf(c: ContexteRequete): Reponse | null {
    if (c.requete.methode === 'GET' || c.requete.methode === 'HEAD' || c.parJeton) return null;
    const attendu = c.cookies.astratra_csrf;
    return attendu && c.requete.entetes['x-csrf-token'] === attendu ? null : rep(403, { erreur: 'jeton CSRF manquant ou invalide : rechargez la page' });
  }

  private separation(donnee: Donnee): Separation | null {
    return donnee.par ? { champ: camel(donnee.par), parCompte: donnee.par === 'compte' } : null;
  }
  private regles(route: Route, action: Action): RegleAcces[] | undefined {
    const conditions = route.conditions?.[action] ?? [];
    if (conditions.length === 0) return undefined;
    const libre = route.droits[action];
    return [...(libre ? [{ roles: rolesDe(libre) }] : []), ...conditions.map(regleDeCondition)];
  }
  private estSeparee(donnee: Donnee, route: Route): boolean {
    return donnee.par !== undefined || Object.values(route.conditions ?? {}).some((cond) => cond.length > 0);
  }

  private async route(c: ContexteRequete, route: Route, reste: string[]): Promise<Reponse> {
    const methode = c.requete.methode;
    const donnee = this.donnee(route.donnee);
    const stock = this.stock(route.donnee);
    const schema = this.schema(donnee);
    const separee = this.estSeparee(donnee, route);
    const sep = this.separation(donnee);
    const conditions = (a: Action) => (route.conditions?.[a] ?? []).length > 0;
    const gardeDe = (a: Action) => this.garde(route.droits[a], c, conditions(a));
    const portee = (a: Action): Portee | null => (separee ? porteeDe(c.moi, sep, this.regles(route, a)) : { egal: {} });
    const visible = (a: Action, id: string): { fiche: Enregistrement } | Reponse => {
      const p = portee(a);
      if (!p) return rep(403, { erreur: REFUS_FICHES });
      const fiche = stock.trouver(id);
      if (!fiche || (separee && !dansPortee(fiche, p))) return rep(404, { erreur: introuvable(route.donnee) });
      return { fiche };
    };
    const filtreCsrf = (a: Action) => (route.droits[a] === null && !conditions(a) ? null : this.csrf(c));
    const [premier, deuxieme, troisieme] = reste;

    if (methode === 'GET') {
      if (reste.length === 0) {
        const refus = gardeDe('lire');
        if (refus) return refus;
        const p = portee('lire');
        if (!p) return rep(403, { erreur: REFUS_FICHES });
        const filtres = lireFiltres(schema, c.requete.requete);
        const lignes = filtres ? (separee ? this.listerDans(stock, filtres, p) : stock.lister(filtres)) : [];
        return rep(200, lignes, { 'cache-control': route.droits.lire === 'tout_le_monde' ? 'public, max-age=30, stale-while-revalidate=300' : 'private, no-store' });
      }
      if (premier === 'direct' && route.direct && reste.length === 1) {
        const refus = gardeDe('lire');
        if (refus) return refus;
        const p = portee('lire');
        if (!p) return rep(403, { erreur: REFUS_FICHES });
        const groupe = sep ? p.egal[sep.champ] : undefined;
        return { statut: 200, entetes: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }, direct: this.ecouter(groupe ? `${route.donnee}|${groupe}` : route.donnee) };
      }
      const resume = reste.length === 1 ? (route.resumes ?? []).find((r) => slug(r.nom) === premier) : undefined;
      if (resume) {
        const refus = this.garde(resume.qui, c);
        if (refus) return refus;
        const p = separee ? porteeDe(c.moi, sep, undefined) : { egal: {} };
        if (!p) return rep(403, { erreur: REFUS_FICHES });
        const lignes = this.lecture(route.donnee, resume.filtres, { fiches: new Map(), locaux: new Map(), travail: nouveauTravail(), moi: c.moi }, p.egal);
        const calculs = resume.calculs.map((x) => ({ nom: camel(x.nom), operation: x.operation, ...(x.champ !== undefined ? { champ: camel(x.champ) } : {}) }));
        return rep(200, resumer(lignes, calculs, resume.regroupePar !== undefined ? camel(resume.regroupePar) : undefined), { 'cache-control': 'private, no-store' });
      }
      if ((premier === 'documents' && troisieme === 'bon') || (reste.length === 2 && deuxieme === 'bon')) {
        return gardeDe('lire') ?? rep(501, { erreur: "la machine ne produit pas de PDF : ce bon n'est pas disponible ici" });
      }
      if (reste.length === 1) {
        const refus = this.garde(route.droits.lireUn ?? route.droits.lire, c, conditions('lire') && route.droits.lireUn === undefined);
        if (refus) return refus;
        const v = visible('lire', premier);
        return 'fiche' in v ? rep(200, v.fiche, { 'cache-control': 'private, no-store' }) : v;
      }
    }

    if (methode === 'POST' && reste.length === 0) {
      const refus = gardeDe('creer') ?? filtreCsrf('creer');
      return refus ?? this.creer(c, route, donnee);
    }
    if (methode === 'POST' && premier === 'payer' && reste.length === 3) {
      const refus = gardeDe('lire') ?? this.csrf(c);
      return refus ?? rep(501, { erreur: "la machine ne simule pas les paiements : rien n'a été payé. Le panneau /__machine permet de marquer la fiche « payée » à la main." });
    }
    if (methode === 'PATCH' && premier === 'faire' && reste.length === 3) {
      const action = (route.actions ?? []).find((a) => slug(a.nom) === deuxieme);
      if (action) return this.faire(c, route, donnee, action, troisieme);
    }
    if (methode === 'PATCH' && reste.length === 1) {
      const refus = gardeDe('modifier') ?? filtreCsrf('modifier');
      if (refus) return refus;
      const v = visible('modifier', premier);
      if (!('fiche' in v)) return v;
      const envoi = verifierEnvoi(schema, c.requete.corps, false, this.reglesEnvoi(donnee, route));
      if ('erreur' in envoi) return rep(400, { erreur: envoi.erreur });
      const modifie = stock.modifier(premier, envoi.valeur);
      if (!modifie) return rep(404, { erreur: introuvable(route.donnee) });
      this.annoncerEcriture(route.donnee, donnee, modifie);
      return rep(200, modifie);
    }
    if (methode === 'DELETE' && reste.length === 1) {
      const refus = gardeDe('supprimer') ?? filtreCsrf('supprimer');
      if (refus) return refus;
      const v = visible('supprimer', premier);
      if (!('fiche' in v)) return v;
      if (!stock.supprimer(premier)) return rep(404, { erreur: introuvable(route.donnee) });
      this.annoncerEcriture(route.donnee, donnee, v.fiche);
      return { statut: 204, entetes: {} };
    }
    return rep(404, { erreur: "cette adresse n'existe pas sur ce serveur" });
  }

  private listerDans(stock: Stockage, filtres: Filtres, portee: Portee): Enregistrement[] {
    const base: Filtres = { ...filtres, egal: { ...filtres.egal, ...portee.egal } };
    if (!portee.test) return stock.lister(base);
    const { limite, depuis, ...sans } = base;
    const vues = stock.lister(sans).filter(portee.test);
    const debut = depuis ?? 0;
    return limite === undefined ? vues.slice(debut) : vues.slice(debut, debut + limite);
  }
  private annoncerEcriture(nom: string, donnee: Donnee, fiche: Record<string, unknown>): void {
    const travail = nouveauTravail();
    noter(travail, nom, donnee.par ? fiche[camel(donnee.par)] : undefined);
    this.terminer(travail);
  }

  private async creer(c: ContexteRequete, route: Route, donnee: Donnee): Promise<Reponse> {
    const stock = this.stock(route.donnee);
    const schema = this.schema(donnee);
    const separee = this.estSeparee(donnee, route);
    const sep = this.separation(donnee);
    const portee = separee ? porteeDe(c.moi, sep, this.regles(route, 'creer')) : { egal: {} };
    if (!portee) return rep(403, { erreur: REFUS_FICHES });
    let corps = c.requete.corps;
    let groupe: string | undefined;
    if (separee && donnee.par !== undefined && sep) {
      const impose = portee.egal[sep.champ];
      if (impose !== undefined) groupe = impose;
      else if (sep.parCompte) groupe = c.moi!.id;
      else {
        const brut = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
        const demande = brut[sep.champ] ?? c.moi![sep.champ];
        if (corps && typeof corps === 'object') corps = Object.fromEntries(Object.entries(brut).filter(([k]) => k !== sep.champ));
        if (typeof demande !== 'string' || demande === '') return rep(400, { erreur: `précisez « ${sep.champ} »` });
        groupe = demande;
      }
    }
    const envoi = verifierEnvoi(schema, corps, true, this.reglesEnvoi(donnee, route));
    if ('erreur' in envoi) return rep(400, { erreur: envoi.erreur });
    let recue = envoi.valeur;
    if (this.aCompleter(donnee)) {
      const complete = await this.completer(donnee, recue);
      if ('erreur' in complete) return rep(400, { erreur: complete.erreur });
      recue = complete.valeur;
    }
    if (groupe !== undefined && sep) recue[sep.champ] = groupe;
    for (const champ of donnee.champs) if (champ.regle?.genre === 'auteur') recue[camel(champ.nom)] = c.moi?.id;
    if (separee && portee.test && !portee.test(recue)) return rep(403, { erreur: REFUS_FICHES });
    for (const creation of route.creations ?? []) {
      const liee = this.donnee(creation.donnee);
      const valeurs: Record<string, unknown> = Object.fromEntries(creation.valeurs.map((v) => [camel(v.champ), valeurLiee(v.valeur, recue)]));
      if (groupe !== undefined && liee.par !== undefined) valeurs[camel(liee.par)] = groupe;
      let finale = valeurs;
      if (this.aCompleter(liee)) {
        const complete = await this.completer(liee, valeurs);
        if ('erreur' in complete) return rep(400, { erreur: complete.erreur });
        finale = complete.valeur;
      }
      const creee = this.stock(creation.donnee).creer(finale);
      if (creation.dans !== undefined) recue[camel(creation.dans)] = creee.id;
    }
    const cree = stock.creer(recue);
    const travail = nouveauTravail();
    noter(travail, route.donnee, groupe);
    for (const e of route.envois ?? []) {
      const morceaux = (m: typeof e.sujet) => m.map((p) => ('texte' in p ? p.texte : enTexte(cree[camel(p.champ)]))).join('');
      const a = e.destinataire.genre === 'admins' ? this.adressesDesAdmins() : [e.destinataire.genre === 'adresse' ? e.destinataire.adresse : enTexte(cree[camel(e.destinataire.champ)])];
      const sujet = morceaux(e.sujet);
      const texte = morceaux(e.texte);
      travail.apres.push(() => { for (const adresse of a) this.captee({ genre: 'email', a: adresse, sujet, texte }); });
    }
    for (const n of route.notifications ?? []) await this.instruction(n, { fiches: new Map([[route.donnee, cree]]), locaux: new Map(), travail });
    this.terminer(travail);
    return rep(201, cree);
  }

  private async faire(c: ContexteRequete, route: Route, donnee: Donnee, action: NonNullable<Route['actions']>[number], id: string): Promise<Reponse> {
    const refus = this.garde(action.qui, c) ?? this.csrf(c);
    if (refus) return refus;
    const sep = this.separation(donnee);
    const portee = donnee.par ? porteeDe(c.moi, sep, undefined) : { egal: {} };
    if (!portee) return rep(403, { erreur: REFUS_FICHES });
    const locaux = new Map<string, unknown>();
    if (action.parametres?.length) {
      const entrees = verifierEnvoi(Object.fromEntries(action.parametres.map((p) => [camel(p.nom), schemaDe(p.type)])), c.requete.corps, true);
      if ('erreur' in entrees) return rep(400, { erreur: entrees.erreur });
      for (const p of action.parametres) locaux.set(camel(p.nom), entrees.valeur[camel(p.nom)]);
    }
    const travail = nouveauTravail();
    try {
      const resultat = await this.transactions.executer(async () => {
        const fiche = this.stock(route.donnee).trouver(id);
        if (!fiche || (donnee.par && !dansPortee(fiche, portee))) return null;
        const copie = { ...fiche };
        await this.jouer(action.corps, { fiches: new Map([[route.donnee, copie]]), locaux, travail, moi: c.moi, groupeImpose: donnee.par ? { champ: donnee.par, fiche: copie } : undefined });
        return copie;
      });
      if (!resultat) return rep(404, { erreur: introuvable(route.donnee) });
      this.terminer(travail);
      return rep(200, resultat);
    } catch (erreur) {
      if (erreur instanceof Refus) return rep(400, { erreur: erreur.message });
      throw erreur;
    }
  }

  // ─── Les comptes et la session ────────────────────────────────────────────

  private publique(compte: Compte): Record<string, unknown> {
    const { passwordHash: _secret, ...reste } = compte;
    return reste;
  }
  private liste(compte: Compte): Record<string, unknown> {
    const roles = this.serveur.roles ?? [];
    return {
      id: compte.id,
      email: compte.email,
      role: compte.role === 'admin' ? 'admin' : roles.includes(compte.role) ? compte.role : 'membre',
      statut: compte.invitation === true ? 'invite' : 'actif',
      ...Object.fromEntries((this.serveur.champsCompte ?? []).map((champ) => [camel(champ.nom), compte[camel(champ.nom)] ?? null])),
    };
  }
  private cookiesDeSession(session: SessionOuverte): string[] {
    const duree = Math.floor(DUREES.renouvellement / 1000);
    return [`astratra_session=${session.jeton}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${duree}`, `humalis_renouvellement=${session.renouvellement}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${duree}`];
  }
  private cookiesEfface(): string[] {
    return ['astratra_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', 'humalis_renouvellement=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0'];
  }
  private lien(page: string | undefined, jeton: string): string {
    const chemin = page !== undefined ? (this.options.chemins?.get(page) ?? `/${page}`) : '/';
    return `${this.options.adresse.replace(/\/+$/, '')}${chemin}#jeton=${jeton}`;
  }
  private schemaCompte(): Schema {
    return Object.fromEntries((this.serveur.champsCompte ?? []).map((c) => [camel(c.nom), schemaDe(c.type)]));
  }
  champsDeGroupe(): string[] {
    return [...new Set(this.serveur.donnees.flatMap((d) => (d.par && d.par !== 'compte' ? [camel(d.par)] : [])))];
  }
  private dansLeGroupe(moi: Compte, compte: Compte): boolean {
    return moi.role === 'admin' || (compte.role !== 'admin' && this.champsDeGroupe().every((champ) => moi[champ] === compte[champ]));
  }

  private async auth(c: ContexteRequete, chemin: string): Promise<Reponse> {
    const { methode, corps } = c.requete;
    const entree = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
    if (methode !== 'GET' && methode !== 'HEAD') {
      const refus = this.csrf(c);
      if (refus) return refus;
    }
    const cookies = lireCookies(c.requete.entetes.cookie);
    if (chemin === '/me' && methode === 'GET') return c.moi ? rep(200, { data: this.publique(c.moi) }, { 'cache-control': 'private, no-store' }) : rep(401, { erreur: 'connectez-vous pour continuer' });
    if (chemin === '/login' && methode === 'POST') {
      const email = typeof entree.email === 'string' ? entree.email : '';
      if (this.comptes.tropDEssais(email.trim().toLowerCase())) return rep(429, { erreur: 'trop de tentatives de connexion' });
      const session = typeof entree.password === 'string' ? await this.comptes.connecter(email, entree.password) : undefined;
      if (!session) return rep(401, { erreur: 'identifiants invalides' });
      return rep(200, { data: { token: session.jeton, user: this.publique(session.compte) } }, { 'set-cookie': this.cookiesDeSession(session) });
    }
    if (chemin === '/refresh' && methode === 'POST') {
      const resultat = this.comptes.renouveler(cookies.humalis_renouvellement);
      if (resultat === 'refuse') return rep(401, { erreur: 'la session a expiré' }, { 'set-cookie': this.cookiesEfface() });
      return rep(200, { data: { token: resultat.jeton } }, { 'set-cookie': this.cookiesDeSession(resultat) });
    }
    if (chemin === '/logout' && methode === 'POST') {
      this.comptes.fermer(cookies.humalis_renouvellement, c.jeton);
      return rep(200, { data: { deconnecte: true } }, { 'set-cookie': this.cookiesEfface() });
    }
    if (chemin === '/mot-de-passe' && methode === 'POST') {
      if (!c.moi) return rep(401, { erreur: 'connectez-vous pour continuer' });
      if (typeof entree.actuel !== 'string' || typeof entree.nouveau !== 'string' || !(await verifierMotDePasse(entree.actuel, c.moi.passwordHash))) return rep(400, { erreur: 'le mot de passe actuel est incorrect' });
      if (!motDePasseSolide(entree.nouveau)) return rep(400, { erreur: MOT_DE_PASSE_FAIBLE });
      this.comptes.fermerTout(c.moi.id, this.comptes.familleDe(cookies.humalis_renouvellement));
      this.comptes.modifier(c.moi.id, { passwordHash: await hacher(entree.nouveau) });
      return rep(200, { data: { change: true } });
    }
    if (chemin === '/forgot-password' && methode === 'POST') {
      const compte = typeof entree.email === 'string' ? this.comptes.parEmail(entree.email) : undefined;
      if (compte && compte.role !== ROLE_RETIRE && this.serveur.motDePasseOublie !== undefined) {
        const lien = this.lien(this.serveur.motDePasseOublie, this.comptes.creerLien(compte.id, 'oubli'));
        this.captee({ genre: 'email', a: compte.email, sujet: `Votre mot de passe ${this.serveur.nom}`, texte: 'Ouvrez ce lien pour choisir un nouveau mot de passe (valable une heure, usage unique).', lien });
      }
      return rep(200, { data: { envoye: true } });
    }
    if (chemin === '/reset-password' && methode === 'POST') {
      if (!motDePasseSolide(entree.password)) return rep(400, { erreur: MOT_DE_PASSE_FAIBLE });
      const compte = typeof entree.token === 'string' ? await this.comptes.consommerLien(entree.token, entree.password) : undefined;
      return compte ? rep(200, { data: { change: true } }) : rep(400, { erreur: "ce lien n'est plus valable" });
    }
    if (chemin === '/invitations' && methode === 'POST' && this.serveur.invitations !== undefined) return this.inviter(c, entree);
    const comptes = /^\/comptes\/([^/]+)\/(role|champs)$/.exec(chemin);
    if (comptes && methode === 'POST') return this.changerCompte(c, comptes[1], comptes[2] as 'role' | 'champs', entree);
    if ((chemin === '/google' && this.serveur.connexionGoogle) || (chemin === '/apple' && this.serveur.connexionApple)) {
      return methode === 'GET' ? rep(200, { clientId: null }) : rep(503, { erreur: `la connexion avec ${chemin === '/google' ? 'Google' : 'Apple'} n'est pas réglée dans la machine` });
    }
    if (chemin === '/ia' && this.serveur.droitIa) return rep(501, { erreur: "la machine n'a pas de modèle d'IA : cette demande n'est pas disponible ici" });
    if (chemin === '/appareils/cle') return rep(200, { cle: null });
    if (chemin === '/appareils' || chemin === '/activites') return rep(501, { erreur: "la machine ne pousse pas de notifications : cet appareil n'a pas été inscrit" });
    if (chemin.startsWith('/cles')) return rep(503, { erreur: "le coffre des clés n'est pas ouvert dans la machine" });
    return rep(404, { erreur: "cette adresse n'existe pas sur ce serveur" });
  }

  private async inviter(c: ContexteRequete, corps: Record<string, unknown>): Promise<Reponse> {
    const refus = this.garde(this.serveur.routeComptes?.droits.creer ?? 'admin', c);
    if (refus) return refus;
    const moi = c.moi!;
    const envoi = verifierEnvoi(this.schemaCompte(), corps.champs ?? {}, false);
    if ('erreur' in envoi) return rep(400, { erreur: envoi.erreur });
    const adresse = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
    const roles = this.serveur.roles ?? [];
    const role = corps.role === 'admin' ? 'admin' : typeof corps.role === 'string' && roles.includes(corps.role) ? corps.role : 'user';
    if (role === 'admin' && moi.role !== 'admin') return rep(403, { erreur: 'seul un admin peut inviter un admin' });
    const groupes: Record<string, string> = {};
    const demandes = (corps.groupes ?? {}) as Record<string, unknown>;
    for (const champ of this.champsDeGroupe()) {
      const valeur = moi.role === 'admin' ? demandes[champ] : moi[champ];
      if (typeof valeur === 'string' && valeur !== '') groupes[champ] = valeur;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return rep(400, { erreur: "cette adresse e-mail n'est pas valable" });
    const existant = this.comptes.parEmail(adresse);
    if (existant && existant.role !== ROLE_RETIRE && existant.invitation !== true) return rep(200, { envoye: true });
    const compte = existant ? this.comptes.modifier(existant.id, { role, invitation: true, ...groupes, ...envoi.valeur })! : await this.comptes.creer(adresse, role, null, { invitation: true, ...groupes, ...envoi.valeur });
    const lien = this.lien(this.serveur.invitations, this.comptes.creerLien(compte.id, 'invitation'));
    this.captee({ genre: 'email', a: adresse, sujet: `Invitation : ${this.serveur.nom}`, texte: 'Ouvrez ce lien pour choisir votre mot de passe (valable sept jours, usage unique).', lien });
    return rep(200, { envoye: true });
  }

  private changerCompte(c: ContexteRequete, id: string, quoi: 'role' | 'champs', corps: Record<string, unknown>): Reponse {
    if (quoi === 'role' && this.serveur.changeDeRole) {
      const refus = this.garde('admin', c);
      if (refus) return refus;
      const roles = this.serveur.roles ?? [];
      const demande = corps.role;
      const role = demande === 'admin' ? 'admin' : demande === 'membre' ? 'user' : typeof demande === 'string' && roles.includes(demande) ? demande : null;
      if (role === null) return rep(400, { erreur: "ce rôle n'existe pas" });
      if (c.moi!.id === id) return rep(400, { erreur: 'vous ne pouvez pas changer votre propre rôle' });
      if (!this.comptes.actif(id)) return rep(404, { erreur: "ce compte n'existe pas" });
      this.comptes.modifier(id, { role });
      return rep(200, { id, role: demande });
    }
    if (quoi === 'champs' && this.serveur.changeDeCompte) {
      const refus = this.garde(this.serveur.routeComptes?.droits.modifier ?? 'admin', c);
      if (refus) return refus;
      const envoi = verifierEnvoi(this.schemaCompte(), corps, false);
      if ('erreur' in envoi) return rep(400, { erreur: envoi.erreur });
      const compte = this.comptes.actif(id);
      if (!compte || !this.dansLeGroupe(c.moi!, compte)) return rep(404, { erreur: "ce compte n'existe pas" });
      this.comptes.modifier(id, envoi.valeur);
      return rep(200, { id });
    }
    return rep(404, { erreur: "cette adresse n'existe pas sur ce serveur" });
  }

  private monCompte(c: ContexteRequete): Reponse {
    const refus = this.garde('connecte', c);
    return refus ?? rep(200, c.moi ? [this.liste(c.moi)] : [], { 'cache-control': 'private, no-store' });
  }

  private routeComptes(c: ContexteRequete, reste: string[]): Reponse {
    const droits = this.serveur.routeComptes!.droits;
    const { methode } = c.requete;
    if (methode === 'GET' && reste.length === 0) {
      const refus = this.garde(droits.lire, c);
      if (refus) return refus;
      const presents = [...this.comptes.comptes.values()].filter((x) => x.role !== ROLE_RETIRE && this.dansLeGroupe(c.moi!, x)).sort((a, b) => a.email.localeCompare(b.email));
      return rep(200, presents.map((x) => this.liste(x)), { 'cache-control': 'private, no-store' });
    }
    if (methode === 'DELETE' && reste.length === 1) {
      const refus = this.garde(droits.supprimer, c) ?? (droits.supprimer === null ? null : this.csrf(c));
      if (refus) return refus;
      if (c.moi!.id === reste[0]) return rep(400, { erreur: 'vous ne pouvez pas retirer votre propre compte' });
      const compte = this.comptes.actif(reste[0]);
      if (!compte || !this.dansLeGroupe(c.moi!, compte)) return rep(404, { erreur: "ce compte n'existe pas" });
      this.comptes.modifier(compte.id, { role: ROLE_RETIRE, invitation: false, passwordHash: null });
      this.comptes.fermerTout(compte.id);
      return { statut: 204, entetes: {} };
    }
    if (methode === 'POST' || methode === 'PATCH') return rep(403, { erreur: "cette action n'est permise à personne" });
    return rep(404, { erreur: "cette adresse n'existe pas sur ce serveur" });
  }
}

interface Contexte {
  fiches: Map<string, Record<string, unknown> & { id: string }>;
  locaux: Map<string, unknown>;
  travail: Travail;
  moi?: Compte;
  groupeImpose?: { champ: string; fiche: Record<string, unknown> };
}
interface ContexteRequete {
  requete: Requete;
  cookies: Record<string, string>;
  posees: string[];
  jeton?: string;
  parJeton?: boolean;
  moi?: Compte;
}

function valeurLiee(v: ValeurLieeRI, parent: Record<string, unknown>): unknown {
  if (v.genre === 'champ') return parent[camel(v.champ)];
  return v.genre === 'aujourdhui' ? aujourdhui() : v.valeur;
}

function lireCookies(entete: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const morceau of (entete ?? '').split(';')) {
    const egal = morceau.indexOf('=');
    if (egal > 0) cookies[morceau.slice(0, egal).trim()] = decodeURIComponent(morceau.slice(egal + 1).trim());
  }
  return cookies;
}

function rep(statut: number, json?: unknown, entetes: Record<string, string | string[]> = {}): Reponse {
  return { statut, entetes: { ...entetes }, ...(json === undefined ? {} : { json }) };
}
