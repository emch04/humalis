import { describe, it, expect } from 'vitest';
import { LecteurMessages, ecrireMessage } from '../src/lsp/protocole.js';

const trame = (message: unknown) => ecrireMessage(message);

describe('le découpage des messages (Content-Length)', () => {
  it('écrit l’en-tête avec la longueur en octets, pas en caractères', () => {
    const octets = trame({ texte: 'é' });
    const texte = octets.toString('utf8');
    expect(texte).toBe('Content-Length: 14\r\n\r\n{"texte":"é"}');
    expect(Buffer.byteLength('{"texte":"é"}')).toBe(14);
  });

  it('relit un message coupé en plusieurs morceaux', () => {
    const lecteur = new LecteurMessages();
    const octets = trame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { nom: 'àéîõü' } });
    expect(lecteur.ajouter(octets.subarray(0, 10))).toEqual([]);
    expect(lecteur.ajouter(octets.subarray(10, 30))).toEqual([]);
    expect(lecteur.ajouter(octets.subarray(30))).toEqual([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { nom: 'àéîõü' } }]);
  });

  it('relit deux messages arrivés dans le même morceau', () => {
    const lecteur = new LecteurMessages();
    const deux = Buffer.concat([trame({ a: 1 }), trame({ b: 2 })]);
    expect(lecteur.ajouter(deux)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('coupe au milieu d’un caractère accentué sans l’abîmer', () => {
    const lecteur = new LecteurMessages();
    const octets = trame({ t: 'é' });
    const milieu = octets.indexOf(0xc3) + 1;
    expect(lecteur.ajouter(octets.subarray(0, milieu))).toEqual([]);
    expect(lecteur.ajouter(octets.subarray(milieu))).toEqual([{ t: 'é' }]);
  });

  it('accepte un en-tête Content-Type en plus', () => {
    const lecteur = new LecteurMessages();
    const corps = '{"x":1}';
    const brut = `Content-Length: ${corps.length}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${corps}`;
    expect(lecteur.ajouter(Buffer.from(brut))).toEqual([{ x: 1 }]);
  });
});
