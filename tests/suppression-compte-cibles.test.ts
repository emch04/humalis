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

/** « supprimer mon compte » dans une page, sur les six cibles : le même appel, la même fin de session, le même refus. */
const source = (avecMotDePasse = true) =>
  programme(
    'serveur "carnet" :',
    '>compte :',
    '>>nom : texte',
    '>route "moi" :',
    '>>connecte peut supprimer son compte',
    '',
    'page "reglages" :',
    '>titre "Réglages"',
    '>formulaire "fermeture" :',
    '>>champ mot de passe "Mot de passe" avec obligatoire',
    '>>bouton "Supprimer mon compte"',
    '>quand le formulaire "fermeture" est soumis :',
    '>>essayer :',
    `>>>supprimer mon compte${avecMotDePasse ? ' avec champ "Mot de passe"' : ''}`,
    '>>si erreur :',
    '>>>afficher erreur "{raison}"',
  );

const application = (avec = true) => {
  const { application, diagnostics } = compiler(source(avec));
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');
const options = { nom: 'carnet', source: 'carnet.humalis' };
const natif = (produit: { fichiers: Map<string, string>; diagnostics: { gravite: string }[] }) => {
  expect(produit.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return tout(produit.fichiers);
};

/** Le texte d'une fonction produite, de sa déclaration jusqu'à la suivante. */
const fonction = (code: string, debut: string, longueur = 1600) => {
  const i = code.indexOf(debut);
  expect(i, `« ${debut} » introuvable`).toBeGreaterThan(-1);
  return code.slice(i, i + longueur);
};

const CIBLES = {
  moteur: (avec: boolean) => tout(genererProjetMoteur(application(avec), options)),
  react: (avec: boolean) => tout(genererProjetWeb(application(avec), { ...options, adresse: 'https://carnet.test' })),
  statique: (avec: boolean) => tout(genererProjetStatique(application(avec), options)),
  apple: (avec: boolean) => natif(genererProjetApple(pourLaCible(application(avec), 'apple'), options)),
  android: (avec: boolean) => natif(genererProjetAndroid(pourLaCible(application(avec), 'android'), options)),
  windows: (avec: boolean) => natif(genererProjetWindows(pourLaCible(application(avec), 'windows'), options)),
};

describe('« supprimer mon compte » sur les six cibles', () => {
  it('moteur : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.moteur(true);
    expect(code).toContain('await utilisateur.supprimerMonCompte(String(champMotDePasse.v), true)');
    const f = fonction(code, 'async function supprimerMonCompte(');
    expect(f).toContain("'/auth/suppression-compte', { method: 'POST'");
    expect(f).toContain('JSON.stringify(motDePasse === undefined ? {} : { motDePasse })');
    expect(f).toContain("corps?.erreur ?? \"le compte n'a pas été supprimé\"");
    expect(f).toContain("globalThis.dispatchEvent?.(new CustomEvent('humalis:deconnexion'));");
    expect(f).toContain('await relireSession();');
    expect(CIBLES.moteur(false)).toContain('await utilisateur.supprimerMonCompte(undefined, true)');
  });

  it('React : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.react(true);
    expect(code).toContain('await utilisateur.supprimerMonCompte(String(champMotDePasse), true)');
    expect(code).toContain('supprimerMonCompte(motDePasse?: string, dansUnEssai?: boolean): Promise<boolean>;');
    const f = fonction(code, 'async function supprimerMonCompte(');
    expect(f).toContain("fetch(BASE + '/auth/suppression-compte'");
    expect(f).toContain('JSON.stringify(motDePasse === undefined ? {} : { motDePasse })');
    expect(f).toContain("corps?.erreur ?? \"le compte n'a pas été supprimé\"");
    expect(f).toContain("window.dispatchEvent(new CustomEvent('humalis:deconnexion'));");
    expect(f).toContain('await relire();');
    expect(CIBLES.react(false)).toContain('await utilisateur.supprimerMonCompte(undefined, true)');
  });

  it('statique : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.statique(true);
    expect(code).toContain('await utilisateur.supprimerMonCompte(String(champMotDePasse), true)');
    const f = fonction(code, 'async function supprimerMonCompte(');
    expect(f).toContain("fetch(ADRESSE_SERVEUR + '/auth/suppression-compte'");
    expect(f).toContain('JSON.stringify(motDePasse === undefined ? {} : { motDePasse })');
    expect(f).toContain("corps?.erreur ?? \"le compte n'a pas été supprimé\"");
    expect(f).toContain('await relireSession();');
    expect(CIBLES.statique(false)).toContain('await utilisateur.supprimerMonCompte(undefined, true)');
  });

  it('Apple : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.apple(true);
    expect(code).toMatch(/try await Session\.commun\.supprimerMonCompte\(motDePasse: [^)]+\)/);
    const f = fonction(code, 'func supprimerMonCompte(motDePasse: String?) async throws');
    expect(f).toContain('envoyer("/auth/suppression-compte", motDePasse.map { ["motDePasse": $0] } ?? [:])');
    expect(f).toContain('raison = "le compte n\'a pas été supprimé"');
    expect(f).toContain('oublier()');
    expect(f).toContain('await relire()');
    expect(CIBLES.apple(false)).toContain('try await Session.commun.supprimerMonCompte(motDePasse: nil)');
  });

  it('Android : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.android(true);
    expect(code).toMatch(/Session\.supprimerMonCompte\([^)]+\)/);
    const f = fonction(code, 'suspend fun supprimerMonCompte(motDePasse: String?)');
    expect(f).toContain('brut("/auth/suppression-compte", "POST", if (motDePasse == null) fiche() else fiche("motDePasse" to motDePasse))');
    expect(f).toContain('"le compte n\'a pas été supprimé"');
    expect(f).toContain('oublier()');
    expect(f).toContain('Coffre.effacer(CLE_COMPTE)');
    expect(f).toContain('relire()');
    expect(CIBLES.android(false)).toContain('Session.supprimerMonCompte(null)');
  });

  it('Windows : l’appel, puis la même fin de session que « se deconnecter »', () => {
    const code = CIBLES.windows(true);
    expect(code).toMatch(/await Session\.SupprimerMonCompte\([^;]+\);/);
    const f = fonction(code, 'public static async Task SupprimerMonCompte(string? motDePasse)');
    expect(f).toContain('Envoyer("/auth/suppression-compte", motDePasse is null ? new Fiche() : V.FicheDe(("motDePasse", motDePasse)))');
    expect(f).toContain('"le compte n\'a pas été supprimé"');
    expect(f).toContain('Oublier();');
    expect(f).toContain('demande = Relire();');
    expect(CIBLES.windows(false)).toContain('await Session.SupprimerMonCompte(null);');
  });

  it('le bureau passe par le moteur, et son relais laisse passer la suppression', () => {
    const code = tout(genererProjetDesktop(application(true), options));
    expect(code).toContain('async function supprimerMonCompte(');
    expect(code).toContain('/auth/suppression-compte');
  });
});
