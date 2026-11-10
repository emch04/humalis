import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { MESSAGES, verificationsDuChamp, versionDe } from '../src/i18n/messages.js';
import { AUTRES_LANGUES } from '../src/i18n/messages-langues.js';
import { FORMAT_JS_LANGUES, FORMES_TEXTE_JS, avecMajuscule, formaterDateLongue, formaterEnLettres, initialesDe } from '../src/cibles/format.js';
import { programme } from './analyse/aide.js';

const OPTIONS = { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' };
const NOUVELLES = ['es', 'pt', 'sw', 'ln'] as const;
// Les ${…} recopiés tels quels ; seul le mot qui relie une liste (« ni », « nem ») se traduit.
const trous = (texte: string) => (texte.match(/\$\{[^}]*\}/g) ?? []).map((t) => t.replace(/\.join\('[^']*'\)/, '.join()')).sort();
const application = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  return application!;
};

describe('les messages de Humalis en espagnol, portugais, swahili et lingala', () => {
  it('chaque message intégré a sa version dans les quatre langues, avec les mêmes ${…}', () => {
    for (const message of MESSAGES) {
      const versions = AUTRES_LANGUES[message.fr];
      expect(versions, message.fr).toBeDefined();
      for (const code of NOUVELLES) {
        expect(versions[code].trim(), `${message.fr} (${code})`).not.toBe('');
        expect(trous(versions[code]), `${message.fr} (${code})`).toEqual(trous(message.fr));
        expect(versionDe(message, code)).toBe(versions[code]);
      }
    }
    // Rien de plus que la table : une traduction sans message serait perdue.
    expect(Object.keys(AUTRES_LANGUES).sort()).toEqual(MESSAGES.map((m) => m.fr).sort());
  });

  it('les erreurs de champ suivent la langue', () => {
    const [[, obligatoire]] = verificationsDuChamp('nom', { obligatoire: true } as never, [
      { code: 'fr', libelle: 'Nom' },
      { code: 'es', libelle: 'Nombre' },
      { code: 'pt', libelle: 'Nome' },
      { code: 'sw', libelle: 'Jina' },
      { code: 'ln', libelle: 'Nkombo' },
    ]);
    expect(obligatoire).toEqual([
      { code: 'fr', texte: 'Le champ « Nom » est obligatoire.' },
      { code: 'es', texte: 'El campo «Nombre» es obligatorio.' },
      { code: 'pt', texte: 'O campo «Nome» é obrigatório.' },
      { code: 'sw', texte: 'Sehemu “Jina” inahitajika.' },
      { code: 'ln', texte: '« Nkombo » esengeli kotondisama.' },
    ]);
  });

  it('un site en français et en espagnol : accepté, et ses messages sont traduits', () => {
    const source = programme(
      'langues : francais, espagnol',
      '',
      'page "accueil" :',
      '>selecteur de langue',
      '>titre "Bienvenue" en espagnol "Bienvenido"',
      '>formulaire "f" :',
      '>>champ "Nom" en espagnol "Nombre" avec obligatoire',
      '>>bouton "Envoyer" en espagnol "Enviar"',
      '>quand le formulaire "f" est soumis :',
      '>>afficher "Merci" en espagnol "Gracias"',
    );
    const fichiers = genererProjetWeb(application(source), OPTIONS);
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain("t({ fr: 'Réessayer', es: 'Reintentar' })");
    expect(tout).toContain("es: 'El campo «Nombre» es obligatorio.'");
    expect(fichiers.get('src/humalis/langue.tsx')).toContain("es: 'Idioma'");
    // Aucune clé d'une langue que le site n'a pas : le TypeScript produit la refuserait.
    expect(tout).not.toMatch(/t\(\{[^}]*\ben: /);
    expect(tout).toContain('<html lang="fr"');
  });
});

describe('« en date longue », « en lettres », « avec majuscule », « initiales de » suivent la langue', () => {
  it('dans chaque langue', () => {
    expect(formaterEnLettres(71)).toBe('soixante et onze');
    expect(formaterEnLettres(71, 'en')).toBe('seventy-one');
    expect(formaterEnLettres(1234, 'en')).toBe('one thousand two hundred thirty-four');
    expect(formaterEnLettres(71, 'es')).toBe('setenta y uno');
    expect(formaterEnLettres(21000, 'es')).toBe('veintiún mil');
    expect(formaterEnLettres(100, 'es')).toBe('cien');
    expect(formaterEnLettres(71, 'pt')).toBe('setenta e um');
    expect(formaterEnLettres(1100, 'pt')).toBe('mil e cem');
    expect(formaterEnLettres(2500000, 'pt')).toBe('dois milhões e quinhentos mil');
    expect(formaterEnLettres(71, 'sw')).toBe('sabini na moja');
    expect(formaterEnLettres(2500, 'sw')).toBe('elfu mbili na mia tano');
    // Le lingala garde les chiffres.
    expect(formaterEnLettres(71, 'ln')).toBe('71');
    expect(formaterDateLongue('2026-11-09')).toBe('lundi 9 novembre');
    expect(formaterDateLongue('2026-11-09', 'en')).toBe('Monday 9 November');
    expect(formaterDateLongue('2026-11-09', 'es')).toBe('lunes, 9 de noviembre');
    expect(formaterDateLongue('2026-11-09', 'pt')).toBe('segunda-feira, 9 de novembro');
    expect(formaterDateLongue('2026-11-09', 'sw')).toBe('Jumatatu, 9 Novemba');
    expect(formaterDateLongue('2026-11-09', 'ln')).toBe('mokɔlɔ mwa yambo 9 sánzá ya zómi na mɔ̌kɔ́');
    expect(avecMajuscule('lunes, 9 de noviembre', 'es')).toBe('Lunes, 9 de noviembre');
    expect(initialesDe('Direção geral', 'pt')).toBe('DG');
    // Les mêmes fonctions, recopiées dans les projets produits.
    const f = new Function(`${FORMES_TEXTE_JS}; return { formaterEnLettres, formaterDateLongue };`)() as { formaterEnLettres: (n: number, l?: string) => string; formaterDateLongue: (d: string, l?: string) => string };
    expect(f.formaterEnLettres(71, 'es')).toBe('setenta y uno');
    expect(f.formaterDateLongue('2026-11-09', 'sw')).toBe('Jumatatu, 9 Novemba');
    const o = new Function(`${FORMAT_JS_LANGUES}\nreturn { formaterDate, accorder };`)() as { formaterDate: (d: string, l?: string) => string; accorder: (n: number, m: string, l?: string) => string };
    expect(o.formaterDate('2026-11-07', 'es')).toBe('7 de noviembre de 2026');
    expect(o.formaterDate('2026-11-07', 'ln')).toBe('7 sánzá ya zómi na mɔ̌kɔ́ 2026');
    expect(o.accorder(2, 'canción', 'es')).toBe('2 canciones');
    expect(o.accorder(3, 'opção', 'pt')).toBe('3 opções');
  });

  it('la version de chaque langue appelle la fonction dans sa langue : web, moteur, Apple', () => {
    const source = programme(
      'langues : francais, espagnol',
      '',
      'page "accueil" :',
      '>variable n = 71',
      '>variable jour = "2026-11-09"',
      '>titre "Accueil" en espagnol "Inicio"',
      '>texte "{n en lettres}, {jour en date longue avec majuscule}" en espagnol "{n en lettres}, {jour en date longue avec majuscule}"',
    );
    const app = application(source);
    const web = genererProjetWeb(app, OPTIONS).get('src/pages/Accueil.tsx')!;
    expect(web).toContain("es: `${formaterEnLettres(n, 'es')}, ${avecMajuscule(formaterDateLongue(jour, 'es'), 'es')}`");
    expect(web).toContain('fr: `${formaterEnLettres(n)}, ${avecMajuscule(formaterDateLongue(jour))}`');
    const moteur = [...genererProjetMoteur(app, OPTIONS as never).values()].join('\n');
    expect(moteur).toContain("formaterEnLettres(n.v, 'es')");
    const apple = [...genererProjetApple(app, OPTIONS as never).fichiers.values()].join('\n');
    expect(apple).toContain('langue: "es"');
    expect(apple).toMatch(/formaterEnLettres\([^)]*, langue: "es"\)/);
    expect(apple).toContain('func formaterEnLettres(_ valeur: Double?, langue: String = "fr") -> String');
  });
});
