import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyser } from '../../src/lexer/lexer.js';

describe('analyser — exemple complet', () => {
  it('analyse le fichier de connexion sans erreur', () => {
    const source = readFileSync('exemples/connexion.humalis', 'utf8');
    const tokens = analyser(source);

    expect(tokens.length).toBeGreaterThan(20);
    expect(tokens.at(-1)?.type).toBe('FIN_FICHIER');

    const indents = tokens.filter((t) => t.type === 'INDENT').length;
    const dedents = tokens.filter((t) => t.type === 'DEDENT').length;
    expect(indents).toBe(dedents);
  });

  it('reconnaît les constructions clés du fichier', () => {
    const source = readFileSync('exemples/connexion.humalis', 'utf8');
    const tokens = analyser(source);
    const motsCles = tokens.filter((t) => t.type === 'MOT_CLE').map((t) => t.valeur);

    expect(motsCles).toContain('page');
    expect(motsCles).toContain('variable');
    expect(motsCles).toContain('quand');
    expect(motsCles).toContain('si');
    expect(motsCles).toContain('sinon');
    expect(motsCles).toContain('afficher');
  });
});
