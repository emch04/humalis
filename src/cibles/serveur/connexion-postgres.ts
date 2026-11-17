/**
 * Les réglages de connexion de PostgreSQL, lus dans DATABASE_URL comme l'écrivent les hébergeurs.
 *
 * - `channel_binding=require` (les adresses des PostgreSQL hébergés le donnent) : pg l'ignorait sans rien dire. Il
 *   devient `enableChannelBinding`, la liaison de l'authentification au canal chiffré (SCRAM-SHA-256-PLUS).
 * - `sslmode=require`, `prefer` et `verify-ca` : pg les traite aujourd'hui comme `verify-full` (certificat et nom
 *   vérifiés), mais annonce qu'il les affaiblira. Ils sont écrits `verify-full` ici : la vérification ne changera pas
 *   avec une version de pg, et l'avertissement de pg ne s'affiche plus. `uselibpqcompat=true` garde le sens de libpq.
 * - Un relais de connexions en mode transaction (l'adresse « -pooler » d'un hébergeur, le port 6543) coupe l'écoute
 *   des annonces (LISTEN) et les verrous de session : `relaisDeConnexions` le repère dans l'adresse.
 *
 * Ce code est produit dans le serveur (`src/humalis/postgres.ts`) et dans les scripts d'exploitation.
 */

/**
 * Les fonctions `reglagesPostgres(adresse)` et `relaisDeConnexions(adresse)`, en TypeScript (un module du serveur,
 * qui les exporte) ou en JavaScript (dans un script, sans les exporter).
 */
export function codeReglagesPostgres(ts: boolean, exporter = ts): string {
  const t = (type: string): string => (ts ? type : '');
  const e = exporter ? 'export ' : '';
  return `/** Les réglages de pg pour cette adresse : le chiffrement vérifié, et la liaison au canal si l'adresse la demande. */
${e}function reglagesPostgres(adresse${t(': string')})${t(': { connectionString: string; enableChannelBinding?: boolean }')} {
  let url${t(': URL')};
  try {
    url = new URL(adresse);
  } catch {
    // Une adresse que URL ne lit pas (un nom de socket, par exemple) : pg la lit seul.
    return { connectionString: adresse };
  }
  let liaison${t(': boolean | undefined')};
  const libpq = [...url.searchParams.keys()].some((cle) => cle.toLowerCase() === 'uselibpqcompat');
  for (const [cle, valeur] of [...url.searchParams]) {
    const nom = cle.toLowerCase();
    const v = valeur.trim().toLowerCase();
    if (nom === 'channel_binding') {
      url.searchParams.delete(cle);
      if (v === 'require' || v === 'prefer') liaison = true;
      else if (v === 'disable') liaison = false;
      else throw new Error('« channel_binding=' + valeur + ' » est inconnu : écrivez require, prefer ou disable.');
    } else if (nom === 'sslmode' && !libpq && (v === 'require' || v === 'prefer' || v === 'verify-ca')) {
      url.searchParams.set(cle, 'verify-full');
    }
  }
  return liaison === undefined ? { connectionString: url.toString() } : { connectionString: url.toString(), enableChannelBinding: liaison };
}

/** Vrai si l'adresse passe par un relais de connexions en mode transaction : « -pooler » dans le nom, ou le port 6543. */
${e}function relaisDeConnexions(adresse${t(': string')})${t(': boolean')} {
  try {
    const url = new URL(adresse);
    return /-pooler\\./i.test(url.hostname) || url.port === '6543';
  } catch {
    return false;
  }
}
`;
}
