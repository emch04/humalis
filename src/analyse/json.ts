/**
 * « humalis verifier --json » et « humalis compile --json » : les diagnostics pour les agents d'IA et les outils
 * (décidé avec le mainteneur le 17 novembre 2026). Une forme stable, versionnée ; les clés en français.
 */
import type { Diagnostic } from './erreurs.js';
import { codeDuMessage } from './codes.js';
import { correctionDe, type Correction } from './corrections.js';

export interface DiagnosticJson {
  fichier: string;
  ligne: number;
  /** null quand le compilateur ne la connaît pas (il ne la connaît que pour l'écriture des lignes). */
  colonne: number | null;
  gravite: 'erreur' | 'avertissement';
  /** « HUM-0142 » ; null pour un message que le catalogue ne connaît pas encore. */
  code: string | null;
  message: string;
  /** Seulement quand le compilateur la connaît avec certitude : remplacer, sur cette ligne, la première fois. */
  correction?: Correction;
}

export interface RapportJson {
  version: 1;
  fichier: string;
  /** Vrai s'il n'y a aucune erreur : il suit le code de sortie (« --exigeant » durcit les avertissements de qualité). */
  ok: boolean;
  diagnostics: DiagnosticJson[];
}

/** Un diagnostic déjà situé dans son fichier (situer) ; « principal » : le fichier donné à la commande. */
export function diagnosticEnJson(d: Diagnostic, principal: string): DiagnosticJson {
  const correction = correctionDe(d.message);
  return {
    fichier: d.fichier ?? principal,
    ligne: d.ligne,
    colonne: d.colonne ?? null,
    gravite: d.gravite,
    code: codeDuMessage(d.message) ?? null,
    message: d.message,
    ...(correction ? { correction } : {}),
  };
}

export function rapportJson(diagnostics: Diagnostic[], principal: string): RapportJson {
  return { version: 1, fichier: principal, ok: !diagnostics.some((d) => d.gravite === 'erreur'), diagnostics: diagnostics.map((d) => diagnosticEnJson(d, principal)) };
}
