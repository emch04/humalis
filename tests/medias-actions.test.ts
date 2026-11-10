import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { ECRITES, PREVUES, verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
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
      for (const cible of ['apple', 'android', 'windows']) expect(ECRITES[cible]!.has(forme)).toBe(true);
    }
    for (const cible of ['apple', 'android']) expect(ECRITES[cible]!.has('scannerDocument')).toBe(true);
    expect(ECRITES.windows!.has('scannerDocument')).toBe(false);
  });

  it('accepte les captures sur les cibles natives et refuse le scan ailleurs qu\u2019Apple et Android', () => {
    const capture = compilerAction('enregistrer audio dans fichier');
    for (const cible of ['web', 'apple', 'android', 'windows']) expect(verifierFormesPourLaCible(capture, cible).filter((d) => d.gravite === 'erreur')).toEqual([]);
    const scan = compilerAction('scanner document dans fichier');
    for (const cible of ['web', 'windows']) expect(verifierFormesPourLaCible(scan, cible).some((d) => d.gravite === 'erreur')).toBe(true);
    for (const cible of ['apple', 'android']) expect(verifierFormesPourLaCible(scan, cible).filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('un fichier capturé s\u2019envoie comme un fichier choisi', () => {
    for (const capture of ['enregistrer audio dans fichier', 'enregistrer video dans fichier', 'scanner document dans fichier', 'photo dans fichier']) {
      const source = `source "b" :\n    adresse "https://exemple.fr"\n\n${programme(capture)}\n    bouton "Envoyer"\n    quand l'utilisateur clique sur "Envoyer" :\n        envoyer fichier fichier vers "recu" de la source "b"`;
      expect(compiler(source).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    }
  });

  describe('sur Apple', () => {
    const projet = (action: string) => genererProjetApple(compilerAction(action), { nom: 'essai', source: 'essai.humalis' }).fichiers;
    const page = (f: Map<string, string>) => [...f.entries()].filter(([n]) => n.endsWith('.swift') && !n.includes('/Humalis/')).map(([, c]) => c).join('\n');

    it('appelle la bonne fonction, sans toucher à la variable si on annule', () => {
      expect(page(projet('enregistrer audio dans fichier'))).toMatch(/if let humalisMedia = await enregistrerMedia\("audio"\) \{\s+fichier = humalisMedia/);
      expect(page(projet('enregistrer video dans fichier'))).toContain('await enregistrerMedia("video")');
      expect(page(projet('scanner document dans fichier'))).toContain('await scannerDocument()');
      expect(page(projet('recadrer fichier'))).toContain('await recadrerPhoto(fichier)');
    });

    it('déclare seulement ce que l\u2019application emploie', () => {
      const son = projet('enregistrer audio dans fichier');
      expect(son.get('Info.plist')).toContain('NSMicrophoneUsageDescription');
      expect(son.get('Info.plist')).not.toContain('NSCameraUsageDescription');
      expect([...son.entries()].find(([n]) => n.endsWith('.entitlements'))![1]).toContain('com.apple.security.device.audio-input');
      expect([...son.entries()].find(([n]) => n.endsWith('.entitlements'))![1]).not.toContain('com.apple.security.device.camera');
      const film = projet('enregistrer video dans fichier');
      expect(film.get('Info.plist')).toContain('NSCameraUsageDescription');
      expect([...film.entries()].find(([n]) => n.endsWith('.entitlements'))![1]).toContain('com.apple.security.device.camera');
      expect(projet('recadrer fichier').get('Info.plist')).not.toContain('NSMicrophoneUsageDescription');
    });

    it('écrit la capture, avec un recours pour les extensions', () => {
      const code = [...projet('recadrer fichier').entries()].find(([n]) => n.endsWith('Humalis/Captures.swift'))![1];
      for (const mot of ['AVAudioRecorder', 'AVCaptureMovieFileOutput', 'VNDocumentCameraViewController', 'CGImageSourceCreateThumbnailAtIndex', 'HUMALIS_SANS_FENETRE']) expect(code).toContain(mot);
    });
  });

  describe('sur Android', () => {
    const projet = (action: string) => genererProjetAndroid(compilerAction(action), { nom: 'essai', source: 'essai.humalis' }).fichiers;
    const manifeste = (f: Map<string, string>) => f.get('app/src/main/AndroidManifest.xml')!;
    const gradle = (f: Map<string, string>) => f.get('app/build.gradle.kts')!;
    const captures = (f: Map<string, string>) => [...f.entries()].find(([n]) => n.endsWith('/Captures.kt'))![1];

    it('le son demande le micro, sans CameraX', () => {
      const f = projet('enregistrer audio dans fichier');
      expect(manifeste(f)).toContain('android.permission.RECORD_AUDIO');
      expect(manifeste(f)).not.toContain('android.permission.CAMERA');
      expect(manifeste(f)).toContain('.EcranCaptureHumalis');
      expect(gradle(f)).not.toContain('androidx.camera');
      expect(gradle(f)).toContain('media3-exoplayer');
      expect(captures(f)).toContain('MediaRecorder');
      expect(captures(f)).not.toContain('androidx.camera');
    });

    it('la vidéo emploie CameraX ; l\u2019écran reste dans son sens', () => {
      const f = projet('enregistrer video dans fichier');
      expect(manifeste(f)).toContain('android.permission.CAMERA');
      expect(manifeste(f)).toContain('android:screenOrientation="locked"');
      expect(gradle(f)).toContain('androidx.camera:camera-video');
      expect(captures(f)).toContain('VideoCapture.withOutput');
    });

    it('le document emploie ML Kit, sans permission de caméra', () => {
      const f = projet('scanner document dans fichier');
      expect(gradle(f)).toContain('play-services-mlkit-document-scanner');
      expect(manifeste(f)).not.toContain('android.permission.CAMERA');
      expect(manifeste(f)).not.toContain('.EcranCaptureHumalis');
      expect(captures(f)).toContain('RESULT_FORMAT_PDF');
    });

    it('le recadrage ne demande rien au système', () => {
      const f = projet('recadrer fichier');
      expect(manifeste(f)).not.toContain('RECORD_AUDIO');
      expect(captures(f)).toContain('BitmapRegionDecoder');
      expect([...f.values()].join('\n')).toContain('recadrerPhoto(fichier)?.let { fichier = it }');
    });
  });

  describe('sur Windows', () => {
    const projet = (action: string) => genererProjetWindows(compilerAction(action), { nom: 'essai', source: 'essai.humalis' }).fichiers;
    const csproj = (f: Map<string, string>) => [...f.entries()].find(([n]) => n.endsWith('.csproj'))![1];

    it('l\u2019enregistrement cible les API de Windows, sans paquet MSIX', () => {
      const f = projet('enregistrer video dans fichier');
      expect(csproj(f)).toContain('net10.0-windows10.0.19041.0');
      expect(csproj(f)).not.toContain('WindowsPackageType');
      expect(f.get('Humalis/Enregistrement.cs')).toContain('StartRecordToStorageFileAsync');
      expect([...f.values()].join('\n')).toContain('await Enregistrement.Media("video")');
    });

    it('le recadrage reste en WPF seul', () => {
      const f = projet('recadrer fichier');
      expect(csproj(f)).not.toContain('windows10.0.19041');
      expect(f.has('Humalis/Enregistrement.cs')).toBe(false);
      expect(f.get('Humalis/Recadrage.cs')).toContain('CroppedBitmap');
    });
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
