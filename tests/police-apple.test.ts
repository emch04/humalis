import { describe, expect, it } from 'vitest';
import { avecPoliceDuTheme } from '../src/cibles/apple/projet.js';

describe('police du thème sur Apple', () => {
  const nom = 'PolicesHumalis.vrai("Sora")';

  it('garde la police du thème pour une taille écrite en CSS', () => {
    expect(avecPoliceDuTheme('Text("a").font(.system(size: 32))', 'Sora')).toBe(`Text("a").font(.custom(${nom}, size: 32))`);
  });

  it('garde la hauteur des styles de texte', () => {
    expect(avecPoliceDuTheme('.font(.title2)', 'Sora')).toBe(`.font(.custom(${nom}, size: 22, relativeTo: .title2))`);
  });

  it('laisse les icônes et le texte à chasse fixe', () => {
    const code = 'Image(systemName: "a").font(.caption)\n.font(.system(.callout, design: .monospaced))';
    expect(avecPoliceDuTheme(code, 'Sora')).toBe(code);
  });
});
