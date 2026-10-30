import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';

export function MiseEnPage() {
  return (
    <PageDoc chemin="/documentation/mise-en-page">
      <p>
        Humalis s’occupe de la <strong>structure</strong> de la page ; son <strong>apparence</strong>, c’est le CSS
        (voir <Link to="/documentation/styles">les styles</Link>). Pour que le CSS ait de quoi mettre en forme, on
        regroupe les éléments dans des blocs : une section, une ligne, une colonne, une grille, ou une simple boîte.
      </p>

      <h2>Une section</h2>
      <p>
        <code>section "Titre" :</code> ouvre une partie de la page, avec son titre. Ce qu’elle contient s’écrit en
        dessous, décalé de 4 espaces. Le titre est un titre comme les autres ; <code>section :</code> sans titre est
        permis aussi.
      </p>
      <Exemple id="mise-en-page-section" />

      <h2>Côte à côte, les uns sous les autres</h2>
      <p>
        <code>ligne :</code> place ses éléments côte à côte, et les passe à la ligne quand la place manque.{' '}
        <code>colonne :</code> les place les uns sous les autres, avec un espace régulier.
      </p>
      <Exemple id="mise-en-page-colonne" />

      <h2>Une grille</h2>
      <p>
        <code>grille :</code> range ses éléments en colonnes qui s’adaptent à la largeur de l’écran : plusieurs sur
        un ordinateur, une seule sur un téléphone. <code>bloc :</code> est une boîte sans sens particulier : ici, la
        fiche de chaque plat. Un événement s’écrit sous son bouton, même dans un bloc.
      </p>
      <Exemple id="mise-en-page-grille" />

      <h2>Le CSS fait le reste</h2>
      <p>
        Chaque bloc accepte <code>avec style "…"</code>, comme un élément. Humalis donne une mise en page de départ
        (rangée, colonne, grille) ; ton CSS, chargé après, la change comme il veut.
      </p>
      <Exemple id="mise-en-page-css" />

      <h2>Les réglages nommés</h2>
      <p>
        Quelques réglages, toujours après <code>avec</code>, dispensent d’écrire du CSS pour les choses les plus
        courantes : <code>colonnes 1</code> à <code>6</code> (une grille), <code>espacement</code> et{' '}
        <code>remplissage</code> (<code>aucune</code>, <code>petite</code>, <code>moyenne</code>,{' '}
        <code>grande</code>), <code>alignement</code> et <code>repartition</code> (une ligne, une colonne),{' '}
        <code>largeur</code> (<code>etroite</code> à <code>pleine</code>), <code>ombre</code>, et les coins{' '}
        <code>bordure douce</code> ou <code>ronde</code>. Chacun dit où il se règle : <code>colonnes</code> seulement
        sur une grille.
      </p>
      <Exemple id="reglages-blocs" />
      <p>
        <code>degrade bleu vers violet</code> fait un fond en dégradé entre deux couleurs (puis{' '}
        <code>vertical</code> ou <code>horizontal</code>) ; <code>colle</code> garde l’élément en haut de l’écran
        pendant le défilement, <code>colle en bas</code> en bas.
      </p>
      <Exemple id="degrade-colle" />

      <h2>Selon l’appareil</h2>
      <p>
        <code>sur telephone :</code>, <code>sur tablette :</code> et <code>sur ordinateur :</code> (réunis par{' '}
        <code>ou</code>) n’affichent leur contenu que sur ces appareils : moins de 640 pixels de large pour un
        téléphone, de 640 à 1023 pour une tablette, 1024 et plus pour un ordinateur. Sur le web, c’est du CSS seul :
        le HTML prérendu est le même partout, rien ne clignote.
      </p>
      <Exemple id="par-appareil" />

      <h2>Le thème du projet</h2>
      <p>
        Le bloc <code>theme :</code>, en haut du fichier, donne au projet ses couleurs (claires et sombres), ses
        polices (par leur nom, ou avec <code>depuis "./police.woff2"</code> : le fichier est intégré au CSS, aucun
        service en ligne n’est appelé), son <code>mode</code> et la <code>largeur</code> de ses pages. Une couleur du
        thème s’emploie comme <code>bleu</code> ou <code>rouge</code>, y compris dans un dégradé, et le texte posé sur
        un fond de couleur reste lisible : Humalis calcule la couleur d’« encre ». Les couleurs s’écrivent entre
        guillemets. <code>changer theme par sombre</code> laisse le visiteur choisir ; son choix est retrouvé à sa
        prochaine visite.
      </p>
      <Exemple id="theme" />

      <h2>En-tête et pied de page communs</h2>
      <p>
        <code>entete :</code> et <code>pied :</code>, en haut du fichier, sont communs à toutes les pages ; une page
        s’en passe avec <code>sans entete</code> ou <code>sans pied</code>. Il n’y en a qu’un de chaque.
      </p>
      <Exemple id="entete-pied" />

      <Encadre titre="Sur chaque cible">
        <p>
          Sur le web, le bureau et le site statique, une section devient <code>&lt;section&gt;</code> et les autres
          blocs des <code>&lt;div&gt;</code>, avec les classes <code>humalis-ligne</code>,{' '}
          <code>humalis-colonne</code>, <code>humalis-grille</code>. Sur le téléphone, ce sont des{' '}
          <code>View</code> ; une grille y tient sur une colonne, et le CSS ne s’applique pas.
        </p>
        <p>
          L’en-tête et le pied sont montés une seule fois sur le web (ils restent là quand on change de page), recopiés
          dans chaque page sur le site statique (leur état repart de zéro d’une page à l’autre), et placés au-dessus et en
          dessous de la pile de navigation sur le téléphone. <code>colle</code> n’a d’effet sur le téléphone que pour
          l’en-tête et le pied ; les polices en fichier n’y sont pas encore chargées ; le choix du thème y vaut pour la
          session.
        </p>
      </Encadre>
    </PageDoc>
  );
}
