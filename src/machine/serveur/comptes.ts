/**
 * Les comptes, les mots de passe et les sessions de la machine. Tout est en mémoire : les jetons
 * sont des jetons opaques tirés au hasard (pas des JWT), valables le temps de la machine.
 * Les règles suivent celles du serveur produit : jeton d'accès de 15 minutes, renouvellement de
 * 3 jours qui glisse sans passer 30 jours, rotation avec un délai de grâce de 10 secondes.
 */
import { identifiant } from './base.js';

export const ROLE_RETIRE = 'retire';
const MINUTE = 60_000;
export const DUREES = { acces: 15 * MINUTE, renouvellement: 3 * 24 * 60 * MINUTE, maximum: 30 * 24 * 60 * MINUTE, grace: 10_000 };

export interface Compte {
  id: string;
  email: string;
  role: string;
  passwordHash: string | null;
  invitation?: boolean;
  [champ: string]: unknown;
}

const octets = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (o: Uint8Array): string => [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
const base64 = (o: Uint8Array): string => btoa(String.fromCharCode(...o));
const deBase64 = (t: string): Uint8Array => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
export const jetonAleatoire = (n = 32): string => hex(octets(n));

const ITERATIONS = 60_000;
async function derive(motDePasse: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const cle = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel as BufferSource, iterations }, cle, 256));
}
export async function hacher(motDePasse: string): Promise<string> {
  const sel = octets(16);
  return `pbkdf2$${ITERATIONS}$${base64(sel)}$${base64(await derive(motDePasse, sel, ITERATIONS))}`;
}
export async function verifierMotDePasse(motDePasse: string, empreinte: string | null | undefined): Promise<boolean> {
  const [genre, iterations, sel, attendu] = (empreinte ?? '').split('$');
  if (genre !== 'pbkdf2' || !sel || !attendu) return false;
  const obtenu = await derive(motDePasse, deBase64(sel), Number(iterations));
  const voulu = deBase64(attendu);
  return obtenu.length === voulu.length && obtenu.every((o, i) => o === voulu[i]);
}
/** 8 caractères au moins, avec une majuscule, une minuscule, un chiffre et un signe. */
export const motDePasseSolide = (m: unknown): m is string => typeof m === 'string' && m.length >= 8 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m) && /[^A-Za-z0-9]/.test(m);
export const MOT_DE_PASSE_FAIBLE = 'ce mot de passe est trop faible : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un signe';

/** Un mot de passe d'essai solide, tiré au hasard : il est dit au démarrage, jamais écrit ailleurs. */
export function motDePasseDEssai(): string {
  const lettres = 'abcdefghjkmnpqrstuvwxyz';
  const pris = (jeu: string) => jeu[octets(1)[0] % jeu.length];
  const corps = Array.from({ length: 8 }, () => pris(lettres)).join('');
  return `${pris('ABCDEFGHJKMNPQRSTUVWXYZ')}${corps}-${pris('23456789')}${pris('23456789')}${pris('!?#')}`;
}

export interface SessionOuverte {
  jeton: string;
  renouvellement: string;
  compte: Compte;
}

interface Renouvellement {
  compte: string;
  famille: string;
  debut: number;
  expire: number;
  remplace?: number;
}

export class Comptes {
  comptes = new Map<string, Compte>();
  /** Les liens envoyés (invitation, mot de passe oublié) : le jeton et ce qu'il ouvre. */
  liens = new Map<string, { compte: string; expire: number; genre: 'invitation' | 'oubli' }>();
  private acces = new Map<string, { compte: string; expire: number }>();
  private renouvellements = new Map<string, Renouvellement>();
  private echecs = new Map<string, number[]>();

  constructor(private readonly maintenant: () => number = Date.now) {}

  parEmail(email: string): Compte | undefined {
    const cherche = email.trim().toLowerCase();
    return [...this.comptes.values()].find((c) => c.email.toLowerCase() === cherche);
  }
  actif(id: string): Compte | undefined {
    const compte = this.comptes.get(id);
    return compte && compte.role !== ROLE_RETIRE ? compte : undefined;
  }

  async creer(email: string, role: string, motDePasse: string | null, champs: Record<string, unknown> = {}): Promise<Compte> {
    const compte: Compte = { ...champs, id: identifiant(), email: email.trim().toLowerCase(), role, passwordHash: motDePasse === null ? null : await hacher(motDePasse) };
    this.comptes.set(compte.id, compte);
    return compte;
  }
  modifier(id: string, valeurs: Record<string, unknown>): Compte | undefined {
    const actuel = this.comptes.get(id);
    if (!actuel) return undefined;
    const nouveau = { ...actuel, ...valeurs, id } as Compte;
    this.comptes.set(id, nouveau);
    return nouveau;
  }

  /** Trop d'essais ratés pour cette adresse : dix en quinze minutes. */
  tropDEssais(email: string): boolean {
    const depuis = this.maintenant() - 15 * MINUTE;
    return (this.echecs.get(email) ?? []).filter((t) => t > depuis).length >= 10;
  }
  async connecter(email: string, motDePasse: string): Promise<SessionOuverte | undefined> {
    const compte = this.parEmail(email);
    const bon = compte && compte.role !== ROLE_RETIRE && (await verifierMotDePasse(motDePasse, compte.passwordHash));
    if (!compte || !bon) {
      const cle = email.trim().toLowerCase();
      this.echecs.set(cle, [...(this.echecs.get(cle) ?? []), this.maintenant()]);
      return undefined;
    }
    this.echecs.delete(email.trim().toLowerCase());
    return this.ouvrir(compte, jetonAleatoire(16), this.maintenant());
  }

  private ouvrir(compte: Compte, famille: string, debut: number): SessionOuverte {
    const jeton = jetonAleatoire();
    const renouvellement = jetonAleatoire();
    const maintenant = this.maintenant();
    this.acces.set(jeton, { compte: compte.id, expire: maintenant + DUREES.acces });
    this.renouvellements.set(renouvellement, { compte: compte.id, famille, debut, expire: Math.min(maintenant + DUREES.renouvellement, debut + DUREES.maximum) });
    return { jeton, renouvellement, compte };
  }

  /** Le compte d'un jeton d'accès valable, relu à chaque requête : un rôle changé compte tout de suite. */
  lireJeton(jeton: string | undefined): Compte | undefined {
    if (!jeton) return undefined;
    const trouve = this.acces.get(jeton);
    if (!trouve) return undefined;
    if (trouve.expire <= this.maintenant()) {
      this.acces.delete(jeton);
      return undefined;
    }
    return this.actif(trouve.compte);
  }

  /** Renouvelle : le jeton rendu ne sert plus, sauf pendant le délai de grâce (deux onglets au même instant). */
  renouveler(jeton: string | undefined): SessionOuverte | 'refuse' {
    const ancien = jeton ? this.renouvellements.get(jeton) : undefined;
    const maintenant = this.maintenant();
    if (!jeton || !ancien) return 'refuse';
    if (ancien.remplace !== undefined && maintenant - ancien.remplace > DUREES.grace) {
      this.fermerFamille(ancien.famille);
      return 'refuse';
    }
    const compte = this.actif(ancien.compte);
    if (!compte || ancien.expire <= maintenant || ancien.debut + DUREES.maximum <= maintenant) {
      this.renouvellements.delete(jeton);
      return 'refuse';
    }
    ancien.remplace ??= maintenant;
    return this.ouvrir(compte, ancien.famille, ancien.debut);
  }
  fermerFamille(famille: string): void {
    for (const [jeton, r] of this.renouvellements) if (r.famille === famille) this.renouvellements.delete(jeton);
  }
  /** La déconnexion ferme toute la famille de sessions. */
  fermer(renouvellement: string | undefined, jetonAcces: string | undefined): void {
    const r = renouvellement ? this.renouvellements.get(renouvellement) : undefined;
    if (r) this.fermerFamille(r.famille);
    if (jetonAcces) this.acces.delete(jetonAcces);
  }
  fermerTout(compte: string, sauf?: string): void {
    for (const [jeton, r] of this.renouvellements) if (r.compte === compte && r.famille !== sauf) this.renouvellements.delete(jeton);
    for (const [jeton, a] of this.acces) if (a.compte === compte) this.acces.delete(jeton);
  }
  familleDe(renouvellement: string | undefined): string | undefined {
    return renouvellement ? this.renouvellements.get(renouvellement)?.famille : undefined;
  }

  /** Un lien à usage unique, valable une heure (mot de passe oublié) ou sept jours (invitation). */
  creerLien(compte: string, genre: 'invitation' | 'oubli'): string {
    for (const [jeton, l] of this.liens) if (l.compte === compte) this.liens.delete(jeton);
    const jeton = jetonAleatoire();
    this.liens.set(jeton, { compte, genre, expire: this.maintenant() + (genre === 'invitation' ? 7 * 24 * 60 * MINUTE : 60 * MINUTE) });
    return jeton;
  }
  async consommerLien(jeton: string, motDePasse: string): Promise<Compte | undefined> {
    const lien = this.liens.get(jeton);
    if (!lien || lien.expire <= this.maintenant()) return undefined;
    const compte = this.actif(lien.compte);
    if (!compte) return undefined;
    this.liens.delete(jeton);
    const modifie = this.modifier(compte.id, { passwordHash: await hacher(motDePasse), invitation: false });
    this.fermerTout(compte.id);
    return modifie;
  }

  /** Ce que la machine garde d'un rechargement à l'autre. */
  reprendre(ancien: Comptes): void {
    this.comptes = ancien.comptes;
    this.liens = ancien.liens;
    this.acces = ancien.acces;
    this.renouvellements = ancien.renouvellements;
    this.echecs = ancien.echecs;
  }
}
