import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { programme } from '../analyse/aide.js';
import { p, corps, web, statique, mobile, fichier, erreurs, avertissements } from './aide.js';

const PRODUITS = programme(
  'page "produits" :',
  '>variable produits = ["Robe", "Pagne"]',
  '>titre "Produits"',
  '>bouton "Détails" avec nom "voir_details"',
  '>fenetre "Détails du produit" avec description "Tout sur la robe" :',
  '>>texte "Robe wax, taille M"',
  '>>bouton "Fermer"',
  '>>quand l\'utilisateur clique sur "Fermer" :',
  '>>>cacher "Détails du produit"',
  '>quand l\'utilisateur clique sur "voir_details" :',
  '>>montrer "Détails du produit"',
  '>pour chaque nom dans produits :',
  '>>texte nom',
  '>>bouton "Supprimer {nom}" avec nom "supprimer"',
  '>>quand l\'utilisateur clique sur "supprimer" :',
  '>>>confirmer "Supprimer {nom} ?" avec oui "Supprimer" et non "Garder" :',
  '>>>>retirer nom de produits',
  '>>>>afficher reussite "Produit supprimé"',
  '>>>sinon :',
  '>>>>afficher "Suppression annulée"',
);

describe('fenêtres et confirmations — le parser', () => {
  it('lit la fenêtre, ses options et son contenu ; la question, ses boutons et ses deux blocs', () => {
    const instructions = corps(PRODUITS) as any[];
    const fenetre = instructions.find((i) => i.type === 'Fenetre');
    expect(fenetre).toMatchObject({ titre: 'Détails du produit', description: 'Tout sur la robe' });
    expect(fenetre.corps.map((i: any) => i.type)).toEqual(['Element', 'Element', 'Evenement']);
    const boucle = instructions.find((i) => i.type === 'Boucle');
    const question = boucle.corps.find((i: any) => i.type === 'Evenement').corps[0];
    expect(question).toMatchObject({ type: 'Confirmer', oui: 'Supprimer', non: 'Garder' });
    expect(question.alors).toHaveLength(2);
    expect(question.sinon).toHaveLength(1);
  });
  it('laisse « fenetre » et « confirmer » libres ailleurs', () => {
    expect(erreurs(p('>variable fenetre = 1', '>variable confirmer = 2', '>texte "{fenetre} {confirmer}"'))).toEqual([]);
  });
});

describe('fenêtres et confirmations — l’analyse', () => {
  it('accepte l’exemple sans avertissement', () => {
    expect(erreurs(PRODUITS)).toEqual([]);
    expect(avertissements(PRODUITS)).toEqual([]);
  });
  it('refuse une fenêtre dans une fenêtre, deux fenêtres du même nom, une fenêtre dans un événement', () => {
    expect(erreurs(p('>fenetre "A" :', '>>fenetre "B" :', '>>>texte "b"', '>>texte "a"'))[0]).toMatch(/une fenêtre dans une fenêtre/);
    expect(erreurs(p('>fenetre "A" :', '>>texte "a"', '>fenetre "A" :', '>>texte "b"'))[0]).toMatch(/deux fenêtres s’appellent « A »/);
  });
  it('avertit d’une fenêtre jamais ouverte, et d’une fenêtre obligatoire sans issue', () => {
    expect(avertissements(p('>fenetre "A" :', '>>texte "a"'))[0]).toMatch(/ne s’ouvre jamais/);
    const obligatoire = p('>bouton "Ouvrir"', '>quand l\'utilisateur clique sur "Ouvrir" :', '>>montrer "A"', '>fenetre "A" avec obligatoire :', '>>texte "a"');
    expect(avertissements(obligatoire)[0]).toMatch(/obligatoire, et rien ne la ferme/);
  });
  it('refuse « confirmer » hors d’un événement, sans rien à faire, avec deux boutons pareils', () => {
    expect(erreurs(p('>confirmer "Sûr ?" :', '>>afficher "a"'))[0]).toMatch(/pose une question à la personne/);
    expect(erreurs(p('>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>confirmer "Sûr ?" avec oui "OK" et non "ok" :', '>>>afficher "a"'))[0]).toMatch(/les deux boutons de la question s’appellent « OK »/);
  });
});

describe('fenêtres et confirmations — la RI et les cibles', () => {
  it('RI : un nœud « fenetre » et une action « confirmation » à deux branches', () => {
    const ecran = compiler(PRODUITS).application!.ecrans[0];
    const fenetre = ecran.vue.find((n) => n.type === 'fenetre') as any;
    expect(fenetre).toMatchObject({ id: 'fenetre_details_du_produit', titre: 'Détails du produit' });
    const boucle = ecran.vue.find((n) => n.type === 'repetition') as any;
    expect(boucle.gestionnaires[0].actions[0]).toMatchObject({ type: 'confirmation', oui: 'Supprimer', non: 'Garder' });
  });
  it('web : <Fenetre> fermée au départ, la question attendue, le fournisseur seulement s’il sert', () => {
    const fichiers = web(PRODUITS);
    const page = fichier(fichiers, 'pages/Produits.tsx');
    expect(page).toContain("'fenetre_details_du_produit': false");
    expect(page).toContain(
      `<Fenetre ouverte={visibilite['fenetre_details_du_produit']} fermer={() => setVisibilite((v) => ({ ...v, 'fenetre_details_du_produit': false }))} titre="Détails du produit" description="Tout sur la robe">`,
    );
    expect(page).toContain("if (await confirmer(`Supprimer ${nom} ?`, { oui: 'Supprimer', non: 'Garder' })) {");
    expect(page).toContain('} else {');
    expect(page).toMatch(/async function quandCliqueSupprimer\(nom: string\)/);
    expect(page).toContain("import { confirmer } from '../humalis/confirmation';");
    expect(page).toContain("import { Fenetre } from '../humalis/fenetre';");
    const fenetre = fichier(fichiers, 'humalis/fenetre.tsx');
    expect(fenetre).toContain('element.showModal()');
    expect(fenetre).toContain('aria-label="Fermer"');
    const question = fichier(fichiers, 'humalis/confirmation.ts');
    expect(question).toContain("fenetre.setAttribute('role', 'alertdialog');");
    expect(question).toContain('non.focus();');
    const css = fichier(fichiers, 'styles.css');
    expect(css).toContain('.humalis-fenetre::backdrop');
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n {2}\.humalis-fenetre\[open\]/);
    expect(fichier(web(p('>titre "a"')), 'humalis/confirmation.ts')).toBe('');
  });
  it('mobile : Modal, et une seule fenêtre de question dans app/_layout.tsx', () => {
    const fichiers = mobile(PRODUITS);
    const page = fichier(fichiers, 'app/index.tsx');
    expect(page).toContain('const confirmer = useConfirmer();');
    expect(page).toContain("import { useConfirmer } from '../humalis/confirmation';");
    expect(fichier(fichiers, 'humalis/fenetre.tsx')).toContain('onRequestClose={fermerSiPermis}');
    expect(fichier(fichiers, 'humalis/confirmation.tsx')).toContain('export function Confirmations');
    expect(fichier(fichiers, 'app/_layout.tsx')).toContain('<Confirmations>');
  });
  it('statique : un <dialog> fermé dans le HTML de départ, humalis.fenetre et humalis.confirmer', () => {
    const fichiers = statique(PRODUITS);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<dialog data-humalis="fenetre_details_du_produit" class="humalis-fenetre" aria-labelledby="fenetre_details_du_produit-titre" aria-describedby="fenetre_details_du_produit-description">');
    expect(html).not.toMatch(/<dialog[^>]* open/);
    const page = fichier(fichiers, 'pages/produits.js');
    expect(page).toContain("fenetre('fenetre_details_du_produit', { titre: 'Détails du produit'");
    expect(page).toContain("if (await confirmer(`Supprimer ${nom} ?`, { oui: 'Supprimer', non: 'Garder' })) {");
    const outils = fichier(fichiers, 'humalis/humalis.js');
    expect(outils).toContain('function ouvrirLesFenetres(repere)');
    expect(outils).toContain('function confirmer(question, boutons = {})');
    expect(fichier(fichiers, 'humalis/styles.css')).toContain('.humalis-fenetre::backdrop');
  });
});
