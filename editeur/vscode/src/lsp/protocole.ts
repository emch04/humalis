/**
 * Le transport du protocole des serveurs de langage (LSP), écrit à la
 * main (plan `2026-10-29-outils-editeur.md`, D1) : chaque message JSON-RPC
 * est précédé d'un en-tête « Content-Length: n », n étant sa longueur en
 * octets UTF-8, puis d'une ligne vide.
 */

const SEPARATEUR = Buffer.from('\r\n\r\n');

/** Écrit un message, avec son en-tête. */
export function ecrireMessage(message: unknown): Buffer {
  const corps = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${corps.length}\r\n\r\n`, 'ascii'), corps]);
}

/** Relit les messages à mesure que les octets arrivent, en morceaux de taille quelconque. */
export class LecteurMessages {
  private tampon = Buffer.alloc(0);

  /** Ajoute un morceau ; renvoie les messages complets qu'il termine. */
  ajouter(morceau: Buffer): unknown[] {
    this.tampon = Buffer.concat([this.tampon, morceau]);
    const messages: unknown[] = [];
    for (;;) {
      const finEntete = this.tampon.indexOf(SEPARATEUR);
      if (finEntete === -1) break;
      const entete = this.tampon.subarray(0, finEntete).toString('ascii');
      const longueur = Number(/Content-Length:\s*(\d+)/i.exec(entete)?.[1]);
      if (!Number.isFinite(longueur)) {
        // En-tête illisible : on le saute, pour ne pas bloquer la suite.
        this.tampon = this.tampon.subarray(finEntete + SEPARATEUR.length);
        continue;
      }
      const debut = finEntete + SEPARATEUR.length;
      if (this.tampon.length < debut + longueur) break;
      const corps = this.tampon.subarray(debut, debut + longueur).toString('utf8');
      this.tampon = this.tampon.subarray(debut + longueur);
      messages.push(JSON.parse(corps));
    }
    return messages;
  }
}
