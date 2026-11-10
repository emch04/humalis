/**
 * Les images SVG en WPF : WPF ne lit pas le SVG, alors ce petit lecteur en fait un dessin
 * vectoriel (chemins, rectangles, cercles, ellipses, lignes, polygones, groupes, couleurs,
 * contours, opacité, transformations simples). Un dégradé prend la couleur de son premier arrêt.
 */
export const SVG_CS = String.raw`// Produit par Humalis : les images SVG, dessinées par WPF.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Media;
using System.Xml.Linq;

namespace Humalis;

public static class Svg
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    /// <summary>Le dessin d'un fichier SVG, ou null s'il ne se lit pas.</summary>
    public static DrawingImage? Lire(Stream flux)
    {
        try
        {
            var document = XDocument.Load(flux);
            var racine = document.Root;
            if (racine is null) return null;
            var degrades = new Dictionary<string, Color>();
            foreach (var d in racine.Descendants().Where(e => e.Name.LocalName is "linearGradient" or "radialGradient"))
            {
                var arret = d.Elements().FirstOrDefault(e => e.Name.LocalName == "stop");
                var id = (string?)d.Attribute("id");
                if (id is not null && arret is not null && Couleur(Style(arret, "stop-color") ?? "#000") is Color c) degrades[id] = c;
            }
            var groupe = new DrawingGroup();
            Dessiner(racine, groupe, new Contexte(Brushes.Black, null, 1, 1, degrades));
            // La boîte de dessin (viewBox) fixe la taille et l'origine.
            var boite = ((string?)racine.Attribute("viewBox"))?.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries).Select(Nombre).ToArray();
            if (boite is { Length: 4 })
            {
                var cadre = new DrawingGroup { ClipGeometry = new RectangleGeometry(new Rect(boite[0], boite[1], boite[2], boite[3])) };
                cadre.Children.Add(new GeometryDrawing(Brushes.Transparent, null, new RectangleGeometry(new Rect(boite[0], boite[1], boite[2], boite[3]))));
                cadre.Children.Add(groupe);
                groupe = cadre;
            }
            groupe.Freeze();
            var image = new DrawingImage(groupe);
            image.Freeze();
            return image;
        }
        catch (Exception) { return null; }
    }

    private sealed record Contexte(Brush? Remplissage, Brush? Trait, double Epaisseur, double Opacite, Dictionary<string, Color> Degrades);

    private static string? Style(XElement e, string nom)
    {
        var style = (string?)e.Attribute("style");
        if (style is not null)
        {
            foreach (var morceau in style.Split(';'))
            {
                var deux = morceau.Split(':', 2);
                if (deux.Length == 2 && deux[0].Trim() == nom) return deux[1].Trim();
            }
        }
        return (string?)e.Attribute(nom);
    }

    private static double Nombre(string? texte) => double.TryParse(Regex.Replace(texte ?? "0", "[a-z%]+$", ""), NumberStyles.Float, Inv, out var n) ? n : 0;

    private static Color? Couleur(string texte)
    {
        var t = texte.Trim();
        if (t == "none" || t == "transparent") return null;
        var rgb = Regex.Match(t, @"^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$");
        if (rgb.Success)
        {
            byte O(string s) => (byte)Math.Clamp(Math.Round(double.Parse(s, Inv)), 0, 255);
            var a = rgb.Groups[4].Success ? (byte)Math.Round(Math.Clamp(double.Parse(rgb.Groups[4].Value, Inv), 0, 1) * 255) : (byte)255;
            return Color.FromArgb(a, O(rgb.Groups[1].Value), O(rgb.Groups[2].Value), O(rgb.Groups[3].Value));
        }
        if (Regex.IsMatch(t, "^#[0-9a-fA-F]{3}$")) t = "#" + string.Concat(t[1..].Select(c => $"{c}{c}"));
        try { return (Color)ColorConverter.ConvertFromString(t); } catch (Exception) { return null; }
    }

    private static Brush? Pinceau(string? valeur, Brush? herite, Contexte c)
    {
        if (valeur is null || valeur == "inherit") return herite;
        if (valeur == "currentColor") return Brushes.Black;
        var url = Regex.Match(valeur, @"url\(#([^)]+)\)");
        if (url.Success) return c.Degrades.TryGetValue(url.Groups[1].Value, out var d) ? new SolidColorBrush(d) : herite;
        return Couleur(valeur) is Color couleur ? new SolidColorBrush(couleur) : null;
    }

    private static Transform? Transformation(string? texte)
    {
        if (string.IsNullOrWhiteSpace(texte)) return null;
        var groupe = new TransformGroup();
        foreach (Match m in Regex.Matches(texte, @"(\w+)\s*\(([^)]*)\)"))
        {
            var v = m.Groups[2].Value.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries).Select(Nombre).ToArray();
            Transform? t = m.Groups[1].Value switch
            {
                "translate" when v.Length >= 1 => new TranslateTransform(v[0], v.Length > 1 ? v[1] : 0),
                "scale" when v.Length >= 1 => new ScaleTransform(v[0], v.Length > 1 ? v[1] : v[0]),
                "rotate" when v.Length >= 1 => new RotateTransform(v[0], v.Length > 2 ? v[1] : 0, v.Length > 2 ? v[2] : 0),
                "matrix" when v.Length == 6 => new MatrixTransform(v[0], v[1], v[2], v[3], v[4], v[5]),
                _ => null,
            };
            if (t is not null) groupe.Children.Insert(0, t);
        }
        return groupe.Children.Count == 0 ? null : groupe;
    }

    private static void Dessiner(XElement e, DrawingGroup parent, Contexte herite)
    {
        var remplissage = Pinceau(Style(e, "fill"), herite.Remplissage, herite);
        var trait = Pinceau(Style(e, "stroke"), herite.Trait, herite);
        var epaisseur = Style(e, "stroke-width") is { } w ? Nombre(w) : herite.Epaisseur;
        var opacite = (Style(e, "opacity") is { } o ? Nombre(o) : 1);
        var c = new Contexte(remplissage, trait, epaisseur, 1, herite.Degrades);
        Geometry? forme = e.Name.LocalName switch
        {
            "path" => Chemin((string?)e.Attribute("d"), Style(e, "fill-rule")),
            "rect" => new RectangleGeometry(new Rect(Nombre((string?)e.Attribute("x")), Nombre((string?)e.Attribute("y")), Nombre((string?)e.Attribute("width")), Nombre((string?)e.Attribute("height"))), Nombre((string?)e.Attribute("rx")), Nombre((string?)(e.Attribute("ry") ?? e.Attribute("rx")))),
            "circle" => new EllipseGeometry(new Point(Nombre((string?)e.Attribute("cx")), Nombre((string?)e.Attribute("cy"))), Nombre((string?)e.Attribute("r")), Nombre((string?)e.Attribute("r"))),
            "ellipse" => new EllipseGeometry(new Point(Nombre((string?)e.Attribute("cx")), Nombre((string?)e.Attribute("cy"))), Nombre((string?)e.Attribute("rx")), Nombre((string?)e.Attribute("ry"))),
            "line" => new LineGeometry(new Point(Nombre((string?)e.Attribute("x1")), Nombre((string?)e.Attribute("y1"))), new Point(Nombre((string?)e.Attribute("x2")), Nombre((string?)e.Attribute("y2")))),
            "polyline" or "polygon" => Chemin("M" + ((string?)e.Attribute("points") ?? "") + (e.Name.LocalName == "polygon" ? "Z" : ""), Style(e, "fill-rule")),
            _ => null,
        };
        var transformation = Transformation((string?)e.Attribute("transform"));
        if (forme is not null)
        {
            var dessin = new GeometryDrawing(e.Name.LocalName == "line" ? null : remplissage, trait is null ? null : new Pen(trait, epaisseur) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round }, forme);
            var g = new DrawingGroup { Opacity = opacite, Transform = transformation };
            g.Children.Add(dessin);
            parent.Children.Add(g);
            return;
        }
        if (e.Name.LocalName is "defs" or "title" or "desc" or "style" or "linearGradient" or "radialGradient" or "clipPath" or "mask") return;
        var groupe = new DrawingGroup { Opacity = opacite, Transform = transformation };
        foreach (var enfant in e.Elements()) Dessiner(enfant, groupe, c);
        parent.Children.Add(groupe);
    }

    private static Geometry? Chemin(string? d, string? regle)
    {
        if (string.IsNullOrWhiteSpace(d)) return null;
        try
        {
            // Le langage des chemins de WPF est celui du SVG ; « F1 » demande la règle « nonzero ».
            var g = Geometry.Parse((regle == "evenodd" ? "" : "F1 ") + d.Replace(",", " "));
            return g;
        }
        catch (Exception) { return null; }
    }
}
`;
