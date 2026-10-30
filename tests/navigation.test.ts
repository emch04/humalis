import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { verifierNavigationPourLaCible } from '../src/cibles/sources.js';
import { programme, erreurs } from './analyse/aide.js';

const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));
const SESSION = ['source "api" :', '>adresse "https://api.exemple.cd"', '>session astratra', ''];
const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'site', adresse: 'http://localhost', source: 's.humalis' });

describe('navigation — parseur', () => {
  it("lit l'adresse choisie, et le « :slug » déclare le paramètre", () => {
    const [page] = lire('page "collection" a l\'adresse "/collections/:slug" :', '>titre "x"').pages;
    expect(page.adresse).toBe('/collections/:slug');
    expect(page.parametres).toEqual(['slug']);
  });

  it('lit « reservee a connecte sinon vers » avant « avec parametre »', () => {
    const [page] = lire('page "commande" reservee a admin sinon vers "connexion" avec parametre id :', '>titre "x"').pages;
    expect(page.reservee).toMatchObject({ qui: 'admin', sinon: 'connexion' });
    expect(page.parametres).toEqual(['id']);
  });

  it('refuse « reservee » suivi d\'un autre mot', () => {
    expect(() => lire('page "a" reservee a tous :', '>titre "x"')).toThrow(/« connecte » ou de « admin »/);
  });

  it('une page sans nouveauté se lit comme avant', () => {
    const [page] = lire('page "produit" avec parametre id :', '>titre "x"').pages;
    expect(page.adresse).toBeUndefined();
    expect(page.reservee).toBeUndefined();
    expect(page.parametres).toEqual(['id']);
  });

  it('lit « continuer vers » comme une redirection qui revient à la page voulue', () => {
    const [page] = lire('page "a" :', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>continuer vers "accueil"').pages;
    const evenement = page.corps[1] as { corps: { action: string; continuer?: boolean }[] };
    expect(evenement.corps[0]).toMatchObject({ action: 'rediriger', continuer: true });
  });
});

describe('navigation — analyse', () => {
  it('accepte une page réservée avec une session et une page de connexion', () => {
    expect(erreurs(programme(...SESSION, 'page "compte" reservee a connecte :', '>titre "C"', 'page "connexion" :', '>titre "K"'))).toEqual([]);
  });

  it('refuse deux pages à la même adresse, et une adresse sans /', () => {
    expect(erreurs(programme('page "a" adresse "/x" :', '>titre "A"', 'page "b" adresse "/x" :', '>titre "B"')).join('\n')).toMatch(/déjà celle de la page « a »/);
    expect(erreurs(programme('page "a" adresse "x" :', '>titre "A"')).join('\n')).toMatch(/doit commencer par \//);
  });

  it('une page réservée demande une session et une page de renvoi', () => {
    expect(erreurs(programme('page "c" reservee a connecte sinon vers "a" :', '>titre "C"', 'page "a" :', '>titre "A"')).join('\n')).toMatch(/demande une session/);
    expect(erreurs(programme(...SESSION, 'page "c" reservee a connecte :', '>titre "C"')).join('\n')).toMatch(/écrivez une page « connexion »/);
    expect(erreurs(programme(...SESSION, 'page "c" reservee a connecte sinon vers "z" :', '>titre "C"')).join('\n')).toMatch(/« z », qui n'existe pas/);
  });

  it('refuse de renvoyer vers une page elle-même réservée', () => {
    const src = programme(...SESSION, 'page "a" reservee a connecte sinon vers "b" :', '>titre "A"', 'page "b" reservee a connecte sinon vers "a" :', '>titre "B"');
    expect(erreurs(src).join('\n')).toMatch(/tourneraient en rond/);
  });

  it('la page 404 est sans adresse, sans paramètre et sans réservation', () => {
    expect(erreurs(programme('page "introuvable" adresse "/x" :', '>titre "x"')).join('\n')).toMatch(/est la page 404/);
  });
});

describe('navigation — code web', () => {
  const source = programme(
    ...SESSION,
    'page "accueil" :', '>titre "A"',
    'page "compte" adresse "/mon/compte" reservee a connecte :', '>titre "C"',
    'page "connexion" :', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>continuer vers "accueil"',
    'page "introuvable" :', '>titre "Perdu"',
  );

  it('enveloppe la page réservée dans la garde, à son adresse choisie', () => {
    const fichiers = web(source);
    const main = fichiers.get('src/main.tsx')!;
    expect(main).toContain('<Reservee qui="connecte" sinon="/connexion" />');
    expect(main).toContain('path="/mon/compte"');
    expect(fichiers.get('src/humalis/reservee.tsx')).toContain('<Navigate to={sinon} replace state=');
  });

  it("la page 404 écrite remplace celle de Humalis, et n'est pas prérendue", () => {
    const fichiers = web(source);
    expect(fichiers.get('src/main.tsx')).toContain("import Introuvable from './pages/Introuvable';");
    expect(fichiers.has('src/Introuvable.tsx')).toBe(false);
    expect(fichiers.get('astratra.prerender.config.cjs')).not.toContain('introuvable');
    expect(fichiers.get('astratra.prerender.config.cjs')).not.toContain('/mon/compte');
  });

  it("« continuer » ne suit qu'une adresse du site (jamais https:// ni //)", () => {
    const fichiers = web(source);
    expect(fichiers.get('src/pages/Connexion.tsx')).toContain('apresLaGarde(location.state) ??');
    const garde = fichiers.get('src/humalis/reservee.tsx')!;
    expect(garde).toContain("apres.startsWith('/') && !apres.startsWith('//')");
  });

  it("la session d'une source se lit à l'adresse de la source, avec ses cookies", () => {
    const session = web(source).get('src/humalis/session.tsx')!;
    expect(session).toContain('VITE_HUMALIS_SOURCE_API');
    expect(session).toContain("credentials: 'include'");
  });

  it('un programme sans nouveauté ne produit pas de garde', () => {
    expect(web('page "a" :\n    titre "x"').has('src/humalis/reservee.tsx')).toBe(false);
  });

  it("le mobile et le statique refusent clairement une page réservée ou une adresse choisie", () => {
    const application = compiler(source).application!;
    const messages = verifierNavigationPourLaCible(application, 'mobile').map((d) => d.message).join('\n');
    expect(messages).toMatch(/Une adresse choisie \(page « compte »\)/);
    expect(messages).toMatch(/Une page réservée/);
    expect(messages).toMatch(/« continuer vers »/);
  });
});

describe('navigation — avec l’en-tête et le pied communs', () => {
  it('une page réservée garde sa garde dans la disposition ; « sans entete » la sort du groupe', () => {
    const fichiers = web(programme(...SESSION,
      'entete :', '>lien "Accueil" vers "accueil"', '',
      'page "accueil" :', '>titre "A"',
      'page "compte" reservee a connecte :', '>titre "C"',
      'page "connexion" sans entete :', '>titre "K"'));
    const main = fichiers.get('src/main.tsx')!;
    expect(main).toContain("import Disposition from './Disposition';");
    expect(main).toContain("import { Reservee } from './humalis/reservee';");
    expect(main).toMatch(/<Route element=\{<Disposition pied=\{false\} \/>\}>[\s\S]*<Route element=\{<Reservee qui="connecte" sinon="\/connexion" \/>\}>\n\s+<Route path="\/compte" element=\{<Compte \/>\} \/>\n\s+<\/Route>[\s\S]*<\/Route>/);
    expect(main).toMatch(/<Route path="\/connexion" element=\{<Connexion \/>\} \/>/);
  });
});
