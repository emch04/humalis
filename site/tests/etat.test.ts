import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ETAT, CIBLES } from '../src/contenu/etat';

const readme = readFileSync(fileURLToPath(new URL('../../CONTRIBUER.md', import.meta.url)), 'utf8');
const lignesTableau = readme.split('\n').filter((l) => l.startsWith('|'));

describe('état du projet', () => {
  for (const ligne of ETAT) {
    it(`« ${ligne.nom} » correspond au README`, () => {
      const dansReadme = lignesTableau.find((l) => l.includes(ligne.readme));
      expect(dansReadme, `ligne « ${ligne.readme} » absente du README`).toBeDefined();
      const etat = dansReadme!.split('|')[2];
      if (ligne.fait) expect(etat).toMatch(/fait|faite|faites/);
      // Pas encore fait, ou écrit mais pas terminé (critère pas encore vérifié en vrai).
      else expect(etat).toMatch(/à faire|pas terminée/);
    });
  }

  it('chaque ligne du tableau du README est montrée sur le site', () => {
    const lignes = readme.split('\n');
    const debut = lignes.findIndex((l) => l.startsWith('| Étape |'));
    const tableau = lignes.slice(debut + 2).slice(0, lignes.slice(debut + 2).findIndex((l) => !l.startsWith('|')));
    const libelles = tableau.map((l) => l.split('|')[1].trim());
    expect(libelles.length).toBeGreaterThan(5);
    const manquantes = libelles.filter((l) => !ETAT.some((e) => l.includes(e.readme)));
    expect(manquantes).toEqual([]);
  });

  it('toutes les cibles existent et sont essayées en vrai', () => {
    expect(ETAT.find((l) => l.nom === 'Lexer')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Parser')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible web (React, prérendue)')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Commande humalis compile')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible serveur (Node + packs Astratra)')?.fait).toBe(true);
    // Essayées sur un Mac le 2026-10-30 : le simulateur iPhone et l'application Electron.
    expect(ETAT.find((l) => l.nom === 'Cible mobile (Expo)')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible desktop (Electron)')?.fait).toBe(true);
    expect(CIBLES.filter((c) => c.terminee).map((c) => c.cible)).toEqual(['Web', 'Serveur', 'Mobile', 'Desktop', 'Statique']);
    expect(ETAT.find((l) => l.nom === 'Cible statique (HTML, CSS, JavaScript)')?.fait).toBe(true);
    expect(CIBLES.filter((c) => c.disponible).map((c) => c.cible)).toEqual(['Web', 'Serveur', 'Mobile', 'Desktop', 'Statique']);
  });

  it('les étapes des cibles se suivent dans l’ordre de la feuille de route', () => {
    const etapes = CIBLES.map((c) => c.etape);
    expect(etapes).toEqual([...etapes].sort((a, b) => a - b));
    expect(new Set(etapes).size).toBe(etapes.length);
  });
});
