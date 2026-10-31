import { analyser } from '../../lexer/lexer.js';

const echapper = (texte: string) => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Colore un exemple Humalis valide ; un exemple incomplet reste lisible sans couleur. */
export function colorerCodeHumalis(code: string, langage?: string): string {
  if (langage !== 'humalis') return echapper(code);
  try {
    const tokens = analyser(code);
    const lignes = code.split('\n');
    const debuts: number[] = [];
    let offset = 0;
    for (const ligne of lignes) { debuts.push(offset); offset += ligne.length + 1; }
    const plages: { debut: number; fin: number; classe: string }[] = [];
    for (const token of tokens) {
      if (!['MOT_CLE', 'CHAINE', 'NOMBRE'].includes(token.type)) continue;
      const debut = debuts[token.ligne - 1] + token.colonne - 1;
      let fin = debut + (token.original ?? token.valeur).length;
      // Un texte s'arrête où le lexer l'a fermé (le code entre accents graves et {code "…"} compris).
      if (token.type === 'CHAINE' && token.longueur !== undefined) fin = debut + token.longueur;
      plages.push({ debut, fin, classe: token.type === 'MOT_CLE' ? 'mot' : token.type === 'CHAINE' ? 'texte' : 'nombre' });
    }
    for (let index = 0; index < lignes.length; index++) {
      const ligne = lignes[index];
      for (let colonne = 0; colonne < ligne.length; colonne++) {
        const debut = debuts[index] + colonne;
        if (ligne[colonne] === '#' && !plages.some((p) => p.debut <= debut && debut < p.fin)) {
          plages.push({ debut, fin: debuts[index] + ligne.length, classe: 'commentaire' });
          break;
        }
      }
    }
    plages.sort((a, b) => a.debut - b.debut);
    let rendu = '';
    let position = 0;
    for (const plage of plages) {
      if (plage.debut < position) continue;
      rendu += echapper(code.slice(position, plage.debut));
      rendu += `<span class="humalis-code-${plage.classe}">${echapper(code.slice(plage.debut, plage.fin))}</span>`;
      position = plage.fin;
    }
    return rendu + echapper(code.slice(position));
  } catch {
    return echapper(code);
  }
}
