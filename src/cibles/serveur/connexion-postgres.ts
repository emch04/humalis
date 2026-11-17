/**
 * Les réglages de connexion de PostgreSQL, lus dans DATABASE_URL comme l'écrivent les hébergeurs.
 *
 * - `channel_binding=require` (les adresses des PostgreSQL hébergés le donnent) : pg l'ignorait sans rien dire, et son
 *   option `enableChannelBinding` ne fait que préférer la liaison. Ici, `require` est obligatoire : un client Humalis
 *   refuse toute authentification qui ne lie pas la connexion au canal chiffré (SCRAM-SHA-256-PLUS), et l'adresse doit
 *   demander le chiffrement. `prefer` la préfère, `disable` la retire.
 * - `sslmode=require`, `prefer` et `verify-ca` : pg les traite aujourd'hui comme `verify-full` (certificat et nom
 *   vérifiés), mais annonce qu'il les affaiblira. Ils sont écrits `verify-full` ici, sous le nom `sslmode` (pg ignore
 *   `SSLMODE`). `uselibpqcompat=true` garde le sens de libpq.
 * - Un relais de connexions en mode transaction (l'adresse « -pooler » d'un hébergeur, le port 6543) coupe l'écoute
 *   des annonces (LISTEN) et les verrous de session : `relaisDeConnexions` le repère dans l'adresse.
 *
 * Revu par Codex le 17 novembre 2026. Ce code est produit dans le serveur (`src/humalis/postgres.ts`) et dans les
 * scripts d'exploitation.
 */

/**
 * Les fonctions `reglagesPostgres(adresse, pg)`, `nouveauClientPostgres(adresse, pg)` et `relaisDeConnexions(adresse)`,
 * en TypeScript (un module du serveur, qui les exporte) ou en JavaScript (dans un script, sans les exporter).
 */
export function codeReglagesPostgres(ts: boolean, exporter = ts): string {
  const t = (type: string): string => (ts ? type : '');
  const e = exporter ? 'export ' : '';
  return `${ts ? `type Connexion = { stream: { destroy(erreur: Error): void }; on(evenement: string, faire: (message: { mechanisms?: string[] }) => void): void };
type ClassePg = new (reglages: never) => object;
type Reglages = { connectionString: string; enableChannelBinding?: boolean; Client?: ClassePg };
` : ''}
/**
 * « channel_binding=require » : un client qui refuse toute authentification sans liaison au canal chiffré
 * (mot de passe en clair ou MD5, SCRAM sans « -PLUS », connexion ouverte sans authentification).
 */
function clientLie(pg${t(': { Client: ClassePg }')})${t(': ClassePg')} {
  return class extends pg.Client {
    constructor(reglages${t(': never')}) {
      super(reglages);
      const connexion = ${ts ? '(this as unknown as { connection: Connexion })' : 'this'}.connection;
      let lie = false;
      const refuser = (pourquoi${t(': string')}) => connexion.stream.destroy(new Error('channel_binding=require : ' + pourquoi));
      connexion.on('authenticationSASL', (message) => {
        if ((message.mechanisms ?? []).includes('SCRAM-SHA-256-PLUS')) lie = true;
        else refuser('la base ne propose pas la liaison au canal (SCRAM-SHA-256-PLUS).');
      });
      connexion.on('authenticationCleartextPassword', () => refuser('la base demande un mot de passe en clair.'));
      connexion.on('authenticationMD5Password', () => refuser('la base demande un mot de passe MD5.'));
      connexion.on('authenticationOk', () => {
        if (!lie) refuser("la connexion s'est ouverte sans liaison au canal.");
      });
    }
  };
}

/** Les réglages de pg pour cette adresse : le chiffrement vérifié, et la liaison au canal si l'adresse la demande. */
${e}function reglagesPostgres(adresse${t(': string')}, pg${t(': { Client: ClassePg }')})${t(': Reglages')} {
  let url${t(': URL')};
  try {
    url = new URL(adresse);
  } catch {
    // Une adresse que URL ne lit pas (un nom de socket, par exemple) : pg la lit seul.
    return { connectionString: adresse };
  }
  let liaison${t(": 'require' | 'prefer' | 'disable' | undefined")};
  let libpq = false;
  let mode${t(': string | undefined')};
  for (const [cle, valeur] of [...url.searchParams]) {
    const nom = cle.toLowerCase();
    const v = valeur.trim().toLowerCase();
    if (nom === 'channel_binding') {
      if (liaison !== undefined) throw new Error('channel_binding est donné deux fois.');
      url.searchParams.delete(cle);
      if (v === 'require' || v === 'prefer' || v === 'disable') liaison = v;
      else throw new Error('« channel_binding=' + valeur + ' » est inconnu : écrivez require, prefer ou disable.');
    } else if (nom === 'sslmode') {
      if (mode !== undefined) throw new Error('sslmode est donné deux fois.');
      mode = v;
      // Le nom que pg lit : « sslmode », en minuscules.
      url.searchParams.delete(cle);
    } else if (nom === 'uselibpqcompat') {
      libpq = v === 'true';
    }
  }
  if (mode !== undefined) url.searchParams.set('sslmode', !libpq && (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') ? 'verify-full' : mode);
  if (liaison === 'require' && (mode === undefined || mode === 'disable' || mode === 'allow')) {
    throw new Error('channel_binding=require demande une connexion chiffrée : ajoutez sslmode=verify-full.');
  }
  const reglages${t(': Reglages')} = { connectionString: url.toString() };
  if (liaison !== undefined) reglages.enableChannelBinding = liaison !== 'disable';
  if (liaison === 'require') reglages.Client = clientLie(pg);
  return reglages;
}

/** Un client pg (scripts) avec ces réglages, liaison au canal comprise. */
${e}function nouveauClientPostgres(adresse${t(': string')}, pg${t(': { Client: ClassePg }')}) {
  const reglages = reglagesPostgres(adresse, pg);
  return new (reglages.Client ?? pg.Client)(reglages${t(' as never')});
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
