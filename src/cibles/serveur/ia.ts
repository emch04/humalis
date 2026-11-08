/**
 * « ia par anthropic », « connecte peut demander a ia » : la route produite. La clé reste
 * sur le serveur ; la réponse part vers la page au fil de l'eau ; chaque compte a un plafond.
 */
import type { ServeurRI } from '../../ri/types.js';
import { gardeAction } from './separation.js';

export const avecIa = (serveur: ServeurRI) => serveur.droitIa !== undefined;

export const routeIa = (serveur: ServeurRI) => `      const routeIa = express.Router();
      routeIa.post('/', ${gardeAction(serveur.droitIa!)}, csrfMiddleware, creerIa(compterIa));
      app.use('/auth/ia', routeIa);
`;

export const ENV_IA = `# L'IA (« ia par anthropic ») : la clé de l'API. Sans elle, les questions sont refusées.
ANTHROPIC_API_KEY=
# Le modèle (claude-opus-5-5 par défaut), la longueur maximale d'une réponse, et le nombre de questions par compte et par heure.
HUMALIS_IA_MODELE=
HUMALIS_IA_JETONS=
HUMALIS_IA_PAR_HEURE=
`;

/** src/humalis/ia.ts */
export const IA = String.raw`import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from 'express';
import type pg from 'pg';

/** Produit par Humalis : une question à l'IA, sa réponse envoyée à la page au fil de l'eau. */
const LONGUEUR_MAX = 20000;
// Le secours côté serveur n'existe que sur ces modèles : si le premier refuse, un autre reprend la demande.
const AVEC_SECOURS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export type Compter = (cle: string) => Promise<number>;

export function compterMemoire(): Compter {
  const comptes = new Map<string, number>();
  return async (cle) => {
    const heure = cle.slice(cle.lastIndexOf('|'));
    for (const ancienne of comptes.keys()) if (!ancienne.endsWith(heure)) comptes.delete(ancienne);
    const n = (comptes.get(cle) ?? 0) + 1;
    comptes.set(cle, n);
    return n;
  };
}

/** Plusieurs serveurs : la base compte pour tous. */
export function compterPostgres(pool: pg.Pool): Compter {
  let prete: Promise<unknown> | undefined;
  return async (cle) => {
    await (prete ??= pool.query('CREATE TABLE IF NOT EXISTS humalis_ia_usage (cle TEXT PRIMARY KEY, n INTEGER NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())'));
    await pool.query("DELETE FROM humalis_ia_usage WHERE cree_le < now() - interval '2 hours'");
    const { rows } = await pool.query('INSERT INTO humalis_ia_usage (cle, n) VALUES ($1, 1) ON CONFLICT (cle) DO UPDATE SET n = humalis_ia_usage.n + 1 RETURNING n', [cle]);
    return Number(rows[0].n);
  };
}

export function creerIa(compter: Compter): RequestHandler {
  return async (req, res, next) => {
    try {
      const question = (req.body as { question?: unknown } | undefined)?.question;
      if (typeof question !== 'string' || question.trim() === '' || question.length > LONGUEUR_MAX) {
        res.status(400).json({ erreur: 'cette question est vide ou trop longue' });
        return;
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        res.status(503).json({ erreur: "l'IA n'est pas réglée sur ce serveur (ANTHROPIC_API_KEY)" });
        return;
      }
      const compte = String((req as unknown as { user: { id: unknown } }).user.id);
      const plafond = Number(process.env.HUMALIS_IA_PAR_HEURE) || 30;
      if ((await compter(compte + '|' + new Date().toISOString().slice(0, 13))) > plafond) {
        res.status(429).json({ erreur: "vous avez posé beaucoup de questions : réessayez dans l'heure" });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const envoyer = (corps: object) => res.write('data: ' + JSON.stringify(corps) + '\n\n');
      const model = process.env.HUMALIS_IA_MODELE || 'claude-opus-5-5';
      const client = new Anthropic();
      const flux = client.beta.messages.stream({
        model,
        max_tokens: Number(process.env.HUMALIS_IA_JETONS) || 16000,
        messages: [{ role: 'user', content: question }],
        ...(AVEC_SECOURS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      } as Parameters<typeof client.beta.messages.stream>[0]);
      res.on('close', () => flux.abort());
      flux.on('text', (t: string) => envoyer({ t }));
      try {
        const message = await flux.finalMessage();
        if (message.stop_reason === 'refusal') envoyer({ erreur: "L'IA a refusé de répondre à cette demande." });
      } catch (erreur) {
        if (erreur instanceof Anthropic.RateLimitError) envoyer({ erreur: "L'IA est très demandée : réessayez dans un instant." });
        else if (!(erreur instanceof Anthropic.APIUserAbortError)) {
          console.error("L'IA n'a pas répondu :", erreur instanceof Anthropic.APIError ? 'erreur ' + erreur.status : erreur instanceof Error ? erreur.message : erreur);
          envoyer({ erreur: "L'IA n'a pas répondu : réessayez dans un instant." });
        }
      }
      res.end();
    } catch (erreur) {
      next(erreur);
    }
  };
}
`;
