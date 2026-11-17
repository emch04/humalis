/**
 * Le chiffrement d'une base MySQL ou MariaDB, lu dans DATABASE_URL comme l'écrivent les hébergeurs.
 *
 * mysql2 ne comprend que `?ssl={"…":…}` : il ignorait `?ssl-mode=REQUIRED` ou `?sslmode=require` (un simple
 * avertissement) et se connectait en clair. Ce code, produit dans le serveur (`src/humalis/mysql.ts`) et dans les
 * scripts d'exploitation (`scripts/bases/mysql.mjs`), donne à mysql2 de vrais réglages TLS, ou refuse l'adresse.
 */

/** La fonction `connexionMysql(adresse)`, en TypeScript (le serveur) ou en JavaScript (les scripts). */
export function codeConnexionMysql(ts: boolean): string {
  const t = (type: string): string => (ts ? type : '');
  return `/**
 * L'adresse de la base et son chiffrement, lus comme chez les hébergeurs. Une adresse qui demande le chiffrement
 * l'obtient, avec le certificat du serveur vérifié :
 * - ssl-mode=REQUIRED (MySQL), sslmode=require (comme PostgreSQL), VERIFY_IDENTITY, verify-full ou ssl=true :
 *   chiffré, le certificat et le nom du serveur vérifiés ;
 * - VERIFY_CA (verify-ca) : chiffré, le certificat vérifié, pas le nom ;
 * - ssl-ca=/chemin/ca.pem (ou sslrootcert=) : l'autorité d'un hébergeur qui signe ses propres certificats ;
 * - ssl={"…":…} : les réglages TLS de mysql2, tels quels ;
 * - DISABLED (disable) ou ssl=false : en clair, pour une base sur la même machine.
 * PREFERRED se connecterait en clair, sans le dire, si la base ne chiffre pas : il est refusé, comme une valeur inconnue.
 */
export function connexionMysql(adresse${t(': string')})${t(': { uri: string; ssl?: string | Record<string, unknown> }')} {
  const url = new URL(adresse.replace(/^mariadb:/i, 'mysql:'));
  const NOMS = { mode: ['ssl-mode', 'sslmode', 'ssl_mode'], ssl: ['ssl'], autorite: ['ssl-ca', 'sslca', 'ssl_ca', 'sslrootcert'] };
  // Chaque réglage une seule fois, quelle que soit son écriture : deux valeurs (« ssl-mode=DISABLED&sslmode=REQUIRED ») sont refusées.
  const lire = (noms${t(': string[]')})${t(': string | null')} => {
    const vues = [...url.searchParams].filter(([cle]) => noms.includes(cle.toLowerCase()));
    if (vues.length > 1) throw new Error('DATABASE_URL donne ' + vues.map(([cle]) => cle).join(' et ') + ' : un seul réglage du chiffrement, une seule fois.');
    return vues.length ? vues[0]${t('!')}[1] : null;
  };
  const mode = lire(NOMS.mode);
  const ssl = lire(NOMS.ssl);
  const autorite = lire(NOMS.autorite);
  // Ces réglages sont lus ici : mysql2 ne reçoit que l'adresse sans eux.
  const tous = [...NOMS.mode, ...NOMS.ssl, ...NOMS.autorite];
  for (const cle of [...url.searchParams.keys()]) if (tous.includes(cle.toLowerCase())) url.searchParams.delete(cle);
  const uri = url.toString();
  if (mode !== null && ssl !== null) throw new Error('DATABASE_URL donne à la fois ssl-mode et ssl : gardez-en un seul.');
  let genre${t(": 'clair' | 'verifie' | 'autorite' | null")} = null;
  let reglages${t(': string | Record<string, unknown> | undefined')};
  if (mode !== null) {
    const m = mode.trim().toLowerCase().replace(/_/g, '-');
    if (m === 'disabled' || m === 'disable') genre = 'clair';
    else if (['required', 'require', 'verify-identity', 'verify-full'].includes(m)) genre = 'verifie';
    else if (m === 'verify-ca') genre = 'autorite';
    else if (['preferred', 'prefer', 'allow'].includes(m)) {
      throw new Error('« ssl-mode=' + mode + ' » se connecterait en clair, sans le dire, si la base ne chiffre pas : écrivez ssl-mode=REQUIRED, ou ssl-mode=DISABLED pour une base sur la même machine.');
    } else throw new Error('« ssl-mode=' + mode + ' » est inconnu : écrivez REQUIRED, VERIFY_CA, VERIFY_IDENTITY ou DISABLED.');
  } else if (ssl !== null) {
    const s = ssl.trim();
    if (/^(true|1)$/i.test(s)) genre = 'verifie';
    else if (/^(false|0)$/i.test(s)) genre = 'clair';
    else if (s.startsWith('{')) {
      let lu${t(': unknown')};
      try {
        lu = JSON.parse(s);
      } catch {
        throw new Error('« ssl=' + s + ' » n’est pas un objet JSON valide.');
      }
      if (lu === null || typeof lu !== 'object' || Array.isArray(lu)) throw new Error('« ssl=' + s + ' » doit être un objet JSON.');
      reglages = lu${t(' as Record<string, unknown>')};
    } else reglages = s; // un profil de mysql2
  }
  if (genre === 'clair') {
    if (autorite !== null) throw new Error('DATABASE_URL donne ssl-ca, mais désactive le chiffrement.');
    return { uri };
  }
  let ca${t(': string | undefined')};
  if (autorite !== null) {
    try {
      ca = readFileSync(autorite, 'utf8');
    } catch {
      throw new Error('ssl-ca : le fichier « ' + autorite + ' » ne se lit pas.');
    }
  }
  if (genre === 'verifie' || genre === 'autorite' || (reglages === undefined && ca !== undefined)) {
    reglages = { rejectUnauthorized: true, verifyIdentity: genre !== 'autorite', ...(ca === undefined ? {} : { ca }) };
  } else if (ca !== undefined) {
    if (typeof reglages !== 'object') throw new Error('ssl-ca ne se combine pas avec le profil « ssl=' + reglages + ' ».');
    reglages = { ...reglages, ca };
  }
  return reglages === undefined ? { uri } : { uri, ssl: reglages };
}
`;
}
