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

-- Facultatif : la coloration des mots du langage par tree-sitter, avec le
-- greffon nvim-treesitter (branche « main »). Décommenter, puis lancer
-- « :TSInstall humalis » une fois.
--
-- vim.api.nvim_create_autocmd('User', {
--   pattern = 'TSUpdate',
--   callback = function()
--     require('nvim-treesitter.parsers').humalis = {
--       install_info = {
--         url = 'https://github.com/emch04/humalis',
--         location = 'editeur/tree-sitter-humalis',
--         queries = 'queries/neovim',
--       },
--     }
--   end,
-- })
-- vim.api.nvim_create_autocmd('FileType', {
--   pattern = 'humalis',
--   callback = function() pcall(vim.treesitter.start) end,
-- })
