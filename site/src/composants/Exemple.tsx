import { EXEMPLES } from '../contenu/exemples';
import { BlocCode } from './BlocCode';
import { MessageErreur } from './MessageErreur';
import { formater, refusesPourLeWeb } from '../contenu/verification';

interface Props {
  id: string;
  legende?: string;
}

/**
 * Affiche un exemple de `contenu/exemples.ts`. Les exemples faux ou
 * refusés montrent le message réel du compilateur.
 */
export function Exemple({ id, legende }: Props) {
  const exemple = EXEMPLES.find((e) => e.id === id);
  if (!exemple) throw new Error(`Exemple introuvable : « ${id} »`);

  const refuse = exemple.mode === 'erreur';
  const refusWeb = exemple.mode === 'refus-web';
  const prevenu = exemple.mode === 'avertissement' || exemple.tolere !== undefined;

  return (
    <div data-exemple={id}>
      <BlocCode
        code={exemple.code}
        legende={legende ?? (refuse ? 'Ce programme est refusé :' : refusWeb ? 'Ce programme est refusé pour le web :' : undefined)}
        variante={refuse || refusWeb ? 'erreur' : prevenu ? 'avertissement' : undefined}
      />
      {refuse && <MessageErreur source={exemple.code} gravite="erreur" />}
      {refusWeb &&
        refusesPourLeWeb(exemple.code).map((d, i) => (
          <div key={i} role="note" className="message message--erreur">
            <span className="message__genre">Erreur affichée par la commande compile</span>
            {formater(d)}
          </div>
        ))}
      {prevenu && <MessageErreur source={exemple.code} gravite="avertissement" />}
    </div>
  );
}
