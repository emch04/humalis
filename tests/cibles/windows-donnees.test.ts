import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { genererProjetWindows } from '../../src/cibles/windows/projet.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';

const source = readFileSync(new URL('../../essais/donnees-comptes/notes.humalis', import.meta.url), 'utf8');
const application = () => {
  const { application: app, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return pourLaCible(app!, 'windows');
};
const texte = () => {
  const produit = genererProjetWindows(application(), { nom: 'Notes', source: 'notes.humalis', serveur: 'https://carnet.exemple.fr' } as never) as unknown as { fichiers?: Map<string, string> } & Map<string, string>;
  return [...(produit.fichiers ?? produit).values()].join('\n');
};

describe('Windows : les données sur l’appareil et les comptes', () => {
  it('les trois formes sont écrites', () => {
    expect(verifierFormesPourLaCible(application(), 'windows').filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
  it('la base est SQLite, chiffrée, la clé protégée par DPAPI', () => {
    const t = texte();
    expect(t).toContain('Microsoft.Data.Sqlite');
    expect(t).toContain('AesGcm');
    expect(t).toContain('CryptProtectData');
  });
  it('la synchronisation suit le contrat, y compris un lot trop lourd', () => {
    const t = texte();
    expect(t).toContain('/synchro');
    expect(t).toContain('reponse.Statut == 413');
    expect(t).toContain('NetworkChange');
  });
  it('les clés d’accès passent par webauthn.dll, sans paquet MSIX', () => {
    expect(texte()).toContain('WebAuthNAuthenticatorMakeCredential');
  });
  it('la connexion connaît l’étape du code', () => {
    expect(texte()).toContain('/auth/double/verifier');
  });
});
