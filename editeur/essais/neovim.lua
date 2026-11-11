-- Essai en vrai de editeur/neovim/humalis.lua dans Neovim, sans écran :
--
--     nvim --headless --clean -u NONE -l editeur/essais/neovim.lua <fichier.humalis>
--
-- Charge le réglage tel qu'un utilisateur le copierait, ouvre le fichier,
-- attend le serveur de langage, puis vérifie les erreurs, le survol, la
-- complétion, la déclaration, le plan, la mise en forme et les jetons
-- sémantiques. Écrit « ok » ou « RATÉ » pour chacun, et sort avec 1 au
-- moindre échec.

local ici = debug.getinfo(1, 'S').source:sub(2):match('(.*/)')
local fichier = assert(_G.arg[1], 'donner le chemin d’un fichier .humalis')
dofile(ici .. '../neovim/humalis.lua')

local resultats, echecs = {}, 0
local function verifier(nom, ok, detail)
  if not ok then echecs = echecs + 1 end
  table.insert(resultats, string.format('%s %s — %s', ok and 'ok  ' or 'RATÉ', nom, detail or ''))
end

vim.cmd.edit(vim.fn.fnameescape(fichier))
local tampon = vim.api.nvim_get_current_buf()
verifier('type de fichier', vim.bo.filetype == 'humalis', vim.bo.filetype)

local client
vim.wait(15000, function()
  client = vim.lsp.get_clients({ bufnr = tampon, name = 'humalis' })[1]
  return client ~= nil and client.initialized
end, 50)
verifier('serveur lancé (humalis editeur --stdio)', client ~= nil, client and (client.server_info and (client.server_info.name .. ' ' .. client.server_info.version)) or 'aucun client')
if not client then
  for _, ligne in ipairs(resultats) do print(ligne) end
  vim.cmd('cquit 1')
end

-- Coloration par tree-sitter, si la grammaire est installée (voir humalis.lua).
if #vim.api.nvim_get_runtime_file('parser/humalis.*', false) > 0 then
  local ligne, colonne
  for numero, texte in ipairs(vim.api.nvim_buf_get_lines(tampon, 0, -1, false)) do
    local debut = texte:find('page "boutique"', 1, true)
    if debut then ligne, colonne = numero - 1, debut - 1 break end
  end
  -- Sans écran, Neovim n'analyse qu'au premier affichage : on le fait ici.
  vim.treesitter.get_parser(tampon, 'humalis'):parse()
  local captures = vim.tbl_map(function(c) return c.capture end, vim.treesitter.get_captures_at_pos(tampon, ligne, colonne))
  local chaine = vim.tbl_map(function(c) return c.capture end, vim.treesitter.get_captures_at_pos(tampon, ligne, colonne + 6))
  verifier('coloration des mots (tree-sitter)', vim.tbl_contains(captures, 'keyword') and vim.tbl_contains(chaine, 'string'),
    table.concat(captures, ',') .. ' / ' .. table.concat(chaine, ','))
end

local function position(motif, decalage)
  for numero, ligne in ipairs(vim.api.nvim_buf_get_lines(tampon, 0, -1, false)) do
    local debut = ligne:find(motif, 1, true)
    if debut then return { line = numero - 1, character = debut - 1 + (decalage or 0) } end
  end
end
local function demander(methode, params)
  local reponse = client:request_sync(methode, params, 10000, tampon)
  return reponse and reponse.result, reponse and reponse.err
end
local document = { uri = vim.uri_from_bufnr(tampon) }

-- Erreurs : un guillemet retiré doit faire apparaître une erreur à la bonne ligne.
local ligneTitre = position('titre "Votre panier"').line
vim.api.nvim_buf_set_lines(tampon, ligneTitre, ligneTitre + 1, false, { '    titre "Votre panier' })
vim.wait(10000, function() return #vim.diagnostic.get(tampon) > 0 end, 50)
local diag = vim.diagnostic.get(tampon)[1]
verifier('erreur en direct', diag ~= nil and diag.lnum == ligneTitre and diag.message:find('guillemet manquant') ~= nil, diag and string.format('ligne %d : %s', diag.lnum + 1, diag.message))
vim.api.nvim_buf_set_lines(tampon, ligneTitre, ligneTitre + 1, false, { '    titre "Votre panier"' })
vim.wait(10000, function() return #vim.diagnostic.get(tampon) == 0 end, 50)
verifier('erreur effacée après correction', #vim.diagnostic.get(tampon) == 0, #vim.diagnostic.get(tampon) .. ' erreur(s)')

local survol = demander('textDocument/hover', { textDocument = document, position = position('bouton "Ajouter"', 2) })
local texteSurvol = survol and survol.contents and survol.contents.value or ''
verifier('survol de « bouton »', texteSurvol:find('**bouton**', 1, true) ~= nil, (texteSurvol:gsub('\n.*', '')))

local completion = demander('textDocument/completion', { textDocument = document, position = position('bouton "Commander"', 0) })
local libelles = {}
for _, element in ipairs(completion and completion.items or {}) do libelles[element.label] = true end
verifier('complétion', libelles['bouton'] == true, vim.tbl_count(libelles) .. ' propositions')

local definition = demander('textDocument/definition', { textDocument = document, position = position('à panier', 3) })
verifier('déclaration de « panier »', definition ~= nil and definition.range and definition.range.start.line == 0, definition and vim.inspect(definition.range.start) or 'rien')

local symboles = demander('textDocument/documentSymbol', { textDocument = document })
local noms = {}
for _, s in ipairs(symboles or {}) do table.insert(noms, s.name) end
verifier('plan du fichier', vim.tbl_contains(noms, 'boutique'), table.concat(noms, ', '))

vim.wait(3000, function()
  local hl = vim.lsp.semantic_tokens and vim.lsp.semantic_tokens.get_at_pos(tampon, position('à panier', 3).line, position('à panier', 3).character)
  return hl ~= nil and #hl > 0
end, 50)
local jetons = vim.lsp.semantic_tokens.get_at_pos(tampon, position('à panier', 3).line, position('à panier', 3).character) or {}
verifier('coloration des noms (jetons sémantiques)', #jetons > 0, jetons[1] and jetons[1].type or 'aucun jeton')

local avant = vim.api.nvim_buf_get_lines(tampon, 0, -1, false)
vim.api.nvim_buf_set_lines(tampon, ligneTitre, ligneTitre + 1, false, { '    titre   "Votre panier"' })
vim.lsp.buf.format({ bufnr = tampon, timeout_ms = 10000 })
local apres = vim.api.nvim_buf_get_lines(tampon, 0, -1, false)
verifier('mise en forme', vim.deep_equal(avant, apres), apres[ligneTitre + 1])

for _, ligne in ipairs(resultats) do print(ligne) end
print(string.format('%d vérifications, %d ratée(s), Neovim %s', #resultats, echecs, tostring(vim.version())))
vim.cmd('bwipeout!')
client:stop()
vim.cmd(echecs == 0 and 'qall!' or 'cquit 1')
