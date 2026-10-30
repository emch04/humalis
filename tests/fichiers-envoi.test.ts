import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { verifierFichiersPourLaCible } from '../src/cibles/sources.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);

const SOURCE = ['source "boutique" :', '    adresse "http://localhost:3000"', '    enveloppe "data"', '    session astratra', ''].join('\n');

const PROFIL = [
  SOURCE,
  'page "profil" :',
  '    variable photo = rien',
  '    variable envoi = 0',
  '    variable adresse_photo = rien',
  '    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo',
  "    si photo est different de rien :",
  '        image photo.apercu avec description "Aperçu de la photo choisie" et proportions 1 sur 1',
  '        texte "{photo.nom}"',
  '        bouton "Envoyer la photo"',
  '        progression envoi avec maximum 100 et description "Envoi de la photo"',
  "    si adresse_photo est different de rien :",
  '        image adresse_photo avec description "Votre photo"',
  '    quand l\'utilisateur clique sur "Envoyer la photo" :',
  '        envoyer fichier photo vers "api/shop/moi/photo" de la source "boutique" en corps brut suivi dans envoi et fichier dans adresse_photo',
].join('\n');

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const fichierDe = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });

describe('fichiers choisis — l’analyse', () => {
  it('un programme complet passe sans erreur', () => {
    expect(erreurs(PROFIL)).toEqual([]);
  });
  it('un fichier sans « accepte » prévient que le serveur doit vérifier', () => {
    expect(avertissements(p('>variable f = rien', '>fichier "Choisir" dans f'))).toEqual([
      '3 : sans « accepte », tout fichier peut être choisi : le serveur doit vérifier le type. Écrivez par exemple accepte images ou accepte pdf.',
    ]);
  });
  it('refuse un type inconnu avec une suggestion, et le SVG', () => {
    expect(erreurs(p('>variable f = rien', '>fichier "Choisir" dans f accepte imagess'))).toEqual([
      "3 : « imagess » n'est pas un type de fichier connu. Types possibles : images, audio, videos, pdf, documents. Peut-être « images » ?",
    ]);
    expect(erreurs(p('>variable f = rien', '>fichier "Choisir" dans f accepte svg'))[0]).toContain("le SVG n'est pas accepté");
  });
  it('refuse un libellé vide et une variable absente', () => {
    expect(erreurs(p('>variable f = rien', '>fichier "" dans f accepte images'))[0]).toContain('libellé du choix de fichier est vide');
    expect(erreurs(p('>fichier "Choisir" dans f accepte images'))[0]).toContain('f');
  });
  it('un fichier choisi ne se garde pas', () => {
    expect(erreurs(p('>variable f = rien avec memorisee', '>fichier "Choisir" dans f accepte images'))[0]).toContain('ne se garde pas');
  });
  it('« apercu » d’un PDF est refusé', () => {
    expect(erreurs(p('>variable f = rien', '>fichier "Choisir" dans f accepte pdf', '>texte f.apercu'))[0]).toContain("n'a pas d'aperçu");
  });
  it('le champ inconnu d’un fichier choisi est suggéré', () => {
    expect(erreurs(p('>variable f = rien', '>fichier "Choisir" dans f accepte images', '>texte f.tailles'))[0]).toContain('Champs : nom, taille, type, apercu');
  });
  it('l’envoi est refusé hors d’un événement', () => {
    const hors = p('>variable f = rien', '>fichier "Choisir" dans f accepte images', '>envoyer fichier f vers "x" de la source "boutique"');
    expect(erreurs(`${SOURCE}\n${hors}`)[0]).toContain("ne s'utilise que dans un événement");
  });
  it('l’envoi vers le serveur du fichier est refusé, honnêtement (M10)', () => {
    expect(erreurs(PROFIL.replace(' de la source "boutique"', ''))[0]).toContain("les packs Astratra n'ont pas encore de route d'envoi");
  });
  it('l’envoi d’une variable qui n’est pas un fichier est refusé', () => {
    expect(erreurs(PROFIL.replace('envoyer fichier photo', 'envoyer fichier envoi'))[0]).toContain("« envoi » n'est pas un fichier choisi");
  });
  it('la progression est un nombre', () => {
    expect(erreurs(PROFIL.replace('variable envoi = 0', 'variable envoi = "x"').replace('progression envoi avec maximum 100 et description "Envoi de la photo"', 'texte envoi'))[0]).toContain('la progression est un nombre');
  });
  it('une source inconnue est refusée avec ses sources', () => {
    expect(erreurs(PROFIL.replace('de la source "boutique"', 'de la source "boutik"'))[0]).toContain('aucune source « boutik ». Sources : boutique.');
  });
  it('« en corps brut » et « sous le nom » ensemble sont refusés', () => {
    const { diagnostics } = compiler(PROFIL.replace('en corps brut', 'en corps brut sous le nom "photo"'));
    expect(diagnostics[0].message).toContain('envoie le fichier seul, sans formulaire');
  });
  it('vérifie la route quand la source la décrit', () => {
    const decrite = (route: string) => PROFIL.replace('    session astratra\n', `    session astratra\n    route "${route}" :\n        lire une liste de photo\n    donnee photo :\n        fichier : texte\n`);
    expect(erreurs(decrite('api/shop/moi/photo'))[0]).toContain('ne dit pas « creer … »');
    expect(erreurs(decrite('autre'))[0]).toContain('aucune route « api/shop/moi/photo »');
  });
});

describe('fichiers choisis — le web', () => {
  const fichiers = web(PROFIL);
  const page = fichierDe(fichiers, 'src/pages/Profil.tsx');
  it('écrit le choix de fichier et son envoi par XMLHttpRequest', () => {
    expect(page).toContain("<ChoixFichier libelle={'Choisir une photo'} valeur={photo} onChange={setPhoto}");
    expect(page).toContain('maximum={5242880}');
    expect(page).toContain("mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']");
    expect(page).not.toContain('image/svg');
    expect(page).toContain("setAdressePhoto(await televerser(photo, 'api/shop/moi/photo', { source: 'boutique', corpsBrut: true, progression: setEnvoi, message: afficherMessage }, adressePhoto));");
    expect(page).not.toMatch(/fetch\(/);
  });
  it('écrit les deux petits fichiers, sans bibliothèque', () => {
    const choix = fichierDe(fichiers, 'src/humalis/choix-fichier.tsx');
    const envoi = fichierDe(fichiers, 'src/humalis/televerser.ts');
    expect(choix).toContain('URL.revokeObjectURL');
    expect(choix).toContain('role="alert"');
    expect(choix).toContain('htmlFor={id}');
    expect(envoi).toContain('new XMLHttpRequest()');
    expect(envoi).toContain('xhr.upload.onprogress');
    expect(envoi).toContain("'x-csrf-token'");
    expect(fichierDe(fichiers, 'package.json')).not.toMatch(/axios|uppy|dropzone/);
  });
  it('rien de tout cela n’est écrit pour un programme qui ne choisit pas de fichier', () => {
    const sans = web('page "p" :\n    texte "a"');
    expect([...sans.keys()].filter((n) => /choix-fichier|televerser/.test(n))).toEqual([]);
    expect(fichierDe(sans, 'styles.css')).not.toContain('humalis-fichier');
    expect(fichierDe(fichiers, 'src/humalis/styles.css')).toContain('.humalis-fichier-bouton');
  });
  it('l’état de la requête s’applique à la réponse de l’envoi', () => {
    const avecEtat = web(PROFIL.replace('    si adresse_photo est different de rien :', '    si adresse_photo est en erreur :\n        texte erreur de adresse_photo\n    si adresse_photo est different de rien :'));
    const code = fichierDe(avecEtat, 'src/pages/Profil.tsx');
    expect(code).toContain('suivi: setAdressePhotoReq, silencieux: true');
    expect(code).not.toContain('message: afficherMessage');
  });
});

describe('fichiers choisis — les autres cibles', () => {
  it('le desktop reprend le web', () => {
    const fichiers = genererProjetDesktop(compile(PROFIL), { nom: 'e', source: 'e.humalis' });
    expect(fichierDe(fichiers, 'src/humalis/televerser.ts')).toContain('XMLHttpRequest');
  });
  it('le desktop laisse passer les aperçus (blob:) seulement quand un fichier en a', () => {
    const principal = (source: string) => fichierDe(genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis' }), 'electron/principal.ts');
    expect(principal(PROFIL)).toContain(`"img-src 'self' data: https: blob:"`);
    const pdf = PROFIL.replace('accepte images', 'accepte pdf').replace('        image photo.apercu avec description "Aperçu de la photo choisie" et proportions 1 sur 1\n', '');
    expect(principal(pdf)).toContain(`"img-src 'self' data: https:"`);
    expect(principal('page "p" :\n    texte "a"')).toContain(`"img-src 'self' data: https:"`);
  });
  it('le mobile et le statique refusent clairement', () => {
    const application = compile(PROFIL);
    for (const cible of ['mobile', 'statique'] as const) {
      const messages = verifierFichiersPourLaCible(application, cible).map((d) => d.message);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(`ne sont pas encore disponibles sur la cible ${cible}`);
    }
  });
});
