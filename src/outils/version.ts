import { readFileSync } from 'node:fs';

/** La version du paquet, lue dans son package.json (deux dossiers au-dessus de src/outils/ comme de dist/outils/). */
export function versionHumalis(): string {
  return (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

/** « humalis --version » ou « humalis --aide » : le texte à afficher, ou undefined pour une autre commande. */
export function reponseSimple(arguments_: string[], aide: string): string | undefined {
  if (arguments_.length !== 1) return undefined;
  if (['--version', '-v', 'version'].includes(arguments_[0]!)) return `humalis ${versionHumalis()}`;
  if (['--aide', '--help', '-h', 'aide'].includes(arguments_[0]!)) return aide;
  return undefined;
}
