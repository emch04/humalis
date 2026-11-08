import { useEffect, useRef, useState, type FormEvent } from 'react';

/** La clé publique du widget anti-robots ; vide tant qu'elle n'est pas créée : le formulaire renvoie alors vers l'e-mail. */
const CLE_TURNSTILE = '';
const CLE_TEST = '1x00000000000000000000AA';
const ADRESSE = 'signalement@humalis.dev';

const TEXTES = {
  fr: {
    type: 'Type de problème', bug: 'Un bug', documentation: 'Une erreur dans la documentation', securite: 'Un problème de sécurité', autre: 'Autre chose',
    description: 'Décris le problème', aide: 'Ce que tu as fait, ce que tu attendais, ce qui s’est passé.', page: 'Page concernée (facultatif)',
    email: 'Ton e-mail (facultatif, pour recevoir une réponse)', envoyer: 'Envoyer le signalement', envoi: 'Envoi…', merci: 'Merci ! Ton signalement est bien envoyé.',
    robot: 'La vérification anti-robots a échoué. Recharge la page et réessaie.', limite: 'Trop d’envois d’un coup. Réessaie dans une minute.',
    courte: 'Décris le problème en au moins 10 caractères.', mail: 'Cette adresse e-mail ne semble pas valide.', erreur: 'L’envoi a échoué. Écris-nous à', indisponible: 'Le formulaire n’est pas encore ouvert. Écris-nous à',
  },
  en: {
    type: 'Type of issue', bug: 'A bug', documentation: 'A documentation mistake', securite: 'A security issue', autre: 'Something else',
    description: 'Describe the issue', aide: 'What you did, what you expected, what happened.', page: 'Page concerned (optional)',
    email: 'Your email (optional, to get a reply)', envoyer: 'Send the report', envoi: 'Sending…', merci: 'Thank you! Your report has been sent.',
    robot: 'The anti-bot check failed. Reload the page and try again.', limite: 'Too many reports at once. Try again in a minute.',
    courte: 'Describe the issue in at least 10 characters.', mail: 'This email address does not look valid.', erreur: 'Sending failed. Write to us at', indisponible: 'The form is not open yet. Write to us at',
  },
};

interface Turnstile { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id: string): void }
declare global { interface Window { turnstile?: Turnstile } }

function chargerTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((ok, non) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = () => ok(); s.onerror = () => non(new Error('turnstile'));
    document.head.appendChild(s);
  });
}

function useLangue(): 'fr' | 'en' {
  const [langue, definir] = useState<'fr' | 'en'>('fr');
  useEffect(() => {
    const lire = () => definir(document.documentElement.lang.startsWith('en') ? 'en' : 'fr');
    lire();
    const o = new MutationObserver(lire);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => o.disconnect();
  }, []);
  return langue;
}

export default function FormulaireSignalement() {
  const langue = useLangue();
  const t = TEXTES[langue];
  const cadre = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [jeton, definirJeton] = useState('');
  const [etat, definirEtat] = useState<'pret' | 'envoi' | 'envoye'>('pret');
  const [erreur, definirErreur] = useState<keyof typeof t | ''>('');
  const [cle, definirCle] = useState<string | null>(null);

  useEffect(() => {
    definirCle(location.hostname === 'localhost' ? CLE_TEST : CLE_TURNSTILE);
  }, []);

  useEffect(() => {
    if (!cle || !cadre.current) return;
    let fini = false;
    chargerTurnstile().then(() => {
      if (fini || !cadre.current || !window.turnstile) return;
      widget.current = window.turnstile.render(cadre.current, { sitekey: cle, callback: definirJeton, 'expired-callback': () => definirJeton(''), language: langue });
    }).catch(() => definirErreur('robot'));
    return () => { fini = true; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; };
  }, [cle, langue]);

  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (String(d.description).trim().length < 10) { definirErreur('courte'); return; }
    definirEtat('envoi'); definirErreur('');
    try {
      const r = await fetch('/api/signaler', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...d, jeton }) });
      const c = (await r.json()) as { ok: boolean; erreur?: string };
      if (c.ok) { definirEtat('envoye'); return; }
      definirErreur(c.erreur === 'robot' ? 'robot' : c.erreur === 'limite' ? 'limite' : c.erreur === 'description' ? 'courte' : c.erreur === 'email' ? 'mail' : 'erreur');
    } catch {
      definirErreur('erreur');
    }
    definirEtat('pret');
    if (widget.current && window.turnstile) { window.turnstile.reset(widget.current); definirJeton(''); }
  }

  const lienMail = <a href={`mailto:${ADRESSE}`}>{ADRESSE}</a>;
  if (etat === 'envoye') return <p className="signaler-merci" role="status">{t.merci}</p>;
  if (cle === '') return <p className="signaler-note">{t.indisponible} {lienMail}.</p>;
  const tmessage = erreur ? t[erreur] : '';

  return (
    <form className="signaler" onSubmit={envoyer}>
      <label>{t.type}
        <select name="type" defaultValue="bug">
          <option value="bug">{t.bug}</option>
          <option value="documentation">{t.documentation}</option>
          <option value="securite">{t.securite}</option>
          <option value="autre">{t.autre}</option>
        </select>
      </label>
      <label>{t.description}
        <textarea name="description" rows={7} required minLength={10} maxLength={5000} placeholder={t.aide} />
      </label>
      <label>{t.page}
        <input name="page" maxLength={300} placeholder="/documentation" />
      </label>
      <label>{t.email}
        <input name="email" type="email" maxLength={254} autoComplete="email" />
      </label>
      <div className="signaler-piege" aria-hidden="true">
        <label>Site web<input name="site_web" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div ref={cadre} className="signaler-robot" />
      {tmessage && <p className="signaler-erreur" role="alert">{tmessage}{erreur === 'erreur' && <> {lienMail}.</>}</p>}
      <button className="button button-primary" type="submit" disabled={etat === 'envoi' || !jeton}>{etat === 'envoi' ? t.envoi : t.envoyer}</button>
    </form>
  );
}
