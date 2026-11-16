import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Installe les paquets d'un projet produit, et les réinstalle dès que son package.json change : une nouvelle version
 * d'un pack Astratra ou d'Express est alors vraiment essayée, au lieu des paquets d'une installation plus ancienne.
 */
export function installerSiBesoin(dossier: string): void {
  const paquets = readFileSync(join(dossier, 'package.json'), 'utf8');
  const installes = join(dossier, 'node_modules', '.paquets-humalis.json');
  if (existsSync(installes) && readFileSync(installes, 'utf8') === paquets) return;
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
  writeFileSync(installes, paquets);
}
