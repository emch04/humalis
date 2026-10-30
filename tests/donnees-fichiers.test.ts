import { describe, expect, it } from 'vitest';
import { lireCsv } from '../src/donnees/csv.js';
import { lireJson } from '../src/donnees/json.js';
import { compilerProjet } from '../src/fichiers.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';

describe('fichiers de données locales', () => {
  it('lit les guillemets, les virgules et les nombres français', () => {
    expect(lireCsv('nom;prix;disponible\r\n"Poisson, braisé";15 000;oui\r\n"Un ""grand"" plat";12,5;non'))
      .toEqual([{ nom: 'Poisson, braisé', prix: 15000, disponible: true }, { nom: 'Un "grand" plat', prix: 12.5, disponible: false }]);
  });

  it('reconnaît le séparateur hors des guillemets et garde les retours de ligne', () => {
    expect(lireCsv('"nom, affiché";prix\n"Livre\nbleu";12'))
      .toEqual([{ nom_affiche: 'Livre\nbleu', prix: 12 }]);
  });

  it('signale une colonne vide et une ligne mal formée', () => {
    expect(() => lireCsv('nom;;prix\na;b;2')).toThrow(/ligne 1.*colonne/i);
    expect(() => lireCsv('nom,prix\nLivre')).toThrow(/ligne 2/i);
    expect(() => lireCsv('nom;prix\nLivre;12\nCahier;')).toThrow(/ligne 3.*prix.*vide/i);
  });

  it('lit un tableau ou une fiche JSON et refuse les formes différentes', () => {
    expect(lireJson('[{"nom":"Livre","prix":2}]')).toEqual([{ nom: 'Livre', prix: 2 }]);
    expect(lireJson('{"nom":"Livre"}')).toEqual({ nom: 'Livre' });
    expect(() => lireJson('[{"prix":2},{"nom":"Livre"}]')).toThrow(/élément 2.*prix/i);
  });

  it('charge un CSV voisin et vérifie ses champs en lecture seule', () => {
    const fichiers = new Map([['/projet/produits.csv', 'nom;prix\nLivre;12']]);
    const projet = (corps: string) => compilerProjet('/projet/app.humalis', (p) => fichiers.get(p), `utiliser donnees "produits" depuis "./produits.csv"\npage "accueil" :\n${corps}`);
    expect(projet('    pour chaque p dans produits :\n        texte p.nom').diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const application = projet('    pour chaque p dans produits :\n        texte p.nom').application!;
    const html = genererProjetStatique(application, { nom: 'app', source: 'app.humalis' }).get('index.html')!;
    expect(html).toContain('Livre');
    for (const produire of [genererProjetWeb, genererProjetMobile, genererProjetDesktop]) {
      const fichiersProduits = produire(application, { nom: 'app', source: 'app.humalis' });
      expect([...fichiersProduits.values()].some((contenu) => contenu.includes('Livre'))).toBe(true);
    }
    expect(projet('    pour chaque p dans produits :\n        texte p.prixx').diagnostics.find((d) => d.gravite === 'erreur')!.message).toMatch(/produits.csv.*nom, prix.*prix/i);
    expect(projet('    bouton "Changer"\n    quand l\'utilisateur clique sur "Changer" :\n        changer produits par []').diagnostics.find((d) => d.gravite === 'erreur')!.message).toMatch(/vient d'un fichier/);
  });

  it('résout le CSV à côté du fichier Humalis importé', () => {
    const fichiers = new Map([
      ['/projet/pages/catalogue.humalis', 'utiliser donnees "produits" depuis "./produits.csv"\npage "catalogue" :\n    pour chaque p dans produits :\n        texte p.nom'],
      ['/projet/pages/produits.csv', 'nom;prix\nLivre;12'],
    ]);
    const resultat = compilerProjet('/projet/app.humalis', (p) => fichiers.get(p), 'utiliser fichier "./pages/catalogue.humalis"');
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(resultat.application).toBeDefined();
  });
});

describe('fichiers de données locales — rien de gardé dans le navigateur', () => {
  it('le site statique écrit les données dans la page, sans les garder le temps de la visite', () => {
    const disque = new Map([
      ['carte.humalis', 'utiliser donnees "plats" depuis "./plats.csv"\n\npage "carte" :\n    titre "La carte"\n    pour chaque p dans plats :\n        texte p.nom\n'],
      ['plats.csv', 'nom;prix\nPondu;8000\n'],
    ]);
    const resultat = compilerProjet('carte.humalis', (chemin) => disque.get(chemin), disque.get('carte.humalis')!);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const script = genererProjetStatique(resultat.application!, { nom: 'carte', source: 'carte.humalis' }).get('pages/carte.js')!;
    expect(script).toContain("let plats = [{ nom: 'Pondu', prix: 8000 }];");
    expect(script).not.toContain('humalis:carte:partage:plats');
  });
});
