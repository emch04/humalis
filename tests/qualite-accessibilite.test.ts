import { it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { contraste } from '../src/analyse/couleurs.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';

const verifier = (corps: string) => compiler(`page "accueil" :\n${corps.split('\n').map((l) => `    ${l}`).join('\n')}`).diagnostics;

it('signale les images sans description et les descriptions inutiles', () => {
  // Sans description ni « decoratif », c'est une erreur (décision M4), plus un simple avertissement.
  expect(verifier('titre "Accueil"\nimage "salle.jpg"').some((d) => d.gravite === 'erreur' && d.ligne === 3 && d.message.includes('décrivez l’image'))).toBe(true);
  expect(verifier('titre "Accueil"\nimage "salle.jpg" avec description "Une salle lumineuse"').filter((d) => d.categorie === 'accessibilite')).toHaveLength(0);
  expect(verifier('titre "Accueil"\nimage "salle.jpg" avec description "image"').some((d) => d.categorie === 'accessibilite')).toBe(true);
  expect(verifier('titre "Accueil"\nimage "filet.png" avec decoratif').filter((d) => d.categorie === 'accessibilite')).toHaveLength(0);
});

it('ne signale qu’une erreur pour chaque texte littéral vide', () => {
  for (const ligne of ['bouton ""', 'lien "" vers "accueil"', 'champ texte ""']) {
    const erreurs = verifier(`titre "Accueil"\n${ligne}`).filter((d) => d.gravite === 'erreur');
    expect(erreurs, ligne).toHaveLength(1);
    expect(erreurs[0].categorie).toBe('accessibilite');
    expect(erreurs[0].ligne).toBe(3);
  }
});

it('contrôle le contraste dans les deux modes avec les couleurs produites', () => {
  expect(verifier('titre "Accueil"\ntexte "Promo" avec couleur jaune').some((d) => d.message.includes('contraste'))).toBe(true);
  expect(verifier('titre "Accueil"\ntexte "Promo" avec couleur bleu').some((d) => d.message.includes('contraste'))).toBe(false);
});

it('calcule les rapports de contraste par la fonction partagée', () => {
  expect(contraste('#fff', '#000')).toBeCloseTo(21, 1);
  expect(contraste('#f2c200', '#fff')).toBeCloseTo(1.68, 1);
  expect(contraste('#ef5b3f', '#fff')).toBeGreaterThan(3);
});

it('applique le seuil du grand texte et n’accuse pas un fond seul', () => {
  expect(verifier('titre "Accueil"\ntexte "Promo" avec couleur jaune et taille grande').some((d) => d.message.includes('contraste'))).toBe(true);
  expect(verifier('titre "Accueil"\ntexte "Promo" avec fond jaune').some((d) => d.message.includes('contraste'))).toBe(false);
  const orange = verifier('titre "Accueil"\ntexte "Promo" avec couleur orange et taille grande');
  expect(orange.some((d) => d.message.includes('contraste'))).toBe(false);
});

it('signale un survol sans clic et les libellés répétés dans un formulaire', () => {
  const diagnostics = verifier('titre "Accueil"\nformulaire "contact" :\n    champ texte "Nom"\n    champ texte "Nom"\nquand l\'utilisateur survole "Accueil" :\n    afficher "ok"');
  expect(diagnostics.some((d) => d.categorie === 'accessibilite' && d.message.includes('deux champs'))).toBe(true);
  expect(diagnostics.some((d) => d.categorie === 'accessibilite' && d.message.includes('survol'))).toBe(true);
});

it('prévient pour les images, icônes et étoiles sans nom accessible', () => {
  for (const ligne of ['icone "panier"', 'etoiles 4', 'bouton "" avec icone "panier"']) {
    const diagnostics = verifier(`titre "Accueil"\n${ligne}`);
    expect(diagnostics.some((d) => d.categorie === 'accessibilite' && d.ligne === 3), ligne).toBe(true);
  }
});

it('prévient pour les liens peu parlants et les champs sans lettre', () => {
  const diagnostics = verifier('titre "Accueil"\nchamp texte ":"\nlien "ici" vers "accueil"');
  expect(diagnostics.some((d) => d.categorie === 'accessibilite' && d.message.includes('aucune lettre'))).toBe(true);
  expect(diagnostics.some((d) => d.categorie === 'accessibilite' && d.message.includes('lien'))).toBe(true);
});

it('produit les attributs des images décrites et décoratives sur chaque cible', () => {
  const source = 'page "accueil" :\n    titre "Accueil"\n    image "salle.jpg" avec description "Une salle claire"\n    image "filet.png" avec decoratif';
  const resultat = compiler(source);
  expect(resultat.application, JSON.stringify(resultat.diagnostics)).toBeDefined();
  const application = resultat.application!;
  const web = genererProjetWeb(application, { nom: 'essai', adresse: 'https://exemple.fr', source: 'essai.humalis' });
  const mobile = genererProjetMobile(application, { nom: 'essai', source: 'essai.humalis' });
  const statique = genererProjetStatique(application, { nom: 'essai', source: 'essai.humalis' });
  const textes = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');
  expect(textes(web)).toContain('alt="Une salle claire"');
  expect(textes(web)).toContain('alt="" aria-hidden="true"');
  expect(textes(mobile)).toContain('accessibilityLabel="Une salle claire"');
  expect(textes(mobile)).toContain('accessible={false}');
  expect(textes(statique)).toContain('alt="Une salle claire"');
  expect(textes(statique)).toContain('aria-hidden="true"');
});

it('vérifie l’ordre des sous-titres et leur niveau', () => {
  const avant = verifier('soustitre "Section"\ntitre "Accueil"');
  expect(avant.some((d) => d.categorie === 'accessibilite' && d.message.includes('avant')), JSON.stringify(avant)).toBe(true);
  const saut = verifier('titre "Accueil"\nsoustitre "Section" avec niveau 2\nsoustitre "Détail" avec niveau 4');
  expect(saut.some((d) => d.categorie === 'accessibilite' && d.message.includes('saut'))).toBe(true);
  expect(verifier('titre "Accueil"\nsoustitre "Section" avec niveau 2').filter((d) => d.categorie === 'accessibilite')).toHaveLength(0);
  expect(verifier('titre "Accueil"\nsoustitre "Section" avec niveau 7').some((d) => d.gravite === 'erreur' && d.categorie === 'accessibilite')).toBe(true);
});
