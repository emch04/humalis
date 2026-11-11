/**
 * Les briques du serveur en mémoire de la machine : le stockage, la vérification de la forme des
 * données reçues, les calculs (somme, moyenne…) et la transaction « tout ou rien ».
 * Rien ici ne touche au disque ni à Node : le même code tourne dans le navigateur.
 * Les règles sont celles du serveur produit par `humalis compile --cible serveur`.
 */
import type { TypeChamp } from '../../ri/types.js';

export interface Enregistrement {
  id: string;
  [champ: string]: unknown;
}

/** « ?produit=abc&limite=20&depuis=40 » : les champs égaux à ces valeurs, puis une tranche de la liste. */
export interface Filtres {
  egal: Record<string, string | number | boolean>;
  limite?: number;
  depuis?: number;
}

export const identifiant = (): string => globalThis.crypto.randomUUID();

const trancher = <T>(liste: T[], filtres?: Filtres): T[] => {
  const debut = filtres?.depuis ?? 0;
  return filtres?.limite === undefined ? liste.slice(debut) : liste.slice(debut, debut + filtres.limite);
};

/** Une table en mémoire : perdue à l'arrêt de la machine, gardée d'un rechargement à l'autre. */
export class Stockage {
  lignes = new Map<string, Enregistrement>();

  lister(filtres?: Filtres): Enregistrement[] {
    const egal = Object.entries(filtres?.egal ?? {});
    return trancher([...this.lignes.values()].filter((ligne) => egal.every(([champ, valeur]) => ligne[champ] === valeur)), filtres);
  }
  trouver(id: string): Enregistrement | null {
    return this.lignes.get(id) ?? null;
  }
  creer(valeurs: Record<string, unknown>): Enregistrement {
    const enregistrement: Enregistrement = { ...valeurs, id: identifiant() };
    this.lignes.set(enregistrement.id, enregistrement);
    return enregistrement;
  }
  modifier(id: string, valeurs: Record<string, unknown>): Enregistrement | null {
    const actuel = this.lignes.get(id);
    if (!actuel) return null;
    const nouveau = { ...actuel, ...valeurs, id };
    this.lignes.set(id, nouveau);
    return nouveau;
  }
  supprimer(id: string): boolean {
    return this.lignes.delete(id);
  }
  /** Une photo des données, et de quoi y revenir (la transaction). */
  instantane(): () => void {
    const photo = new Map([...this.lignes].map(([id, ligne]) => [id, { ...ligne }]));
    return () => {
      this.lignes.clear();
      for (const [id, ligne] of photo) this.lignes.set(id, ligne);
    };
  }
}

/** Une écriture après l'autre, et une photo pour revenir en arrière si elle échoue. */
export class Transactions {
  private file: Promise<unknown> = Promise.resolve();
  constructor(private readonly stockages: () => Stockage[]) {}
  executer<T>(corps: () => Promise<T> | T): Promise<T> {
    const suite = this.file.then(async () => {
      const retours = this.stockages().map((s) => s.instantane());
      try {
        return await corps();
      } catch (erreur) {
        for (const retour of retours) retour();
        throw erreur;
      }
    });
    this.file = suite.catch(() => undefined);
    return suite;
  }
}

// ─── La forme des données ───────────────────────────────────────────────────

export type Schema = Record<string, SchemaChamp>;
export type SchemaChamp = 'texte' | 'nombre' | 'booleen' | 'date' | 'image' | { liste: SchemaChamp };

export const schemaDe = (type: TypeChamp): SchemaChamp => {
  if (type.genre === 'texte' && type.image) return 'image';
  if (type.genre === 'liste') return { liste: schemaDe(type.de) };
  return type.genre === 'donnee' ? 'texte' : type.genre;
};

const NOMS: Record<string, string> = {
  texte: 'un texte',
  nombre: 'un nombre',
  booleen: 'vrai ou faux (true ou false)',
  date: 'une date (par exemple 2026-01-31)',
  image: 'une image PNG, JPEG ou WebP de moins de 70 Ko (choisie dans la page), une adresse https://…, ou vide',
};
const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const TAILLE_IMAGE = 95_000;

function conforme(type: SchemaChamp, valeur: unknown): boolean {
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.every((v) => conforme(type.liste, v));
  if (type === 'texte') return typeof valeur === 'string';
  if (type === 'image') {
    if (valeur === null) return true;
    if (typeof valeur !== 'string') return false;
    return valeur === '' || /^https:\/\/[^\s"<>]+$/.test(valeur) || (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur));
  }
  if (type === 'nombre') return typeof valeur === 'number' && Number.isFinite(valeur);
  if (type === 'booleen') return typeof valeur === 'boolean';
  return typeof valeur === 'string' && !Number.isNaN(Date.parse(valeur));
}
const decrire = (type: SchemaChamp): string => (typeof type === 'object' ? `une liste dont chaque élément est ${decrire(type.liste)}` : NOMS[type]);

/** « du site » : un chemin de ce site, son adresse, une image choisie dans la page, ou rien. */
export function estDuSite(valeur: unknown, adresseDuSite = ''): boolean {
  if (Array.isArray(valeur)) return valeur.every((v) => estDuSite(v, adresseDuSite));
  if (valeur === null || valeur === '') return true;
  if (typeof valeur !== 'string' || /[\s"<>\\]/.test(valeur)) return false;
  if (/^\/(?!\/)/.test(valeur)) return true;
  if (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur)) return true;
  const site = adresseDuSite.trim().replace(/\/+$/, '');
  return site !== '' && valeur.startsWith(site + '/');
}

export interface ReglesEnvoi {
  duServeur?: string[];
  duSite?: string[];
  nonVides?: string[];
  fixes?: string[];
  adresseDuSite?: string;
}

/** `complet` : à la création, chaque champ est obligatoire ; à la modification, seuls les champs envoyés sont vérifiés. */
export function verifierEnvoi(schema: Schema, corps: unknown, complet: boolean, regles: ReglesEnvoi = {}): { valeur: Record<string, unknown> } | { erreur: string } {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) return { erreur: 'les données envoyées doivent être un objet JSON' };
  const champs = Object.keys(schema);
  for (const cle of Object.keys(corps)) {
    if (cle === 'id') return { erreur: "l'identifiant est donné par le serveur : ne l'envoie pas" };
    if ((complet && regles.duServeur?.includes(cle)) || regles.fixes?.includes(cle)) return { erreur: `le champ « ${cle} » est donné par le serveur : ne l'envoie pas` };
    if (!(cle in schema)) return { erreur: `le champ « ${cle} » n'existe pas. Champs : ${champs.join(', ')}` };
  }
  const valeur: Record<string, unknown> = {};
  for (const champ of champs) {
    const recu = (corps as Record<string, unknown>)[champ];
    if (recu === undefined) {
      if (complet && !regles.duServeur?.includes(champ)) return { erreur: `le champ « ${champ} » manque` };
      continue;
    }
    const chemin = schema[champ] === 'image' && regles.duSite?.includes(champ) && estDuSite(recu, regles.adresseDuSite);
    if (!chemin && !conforme(schema[champ], recu)) return { erreur: `le champ « ${champ} » doit être ${decrire(schema[champ])}` };
    if (regles.nonVides?.includes(champ) && (Array.isArray(recu) ? recu.length === 0 : typeof recu === 'string' && recu.trim() === '')) return { erreur: `le champ « ${champ} » ne doit pas être vide` };
    if (regles.duSite?.includes(champ) && !estDuSite(recu, regles.adresseDuSite)) return { erreur: `le champ « ${champ} » doit être une adresse de ce site (/images/photo.jpg)` };
    valeur[champ] = recu;
  }
  return { valeur };
}

const seul = (valeur: string | null): string | undefined => (valeur === null ? undefined : valeur);
const entier = (valeur: string | undefined): number | undefined => (valeur !== undefined && /^\d{1,9}$/.test(valeur) ? Number(valeur) : undefined);

/** « ?produit=abc » : les champs égaux ; une valeur qui ne peut pas être celle du champ ne trouve rien (null). */
export function lireFiltres(schema: Schema, requete: URLSearchParams): Filtres | null {
  const filtres: Filtres = { egal: {} };
  for (const cle of new Set(requete.keys())) {
    const brut = seul(requete.get(cle));
    const type = Object.hasOwn(schema, cle) ? schema[cle] : undefined;
    if (type === undefined) {
      if (cle === 'limite') filtres.limite = entier(brut);
      if (cle === 'depuis') filtres.depuis = entier(brut);
      continue;
    }
    if (typeof type === 'object' || type === 'image') continue;
    if (brut === undefined) return null;
    if (type === 'nombre') {
      const nombre = brut.trim() === '' ? Number.NaN : Number(brut);
      if (!Number.isFinite(nombre)) return null;
      filtres.egal[cle] = nombre;
    } else if (type === 'booleen') {
      if (!['true', 'false', 'vrai', 'faux'].includes(brut)) return null;
      filtres.egal[cle] = brut === 'true' || brut === 'vrai';
    } else filtres.egal[cle] = brut;
  }
  return filtres;
}

// ─── Les calculs ────────────────────────────────────────────────────────────

export class Refus extends Error {}

export const enTexte = (valeur: unknown): string => (valeur === null || valeur === undefined ? '' : String(valeur));
export const estVide = (valeur: unknown): boolean => valeur === null || valeur === undefined || valeur === '' || (Array.isArray(valeur) && valeur.length === 0);
export const contient = (liste: unknown, valeur: unknown): boolean => (Array.isArray(liste) ? liste.includes(valeur) : typeof liste === 'string' && liste.includes(enTexte(valeur)));

/** « somme de … », « nombre de … » : une liste vide donne 0. */
export function agreger(operation: string, lignes: Record<string, unknown>[], champ?: string): number {
  if (operation === 'nombre') return lignes.length;
  const valeurs = lignes.map((l) => Number(l[champ as string])).filter(Number.isFinite);
  if (valeurs.length === 0) return 0;
  if (operation === 'minimum') return Math.min(...valeurs);
  if (operation === 'maximum') return Math.max(...valeurs);
  const somme = valeurs.reduce((a, b) => a + b, 0);
  return operation === 'moyenne' ? somme / valeurs.length : somme;
}

/** Un résumé : une fiche de calculs, ou une par valeur du champ « regroupe par ». */
export function resumer(lignes: Record<string, unknown>[], calculs: { nom: string; operation: string; champ?: string }[], regroupePar?: string): unknown {
  const calculer = (groupe: Record<string, unknown>[]) => Object.fromEntries(calculs.map((c) => [c.nom, agreger(c.operation, groupe, c.champ)]));
  if (regroupePar === undefined) return calculer(lignes);
  const groupes = new Map<unknown, Record<string, unknown>[]>();
  for (const ligne of lignes) groupes.set(ligne[regroupePar], [...(groupes.get(ligne[regroupePar]) ?? []), ligne]);
  return [...groupes].map(([valeur, groupe]) => ({ [regroupePar]: valeur, ...calculer(groupe) }));
}
