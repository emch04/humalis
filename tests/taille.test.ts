import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { formaterTaille } from '../src/cibles/format.js';
import { programme, erreurs } from './analyse/aide.js';

// Une taille de fichier lisible : « {photo.taille en Ko} », « {photo.taille en Mo} ».
const PAGE = programme('page "envoi" :', '>titre "Envoi"', '>variable taille = 1572864', '>texte "Poids : {taille en Mo} ({taille en Ko})"');

describe('la taille d’un fichier en Ko et en Mo', () => {
  it('l’outil', () => {
    expect(formaterTaille(1572864, 'Mo')).toBe('1,5 Mo');
    expect(formaterTaille(2048, 'Ko')).toBe('2 Ko');
    expect(formaterTaille(1500, 'Ko')).toBe('1,5 Ko');
    expect(formaterTaille(1572864, 'Mo', 'en')).toBe('1.5 MB');
    expect(formaterTaille(undefined, 'Ko')).toBe('');
  });

  it('l’analyse accepte en Ko et en Mo sur un nombre, et le refuse sur un texte', () => {
    expect(erreurs(PAGE)).toEqual([]);
    expect(erreurs(programme('page "a" :', '>titre "A"', '>variable nom = "photo"', '>texte "{nom en Ko}"'))).toEqual(['4 : « nom » est un texte ; « en Ko » s\'écrit après un nombre.']);
  });

  it('web : l’outil écrit seulement s’il sert', () => {
    const fichiers = genererProjetWeb(compiler(PAGE).application!, { nom: 'e', adresse: 'https://e.cd', source: 'e.humalis' });
    expect(fichiers.get('src/pages/Envoi.tsx')).toContain("${formaterTaille(taille, 'Mo')} (${formaterTaille(taille, 'Ko')})");
    expect(fichiers.get('src/humalis/outils.ts')).toContain('export function formaterTaille(');
    const sans = genererProjetWeb(compiler(programme('page "a" :', '>titre "A"', '>variable n = 3', '>texte "{n}"')).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    expect(sans.get('src/humalis/outils.ts')).not.toContain('formaterTaille');
  });

  it('site statique : le HTML de départ est déjà écrit', () => {
    const html = genererProjetStatique(compiler(PAGE).application!, { nom: 'e', source: 'e.humalis' }).get('index.html')!;
    expect(html).toMatch(/Poids : 1,5 Mo \(1.536 Ko\)/);
  });
});
