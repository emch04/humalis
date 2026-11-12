/** Compare deux noms sans tenir compte de la casse ni des accents. */
const normaliserNom = (nom: string): string => nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Distance d'édition : insertion, suppression, remplacement d'un caractère, ou échange de deux voisins. */
export function distanceEdition(a: string, b: string): number {
  const gauche = normaliserNom(a);
  const droite = normaliserNom(b);
  let avant: number[] = [];
  let precedente = Array.from({ length: droite.length + 1 }, (_, i) => i);
  for (let i = 1; i <= gauche.length; i++) {
    const courante = [i];
    for (let j = 1; j <= droite.length; j++) {
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + (gauche[i - 1] === droite[j - 1] ? 0 : 1));
      // « totla » pour « total » : deux lettres voisines échangées, une seule faute de frappe.
      if (i > 1 && j > 1 && gauche[i - 1] === droite[j - 2] && gauche[i - 2] === droite[j - 1]) courante[j] = Math.min(courante[j], avant[j - 2] + 1);
    }
    avant = precedente;
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
  const liste = [...connus];
  // « prix » pour « Prix », « eleve » pour « élève » : le même mot à une majuscule ou un accent près.
  const jumeau = liste.find((connu) => connu !== nom && normaliserNom(connu) === normaliserNom(nom));
  if (jumeau) return ` Peut-être « ${jumeau} » ? Un nom garde ses majuscules et ses accents : « ${nom} » et « ${jumeau} » sont deux noms différents.`;
  const proche = nomProche(nom, liste);
  return proche ? ` Peut-être « ${proche} » ?` : '';
}
