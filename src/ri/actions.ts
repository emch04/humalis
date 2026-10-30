import type { Action } from './types.js';

/**
 * Les suites d'actions contenues dans une action (les deux branches d'un
 * « si », le corps d'une boucle, les cas d'un « selon ») : pour parcourir
 * des actions sans oublier une sorte de bloc.
 */
export function sousActions(action: Action): Action[][] {
  switch (action.type) {
    case 'optimiste':
      return [action.corps];
    case 'essayer':
      return [action.corps, action.siErreur];
    case 'si':
      return [action.alors, action.sinon];
    case 'repetition':
    case 'tantQue':
    case 'repeter':
      return [action.corps];
    case 'selon':
      return [...action.cas.map((c) => c.corps), action.sinon];
    case 'minuterie':
      return [action.corps];
    case 'confirmation':
      return [action.alors, action.sinon];
    case 'message':
      return action.action ? [action.action.actions] : [];
    default:
      return [];
  }
}
