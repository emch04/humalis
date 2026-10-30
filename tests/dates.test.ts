import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { decalerDate, joursEntre, formaterDepuis } from '../src/cibles/format.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 2) : aujourd'hui, maintenant, plus 3 jours, jours entre, {x depuis}.
const LIVRAISON = programme(
  'page "livraison" :',
  '>titre "Livraison"',
  '>calcul jour = aujourd\'hui',
  '>calcul livraison = aujourd\'hui plus 3 jours',
  '>calcul rappel = livraison moins 1 semaine',
  '>calcul attente = jours entre jour et livraison',
  '>variable commande = maintenant',
  '>texte "Livrée le {livraison}, dans {attente} jours"',
  '>texte "Commandée {commande depuis}"',
);

describe('les dates — les outils', () => {
  it('décaler, compter les jours, dire depuis quand', () => {
    expect(decalerDate('2026-10-30', 3, 'jours')).toBe('2026-11-02');
    expect(decalerDate('2026-10-30', -1, 'semaines')).toBe('2026-10-23');
    expect(decalerDate('2026-01-31', 1, 'mois')).toBe('2026-02-28');
    expect(joursEntre('2026-10-30', '2026-11-02')).toBe(3);
    const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(formaterDepuis(ilYA(10_000))).toBe('à l’instant');
    expect(formaterDepuis(ilYA(2 * 3600_000))).toBe('il y a 2 heures');
    expect(formaterDepuis(ilYA(3 * 86400_000))).toBe('il y a 3 jours');
  });
});

describe('les dates — l’analyse', () => {
  it('accepte aujourd’hui, maintenant, plus et moins, jours entre, depuis', () => {
    expect(erreurs(LIVRAISON)).toEqual([]);
  });

  it('« plus 3 jours » attend un nombre', () => {
    expect(erreurs(programme('page "a" :', '>titre "A"', '>calcul d = aujourd\'hui plus "trois" jours', '>texte "{d}"')).join('\n')).toMatch(/attend un nombre/);
  });

  it('« aujourdhui », « maintenant » et « jours » restent des noms ailleurs', () => {
    expect(erreurs(programme('page "a" :', '>titre "A"', '>variable maintenant = 1', '>variable jours = 2', '>texte "{maintenant} {jours}"'))).toEqual([]);
  });
});

describe('les dates — les cibles', () => {
  it('web : des outils lisibles, et la date écrite en français', () => {
    const fichiers = genererProjetWeb(compiler(LIVRAISON).application!, { nom: 'l', adresse: 'https://l.cd', source: 'l.humalis' });
    const page = fichiers.get('src/pages/Livraison.tsx')!;
    expect(page).toContain('const livraison = decalerDate(dateDuJour(), 3, \'jours\');');
    expect(page).toContain('const attente = joursEntre(jour, livraison);');
    expect(page).toContain('${formaterDate(livraison)}');
    expect(page).toContain('${formaterDepuis(commande)}');
    expect(fichiers.get('src/humalis/outils.ts')).toContain('export function dateDuJour(');
  });

  it('site statique : le HTML de départ ne fige pas une date fausse', () => {
    const fichiers = genererProjetStatique(compiler(LIVRAISON).application!, { nom: 'l', source: 'l.humalis' });
    expect(fichiers.get('index.html')).not.toMatch(/\d{4}/);
    expect(fichiers.get('pages/livraison.js')).toContain('dateDuJour()');
  });
});
