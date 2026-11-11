import { runTests } from '@vscode/test-electron';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

/** L'essai du débogueur, dans le VS Code installé s'il existe (sinon téléchargé), sans autre extension. */
async function main(): Promise<void> {
  const installe = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  // Un chemin court : VS Code refuse une prise IPC de plus de 103 caractères.
  const profil = process.env.HUMALIS_PROFIL_VSCODE ?? '/Volumes/MacSSD/Caches/humalis-constructions/vsd';
  await runTests({
    ...(process.env.HUMALIS_VSCODE ?? (existsSync(installe) ? installe : undefined) ? { vscodeExecutablePath: process.env.HUMALIS_VSCODE ?? installe } : {}),
    extensionDevelopmentPath: path.resolve(__dirname, '../..'),
    extensionTestsPath: path.resolve(__dirname, './debogage-suite.js'),
    // Pas de --disable-extensions : il éteindrait aussi le débogueur JavaScript intégré. Un dossier d'extensions vide suffit.
    launchArgs: [path.resolve(__dirname, '../../integration/debogage'), '--user-data-dir', `${profil}/donnees`, '--extensions-dir', `${profil}/extensions`],
    extensionTestsEnv: { ...process.env } as Record<string, string>,
  });
}

main().catch((erreur) => {
  console.error('Essai du débogueur en échec :', erreur);
  process.exit(1);
});
