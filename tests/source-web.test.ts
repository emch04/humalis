import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { verifierSourcesPourLaCible } from '../src/cibles/sources.js';

const exemple = readFileSync(new URL('../exemples/sources.humalis', import.meta.url), 'utf8');
const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'boutique', adresse: 'http://localhost', source: 'b.humalis' });

describe('sources — cible web', () => {
  it("n'ajoute rien à un programme sans source : mêmes fichiers qu'avant", () => {
    const fichiers = web('page "a" :\n    texte "x"');
    expect(fichiers.has('src/humalis/sources.ts')).toBe(false);
    expect(fichiers.get('src/humalis/serveur.ts')).not.toContain('appelerSource');
  });

  it("écrit la description des sources, l'adresse modifiable par une variable d'environnement", () => {
    const fichiers = web(exemple);
    const sources = fichiers.get('src/humalis/sources.ts')!;
    expect(sources).toContain('import.meta.env.VITE_HUMALIS_SOURCE_BOUTIQUE ?? "http://127.0.0.1:4420"'.replace(/"/g, "'"));
    expect(sources).toContain("enveloppe: 'data'");
    expect(sources).toContain("erreur: 'message'");
    expect(fichiers.get('src/humalis/serveur.ts')).toContain('appelerSource');
    expect(fichiers.get('src/humalis/donnees.ts')).toContain('export interface Produit');
  });

  it("n'écrit qu'un seul identifiant dans une donnée qui déclare déjà « id »", () => {
    const donnees = web(exemple).get('src/humalis/donnees.ts')!;
    const debut = donnees.indexOf('export interface Produit');
    const produit = donnees.slice(debut, donnees.indexOf('}', debut));
    expect(produit.match(/^\s+id: string;/gm)).toHaveLength(1);
  });

  it("passe les paramètres d'adresse et le chemin de la valeur utile à la requête", () => {
    const page = web(exemple).get('src/pages/Catalogue.tsx')!;
    expect(page).toContain("{ source: 'boutique', filtres: { categorie: 'maillots' }, dans: 'products', contourner, relancer: () => charger2(true) }");
  });

  it('écrit un jeton public dans le code envoyé, avec sa place', () => {
    const source = 'source "carte" :\n    adresse "https://tuiles.example"\n    jeton public "pk_live_abc" dans l\'entete "X-Cle"\n    route "tuiles" :\n        lire une liste de tuile\n    donnee tuile :\n        nom : texte\npage "a" :\n    variable t = []\n    quand la page se charge :\n        envoyer requete vers "tuiles" de la source "carte" dans t\n    pour chaque x dans t :\n        texte x.nom';
    const sources = web(source).get('src/humalis/sources.ts')!;
    expect(sources).toContain("valeur: 'pk_live_abc'");
    expect(sources).toContain('"genre":"entete","nom":"X-Cle"');
  });

  it('un jeton secret ne produit rien : le programme est refusé et la valeur n\'est écrite nulle part', () => {
    const source = 'serveur "s" :\n    donnee d :\n        n : texte\n    route "d" :\n        tout le monde peut lire d\nsource "meteo" :\n    adresse "https://api.meteo.example"\n    jeton secret depuis l\'environnement "METEO_CLE"\n    route "previsions" :\n        tout le monde peut lire une liste de prevision dans "jours"\n    donnee prevision :\n        jour : texte\npage "a" :\n    texte "x"';
    const resultat = compiler(source);
    expect(resultat.application).toBeUndefined();
    expect(resultat.diagnostics.map((d) => d.message).join('\n')).toMatch(/passerelle n'est pas encore disponible/);
  });
});

describe('sources — autres cibles', () => {
  it('le mobile et le statique refusent clairement une source', () => {
    const application = compiler(exemple).application!;
    expect(verifierSourcesPourLaCible(application, 'mobile')[0].message).toMatch(/pas encore disponible sur la cible mobile/);
    expect(verifierSourcesPourLaCible(application, 'statique')).toHaveLength(1);
  });

  it("le desktop permet l'origine d'une source absolue dans sa politique de contenu", () => {
    const fichiers = genererProjetDesktop(compiler(exemple).application!, { nom: 'boutique', source: 'b.humalis' });
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain('http://127.0.0.1:4420');
  });
});

describe('sources — supprimer et modifier', () => {
  it("écrit l'appel avec la source, et PUT pour « par remplacement »", () => {
    const fichiers = web(exemple);
    expect(fichiers.get('src/pages/Equipe.tsx')).toContain("serveur.supprimer('api/admin/equipe', m.id, { source: 'boutique' })");
    expect(fichiers.get('src/pages/Reglage.tsx')).toContain("{ source: 'boutique', remplacement: true }");
    expect(fichiers.get('src/humalis/serveur.ts')).toContain("appel.remplacement ? 'PUT' : 'PATCH'");
    expect(fichiers.get('src/humalis/serveur.ts')).toContain("adresse.includes(':id')");
  });
});

describe('sources — données imbriquées et noms en double', () => {
  it('écrit les interfaces imbriquées', () => {
    const donnees = web(exemple).get('src/humalis/donnees.ts')!;
    expect(donnees).toContain('export interface Variante');
    expect(donnees).toContain('variants: Variante[];');
  });

  it("donne un nom TypeScript valide à une donnée qui porte le nom d'une autre", () => {
    const source = 'serveur "s" :\n    donnee produit :\n        titre : texte\n    route "produits" :\n        tout le monde peut lire produit\nsource "boutique" :\n    adresse "https://a.example"\n    donnee produit :\n        name : texte\n    route "p" :\n        lire une liste de produit\npage "a" :\n    variable ps = []\n    quand la page se charge :\n        envoyer requete vers "p" de la source "boutique" dans ps\n    pour chaque x dans ps :\n        texte x.name';
    const donnees = web(source).get('src/humalis/donnees.ts')!;
    expect(donnees).toContain('export interface Produit {');
    expect(donnees).toContain('export interface BoutiqueProduit {');
    expect(web(source).get('src/pages/A.tsx')).toContain('useState<BoutiqueProduit[]>');
  });
});
