import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { programme } from './analyse/aide.js';

/**
 * « creer mon compte avec … et … [avec nom = …] » et « confirmer mon adresse » sur les six cibles : le même appel,
 * le même refus, le jeton lu dans le lien reçu (#jeton=…) là où ce lien ouvre l'application.
 */
const source = (avecChamps = true) =>
  programme(
    'serveur "boutique" :',
    '>roles client',
    '>emails',
    '>compte :',
    '>>nom : texte',
    '>inscription libre comme client vers "confirmation"',
    '',
    'page "inscription" :',
    '>titre "Créer un compte"',
    '>formulaire "compte" :',
    '>>champ "Nom"',
    '>>champ email "Email"',
    '>>champ mot de passe "Mot de passe"',
    '>>bouton "Créer mon compte"',
    '>quand le formulaire "compte" est soumis :',
    '>>essayer :',
    `>>>creer mon compte avec champ "Email" et champ "Mot de passe"${avecChamps ? ' avec nom = champ "Nom"' : ''}`,
    '>>>afficher "Un lien de confirmation vous a été envoyé."',
    '>>si erreur :',
    '>>>afficher erreur "{raison}"',
    '',
    'page "confirmation" :',
    '>titre "Confirmation"',
    '>quand la page se charge :',
    '>>essayer :',
    '>>>confirmer mon adresse',
    '>>>afficher "Votre adresse est confirmée."',
    '>>si erreur :',
    '>>>afficher erreur "{raison}"',
  );

const application = (avec = true) => {
  const { application, diagnostics } = compiler(source(avec));
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');
const options = { nom: 'boutique', source: 'boutique.humalis' };
const natif = (produit: { fichiers: Map<string, string>; diagnostics: { gravite: string; message: string }[] }) => {
  expect(produit.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return { code: tout(produit.fichiers), avertissements: produit.diagnostics.filter((d) => d.gravite === 'avertissement').map((d) => d.message) };
};

/** Le texte d'une fonction produite, de sa déclaration jusqu'à la suivante. */
const fonction = (code: string, debut: string, longueur = 1200) => {
  const i = code.indexOf(debut);
  expect(i, `« ${debut} » introuvable`).toBeGreaterThan(-1);
  return code.slice(i, i + longueur);
};

describe('« creer mon compte » et « confirmer mon adresse » sur les six cibles', () => {
  it('moteur : POST /auth/inscription avec les champs, puis le jeton du lien pour POST /auth/confirmation', () => {
    const code = tout(genererProjetMoteur(application(), options));
    expect(code).toContain('await utilisateur.creerMonCompte(String(champEmail.v), String(champMotDePasse.v), { "nom": champNom.v }, true)');
    expect(code).toContain('await utilisateur.confirmerMonAdresse(true)');
    const creer = fonction(code, 'function creerMonCompte(');
    expect(creer).toContain("'/auth/inscription', { email, motDePasse, champs }");
    const confirmer = fonction(code, 'async function confirmerMonAdresse(');
    expect(confirmer).toContain("new URLSearchParams(window.location.hash.slice(1)).get('jeton')");
    expect(confirmer).toContain("'/auth/confirmation', { jeton }");
    expect(confirmer).toContain('window.history.replaceState(');
    expect(tout(genererProjetMoteur(application(false), options))).toContain('await utilisateur.creerMonCompte(String(champEmail.v), String(champMotDePasse.v), undefined, true)');
  });

  it('React : le même appel, et le jeton lu dans l’adresse', () => {
    const code = tout(genererProjetWeb(application(), { ...options, adresse: 'https://boutique.test' }));
    expect(code).toContain('await utilisateur.creerMonCompte(String(champEmail), String(champMotDePasse), { "nom": champNom }, true)');
    expect(code).toContain('await utilisateur.confirmerMonAdresse(true)');
    expect(code).toContain('creerMonCompte(email: string, motDePasse: string, champs?: Record<string, unknown>, dansUnEssai?: boolean): Promise<boolean>;');
    expect(code).toContain('confirmerMonAdresse(dansUnEssai?: boolean): Promise<boolean>;');
    const creer = fonction(code, 'async function creerMonCompte(');
    expect(creer).toContain("'/auth/inscription', { email, motDePasse, champs }");
    const confirmer = fonction(code, 'async function confirmerMonAdresse(');
    expect(confirmer).toContain("new URLSearchParams(window.location.hash.slice(1)).get('jeton')");
    expect(confirmer).toContain("'/auth/confirmation', { jeton }");
  });

  it('statique : le même appel, et le jeton lu dans l’adresse', () => {
    const code = tout(genererProjetStatique(application(), options));
    expect(code).toContain('await utilisateur.creerMonCompte(String(champEmail), String(champMotDePasse), { "nom": champNom }, true)');
    expect(code).toContain('await utilisateur.confirmerMonAdresse(true)');
    const creer = fonction(code, 'async function creerMonCompte(');
    expect(creer).toContain("envoyerAuCompte('/auth/inscription', { email, motDePasse, champs }");
    expect(fonction(code, 'async function envoyerAuCompte(')).toContain('fetch(ADRESSE_SERVEUR + chemin');
    const confirmer = fonction(code, 'async function confirmerMonAdresse(');
    expect(confirmer).toContain("new URLSearchParams(window.location.hash.slice(1)).get('jeton')");
    expect(confirmer).toContain("envoyerAuCompte('/auth/confirmation', { jeton }");
  });

  it('Apple : le même appel ; le jeton vient du lien ouvert dans l’application', () => {
    const { code, avertissements } = natif(genererProjetApple(pourLaCible(application(), 'apple'), options));
    expect(code).toContain('try await Session.commun.creerMonCompte(email: ');
    expect(code).toMatch(/champs: \["nom": ValeurHumalis\([^\]]+\)\]\)/);
    expect(code).toContain('try await Session.commun.confirmerMonAdresse()');
    const creer = fonction(code, 'func creerMonCompte(email: String, motDePasse: String, champs: [String: ValeurHumalis] = [:]) async throws');
    expect(creer).toContain('"/auth/inscription"');
    const confirmer = fonction(code, 'func confirmerMonAdresse() async throws');
    expect(confirmer).toContain('guard let jeton = jetonDeLien');
    expect(confirmer).toContain('"/auth/confirmation"');
    expect(avertissements.join('\n')).toContain('« confirmer mon adresse » : le lien reçu par e-mail ouvre le site');
  });

  it('Android : le même appel ; le jeton vient du lien ouvert dans l’application', () => {
    const { code } = natif(genererProjetAndroid(pourLaCible(application(), 'android'), options));
    expect(code).toMatch(/Session\.creerMonCompte\([^\n]+champs = fiche\("nom" to [^\n]+\)\)/);
    expect(code).toContain('Session.confirmerMonAdresse()');
    const creer = fonction(code, 'suspend fun creerMonCompte(email: String, motDePasse: String, champs: Map<String, Any?> = emptyMap())');
    expect(creer).toContain('"/auth/inscription"');
    const confirmer = fonction(code, 'suspend fun confirmerMonAdresse()');
    expect(confirmer).toContain('jetonDeLien ?: throw ErreurHumalis(');
    expect(confirmer).toContain('"/auth/confirmation"');
  });

  it('Windows : le même appel ; le lien reçu ouvre le site, ce que le geste dit clairement', () => {
    const { code } = natif(genererProjetWindows(pourLaCible(application(), 'windows'), options));
    expect(code).toMatch(/await Session\.CreerMonCompte\([^;]+V\.FicheDe\(\("nom", [^;]+\)\);/);
    expect(code).toContain('await Session.ConfirmerMonAdresse();');
    const creer = fonction(code, 'public static async Task CreerMonCompte(string email, string motDePasse, Fiche? champs = null)');
    expect(creer).toContain('"/auth/inscription"');
    const confirmer = fonction(code, 'public static Task ConfirmerMonAdresse()');
    expect(confirmer).toContain('Ouvrez le lien reçu par e-mail dans votre navigateur pour confirmer votre adresse.');
  });

  it('le bureau passe par le moteur', () => {
    const code = tout(genererProjetDesktop(application(), options));
    expect(code).toContain('function creerMonCompte(');
    expect(code).toContain('/auth/confirmation');
  });
});
