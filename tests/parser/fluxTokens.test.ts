import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { FluxTokens } from '../../src/parser/fluxTokens.js';

describe('FluxTokens', () => {
  it('avance token par token', () => {
    const flux = new FluxTokens(analyser('page "accueil"'));
    expect(flux.actuel().valeur).toBe('page');
    flux.avancer();
    expect(flux.actuel().valeur).toBe('accueil');
  });

  it('accepte un token attendu et le consomme', () => {
    const flux = new FluxTokens(analyser('page "accueil"'));
    expect(flux.accepter('MOT_CLE', 'page')).toBe(true);
    expect(flux.actuel().type).toBe('CHAINE');
  });

  it("n'avance pas si le token ne correspond pas", () => {
    const flux = new FluxTokens(analyser('page "accueil"'));
    expect(flux.accepter('MOT_CLE', 'si')).toBe(false);
    expect(flux.actuel().valeur).toBe('page');
  });

  it('lève une erreur explicite sur un token manquant', () => {
    const flux = new FluxTokens(analyser('page'));
    flux.avancer();
    expect(() => flux.attendre('CHAINE', undefined, 'le nom de la page')).toThrow(
      /le nom de la page/,
    );
  });

  it("indique le numéro de ligne dans l'erreur", () => {
    const flux = new FluxTokens(analyser('page\npage'));
    flux.avancer();
    flux.sauterFinsDeLigne();
    flux.avancer();
    expect(() => flux.attendre('CHAINE', undefined, 'un nom')).toThrow(/Ligne 2/);
  });
});
