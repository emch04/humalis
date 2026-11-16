/**
 * Les valeurs que le serveur décide à la création d'une fiche : « au depart »,
 * « calcule », « au plus », « du site » et « creer … dans … ». Rien de la
 * requête ne peut les remplacer ; les règles d'accès restent celles des packs.
 */
import type { RegleChampRI, ServeurRI, ValeurLieeRI } from '../../ri/types.js';
import { camel, pascal } from '../web/noms.js';
import { codePortee } from './separation.js';

const chaine = (texte: string) => JSON.stringify(texte);
const cle = (champ: string) => `fiche[${chaine(camel(champ))}]`;

type Donnee = ServeurRI['donnees'][number];
type Route = ServeurRI['routes'][number];

const decide = (regle: RegleChampRI | undefined) => regle?.genre === 'depart' || regle?.genre === 'nombreDe' || regle?.genre === 'somme' || regle?.genre === 'groupe' || regle?.genre === 'auteur';

/** Les champs que seul le serveur remplit à la création : ceux de la donnée, et ceux que « dans » remplit sur cette route. */
export function champsDuServeur(donnee: Donnee, route?: Route): string[] {
  const dans = (route?.creations ?? []).flatMap((c) => (c.dans !== undefined ? [c.dans] : []));
  return donnee.champs.filter((c) => decide(c.regle) || dans.includes(c.nom)).map((c) => camel(c.nom));
}

/**
 * Les champs que seul le serveur écrit, et que la requête ne peut changer ni à la création ni à la modification :
 * « auteur », le champ de séparation (« par compte », « par boutique »), les calculs (« calcule … », qu'un admin
 * peut corriger) et « paye »,
 * écrit seulement quand Stripe confirme le paiement. Sinon un compte pourrait déplacer sa fiche chez un autre, se
 * dire auteur à la place d'un autre, changer un total calculé ou marquer une fiche payée sans payer.
 */
export function champsFiges(donnee: Donnee, admin = false): string[] {
  return donnee.champs
    .filter((c) => c.regle?.genre === 'auteur' || c.regle?.genre === 'groupe' || (!admin && (c.regle?.genre === 'nombreDe' || c.regle?.genre === 'somme')) || (c.regle?.genre === 'depart' && c.regle.paiement === true))
    .map((c) => camel(c.nom));
}

const champsDuSite = (donnee: Donnee) => donnee.champs.filter((c) => c.regle?.genre === 'site').map((c) => camel(c.nom));

/** Le dernier argument de verifierEnvoi ; rien si la donnée n'a pas de règle, pour que le code produit ne change pas. */
export function reglesEnvoi(donnee: Donnee, route: Route, modification = false): string {
  const serveur = champsDuServeur(donnee, route);
  const site = champsDuSite(donnee);
  const nonVides = donnee.champs.filter((c) => c.nonVide).map((c) => camel(c.nom));
  // Le champ que « creer … dans … » remplit sur cette route est écrit par le serveur : un admin peut le corriger.
  const dans = (route.creations ?? []).flatMap((c) => (c.dans !== undefined ? [camel(c.dans)] : []));
  const fixes = [...new Set([...champsFiges(donnee), ...dans])];
  const fixesHorsAdmin = champsFiges(donnee, true);
  // Dans une modification, un admin peut corriger un calcul ; personne d'autre.
  const codeFixes = modification && fixesHorsAdmin.length !== fixes.length
    ? `(req as unknown as { user?: { role?: unknown } }).user?.role === 'admin' ? ${JSON.stringify(fixesHorsAdmin)} : ${JSON.stringify(fixes)}`
    : JSON.stringify(fixes);
  // Les limites écrites (« entre 0 et 100 », « de 2 a 80 caracteres »…) ; celles par défaut valent sans rien passer.
  const bornes = Object.fromEntries(donnee.champs.flatMap((c) => (c.bornes ? [[camel(c.nom), c.bornes]] : [])));
  const avecBornes = Object.keys(bornes).length > 0;
  if (serveur.length === 0 && site.length === 0 && nonVides.length === 0 && !avecBornes) return '';
  return `, { duServeur: ${JSON.stringify(serveur)}, duSite: ${JSON.stringify(site)}${nonVides.length > 0 ? `, nonVides: ${JSON.stringify(nonVides)}` : ''}${fixes.length > 0 ? `, fixes: ${codeFixes}` : ''}${avecBornes ? `, bornes: ${JSON.stringify(bornes)}` : ''} }`;
}

/**
 * « au plus » vaut aussi dans une modification : quand la requête change le champ borné ou celui qui choisit son
 * plafond, la fiche modifiée est revérifiée. Rien si la donnée n'a pas de champ « au plus ».
 */
export function codePlafondsModification(donnee: Donnee, serveur?: ServeurRI): string {
  const bornes = donnee.champs.filter((c) => c.regle?.genre === 'auPlus');
  if (bornes.length === 0) return '';
  const lignes = bornes.map(({ nom, regle }) => {
    if (regle?.genre !== 'auPlus') return '';
    const champ = chaine(camel(nom));
    const par = chaine(camel(regle.par));
    return `            if (${champ} in envoi.valeur || ${par} in envoi.valeur) {
              const plafond = await plafondDe(stockages.${camel(regle.donnee)}, ${par}, fusion[${par}], ${chaine(camel(regle.prix))}, cercles[${chaine(regle.donnee)}]);
              const valeur = fusion[${champ}];
              if (typeof valeur !== 'number' || valeur < 0 || valeur > plafond) {
                res.status(400).json({ erreur: \`le champ « ${camel(nom)} » doit être entre 0 et \${plafond}\` });
                return;
              }
            }`;
  });
  return `          // « au plus » : la fiche modifiée reste dans ses bornes.
          {
            const avant = await stockages.${camel(donnee.nom)}.trouver(String(req.params.id));
            const fusion: Record<string, unknown> = { ...(avant ?? {}), ...envoi.valeur };
            const cercles: Record<string, ((fiche: Record<string, unknown>) => boolean) | undefined> = ${serveur ? codeCercles(serveur, donnee, donnee.par !== undefined && donnee.par !== 'compte' ? `avant?.[${chaine(camel(donnee.par))}] as string | undefined` : undefined) : '{}'};
${lignes.join('\n')}
          }
`;
}

/** Vrai si la création de cette donnée passe par une fonction « completer… ». */
export const aCompleter = (donnee: Donnee) => donnee.champs.some((c) => (decide(c.regle) && c.regle?.genre !== 'groupe' && c.regle?.genre !== 'auteur') || c.regle?.genre === 'auPlus');

/** La fonction qui écrit, dans la fiche reçue, ce que le serveur décide : l'ordre importe (les calculs lisent les autres champs). */
function fonctionCompleter(donnee: Donnee): string {
  const lignes: string[] = [];
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre === 'depart') lignes.push(`        ${cle(nom)} = ${regle.valeur.genre === 'aujourdhui' ? "new Date().toISOString().slice(0, 10)" : JSON.stringify(regle.valeur.valeur)};`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre !== 'auPlus') continue;
    lignes.push(`        const plafond${pascal(nom)} = await plafondDe(stockages.${camel(regle.donnee)}, ${chaine(camel(regle.par))}, ${cle(regle.par)}, ${chaine(camel(regle.prix))}, cercles[${chaine(regle.donnee)}]);
        if (typeof ${cle(nom)} !== 'number' || ${cle(nom)} < 0 || ${cle(nom)} > plafond${pascal(nom)}) return { erreur: \`le champ « ${camel(nom)} » doit être entre 0 et \${plafond${pascal(nom)}}\` };`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre === 'nombreDe') lignes.push(`        ${cle(nom)} = Array.isArray(${cle(regle.liste)}) ? ${cle(regle.liste)}.length : 0;`);
  }
  for (const { nom, regle } of donnee.champs) {
    if (regle?.genre !== 'somme') continue;
    lignes.push(`        const somme${pascal(nom)} = await sommeDesPrix(stockages.${camel(regle.donnee)}, ${cle(regle.liste)}, ${chaine(camel(regle.prix))}, cercles[${chaine(regle.donnee)}]);
        if (typeof somme${pascal(nom)} === 'string') return { erreur: \`le champ « ${camel(regle.liste)} » : \${somme${pascal(nom)}}\` };
        ${cle(nom)} = somme${pascal(nom)}${regle.plus !== undefined ? ` + Number(${cle(regle.plus)})` : ''};`);
  }
  return `      // Ce que le serveur décide pour « ${donnee.nom} » : la requête ne peut pas le choisir.
      // cercles : pour chaque donnée lue (« somme prix de produit », « au plus prix de zone »), les fiches permises.
      const completer${pascal(donnee.nom)} = async (recu: Record<string, unknown>, cercles: Record<string, ((fiche: Record<string, unknown>) => boolean) | undefined> = {}): Promise<{ valeur: Record<string, unknown> } | { erreur: string }> => {
        const fiche: Record<string, unknown> = { ...recu };
${lignes.join('\n')}
        return { valeur: fiche };
      };
`;
}

/** Les fonctions « completer… » de ce serveur. */
export function codeCompleter(serveur: ServeurRI): string {
  return serveur.donnees.filter(aCompleter).map(fonctionCompleter).join('');
}

const importsVerifier = (serveur: ServeurRI) => {
  const regles = serveur.donnees.flatMap((d) => d.champs.map((c) => c.regle?.genre));
  return [...(regles.includes('auPlus') ? ['plafondDe'] : []), ...(regles.includes('somme') ? ['sommeDesPrix'] : [])];
};
export const noms = importsVerifier;

function valeurLiee(valeur: ValeurLieeRI, parent: string): string {
  if (valeur.genre === 'champ') return `${parent}[${chaine(camel(valeur.champ))}]`;
  if (valeur.genre === 'aujourdhui') return 'new Date().toISOString().slice(0, 10)';
  return JSON.stringify(valeur.valeur);
}

/** Le corps de POST : vérifier, compléter, créer les fiches liées, créer, répondre. */
/**
 * Les fiches qu'une requête peut citer dans un calcul (« somme prix de produit par refs », « au plus prix de zone par … ») :
 * seulement celles que cette personne pourrait lire par la route de cette donnée, avec les mêmes règles (rôle, « par
 * boutique », « par compte », « seul son auteur », « si … »). Sinon, citer l'identifiant d'une fiche cachée révélait son
 * prix dans le total. Une donnée sans route garde sa séparation (« par boutique », « par compte »).
 * groupeExpr : le groupe de la fiche écrite ; une référence doit alors être du même groupe (même pour un admin).
 */
export function codeCercles(serveur: ServeurRI, donnee: Donnee, groupeExpr?: string): string {
  const lues = [...new Set(donnee.champs.flatMap((c) => (c.regle?.genre === 'somme' || c.regle?.genre === 'auPlus' ? [c.regle.donnee] : [])))];
  const moi = '(req as unknown as { user?: Record<string, unknown> }).user';
  const entrees = lues.flatMap((nom) => {
    const source = serveur.donnees.find((d) => d.nom === nom);
    const route = serveur.routes.find((r) => r.donnee === nom && r.interne === undefined);
    if (!source) return [];
    if (!route) {
      // Sans route, la donnée reste séparée : « tarif par boutique » ne se lit que dans sa boutique (revue Codex).
      if (source.par === undefined) return [];
      if (source.par === 'compte') return [`${chaine(nom)}: (f: Record<string, unknown>) => { const u = ${moi}; return u?.role === 'admin' || (u?.id !== undefined && f["compte"] === u.id); }`];
      const champ = chaine(camel(source.par));
      const valeur = groupeExpr !== undefined && donnee.par === source.par ? `${groupeExpr} ?? u?.[${champ}]` : `u?.[${champ}]`;
      return [`${chaine(nom)}: (f: Record<string, unknown>) => { const u = ${moi}; return ((g: unknown) => (typeof g === 'string' && g !== '' ? f[${champ}] === g : u?.role === 'admin'))(${valeur}); }`];
    }
    const tests: string[] = [];
    const libre = route.droits.lire;
    const conditions = route.conditions?.lire ?? [];
    if (libre === 'connecte' || (libre === null && conditions.length > 0)) tests.push(`u !== undefined`);
    else if (libre?.startsWith('role:')) tests.push(`(u?.role === 'admin' || ${JSON.stringify(libre.slice(5).split(','))}.includes(String(u?.role)))`);
    else if (libre === 'admin' || (libre === null && conditions.length === 0)) tests.push(`u?.role === 'admin'`);
    const separee = source.par !== undefined || Object.values(route.conditions ?? {}).some((c) => c.length > 0);
    if (separee) {
      const v = `route${pascal(route.adresse)}`;
      tests.push(`((p) => p !== null && dansPortee(f, p))(porteeDe(u as never, separation${v}, regles${v}.lire))`);
    }
    if (groupeExpr !== undefined && source.par !== undefined && source.par !== 'compte' && donnee.par === source.par) {
      const champ = chaine(camel(source.par));
      tests.push(`((g: unknown) => typeof g !== 'string' || g === '' || f[${champ}] === g)(${groupeExpr})`);
    }
    if (tests.length === 0) return [];
    return [`${chaine(nom)}: (f: Record<string, unknown>) => { const u = ${moi}; return ${tests.join(' && ')}; }`];
  });
  return `{ ${entrees.join(', ')} }`;
}

/**
 * Ce qui fait le montant d'une fiche payable : les champs payés (« payer total pour r »), les calculs et ce qu'ils lisent.
 * Une fiche payée ne les change plus, sauf par un admin.
 */
export function champsDuMontant(donnee: Donnee, route: Route): string[] {
  const calculs = donnee.champs.flatMap((c) => (c.regle?.genre === 'somme' ? [c.nom, c.regle.liste, ...(c.regle.plus !== undefined ? [c.regle.plus] : [])] : c.regle?.genre === 'nombreDe' ? [c.nom, c.regle.liste] : []));
  return [...new Set([...(route.payables ?? []), ...calculs].map((n) => camel(n)))];
}

/**
 * Les fiches qu'un calcul peut citer quand personne n'a lancé l'écriture (après un paiement, dans une tâche) : celles
 * du groupe de la fiche créée, pour chaque donnée lue séparée de la même façon. Rien n'est limité sinon.
 */
export function codeCerclesDuGroupe(serveur: ServeurRI, donnee: Donnee, groupeExpr?: string): string {
  if (groupeExpr === undefined || donnee.par === undefined || donnee.par === 'compte') return '{}';
  const lues = [...new Set(donnee.champs.flatMap((c) => (c.regle?.genre === 'somme' || c.regle?.genre === 'auPlus' ? [c.regle.donnee] : [])))];
  const champ = chaine(camel(donnee.par));
  const entrees = lues.filter((nom) => serveur.donnees.find((d) => d.nom === nom)?.par === donnee.par).map((nom) => `${chaine(nom)}: (f: Record<string, unknown>) => ((g: unknown) => typeof g !== 'string' || g === '' || f[${champ}] === g)(${groupeExpr})`);
  return `{ ${entrees.join(', ')} }`;
}

/**
 * L'écriture d'une modification. Quand la donnée a des calculs (« somme … », « nombre de ») ou un montant payable,
 * tout se fait dans une transaction qui relit la fiche verrouillée : la vérification « déjà payée », le recalcul
 * et l'écriture. Sinon une modification lancée juste avant le paiement écrivait un panier plus cher dans une fiche
 * déjà payée, et deux modifications parties ensemble laissaient un panier de 100 € avec le total de 1 € calculé
 * sur l'ancienne liste (revue Codex). Une modification qui change la liste lue recalcule (« nombre de », « somme »),
 * sinon un panier créé avec un article à 1 € gardait ce total après qu'on y a mis des articles à 1 000 €.
 */
export function codeEcritureModification(donnee: Donnee, route: Route, avecTransaction: boolean, serveur?: ServeurRI): string {
  const nom = camel(donnee.nom);
  const paye = donnee.champs.find((c) => c.regle?.genre === 'depart' && c.regle.paiement === true);
  const montant = paye ? champsDuMontant(donnee, route) : [];
  const calculs = donnee.champs.filter((c) => c.regle?.genre === 'somme' || c.regle?.genre === 'nombreDe');
  if (!avecTransaction || (montant.length === 0 && calculs.length === 0)) return `          const modifie = await stockages.${nom}.modifier(String(req.params.id), envoi.valeur);
`;
  const entrees = [...new Set(calculs.flatMap((c) => (c.regle?.genre === 'somme' ? [c.regle.liste, ...(c.regle.plus !== undefined ? [c.regle.plus] : [])] : c.regle?.genre === 'nombreDe' ? [c.regle.liste] : [])))].map((n) => chaine(camel(n)));
  const groupe = donnee.par !== undefined && donnee.par !== 'compte' ? `avant?.[${chaine(camel(donnee.par))}] as string | undefined` : undefined;
  const admin = `(req as unknown as { user?: { role?: unknown } }).user?.role === 'admin'`;
  const recalcul = calculs.map(({ nom: champ, regle }) => {
    if (regle?.genre === 'nombreDe') return `              valeurs[${chaine(camel(champ))}] = Array.isArray(fusion[${chaine(camel(regle.liste))}]) ? (fusion[${chaine(camel(regle.liste))}] as unknown[]).length : 0;`;
    if (regle?.genre !== 'somme') return '';
    return `              {
                const somme = await sommeDesPrix(s.${camel(regle.donnee)}, fusion[${chaine(camel(regle.liste))}], ${chaine(camel(regle.prix))}, cercles[${chaine(regle.donnee)}]);
                if (typeof somme === 'string') return { erreur: \`le champ « ${camel(regle.liste)} » : \${somme}\` };
                valeurs[${chaine(camel(champ))}] = somme${regle.plus !== undefined ? ` + Number(fusion[${chaine(camel(regle.plus))}])` : ''};
              }`;
  });
  const blocCalculs = calculs.length === 0 ? '' : `            // Les calculs suivent la liste modifiée, relue ici, verrouillée.
            if ([${entrees.join(', ')}].some((c) => c in valeurs)) {
              const fusion: Record<string, unknown> = { ...avant, ...valeurs };
              const cercles: Record<string, ((fiche: Record<string, unknown>) => boolean) | undefined> = ${serveur ? codeCercles(serveur, donnee, groupe) : '{}'};
${recalcul.join('\n')}
            }
`;
  const touche = [...new Set([...montant, ...entrees.map((e) => JSON.parse(e) as string)])];
  return `          const modifie = await transaction(async (s) => {
            const avant = await s.${nom}.trouver(String(req.params.id), true);
            if (!avant) return null;
            const valeurs: Record<string, unknown> = { ...envoi.valeur };
${paye ? `            // Une fiche payée ne change plus ce qui fait son montant, sauf par un admin.
            if (avant[${chaine(camel(paye.nom))}] === true && ${JSON.stringify(touche)}.some((c) => c in valeurs) && !(${admin})) return 'payee' as const;
` : ''}${blocCalculs}            return s.${nom}.modifier(String(req.params.id), valeurs);
          });
${paye ? `          if (modifie === 'payee') {
            res.status(409).json({ erreur: 'Cette fiche est payée : ce qui fait son montant ne change plus.' });
            return;
          }
` : ''}${calculs.some((c) => c.regle?.genre === 'somme') ? `          if (modifie && !('id' in modifie)) {
            res.status(400).json({ erreur: modifie.erreur });
            return;
          }
` : ''}`;
}

export function codeCreation(serveur: ServeurRI, route: Route, donnee: Donnee, schema: string, emails: string, separee?: string): string {
  const nom = camel(route.donnee);
  const verifier = `const envoi = verifierEnvoi(${schema}, req.body, true${reglesEnvoi(donnee, route)});`;
  const creations = route.creations ?? [];
  if (!aCompleter(donnee) && creations.length === 0 && emails === '' && separee === undefined) {
    return `          ${verifier}
          if ('erreur' in envoi) res.status(400).json({ erreur: envoi.erreur });
          else res.status(201).json(await stockages.${nom}.creer(envoi.valeur));`;
  }
  const groupe = separee !== undefined && donnee.par !== undefined;
  const champGroupe = donnee.par !== undefined ? chaine(camel(donnee.par)) : '';
  const lignes = [
    ...(separee !== undefined
      ? [
          `${codePortee(separee, 'creer').trimEnd()}`,
          ...(groupe
            ? [
                `          const groupe = groupeACreer(req, portee, separation${separee}!);`,
                `          if ('erreur' in groupe) {`,
                `            res.status(400).json({ erreur: groupe.erreur });`,
                `            return;`,
                `          }`,
                `          res.locals.groupeDirect = groupe.valeur;`,
              ]
            : []),
        ]
      : []),
    `          ${verifier}`,
    `          if ('erreur' in envoi) {`,
    `            res.status(400).json({ erreur: envoi.erreur });`,
    `            return;`,
    `          }`,
  ];
  if (aCompleter(donnee)) {
    lignes.push(
      `          const complete = await completer${pascal(donnee.nom)}(envoi.valeur, ${codeCercles(serveur, donnee, groupe ? 'groupe.valeur' : undefined)});`,
      `          if ('erreur' in complete) {`,
      `            res.status(400).json({ erreur: complete.erreur });`,
      `            return;`,
      `          }`,
      `          const recue = complete.valeur;`,
    );
  } else lignes.push(`          const recue: Record<string, unknown> = envoi.valeur;`);
  if (groupe) lignes.push(`          recue[${champGroupe}] = groupe.valeur;`);
  // « seul son auteur peut … » : le compte qui crée la fiche, jamais une valeur envoyée.
  for (const c of donnee.champs) if (c.regle?.genre === 'auteur') lignes.push(`          recue[${chaine(camel(c.nom))}] = moiDe(req)?.id;`);
  if (separee !== undefined) {
    lignes.push(`          if (portee.test && !portee.test(recue)) {`, `            res.status(403).json({ erreur: REFUS_FICHES });`, `            return;`, `          }`);
  }
  // Les fiches liées déjà créées s'effacent si la suite échoue : jamais de fiche orpheline.
  // Toute erreur, à la création d'une fiche liée comme à celle de la fiche principale, efface ce qui était déjà créé.
  if (creations.length > 0) lignes.push(`          const annuler: (() => Promise<unknown>)[] = [];`, `          const toutAnnuler = async () => { for (const a of annuler.reverse()) await a().catch(() => undefined); };`, `          let cree;`, `          try {`);
  creations.forEach((creation, i) => {
    const liee = serveur.donnees.find((d) => d.nom === creation.donnee)!;
    const valeurs = `{ ${[...creation.valeurs.map((v) => `${chaine(camel(v.champ))}: ${valeurLiee(v.valeur, 'recue')}`), ...(groupe && liee.par !== undefined ? [`${champGroupe}: groupe.valeur`] : [])].join(', ')} }`;
    lignes.push(`          // « creer ${creation.donnee} » : la fiche liée vient de ce que le serveur a vérifié.`);
    if (aCompleter(liee)) {
      lignes.push(
        `          const liee${i} = await completer${pascal(liee.nom)}(${valeurs}, ${codeCercles(serveur, liee, groupe && liee.par !== undefined ? 'groupe.valeur' : undefined)});`,
        `          if ('erreur' in liee${i}) {`,
        `            await toutAnnuler();`,
        `            res.status(400).json({ erreur: liee${i}.erreur });`,
        `            return;`,
        `          }`,
        `          const creee${i} = await stockages.${camel(liee.nom)}.creer(liee${i}.valeur);`,
      );
    } else lignes.push(`          const creee${i} = await stockages.${camel(liee.nom)}.creer(${valeurs});`);
    lignes.push(`          annuler.push(() => stockages.${camel(liee.nom)}.supprimer(creee${i}.id));`);
    if (creation.dans !== undefined) lignes.push(`          recue[${chaine(camel(creation.dans))}] = creee${i}.id;`);
  });
  if (creations.length > 0) {
    lignes.push(
      `          cree = await stockages.${nom}.creer(recue);`,
      `          } catch (erreur) {`,
      `            await toutAnnuler();`,
      `            throw erreur;`,
      `          }`,
      `          res.status(201).json(cree);`,
    );
  } else lignes.push(`          const cree = await stockages.${nom}.creer(recue);`, `          res.status(201).json(cree);`);
  if (emails !== '') lignes.push(`          // La réponse est partie : un e-mail raté ne fait pas échouer la création.`, emails);
  return lignes.join('\n');
}
