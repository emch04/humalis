/**
 * La table des langues de Humalis (plan 2026-10-30-qualite-publication,
 * partie 1, décision Q6) : le français, l'anglais, l'espagnol, le portugais,
 * le swahili et le lingala sont disponibles. Une langue prévue (disponible
 * faux) répondrait « pas encore disponible » plutôt que « mot inconnu ».
 *
 * Le mot est celui du programme, sans accent (`francais`, `anglais`) ; le
 * code est celui des navigateurs et des téléphones (`fr`, `en`).
 */
export interface Langue {
  /** Le mot écrit dans le programme, sans accent ni majuscule. */
  mot: string;
  /** Le code de la langue (BCP 47, deux lettres). */
  code: string;
  /** Le nom en français, pour les messages (« anglais »). */
  nom: string;
  /** L'adjectif au féminin, pour les messages (« une version anglaise »). */
  adjectif: string;
  /** Le nom de la langue écrit dans cette langue : c'est lui que montre le sélecteur. */
  nomPropre: string;
  disponible: boolean;
}

export const LANGUES: Langue[] = [
  { mot: 'francais', code: 'fr', nom: 'français', adjectif: 'française', nomPropre: 'Français', disponible: true },
  { mot: 'anglais', code: 'en', nom: 'anglais', adjectif: 'anglaise', nomPropre: 'English', disponible: true },
  { mot: 'espagnol', code: 'es', nom: 'espagnol', adjectif: 'espagnole', nomPropre: 'Español', disponible: true },
  { mot: 'portugais', code: 'pt', nom: 'portugais', adjectif: 'portugaise', nomPropre: 'Português', disponible: true },
  { mot: 'swahili', code: 'sw', nom: 'swahili', adjectif: 'swahilie', nomPropre: 'Kiswahili', disponible: true },
  { mot: 'lingala', code: 'ln', nom: 'lingala', adjectif: 'lingala', nomPropre: 'Lingála', disponible: true },
];

/** La langue d'un mot du programme (« anglais », « Français »), ou rien. */
export function langueDuMot(mot: string): Langue | undefined {
  const simple = mot.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return LANGUES.find((l) => l.mot === simple);
}

/** La langue d'un code (« en »). */
export function langueDuCode(code: string): Langue | undefined {
  return LANGUES.find((l) => l.code === code);
}

/** « français, anglais » : les langues disponibles, pour les messages. */
export const LANGUES_DISPONIBLES = LANGUES.filter((l) => l.disponible);
