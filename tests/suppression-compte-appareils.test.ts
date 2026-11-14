import { describe, it, expect, afterEach } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { DONNEES_LOCALES_JS } from '../src/cibles/commun/donnees-comptes-web.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { programme } from './analyse/aide.js';

/**
 * Après « supprimer mon compte », l'appareil oublie aussi ce qu'il gardait pour ce compte : la base de chaque donnée
 * locale synchronisée (et sa clé), sur le web, le bureau, Apple, Android et Windows.
 */
const SOURCE = programme(
  'serveur "carnet" :',
  '>compte :',
  '>>nom : texte',
  '>donnee note par compte :',
  '>>texte : texte',
  '>route "notes" :',
  '>>connecte peut lire et creer note',
  '>>connecte peut modifier et supprimer note',
  '>route "moi" :',
  '>>connecte peut supprimer son compte',
  '',
  'donnee locale notes avec chiffree :',
  '>texte : texte',
  '>synchronisee avec "notes"',
  '',
  'page "reglages" :',
  '>titre "Réglages"',
  '>pour chaque n dans notes :',
  '>>texte n.texte',
  '>bouton "Supprimer mon compte"',
  '>quand l\'utilisateur clique sur "Supprimer mon compte" :',
  '>>supprimer mon compte',
);

const application = () => {
  const { application, diagnostics } = compiler(SOURCE);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const options = { nom: 'carnet', source: 'carnet.humalis' };
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');
const natif = (produit: { fichiers: Map<string, string>; diagnostics: { gravite: string }[] }) => {
  expect(produit.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return tout(produit.fichiers);
};

describe('le web et le bureau : la base du compte supprimé quitte le navigateur', () => {
  const ecouteurs = new Map<string, (evenement: { detail: unknown }) => void>();
  const effacees: string[] = [];
  const avant = { addEventListener: globalThis.addEventListener, indexedDB: (globalThis as { indexedDB?: unknown }).indexedDB };
  afterEach(() => {
    Object.assign(globalThis, avant);
    ecouteurs.clear();
    effacees.length = 0;
  });

  const charger = async () => {
    Object.assign(globalThis, {
      addEventListener: (nom: string, f: (evenement: { detail: unknown }) => void) => ecouteurs.set(nom, f),
      indexedDB: { deleteDatabase: (nom: string) => effacees.push(nom) },
    });
    return (await import(`data:text/javascript;base64,${Buffer.from(DONNEES_LOCALES_JS).toString('base64')}`)) as { creerDonneeLocale: (reglages: unknown, lien: unknown) => unknown };
  };
  const lien = { lire: () => [], ecrire: () => {}, transport: {}, dire: () => {} };

  it('une donnée synchronisée efface la base de ce compte, et de lui seul', async () => {
    const { creerDonneeLocale } = await charger();
    creerDonneeLocale({ cle: 'carnet', nom: 'notes', chiffree: true, champs: ['texte'], route: '/api/notes', public: false }, lien);
    ecouteurs.get('humalis:compte-supprime')!({ detail: 'compte-1' });
    expect(effacees).toEqual(['humalis:carnet:locale:notes:compte-1']);
  });

  it('une donnée de l’appareil seul (sans route) n’a pas de base par compte : rien n’est effacé', async () => {
    const { creerDonneeLocale } = await charger();
    creerDonneeLocale({ cle: 'carnet', nom: 'reglages', chiffree: false, champs: ['texte'], route: null, public: false }, lien);
    ecouteurs.get('humalis:compte-supprime')!({ detail: 'compte-1' });
    expect(effacees).toEqual([]);
  });

  it('le moteur et React annoncent le compte supprimé avant de fermer la session', () => {
    const moteur = tout(genererProjetMoteur(application(), options));
    expect(moteur).toContain("globalThis.dispatchEvent?.(new CustomEvent('humalis:compte-supprime', { detail: personne.v?.id ?? null }));");
    const react = tout(genererProjetWeb(application(), { ...options, adresse: 'https://carnet.test' }));
    expect(react).toContain("window.dispatchEvent(new CustomEvent('humalis:compte-supprime', { detail: derniere.current?.id ?? null }));");
    for (const code of [moteur, react]) expect(code.indexOf("'humalis:compte-supprime'")).toBeLessThan(code.lastIndexOf("new CustomEvent('humalis:deconnexion')"));
  });
});

describe('les applications natives : la base du compte supprimé quitte l’appareil, avec sa clé', () => {
  it('Apple', () => {
    const code = natif(genererProjetApple(pourLaCible(application(), 'apple'), options));
    expect(code).toContain('if let compte { for oublierAussi in quandCompteSupprime { await oublierAussi(compte) } }');
    expect(code).toContain('Session.commun.quandCompteSupprime.append { compte in');
    expect(code).toContain('func oublierCompte(_ compte: String) async {');
    expect(code).toContain('effacerBaseHumalis(nom: reglages.cle + ":locale:" + reglages.nom + ":" + compte + (reglages.chiffree ? ":chiffree" : ""))');
    expect(code).toContain('CleBaseHumalis.effacer(nom + ":cle")');
  });

  it('Android', () => {
    const code = natif(genererProjetAndroid(pourLaCible(application(), 'android'), options));
    expect(code).toContain('compte?.let { quandCompteSupprime?.invoke(it) }');
    expect(code).toContain('Session.quandCompteSupprime = { compte -> for (locale in toutes) locale.oublierCompte(compte) }');
    expect(code).toContain('effacerBaseLocale(Appli.contexte, reglages.nom + ":" + compte, reglages.chiffree)');
    expect(code).toContain('SQLiteDatabase.deleteDatabase(File(dossier, "humalis-locale-${code}.db"))');
    expect(code).toContain('.deleteEntry("humalis.locale.${code}")');
  });

  it('Windows', () => {
    const code = natif(genererProjetWindows(pourLaCible(application(), 'windows'), options));
    expect(code).toContain('if (!string.IsNullOrEmpty(compte)) foreach (var oublierAussi in QuandCompteSupprime) await oublierAussi(compte);');
    expect(code).toContain('Session.QuandCompteSupprime.Add(donnee.OublierCompte);');
    expect(code).toContain('var chemin = CheminDe(reglages.Nom, compte);');
    expect(code).toContain('foreach (var fichier in new[] { chemin, chemin + "-wal", chemin + "-shm" })');
  });
});
