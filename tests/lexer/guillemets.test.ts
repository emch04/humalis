import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb } from '../../src/cibles/web/projet.js';
import { genererProjetStatique } from '../../src/cibles/statique/projet.js';

// Manque n° 3 du site public : un guillemet dans un texte s'écrit \" ; tout autre antislash reste tel quel.
const chaine = (source: string) => analyser(source).find((t) => t.type === 'CHAINE')!.valeur;

describe('les guillemets dans un texte', () => {
  it('\\" donne un guillemet, sans fermer le texte', () => {
    expect(chaine('texte "Il a dit \\"bonjour\\""')).toBe('Il a dit "bonjour"');
  });

  it('tout autre antislash reste tel quel, même doublé (les programmes existants ne changent pas)', () => {
    expect(chaine('texte "a\\\\b"')).toBe('a\\\\b');
    expect(chaine('texte "C:\\dossier"')).toBe('C:\\dossier');
  });

  it('un texte qui finit par \\" reste non fermé, avec le message habituel', () => {
    expect(() => analyser('texte "abc\\"')).toThrow(/guillemet manquant/);
  });

  it('le guillemet arrive tel quel dans le web et le statique', () => {
    const { application } = compiler('page "a" :\n    titre "Le mot \\"page\\""\n');
    const web = [...genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' }).values()].join('\n');
    expect(web).toContain('Le mot "page"');
    const statique = genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(statique).toMatch(/Le mot (&quot;|")page(&quot;|")/);
  });
});
