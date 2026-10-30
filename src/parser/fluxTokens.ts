import type { Token, TokenType } from '../lexer/types.js';
import { ErreurSyntaxique } from './erreurs.js';

/**
 * Curseur en lecture seule sur la liste de tokens. Le parser ne
 * manipule jamais d'index directement : il demande, vérifie, accepte.
 */
export class FluxTokens {
  private position = 0;
  /** Les tokens que lit le parser : tout sauf les mots de liaison. */
  private readonly tokens: Token[] = [];
  /** Pour chaque token lu, le mot de liaison écrit juste avant (« de » dans « de 1 »). */
  private readonly liaisons = new Map<number, Token>();

  constructor(tokens: Token[]) {
    // Les mots de liaison sont sautés par défaut : tout le parser les
    // ignore, sauf les endroits qui les demandent (accepterLiaison).
    let liaison: Token | undefined;
    for (const token of tokens) {
      if (token.type === 'LIAISON') {
        liaison = token;
        continue;
      }
      if (liaison) this.liaisons.set(this.tokens.length, liaison);
      this.tokens.push(token);
      liaison = undefined;
    }
  }

  /** Le mot de liaison écrit juste avant le token actuel, s'il y en a un. */
  liaisonAvant(): Token | undefined {
    return this.liaisons.get(Math.min(this.position, this.tokens.length - 1));
  }

  /**
   * Vrai si le mot de liaison `mot` (« de », « à »…) précède le token
   * actuel : pour une tournure où il porte du sens. Il est alors consommé.
   */
  accepterLiaison(mot: string): boolean {
    const liaison = this.liaisonAvant();
    if (!liaison || liaison.valeur !== mot) return false;
    this.liaisons.delete(Math.min(this.position, this.tokens.length - 1));
    return true;
  }

  /**
   * Le message à donner quand un nom manque juste après un petit mot de
   * liaison : « variable a = 1 » se lit « variable = 1 ».
   */
  messageLiaison(description: string): string | undefined {
    const liaison = this.liaisonAvant();
    if (!liaison) return undefined;
    const mot = liaison.original ?? liaison.valeur;
    return `« ${mot} » est un petit mot ignoré par Humalis : il ne peut pas servir de nom. Choisissez un autre nom pour ${description.replace(/^le nom de /, '')}, par exemple « ${mot.replace(/'$/, '')}_1 » ou un mot plus parlant.`;
  }

  actuel(): Token {
    return this.tokens[Math.min(this.position, this.tokens.length - 1)];
  }

  /** Le token situé `decalage` positions plus loin, sans avancer. */
  regarder(decalage: number): Token {
    return this.tokens[Math.min(this.position + decalage, this.tokens.length - 1)];
  }

  avancer(): Token {
    const token = this.actuel();
    if (this.position < this.tokens.length - 1) {
      this.position++;
    }
    return token;
  }

  verifier(type: TokenType, valeur?: string): boolean {
    const token = this.actuel();
    if (token.type !== type) return false;
    return valeur === undefined || token.valeur === valeur;
  }

  /** Consomme le token s'il correspond, sinon ne bouge pas. */
  accepter(type: TokenType, valeur?: string): boolean {
    if (this.verifier(type, valeur)) {
      this.avancer();
      return true;
    }
    return false;
  }

  /** Consomme le token attendu, ou lève une erreur lisible. */
  attendre(type: TokenType, valeur?: string, description?: string): Token {
    if (this.verifier(type, valeur)) {
      return this.avancer();
    }

    const token = this.actuel();
    const attendu = description ?? (valeur ? `« ${valeur} »` : type);
    // « il manque … : à la place, on trouve … » se dit au masculin comme
    // au féminin (« il manque l'adresse », « il manque deux-points »).
    const trouve =
      token.type === 'FIN_FICHIER'
        ? 'la fin du fichier'
        : token.type === 'FIN_LIGNE'
          ? 'la fin de la ligne'
          : `« ${token.valeur || token.type} »`;

    throw new ErreurSyntaxique(
      `il manque ${attendu} : à la place, on trouve ${trouve}`,
      token.ligne,
    );
  }

  /**
   * Un nom choisi par l'utilisateur : un identifiant, ou un mot-clé
   * contextuel (« titre », « menu »…) placé là où un nom est attendu.
   */
  verifierNom(): boolean {
    const token = this.actuel();
    return token.type === 'IDENTIFIANT' || (token.type === 'MOT_CLE' && !token.reserve);
  }

  /** Consomme un nom et renvoie son orthographe d'origine. */
  attendreNom(description: string): Token & { nom: string } {
    const token = this.actuel();

    if (this.verifierNom()) {
      this.avancer();
      return { ...token, nom: token.original ?? token.valeur };
    }

    const liaison = this.messageLiaison(description);
    if (liaison) throw new ErreurSyntaxique(liaison, token.ligne);

    if (token.type === 'MOT_CLE') {
      throw new ErreurSyntaxique(
        `« ${token.original ?? token.valeur} » est un mot réservé du langage : il ne peut pas servir de nom. Choisissez un autre nom pour ${description.replace(/^le nom de /, '')}.`,
        token.ligne,
      );
    }

    return { ...this.attendre('IDENTIFIANT', undefined, description), nom: '' };
  }

  estFini(): boolean {
    return this.actuel().type === 'FIN_FICHIER';
  }

  sauterFinsDeLigne(): void {
    while (this.verifier('FIN_LIGNE')) {
      this.avancer();
    }
  }
}
