// Un module sans framework : le contrat de « utiliser module ».
export default function Compteur3D(element, proprietes) {
  window.__montages = (window.__montages ?? 0) + 1;
  const sortie = document.createElement('output');
  sortie.textContent = `Module : ${proprietes.valeur}`;
  element.append(sortie);
  return {
    mettreAJour(suivantes) {
      window.__misesAJour = (window.__misesAJour ?? 0) + 1;
      sortie.textContent = `Module : ${suivantes.valeur}`;
    },
    detruire() {
      window.__destructions = (window.__destructions ?? 0) + 1;
    },
  };
}
