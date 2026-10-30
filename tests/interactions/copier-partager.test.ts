import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { programme } from '../analyse/aide.js';
import { auClic, p, corps, web, statique, mobile, fichier, erreurs, avertissements } from './aide.js';

const BILLET = programme(
  'page "billet" :',
  '>variable code = "REY-2026-0042"',
  '>variable prix = 15000',
  '>texte "Ton code : {code}"',
  '>bouton "Copier le code"',
  '>quand l\'utilisateur clique sur "Copier le code" :',
  '>>copier code',
  '>bouton "Copier le prix"',
  '>quand l\'utilisateur clique sur "Copier le prix" :',
  '>>copier prix avec message "Prix copié"',
  '>bouton "Copier en silence"',
  '>quand l\'utilisateur clique sur "Copier en silence" :',
  '>>copier "{code} à {prix} FC" sans message',
  '>bouton "Partager"',
  '>quand l\'utilisateur clique sur "Partager" :',
  '>>partager "Regarde ce billet : {code}" avec titre "Mon billet" avec lien vers "produit" avec id code',
  '>bouton "Partager le site"',
  '>quand l\'utilisateur clique sur "Partager le site" :',
  '>>partager "Rey Store" avec lien "https://reystore.cd"',
  'page "produit" avec parametre id :',
  '>titre "Produit {id}"',
);

describe('copier et partager — le parser', () => {
  it('lit le message, « sans message », le titre et le lien', () => {
    const actions = corps(BILLET).filter((i) => i.type === 'Evenement').map((e: any) => e.corps[0]);
    expect(actions[0]).toMatchObject({ type: 'Copier' });
    expect(actions[0].message).toBeUndefined();
    expect(actions[1].message).toBe('Prix copié');
    expect(actions[2].message).toBeNull();
    expect(actions[3].lien).toMatchObject({ adresse: 'produit' });
    expect(actions[3].lien.parametres[0].nom).toBe('id');
    expect(actions[4].lien).toEqual({ adresse: 'https://reystore.cd' });
  });
  it('laisse « copier » et « partager » libres ailleurs', () => {
    expect(erreurs(p('>variable copier = 1', '>variable partager = 2', '>texte "{copier} {partager}"'))).toEqual([]);
  });
});

describe('copier et partager — l’analyse', () => {
  it('accepte l’exemple', () => {
    expect(erreurs(BILLET)).toEqual([]);
    expect(avertissements(BILLET)).toEqual([]);
  });
  it('refuse « copier » hors d’un geste de la personne', () => {
    expect(erreurs(p('>copier "a"'))[0]).toMatch(/demande un geste de la personne/);
    expect(erreurs(p('>quand la page se charge :', '>>copier "a"'))[0]).toMatch(/à l’ouverture de la page : personne n’a rien demandé/);
    expect(erreurs(auClic(['apres 2 secondes :', '>partager "a"']))[0]).toMatch(/dans une minuterie : personne n’a rien demandé/);
  });
  it('avertit d’un « copier » après une attente', () => {
    const source = auClic(['envoyer requete vers "/produits" dans produits', 'copier "a"'], ['>variable produits = []']);
    expect(avertissements(source).join('\n')).toMatch(/après une attente/);
  });
  it('refuse de copier une liste', () => {
    expect(erreurs(auClic(['copier panier'], ['>variable panier = ["a"]']))[0]).toMatch(/« copier » attend un texte ou un nombre/);
  });
  it('vérifie la page du lien', () => {
    expect(avertissements(auClic(['partager "a" avec lien vers "inconnue"'])).join('\n')).toMatch(/la page « inconnue » n'existe pas/);
  });
  it('refuse une option inconnue de partager', () => {
    expect(() => erreurs(auClic(['partager "a" avec couleur "b"']))).toThrow(/après « partager … avec », on écrit « titre/);
  });
});

describe('copier et partager — la RI', () => {
  it('donne la valeur, le message, le texte, le titre et le lien', () => {
    const { application } = compiler(BILLET);
    const actions = application!.ecrans[0].gestionnaires.map((g) => g.actions[0]) as any[];
    expect(actions[0]).toMatchObject({ type: 'copie', message: 'Copié' });
    expect(actions[2].message).toBeNull();
    expect(actions[3].lien).toMatchObject({ ecran: 'produit' });
    expect(actions[4].lien).toEqual({ externe: 'https://reystore.cd' });
  });
});

describe('copier et partager — les cibles', () => {
  it('web : copier et partager de src/humalis/presse-papier.ts, l’adresse complète de la page', () => {
    const fichiers = web(BILLET);
    const page = fichier(fichiers, 'pages/Billet.tsx');
    expect(page).toContain('async function quandCliqueCopierLeCode() {\n    await copier(code, afficherMessage);');
    expect(page).toContain("await copier(formaterNombre(prix), afficherMessage, 'Prix copié');");
    expect(page).toContain('await copier(`${code} à ${formaterNombre(prix)} FC`);');
    expect(page).toContain("await partager({ texte: `Regarde ce billet : ${code}`, titre: 'Mon billet', adresse: adresseAbsolue(`/produit/${encodeURIComponent(String(code))}`) }, afficherMessage);");
    expect(page).toContain("await partager({ texte: 'Rey Store', adresse: 'https://reystore.cd' }, afficherMessage);");
    expect(page).toContain("import { copier, partager, adresseAbsolue } from '../humalis/presse-papier';");
    const outil = fichier(fichiers, 'humalis/presse-papier.ts');
    expect(outil).toContain('navigator.clipboard.writeText(texte)');
    expect(outil).toContain("document.execCommand('copy')");
    expect(outil).toContain("erreur.name === 'AbortError'");
    expect(outil).toContain('Lien copié');
  });
  it('mobile : expo-clipboard (dans package.json seulement s’il sert) et Share', () => {
    const fichiers = mobile(BILLET);
    const outil = fichier(fichiers, 'humalis/presse-papier.ts');
    expect(outil).toContain('Clipboard.setStringAsync(texte)');
    expect(outil).toContain('Share.share(');
    expect(JSON.parse(fichier(fichiers, 'package.json')).dependencies['expo-clipboard']).toBe('57.0.2');
    expect(JSON.parse(fichier(mobile(p('>titre "a"')), 'package.json')).dependencies['expo-clipboard']).toBeUndefined();
  });
  it('statique : les mêmes outils dans humalis.js, seulement s’ils servent', () => {
    const fichiers = statique(BILLET);
    const page = fichier(fichiers, 'pages/billet.js');
    expect(page).toContain("await copier(prix === undefined ? '' : formaterNombre(prix), 'Prix copié');".replace("prix === undefined ? '' : ", ''));
    expect(page).toContain('await copier(`${code} à ${formaterNombre(prix)} FC`, null);');
    expect(page).toContain("adresse: new URL(`produit.html?id=${encodeURIComponent(String(code))}`, location.href).href");
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('async function partager({ texte, titre, adresse })');
    expect(fichier(statique(p('>titre "a"')), 'humalis/humalis.js')).not.toContain('copierTexte');
  });
});
