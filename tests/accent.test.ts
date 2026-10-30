import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { compiler } from '../src/compilateur.js';

describe('accent dans un texte', () => {
  it('découpe le texte et conserve les guillemets internes', () => {
    const chaine = analyser('titre "Un {accent "mot"} utile"').find((t) => t.type === 'CHAINE');
    expect(chaine?.parties).toEqual([{ type: 'texte', valeur: 'Un ' }, { type: 'accent', valeur: 'mot' }, { type: 'texte', valeur: ' utile' }]);
  });

  it('refuse un accent sans guillemets avec sa ligne', () => {
    expect(() => analyser('titre "Un {accent mot}"')).toThrow(/Ligne 1.*accent.*guillemets/i);
  });
});

const source = (lignes: string[]) => lignes.join('\n');
const page = (titre: string) => source(['page "accueil" :', `    titre "${titre}"`, '    soustitre "Un {accent "détail"}"', '    texte "Prix : {accent "gratuit"} pour toujours"']);
const application = (code: string) => {
  const resultat = compiler(code);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!;
};

describe('accent dans les cibles', async () => {
  const { genererProjetWeb } = await import('../src/cibles/web/projet.js');
  const { genererProjetDesktop } = await import('../src/cibles/desktop/projet.js');
  const { genererProjetStatique } = await import('../src/cibles/statique/projet.js');
  const { genererProjetMobile } = await import('../src/cibles/mobile/projet.js');
  const options = { nom: 'a', adresse: 'https://exemple.test', source: 'a.humalis' };

  it('porte le texte et son marqueur dans la représentation intermédiaire', () => {
    const a = application(page('Un {accent "mot"} utile'));
    const titre = a.ecrans[0].vue.find((n) => n.type === 'element' && n.genre === 'titre');
    expect(titre?.type === 'element' && titre.contenu).toMatchObject({ parties: [{ texte: 'Un ' }, { texte: 'mot', accent: true }, { texte: ' utile' }] });
  });

  it('écrit les spans sur le web, le bureau et le statique', () => {
    const a = application(page('Un {accent "mot"} utile'));
    const web = genererProjetWeb(a, options);
    const bureau = genererProjetDesktop(a, { nom: 'a', source: 'a.humalis' });
    const tsx = web.get('src/pages/Accueil.tsx')!;
    expect(tsx).toContain('<span className="humalis-accent">');
    expect(bureau.get('src/pages/Accueil.tsx')).toBe(tsx);
    expect([...web.values()].join('\n')).toContain('.humalis-accent { color: var(--humalis-marque, currentColor); }');
    const statique = genererProjetStatique(a, { nom: 'a', source: 'a.humalis' });
    expect(statique.get('index.html')).toContain('<span class="humalis-accent">mot</span>');
    expect([...statique.values()].join('\n')).toContain("creer('span', { class: 'humalis-accent' }");
  });

  it('écrit un Text imbriqué sur mobile', () => {
    const mobile = genererProjetMobile(application(page('Un {accent "mot"} utile')), { nom: 'a', source: 'a.humalis' });
    expect(mobile.get('app/index.tsx')).toContain('<Text style={s.accent}>');
    expect(mobile.get('humalis/styles.ts')).toContain("accent: { fontWeight: '700' }");
  });

  it('choisit les bons accents par langue', () => {
    const code = source(['langues :', '    francais', '    anglais', '', 'page "accueil" :', '    titre "Un {accent "mot"}" en anglais "One {accent "word"}"']);
    const a = application(code);
    expect(genererProjetWeb(a, options).get('src/pages/Accueil.tsx')).toContain("langue === 'en'");
    expect(genererProjetStatique(a, { nom: 'a', source: 'a.humalis' }).get('index.html')).toContain('<span class="humalis-accent">mot</span>');
    expect([...genererProjetStatique(a, { nom: 'a', source: 'a.humalis' }).values()].join('\n')).toContain("langue() === 'en'");
    expect(genererProjetMobile(a, { nom: 'a', source: 'a.humalis' }).get('app/index.tsx')).toContain('word');
  });

  it('refuse accent hors des trois éléments autorisés', () => {
    const resultat = compiler(source(['page "accueil" :', '    titre "Accueil"', '    bouton "Un {accent "mot"}"']));
    expect(resultat.diagnostics.map((d) => d.message).join('\n')).toMatch(/accent s’emploie seulement/);
  });

  it('garde le code sans accent identique', () => {
    const code = source(['page "accueil" :', '    titre "Accueil"']);
    const fichiers = genererProjetWeb(application(code), options);
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('>Accueil</h1>');
    expect([...fichiers.values()].join('\n')).not.toContain('humalis-accent');
  });
});
