/** Compare deux noms sans tenir compte de la casse ni des accents. */
const normaliserNom = (nom: string): string => nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Distance d'édition : insertion, suppression ou remplacement d'un caractère. */
export function distanceEdition(a: string, b: string): number {
  const gauche = normaliserNom(a);
  const droite = normaliserNom(b);
  let precedente = Array.from({ length: droite.length + 1 }, (_, i) => i);
  for (let i = 1; i <= gauche.length; i++) {
    const courante = [i];
    for (let j = 1; j <= droite.length; j++) {
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + (gauche[i - 1] === droite[j - 1] ? 0 : 1));
    }
    precedente = courante;
  }
  return precedente[droite.length];
}

export function nomProche(nom: string, connus: Iterable<string>): string | undefined {
  let meilleur: string | undefined;
  let distance = nom.length > 5 ? 2 : 1;
  for (const connu of connus) {
    const courante = distanceEdition(nom, connu);
    if (courante < distance && normaliserNom(nom) !== normaliserNom(connu)) {
      meilleur = connu;
      distance = courante;
    } else if (courante === distance && meilleur === undefined && normaliserNom(nom) !== normaliserNom(connu)) {
      meilleur = connu;
    }
  }
  return meilleur;
}

export function proposerNom(nom: string, connus: Iterable<string>): string {
  const proche = nomProche(nom, connus);
  return proche ? ` Peut-être « ${proche} » ?` : '';
}
