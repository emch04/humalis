import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compilerProjet } from '../src/fichiers.js';

/**
 * Chaque formule de l'antisèche (docs/antiseche.md) compile sans erreur, là où
 * elle s'écrit, et chaque tournure « à éviter » est bien refusée. Le contexte
 * ci-dessous déclare les variables, les pages et les données qu'elles citent.
 */
const decaler = (code: string, marge: number) =>
  code.split('\n').map((l) => (l === '' ? '' : ' '.repeat(marge) + l)).join('\n');

const programme = (o: { racine?: string; page?: string; action?: string; route?: string; commande?: string; donnee?: string }) => `
serveur "essai" :
    connexion google
    emails par brevo
    invitations vers "contact"
    mot de passe oublie vers "contact"
    donnee produit :
        nom : texte
        prix : nombre
    donnee zone :
        commune : texte
        prix : nombre
    donnee suivi :
        etape : texte
        total : nombre
    donnee avis :
        note : nombre
    donnee commande :
        nom : texte
        refs : liste de texte
        commune : texte
        suivi : texte
        total : nombre
${decaler(o.donnee ?? '', 8)}
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "zones" :
        tout le monde peut lire zone
    route "suivis" :
        seul admin peut lire suivi
    route "commandes" :
        tout le monde peut creer commande
${decaler(o.commande ?? '', 8)}
    route "avis" :
${decaler(o.route ?? 'seul admin peut lire avis', 8)}

${o.racine ?? ''}

page "contact" :
    titre "Contact"

page "connexion" :
    titre "Connexion"

page "produit" avec parametre id :
    titre "Produit {id}"

page "essai" :
    variable note = 1
    variable notes = [1, 2]
    variable prix = 2
    variable quantite = 1
    variable stock = 3
    variable nom = "Camille"
    variable prenom = "Camille"
    variable categorie = "robes"
    variable actif = vrai
    variable photo = rien
    variable panier = []
    variable produits = [fiche avec nom "Livre" et prix 12]
    variable articles = []
    champ "Nom"
    champ "Email"
    bouton "Essayer"
    bouton "Commander"
${decaler(o.page ?? '', 4)}
    quand l'utilisateur clique sur "Essayer" :
        envoyer requete vers "produits" dans articles
${decaler(o.action ?? '', 8)}
`;

const lire = (fichier: string) => {
  const base = fichier.split('/').pop()!;
  if (base.endsWith('.csv')) return 'nom;prix\nLivre;12';
  if (base.endsWith('.humalis')) return `page "${base.replace('.humalis', '')}" :\n    titre "${base}"\n`;
  return undefined;
};

const erreursDe = (source: string) =>
  compilerProjet('/projet/essai.humalis', lire, source).diagnostics
    .filter((d) => d.gravite === 'erreur')
    .map((d) => `ligne ${d.ligne} : ${d.message}`);

/** Le programme complet d'une formule, selon l'endroit où elle s'écrit. */
function source(cadre: string, code: string) {
  if (cadre === 'complet') return code;
  return programme({ [cadre]: code });
}

const racine = fileURLToPath(new URL('..', import.meta.url));
const texte = readFileSync(`${racine}docs/antiseche.md`, 'utf8').replace(/<!--[\s\S]*?-->/, '');

const blocs: { genre: string; cadre: string; code: string; ligne: number }[] = [];
const lignes = texte.split('\n');
for (let i = 0; i < lignes.length; i++) {
  const ouverture = /^```(humalis|faux) (\w+)$/.exec(lignes[i]);
  if (!ouverture) continue;
  const debut = i + 1;
  while (lignes[++i] !== '```');
  blocs.push({ genre: ouverture[1], cadre: ouverture[2], code: lignes.slice(debut, i).join('\n'), ligne: debut });
}

describe('l’antisèche', () => {
  it('le contexte des formules compile seul', () => {
    expect(erreursDe(programme({}))).toEqual([]);
  });

  it('contient ses formules et ses pièges', () => {
    expect(blocs.filter((b) => b.genre === 'humalis').length).toBeGreaterThanOrEqual(100);
    expect(blocs.filter((b) => b.genre === 'faux').length).toBeGreaterThanOrEqual(15);
  });

  it('a deux langues sur chaque titre', () => {
    const sansTraduction = lignes.filter((l) => /^##+ /.test(l) && !l.includes(' | '));
    expect(sansTraduction).toEqual([]);
  });

  for (const { genre, cadre, code, ligne } of blocs) {
    if (genre === 'humalis') {
      it(`la formule de la ligne ${ligne} compile : ${code.split('\n')[0]}`, () => {
        expect(erreursDe(source(cadre, code))).toEqual([]);
      });
    } else {
      it(`la tournure de la ligne ${ligne} est refusée : ${code.split('\n')[0]}`, () => {
        expect(erreursDe(source(cadre, code))).not.toEqual([]);
      });
    }
  }

  it('la page du site est à jour', () => {
    expect(() => execFileSync('node', ['scripts/antiseche-site.mjs', '--verifier'], { cwd: racine, stdio: 'pipe' })).not.toThrow();
  });
});
