import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { adresseDuLien, adresseDuLienJs } from '../src/cibles/commun/liens-et-champs.js';
import { programme } from './analyse/aide.js';

// Les phrases validées par Emch le 11 novembre 2026 : « lien "…" vers variable » et « champ "…" avec valeur … ».
const sansErreur = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};
const messages = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message).join('\n');
const fichier = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';
const web = (source: string) => genererProjetWeb(sansErreur(source), { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
const moteur = (source: string) => genererProjetMoteur(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const statique = (source: string) => genererProjetStatique(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const mobile = (source: string) => genererProjetMobile(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const pageApple = (source: string) => fichier(genererProjetApple(sansErreur(source), { nom: 'a', source: 'a.humalis' }).fichiers, 'PageAccueil.swift');

const LIENS = programme(
  'page "accueil" :',
  '>variable site = "https://exemple.fr"',
  '>variable reglage = fiche avec aide "contact" et boutique "https://exemple.fr/boutique"',
  '>titre "Essai"',
  '>lien "Notre site" vers site',
  '>lien "Aide" vers reglage.aide',
  '>lien "Boutique" vers reglage.boutique avec nouvel onglet',
  'page "contact" :',
  '>titre "Contact"',
);

describe('« lien "…" vers variable » : l’analyse', () => {
  it('lit une variable ou le champ d’une fiche après « vers »', () => {
    sansErreur(LIENS);
  });
  it('refuse une variable qui n’est pas un texte', () => {
    expect(messages(programme('page "accueil" :', '>variable n = 3', '>titre "a"', '>lien "Voir" vers n'))).toContain('un lien vers une variable attend une adresse en texte');
    expect(messages(programme('page "accueil" :', '>variable reglage = fiche avec site "x"', '>titre "a"', '>lien "Voir" vers reglage'))).toContain('« reglage » est');
  });
  it('ne vaut que pour un lien', () => {
    expect(messages(programme('page "accueil" :', '>variable site = "x"', '>titre "a"', '>texte "Voir" vers site'))).toContain('s\'applique à un lien');
  });
  it('dit quelle variable manque', () => {
    expect(messages(programme('page "accueil" :', '>titre "a"', '>lien "Voir" vers sitee'))).toMatch(/sitee/);
  });
  it('garde « vers "page" » et « vers "https://…" » comme avant', () => {
    sansErreur(programme('page "accueil" :', '>titre "a"', '>lien "Contact" vers "contact"', '>lien "Ailleurs" vers "https://exemple.fr"', 'page "contact" :', '>titre "c"'));
  });
});

describe('« lien "…" vers variable » : l’adresse est filtrée', () => {
  const interne = (chemin: string) => `/${chemin}`;
  const enJs = new Function(`${adresseDuLienJs('f', (c) => `'/' + ${c}`)}\nreturn f;`)() as (v: unknown) => string | undefined;
  const cas: [unknown, string | undefined][] = [
    ['https://exemple.fr', 'https://exemple.fr'],
    ['  HTTP://exemple.fr  ', 'HTTP://exemple.fr'],
    ['mailto:bonjour@exemple.fr', 'mailto:bonjour@exemple.fr'],
    ['tel:+33100000000', 'tel:+33100000000'],
    ['contact', '/contact'],
    ['/contact', '/contact'],
    ['//ailleurs.fr', '/ailleurs.fr'],
    ['/\\ailleurs.fr', '/ailleurs.fr'],
    ['javascript:alert(1)', undefined],
    ['JavaScript:alert(1)', undefined],
    ['java\tscript:alert(1)', undefined],
    ['\u0001javascript:alert(1)', undefined],
    ['data:text/html,x', undefined],
    [null, '/'],
  ];
  it('à la compilation et dans le code produit, pareil', () => {
    for (const [valeur, attendu] of cas) {
      expect(adresseDuLien(valeur, interne), String(valeur)).toBe(attendu);
      expect(enJs(valeur), String(valeur)).toBe(attendu);
    }
  });
});

describe('« lien "…" vers variable » : le rendu', () => {
  it('web : LienAdresse décide à l’affichage (page du site ou adresse externe)', () => {
    const fichiers = web(LIENS);
    const page = fichier(fichiers, 'pages/Accueil.tsx');
    expect(page).toContain('<LienAdresse adresse={site} data-humalis="lien_notre_site">Notre site</LienAdresse>');
    expect(page).toContain('<LienAdresse adresse={reglage.boutique} target="_blank" rel="noopener noreferrer" data-humalis="lien_boutique">Boutique</LienAdresse>');
    expect(page).toContain("import { LienAdresse } from '../humalis/navigation';");
    const navigation = fichier(fichiers, 'humalis/navigation.tsx');
    expect(navigation).toContain('export function LienAdresse(');
    expect(navigation).toContain("['http', 'https', 'mailto', 'tel'].includes(schema)");
  });
  it('moteur : l’attribut href suit la variable', () => {
    const fichiers = moteur(LIENS);
    const couche = fichier(fichiers, 'couches/accueil.js');
    expect(couche).toContain("attribut(r[0], 'href', () => adresseDuLien(site.v));");
    expect(couche).toContain("import { adresseDuLien } from '../humalis/navigation.js';");
    expect(fichier(fichiers, 'humalis/navigation.js')).toContain('export function adresseDuLien(valeur) {');
    // Le HTML de départ a déjà la bonne adresse.
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<a href="https://exemple.fr" data-humalis="lien_notre_site"');
    expect(html).toContain('<a href="/contact" data-humalis="lien_aide"');
    expect(html).toContain('<a href="https://exemple.fr/boutique" target="_blank" rel="noopener noreferrer" data-humalis="lien_boutique"');
  });
  it('bureau : le même lien que le moteur, ou que React', () => {
    const surMoteur = genererProjetDesktop(sansErreur(LIENS), { nom: 'a', source: 'a.humalis', moteur: 'humalis' });
    expect([...surMoteur.values()].join('\n')).toContain('adresseDuLien(site.v)');
    const surReact = genererProjetDesktop(sansErreur(LIENS), { nom: 'a', source: 'a.humalis' });
    expect([...surReact.values()].join('\n')).toContain('<LienAdresse adresse={site}');
  });
  it('statique : l’adresse en HTML de départ, puis dans le script', () => {
    const fichiers = statique(LIENS);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<a href="https://exemple.fr" data-humalis="lien_notre_site">Notre site</a>');
    expect(html).toContain('<a href="contact.html" data-humalis="lien_aide">Aide</a>');
    expect(fichier(fichiers, 'pages/accueil.js')).toContain("creer('a', { href: adresseDuLien(site), 'data-humalis': 'lien_notre_site' }, 'Notre site')");
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('function adresseDuLien(valeur) {');
  });
  it('mobile : Link vers la page ou l’adresse externe ; sans lien si l’adresse est refusée', () => {
    const fichiers = mobile(LIENS);
    const page = fichier(fichiers, 'app/index.tsx');
    expect(page).toContain('<Link href={adresse} testID="lien_notre_site" style={s.lien}>Notre site</Link>)(adresseDuLien(site))}</>');
    expect(page).toContain("import { adresseDuLien } from '../humalis/outils';");
    expect(fichier(fichiers, 'humalis/outils.ts')).toContain('export function adresseDuLien(valeur: unknown): string | undefined {');
  });
  it('Apple : allerVers ouvre la page ou l’adresse externe permise', () => {
    const page = pageApple(LIENS);
    expect(page).toContain('Button { Routeur.commun.allerVers(site) } label: {');
    expect(page).toContain('Button { Routeur.commun.allerVers(reglage.aide) } label: {');
  });
});

const CHAMPS = programme(
  'page "accueil" :',
  '>variable nom = "Camille"',
  '>variable produit = fiche avec prix 12',
  '>variable jour = "2026-11-11T10:00:00"',
  '>variable actif = vrai',
  '>titre "Profil"',
  '>formulaire "profil" :',
  '>>champ "Nom" avec valeur nom',
  '>>champ "Ville" avec valeur "Lyon" et obligatoire',
  '>>champ "Prix" avec valeur produit.prix',
  '>>champ date "Jour" avec valeur jour',
  '>>case a cocher "Actif" avec valeur actif',
  '>>bouton "Enregistrer"',
  '>quand le formulaire "profil" est soumis :',
  '>>changer nom par champ "Nom"',
);

describe('« champ "…" avec valeur … » : l’analyse', () => {
  it('lit une variable, un texte, le champ d’une fiche, et les options qui suivent', () => {
    sansErreur(CHAMPS);
  });
  it('une case à cocher attend vrai ou faux', () => {
    expect(messages(programme('page "accueil" :', '>variable actif = "oui"', '>titre "a"', '>case a cocher "Actif" avec valeur actif'))).toContain('la valeur de départ d’une case à cocher est vrai ou faux');
  });
  it('un champ attend un texte ou un nombre', () => {
    expect(messages(programme('page "accueil" :', '>variable villes = ["Lyon"]', '>titre "a"', '>champ "Ville" avec valeur villes'))).toContain('la valeur de départ d’un champ est un texte ou un nombre');
  });
  it('ne vaut que pour un champ, et pas dans « pour chaque »', () => {
    expect(messages(programme('page "accueil" :', '>titre "a" avec valeur "x"'))).toContain('l’option « valeur » s’applique à un champ');
    expect(messages(programme('page "accueil" :', '>variable villes = ["Lyon"]', '>titre "a"', '>pour chaque v dans villes :', '>>champ "Ville" avec valeur v'))).toContain('« pour chaque »');
  });
  it('« avec valeur » reste un paramètre de page après « vers "page" »', () => {
    sansErreur(programme('page "accueil" :', '>titre "a"', '>lien "Voir" vers "produit" avec valeur 3', 'page "produit" avec parametre valeur :', '>titre "p"'));
  });
});

describe('« champ "…" avec valeur … » : le rendu', () => {
  it('web : l’état part de la valeur, la suit tant que le champ n’a pas changé, et y revient après l’envoi', () => {
    const page = fichier(web(CHAMPS), 'pages/Accueil.tsx');
    expect(page).toContain("import { useEffect, useState, useRef } from 'react';");
    expect(page).toContain("const [champNom, setChampNom] = useState(String(nom ?? ''));");
    expect(page).toContain("const [champVille, setChampVille] = useState('Lyon');");
    expect(page).toContain("const [champJour, setChampJour] = useState(String(jour ?? '').slice(0, 10));");
    expect(page).toContain('const [champActif, setChampActif] = useState(Boolean(actif));');
    expect(page).toContain('setChampNom((actuelle) => (actuelle === suiviNom.current ? departNom : actuelle));');
    expect(page).toContain('}, [departNom]);');
    expect(page).toContain('setChampNom(departNom);');
  });
  it('web : une valeur qui lit un calcul est posée par l’effet', () => {
    const source = programme('page "accueil" :', '>variable prenom = "Camille"', '>calcul salut = "Bonjour {prenom}"', '>titre "a"', '>champ "Message" avec valeur salut');
    const page = fichier(web(source), 'pages/Accueil.tsx');
    expect(page).toContain("const [champMessage, setChampMessage] = useState('');");
    expect(page).toContain("const suiviMessage = useRef('');");
  });
  it('moteur : un effet remplit la boîte du champ tant qu’elle n’a pas changé', () => {
    const fichiers = moteur(CHAMPS);
    const couche = fichier(fichiers, 'couches/accueil.js');
    expect(couche).toContain("const departNom = String(nom.v ?? '');");
    expect(couche).toContain('if (champNom.x === suiviNom) champNom.v = departNom;');
    expect(couche).toContain('champNom.v = suiviNom;');
    expect(fichier(fichiers, 'index.html')).toContain('<input data-humalis="champ_nom" value="Camille"');
  });
  it('statique : le HTML de départ montre la valeur ; dessiner() la suit', () => {
    const fichiers = statique(CHAMPS);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<input data-humalis="champ_nom" value="Camille">');
    expect(html).toContain('<input data-humalis="champ_jour" type="date" value="2026-11-11">');
    expect(html).toContain('<input type="checkbox" data-humalis="champ_actif" checked="true">');
    const script = fichier(fichiers, 'pages/accueil.js');
    expect(script).toContain('if (champNom === suiviNom) champNom = departNom;');
    expect(script).toContain('champNom = suiviNom;');
  });
  it('mobile : le même état que sur le web', () => {
    const page = fichier(mobile(CHAMPS), 'app/index.tsx');
    expect(page).toContain("const [champNom, setChampNom] = useState(String(nom ?? ''));");
    expect(page).toContain('}, [departNom]);');
  });
  it('Apple : onChange(initial: true) pose la valeur, puis la suit', () => {
    const page = pageApple(CHAMPS);
    expect(page).toContain('@State private var champNomDepart: String? = nil');
    expect(page).toContain('.onChange(of: nom, initial: true) { _, nouvelle in if champNomDepart == nil || champNom == champNomDepart { champNom = nouvelle }; champNomDepart = nouvelle }');
    expect(page).toContain('.onChange(of: String(jour.prefix(10)), initial: true)');
    expect(page).toContain('.onChange(of: actif, initial: true)');
    expect(page).toContain('champNom = champNomDepart ?? ""');
  });
});

describe('« rediriger vers » sur mobile', () => {
  it('une adresse reçue passe par le filtre, et une adresse externe par le système', async () => {
    const { compiler } = await import('../src/compilateur.js');
    const { genererProjetMobile } = await import('../src/cibles/mobile/projet.js');
    const r = compiler(`page "accueil" :\n    titre "A"\n    variable cible = "contact"\n    bouton "Aller"\n    bouton "Dehors"\n    quand l'utilisateur clique sur "Aller" :\n        rediriger vers "{cible}"\n    quand l'utilisateur clique sur "Dehors" :\n        rediriger vers "https://exemple.com"\n\npage "contact" :\n    titre "Contact"\n`);
    const projet = genererProjetMobile(r.application!, { nom: 'a', source: 'a.humalis' });
    const page = projet.get('app/index.tsx')!;
    expect(page).not.toContain('allerVers(');
    expect(page).not.toContain('ouvrirExterne(');
    expect(page).toContain('adresseDuLien(String(');
    expect(page).toContain("void Linking.openURL('https://exemple.com')");
    expect(page).toMatch(/import \{[^}]*\bLinking\b[^}]*\} from 'react-native'/);
    expect(page).toMatch(/import \{[^}]*\badresseDuLien\b[^}]*\} from '\.\.\/humalis\/outils'/);
    expect(projet.get('humalis/outils.ts')).toContain('export function adresseDuLien');
  });
});
