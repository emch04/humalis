import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { auClic, p, corps, web, statique, mobile, fichier, erreurs, avertissements } from './aide.js';

const PAGE = p(
  '>variable compte = 10',
  '>variable copie = faux',
  '>variable actif = vrai',
  '>titre "Compte à rebours"',
  '>apres 3 secondes :',
  '>>afficher "Bienvenue"',
  '>toutes les 1 seconde tant que actif est vrai :',
  '>>changer compte par compte - 1',
  '>>si compte est egal a 0 :',
  '>>>arreter',
  '>texte "Il reste {compte} secondes"',
  '>bouton "Pause"',
  '>quand l\'utilisateur clique sur "Pause" :',
  '>>changer actif par faux',
  '>bouton "Copier le code"',
  '>quand l\'utilisateur clique sur "Copier le code" :',
  '>>changer copie par vrai',
  '>>apres 2 secondes :',
  '>>>changer copie par faux',
  '>si copie est vrai :',
  '>>texte "Copié !"',
);

describe('minuteries — le parser', () => {
  it('lit « apres » et « toutes les », la durée, « tant que » et le bloc', () => {
    const instructions = corps(PAGE);
    const [apres, toutes] = instructions.filter((i) => i.type === 'Minuterie') as any[];
    expect(apres.mode).toBe('apres');
    expect(apres.duree.unite).toBe('seconde');
    expect(toutes.mode).toBe('toutes');
    expect(toutes.tantQue.gauche.nom).toBe('actif');
    expect(toutes.corps).toHaveLength(2);
  });
  it('lit une durée décimale et une durée en variable', () => {
    const [minuterie] = corps(auClic(['apres 1,5 seconde :', '>afficher "a"'])).filter((i) => i.type === 'Evenement').flatMap((e: any) => e.corps) as any[];
    expect(minuterie.duree.valeur.valeur).toBe(1.5);
    expect(erreurs(auClic(['apres delai secondes :', '>afficher "a"'], ['>variable delai = 2']))).toEqual([]);
  });
  it('laisse « apres » et « toutes » libres ailleurs', () => {
    expect(erreurs(p('>variable apres = 1', '>variable toutes = 2', '>texte "{apres} {toutes}"'))).toEqual([]);
  });
  it('dit ce qui manque après le nombre', () => {
    expect(() => erreurs(auClic(['apres 3 :', '>afficher "a"']))).toThrow(/il manque l’unité de la durée/);
  });
});

describe('minuteries — l’analyse', () => {
  it('accepte la page de l’exemple sans avertissement', () => {
    expect(erreurs(PAGE)).toEqual([]);
    expect(avertissements(PAGE)).toEqual([]);
  });
  it('refuse « toutes les » sous 250 millisecondes, avertit sous une seconde', () => {
    expect(erreurs(auClic(['toutes les 100 millisecondes :', '>afficher "a"']))[0]).toMatch(/plus de quatre fois par seconde/);
    expect(avertissements(auClic(['toutes les 500 millisecondes :', '>afficher "a"']))[0]).toMatch(/moins d’une seconde/);
  });
  it('refuse une durée nulle et un « tant que » après « apres »', () => {
    expect(erreurs(auClic(['apres 0 seconde :', '>afficher "a"']))[0]).toMatch(/plus grande que zéro/);
    expect(erreurs(auClic(['apres 2 secondes tant que actif est vrai :', '>afficher "a"'], ['>variable actif = vrai']))[0]).toMatch(/ne passe qu’une fois/);
  });
  it('avertit d’une page qui se met à jour seule sans pause', () => {
    const source = p('>variable n = 0', '>toutes les 5 secondes :', '>>changer n par n + 1', '>texte "{n}"');
    expect(avertissements(source)[0]).toMatch(/se met à jour toute seule/);
    expect(avertissements(p('>variable n = 0', '>variable actif = vrai', '>toutes les 5 secondes tant que actif est vrai :', '>>changer n par n + 1', '>texte "{n}"'))).toEqual([]);
  });
  it('refuse une minuterie dans une fonction', () => {
    expect(erreurs(programme('fonction attendre avec n :', '>apres 2 secondes :', '>>rendre n', '>rendre n', 'page "p" :', '>texte "a"')).join('\n')).toMatch(/« apres … » s'écrit dans un événement/);
  });
  it('refuse une minuterie de page placée dans un bloc', () => {
    expect(erreurs(p('>section :', '>>apres 2 secondes :', '>>>afficher "a"'))[0]).toMatch(/premier niveau de la page/);
  });
  it('« arreter » est permis dans une minuterie', () => {
    expect(erreurs(auClic(['toutes les 2 secondes :', '>arreter']))).toEqual([]);
  });
});

describe('minuteries — la RI', () => {
  it('une minuterie de page devient un gestionnaire « minuterie » ; la durée est en millisecondes', () => {
    const { application } = compiler(PAGE);
    const ecran = application!.ecrans[0];
    const minuteries = ecran.gestionnaires.filter((g) => g.declencheur === 'minuterie');
    expect(minuteries).toHaveLength(2);
    const [apres, toutes] = minuteries.map((g) => g.actions[0]) as any[];
    expect(apres).toMatchObject({ type: 'minuterie', mode: 'apres', millisecondes: { type: 'nombre', valeur: 3000 } });
    expect(toutes.tantQue).toBeDefined();
    expect(toutes.corps[1].alors[0].type).toBe('arreter');
  });
});

describe('minuteries — les cibles', () => {
  it('web : useMinuterie pour la page, planifier pour un clic, nettoyés à la sortie', () => {
    const fichiers = web(PAGE);
    const page = fichier(fichiers, 'pages/P.tsx');
    expect(page).toContain("afficherMessage('Bienvenue', 'info');\n  }, 3000);");
    expect(page).toContain('useMinuterie((arreter) => {');
    expect(page).toContain('}, 1000, { repete: true, actif: actif });');
    expect(page).toContain('actuel.current.compte = actuel.current.compte - 1;');
    expect(page).toContain('if (actuel.current.compte === 0) {\n      arreter();\n      return;');
    expect(page).toContain('planifier(() => {');
    expect(page).toContain('}, 2000);');
    expect(page).toContain('const planifier = usePlanifier();');
    const temps = fichier(fichiers, 'humalis/temps.ts');
    expect(temps).toContain('document.hidden');
    expect(temps).toContain('clearInterval(minuterie);');
    expect(temps).not.toContain('AppState');
  });
  it('mobile : le même code, suspendu quand l’application passe en arrière-plan', () => {
    const fichiers = mobile(PAGE);
    expect(fichier(fichiers, 'app/index.tsx')).toContain('useMinuterie((arreter) => {');
    const temps = fichier(fichiers, 'humalis/temps.ts');
    expect(temps).toContain("AppState.currentState === 'active'");
    expect(temps).not.toContain('document.hidden');
  });
  it('statique : planifier et les minuteries de la page, redessinées à chaque tour', () => {
    const fichiers = statique(PAGE);
    const page = fichier(fichiers, 'pages/p.js');
    expect(page).toContain('const minuteries = [');
    expect(page).toContain('actif: () => actif,');
    expect(page).toContain('planifier(() => {\n    copie = false;\n  }, 2000);');
    expect(page).toContain('humalis.demarrer({ dessiner, minuteries });');
    const outils = fichier(fichiers, 'humalis/humalis.js');
    expect(outils).toContain('function planifier(faire, millisecondes, options = {})');
    expect(outils).toContain('reglerMinuteries();');
    // Le HTML de départ ne dépend pas des minuteries.
    expect(fichier(fichiers, 'index.html')).toContain('Il reste 10 secondes');
  });
});

import { programme } from '../analyse/aide.js';
