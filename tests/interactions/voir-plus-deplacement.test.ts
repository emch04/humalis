import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { verifierPourLeMobile } from '../../src/cibles/mobile/projet.js';
import { verifierPourLeStatique } from '../../src/cibles/statique/projet.js';
import { programme } from '../analyse/aide.js';
import { p, corps, web, statique, mobile, compile, fichier, erreurs, avertissements } from './aide.js';

const CATALOGUE = programme(
  'page "catalogue" :',
  '>variable produits = []',
  '>variable nouveaux = []',
  '>variable numero = 1',
  '>variable il_reste = vrai',
  '>titre "Catalogue"',
  '>section "Nos produits" avec nom "catalogue" :',
  '>>pour chaque produit dans produits :',
  '>>>texte produit',
  '>quand l\'utilisateur arrive en bas de "catalogue" tant que il_reste est vrai avec bouton "Voir plus de produits" :',
  '>>envoyer requete vers "/produits" avec numero dans nouveaux',
  '>>pour chaque n dans nouveaux :',
  '>>>ajouter n a produits',
  '>>changer numero par numero + 1',
  '>>si nouveaux est vide :',
  '>>>changer il_reste par faux',
);

const TACHES = programme(
  'page "taches" :',
  '>variable taches = ["Acheter du pain", "Appeler Rey", "Écrire le plan"]',
  '>titre "Tâches"',
  '>pour chaque t dans taches avec deplacement :',
  '>>texte t',
  '>quand l\'ordre de taches change :',
  '>>afficher reussite "Ordre enregistré"',
);

describe('défilement infini', () => {
  it('le parser lit le bloc nommé, la condition et le bouton', () => {
    const instructions = corps(CATALOGUE) as any[];
    expect(instructions.find((i) => i.type === 'Bloc').nom).toBe('catalogue');
    const bas = instructions.find((i) => i.type === 'Evenement');
    expect(bas).toMatchObject({ genre: 'bas', cible: 'catalogue', bouton: 'Voir plus de produits' });
    expect(bas.tantQue).toBeDefined();
  });
  it('l’analyse accepte l’exemple, refuse un bloc inconnu, avertit sans bouton ou quand rien ne grandit', () => {
    expect(erreurs(CATALOGUE)).toEqual([]);
    expect(avertissements(CATALOGUE)).toEqual([]);
    expect(erreurs(p('>quand l\'utilisateur arrive en bas de "liste" :', '>>afficher "a"'))[0]).toMatch(/aucun bloc nommé « liste »/);
    const sansBouton = p('>variable l = []', '>section avec nom "liste" :', '>>texte "a"', '>quand l\'utilisateur arrive en bas de "liste" sans bouton :', '>>ajouter 1 a l');
    expect(avertissements(sansBouton)[0]).toMatch(/sans bouton « Voir plus »/);
    expect(avertissements(p('>section avec nom "liste" :', '>>texte "a"', '>quand l\'utilisateur arrive en bas de "liste" :', '>>afficher "a"'))[0]).toMatch(/rien ne grandit/);
  });
  it('web : la sentinelle observée et le vrai bouton, retirés quand la condition est fausse', () => {
    const fichiers = web(CATALOGUE);
    const page = fichier(fichiers, 'pages/Catalogue.tsx');
    expect(page).toContain('const voirPlusCatalogue = useVoirPlus(quandArriveEnBasCatalogue, ilReste);');
    expect(page).toContain('{ilReste && (');
    expect(page).toContain('<div ref={voirPlusCatalogue.sentinelle} className="humalis-sentinelle" aria-hidden="true" />');
    expect(page).toContain('<button type="button" className="humalis-voir-plus" disabled={voirPlusCatalogue.enCours} aria-busy={voirPlusCatalogue.enCours} onClick={() => void voirPlusCatalogue.charger()}>Voir plus de produits</button>');
    expect(fichier(fichiers, 'humalis/voir-plus.ts')).toContain("rootMargin: '400px'");
  });
  it('mobile : le bouton seul, et un avertissement', () => {
    expect(fichier(mobile(CATALOGUE), 'app/index.tsx')).toContain('onPress={() => void voirPlusCatalogue.charger()}');
    expect(verifierPourLeMobile(compile(CATALOGUE)).map((d) => d.message).join('\n')).toMatch(/la suite se charge avec le bouton « Voir plus »/);
  });
  it('statique : la sentinelle et le bouton dans le HTML de départ, observés par humalis.js', () => {
    const fichiers = statique(CATALOGUE);
    expect(fichier(fichiers, 'index.html')).toContain('<button type="button" class="humalis-voir-plus" data-humalis="bloc_catalogue-voir-plus">Voir plus de produits</button>');
    expect(fichier(fichiers, 'pages/catalogue.js')).toContain("onbas: quandArriveEnBasCatalogue");
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('function observerLeBas()');
  });
});

describe('glisser-déposer (réordonner une liste)', () => {
  it('le parser lit « avec deplacement » et l’événement de l’ordre', () => {
    const instructions = corps(TACHES) as any[];
    expect(instructions.find((i) => i.type === 'Boucle').deplacement).toBe(true);
    expect(instructions.find((i) => i.type === 'Evenement')).toMatchObject({ genre: 'ordre', variable: 'taches' });
  });
  it('l’analyse accepte l’exemple, refuse une liste qui n’est pas une variable et un événement orphelin', () => {
    expect(erreurs(TACHES)).toEqual([]);
    expect(avertissements(TACHES)).toEqual([]);
    expect(erreurs(p('>calcul l = [1, 2]', '>pour chaque x dans l avec deplacement :', '>>texte "{x}"'))[0]).toMatch(/liste écrite dans une variable/);
    expect(erreurs(p('>variable l = [1]', '>quand l\'ordre de l change :', '>>afficher "a"'))[0]).toMatch(/personne ne déplace rien dans « l »/);
  });
  it('RI : la répétition « deplacement » et le déclencheur « ordre »', () => {
    const ecran = compiler(TACHES).application!.ecrans[0];
    expect((ecran.vue.find((n) => n.type === 'repetition') as any).deplacement).toBe(true);
    expect(ecran.gestionnaires[0]).toMatchObject({ declencheur: 'ordre', variable: 'taches' });
  });
  it('web : useDeplacement, chaque élément focalisable, l’annonce pour le lecteur d’écran', () => {
    const fichiers = web(TACHES);
    const page = fichier(fichiers, 'pages/Taches.tsx');
    expect(page).toContain('const deplacementTaches = useDeplacement(taches, setTaches, (element) => String(element), quandOrdreChangeTaches);');
    expect(page).toContain('<div role="list" className="humalis-liste-deplacable">');
    expect(page).toContain('<div role="listitem" {...deplacementTaches.element(indexT)} key={indexT}>');
    expect(page).toContain('<p className="humalis-annonce-cachee" aria-live="assertive">{deplacementTaches.annonce}</p>');
    const deplacer = fichier(fichiers, 'humalis/deplacer.ts');
    expect(deplacer).toContain("evenement.key === 'ArrowUp'");
    expect(deplacer).toContain('setPointerCapture');
    expect(fichier(fichiers, 'styles.css')).toContain('.humalis-deplacable');
  });
  it('mobile : monter et descendre (boutons et actions du lecteur d’écran), avec un avertissement', () => {
    const fichiers = mobile(TACHES);
    expect(fichier(fichiers, 'app/index.tsx')).toContain('onPress={() => deplacementTaches.monter(indexT)}');
    expect(fichier(fichiers, 'humalis/deplacer.ts')).toContain("{ name: 'monter', label: 'Monter' }");
    expect(verifierPourLeMobile(compile(TACHES)).map((d) => d.message).join('\n')).toMatch(/montent et descendent avec deux boutons/);
  });
  it('statique : refusé avec la raison', () => {
    expect(verifierPourLeStatique(compile(TACHES))[0].message).toMatch(/ne peut pas encore être produit pour le site statique/);
  });
});
