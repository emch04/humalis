import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
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

  it('« texte … avec decoratif » n’est pas relu, et le logo de l’en-tête se charge tout de suite', () => {
    const source = programme('entete :', '>image "logo.svg" avec description "Rey Store"', '>texte "Store" avec decoratif', '', 'page "p" :', '>titre "P"');
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    const entete = fichiers.get('src/composants/EnteteSite.tsx')!;
    expect(entete).toMatch(/<p [^>]*aria-hidden="true">Store<\/p>/);
    expect(entete).not.toContain('loading="lazy"');
  });

  it('un « calcul » dans un bloc s’écrit entre accolades dans le JSX (il ne s’affiche plus en texte)', () => {
    const source = programme('variable favoris = [] avec partagee', '', 'entete :', '>ligne :', '>>calcul combien = nombre de favoris', '>>texte "{combien}"', '', 'page "p" :', '>titre "P"');
    expect(erreurs(source)).toEqual([]);
    const entete = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/composants/EnteteSite.tsx')!;
    expect(entete).toMatch(/<div className="humalis-ligne">\s*\{\(\(\) => \{/);
    expect(entete).toContain('})()}');
  });

  it('une application dont toutes les pages sont réservées se construit sans prérendu', () => {
    const source = programme('serveur "s" :', '>donnee d :', '>>nom : texte', '>route "d" :', '>>seul admin peut lire d', '>>seul admin peut modifier d', '', 'page "a" reservee a admin sinon vers "c" :', '>titre "A"', '', 'page "c" a l\'adresse "/c" :', '>apercu :', '>>indexation non', '>titre "C"');
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    expect(fichiers.has('astratra.prerender.config.cjs')).toBe(false);
    expect(JSON.parse(fichiers.get('package.json')!).scripts.build).toBe('tsc --noEmit && vite build');
  });

  it('une date reste au format français dans un composant et une fois copiée dans une fiche', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee commande :',
      '>>nom : texte',
      '>>jour : date',
      '>route "commandes" :',
      '>>seul admin peut lire commande',
      '>>seul admin peut modifier commande',
      '',
      'composant "CarteCommande" :',
      '>parametre commande',
      '>texte "Le {commande.jour}, {commande.nom}"',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable commandes = []',
      '>variable copies = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "commandes" dans commandes',
      '>>pour chaque c dans commandes :',
      '>>>ajouter fiche avec jour c.jour et nom c.nom à copies',
      '>pour chaque c dans commandes :',
      '>>CarteCommande avec commande c',
      '>pour chaque x dans copies :',
      '>>texte "{x.jour}, {x.nom}"',
    );
    expect(erreurs(source)).toEqual([]);
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain('formaterDate(commande');
    expect(tout).not.toContain('formaterDate(commande.nom');
    expect(tout).not.toContain('formaterDate(commande?.nom');
    expect(fichiers.get('src/pages/P.tsx')).toContain('formaterDate(x.jour)');
    expect(fichiers.get('src/pages/P.tsx')).not.toContain('formaterDate(x.nom)');
  });

  it('une fonction du haut du fichier se lit dans le pied', () => {
    const source = 'fonction double avec x :\n    rendre x * 2\n\npied :\n    calcul d = double(2)\n    texte "{d}"\n\npage "p" :\n    titre "P"\n';
    expect(erreurs(source)).toEqual([]);
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    expect([...fichiers.values()].join('\n')).toContain("import { double } from '../humalis/fonctions';");
  });

  it('somme de panier.prix marche sur une liste vide au départ', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable panier = []',
      '>calcul total = somme de panier.prix',
      '>texte "{total}"',
      '>bouton "Ajouter"',
      '>quand l\'utilisateur clique sur "Ajouter" :',
      '>>ajouter fiche avec prix 3 à panier',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('un carrousel porte sa description (web, mobile) ; seule l\'image d\'une diapositive prend toute la largeur', () => {
    const source = programme('page "p" :', '>titre "P"', '>carrousel avec description "Vitrine" :', '>>image "a.jpg" avec description "A"');
    expect(erreurs(source)).toEqual([]);
    const application = compiler(source).application!;
    const web = genererProjetWeb(application, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    expect([...web.values()].join('\n')).toContain('description="Vitrine"');
    const css = [...web].filter(([nom]) => nom.endsWith('.css')).map(([, contenu]) => contenu).join('\n');
    expect(css).toContain('.humalis-carrousel-piste > img, .humalis-carrousel-piste > figure img { width: 100%; }');
    expect(css).not.toContain('.humalis-carrousel-piste img {');
    expect([...genererProjetMobile(application, { nom: 'b' } as never).values()].join('\n')).toContain("description='Vitrine'");
  });

  it('un mot de passe a son œil sur mobile et sur le site statique', () => {
    const source = programme('page "p" :', '>titre "P"', '>champ mot de passe "Secret"');
    expect(erreurs(source)).toEqual([]);
    const application = compiler(source).application!;
    const mobile = genererProjetMobile(application, { nom: 'b' } as never);
    expect(mobile.get('humalis/mot-de-passe.tsx')).toContain('Afficher le mot de passe');
    expect([...mobile.values()].join('\n')).toContain('<MotDePasse ');
    const statique = genererProjetStatique(application, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' } as never);
    const outils = statique.get('humalis/humalis.js')!;
    expect(outils).toContain('function activerMotsDePasse()');
    expect(outils).toContain('activerMotsDePasse();');
    expect([...statique.values()].join('\n')).toContain('.humalis-mot-de-passe-oeil');
  });
});
