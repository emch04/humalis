/**
 * Les messages intégrés de Humalis en espagnol, portugais, swahili et lingala,
 * rangés par leur texte français (celui de `MESSAGES`, src/i18n/messages.ts).
 *
 * L'espagnol est celui d'Espagne, le portugais celui du Portugal (et de
 * l'Afrique lusophone). Le swahili et le lingala gardent des phrases simples ;
 * le lingala garde les mots français que l'on dit couramment à Kinshasa
 * (fichier, serveur, email). Les `${…}` sont recopiés tels quels.
 */

export type AutresLangues = { es: string; pt: string; sw: string; ln: string };

export const AUTRES_LANGUES: Record<string, AutresLangues> = {
  'Réessayer': { es: 'Reintentar', pt: 'Tentar novamente', sw: 'Jaribu tena', ln: 'Meka lisusu' },
  "Le serveur n'a pas répondu. Réessayez dans un instant.": {
    es: 'El servidor no ha respondido. Inténtelo de nuevo en un momento.',
    pt: 'O servidor não respondeu. Tente novamente dentro de instantes.',
    sw: 'Seva haikujibu. Jaribu tena baada ya muda mfupi.',
    ln: 'Serveur eyanoli te. Meka lisusu mwa moke.',
  },
  'Email ou mot de passe incorrect.': {
    es: 'Correo electrónico o contraseña incorrectos.',
    pt: 'Email ou palavra-passe incorretos.',
    sw: 'Barua pepe au nenosiri si sahihi.',
    ln: 'Email to mot de passe ezali malamu te.',
  },
  'Trop de tentatives de connexion. Réessayez dans quelques minutes.': {
    es: 'Demasiados intentos de inicio de sesión. Inténtelo de nuevo en unos minutos.',
    pt: 'Demasiadas tentativas de início de sessão. Tente novamente dentro de alguns minutos.',
    sw: 'Majaribio mengi mno ya kuingia. Jaribu tena baada ya dakika chache.',
    ln: 'Bomeki ebele mpo na kokota. Meka lisusu nsima ya miniti mwa moke.',
  },
  'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.': {
    es: 'Demasiadas solicitudes en poco tiempo. Espere un momento y vuelva a intentarlo.',
    pt: 'Demasiados pedidos em pouco tempo. Aguarde um momento e tente novamente.',
    sw: 'Maombi mengi mno kwa muda mfupi. Subiri kidogo, kisha ujaribu tena.',
    ln: 'Masɛngi ebele na ntango moke. Zela mwa moke, nsima meka lisusu.',
  },
  "Ce que vous cherchez n'existe pas.": { es: 'Lo que busca no existe.', pt: 'O que procura não existe.', sw: 'Unachotafuta hakipo.', ln: 'Oyo ozali koluka ezali te.' },
  'Connectez-vous pour continuer.': { es: 'Inicie sesión para continuar.', pt: 'Inicie sessão para continuar.', sw: 'Ingia ili uendelee.', ln: 'Kota mpo na kokoba.' },
  'Page introuvable': { es: 'Página no encontrada', pt: 'Página não encontrada', sw: 'Ukurasa haupatikani', ln: 'Lokasa ezwami te' },
  "Cette page n'existe pas.": { es: 'Esta página no existe.', pt: 'Esta página não existe.', sw: 'Ukurasa huu haupo.', ln: 'Lokasa oyo ezali te.' },
  "Revenir à l'accueil": { es: 'Volver al inicio', pt: 'Voltar ao início', sw: 'Rudi mwanzo', ln: 'Zonga na ebandeli' },
  'Précédent': { es: 'Anterior', pt: 'Anterior', sw: 'Iliyotangulia', ln: 'Oyo eleki' },
  'Suivant': { es: 'Siguiente', pt: 'Seguinte', sw: 'Inayofuata', ln: 'Oyo elandi' },
  'Chargement': { es: 'Cargando', pt: 'A carregar', sw: 'Inapakia', ln: 'Ezali koya' },
  'Diminuer': { es: 'Disminuir', pt: 'Diminuir', sw: 'Punguza', ln: 'Kitisa' },
  'Augmenter': { es: 'Aumentar', pt: 'Aumentar', sw: 'Ongeza', ln: 'Bakisa' },
  'Quantité': { es: 'Cantidad', pt: 'Quantidade', sw: 'Idadi', ln: 'Motángo' },
  'Code QR': { es: 'Código QR', pt: 'Código QR', sw: 'Msimbo wa QR', ln: 'Code QR' },
  "Fil d'Ariane": { es: 'Ruta de navegación', pt: 'Trilho de navegação', sw: 'Njia ya kurasa', ln: 'Nzela ya nkasa' },
  'Choisissez…': { es: 'Elija…', pt: 'Escolha…', sw: 'Chagua…', ln: 'Pona…' },
  'Vérification…': { es: 'Comprobando…', pt: 'A verificar…', sw: 'Inakagua…', ln: 'Ezali kotala…' },
  'Note : ${nombre} sur ${maximum}': { es: 'Valoración: ${nombre} de ${maximum}', pt: 'Classificação: ${nombre} de ${maximum}', sw: 'Alama: ${nombre} kati ya ${maximum}', ln: 'Note: ${nombre} likoló ya ${maximum}' },
  'Note : ${valeur} sur ${maximum}': { es: 'Valoración: ${valeur} de ${maximum}', pt: 'Classificação: ${valeur} de ${maximum}', sw: 'Alama: ${valeur} kati ya ${maximum}', ln: 'Note: ${valeur} likoló ya ${maximum}' },
  '${i + 1} sur ${maximum}': { es: '${i + 1} de ${maximum}', pt: '${i + 1} de ${maximum}', sw: '${i + 1} kati ya ${maximum}', ln: '${i + 1} likoló ya ${maximum}' },
  'Diapositive ${i + 1} sur ${pages}': { es: 'Diapositiva ${i + 1} de ${pages}', pt: 'Diapositivo ${i + 1} de ${pages}', sw: 'Slaidi ${i + 1} kati ya ${pages}', ln: 'Elilingi ${i + 1} likoló ya ${pages}' },
  'Diapositive ${i + 1} sur ${total}': { es: 'Diapositiva ${i + 1} de ${total}', pt: 'Diapositivo ${i + 1} de ${total}', sw: 'Slaidi ${i + 1} kati ya ${total}', ln: 'Elilingi ${i + 1} likoló ya ${total}' },
  'Agrandir': { es: 'Acercar', pt: 'Aproximar', sw: 'Kuza', ln: 'Komisa monene' },
  'Réduire': { es: 'Alejar', pt: 'Afastar', sw: 'Punguza ukubwa', ln: 'Komisa moke' },
  'Ouvrir dans OpenStreetMap': { es: 'Abrir en OpenStreetMap', pt: 'Abrir no OpenStreetMap', sw: 'Fungua katika OpenStreetMap', ln: 'Fungola na OpenStreetMap' },
  'Ouvrir dans OpenStreetMap : ${lieu.nom}': { es: 'Abrir en OpenStreetMap: ${lieu.nom}', pt: 'Abrir no OpenStreetMap: ${lieu.nom}', sw: 'Fungua katika OpenStreetMap: ${lieu.nom}', ln: 'Fungola na OpenStreetMap: ${lieu.nom}' },
  'Les lieux de la carte : ${nom}': { es: 'Los lugares del mapa: ${nom}', pt: 'Os locais do mapa: ${nom}', sw: 'Maeneo ya ramani: ${nom}', ln: 'Bisika ya karte: ${nom}' },
  'Graphique en courbe': { es: 'Gráfico de líneas', pt: 'Gráfico de linhas', sw: 'Chati ya mstari', ln: 'Graphique ya molɔngɔ' },
  'Graphique en barres': { es: 'Gráfico de barras', pt: 'Gráfico de barras', sw: 'Chati ya pau', ln: 'Graphique ya makonzí' },
  'Graphique en camembert': { es: 'Gráfico circular', pt: 'Gráfico circular', sw: 'Chati ya duara', ln: 'Graphique ya rond' },
  'Valeur': { es: 'Valor', pt: 'Valor', sw: 'Thamani', ln: 'Motuya' },
  'Libellé': { es: 'Etiqueta', pt: 'Rótulo', sw: 'Lebo', ln: 'Nkombo' },
  'Voir les données': { es: 'Ver los datos', pt: 'Ver os dados', sw: 'Ona data', ln: 'Tala ba données' },
  'Touchez le graphique pour lire une valeur.': { es: 'Toque el gráfico para leer un valor.', pt: 'Toque no gráfico para ler um valor.', sw: 'Gusa chati ili kusoma thamani.', ln: 'Simba graphique mpo na kotánga motuya.' },
  'Flèches gauche et droite : lire les valeurs une à une.': {
    es: 'Flechas izquierda y derecha: leer los valores uno a uno.',
    pt: 'Setas esquerda e direita: ler os valores um a um.',
    sw: 'Mishale ya kushoto na kulia: soma thamani moja moja.',
    ln: 'Bafléchi ya lobɔkɔ ya mwasi mpe ya mobali: tánga motuya moko moko.',
  },
  'Flèches gauche et droite : lire les valeurs une à une. Le graphique défile ; il montre d’abord les dernières valeurs.': {
    es: 'Flechas izquierda y derecha: leer los valores uno a uno. El gráfico se desplaza; muestra primero los últimos valores.',
    pt: 'Setas esquerda e direita: ler os valores um a um. O gráfico desloca-se; mostra primeiro os últimos valores.',
    sw: 'Mishale ya kushoto na kulia: soma thamani moja moja. Chati inasogea; inaonyesha thamani za mwisho kwanza.',
    ln: 'Bafléchi ya lobɔkɔ ya mwasi mpe ya mobali: tánga motuya moko moko. Graphique ezali koningana; elakisi liboso motuya ya nsuka.',
  },
  'Lire les valeurs': { es: 'Leer los valores', pt: 'Ler os valores', sw: 'Soma thamani', ln: 'Tánga motuya' },
  'Cacher les données': { es: 'Ocultar los datos', pt: 'Ocultar os dados', sw: 'Ficha data', ln: 'Bomba ba données' },
  'Les données du graphique': { es: 'Los datos del gráfico', pt: 'Os dados do gráfico', sw: 'Data ya chati', ln: 'Ba données ya graphique' },
  'Aucune donnée à afficher.': { es: 'No hay datos que mostrar.', pt: 'Não há dados para mostrar.', sw: 'Hakuna data ya kuonyesha.', ln: 'Données ezali te.' },
  'Lire la transcription': { es: 'Leer la transcripción', pt: 'Ler a transcrição', sw: 'Soma maandishi', ln: 'Tánga makomi' },
  'Lecture': { es: 'Reproducir', pt: 'Reproduzir', sw: 'Cheza', ln: 'Yoka' },
  'Ce fichier': { es: 'Este archivo', pt: 'Este ficheiro', sw: 'Faili hii', ln: 'Fichier oyo' },
  '${sujet} est trop gros : ${ecrireTaille(fichier.size)}, le maximum est ${ecrireTaille(maximum)}.': {
    es: '${sujet} es demasiado grande: ${ecrireTaille(fichier.size)}, el máximo es ${ecrireTaille(maximum)}.',
    pt: '${sujet} é demasiado grande: ${ecrireTaille(fichier.size)}, o máximo é ${ecrireTaille(maximum)}.',
    sw: '${sujet} ni kubwa mno: ${ecrireTaille(fichier.size)}, kiwango cha juu ni ${ecrireTaille(maximum)}.',
    ln: '${sujet} eleki monene: ${ecrireTaille(fichier.size)}, ndelo ezali ${ecrireTaille(maximum)}.',
  },
  "${sujet} n'est pas ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ')}.": {
    es: "${sujet} no es ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ')}.",
    pt: "${sujet} não é ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' nem ')}.",
    sw: "${sujet} si ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' wala ')}.",
    ln: "${sujet} ezali ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' to ')} te.",
  },
  'une image': { es: 'una imagen', pt: 'uma imagem', sw: 'picha', ln: 'elilingi' },
  'un son': { es: 'un sonido', pt: 'um som', sw: 'sauti', ln: 'mongongo' },
  'une vidéo': { es: 'un vídeo', pt: 'um vídeo', sw: 'video', ln: 'video' },
  'un PDF': { es: 'un PDF', pt: 'um PDF', sw: 'PDF', ln: 'PDF' },
  'un document': { es: 'un documento', pt: 'um documento', sw: 'hati', ln: 'mokanda' },
  ' Mo': { es: ' MB', pt: ' MB', sw: ' MB', ln: ' Mo' },
  ' Ko': { es: ' KB', pt: ' KB', sw: ' KB', ln: ' Ko' },
  ' octets': { es: ' bytes', pt: ' bytes', sw: ' baiti', ln: ' octets' },
  'Ce fichier est trop gros pour le serveur.': { es: 'Este archivo es demasiado grande para el servidor.', pt: 'Este ficheiro é demasiado grande para o servidor.', sw: 'Faili hii ni kubwa mno kwa seva.', ln: 'Fichier oyo eleki monene mpo na serveur.' },
  "Choisissez d'abord un fichier.": { es: 'Elija primero un archivo.', pt: 'Escolha primeiro um ficheiro.', sw: 'Chagua faili kwanza.', ln: 'Pona liboso fichier moko.' },
  'AAAA-MM-JJ': { es: 'AAAA-MM-DD', pt: 'AAAA-MM-DD', sw: 'YYYY-MM-DD', ln: 'AAAA-MM-JJ' },
  'Fermer le message': { es: 'Cerrar el mensaje', pt: 'Fechar a mensagem', sw: 'Funga ujumbe', ln: 'Kanga nsango' },
  'Aller au contenu': { es: 'Ir al contenido', pt: 'Ir para o conteúdo', sw: 'Nenda kwenye maudhui', ln: 'Kende na makambo ya lokasa' },
  'Fermer': { es: 'Cerrar', pt: 'Fechar', sw: 'Funga', ln: 'Kanga' },
  'Copié': { es: 'Copiado', pt: 'Copiado', sw: 'Imenakiliwa', ln: 'Ekopiami' },
  'Copier': { es: 'Copiar', pt: 'Copiar', sw: 'Nakili', ln: 'Kopia' },
  'Copie impossible.': { es: 'No se pudo copiar.', pt: 'Não foi possível copiar.', sw: 'Imeshindikana kunakili.', ln: 'Ekoki kokopiama te.' },
  'Lien copié : il ne reste qu’à le coller.': { es: 'Enlace copiado: solo queda pegarlo.', pt: 'Ligação copiada: basta colá-la.', sw: 'Kiungo kimenakiliwa: kibandike unapotaka.', ln: 'Lien ekopiami: otikali kaka kokangisa yango.' },
  'Texte copié : il ne reste qu’à le coller.': { es: 'Texto copiado: solo queda pegarlo.', pt: 'Texto copiado: basta colá-lo.', sw: 'Maandishi yamenakiliwa: yabandike unapotaka.', ln: 'Makomi ekopiami: otikali kaka kokangisa yango.' },
  'Partage impossible.': { es: 'No se pudo compartir.', pt: 'Não foi possível partilhar.', sw: 'Imeshindikana kushiriki.', ln: 'Ekoki kokabolama te.' },
  'Oui': { es: 'Sí', pt: 'Sim', sw: 'Ndiyo', ln: 'Iyo' },
  'Non': { es: 'No', pt: 'Não', sw: 'Hapana', ln: 'Te' },
  'Voir plus': { es: 'Ver más', pt: 'Ver mais', sw: 'Ona zaidi', ln: 'Tala mingi' },
  'Monter': { es: 'Subir', pt: 'Subir', sw: 'Panda juu', ln: 'Mata' },
  'Descendre': { es: 'Bajar', pt: 'Descer', sw: 'Shuka chini', ln: 'Kita' },
  'élément déplaçable': { es: 'elemento desplazable', pt: 'elemento deslocável', sw: 'kipengele kinachohamishika', ln: 'eloko oyo ekoki kobongola esika' },
  'Annulé.': { es: 'Cancelado.', pt: 'Cancelado.', sw: 'Imeghairiwa.', ln: 'Elongolami.' },
  'position ${i + 1} sur ${dernier.current.liste.length}': {
    es: 'posición ${i + 1} de ${dernier.current.liste.length}',
    pt: 'posição ${i + 1} de ${dernier.current.liste.length}',
    sw: 'nafasi ${i + 1} kati ya ${dernier.current.liste.length}',
    ln: 'esika ${i + 1} likoló ya ${dernier.current.liste.length}',
  },
  'Pris : ${nommer(actuelle[index])}, ${position(index)}. Flèches pour déplacer, Espace pour déposer, Échap pour annuler.': {
    es: 'Seleccionado: ${nommer(actuelle[index])}, ${position(index)}. Flechas para mover, Espacio para soltar, Escape para cancelar.',
    pt: 'Selecionado: ${nommer(actuelle[index])}, ${position(index)}. Setas para mover, Espaço para largar, Escape para cancelar.',
    sw: 'Imechukuliwa: ${nommer(actuelle[index])}, ${position(index)}. Mishale kuhamisha, Nafasi kuweka, Escape kughairi.',
    ln: 'Ezwami: ${nommer(actuelle[index])}, ${position(index)}. Bafléchi mpo na kobongola esika, Espace mpo na kotia, Échap mpo na kolongola.',
  },
  'Déposé : ${nommer(actuelle[index])}, ${position(index)}.': {
    es: 'Soltado: ${nommer(actuelle[index])}, ${position(index)}.',
    pt: 'Largado: ${nommer(actuelle[index])}, ${position(index)}.',
    sw: 'Imewekwa: ${nommer(actuelle[index])}, ${position(index)}.',
    ln: 'Etiami: ${nommer(actuelle[index])}, ${position(index)}.',
  },
  'Déplacé en ${position(vers)}.': { es: 'Movido a ${position(vers)}.', pt: 'Movido para ${position(vers)}.', sw: 'Imehamishiwa ${position(vers)}.', ln: 'Ebongwani na ${position(vers)}.' },
  'Déplacé en position ${vers + 1} sur ${copie.length}.': {
    es: 'Movido a la posición ${vers + 1} de ${copie.length}.',
    pt: 'Movido para a posição ${vers + 1} de ${copie.length}.',
    sw: 'Imehamishiwa nafasi ${vers + 1} kati ya ${copie.length}.',
    ln: 'Ebongwani na esika ${vers + 1} likoló ya ${copie.length}.',
  },
  '${nommer(liste[index])}, position ${index + 1} sur ${liste.length}': {
    es: '${nommer(liste[index])}, posición ${index + 1} de ${liste.length}',
    pt: '${nommer(liste[index])}, posição ${index + 1} de ${liste.length}',
    sw: '${nommer(liste[index])}, nafasi ${index + 1} kati ya ${liste.length}',
    ln: '${nommer(liste[index])}, esika ${index + 1} likoló ya ${liste.length}',
  },
};

/** Les erreurs de champ avant l'envoi d'un formulaire (`l` : le libellé du champ ; `n` : la borne). */
export const CHAMPS_AUTRES_LANGUES: Record<string, Record<keyof AutresLangues, (l: string, n?: number) => string>> = {
  cocher: {
    es: (l) => `Marque «${l}» para continuar.`,
    pt: (l) => `Marque «${l}» para continuar.`,
    sw: (l) => `Weka alama kwenye “${l}” ili uendelee.`,
    ln: (l) => `Tia elembo na « ${l} » mpo na kokoba.`,
  },
  choisir: {
    es: (l) => `Elija un valor para «${l}».`,
    pt: (l) => `Escolha um valor para «${l}».`,
    sw: (l) => `Chagua thamani ya “${l}”.`,
    ln: (l) => `Pona motuya mpo na « ${l} ».`,
  },
  obligatoire: {
    es: (l) => `El campo «${l}» es obligatorio.`,
    pt: (l) => `O campo «${l}» é obrigatório.`,
    sw: (l) => `Sehemu “${l}” inahitajika.`,
    ln: (l) => `« ${l} » esengeli kotondisama.`,
  },
  email: {
    es: (l) => `«${l}» no tiene la forma de una dirección de correo electrónico (por ejemplo nombre@ejemplo.com).`,
    pt: (l) => `«${l}» não tem a forma de um endereço de email (por exemplo nome@exemplo.pt).`,
    sw: (l) => `“${l}” haionekani kama anwani ya barua pepe (kwa mfano jina@mfano.com).`,
    ln: (l) => `« ${l} » ezali lokola adresse email te (ndakisa nkombo@ndakisa.cd).`,
  },
  date: {
    es: (l) => `«${l}» debe ser una fecha escrita AAAA-MM-DD (por ejemplo 2026-01-31).`,
    pt: (l) => `«${l}» deve ser uma data escrita AAAA-MM-DD (por exemplo 2026-01-31).`,
    sw: (l) => `“${l}” lazima iwe tarehe iliyoandikwa YYYY-MM-DD (kwa mfano 2026-01-31).`,
    ln: (l) => `« ${l} » esengeli kozala date ekomami AAAA-MM-JJ (ndakisa 2026-01-31).`,
  },
  heure: {
    es: (l) => `«${l}» debe ser una hora escrita HH:MM (por ejemplo 14:30).`,
    pt: (l) => `«${l}» deve ser uma hora escrita HH:MM (por exemplo 14:30).`,
    sw: (l) => `“${l}” lazima iwe saa iliyoandikwa HH:MM (kwa mfano 14:30).`,
    ln: (l) => `« ${l} » esengeli kozala ngonga ekomami HH:MM (ndakisa 14:30).`,
  },
  adresseWeb: {
    es: (l) => `«${l}» debe ser una dirección web completa, que empiece por https://.`,
    pt: (l) => `«${l}» deve ser um endereço web completo, que comece por https://.`,
    sw: (l) => `“${l}” lazima iwe anwani kamili ya wavuti, inayoanza na https://.`,
    ln: (l) => `« ${l} » esengeli kozala adresse web mobimba, oyo ebandi na https://.`,
  },
  nombre: {
    es: (l) => `«${l}» debe ser un número.`,
    pt: (l) => `«${l}» deve ser um número.`,
    sw: (l) => `“${l}” lazima iwe namba.`,
    ln: (l) => `« ${l} » esengeli kozala motángo.`,
  },
  auMoins: {
    es: (l, n = 0) => `«${l}» debe ser como mínimo ${n}.`,
    pt: (l, n = 0) => `«${l}» deve ser pelo menos ${n}.`,
    sw: (l, n = 0) => `“${l}” lazima iwe angalau ${n}.`,
    ln: (l, n = 0) => `« ${l} » esengeli kozala ata ${n}.`,
  },
  auPlus: {
    es: (l, n = 0) => `«${l}» debe ser como máximo ${n}.`,
    pt: (l, n = 0) => `«${l}» deve ser no máximo ${n}.`,
    sw: (l, n = 0) => `“${l}” lazima isizidi ${n}.`,
    ln: (l, n = 0) => `« ${l} » esengeli koleka ${n} te.`,
  },
};

/** « Langue » dans chaque langue : le nom du sélecteur de langue. */
export const NOM_DU_CHOIX: Record<string, string> = { fr: 'Langue', en: 'Language', es: 'Idioma', pt: 'Idioma', sw: 'Lugha', ln: 'Lokótá' };

/**
 * La région des nombres de chaque langue, comme src/cibles/format.ts : le lingala suit
 * l'usage français de Kinshasa (« 1 234,5 »), que tous les navigateurs connaissent.
 */
export const REGIONS_LANGUES: Record<string, { nombre: string }> = {
  fr: { nombre: 'fr-FR' },
  en: { nombre: 'en-US' },
  es: { nombre: 'es-ES' },
  pt: { nombre: 'pt-PT' },
  sw: { nombre: 'sw' },
  ln: { nombre: 'fr-FR' },
};
