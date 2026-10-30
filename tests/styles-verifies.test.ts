import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { compilerProjet } from '../src/fichiers.js';

const page = (classe: string) => `page "accueil" :\n    texte "Prix" avec style "${classe}"`;
const avertissements = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'avertissement' && d.categorie !== 'accessibilite');

describe('vérification des styles CSS', () => {
  it('signale un style introuvable et suggère le plus proche', () => {
    expect(avertissements(`style :\n    .prix { color: red; }\n${page('prixx')}`)).toMatchObject([{ ligne: 4, message: expect.stringContaining('Peut-être « prix » ?') }]);
  });
  it('signale aussi sans suggestion et sans aucun CSS', () => {
    expect(avertissements(page('absent'))).toMatchObject([{ ligne: 2, message: expect.stringContaining('le style « absent »') }]);
  });
  it('vérifie chaque classe séparément', () => {
    expect(avertissements(`style :\n    .prix { color: red; }\n${page('prix perdu autre')}`).map((d) => d.message)).toEqual([
      expect.stringContaining('« perdu »'), expect.stringContaining('« autre »'),
    ]);
  });
  it('reconnaît les sélecteurs composés et les media queries', () => {
    expect(avertissements(`style :\n    @media (min-width: 10px) {\n        :is(.prix, .autre).actif { color: red; }\n    }\n${page('prix autre actif')}`)).toEqual([]);
  });
  it('lit un fichier CSS du projet en mémoire', () => {
    const source = `utiliser style "./site.css"\n${page('prixx')}`;
    const resultat = compilerProjet('site.humalis', (chemin) => ({ 'site.css': '.prix { color: red; }' })[chemin], source);
    expect(resultat.diagnostics.filter((d) => d.categorie !== 'accessibilite')).toMatchObject([{ ligne: 3, message: expect.stringContaining('Peut-être « prix » ?') }]);
  });
  it('ne signale aucune classe inconnue si un CSS est illisible', () => {
    expect(avertissements(`utiliser style "./site.css"\n${page('absent')}`)).toEqual([]);
  });
  it('signale !important sur une classe Humalis avec sa propriété et sa ligne', () => {
    const source = `utiliser style "./site.css"\n${page('prix')}`;
    const resultat = compilerProjet('site.humalis', (chemin) => ({ 'site.css': '.prix {}\n.humalis-page { padding: 0 !important; }' })[chemin], source);
    expect(resultat.diagnostics.filter((d) => d.categorie !== 'accessibilite')).toMatchObject([{ gravite: 'avertissement', fichier: 'site.css', ligne: 2, message: expect.stringContaining('humalis-page') }]);
    expect(resultat.diagnostics.find((d) => d.fichier === 'site.css')?.message).toContain('padding');
  });
  it('ignore !important sur une classe de l’auteur et une règle Humalis sans !important', () => {
    expect(avertissements(`style :\n    .prix { padding: 0 !important; }\n    .humalis-page { padding: 0; }\n${page('prix')}`)).toEqual([]);
  });
});
