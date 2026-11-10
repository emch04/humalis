import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { analyser } from '../src/lexer/lexer.js';
import { programme } from './analyse/aide.js';

// Les phrases validées par Emch le 11 novembre 2026 : « si actif : » et « desactive » sur un champ.
const sansErreur = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};
const messages = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message).join('\n');
const trouver = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([k]) => k.endsWith(fin))![1];
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');

const web = (source: string) => genererProjetWeb(sansErreur(source), { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
const moteur = (source: string) => genererProjetMoteur(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const statique = (source: string) => genererProjetStatique(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const mobile = (source: string) => genererProjetMobile(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const bureauReact = (source: string) => genererProjetDesktop(sansErreur(source), { nom: 'a', source: 'a.humalis' });
const bureauMoteur = (source: string) => genererProjetDesktop(sansErreur(source), { nom: 'a', source: 'a.humalis', moteur: 'humalis' });
const apple = (source: string) => trouver(genererProjetApple(sansErreur(source), { nom: 'a', source: 'a.humalis' }).fichiers, 'PageAccueil.swift');

describe('« si actif : » : une valeur vrai ou faux seule', () => {
  const source = programme(
    'page "accueil" :',
    '>variable actif = vrai',
    '>variable pret = faux',
    '>variable nom = ""',
    '>variable compte = 0',
    '>variable taches = [fiche avec nom "A" et faite vrai]',
    '>calcul tout = actif et pret',
    '>calcul ouvert = actif ou pret',
    '>titre "Essai"',
    '>si actif :',
    '>>texte "Actif"',
    '>sinon :',
    '>>texte "Inactif"',
    '>si actif et pret :',
    '>>texte "Les deux"',
    '>si actif ou nom est vide :',
    '>>texte "Un des deux"',
    '>si non actif et pret :',
    '>>texte "Prêt seulement"',
    '>pour chaque t dans taches :',
    '>>si t.faite :',
    '>>>texte "Faite : {t.nom}"',
    '>bouton "Go" avec desactive si actif et couleur bleu',
    '>toutes les 1 seconde tant que actif :',
    '>>changer compte par compte + 1',
    '>quand l\'utilisateur clique sur "Go" :',
    '>>tant que actif :',
    '>>>changer actif par faux',
  );

  it('se lit comme « est vrai », seule, combinée et sur le champ d’une fiche', () => {
    const corps = analyserSyntaxe(analyser(source)).pages[0].corps;
    const condition = corps.find((i) => i.type === 'Condition')!;
    expect(condition.type === 'Condition' && condition.test).toMatchObject({ type: 'Comparaison', gauche: { type: 'Reference', nom: 'actif' }, operateur: 'vrai', seule: true });
    const boucle = corps.find((i) => i.type === 'Boucle')!;
    const dedans = boucle.type === 'Boucle' ? boucle.corps[0] : undefined;
    expect(dedans?.type === 'Condition' && dedans.test).toMatchObject({ gauche: { type: 'AccesChamp' }, operateur: 'vrai' });
  });

  it('devient du JavaScript sur le web (React)', () => {
    const page = trouver(web(source), 'src/pages/Accueil.tsx');
    expect(page).toContain('const tout = (actif && pret);');
    expect(page).toContain('const ouvert = ((actif || pret));');
    expect(page).toContain('{actif ? (');
    expect(page).toContain('{actif && pret && (');
    expect(page).toContain('{(actif || (nom?.length ?? 0) === 0) && (');
    expect(page).toContain('{!actif && pret && (');
    expect(page).toContain('{t.faite === true && (');
    expect(page).toContain('className="humalis-couleur-bleu" onClick={quandCliqueGo} disabled={actif}>Go</button>');
    expect(page).toContain('while (actifMaj) {');
  });

  it('suit la valeur sur le moteur Humalis', () => {
    const code = tout(moteur(source));
    expect(code).toContain('const tout = calcul(() => (actif.v && pret.v));');
    expect(code).toContain('() => actif.v ? 0 : 1');
    expect(code).toContain('() => actif.v && pret.v ? 0 : -1');
    expect(code).toContain("attribut(r[");
    expect(code).toMatch(/attribut\(r\[\d+\], 'disabled', \(\) => actif\.v\);/);
  });

  it('devient du JavaScript en statique et sur le bureau', () => {
    const code = trouver(statique(source), 'pages/accueil.js');
    expect(code).toContain('return (actif && pret);');
    expect(code).toContain('...(actif && pret');
    expect(code).toContain("disabled: actif");
    const bureau = trouver(bureauReact(source), 'src/pages/Accueil.tsx');
    expect(bureau).toContain('{actif && pret && (');
    expect(tout(bureauMoteur(source))).toContain('() => actif.v && pret.v ? 0 : -1');
  });

  it('devient du React Native sur le mobile', () => {
    const page = trouver(mobile(source), 'app/index.tsx');
    expect(page).toContain('const tout = (actif && pret);');
    expect(page).toContain('{actif && pret && (');
    expect(page).toContain('disabled={actif} accessibilityState={{ disabled: actif }}');
  });

  it('devient du Swift sur Apple', () => {
    const page = apple(source);
    expect(page).toContain('private var tout: Bool { (actif && pret) }');
    expect(page).toContain('if actif && pret {');
    expect(page).toContain('if actif || nom.isEmpty {');
    expect(page).toContain('if !actif && pret {');
    expect(page).toContain('if t_.faite {');
    expect(page).toContain('.disabled(actif)');
    expect(page).toContain('while actif {');
  });

  it('refuse une valeur seule qui n’est pas vrai ou faux, avec un message clair', () => {
    const fautif = programme('page "accueil" :', '>variable prix = 3', '>variable nom = "a"', '>titre "a"', '>si prix :', '>>texte "a"', '>bouton "Go" avec desactive si nom');
    const lu = messages(fautif);
    expect(lu).toContain('« prix » est un nombre : une valeur seule comme condition doit être vrai ou faux. Écrivez une comparaison, par exemple « prix est egal a … ».');
    expect(lu).toContain('« nom » est un texte : une valeur seule comme condition doit être vrai ou faux.');
  });

  it('refuse toujours une comparaison mal écrite', () => {
    const fautif = programme('page "accueil" :', '>variable prix = 3', '>titre "a"', '>si prix egal a 3 :', '>>texte "a"');
    expect(messages(fautif)).toContain('il manque « est » dans la comparaison');
  });
});

describe('« avec desactive » sur un champ', () => {
  const source = programme(
    'page "accueil" :',
    '>variable verrou = vrai',
    '>titre "Essai"',
    '>formulaire "fiche" :',
    '>>champ "Nom" avec desactive',
    '>>champ "Ville" avec desactive si verrou',
    '>>champ email "Courriel" avec desactive si verrou est vrai',
    '>>champ nombre "Age" avec desactive si verrou',
    '>>champ mot de passe "Secret" avec desactive si verrou',
    '>>champ texte long "Note" avec desactive si verrou',
    '>>case a cocher "Accord" avec desactive si verrou',
    '>>choix "Taille" parmi ["S", "M"] avec desactive si verrou',
    '>>liste deroulante "Pays" parmi ["France", "Belgique"] avec desactive si verrou',
    '>>bouton "Envoyer"',
    '>quand le formulaire "fiche" est soumis :',
    '>>afficher "Envoyé"',
    '>bouton "Basculer"',
    '>quand l\'utilisateur clique sur "Basculer" :',
    '>>changer verrou par non verrou',
  );

  it('suit sa condition sur le web (React), pour chaque sorte de champ', () => {
    const fichiers = web(source);
    const page = trouver(fichiers, 'src/pages/Accueil.tsx');
    expect(page).toContain('<input data-humalis="champ_nom" disabled={true} value={champNom}');
    expect(page).toContain('<input data-humalis="champ_ville" disabled={verrou} value={champVille}');
    expect(page).toContain('type="email" autoComplete="email" disabled={verrou}');
    expect(page).toContain('type="number" disabled={verrou}');
    expect(page).toContain('<MotDePasse data-humalis="champ_secret" autoComplete="new-password" disabled={verrou}');
    expect(page).toContain('<textarea data-humalis="champ_note" rows={4} disabled={verrou}');
    expect(page).toContain('type="checkbox" disabled={verrou} checked={champAccord}');
    expect(page).toContain('<fieldset data-humalis="champ_taille" className="humalis-choix" disabled={verrou}>');
    expect(page).toContain('<select data-humalis="champ_pays" disabled={verrou} value={champPays}');
    expect(tout(fichiers)).toContain(':is(input, select, textarea, fieldset):disabled { opacity: 0.5; cursor: not-allowed; }');
  });

  it('suit sa condition sur le moteur Humalis, dès le HTML de départ', () => {
    const fichiers = moteur(source);
    const code = tout(fichiers);
    expect(code).toMatch(/attribut\(r\[\d+\], 'disabled', \(\) => verrou\.v\);/);
    expect((code.match(/'disabled', \(\) => verrou\.v\)/g) ?? []).length).toBe(8);
    const html = trouver(fichiers, 'index.html');
    expect(html).toContain('<input data-humalis="champ_nom" disabled="true"');
    expect(html).toContain('<fieldset data-humalis="champ_taille" class="humalis-choix" disabled="true"');
    expect(html).toContain('<select data-humalis="champ_pays" disabled="true"');
  });

  it('suit sa condition en statique', () => {
    const fichiers = statique(source);
    const code = trouver(fichiers, 'pages/accueil.js');
    expect(code).toContain("creer('input', { 'data-humalis': 'champ_nom', disabled: true,");
    expect(code).toContain("creer('input', { 'data-humalis': 'champ_ville', disabled: verrou,");
    expect(code).toContain("creer('textarea', { rows: 4, 'data-humalis': 'champ_note', disabled: verrou,");
    expect(code).toContain("creer('fieldset', { 'data-humalis': 'champ_taille', class: 'humalis-choix', disabled: verrou }");
    expect(code).toContain("creer('select', { 'data-humalis': 'champ_pays', disabled: verrou,");
    const html = trouver(fichiers, 'index.html');
    expect(html).toContain('<input data-humalis="champ_ville" disabled="">');
    expect(html).toContain('<input type="checkbox" data-humalis="champ_accord" disabled="">');
  });

  it('suit sa condition sur le bureau', () => {
    expect(trouver(bureauReact(source), 'src/pages/Accueil.tsx')).toContain('<input data-humalis="champ_ville" disabled={verrou}');
    expect(tout(bureauMoteur(source))).toMatch(/attribut\(r\[\d+\], 'disabled', \(\) => verrou\.v\);/);
  });

  it('ne se modifie plus sur le mobile', () => {
    const page = trouver(mobile(source), 'app/index.tsx');
    expect(page).toContain('<TextInput testID="champ_nom" accessibilityLabel="Nom" editable={false} accessibilityState={{ disabled: true }}');
    expect(page).toContain('<TextInput testID="champ_ville" accessibilityLabel="Ville" editable={!(verrou)} accessibilityState={{ disabled: verrou }}');
    expect(page).toContain('<MotDePasse testID="champ_secret" accessibilityLabel="Secret" autoComplete="new-password" autoCapitalize="none" editable={!(verrou)}');
    expect(page).toContain('<Switch testID="champ_accord" accessibilityLabel="Accord" disabled={verrou} accessibilityState={{ disabled: verrou }}');
    expect(page).toContain('accessibilityRole="radio" aria-checked={champTaille === option} disabled={verrou}');
    expect(page).toContain('aria-expanded={ouvertPays} disabled={verrou} accessibilityState={{ disabled: verrou }}');
  });

  it('devient .disabled sur Apple', () => {
    const page = apple(source);
    expect(page).toMatch(/ChampHumalis\(libelle: "Nom", texte: \$champNom, clavier: \.texte\)\n\s+\.disabled\(true\)/);
    expect(page).toMatch(/ChampHumalis\(libelle: "Ville", texte: \$champVille, clavier: \.texte\)\n\s+\.disabled\(verrou\)/);
    expect(page).toMatch(/Toggle\(isOn: \$champAccord\) \{ Text\(verbatim: "Accord"\) \}\n\s+\.disabled\(verrou\)/);
    expect(page).toMatch(/ChoixHumalis\(libelle: "Taille", valeurs: \["S", "M"\], choisi: \$champTaille\)\n\s+\.disabled\(verrou\)/);
    expect(page).toMatch(/ListeHumalis\(libelle: "Pays", valeurs: \["France", "Belgique"\], choisi: \$champPays\)\n\s+\.disabled\(verrou\)/);
  });

  it('ne vaut que pour un bouton ou un champ', () => {
    const lu = messages(programme('page "accueil" :', '>titre "a" avec desactive'));
    expect(lu).toContain('« avec desactive » s\'applique à un bouton ou à un champ, pas à un titre.');
  });
});
