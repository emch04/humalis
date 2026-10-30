import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { verifierPourLeMobile } from '../../src/cibles/mobile/projet.js';
import { decrireTouches } from '../../src/cibles/web/interactions.js';
import { lireTouches } from '../../src/analyse/interactions.js';
import { p, corps, web, statique, mobile, compile, fichier, erreurs, avertissements } from './aide.js';

const PAGE = p(
  '>variable aide = faux',
  '>titre "Catalogue"',
  '>champ "recherche" avec indice "Chercher" et raccourci "/"',
  '>bouton "Ajouter" avec raccourci "controle+maj+a"',
  '>quand l\'utilisateur clique sur "Ajouter" :',
  '>>afficher "Ajouté"',
  '>quand l\'utilisateur appuie sur "controle+k" :',
  '>>changer aide par vrai',
  '>quand l\'utilisateur appuie sur "echap" :',
  '>>changer aide par faux',
  '>quand l\'utilisateur appuie sur "entree" dans "recherche" :',
  '>>afficher "Recherche lancée"',
  '>si aide est vrai :',
  '>>texte "Tape / pour chercher."',
);

describe('raccourcis — les touches', () => {
  it('lit et normalise les touches, refuse celles qui n’existent pas', () => {
    expect(lireTouches('Contrôle+Maj+A')).toEqual({ touches: 'controle+maj+a' });
    expect(lireTouches('maj+controle+k')).toEqual({ touches: 'controle+maj+k' });
    expect(lireTouches('ctrl-k')).toHaveProperty('erreur');
    expect((lireTouches('ctrl+k') as { erreur: string }).erreur).toMatch(/écrivez « controle »/);
  });
  it('décrit les touches pour le lecteur d’écran et pour l’œil', () => {
    expect(decrireTouches('controle+maj+a')).toEqual({ aria: 'Control+Shift+A Meta+Shift+A', texte: 'Ctrl+Maj+A' });
    expect(decrireTouches('echap')).toEqual({ aria: 'Escape', texte: 'Échap' });
  });
});

describe('raccourcis — le parser et l’analyse', () => {
  it('lit l’événement, « dans » et l’option', () => {
    const instructions = corps(PAGE) as any[];
    expect(instructions.filter((i) => i.type === 'Evenement' && i.genre === 'touche').map((e) => [e.touches, e.cible])).toEqual([
      ['controle+k', undefined],
      ['echap', undefined],
      ['entree', 'recherche'],
    ]);
    expect(instructions.find((i) => i.element === 'bouton').raccourci).toBe('controle+maj+a');
  });
  it('accepte l’exemple', () => {
    expect(erreurs(PAGE)).toEqual([]);
    expect(avertissements(PAGE)).toEqual([]);
  });
  it('refuse une touche inconnue, un raccourci en double, un raccourci sur un texte', () => {
    expect(erreurs(p('>quand l\'utilisateur appuie sur "ctrl+k" :', '>>afficher "a"'))[0]).toMatch(/la touche « ctrl » n’existe pas/);
    expect(erreurs(p('>bouton "A" avec raccourci "controle+k"', '>quand l\'utilisateur appuie sur "controle+k" :', '>>afficher "a"'))[0]).toMatch(/déjà pris dans cette page/);
    expect(erreurs(p('>texte "Bonjour" avec raccourci "controle+b"'))[0]).toMatch(/s’applique à un bouton, un lien ou un champ/);
  });
  it('avertit d’une touche du navigateur et d’une lettre seule', () => {
    expect(avertissements(p('>quand l\'utilisateur appuie sur "controle+w" :', '>>afficher "a"'))[0]).toMatch(/gardé par le navigateur/);
    expect(avertissements(p('>quand l\'utilisateur appuie sur "k" :', '>>afficher "a"'))[0]).toMatch(/une seule lettre/);
  });
});

describe('raccourcis — les cibles', () => {
  it('RI : le déclencheur « touche », les touches canoniques, l’élément visé', () => {
    const ecran = compiler(PAGE).application!.ecrans[0];
    expect(ecran.gestionnaires.filter((g) => g.declencheur === 'touche').map((g) => [g.touches, g.cibles])).toEqual([
      ['controle+k', []],
      ['echap', []],
      ['entree', ['champ_recherche']],
    ]);
  });
  it('web : un seul écouteur (useRaccourcis), aria-keyshortcuts et title sur l’élément', () => {
    const fichiers = web(PAGE);
    const page = fichier(fichiers, 'pages/P.tsx');
    expect(page).toContain("['/', () => focaliser('champ_recherche')],");
    expect(page).toContain("['controle+maj+a', () => cliquer('bouton_ajouter')],");
    expect(page).toContain("['controle+k', quandAppuieControleK],");
    expect(page).toContain("['entree', quandAppuieEntree, 'champ_recherche'],");
    expect(page).toContain('aria-keyshortcuts="Control+Shift+A Meta+Shift+A" title="Ajouter (Ctrl+Maj+A)"');
    expect(page).toContain("import { useRaccourcis, cliquer, focaliser } from '../humalis/clavier';");
    const clavier = fichier(fichiers, 'humalis/clavier.ts');
    expect(clavier).toContain('evenement.ctrlKey || evenement.metaKey');
    expect(clavier).toContain('if (evenement.repeat || evenement.isComposing) return;');
    expect(clavier).toContain("document.querySelector('dialog[open]')");
  });
  it('mobile : rien de produit, un avertissement', () => {
    const page = fichier(mobile(PAGE), 'app/index.tsx');
    expect(page).not.toContain('useRaccourcis');
    expect(page).not.toContain('quandAppuie');
    expect(verifierPourLeMobile(compile(PAGE)).map((d) => d.message).join('\n')).toMatch(/raccourcis clavier sont ignorés sur le mobile/);
  });
  it('statique : l’écouteur de humalis.js, les mêmes attributs dans le HTML de départ', () => {
    const fichiers = statique(PAGE);
    const page = fichier(fichiers, 'pages/p.js');
    expect(page).toContain('const raccourcis = [');
    expect(page).toContain("['controle+maj+a', () => cliquer('bouton_ajouter')],");
    expect(page).toContain('humalis.demarrer({ dessiner, raccourcis });');
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('function ecouterLesRaccourcis(evenement)');
    expect(fichier(fichiers, 'index.html')).toContain('aria-keyshortcuts="Control+Shift+A Meta+Shift+A" title="Ajouter (Ctrl+Maj+A)"');
  });
});
