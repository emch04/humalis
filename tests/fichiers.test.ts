import { describe, it, expect } from 'vitest';
import { compiler } from './aide-qualite.js';
import { compilerProjet } from './aide-qualite.js';
import { programme } from './analyse/aide.js';

/** Un disque en mémoire : chemin → contenu. */
const disque = (fichiers: Record<string, string>) => (chemin: string) => fichiers[chemin];
const messages = (r: { diagnostics: { gravite: string; ligne: number; message: string; fichier?: string }[] }) =>
  r.diagnostics.map((d) => `${d.fichier ?? '·'}:${d.ligne} ${d.gravite} : ${d.message}`);

const BOUTIQUE = programme(
  'utiliser fichier "./panier.humalis"',
  '',
  'page "boutique" :',
  '>titre "Nos produits"',
  '>bouton "Ajouter"',
  '>quand l\'utilisateur clique sur "Ajouter" :',
  '>>ajouter "Livre" à panier',
  '>lien "Voir le panier" vers "panier"',
);
const PANIER = programme(
  'variable panier = [] avec partagee',
  '',
  'page "panier" :',
  '>texte "Votre panier"',
  '>pour chaque nom dans panier :',
  '>>texte nom',
  '>lien "Retour" vers "boutique"',
);

describe('plusieurs fichiers — « utiliser fichier "…" »', () => {
  it('réunit les pages et les variables partagées des deux fichiers', () => {
    const r = compilerProjet('app/boutique.humalis', disque({ 'app/boutique.humalis': BOUTIQUE, 'app/panier.humalis': PANIER }));
    expect(messages(r)).toEqual([]);
    expect(r.application!.ecrans.map((e) => e.nom)).toEqual(['boutique', 'panier']);
    expect(r.application!.partages.map((p) => p.nom)).toEqual(['panier']);
    expect(r.fichiers).toEqual(['boutique.humalis', 'panier.humalis']);
  });

  it('garde les identifiants tirés des lignes de chaque fichier', () => {
    const r = compilerProjet('app/boutique.humalis', disque({ 'app/boutique.humalis': BOUTIQUE, 'app/panier.humalis': PANIER }));
    const panier = r.application!.ecrans.find((e) => e.nom === 'panier')!;
    expect(JSON.stringify(panier.vue)).toContain('"texte_ligne_6"');
    expect(JSON.stringify(panier.vue)).not.toContain('ligne_100000');
  });

  it('situe une erreur dans le fichier utilisé, à sa ligne', () => {
    const casse = PANIER.replace('texte nom', 'texte prix');
    const r = compilerProjet('app/boutique.humalis', disque({ 'app/boutique.humalis': BOUTIQUE, 'app/panier.humalis': casse }));
    expect(r.application).toBeUndefined();
    expect(messages(r)).toEqual([
      'panier.humalis:6 erreur : la variable « prix » n\'est pas déclarée. Déclarez-la avec : variable prix = … Si c\'est un texte, mettez-le entre guillemets : texte \"prix\"',
    ]);
  });

  it('situe une faute d’écriture dans le fichier utilisé', () => {
    const r = compilerProjet('app/boutique.humalis', disque({ 'app/boutique.humalis': BOUTIQUE, 'app/panier.humalis': 'page "panier" :\n\ttexte \"x\"' }));
    expect(messages(r)[0]).toMatch(/^panier\.humalis:2 erreur : /);
  });

  it('cherche les fichiers à côté de celui qui les utilise', () => {
    const r = compilerProjet(
      'app/boutique.humalis',
      disque({
        'app/boutique.humalis': programme('utiliser fichier "./pages/panier.humalis"', '', 'page "boutique" :', '>texte "Bonjour"'),
        'app/pages/panier.humalis': programme('utiliser fichier "../commun.humalis"', '', 'page "panier" :', '>texte "{total}"'),
        'app/commun.humalis': programme('variable total = 0 avec partagee'),
      }),
    );
    expect(messages(r)).toEqual([]);
    expect(r.fichiers).toEqual(['boutique.humalis', 'pages/panier.humalis', 'commun.humalis']);
  });

  it('recopie les chemins CSS et React d’un fichier utilisé à partir du fichier principal', () => {
    const r = compilerProjet(
      'app/boutique.humalis',
      disque({
        'app/boutique.humalis': programme('utiliser fichier "./pages/vitrine.humalis"', '', 'page "boutique" :', '>texte "Bonjour"'),
        'app/pages/vitrine.humalis': programme(
          'utiliser style "./vitrine.css"',
          'utiliser composant "Carte" depuis "../composants/Carte"',
          '',
          'page "vitrine" :',
          '>Carte avec titre "Bienvenue"',
        ),
      }),
    );
    expect(messages(r)).toEqual([]);
    expect(r.application!.fichiersStyle.map((f) => f.chemin)).toEqual(['pages/vitrine.css']);
    expect(r.application!.composantsReact.map((c) => c.chemin)).toEqual(['composants/Carte']);
  });

  it('n’utilise un fichier qu’une fois, même demandé deux fois', () => {
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': programme('utiliser fichier "./b.humalis"', 'utiliser fichier "./c.humalis"', '', 'page "a" :', '>texte "{n}"'),
        'b.humalis': programme('utiliser fichier "./d.humalis"', '', 'page "b" :', '>texte "b"'),
        'c.humalis': programme('utiliser fichier "./d.humalis"', '', 'page "c" :', '>texte "c"'),
        'd.humalis': programme('variable n = 1 avec partagee'),
      }),
    );
    expect(messages(r)).toEqual([]);
    expect(r.application!.partages).toHaveLength(1);
  });

  it('refuse un fichier introuvable, à la ligne du « utiliser »', () => {
    const r = compilerProjet('app/boutique.humalis', disque({ 'app/boutique.humalis': BOUTIQUE }));
    expect(messages(r)).toContain(
      '·:1 erreur : le fichier « ./panier.humalis » est introuvable (cherché à côté de boutique.humalis, sous app/panier.humalis).',
    );
  });

  it('refuse des fichiers qui s’utilisent en boucle', () => {
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': programme('utiliser fichier "./b.humalis"', '', 'page "a" :', '>texte "a"'),
        'b.humalis': programme('utiliser fichier "./a.humalis"', '', 'page "b" :', '>texte "b"'),
      }),
    );
    expect(messages(r)).toEqual([
      'b.humalis:1 erreur : les fichiers s\'utilisent en boucle : a.humalis → b.humalis → a.humalis. Retirez l\'un des « utiliser fichier ».',
    ]);
  });

  it('refuse une page déclarée dans deux fichiers', () => {
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': programme('utiliser fichier "./b.humalis"', '', 'page "accueil" :', '>texte "a"'),
        'b.humalis': programme('page "accueil" :', '>texte "b"'),
      }),
    );
    expect(messages(r)).toEqual(['b.humalis:1 erreur : la page « accueil » est déjà déclarée (ligne 3 de a.humalis).']);
  });

  it('refuse deux serveurs dans la même application (G5)', () => {
    const serveur = (nom: string) => programme(`serveur "${nom}" :`, '>donnee note :', '>>valeur : nombre', '>route "notes" :', '>>tout le monde peut lire note', '>>seul admin peut modifier note');
    const r = compilerProjet(
      'a.humalis',
      disque({ 'a.humalis': 'utiliser fichier "./b.humalis"\n\n' + serveur('un'), 'b.humalis': serveur('deux') }),
    );
    expect(messages(r)).toEqual([
      'b.humalis:1 erreur : un seul serveur par application : le serveur « un » est déjà déclaré (ligne 3 de a.humalis). Mets ses données et ses routes dans ce même bloc.',
    ]);
  });

  it('sans disque (compiler seul), un « utiliser fichier » est introuvable', () => {
    expect(compiler(BOUTIQUE).diagnostics.map((d) => d.message)).toContain(
      'le fichier « ./panier.humalis » est introuvable (cherché à côté de ce fichier, sous panier.humalis).',
    );
  });

  it('rend aussi les lignes citées dans un message à leur fichier', () => {
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': programme('utiliser fichier "./b.humalis"', '', 'variable total = 0 avec partagee', '', 'page "a" :', '>texte "{total}"'),
        'b.humalis': programme('variable total = 1 avec partagee', '', 'page "b" :', '>texte "b"'),
      }),
    );
    expect(messages(r).join('\n')).toContain('existe déjà (ligne 3 de a.humalis)');
    expect(messages(r).join('\n')).not.toMatch(/\d{6,}/);
  });

  it('refuse un composant défini dans deux fichiers', () => {
    const fiche = (texte: string) => programme('composant "Fiche" :', '>parametre nom', `>texte "${texte} {nom}"`);
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': 'utiliser fichier "./b.humalis"\n\n' + fiche('A') + '\n\n' + programme('page "a" :', '>Fiche avec nom "x"'),
        'b.humalis': fiche('B'),
      }),
    );
    expect(messages(r)).toEqual(['b.humalis:1 erreur : le composant « Fiche » est déjà défini (ligne 3 de a.humalis).']);
  });
});

import { genererProjetWeb, nomsDesStyles } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';

describe('plusieurs fichiers — les fichiers de style', () => {
  it('ne laisse jamais deux fichiers de style s’écraser', () => {
    expect([...nomsDesStyles(['style.css', 'pages/style.css', 'theme.css']).values()]).toEqual(['style.css', 'pages-style.css', 'theme.css']);
    expect(nomsDesStyles(['style.css'], ['style.css']).get('style.css')).toBe('2-style.css');
  });

  it('copie les deux feuilles d’un projet en deux fichiers, et garde le CSS des blocs « style : »', () => {
    const r = compilerProjet(
      'a.humalis',
      disque({
        'a.humalis': programme('style :', '>.a { color: red; }', '', 'utiliser style "style.css"', 'utiliser fichier "./pages/b.humalis"', '', 'page "a" :', '>texte "a"'),
        'pages/b.humalis': programme('utiliser style "style.css"', '', 'page "b" :', '>texte "b"'),
      }),
    );
    expect(messages(r)).toEqual([]);
    const fichiersStyle = new Map([['style.css', '/* a */'], ['pages/style.css', '/* b */']]);
    const web = genererProjetWeb(r.application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis', fichiersStyle });
    expect(web.get('src/styles/style.css')).toContain('.a { color: red; }');
    expect([...web.keys()].filter((f) => f.startsWith('src/styles/')).sort()).toEqual(['src/styles/2-style.css', 'src/styles/pages-style.css', 'src/styles/style.css']);
    const statique = genererProjetStatique(r.application!, { nom: 'a', source: 'a.humalis', fichiersStyle });
    expect(statique.get('styles/style.css')).toContain('.a { color: red; }');
    expect(statique.get('styles/pages-style.css')).toBe('/* b */');
  });
});
