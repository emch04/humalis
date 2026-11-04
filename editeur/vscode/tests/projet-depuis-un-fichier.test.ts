import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lireSurLeDisque, listerSurLeDisque, verifierAvec } from '../src/diagnostics.js';
import { completerSource } from '../src/langage/completion.js';
import { definir } from '../src/langage/definition.js';
import { indexer } from '../src/langage/portees.js';
import { lireProjet } from '../src/langage/projet.js';
import { survoler } from '../src/langage/survol.js';

/** Comme un vrai projet : un fichier principal, des pages dans un dossier imbriqué, le serveur à part. */
const FICHIERS: Record<string, string> = {
  'admin.humalis': `utiliser fichier "./serveur.humalis"
utiliser fichier "./pages/admin/menu.humalis"
utiliser fichier "./pages/admin/catalogue.humalis"

variable panier = 0 avec partagee

page "accueil" :
    titre "Accueil"
`,
  'serveur.humalis': `serveur "boutique" :
    donnee produit :
        nom : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`,
  'pages/admin/menu.humalis': `composant "MenuAdmin" :
    texte "Menu"
`,
  'pages/admin/catalogue.humalis': `composant "Local" :
    texte "Ici"

page "catalogue" :
    titre "Catalogue"
    MenuAdmin
    Local
    progression panier
    lien "Accueil" vers "accueil"
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
`,
  'seul.humalis': `page "seule" :
    titre "Seule"
    MenuAdmin
`,
};

function dansUnDossier<T>(essai: (racine: string) => T): T {
  const racine = mkdtempSync(join(tmpdir(), 'humalis-projet-'));
  try {
    for (const [chemin, contenu] of Object.entries(FICHIERS)) {
      mkdirSync(dirname(join(racine, chemin)), { recursive: true });
      writeFileSync(join(racine, chemin), contenu);
    }
    return essai(racine);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
}

const indexDe = (racine: string, fichier: string) =>
  indexer(lireProjet(FICHIERS[fichier], join(racine, fichier), lireSurLeDisque, [], listerSurLeDisque));

const lieu = (fichier: string, morceau: string, mot = morceau) => {
  const lignes = FICHIERS[fichier].split('\n');
  const k = lignes.findIndex((l) => l.includes(morceau));
  return { ligne: k + 1, colonne: lignes[k].indexOf(mot) + 1 };
};

describe('depuis un fichier utilisé, tout le projet est connu', () => {
  const CATALOGUE = 'pages/admin/catalogue.humalis';

  it.each([
    ['un composant d’un fichier voisin', '    MenuAdmin', 'MenuAdmin', 'pages/admin/menu.humalis', 1],
    ['une variable partagée du fichier principal', 'progression panier', 'panier', 'admin.humalis', 5],
    ['une page du fichier principal, par « vers »', 'vers "accueil"', '"accueil"', 'admin.humalis', 7],
    ['une route d’un autre fichier', 'vers "produits"', '"produits"', 'serveur.humalis', 4],
    ['un composant du fichier lui-même', '    Local', 'Local', CATALOGUE, 1],
  ])('%s', (_nom, morceau, mot, fichier, ligneAttendue) => {
    dansUnDossier((racine) => {
      const index = indexDe(racine, CATALOGUE);
      const { ligne, colonne } = lieu(CATALOGUE, morceau, mot);
      const cible = definir(index, ligne, colonne + 1);
      expect(cible?.fichier).toBe(join(racine, fichier));
      expect(cible?.ligne).toBe(ligneAttendue);
      expect(survoler(index, ligne, colonne + 1)?.markdown).toBeTruthy();
    });
  });

  it('le survol dit où est le composant, depuis ce dossier', () => {
    dansUnDossier((racine) => {
      const { ligne, colonne } = lieu(CATALOGUE, '    MenuAdmin', 'MenuAdmin');
      expect(survoler(indexDe(racine, CATALOGUE), ligne, colonne)?.markdown).toContain('menu.humalis, ligne 1');
    });
  });

  it('la complétion propose les composants, les pages et les variables du projet', () => {
    dansUnDossier((racine) => {
      const completer = (ajout: string) => {
        const source = FICHIERS[CATALOGUE] + ajout;
        const lignes = source.split('\n');
        const propositions = completerSource(source, lignes.length, lignes[lignes.length - 1].length + 1, join(racine, CATALOGUE), lireSurLeDisque, listerSurLeDisque).propositions;
        return propositions.map((p) => p.libelle);
      };
      expect(completer('    M')).toContain('MenuAdmin');
      expect(completer('    progression p')).toContain('panier');
      expect(completer('    lien "A" vers "')).toContain('accueil');
    });
  });

  it('le document ouvert reste le premier du projet, et le texte de l’éditeur passe avant le disque', () => {
    dansUnDossier((racine) => {
      const source = `${FICHIERS[CATALOGUE]}    variable neuve = 1\n`;
      const { fichiers } = lireProjet(source, join(racine, CATALOGUE), lireSurLeDisque, [], listerSurLeDisque);
      expect(fichiers[0].chemin).toBe(join(racine, CATALOGUE));
      expect(fichiers[0].doc.lignes).toContain('    variable neuve = 1');
      expect(fichiers.map((f) => f.chemin).filter((c) => c === join(racine, CATALOGUE))).toHaveLength(1);
      expect(fichiers).toHaveLength(4);
    });
  });

  it('un fichier que personne n’utilise reste seul : pas de faux composant', () => {
    dansUnDossier((racine) => {
      const { ligne, colonne } = lieu('seul.humalis', '    MenuAdmin', 'MenuAdmin');
      expect(definir(indexDe(racine, 'seul.humalis'), ligne, colonne)).toBeUndefined();
    });
  });

  it('aucun diagnostic de plus', () => {
    dansUnDossier((racine) => {
      const verifier = verifierAvec(lireSurLeDisque, listerSurLeDisque);
      expect(verifier(FICHIERS[CATALOGUE], join(racine, CATALOGUE)).filter((d) => d.gravite === 'erreur')).toEqual([]);
    });
  });
});
