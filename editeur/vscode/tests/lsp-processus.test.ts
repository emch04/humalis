import { describe, it, expect, afterEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ClientLsp, parcours } from '../scripts/client-lsp.js';
import { dossierExemples, exemple } from './aide-langage.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let client: ClientLsp | undefined;
afterEach(() => client?.tuer());

describe('le serveur LSP dans un vrai processus (stdin, stdout)', () => {
  it('répond à un éditeur, du premier message au dernier', async () => {
    client = new ClientLsp(process.execPath, ['--import', 'tsx', join(racine, 'src', 'lsp', 'principal.ts'), '--stdio'], racine);
    const uri = pathToFileURL(join(dossierExemples, 'boutique.humalis')).href;
    const verifications = await parcours(client, uri, exemple('boutique.humalis'));
    const ratees = verifications.filter(([, ok]) => !ok);
    expect(ratees).toEqual([]);
    expect(verifications.length).toBeGreaterThanOrEqual(10);
  }, 30_000);
});
