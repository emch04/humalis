/** Minuscules, sans accents : « Inférieure » devient « inferieure ». */
export function normaliser(mot: string): string {
  return mot
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
