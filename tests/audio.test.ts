import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { mediasLocaux, type InfoMedia } from '../src/ri/medias.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const MEDIAS = new Map<string, InfoMedia>([['extrait.mp3', { octets: 12, genre: 'audio', contenu: 'AAEC' }]]);
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis', medias: MEDIAS });
const statique = (source: string) => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis', medias: MEDIAS });
const mobile = (source: string) => genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis', medias: MEDIAS });
const desktop = (source: string) => genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis', medias: MEDIAS });
const fichier = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';

const SIMPLE = p('>audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve, 30 secondes"');
const COMPLET = p(
  '>variable pistes = [fiche avec titre "Moambe" et fichier "https://cdn.lefleuve.cd/moambe.mp3"]',
  '>audio "extrait.mp3" avec description "Extrait de la chanson" et boucle',
  '>audio "entretien.mp3" avec description "Entretien avec la cheffe" et transcription "Bonjour et bienvenue au Fleuve."',
  '>pour chaque piste dans pistes :',
  '>>audio piste.fichier avec description piste.titre et transcription "Extrait : {piste.titre}"',
);

describe('audio — le parser', () => {
  it('lit la description, la transcription et la boucle', () => {
    const [son] = corps(p('>audio "a.mp3" avec description "Un son" et transcription "Bonjour" et boucle')) as any[];
    expect(son.element).toBe('audio');
    expect(son.styles.map((s: any) => s.propriete)).toEqual(['description', 'transcription', 'boucle']);
  });
  it('« audio » reste un nom ailleurs', () => {
    expect(erreurs(p('>variable audio = 3', '>variable boucle = 1', '>texte "{audio} {boucle}"'))).toEqual([]);
  });
});

describe('audio — l’analyse (décision M13)', () => {
  it('un programme complet passe sans erreur', () => {
    expect(erreurs(COMPLET)).toEqual([]);
  });
  it('la description est obligatoire', () => {
    expect(erreurs(p('>audio "extrait.mp3"'))).toEqual(['2 : décrivez le son pour les personnes qui ne le voient pas : « audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve" ».']);
  });
  it('une description vide est refusée', () => {
    expect(erreurs(p('>audio "extrait.mp3" avec description ""'))[0]).toContain('la description du son est vide');
  });
  it('la lecture automatique est refusée, avec son explication', () => {
    const messages = erreurs(p('>audio "extrait.mp3" avec description "Un son" et automatique'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Humalis ne lance jamais un son tout seul');
  });
  it('refuse un format inconnu et des proportions', () => {
    expect(erreurs(p('>audio "extrait.mid" avec description "Un son"'))[0]).toContain('n’est pas un son que les navigateurs savent jouer');
    expect(erreurs(p('>audio "extrait.mp3" avec description "Un son" et proportions 4 sur 3'))[0]).toContain('« proportions » se règle seulement sur : image');
  });
  it('une adresse ou un chemin absolu n’est pas vérifié comme un fichier local', () => {
    expect(erreurs(p('>audio "https://cdn.lefleuve.cd/titre" avec description "Un son"'))).toEqual([]);
  });
  it('conseille une transcription pour de la parole', () => {
    expect(avertissements(p('>audio "entretien.mp3" avec description "Entretien"'))).toEqual([
      '2 : ce son ressemble à de la parole (son nom l’annonce) : ajoutez « et transcription "…" » pour les personnes qui ne peuvent pas l’écouter.',
    ]);
  });
  it('« description » et « boucle » ne valent pas sur d’autres éléments', () => {
    expect(erreurs(p('>texte "a" avec boucle'))[0]).toContain('se règle seulement sur : audio');
  });
  it('la description peut venir d’une variable', () => {
    expect(erreurs(p('>variable piste = fiche avec titre "Moambe"', '>audio "extrait.mp3" avec description piste.titre'))).toEqual([]);
    expect(erreurs(p('>audio "extrait.mp3" avec description piste.titre'))[0]).toContain('piste');
  });
});

describe('audio — les fichiers locaux', () => {
  it('liste le son local, une fois, avec son genre', () => {
    const locaux = mediasLocaux(compile(COMPLET));
    expect(locaux).toEqual([
      { chemin: 'extrait.mp3', genre: 'audio', ligne: expect.any(Number) },
      { chemin: 'entretien.mp3', genre: 'audio', ligne: expect.any(Number) },
    ]);
  });
});

describe('audio — le web', () => {
  const fichiers = web(SIMPLE);
  const page = fichier(fichiers, 'src/pages/P.tsx');
  it('écrit un lecteur natif qui ne démarre jamais seul', () => {
    expect(page).toContain(`<audio controls preload="none" src="/audio/extrait.mp3" aria-label="Extrait de la chanson Le Fleuve, 30 secondes" className="humalis-audio" />`);
    for (const code of [...fichiers.values()]) expect(code).not.toMatch(/autoplay/i);
    expect(page).not.toMatch(/\.play\(/);
  });
  it('recopie le fichier local dans public/audio/', () => {
    expect(fichiers.has('public/audio/extrait.mp3')).toBe(true);
    expect(fichiers.has('public/images/extrait.mp3')).toBe(false);
  });
  it('la transcription est un bloc déroulant natif ; la boucle, l’attribut loop', () => {
    const code = fichier(web(COMPLET), 'src/pages/P.tsx');
    expect(code).toContain('loop');
    expect(code).toContain('<details className="humalis-audio-transcription"><summary>Lire la transcription</summary><p>Bonjour et bienvenue au Fleuve.</p></details>');
    expect(code).toContain('src={piste.fichier}');
    expect(code).toContain('aria-label={`${piste.titre}`}');
  });
  it('le CSS du lecteur n’est écrit que s’il sert', () => {
    expect(fichier(fichiers, 'src/humalis/styles.css')).toContain('.humalis-audio');
    expect(fichier(web('page "p" :\n    texte "a"'), 'src/humalis/styles.css')).not.toContain('humalis-audio');
  });
  it('aucune dépendance de plus', () => {
    expect(fichier(fichiers, 'package.json')).not.toMatch(/audio|howler|wavesurfer/i);
  });
});

describe('audio — le site statique', () => {
  it('écrit le même lecteur, sans lecture automatique', () => {
    const fichiers = statique(COMPLET);
    expect(fichiers.has('audio/extrait.mp3')).toBe(true);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<audio controls="true" preload="none" src="audio/extrait.mp3" aria-label="Extrait de la chanson" loop="true" class="humalis-audio">');
    expect(html).toMatch(/<summary>\s*Lire la transcription\s*<\/summary>/);
    for (const code of [...fichiers.values()]) expect(code).not.toMatch(/autoplay/i);
  });
});

describe('audio — le desktop', () => {
  it('reprend le web et ouvre media-src pour les sons', () => {
    const fichiers = desktop(SIMPLE);
    expect(fichier(fichiers, 'src/pages/P.tsx')).toContain('<audio controls preload="none"');
    expect(fichier(fichiers, 'electron/principal.ts')).toContain(`"media-src 'self' blob: https:"`);
    expect(fichier(desktop('page "p" :\n    texte "a"'), 'electron/principal.ts')).not.toContain('media-src');
  });
});

describe('audio — le mobile', () => {
  it('écrit un lecteur fait de boutons, avec expo-audio (version accordée à Expo 57)', () => {
    const fichiers = mobile(COMPLET);
    const page = [...fichiers.entries()].find(([n]) => /app\/.*index|app\/index/.test(n) || n.endsWith('P.tsx'))?.[1] ?? '';
    const lecteur = fichier(fichiers, 'humalis/lecteur.tsx');
    expect(lecteur).toContain("from 'expo-audio'");
    expect(lecteur).toContain("accessibilityLabel={etat.playing ? 'Pause' : 'Lecture'}");
    expect(lecteur).not.toMatch(/autoPlay|\.play\(\);\s*\n\s*useEffect/);
    expect(JSON.parse(fichier(fichiers, 'package.json')).dependencies['expo-audio']).toBe('57.0.5');
    expect(fichiers.has('assets/audio/extrait.mp3')).toBe(true);
    expect([...fichiers.values()].join('\n')).toContain(`<Lecteur source={require("../assets/audio/extrait.mp3")} description="Extrait de la chanson" boucle />`);
    void page;
  });
  it('sans son, ni lecteur ni dépendance', () => {
    const fichiers = mobile('page "p" :\n    texte "a"');
    expect(fichiers.has('humalis/lecteur.tsx')).toBe(false);
    expect(fichier(fichiers, 'package.json')).not.toContain('expo-audio');
  });
});
