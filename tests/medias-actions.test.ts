import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { ECRITES, PREVUES, verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { APPAREIL_JS, APPAREIL_TYPES, utiliseAppareil } from '../src/cibles/commun/appareil-web.js';

const programme = (action: string, variable = 'fichier') => `page "p" :\n    titre "P"\n    variable ${variable} = rien\n    bouton "Faire"\n    quand l'utilisateur clique sur "Faire" :\n        ${action}`;
const compilerAction = (action: string) => {
  const resultat = compiler(programme(action));
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!;
};

describe('actions de médias', () => {
  for (const [phrase, type] of [
    ['enregistrer audio dans fichier', 'enregistrerAudio'],
    ['enregistrer video dans fichier', 'enregistrerVideo'],
    ['scanner document dans fichier', 'scannerDocument'],
    ['recadrer fichier', 'recadrerPhoto'],
  ]) {
    it(`analyse et construit « ${phrase} »`, () => {
      const application = compilerAction(phrase);
      expect(application.ecrans[0]!.gestionnaires[0]!.actions).toContainEqual({ type, variable: 'fichier' });
      expect(utiliseAppareil(application)).toBe(type !== 'scannerDocument');
    });
    it(`refuse une variable numérique pour « ${phrase} »`, () => {
      const source = programme(phrase).replace('variable fichier = rien', 'variable fichier = 1');
      expect(compiler(source).diagnostics.some((d) => d.message.includes('elle reçoit un fichier'))).toBe(true);
    });
  }

  it('déclare exactement les cibles prévues et écrites', () => {
    expect(PREVUES.scannerDocument).toEqual(['apple', 'android']);
    for (const forme of ['enregistrerAudio', 'enregistrerVideo', 'recadrerPhoto'] as const) {
      expect(ECRITES.web.has(forme)).toBe(true);
      expect(ECRITES.desktop.has(forme)).toBe(true);
      for (const cible of ['apple', 'android', 'windows']) expect(ECRITES[cible]!.has(forme)).toBe(false);
    }
    for (const cible of ['apple', 'android']) expect(ECRITES[cible]!.has('scannerDocument')).toBe(false);
  });

  it('refuse les actions non écrites et le scan sur le web', () => {
    const capture = compilerAction('enregistrer audio dans fichier');
    expect(verifierFormesPourLaCible(capture, 'web').filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(verifierFormesPourLaCible(capture, 'apple').some((d) => d.gravite === 'erreur')).toBe(true);
    const scan = compilerAction('scanner document dans fichier');
    expect(verifierFormesPourLaCible(scan, 'web').some((d) => d.gravite === 'erreur')).toBe(true);
    expect(verifierFormesPourLaCible(scan, 'android').some((d) => d.gravite === 'erreur')).toBe(true);
  });

  it('génère les appels réels dans React et Electron', () => {
    const application = compilerAction('enregistrer video dans fichier');
    const web = genererProjetWeb(application, { nom: 'essai', adresse: 'https://exemple.fr', source: 'essai.humalis' });
    expect([...web.values()].some((f) => f.includes('appareil.enregistrerMedia("video")'))).toBe(true);
    expect([...web.entries()].filter(([nom]) => nom.includes('appareil')).map(([nom]) => nom)).toContain('src/humalis/appareil.js');
    const bureau = genererProjetDesktop(application, { nom: 'essai', source: 'essai.humalis', composantsReact: new Map() });
    expect([...bureau.values()].some((f) => f.includes('appareil.enregistrerMedia("video")'))).toBe(true);
    const recadrage = genererProjetWeb(compilerAction('recadrer fichier'), { nom: 'essai', adresse: 'https://exemple.fr', source: 'essai.humalis' });
    expect([...recadrage.values()].some((f) => f.includes('appareil.recadrerPhoto('))).toBe(true);
  });

  it('fournit la capture et le recadrage dans le module web', () => {
    expect(APPAREIL_TYPES).toContain('enregistrerMedia');
    expect(APPAREIL_JS).toContain('new MediaRecorder(flux)');
    expect(APPAREIL_JS).toContain('sortie.toBlob');
    expect(APPAREIL_JS).toContain('annuler.onclick');
  });
});
