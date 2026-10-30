import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite.js');
  const dossierEssai = path.resolve(__dirname, '../../integration/essai');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [dossierEssai, '--disable-extensions'],
  });
}

main().catch((erreur) => {
  console.error('Test dans VS Code en échec :', erreur);
  process.exit(1);
});
