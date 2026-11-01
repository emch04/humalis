import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Les défauts du langage trouvés en écrivant Rey Store, corrigés un par un (humalis-notes, 2026-11-01).
describe('défauts trouvés avec Rey Store', () => {
  it('le même bouton dans « si » et dans « sinon » : chaque événement vise celui de sa branche', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable replie = faux',
      '>si replie est vrai :',
      '>>bouton "Se déconnecter"',
      '>>quand l\'utilisateur clique sur "Se déconnecter" :',
      '>>>changer replie par faux',
      '>sinon :',
      '>>bouton "Se déconnecter"',
      '>>quand l\'utilisateur clique sur "Se déconnecter" :',
      '>>>changer replie par vrai',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    // Deux boutons, deux gestionnaires distincts.
    expect(page.match(/onClick=\{/g)?.length).toBe(2);
  });

  it('deux boutons de même nom au même niveau restent signalés', () => {
    const source = programme('page "p" :', '>titre "P"', '>bouton "Ok"', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>afficher "a"');
    expect(erreurs(source).join('\n')).toMatch(/deux éléments s'appellent « Ok »/);
  });

  it('« champ "…" » se lit partout où une valeur est attendue : comparaison, « avec clé = », calcul', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee alerte :',
      '>>telephone : texte',
      '>route "alertes" :',
      '>>tout le monde peut creer alerte',
      '>>seul admin peut lire alerte',
      '>>seul admin peut modifier alerte',
      '',
      'page "p" :',
      '>titre "P"',
      '>formulaire "f" :',
      '>>champ "Téléphone" avec obligatoire',
      '>>champ "Confirme" avec obligatoire',
      '>>bouton "Envoyer"',
      '>quand le formulaire "f" est soumis :',
      '>>si champ "Téléphone" est different de champ "Confirme" :',
      '>>>afficher erreur "Les deux numéros diffèrent."',
      '>>sinon :',
      '>>>envoyer requete vers "alertes" avec telephone = champ "Téléphone"',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    expect(page).toContain('champTelephone !== champConfirme');
    expect(page).toContain('{ telephone: champTelephone }');
  });

  it('« arrondi de (a - b) » : la parenthèse ouvre la valeur, ce n’est pas une fonction « arrondi »', () => {
    const source = programme('page "p" :', '>variable vendus = 7', '>variable rendus = 2', '>calcul part = arrondi de (vendus - rendus) * 100 / 7', '>titre "P"', '>texte "{part}"');
    expect(erreurs(source)).toEqual([]);
    expect(JSON.stringify(compiler(source).application!.ecrans[0])).toContain('"type":"arrondi"');
  });

  it('deux dates se comparent : « jour est superieur a debut » avec debut = aujourd’hui moins 7 jours', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee commande :',
      '>>nom : texte',
      '>>jour : date',
      '>route "commandes" :',
      '>>tout le monde peut creer commande',
      '>>seul admin peut lire commande',
      '>>seul admin peut modifier commande',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable commandes = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "commandes" dans commandes',
      '>calcul debut = aujourd\'hui moins 7 jours',
      '>calcul recentes = commandes dont jour est superieur a debut',
      '>calcul combien = nombre de recentes',
      '>texte "{combien} commandes"',
    );
    expect(erreurs(source)).toEqual([]);
    // Un nombre ne se compare toujours pas à un texte qui n'est pas une date.
    expect(erreurs(programme('page "p" :', '>titre "P"', '>variable nom = "Rey"', '>si nom est superieur a 3 :', '>>texte "x"')).join('\n')).toMatch(/compare des nombres/);
  });

  it('le titre d’une section n’est pas un second titre principal', () => {
    const avertissements = compiler(programme('page "p" :', '>titre "P"', '>section "Les CGV" :', '>>texte "Bonjour"')).diagnostics.map((d) => d.message).join('\n');
    expect(avertissements).not.toMatch(/plusieurs titres principaux/);
    const deux = compiler(programme('page "p" :', '>titre "P"', '>titre "Q"')).diagnostics.map((d) => d.message).join('\n');
    expect(deux).toMatch(/plusieurs titres principaux/);
  });

  it('dans une boucle, un événement vise un bouton par son texte à {variables} (« Voir {c.nom} »)', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable clients = [fiche avec nom "Awa", fiche avec nom "Rey"]',
      '>pour chaque c dans clients :',
      '>>bouton "Voir {c.nom}"',
      '>>quand l\'utilisateur clique sur "Voir {c.nom}" :',
      '>>>afficher "{c.nom}"',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('un titre dans « si » et un autre dans « sinon » : l’onglet suit la même condition', () => {
    const source = programme('site :', '>nom "Rey Store"', '>description "Les maillots et la mode masculine, commandés sur WhatsApp et payés à la livraison."', '', 'page "boutique" avec filtre recherche :', '>si recherche est rien :', '>>titre "La boutique"', '>sinon :', '>>titre "Recherche : {recherche}"');
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Boutique.tsx')!;
    expect(page).toMatch(/\(recherche == null \? 'La boutique \| Rey Store' : /);
  });

  it('« page "mentions-legales" » a l’adresse /mentions-legales (les traits d’union restent)', () => {
    const source = programme('page "accueil" :', '>titre "Accueil"', '>lien "Mentions" vers "mentions-legales"', '', 'page "mentions-legales" :', '>titre "Mentions légales"');
    expect(erreurs(source)).toEqual([]);
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('to="/mentions-legales"');
    expect([...fichiers.values()].join('\n')).not.toContain('/mentions_legales');
  });

  it('une valeur peut-être absente dans un texte à trous s’écrit vide, pas « undefined »', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee reglage :',
      '>>boutique : texte',
      '>route "reglages" :',
      '>>tout le monde peut lire reglage',
      '>>seul admin peut modifier reglage',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable reglages = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "reglages" dans reglages',
      '>calcul reglage = premier de reglages',
      '>formulaire "f" :',
      '>>champ "Nom" avec indice "{reglage.boutique}"',
      '>>bouton "Ok"',
      '>quand le formulaire "f" est soumis :',
      '>>afficher "{reglage.boutique}"',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    expect(page).toContain("${reglage?.boutique ?? ''}");
    expect(page).not.toMatch(/\$\{reglage\?\.boutique\}/);
  });

  it('« si erreur » reçoit la raison du refus du serveur, pas toujours « Le serveur n’a pas répondu »', async () => {
    const source = programme(
      'serveur "s" :',
      '>donnee produit :',
      '>>prix : nombre',
      '>route "produits" :',
      '>>tout le monde peut lire produit',
      '>>tout le monde peut creer produit',
      '',
      'page "p" :',
      '>titre "P"',
      '>bouton "Créer"',
      '>quand l\'utilisateur clique sur "Créer" :',
      '>>essayer :',
      '>>>envoyer requete vers "produits" avec prix = 3',
      '>>si erreur :',
      '>>>afficher erreur "{raison}"',
    );
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    expect(fichiers.get('src/pages/P.tsx')).toContain('return serveur.raison();');
    const serveur = fichiers.get('src/humalis/serveur.ts')!;
    expect(serveur).toContain("corps.erreur.charAt(0).toUpperCase() + corps.erreur.slice(1) + '.'");
    expect(serveur).toContain('raison: () => derniereRaison,');
  });
});
