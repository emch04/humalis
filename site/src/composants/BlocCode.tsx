import { colorer, type ClasseSegment } from '../coloration/colorer';

const CLASSES: Record<ClasseSegment, string | undefined> = {
  reserve: 'c-reserve',
  contextuel: 'c-contextuel',
  chaine: 'c-chaine',
  variable: 'c-variable',
  nombre: 'c-nombre',
  commentaire: 'c-commentaire',
  liaison: 'c-liaison',
  identifiant: undefined,
  neutre: undefined,
};

interface Props {
  code: string;
  legende?: string;
  variante?: 'erreur' | 'avertissement';
}

/** Du code Humalis coloré. Les lignes longues défilent dans le cadre, jamais dans la page. */
export function BlocCode({ code, legende, variante }: Props) {
  const segments = colorer(code);
  return (
    <div className={`code${variante ? ` code--${variante}` : ''}`}>
      {legende && <p className="code__legende">{legende}</p>}
      <pre tabIndex={0} aria-label="Exemple de code Humalis">
        <code>
          {segments.map((s, i) =>
            CLASSES[s.classe] ? (
              <span key={i} className={CLASSES[s.classe]}>
                {s.texte}
              </span>
            ) : (
              s.texte
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

/** Une commande à taper dans le terminal : pas de coloration. */
export function BlocTerminal({ code, legende, etiquette }: { code: string; legende?: string; etiquette?: string }) {
  return (
    <div className="sh">
      {legende && <p className="code__legende">{legende}</p>}
      <pre tabIndex={0} aria-label={etiquette ?? 'Commande à taper dans le terminal'}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
