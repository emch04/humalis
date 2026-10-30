/** Lit un CSV sans dépendance, en conservant le numéro de ligne physique. */
export function lireCsv(texte: string): Record<string, string | number | boolean>[] {
  const lignes: { cases: string[]; numero: number }[] = [];
  let cases: string[] = [];
  let caseCourante = '';
  let guillemets = false;
  let apresGuillemet = false;
  let numero = 1;
  let debut = 1;
  const source = texte.replace(/^\uFEFF/, '');
  let premiere = '';
  let dansGuillemets = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (dansGuillemets && source[i + 1] === '"') { i++; continue; }
      dansGuillemets = !dansGuillemets;
      continue;
    }
    if (!dansGuillemets && (c === '\n' || c === '\r')) break;
    if (!dansGuillemets) premiere += c;
  }
  const compte = (s: string) => [...premiere].filter((c) => c === s).length;
  const separateur = [';', '\t', ','].sort((a, b) => compte(b) - compte(a))[0];
  const finirCase = () => { cases.push(caseCourante); caseCourante = ''; apresGuillemet = false; };
  const finirLigne = () => { finirCase(); lignes.push({ cases, numero: debut }); cases = []; debut = numero + 1; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (guillemets) {
      if (c === '"' && source[i + 1] === '"') { caseCourante += '"'; i++; }
      else if (c === '"') { guillemets = false; apresGuillemet = true; }
      else { caseCourante += c; if (c === '\n') numero++; }
      continue;
    }
    if (c === '"' && caseCourante === '' && !apresGuillemet) { guillemets = true; continue; }
    if (c === separateur) { finirCase(); continue; }
    if (c === '\n' || c === '\r') { finirLigne(); if (c === '\r' && source[i + 1] === '\n') i++; numero++; continue; }
    if (apresGuillemet || c === '"') throw new Error(`ligne ${numero} : guillemets mal formés dans le CSV.`);
    caseCourante += c;
  }
  if (guillemets) throw new Error(`ligne ${numero} : guillemet non fermé dans le CSV.`);
  if (cases.length || caseCourante !== '' || apresGuillemet) finirLigne();
  if (!lignes.length) throw new Error('ligne 1 : le CSV doit commencer par des noms de colonnes.');
  const noms = lignes.shift()!.cases.map((nom) => nom.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  if (noms.some((nom) => !nom)) throw new Error('ligne 1 : une colonne du CSV n’a pas de nom.');
  if (new Set(noms).size !== noms.length) throw new Error('ligne 1 : deux colonnes du CSV portent le même nom.');
  for (const ligne of lignes) if (ligne.cases.length !== noms.length) throw new Error(`ligne ${ligne.numero} : ${noms.length} colonnes attendues, ${ligne.cases.length} trouvées.`);
  const nombre = (v: string) => /^[-+]?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[,.]\d+)?$/.test(v.trim());
  const booleen = (v: string) => /^(oui|non|vrai|faux|true|false)$/i.test(v.trim());
  const genres = noms.map((_, col) => {
    const valeurs = lignes.map((l) => l.cases[col].trim()).filter(Boolean);
    return valeurs.length && valeurs.every(nombre) ? 'nombre' : valeurs.length && valeurs.every(booleen) ? 'booleen' : 'texte';
  });
  return lignes.map((ligne) => Object.fromEntries(noms.map((nom, col) => {
    const valeur = ligne.cases[col].trim();
    if (genres[col] === 'nombre' && !valeur) throw new Error(`ligne ${ligne.numero} : la colonne « ${nom} » attend un nombre, mais la case est vide.`);
    return [nom, genres[col] === 'nombre' ? Number(valeur.replace(/[ \u00a0]/g, '').replace(',', '.')) : genres[col] === 'booleen' ? /^(oui|vrai|true)$/i.test(valeur) : valeur];
  })));
}
