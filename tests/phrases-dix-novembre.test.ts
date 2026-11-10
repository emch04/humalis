import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { programme } from './analyse/aide.js';

// Les phrases validées par Emch le 10 novembre 2026.
const sansErreur = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};
const web = (source: string) => genererProjetWeb(sansErreur(source), { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
const pageWeb = (source: string, nom = 'Accueil') => web(source).get(`src/pages/${nom}.tsx`)!;
const pageApple = (source: string) => [...genererProjetApple(sansErreur(source), { nom: 'a', source: 'a.humalis' }).fichiers.entries()].find(([k]) => k.endsWith('PageAccueil.swift'))![1];

describe('« non » et une condition comme valeur', () => {
  const source = programme(
    'page "accueil" :',
    '>variable ouvert = faux',
    '>variable role = "gerant"',
    '>calcul est_chef = role est dans ["gerant", "direction"]',
    '>calcul ferme = non ouvert',
    '>titre "Essai"',
    '>si est_chef est vrai :',
    '>>texte "Chef"',
    '>bouton "Basculer"',
    '>quand l\'utilisateur clique sur "Basculer" :',
    '>>changer ouvert par non ouvert',
  );
  it('devient du JavaScript', () => {
    const page = pageWeb(source);
    expect(page).toContain("const estChef = (['gerant', 'direction'].includes(role));");
    expect(page).toContain('const ferme = (!ouvert);');
    expect(page).toContain('setOuvert((!ouvert));');
  });
  it('devient du Swift', () => {
    const page = pageApple(source);
    expect(page).toContain('private var estChef: Bool { (["gerant", "direction"].contains(role)) }');
    expect(page).toContain('private var ferme: Bool { (!ouvert) }');
  });
  it('est un vrai ou faux pour l’analyse', () => {
    const r = compiler(programme('page "accueil" :', '>variable n = 1', '>calcul grand = n est superieur a 3', '>calcul double = grand * 2', '>titre "a"'));
    expect(r.diagnostics.some((d) => d.gravite === 'erreur')).toBe(true);
  });
});

describe('« {a la ligne} »', () => {
  it('va à la ligne, comme « {saut de ligne} »', () => {
    const page = pageWeb(programme('page "accueil" :', '>titre "a"', '>texte "Bonjour,{a la ligne}Merci."', '>texte "Un{à la ligne}Deux"'));
    expect(page).toContain("{'Bonjour,\\nMerci.'}");
    expect(page).toContain("{'Un\\nDeux'}");
  });
});

describe('le bouton à icône seule', () => {
  const source = programme('page "accueil" :', '>variable ouvert = vrai', '>titre "Essai"', '>bouton icone "fermer" avec nom "Fermer la fenêtre"', '>quand l\'utilisateur clique sur "Fermer la fenêtre" :', '>>changer ouvert par faux');
  it('ne montre que l’icône, et donne son nom au lecteur d’écran', () => {
    const page = pageWeb(source);
    expect(page).toContain('aria-label="Fermer la fenêtre"');
    expect(page).toMatch(/<button[^>]*aria-label="Fermer la fenêtre"[^>]*><XIcon className="humalis-icone" aria-hidden="true" \/><\/button>/);
  });
  it('sur Apple, l’icône porte le nom pour VoiceOver', () => {
    expect(pageApple(source)).toContain('Image(systemName: "xmark").accessibilityLabel(Text(verbatim: "Fermer la fenêtre"))');
  });
  it('sans nom, le compilateur l’explique', () => {
    const r = compiler(programme('page "accueil" :', '>titre "a"', '>bouton icone "fermer"'));
    expect(r.diagnostics.map((d) => d.message).join(' ')).toContain('a besoin d\'un nom');
  });
});
