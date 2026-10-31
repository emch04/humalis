import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';

// Le code dans une phrase entre accents graves, comme dans toutes les documentations :
// « Écris `titre "Bonjour"` » revient à « Écris {code "titre "Bonjour""} » (décision d'Emch).
const parties = (texte: string) => analyser(`texte ${texte}`).find((t) => t.type === 'CHAINE')?.parties;

describe('le code entre accents graves', () => {
  it('découpe le code d’une phrase, comme {code "…"}', () => {
    expect(parties('"Écris `titre` pour commencer."')).toEqual([
      { type: 'texte', valeur: 'Écris ' }, { type: 'code', valeur: 'titre' }, { type: 'texte', valeur: ' pour commencer.' },
    ]);
    expect(parties('"Écris `titre` pour commencer."')).toEqual(parties('"Écris {code "titre"} pour commencer."'));
  });

  it('garde tels quels les guillemets, les accolades et les antislashs du code', () => {
    expect(parties('"Écris `titre "Bonjour {nom}"` puis `a\\b`."')).toEqual([
      { type: 'texte', valeur: 'Écris ' }, { type: 'code', valeur: 'titre "Bonjour {nom}"' },
      { type: 'texte', valeur: ' puis ' }, { type: 'code', valeur: 'a\\b' }, { type: 'texte', valeur: '.' },
    ]);
  });

  it('laisse un accent grave seul tel quel', () => {
    expect(parties('"Un ` tout seul"')).toEqual([{ type: 'texte', valeur: 'Un ` tout seul' }]);
    expect(parties('"Rien entre deux : ``"')).toEqual([{ type: 'texte', valeur: 'Rien entre deux : ``' }]);
  });

  it('se traduit et s’affiche comme {code "…"}', () => {
    const avecAccents = compiler('langues :\n    francais\n    anglais\n\npage "a" :\n    titre "A" en anglais "A"\n    texte "Écris `titre "Bonjour"`." en anglais "Write `titre "Hello"`."\n');
    const avecCode = compiler('langues :\n    francais\n    anglais\n\npage "a" :\n    titre "A" en anglais "A"\n    texte "Écris {code "titre "Bonjour""}." en anglais "Write {code "titre "Hello""}."\n');
    expect(avecAccents.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const options = { nom: 'a', source: 'a.humalis', adresse: 'https://exemple.test' };
    expect(genererProjetWeb(avecAccents.application!, options).get('src/pages/A.tsx')).toBe(genererProjetWeb(avecCode.application!, options).get('src/pages/A.tsx'));
  });
});

describe('la couleur des textes dans un bloc de code', () => {
  it('colore tout le texte, même avec du code entre accents graves ou dans {code "…"}', async () => {
    const { colorerCodeHumalis } = await import('../src/cibles/commun/colorerCode.js');
    for (const ligne of ['texte "Écris `titre "Bonjour"` ici"', 'texte "Écris {code "titre "Bonjour""} ici"']) {
      const rendu = colorerCodeHumalis(ligne, 'humalis');
      const texte = /<span class="humalis-code-texte">([^<]*)<\/span>/.exec(rendu)?.[1];
      expect(texte?.replace(/&quot;/g, '"')).toBe(ligne.slice('texte '.length));
    }
  });
});
