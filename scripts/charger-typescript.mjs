/** Résout les imports .js du TypeScript source vers leurs fichiers .ts, sans construction. */
export async function resolve(specifier, contexte, suivant) {
  try {
    return await suivant(specifier, contexte);
  } catch (erreur) {
    if (erreur?.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
      return suivant(specifier.slice(0, -3) + '.ts', contexte);
    }
    // Le site importe sans extension (« ./erreurs-medias ») : on essaie le fichier .ts.
    if (erreur?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
      return suivant(specifier + '.ts', contexte);
    }
    throw erreur;
  }
}
