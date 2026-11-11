#!/usr/bin/env node
/**
 * L'essai du cœur des données locales de Windows : compile le C# produit dans un programme
 * console (sans WPF), et l'exécute : la vraie base SQLite, le vrai AES-GCM, la vraie file.
 *
 *   npm run build && node scripts/essai-windows-coeur.mjs [dossier-de-travail]
 *
 * DOTNET : le programme dotnet (sinon celui du PATH, ou ~/.dotnet/dotnet).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { COEUR_LOCAL_CS } from '../dist/cibles/windows/bibliotheque/donnees-comptes.js';
import { VALEURS_CS } from '../dist/cibles/windows/bibliotheque/valeurs.js';
import { VERSION_SQLITE } from '../dist/cibles/windows/donnees-comptes.js';

const racine = resolve(import.meta.dirname, '..');
const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-windows-coeur'));
const dotnet = [process.env.DOTNET, 'dotnet', join(homedir(), '.dotnet', 'dotnet')].filter(Boolean).find((c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
if (!dotnet) {
  console.log('Le SDK .NET 10 est introuvable (https://dotnet.microsoft.com) : rien à faire ici.');
  process.exit(0);
}
rmSync(travail, { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
writeFileSync(join(travail, 'Essai.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="${VERSION_SQLITE}" />
  </ItemGroup>
</Project>
`);
writeFileSync(join(travail, 'Valeurs.cs'), VALEURS_CS);
writeFileSync(join(travail, 'CoeurLocal.cs'), COEUR_LOCAL_CS);
writeFileSync(join(travail, 'Langues.cs'), 'namespace Humalis; public static class Langues { public static string Actuelle => "fr"; public static System.Globalization.CultureInfo Culture => V.Fr; }\n');
copyFileSync(join(racine, 'scripts/essais-windows/coeur-local.cs'), join(travail, 'Program.cs'));
const r = spawnSync(dotnet, ['run', '--', join(travail, 'bases')], { cwd: travail, stdio: 'inherit', env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' } });
process.exit(r.status ?? 1);
