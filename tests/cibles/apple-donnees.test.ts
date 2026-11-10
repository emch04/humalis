import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { genererProjetApple } from '../../src/cibles/apple/projet.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';

const source = readFileSync(new URL('../../essais/donnees-comptes/notes.humalis', import.meta.url), 'utf8');
const application = () => {
  const { application: app, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return pourLaCible(app!, 'apple');
};
const tout = () => {
  const { fichiers } = genererProjetApple(application(), { nom: 'Notes', source: 'notes.humalis', serveur: 'https://carnet.exemple.fr', equipe: 'ABCDE12345', identifiant: 'fr.exemple.notes' });
  return { fichiers, texte: [...fichiers.values()].join('\n') };
};

describe('Apple : les données sur l’appareil et les comptes', () => {
  it('les trois formes sont écrites', () => {
    expect(verifierFormesPourLaCible(application(), 'apple').filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
  it('la base est SQLite, chiffrée avec une clé du Keychain', () => {
    const { texte } = tout();
    expect(texte).toContain('sqlite3_open');
    expect(texte).toContain('AES.GCM');
    expect(texte).toContain('kSecAttrAccessible');
  });
  it('la synchronisation suit le contrat, y compris un lot trop lourd', () => {
    const { texte } = tout();
    expect(texte).toContain('/synchro');
    expect(texte).toContain('reponse.statut == 413');
  });
  it('les passkeys passent par le système, avec le domaine du serveur', () => {
    const { texte } = tout();
    expect(texte).toContain('ASAuthorizationPlatformPublicKeyCredentialProvider');
    expect(texte).toContain('webcredentials:carnet.exemple.fr');
  });
  it('la connexion connaît l’étape du code', () => {
    expect(tout().texte).toContain('/auth/double/verifier');
  });
});
