import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { formaterNombre, formaterDate } from '../src/cibles/format.js';
import { programme } from './analyse/aide.js';

// Décision F1 : les nombres et les dates s'affichent au format français, sans rien écrire.
const RESTO = programme(
  'serveur "resto" :',
  '>donnee reservation :',
  '>>nom : texte',
  '>>jour : date',
  '>>personnes : nombre',
  '>route "reservations" :',
  '>>tout le monde peut lire reservation',
  '>>seul admin peut modifier reservation',
  '',
  'page "accueil" :',
  '>variable total = 28000',
  '>variable reservations = []',
  '>texte "Total : {total} FC"',
  '>quand la page se charge :',
  '>>envoyer requete vers "reservations" dans reservations',
  '>pour chaque r dans reservations :',
  '>>texte "{r.nom}, le {r.jour}, {r.personnes} personnes"',
);

const application = () => {
  const { application, diagnostics } = compiler(RESTO);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

describe('format français — les outils', () => {
  it('un nombre : espace des milliers et virgule décimale', () => {
    expect(formaterNombre(28000)).toBe('28 000');
    expect(formaterNombre(12)).toBe('12');
    expect(formaterNombre(3.5)).toBe('3,5');
    expect(formaterNombre(null)).toBe('');
  });

  it('une date du serveur : jour, mois en toutes lettres, année', () => {
    expect(formaterDate('2026-11-07')).toBe('7 novembre 2026');
    expect(formaterDate('2026-11-07T00:00:00.000Z')).toBe('7 novembre 2026');
    expect(formaterDate('pas une date')).toBe('pas une date');
    expect(formaterDate(undefined)).toBe('');
  });
});

describe('format français — la représentation intermédiaire', () => {
  it('chaque {…} d’un texte sait s’il est un nombre ou une date', () => {
    const vue = application().ecrans[0].vue;
    expect(vue[0]).toMatchObject({ contenu: { parties: [{ texte: 'Total : ' }, { variable: 'total', format: 'nombre' }, { texte: ' FC' }] } });
    const ligne = (vue[1] as Extract<typeof vue[number], { type: 'repetition' }>).corps[0];
    expect(ligne).toMatchObject({
      contenu: {
        parties: [
          { variable: 'r.nom' },
          { texte: ', le ' },
          { variable: 'r.jour', format: 'date' },
          { texte: ', ' },
          { variable: 'r.personnes', format: 'nombre' },
          { texte: ' personnes' },
        ],
      },
    });
    expect(ligne).not.toMatchObject({ contenu: { parties: [{ format: expect.anything() }] } });
  });
});

describe('format français — ce que produit chaque cible', () => {
  it('web : formaterNombre et formaterDate, pris dans humalis/outils', () => {
    const fichiers = genererProjetWeb(application(), { nom: 'resto', adresse: 'https://resto.exemple.cd', source: 'resto.humalis' });
    const page = fichiers.get('src/pages/Accueil.tsx')!;
    expect(page).toContain('`Total : ${formaterNombre(total)} FC`');
    expect(page).toContain('`${r.nom}, le ${formaterDate(r.jour)}, ${formaterNombre(r.personnes)} personnes`');
    expect(page).toContain("import { formaterDate, formaterNombre } from '../humalis/outils';");
    expect(fichiers.get('src/humalis/outils.ts')).toContain('export function formaterNombre(');
  });

  it('mobile : les mêmes outils', () => {
    const fichiers = genererProjetMobile(application(), { nom: 'resto', source: 'resto.humalis' });
    expect(fichiers.get('humalis/outils.ts')).toContain('export function formaterDate(');
    expect([...fichiers.values()].join('\n')).toContain('${formaterNombre(total)}');
  });

  it('site statique : le HTML de départ est déjà au format français, comme le premier dessin', () => {
    const fichiers = genererProjetStatique(application(), { nom: 'resto', source: 'resto.humalis' });
    expect(fichiers.get('index.html')).toContain('Total : 28 000 FC');
    expect(fichiers.get('humalis/humalis.js')).toContain('function formaterNombre(');
    expect([...fichiers.values()].join('\n')).toContain('${formaterNombre(total)}');
  });
});
