import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { CHEMINS_STATIQUE, HTML_STATIQUE, SCRIPT_STATIQUE } from '../../contenu/projetBureauStatique';

export function TonSiteStatique() {
  return (
    <PageDoc chemin="/documentation/ton-site-statique">
      <p>
        Le même programme Humalis devient un <strong>site statique</strong> : du HTML, du CSS et un petit JavaScript
        écrit en clair, sans React, sans framework et sans construction. Tu le déposes tel quel chez n’importe quel
        hébergeur, ou tu ouvres <code>index.html</code> d’un double clic.
      </p>

      <Encadre titre="Vérifié dans un vrai navigateur">
        <p>
          <code>npm run essai:statique</code> (dans le dépôt) ouvre la boutique dans Chromium : le contenu se lit sans
          JavaScript, le panier passe d’une page à l’autre, le thème sombre marche, et avec son serveur, la connexion
          et les formulaires aussi.
        </p>
      </Encadre>

      <h2>Compiler</h2>
      <BlocTerminal code="node dist/cli.js compile exemples/boutique.humalis --cible statique --sortie ../boutique-site" />
      <p>Pour la boutique, le site contient ces fichiers :</p>
      <BlocTerminal code={CHEMINS_STATIQUE.join('\n')} etiquette="Fichiers du site statique" />
      <ul>
        <li>
          une page HTML par page Humalis : <code>index.html</code> pour l’entrée, <code>panier.html</code>… Une page
          avec un paramètre s’ouvre avec son adresse : <code>produit.html?id=42</code> ;
        </li>
        <li>
          chaque page contient déjà son contenu de départ, calculé par le compilateur : elle se lit sans JavaScript, et
          les moteurs de recherche la voient ;
        </li>
        <li>un petit script par page la redessine après chaque événement (un clic, un envoi).</li>
      </ul>

      <h2>Un extrait du code produit</h2>
      <BlocTerminal code={SCRIPT_STATIQUE.trimEnd()} legende="pages/boutique.js" etiquette="Script produit pour la page boutique" />
      <details>
        <summary>Le HTML de départ de la même page</summary>
        <BlocTerminal code={HTML_STATIQUE.trimEnd()} legende="index.html" etiquette="HTML produit pour la page boutique" />
      </details>

      <h2>Ce qui change par rapport au web</h2>
      <ul>
        <li>
          une variable <code>avec partagee</code> passe d’une page à l’autre le temps de la visite ;{' '}
          <code>avec memorisee</code> la garde au retour du visiteur ;
        </li>
        <li>
          un composant React (<code>utiliser composant … depuis</code>) est refusé : un site statique n’a pas React.
          Écris-le en Humalis (<code>composant "…" :</code>) ;
        </li>
        <li>
          <code>avec memorisee en secret</code> est refusé, comme sur le web : un navigateur n’a pas de coffre sûr.
        </li>
      </ul>
    </PageDoc>
  );
}
