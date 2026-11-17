import { beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rapportJson } from '../src/analyse/json';
import { correctionDe } from '../src/analyse/corrections';
import { compiler } from '../src/compilateur';

/**
 * « humalis verifier --json » et « humalis compile --json » (17 novembre 2026) : la forme du rapport, stable, pour les
 * agents d'IA. La sortie standard ne porte que le JSON ; le code de sortie ne change pas.
 */
const dossier = mkdtempSync(join(tmpdir(), 'humalis-json-'));
const fichier = (nom: string, source: string) => {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, source);
  return chemin;
};
// La commande, construite à part (dist n'est pas touché).
const construite = join(dossier, 'humalis');
beforeAll(() => {
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--outDir', construite], { encoding: 'utf8' });
  expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
}, 300_000);
const humalis = (...args: string[]) => spawnSync(process.execPath, [join(construite, 'cli.js'), ...args], { encoding: 'utf8' });
const BON = 'page "accueil" :\n    titre "Accueil"\n';
const SERVEUR = (lignes: string) => `serveur "boutique" :\n${lignes}    donnee note :\n        texte : texte\n    route "notes" :\n        tout le monde peut lire note\n        seul admin peut modifier note\n\npage "accueil" :\n    titre "Accueil"\n`;

describe('le rapport JSON', () => {
  it('un programme juste : ok, aucun diagnostic, code de sortie 0, rien d’autre sur la sortie standard', () => {
    const r = humalis('verifier', fichier('bon.humalis', BON), '--json');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ version: 1, fichier: 'bon.humalis', ok: true, diagnostics: [] });
  });

  it('une erreur : chaque clé, son type ; le code de sortie reste 1', () => {
    const r = humalis('verifier', fichier('faux.humalis', 'page "accueil" :\n    titre "Accueil\n'), '--json');
    expect(r.status).toBe(1);
    const rapport = JSON.parse(r.stdout);
    expect(rapport).toMatchObject({ version: 1, fichier: 'faux.humalis', ok: false });
    expect(rapport.diagnostics).toHaveLength(1);
    const [d] = rapport.diagnostics;
    expect(Object.keys(d).sort()).toEqual(['code', 'colonne', 'fichier', 'gravite', 'ligne', 'message']);
    expect(d).toMatchObject({ fichier: 'faux.humalis', ligne: 2, gravite: 'erreur' });
    expect(d.code).toMatch(/^HUM-\d{4}$/);
    expect(typeof d.colonne).toBe('number');
    expect(d.message).toContain('guillemet');
    // Sans --json, la sortie texte ne change pas, et rien ne part sur la sortie standard.
    const texte = humalis('verifier', join(dossier, 'faux.humalis'));
    expect(texte.status).toBe(1);
    expect(texte.stdout).toBe('');
    expect(texte.stderr).toContain('Erreur, ligne 2 :');
  });

  it('un nom mal écrit : la correction, et la colonne inconnue vaut null', () => {
    const r = humalis('verifier', fichier('nom.humalis', 'page "accueil" :\n    variable prix = 3\n    titre "Prix"\n    texte "{prx}"\n'), '--json');
    const d = JSON.parse(r.stdout).diagnostics.find((x: { gravite: string }) => x.gravite === 'erreur');
    expect(d.colonne).toBeNull();
    expect(d.correction).toEqual({ remplace: 'prx', par: 'prix' });
  });

  it('une ancienne forme : un avertissement, sa correction, et ok reste vrai', () => {
    const r = humalis('compile', fichier('ancien.humalis', SERVEUR('    ia par anthropic\n    connecte peut demander a ia\n')), '--cible', 'serveur', '--sortie', join(dossier, 'sortie'), '--json');
    expect(r.status).toBe(0);
    const rapport = JSON.parse(r.stdout);
    expect(rapport.ok).toBe(true);
    expect(rapport.diagnostics[0]).toMatchObject({ gravite: 'avertissement', correction: { remplace: 'ia par anthropic', par: 'ia' } });
    expect(r.stderr).toContain('Serveur écrit dans');
  });

  it('« ok » suit le code de sortie, « --exigeant » compris (il durcit les avertissements de qualité)', () => {
    for (const chemin of ['bon.humalis', 'faux.humalis', 'ancien.humalis']) {
      const r = humalis('verifier', join(dossier, chemin), '--exigeant', '--json');
      expect(JSON.parse(r.stdout).ok, chemin).toBe(r.status === 0);
    }
  });
});

describe('les messages de la commande et la publication', () => {
  it('un fichier introuvable : un diagnostic du rapport, avec sa ligne et son code ; le texte ne change pas', () => {
    const chemin = fichier('style.humalis', 'utiliser style "./absent.css"\n\npage "accueil" :\n    titre "Accueil"\n');
    const r = humalis('compile', chemin, '--cible', 'web', '--sortie', join(dossier, 'web'), '--json');
    expect(r.status).toBe(1);
    const d = JSON.parse(r.stdout).diagnostics.find((x: { message: string }) => x.message.includes('absent.css'));
    expect(d).toMatchObject({ fichier: 'style.humalis', ligne: 1, gravite: 'erreur', code: 'HUM-0764' });
    const texte = humalis('compile', chemin, '--cible', 'web', '--sortie', join(dossier, 'web'));
    expect(texte.stdout).toBe('');
    expect(texte.stderr).toContain('Erreur, ligne 1 : le fichier de style « ./absent.css » est introuvable');
  });

  it('un avertissement de publication devient une erreur avec --exigeant', () => {
    const site = fichier('site.humalis', 'site :\n    nom "Le Fleuve"\n    logo "./logo.svg"\n\npage "accueil" :\n    titre "Le Fleuve"\n    texte "Court."\n');
    const doux = JSON.parse(humalis('verifier', site, '--json').stdout);
    expect(doux.ok).toBe(true);
    expect(doux.diagnostics[0]).toMatchObject({ gravite: 'avertissement', code: expect.stringMatching(/^HUM-/) });
    const r = humalis('verifier', site, '--exigeant', '--json');
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].gravite).toBe('erreur');
  });
});

describe('les corrections : seulement quand elles sont sûres', () => {
  it('l’indentation : un espace de trop ou de moins ; à deux espaces près, rien', () => {
    expect(correctionDe('indentation incohérente : 3 espaces trouvés, un multiple de 4 est attendu')).toEqual({ remplace: '   ', par: '    ' });
    expect(correctionDe('indentation incohérente : 5 espaces trouvés, un multiple de 4 est attendu')).toEqual({ remplace: '     ', par: '    ' });
    expect(correctionDe('indentation incohérente : 6 espaces trouvés, un multiple de 4 est attendu')).toBeUndefined();
    expect(correctionDe('tabulation interdite : utilisez 4 espaces par niveau')).toEqual({ remplace: '\t', par: '    ' });
  });

  it('un message sans correction connue n’en a pas', () => {
    const { diagnostics } = compiler('page "accueil" :\n    bouton "Ok"\n    quand l\'utilisateur clique sur "Ok" :\n        afficher "x"\n    titre 3 + "a"\n');
    for (const d of rapportJson(diagnostics, 'a.humalis').diagnostics) if (!/Peut-être/.test(d.message)) expect(d.correction).toBeUndefined();
    expect(correctionDe('le texte utilise {prix *}, que Humalis ne sait pas lire')).toBeUndefined();
  });

  it('une suggestion que proposerNom n’a pas faite n’est pas une correction', () => {
    expect(correctionDe('« inconnu » n’existe pas. Peut-être « ailleurs » ?')).toBeUndefined();
  });
});

process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));
