import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { programme, erreurs } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

describe('fichiers choisis — le parser', () => {
  it('lit le choix d’un fichier, ses types et sa taille', () => {
    const [, choix] = corps(p('>variable photo = rien', '>fichier "Choisir une photo" dans photo accepte images ou pdf avec maximum 5 Mo et plusieurs')) as any[];
    expect(choix.element).toBe('fichier');
    expect(choix.fichier).toEqual({ variable: 'photo', accepte: ['images', 'pdf'], octets: 5 * 1024 * 1024, plusieurs: true });
  });
  it('lit une taille décimale en Ko', () => {
    const [choix] = corps(p('>fichier "Choisir" dans f avec maximum 2,5 Ko')) as any[];
    expect(choix.fichier.octets).toBe(2560);
  });
  it('lit l’envoi avec toutes ses clauses', () => {
    const [envoi] = corps(p("> quand l'utilisateur clique sur \"Envoyer\" :".replace('> ', '>'), '>>envoyer fichier photo vers "api/shop/moi/photo" de la source "boutique" en corps brut suivi dans envoi et fichier dans adresse_photo')) as any[];
    expect(envoi.corps[0]).toEqual({
      type: 'EnvoiFichier', variable: 'photo', adresse: 'api/shop/moi/photo', source: 'boutique', corpsBrut: true, suivi: 'envoi', resultat: 'adresse_photo', ligne: 3,
    });
  });
  it('lit le nom du champ d’un formulaire', () => {
    const [envoi] = corps(p('>quand la page se charge :', '>>envoyer fichier photo vers "photos" de la source "b" sous le nom "image"')) as any[];
    expect(envoi.corps[0]).toMatchObject({ champ: 'image' });
    expect(envoi.corps[0].corpsBrut).toBeUndefined();
  });
  it('refuse une taille sans unité et un réglage inconnu', () => {
    expect(() => corps(p('>fichier "Choisir" dans f avec maximum 5'))).toThrow('a une unité');
    expect(() => corps(p('>fichier "Choisir" dans f avec couleur bleu'))).toThrow('ne se règle pas sur un choix de fichier');
  });
  it('« fichier » et « accepte » restent des noms ailleurs', () => {
    expect(erreurs(p('>variable fichier = 3', '>variable accepte = 1', '>texte "{fichier} {accepte}"'))).toEqual([]);
  });
});
