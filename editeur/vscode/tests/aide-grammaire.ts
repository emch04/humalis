import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vscodeTextmate from 'vscode-textmate';
import vscodeOniguruma from 'vscode-oniguruma';

const { Registry, parseRawGrammar } = vscodeTextmate;
const { loadWASM, OnigScanner, OnigString } = vscodeOniguruma;

const dossier = dirname(fileURLToPath(import.meta.url));
export const racine = join(dossier, '..');

export interface JetonColorie {
  texte: string;
  portees: string[];
}

let grammairePrete: ReturnType<InstanceType<typeof Registry>['loadGrammar']> | null = null;

async function chargerGrammaire() {
  if (!grammairePrete) {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(
      join(dirname(require.resolve('vscode-oniguruma')), 'onig.wasm'),
    );
    await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
    const registre = new Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (sources: string[]) => new OnigScanner(sources),
        createOnigString: (s: string) => new OnigString(s),
      }),
      loadGrammar: async () => null,
    });
    const contenu = readFileSync(
      join(racine, 'syntaxes', 'humalis.tmLanguage.json'),
      'utf8',
    );
    // VS Code fournit la grammaire CSS (« source.css ») : on la remplace
    // ici par une grammaire vide, pour que le bloc « style : » se charge.
    await registre.addGrammar(
      parseRawGrammar(JSON.stringify({ scopeName: 'source.css', patterns: [] }), 'css.json'),
    );
    grammairePrete = registre.addGrammar(
      parseRawGrammar(contenu, 'humalis.tmLanguage.json'),
    ) as never;
  }
  return grammairePrete!;
}

/** Colorie un texte Humalis : une liste de lignes, chacune une liste de jetons. */
export async function colorier(source: string): Promise<JetonColorie[][]> {
  const grammaire = (await chargerGrammaire()) as unknown as {
    tokenizeLine(ligne: string, pile: unknown): {
      tokens: { startIndex: number; endIndex: number; scopes: string[] }[];
      ruleStack: unknown;
    };
  };
  let pile: unknown = null;
  const lignes: JetonColorie[][] = [];
  for (const ligne of source.split('\n')) {
    const resultat = grammaire.tokenizeLine(ligne, pile);
    pile = resultat.ruleStack;
    lignes.push(
      resultat.tokens.map((t) => ({
        texte: ligne.slice(t.startIndex, t.endIndex),
        portees: t.scopes,
      })),
    );
  }
  return lignes;
}

/** Portée la plus précise d'un jeton (sans « source.humalis »). */
export function porteeDe(jeton: JetonColorie): string | undefined {
  return jeton.portees.filter((p) => p !== 'source.humalis').pop();
}

/** Cherche le premier jeton qui a ce texte exact dans la ligne. */
export function jetonDe(ligne: JetonColorie[], texte: string): JetonColorie {
  const jeton =
    ligne.find((j) => j.texte === texte) ?? ligne.find((j) => j.texte.includes(texte));
  if (!jeton) throw new Error(`jeton « ${texte} » introuvable dans la ligne`);
  return jeton;
}
