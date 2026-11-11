-- Humalis dans Neovim (0.11 ou plus récent).
--
-- Prérequis : la commande « humalis » (npm install -g humalis).
-- À copier dans ~/.config/nvim/plugin/humalis.lua, ou à coller dans init.lua.
--
-- Le serveur de langage donne les erreurs en direct, le survol (K), la
-- complétion (Ctrl-x Ctrl-o, ou automatique avec un greffon de complétion),
-- la déclaration (Ctrl-]), le plan (gO), la mise en forme (gq, ou
-- vim.lsp.buf.format()) et la coloration des noms (jetons sémantiques).
-- Pour colorer aussi les mots du langage, voir la grammaire tree-sitter plus bas.

vim.filetype.add({ extension = { humalis = 'humalis' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'humalis',
  callback = function()
    vim.bo.commentstring = '# %s'
    vim.bo.expandtab = true
    vim.bo.shiftwidth = 4
    vim.bo.tabstop = 4
    vim.bo.softtabstop = 4
  end,
})

vim.lsp.config('humalis', {
  cmd = { 'humalis', 'editeur', '--stdio' },
  filetypes = { 'humalis' },
  root_markers = { 'package.json', '.git' },
})
vim.lsp.enable('humalis')

-- La coloration des mots du langage, par tree-sitter (intégré à Neovim, sans
-- greffon). Une fois, depuis le dossier editeur/tree-sitter-humalis du dépôt :
--
--   mkdir -p ~/.local/share/nvim/site/parser ~/.config/nvim/queries/humalis
--   cc -shared -fPIC -O2 -I src src/parser.c -o ~/.local/share/nvim/site/parser/humalis.so
--   cp queries/neovim/highlights.scm ~/.config/nvim/queries/humalis/
--
-- (sous Windows : humalis.dll au lieu de humalis.so). Sans ce fichier,
-- seuls les noms sont colorés, par le serveur de langage.
vim.api.nvim_create_autocmd('FileType', {
  pattern = 'humalis',
  callback = function(evenement) pcall(vim.treesitter.start, evenement.buf, 'humalis') end,
})
