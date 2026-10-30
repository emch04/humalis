import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>prix : nombre',
  '>donnee avis :',
  '>>note : nombre',
  '>>commentaire : texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
  '>route "avis" :',
  '>>tout le monde peut lire avis',
  '>>connecte peut creer avis',
  '',
];

const page = (...lignes: string[]) =>
  programme(...SERVEUR, 'page "boutique" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "produits" dans produits', ...lignes);

describe('lien — parser', () => {
  it('lit « p.nom »', () => {
    const corps = analyserSyntaxe(analyser('page "a" :\n    texte p.nom')).pages[0].corps;
    expect(corps[0]).toMatchObject({
      type: 'Element',
      contenu: { type: 'AccesChamp', objet: { type: 'Reference', nom: 'p' }, champ: 'nom' },
    });
  });
});

describe('lien — analyse', () => {
  it('accepte une page qui lit les produits de son serveur', () => {
    expect(erreurs(page('>pour chaque p dans produits :', '>>texte p.nom', '>>texte "{p.prix} €"'))).toEqual([]);
  });

  it('refuse un champ qui n’existe pas dans la donnée', () => {
    expect(erreurs(page('>pour chaque p dans produits :', '>>texte p.prixx'))).toEqual([
      '20 : le champ « prixx » n\'existe pas dans la donnée « produit ». Champs : nom, prix. Peut-être « prix » ?',
    ]);
  });

  it('refuse un champ inconnu dans un texte', () => {
    expect(erreurs(page('>pour chaque p dans produits :', '>>texte "{p.nom_complet}"'))).toEqual([
      '20 : le champ « nom_complet » n\'existe pas dans la donnée « produit ». Champs : nom, prix.',
    ]);
  });

  it('vérifie le type d’un champ', () => {
    expect(erreurs(page('>pour chaque p dans produits :', '>>si p.nom est superieur a 10 :', '>>>texte "cher"'))).toEqual([
      '20 : « p.nom » est un texte ; « est supérieur à » compare des nombres.',
    ]);
  });

  it('refuse une route qui n’existe pas', () => {
    expect(erreurs(page().replace('vers "produits"', 'vers "produit"'))).toEqual([
      '18 : aucune route « produit » dans le serveur « boutique ». Routes : produits, avis.',
    ]);
  });

  it('accepte les adresses avec /, ou avec /api/', () => {
    expect(erreurs(page().replace('vers "produits"', 'vers "/api/produits"'))).toEqual([]);
    expect(erreurs(page().replace('vers "produits"', 'vers "/produits"'))).toEqual([]);
  });

  it('vérifie les champs envoyés', () => {
    const source = programme(
      ...SERVEUR,
      'page "avis" :',
      '>variable note = 5',
      '>champ "commentair"',
      '>bouton "Envoyer"',
      '>quand utilisateur clique sur "Envoyer" :',
      '>>envoyer requete vers "avis" avec note et champ "commentair"',
    );
    expect(erreurs(source)).toEqual([
      '20 : la donnée « avis » n\'a pas de champ « commentair ». Champs : note, commentaire. Peut-être « commentaire » ?',
    ]);
  });

  it('avertit qu’une requête sera refusée à un visiteur', () => {
    const source = programme(
      ...SERVEUR,
      'page "avis" :',
      '>variable note = 5',
      '>champ "commentaire"',
      '>bouton "Envoyer"',
      '>quand utilisateur clique sur "Envoyer" :',
      '>>envoyer requete vers "avis" avec note et champ "commentaire"',
    );
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toContain(
      '20 : il faut être connecté pour créer « avis » : cette requête sera refusée à un visiteur.',
    );
  });

  it('ne change rien sans serveur dans le fichier', () => {
    expect(erreurs(programme('page "a" :', '>variable l = []', '>quand la page se charge :', '>>envoyer requete vers "/n/importe" dans l'))).toEqual([]);
  });
});

describe('lien — cible web', () => {
  const source = page('>pour chaque p dans produits :', '>>texte p.nom', '>>texte "{p.prix} €"');
  const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'boutique', adresse: 'http://localhost', source: 'b.humalis' });
  const boutique = fichiers.get('src/pages/Boutique.tsx')!;

  it('type la liste avec l’interface de la donnée', () => {
    expect(boutique).toContain("import type { Produit } from '../humalis/donnees';");
    expect(boutique).toContain('useState<Produit[]>([])');
    expect(fichiers.get('src/humalis/donnees.ts')).toContain('export interface Produit {');
  });

  it('lit les champs et appelle la vraie adresse du serveur', () => {
    expect(boutique).toContain('<p data-humalis="texte_ligne_20">{p.nom}</p>');
    expect(boutique).toContain("{`${formaterNombre(p.prix)} €`}");
    expect(boutique).toContain("setProduits(await serveur.lire('/api/produits', produits));");
  });

  it('relaie /api et /auth vers le serveur en développement', () => {
    const vite = fichiers.get('vite.config.ts')!;
    expect(vite).toContain("'/api': cible");
    expect(vite).toContain("'/auth': cible");
    expect(vite).toContain('preview: { proxy }');
  });

  it('envoie le jeton CSRF du pack', () => {
    expect(fichiers.get('src/humalis/serveur.ts')).toContain("'x-csrf-token'");
    expect(fichiers.get('src/humalis/serveur.ts')).toContain('astratra_csrf');
    expect(fichiers.get('src/humalis/serveur.ts')).toContain('Array.isArray(actuelle) && !Array.isArray(valeur)');
  });

  it('une page qui porte le nom de sa donnée ne cache pas l’interface', () => {
    const source = programme(...SERVEUR, 'page "avis" :', '>variable avis = []', '>quand la page se charge :', '>>envoyer requete vers "avis" dans avis');
    const code = genererProjetWeb(compiler(source).application!, { nom: 'avis', adresse: 'http://localhost', source: 'a.humalis' }).get('src/pages/Avis.tsx')!;
    expect(code).toContain("import type { Avis } from '../humalis/donnees';");
    expect(code).toContain('export default function PageAvis() {');
    expect(code).toContain('useState<Avis[]>([])');
  });

  it('n’importe pas une interface que la page n’utilise pas, même si elle porte son nom', () => {
    const source = programme(...SERVEUR, 'page "avis" :', '>texte "Bonjour"');
    const code = genererProjetWeb(compiler(source).application!, { nom: 'avis', adresse: 'http://localhost', source: 'a.humalis' }).get('src/pages/Avis.tsx')!;
    expect(code).not.toContain('donnees');
    expect(code).toContain('export default function Avis() {');
  });
});
