// La règle commune des essais d'endurance : la mémoire après ramassage forcé ne doit plus monter.

/** Les relevés sans le début, le temps que les caches se remplissent. */
export function juger(releves, { ignorer = 0.34, seuil = 512 * 1024 } = {}) {
  const suite = releves.slice(Math.ceil(releves.length * ignorer));
  const n = suite.length;
  const moyenneX = (n - 1) / 2;
  const moyenneY = suite.reduce((t, y) => t + y, 0) / n;
  let haut = 0, bas = 0;
  suite.forEach((y, x) => { haut += (x - moyenneX) * (y - moyenneY); bas += (x - moyenneX) ** 2; });
  const pente = bas === 0 ? 0 : haut / bas;
  const montee = Math.round(pente * (n - 1));
  return { debut: suite[0], fin: suite[n - 1], montee, fuite: montee > seuil };
}

export const enMo = (octets) => `${(octets / (1024 * 1024)).toFixed(2)} Mo`;
