import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// « changer le mot de passe avec … et … » dans une page, « photo : image » dans une donnée (décisions d'Emch).
const source = () =>
  programme(
    'serveur "boutique" :',
    '>donnee profil :',
    '>>nom : texte',
    '>>photo : image',
    '>route "profils" :',
    '>>seul admin peut lire profil',
    '>>seul admin peut creer profil',
    '',
    'page "profil" :',
    '>variable photo = rien',
    '>variable nom = "Rey"',
    '>fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo',
    '>bouton "Enregistrer la photo"',
    '>quand l\'utilisateur clique sur "Enregistrer la photo" :',
    '>>envoyer requete vers "profils" avec nom et photo',
    '>formulaire "secret" :',
    '>>champ mot de passe "Mot de passe actuel" avec obligatoire',
    '>>champ mot de passe "Nouveau mot de passe" avec obligatoire',
    '>>bouton "Changer le mot de passe"',
    '>quand le formulaire "secret" est soumis :',
    '>>essayer :',
    '>>>changer le mot de passe avec champ "Mot de passe actuel" et champ "Nouveau mot de passe"',
    '>>>afficher reussite "Mot de passe changé"',
    '>>si erreur :',
    '>>>afficher erreur "{raison}"',
  );

describe('page de profil : mot de passe et photo', () => {
  it('l’analyse accepte les deux constructions', () => {
    expect(erreurs(source())).toEqual([]);
  });

  it('« fichier … avec icone "photo" » : l’icône seule, le libellé gardé pour les lecteurs d’écran', () => {
    const avecIcone = source().replace('accepte images avec maximum 5 Mo', 'accepte images avec maximum 5 Mo et icone "photo"');
    expect(erreurs(avecIcone)).toEqual([]);
    const fichiers = genererProjetWeb(compiler(avecIcone).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    const page = fichiers.get('src/pages/Profil.tsx')!;
    expect(page).toContain('icone={<CameraIcon className="humalis-icone" aria-hidden="true" />}');
    expect(page).toContain("import { CameraIcon } from 'lucide-react';");
    expect(fichiers.get('src/humalis/choix-fichier.tsx')).toContain('<span className="humalis-fichier-libelle">{libelle}</span>');
    expect(() => erreurs(source().replace('avec maximum 5 Mo', 'avec maximum 5 Mo et icone "appareil-volant"'))).not.toThrow();
    expect(erreurs(source().replace('avec maximum 5 Mo', 'avec maximum 5 Mo et icone "fusee-rose"')).join('\n')).toMatch(/l'icône « fusee-rose » n'existe pas/);
  });

  it('« est rien » et « est vide » ne plantent pas sur un champ absent d’une fiche reçue', () => {
    const programme2 = source().replace('    bouton "Enregistrer la photo"', '    si photo est rien :\n        texte "Aucune photo"\n    bouton "Enregistrer la photo"');
    const page = genererProjetWeb(compiler(programme2).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Profil.tsx')!;
    expect(page).toContain('photo == null');
    expect(page).not.toContain('=== null');
  });

  it('« avec indice "{profil.nom}" » : la valeur actuelle en gris dans le champ', () => {
    const programme2 = source().replace('>>champ mot de passe "Mot de passe actuel" avec obligatoire', '>>champ mot de passe "Mot de passe actuel" avec obligatoire').replace('    variable nom = "Rey"', '    variable nom = "Rey"\n    champ "Prénom" avec indice "{nom}"');
    expect(erreurs(programme2)).toEqual([]);
    const page = genererProjetWeb(compiler(programme2).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Profil.tsx')!;
    expect(page).toContain('placeholder={`${nom}`}');
    expect(page).not.toContain('{nom}"');
    expect(erreurs(source().replace('    variable nom = "Rey"', '    variable nom = "Rey"\n    champ "Prénom" avec indice "{nom_inconnu}"')).join('\n')).toMatch(/nom_inconnu/);
  });

  it('un champ image refuse un choix qui accepte autre chose que des images', () => {
    expect(erreurs(source().replace('accepte images', 'accepte pdf')).join('\n')).toMatch(/est une image : le choix de « photo » doit accepter seulement des images/);
  });

  it('« changer le mot de passe » demande « avec » puis deux valeurs', () => {
    expect(() => erreurs(source().replace(' avec champ "Mot de passe actuel"', ' champ "Mot de passe actuel"'))).toThrow(/après « changer le mot de passe »/);
  });

  it('« changer le mot de passe » demande un serveur', () => {
    const sansServeur = programme('page "p" :', '>bouton "Changer"', '>quand l\'utilisateur clique sur "Changer" :', '>>changer le mot de passe avec "a" et "b"');
    expect(erreurs(sansServeur).join('\n')).toMatch(/« changer le mot de passe » demande un serveur/);
  });

  it('web : la session appelle /auth/mot-de-passe, et une image choisie est réduite avant l’envoi', () => {
    const fichiers = genererProjetWeb(compiler(source()).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    const page = fichiers.get('src/pages/Profil.tsx')!;
    expect(page).toContain('await utilisateur.changerMotDePasse(String(champMotDePasseActuel), String(champNouveauMotDePasse), true)');
    expect(page).toContain('const utilisateur = useUtilisateur();');
    expect(fichiers.get('src/humalis/session.tsx')).toContain("fetch(BASE + '/auth/mot-de-passe'");
    const serveur = fichiers.get('src/humalis/serveur.ts')!;
    expect(serveur).toContain('async function reduireImage(fichier: File): Promise<string>');
    expect(serveur).toContain('JSON.stringify(await preparer(donnees))');
    // Un élément lu par son identifiant qui n'existe plus : pas de faux « le serveur n'a pas répondu ».
    expect(serveur).toContain("if (reponse.status === 404 && options.method === 'GET') return actuelle;");
  });

  it('serveur : la route vérifie l’actuel et la force du nouveau ; le champ image a son schéma', () => {
    const fichiers = genererProjetServeur(compiler(source()).application!.serveurs[0], { nom: 'b', source: 'b.humalis' } as never);
    const serveur = fichiers.get('src/serveur.ts')!;
    expect(serveur).toContain("routeMotDePasse.post('/', createLoginLimiter() as unknown as RequestHandler, authMiddleware, csrfMiddleware");
    expect(serveur).toContain("app.use('/auth/mot-de-passe', routeMotDePasse);");
    expect(serveur).toContain('verifyPasswordHash(actuel, compte.passwordHash)');
    expect(serveur).toContain('if (!isStrongPassword(nouveau))');
    expect(serveur).toContain('passwordHash: await hashPassword(nouveau)');
    // La session dure 3 jours par défaut (réglable par HUMALIS_SESSION) : pas de déconnexion chaque heure.
    expect(serveur).toContain("jwtExpiresIn: process.env.HUMALIS_SESSION || '3d',");
    expect(fichiers.get('.env.exemple')).toContain('HUMALIS_SESSION=');
    expect(fichiers.get('src/donnees.ts')).toContain("photo: 'image',");
    expect(fichiers.get('src/humalis/verifier.ts')).toContain('const TAILLE_IMAGE = 95_000;');
  });

  it('serveur : le vérificateur produit accepte une image réduite et refuse le reste', async () => {
    const fichiers = genererProjetServeur(compiler(source()).application!.serveurs[0], { nom: 'b', source: 'b.humalis' } as never);
    const js = stripTypeScriptTypes(fichiers.get('src/humalis/verifier.ts')!);
    const { verifierEnvoi } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
    const schema = { nom: 'texte', photo: 'image' };
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, true)).toHaveProperty('valeur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: '' }, true)).toHaveProperty('valeur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: null }, true)).toHaveProperty('valeur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: 'https://exemple.fr/rey.jpg' }, true)).toHaveProperty('valeur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: 'data:image/svg+xml;base64,PHN2Zz4=' }, true)).toHaveProperty('erreur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: 'javascript:alert(1)' }, true)).toHaveProperty('erreur');
    expect(verifierEnvoi(schema, { nom: 'Rey', photo: 'data:image/png;base64,' + 'A'.repeat(100_000) }, true)).toHaveProperty('erreur');
  });

  it('site statique : « changer le mot de passe » refusé clairement', () => {
    expect(verifierPourLeStatique(compiler(source()).application!).map((d) => d.message).join('\n')).toMatch(/changer le mot de passe/);
  });
});

describe('les clés envoyées au serveur du programme', () => {
  it('« avec prix_avant = 0 » envoie prixAvant, le nom du champ côté serveur', () => {
    const prog = programme('serveur "b" :', '>donnee produit :', '>>nom : texte', '>>prix_avant : nombre', '>route "produits" :', '>>tout le monde peut lire produit', '>>tout le monde peut creer produit', '', 'page "p" :', '>titre "P"', '>bouton "Créer"', '>quand l\'utilisateur clique sur "Créer" :', '>>envoyer requete vers "produits" avec nom = "Rey" et prix_avant = 0');
    const page = genererProjetWeb(compiler(prog).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    expect(page).toContain("{ nom: 'Rey', prixAvant: 0 }");
  });
});

describe('ajouter une valeur lue d’une fiche peut-être absente', () => {
  it('« ajouter produit.id à favoris » n’ajoute que si la valeur existe (TypeScript accepte la liste)', () => {
    const prog = programme('variable favoris = [] avec partagee', '', 'page "p" :', '>variable produit = rien', '>titre "P"', '>si produit est different de rien :', '>>bouton "Aimer"', '>>quand l\'utilisateur clique sur "Aimer" :', '>>>ajouter produit.id à favoris', '>>>retirer produit.id de favoris');
    const page = genererProjetWeb(compiler(prog).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    expect(page).toMatch(/\.\.\.\[produit\?\.id\]\.filter\(\(v\) => v != null\)/);
  });
});

describe('le pied d’une page courte', () => {
  it('reste en bas de l’écran (pied collant), seulement quand le site a un pied', async () => {
    const { cssEcran } = await import('../src/cibles/web/css-ecran.js');
    expect(cssEcran(['<footer className="humalis-pied">'])).toContain('#racine > .humalis-pied { position: sticky; top: 100vh; }');
    expect(cssEcran(['<footer className="humalis-pied">'])).toContain('#racine { min-height: 100vh; min-height: 100dvh; }');
    expect(cssEcran(['<main className="humalis-page">'])).not.toContain('position: sticky; top: 100vh');
  });
});
