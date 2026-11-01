// Vérifie les types du code que Humalis produit : compile un exemple pour chaque cible,
// installe ses dépendances, puis lance tsc. Lent (installations) : à lancer avant une publication.
//   npm run build && npm run verifier:produit
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
const dossier = mkdtempSync(join(tmpdir(), 'humalis-produit-'));
const source = join(dossier, 'essai.humalis');
writeFileSync(source, `calcul articles = nombre de panier
variable panier = [] avec partagee

serveur "essai" :
    donnee commande :
        nom : texte
        total : nombre
        jour : date
    route "commandes" :
        tout le monde peut lire commande
        tout le monde peut creer commande

page "Accueil" :
    titre "Essai {articles}"
    variable actif = faux
    variable etat = "a"
    variable commandes = []
    variable notes = [fiche avec prix 1 et vu "o", fiche avec prix 60 et vu "n"]
    calcul choisies = notes dont prix est inferieur a 50 et vu est egal a "o"
    calcul triees = trier (notes dont prix est inferieur a 50) par prix
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes
    si non actif :
        texte "Bonjour{saut de ligne}Merci"
    selon etat :
        cas "a" ou "b" :
            texte "{nombre de choisies} notes"
        sinon :
            texte "Autre"
    pour chaque n dans triees :
        texte "{n.prix * 2}"
    pour chaque c dans commandes :
        texte "{c.nom}, {c.jour}"
    formulaire "contact" avec style "carte" :
        champ "Nom"
        bouton "Envoyer"
    quand le formulaire "contact" est soumis :
        afficher "Merci"
    bouton "Exporter"
    quand l'utilisateur clique sur "Exporter" :
        telecharger notes en csv
`);

let echecs = 0;
try {
  for (const cible of ['web', 'mobile', 'desktop', 'serveur']) {
    const sortie = join(dossier, cible);
    mkdirSync(sortie);
    process.stdout.write(`${cible} : `);
    try {
      execFileSync('node', [cli, 'compile', source, '--cible', cible, '--sortie', sortie], { stdio: 'pipe' });
      execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: sortie, stdio: 'pipe' });
      if (!existsSync(join(sortie, 'tsconfig.json'))) throw new Error('pas de tsconfig.json');
      execFileSync('npx', ['tsc', '--noEmit', '-p', '.'], { cwd: sortie, stdio: 'pipe' });
      console.log('types corrects');
    } catch (erreur) {
      echecs++;
      console.log('ÉCHEC');
      console.log(String(erreur.stdout ?? erreur.stderr ?? erreur.message).slice(0, 3000));
    }
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
process.exit(echecs ? 1 : 0);
