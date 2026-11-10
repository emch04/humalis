/**
 * Les codes QR en C#, sans dépendance : le texte en mode octets (UTF-8), niveau de correction
 * M (comme le web), la plus petite version qui le contient (1 à 40), le masque 0. Le dessin a
 * sa marge blanche de 4 modules, noir sur blanc dans les deux thèmes, pour rester lisible.
 */
export const QR_CS = String.raw`// Produit par Humalis : les codes QR (mode octets, correction M).
using System;
using System.Collections.Generic;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Media;

namespace Humalis;

public static class Qr
{
    private static readonly int[] EccParBloc = { -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28 };
    private static readonly int[] Blocs = { -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49 };

    private static int Modules(int v)
    {
        var r = (16 * v + 128) * v + 64;
        if (v >= 2)
        {
            var n = v / 7 + 2;
            r -= (25 * n - 10) * n - 55;
            if (v >= 7) r -= 36;
        }
        return r;
    }

    private static int Donnees(int v) => Modules(v) / 8 - EccParBloc[v] * Blocs[v];

    private static int Mul(int x, int y)
    {
        var z = 0;
        for (var i = 7; i >= 0; i--)
        {
            z = (z << 1) ^ ((z >> 7) * 0x11D);
            z ^= ((y >> i) & 1) * x;
        }
        return z & 0xFF;
    }

    private static int[] Diviseur(int degre)
    {
        var r = new int[degre];
        r[degre - 1] = 1;
        var racine = 1;
        for (var i = 0; i < degre; i++)
        {
            for (var j = 0; j < degre; j++)
            {
                r[j] = Mul(r[j], racine);
                if (j + 1 < degre) r[j] ^= r[j + 1];
            }
            racine = Mul(racine, 0x02);
        }
        return r;
    }

    private static int[] Reste(IList<int> donnees, int[] diviseur)
    {
        var r = new List<int>(new int[diviseur.Length]);
        foreach (var b in donnees)
        {
            var facteur = b ^ r[0];
            r.RemoveAt(0);
            r.Add(0);
            for (var i = 0; i < r.Count; i++) r[i] ^= Mul(diviseur[i], facteur);
        }
        return r.ToArray();
    }

    /// <summary>La matrice du code : vrai pour un module noir ; null si le texte est trop long.</summary>
    public static bool[,]? Matrice(string texte)
    {
        var octets = Encoding.UTF8.GetBytes(texte);
        var version = 1;
        while (version <= 40 && 4 + (version <= 9 ? 8 : 16) + 8 * octets.Length > Donnees(version) * 8) version++;
        if (version > 40) return null;
        // Les bits : le mode octets (0100), la longueur, les octets, la fin, le remplissage.
        var bits = new List<bool>();
        void Ajouter(int valeur, int n) { for (var i = n - 1; i >= 0; i--) bits.Add(((valeur >> i) & 1) != 0); }
        Ajouter(4, 4);
        Ajouter(octets.Length, version <= 9 ? 8 : 16);
        foreach (var b in octets) Ajouter(b, 8);
        var capacite = Donnees(version) * 8;
        Ajouter(0, Math.Min(4, capacite - bits.Count));
        Ajouter(0, (8 - bits.Count % 8) % 8);
        for (var p = 0xEC; bits.Count < capacite; p ^= 0xEC ^ 0x11) Ajouter(p, 8);
        var mots = new List<int>();
        for (var i = 0; i < bits.Count; i += 8)
        {
            var b = 0;
            for (var j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ? 1 : 0);
            mots.Add(b);
        }
        // Les blocs, leur correction, puis le mélange des blocs.
        var nBlocs = Blocs[version];
        var ecc = EccParBloc[version];
        var bruts = Modules(version) / 8;
        var courts = nBlocs - bruts % nBlocs;
        var longueurCourte = bruts / nBlocs;
        var diviseur = Diviseur(ecc);
        var blocs = new List<List<int>>();
        for (int i = 0, k = 0; i < nBlocs; i++)
        {
            var n = longueurCourte - ecc + (i < courts ? 0 : 1);
            var donnees = mots.GetRange(k, n);
            k += n;
            var bloc = new List<int>(donnees);
            if (i < courts) bloc.Add(-1);
            bloc.AddRange(Reste(donnees, diviseur));
            blocs.Add(bloc);
        }
        var final = new List<int>();
        for (var i = 0; i < blocs[0].Count; i++)
            for (var j = 0; j < blocs.Count; j++)
                if (blocs[j][i] != -1) final.Add(blocs[j][i]);

        var taille = version * 4 + 17;
        var m = new bool[taille, taille];
        var fonction = new bool[taille, taille];
        void Poser(int x, int y, bool noir) { m[y, x] = noir; fonction[y, x] = true; }
        for (var i = 0; i < taille; i++) { Poser(6, i, i % 2 == 0); Poser(i, 6, i % 2 == 0); }
        void Recherche(int x, int y)
        {
            for (var dy = -4; dy <= 4; dy++)
                for (var dx = -4; dx <= 4; dx++)
                {
                    var d = Math.Max(Math.Abs(dx), Math.Abs(dy));
                    if (x + dx >= 0 && x + dx < taille && y + dy >= 0 && y + dy < taille) Poser(x + dx, y + dy, d != 2 && d != 4);
                }
        }
        Recherche(3, 3);
        Recherche(taille - 4, 3);
        Recherche(3, taille - 4);
        if (version > 1)
        {
            var n = version / 7 + 2;
            var pas = version == 32 ? 26 : (int)Math.Ceiling((version * 4 + 4) / (double)(n * 2 - 2)) * 2;
            var positions = new int[n];
            positions[0] = 6;
            for (int i = n - 1, pos = taille - 7; i >= 1; i--, pos -= pas) positions[i] = pos;
            for (var i = 0; i < n; i++)
                for (var j = 0; j < n; j++)
                {
                    if ((i == 0 && j == 0) || (i == 0 && j == n - 1) || (i == n - 1 && j == 0)) continue;
                    for (var dy = -2; dy <= 2; dy++)
                        for (var dx = -2; dx <= 2; dx++) Poser(positions[i] + dx, positions[j] + dy, Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1);
                }
        }
        // Les bits de format (correction M = 00, masque 0), et la version à partir de 7.
        var format = 0;
        var reste = format;
        for (var i = 0; i < 10; i++) reste = (reste << 1) ^ ((reste >> 9) * 0x537);
        var f = ((format << 10) | reste) ^ 0x5412;
        bool Bit(int valeur, int i) => ((valeur >> i) & 1) != 0;
        for (var i = 0; i <= 5; i++) Poser(8, i, Bit(f, i));
        Poser(8, 7, Bit(f, 6));
        Poser(8, 8, Bit(f, 7));
        Poser(7, 8, Bit(f, 8));
        for (var i = 9; i < 15; i++) Poser(14 - i, 8, Bit(f, i));
        for (var i = 0; i < 8; i++) Poser(taille - 1 - i, 8, Bit(f, i));
        for (var i = 8; i < 15; i++) Poser(8, taille - 15 + i, Bit(f, i));
        Poser(8, taille - 8, true);
        if (version >= 7)
        {
            var r = version;
            for (var i = 0; i < 12; i++) r = (r << 1) ^ ((r >> 11) * 0x1F25);
            var v = (version << 12) | r;
            for (var i = 0; i < 18; i++)
            {
                var a = taille - 11 + i % 3;
                var b = i / 3;
                Poser(a, b, Bit(v, i));
                Poser(b, a, Bit(v, i));
            }
        }
        // Les mots, en zigzag de droite à gauche, puis le masque 0.
        var indice = 0;
        for (var droite = taille - 1; droite >= 1; droite -= 2)
        {
            if (droite == 6) droite = 5;
            for (var vert = 0; vert < taille; vert++)
                for (var j = 0; j < 2; j++)
                {
                    var x = droite - j;
                    var monte = ((droite + 1) & 2) == 0;
                    var y = monte ? taille - 1 - vert : vert;
                    if (fonction[y, x] || indice >= final.Count * 8) continue;
                    m[y, x] = ((final[indice >> 3] >> (7 - (indice & 7))) & 1) != 0;
                    indice++;
                }
        }
        for (var y = 0; y < taille; y++)
            for (var x = 0; x < taille; x++)
                if (!fonction[y, x] && (x + y) % 2 == 0) m[y, x] = !m[y, x];
        return m;
    }

    /// <summary>« code qr … » : redessiné quand le texte change.</summary>
    public static FrameworkElement Element(Func<string> texte, string description, double taille = 192)
    {
        var image = new System.Windows.Controls.Image { Width = taille, Height = taille, HorizontalAlignment = HorizontalAlignment.Left, SnapsToDevicePixels = true };
        RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.NearestNeighbor);
        AutomationProperties.SetName(image, description);
        new Effet(() =>
        {
            var m = Matrice(texte());
            if (m is null) { image.Source = null; return; }
            var n = m.GetLength(0);
            var groupe = new GeometryGroup();
            for (var y = 0; y < n; y++)
                for (var x = 0; x < n; x++)
                    if (m[y, x]) groupe.Children.Add(new RectangleGeometry(new Rect(x + 4, y + 4, 1, 1)));
            var dessin = new DrawingGroup();
            dessin.Children.Add(new GeometryDrawing(Brushes.White, null, new RectangleGeometry(new Rect(0, 0, n + 8, n + 8))));
            dessin.Children.Add(new GeometryDrawing(Brushes.Black, null, groupe));
            dessin.Freeze();
            image.Source = new DrawingImage(dessin);
        });
        return image;
    }
}
`;
