/**
 * Les graphiques en WPF : courbe, barres et camembert, dessinés à la taille de la page,
 * avec leurs axes, leurs graduations (les mêmes pas que le web : 1, 2 ou 5 fois une
 * puissance de 10), une légende dont chaque série a sa forme (la couleur n'est jamais
 * seule à les distinguer) et la description écrite dessous.
 */
export const GRAPHIQUE_CS = String.raw`// Produit par Humalis : les graphiques (courbe, barres, camembert).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

namespace Humalis;

/// <summary>Une série : son nom, sa couleur, et le champ lu sur chaque ligne (null : la ligne est le nombre).</summary>
public sealed record SerieGraphique(string Nom, Brush Couleur, string? Champ);

public sealed class GraphiqueHumalis : FrameworkElement
{
    private static readonly string[] Reperes = { "rond", "carre", "triangle", "losange" };

    public string Genre { get; init; } = "barres";
    public string[] Libelles { get; set; } = Array.Empty<string>();
    public SerieGraphique[] Series { get; init; } = Array.Empty<SerieGraphique>();
    public double?[][] Valeurs { get; set; } = Array.Empty<double?[]>();
    public string? Devise { get; init; }
    public double Proportion { get; init; } = 2;

    private Brush Encre => (TryFindResource("TextFillColorPrimaryBrush") as Brush) ?? (Apparence.Sombre ? Brushes.White : Brushes.Black);
    private Brush Discret => (TryFindResource("TextFillColorSecondaryBrush") as Brush) ?? Brushes.Gray;
    private Brush Grille => (TryFindResource("ControlStrokeColorDefaultBrush") as Brush) ?? new SolidColorBrush(Color.FromArgb(40, 128, 128, 128));

    protected override Size MeasureOverride(Size disponible)
    {
        var largeur = double.IsInfinity(disponible.Width) ? 600 : disponible.Width;
        return new Size(largeur, Math.Max(160, largeur / Proportion));
    }

    private string Ecrire(double v) => Devise is null ? V.Nombre(v) : V.Argent(v, Devise);

    private FormattedText Texte(string t, double taille, Brush pinceau) =>
        new(t, Langues.Culture, FlowDirection.LeftToRight, new Typeface("Segoe UI"), taille, pinceau, VisualTreeHelper.GetDpi(this).PixelsPerDip);

    /// <summary>« graduations » du web : de min à max, par pas de 1, 2 ou 5 fois une puissance de 10.</summary>
    public static double[] Graduations(double min, double max)
    {
        if (max == min) max = min + 1;
        var brut = (max - min) / 5;
        var puissance = Math.Pow(10, Math.Floor(Math.Log10(brut)));
        var rapport = brut / puissance;
        var pas = (rapport <= 1 ? 1 : rapport <= 2 ? 2 : rapport <= 5 ? 5 : 10) * puissance;
        var valeurs = new List<double>();
        for (var i = (long)Math.Floor(min / pas + 1e-9); i <= (long)Math.Ceiling(max / pas - 1e-9); i++) valeurs.Add(Math.Round(i * pas, 10));
        return valeurs.ToArray();
    }

    private static void Repere(DrawingContext dc, string forme, Point centre, double r, Brush couleur)
    {
        switch (forme)
        {
            case "carre": dc.DrawRectangle(couleur, null, new Rect(centre.X - r, centre.Y - r, 2 * r, 2 * r)); break;
            case "triangle": dc.DrawGeometry(couleur, null, Geometry.Parse(FormattableString.Invariant($"M{centre.X},{centre.Y - r} L{centre.X + r},{centre.Y + r} L{centre.X - r},{centre.Y + r} Z"))); break;
            case "losange": dc.DrawGeometry(couleur, null, Geometry.Parse(FormattableString.Invariant($"M{centre.X},{centre.Y - r} L{centre.X + r},{centre.Y} L{centre.X},{centre.Y + r} L{centre.X - r},{centre.Y} Z"))); break;
            default: dc.DrawEllipse(couleur, null, centre, r, r); break;
        }
    }

    protected override void OnRender(DrawingContext dc)
    {
        var l = ActualWidth;
        var h = ActualHeight;
        if (l <= 0 || h <= 0 || Libelles.Length == 0) return;
        // La légende, en haut à gauche.
        double x0 = 0;
        if (Series.Length > 1 || Genre == "camembert")
        {
            var noms = Genre == "camembert" ? Libelles : Series.Select(s => s.Nom).ToArray();
            for (var i = 0; i < noms.Length; i++)
            {
                var couleur = Genre == "camembert" ? Palette.Couleur(i) : Series[i].Couleur;
                Repere(dc, Reperes[i % Reperes.Length], new Point(x0 + 6, 9), 5, couleur);
                var t = Texte(noms[i], 12, Encre);
                dc.DrawText(t, new Point(x0 + 16, 1));
                x0 += 28 + t.Width;
            }
        }
        var haut = Series.Length > 1 || Genre == "camembert" ? 28.0 : 8.0;
        if (Genre == "camembert")
        {
            var valeurs = (Valeurs.FirstOrDefault() ?? Array.Empty<double?>()).Select(v => Math.Max(0, v ?? 0)).ToArray();
            var total = valeurs.Sum();
            if (total <= 0) return;
            var r = Math.Min(l, h - haut) / 2 - 8;
            var centre = new Point(l / 2, haut + (h - haut) / 2);
            var angle = -Math.PI / 2;
            for (var i = 0; i < valeurs.Length; i++)
            {
                var part = valeurs[i] / total * 2 * Math.PI;
                if (part <= 0) continue;
                var a = new Point(centre.X + r * Math.Cos(angle), centre.Y + r * Math.Sin(angle));
                var b = new Point(centre.X + r * Math.Cos(angle + part), centre.Y + r * Math.Sin(angle + part));
                var figure = new PathFigure { StartPoint = centre, IsClosed = true };
                figure.Segments.Add(new LineSegment(a, true));
                figure.Segments.Add(new ArcSegment(b, new Size(r, r), 0, part > Math.PI, SweepDirection.Clockwise, true));
                dc.DrawGeometry(Palette.Couleur(i), new Pen(Brushes.White, 1.5), new PathGeometry(new[] { figure }));
                angle += part;
            }
            return;
        }
        var tous = Valeurs.SelectMany(s => s).Where(v => v.HasValue).Select(v => v!.Value).ToArray();
        if (tous.Length == 0) return;
        var graduations = Graduations(Math.Min(0, tous.Min()), Math.Max(0, tous.Max()));
        var bas = graduations.First();
        var sommet = graduations.Last();
        var gauche = graduations.Max(g => Texte(Ecrire(g), 11, Discret).Width) + 8;
        var pied = 22.0;
        var zone = new Rect(gauche, haut, Math.Max(10, l - gauche - 4), Math.Max(10, h - haut - pied));
        double Y(double v) => zone.Bottom - (v - bas) / (sommet - bas) * zone.Height;
        var trait = new Pen(Grille, 1);
        foreach (var g in graduations)
        {
            dc.DrawLine(trait, new Point(zone.Left, Y(g)), new Point(zone.Right, Y(g)));
            var t = Texte(Ecrire(g), 11, Discret);
            dc.DrawText(t, new Point(gauche - 6 - t.Width, Y(g) - t.Height / 2));
        }
        var n = Libelles.Length;
        var colonne = zone.Width / n;
        for (var i = 0; i < n; i++)
        {
            var t = Texte(Libelles[i], 11, Discret);
            if (t.Width < colonne + 8 || i % Math.Max(1, (int)Math.Ceiling(t.Width / colonne)) == 0)
                dc.DrawText(t, new Point(zone.Left + colonne * (i + 0.5) - t.Width / 2, zone.Bottom + 4));
        }
        if (Genre == "barres")
        {
            var groupe = colonne * 0.7;
            var barre = groupe / Math.Max(1, Series.Length);
            for (var s = 0; s < Series.Length; s++)
                for (var i = 0; i < n; i++)
                {
                    if (Valeurs[s][i] is not double v) continue;
                    var x = zone.Left + colonne * i + (colonne - groupe) / 2 + barre * s;
                    var y1 = Y(Math.Max(0, v));
                    var y2 = Y(Math.Min(0, v));
                    dc.DrawRoundedRectangle(Series[s].Couleur, null, new Rect(x + 1, y1, Math.Max(1, barre - 2), Math.Max(1, y2 - y1)), 2, 2);
                }
            return;
        }
        for (var s = 0; s < Series.Length; s++)
        {
            var points = new List<Point>();
            for (var i = 0; i < n; i++) if (Valeurs[s][i] is double v) points.Add(new Point(zone.Left + colonne * (i + 0.5), Y(v)));
            var stylo = new Pen(Series[s].Couleur, 2.5) { LineJoin = PenLineJoin.Round };
            for (var i = 1; i < points.Count; i++) dc.DrawLine(stylo, points[i - 1], points[i]);
            foreach (var p in points) Repere(dc, Reperes[s % Reperes.Length], p, 4, Series[s].Couleur);
        }
    }
}

/// <summary>Les couleurs des parts et des séries sans couleur écrite : bleu, orange, vert, violet, rose, gris.</summary>
public static class Palette
{
    public static Brush Couleur(int i) => (i % 6) switch { 0 => Couleurs.Bleu, 1 => Couleurs.Orange, 2 => Couleurs.Vert, 3 => Couleurs.Violet, 4 => Couleurs.Rose, _ => Couleurs.Gris };
}

public static class GraphiqueFabrique
{
    /// <summary>Un graphique relié à sa liste : les libellés et les valeurs sont relus quand la liste change.</summary>
    public static FrameworkElement Creer(string genre, Func<object?> liste, string? etiquette, Func<object?>? etiquettes, SerieGraphique[] series, string? devise, Func<string> titre, Func<string> description, double proportion = 2)
    {
        var dessin = new GraphiqueHumalis { Genre = genre, Series = series, Devise = devise, Proportion = proportion };
        var legende = new TextBlock { TextWrapping = TextWrapping.Wrap, Opacity = 0.75, Margin = new Thickness(0, 6, 0, 0) };
        new Effet(() =>
        {
            var lignes = V.L(liste());
            var noms = etiquettes is null ? null : V.L(etiquettes());
            dessin.Libelles = lignes.Select((ligne, i) =>
            {
                var v = noms is not null && i < noms.Count ? noms[i] : etiquette is not null ? V.Champ(ligne, etiquette) : null;
                var t = V.T(v);
                return t.Length > 0 ? t : (i + 1).ToString(CultureInfo.InvariantCulture);
            }).ToArray();
            dessin.Valeurs = series.Select(s => lignes.Select(ligne => { var v = s.Champ is null ? ligne : V.Champ(ligne, s.Champ); return V.EstNombre(v) ? (double?)V.N(v) : null; }).ToArray()).ToArray();
            if (dessin.Valeurs.Length == 0 && genre == "camembert") dessin.Valeurs = new[] { lignes.Select(l => V.EstNombre(l) ? (double?)V.N(l) : null).ToArray() };
            dessin.InvalidateVisual();
            legende.Text = description();
            AutomationProperties.SetName(dessin, titre());
            AutomationProperties.SetHelpText(dessin, legende.Text);
        });
        var pile = new PileHumalis { Ecart = 0 };
        pile.Children.Add(dessin);
        pile.Children.Add(legende);
        return pile;
    }
}
`;
