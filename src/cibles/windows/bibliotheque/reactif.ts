/**
 * La réactivité en C# : une variable Humalis est un Signal ; ce qui la lit (un texte,
 * une condition, une liste) est un Effet, relancé seul quand elle change. Les effets
 * d'une zone redessinée disparaissent avec elle.
 */
export const REACTIF_CS = String.raw`// Produit par Humalis : les variables qui se suivent, et ce qui les lit.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Humalis;

/// <summary>Une variable : la lire l'abonne à ce qui la lit ; la changer relance ce qui l'a lue.</summary>
public sealed class Signal
{
    private object? valeur;
    private readonly HashSet<Effet> abonnes = new();

    public Signal(object? depart = null) { valeur = depart; }

    /// <summary>Appelé après chaque changement (pour la garder sur l'appareil).</summary>
    public event Action<object?>? Change;

    public object? Lire()
    {
        Effet.Courant?.Suivre(this);
        return valeur;
    }

    /// <summary>La valeur, sans s'abonner.</summary>
    public object? Valeur => valeur;

    public void Ecrire(object? nouvelle)
    {
        if (Equals(valeur, nouvelle)) return;
        valeur = nouvelle;
        Change?.Invoke(nouvelle);
        foreach (var e in abonnes.ToArray()) e.Planifier();
    }

    internal void Abonner(Effet e) => abonnes.Add(e);
    internal void Desabonner(Effet e) => abonnes.Remove(e);
}

/// <summary>Un calcul qui suit les variables qu'il lit, relancé quand l'une change.</summary>
public sealed class Effet : IDisposable
{
    [ThreadStatic] private static Effet? courant;
    public static Effet? Courant => courant;

    private readonly Action corps;
    private readonly HashSet<Signal> sources = new();
    private readonly List<IDisposable> enfants = new();
    private readonly int profondeur;
    private bool fini;
    private bool planifie;

    public Effet(Action corps)
    {
        this.corps = corps;
        profondeur = courant is null ? 0 : courant.profondeur + 1;
        courant?.enfants.Add(this);
        Executer();
    }

    /// <summary>Ce qui doit s'arrêter quand la zone qui l'a créé est redessinée (une minuterie).</summary>
    public static void Attacher(IDisposable chose) => courant?.enfants.Add(chose);

    /// <summary>Exécute sans rien suivre : ce qui est lu ici n'abonne pas l'effet courant.</summary>
    public static T SansSuivre<T>(Func<T> lire)
    {
        var avant = courant;
        courant = null;
        try { return lire(); } finally { courant = avant; }
    }

    internal void Suivre(Signal s)
    {
        if (!fini && sources.Add(s)) s.Abonner(this);
    }

    private void Executer()
    {
        if (fini) return;
        planifie = false;
        Nettoyer();
        var avant = courant;
        courant = this;
        try { corps(); } finally { courant = avant; }
    }

    private void Nettoyer()
    {
        foreach (var s in sources) s.Desabonner(this);
        sources.Clear();
        foreach (var e in enfants) e.Dispose();
        enfants.Clear();
    }

    public void Dispose()
    {
        if (fini) return;
        fini = true;
        Nettoyer();
    }

    // Les changements d'un même geste sont regroupés : chaque effet repart une fois, les parents d'abord.
    private static readonly List<Effet> file = new();
    private static int lot;

    internal void Planifier()
    {
        if (fini || planifie) return;
        planifie = true;
        file.Add(this);
        if (lot == 0) Vider();
    }

    /// <summary>Plusieurs changements, un seul nouveau dessin.</summary>
    public static void Lot(Action action)
    {
        lot++;
        try { action(); }
        finally
        {
            lot--;
            if (lot == 0) Vider();
        }
    }

    private static void Vider()
    {
        lot++;
        try
        {
            var tours = 0;
            while (file.Count > 0 && tours++ < 100)
            {
                var tries = file.OrderBy(e => e.profondeur).ToList();
                file.Clear();
                foreach (var e in tries) e.Executer();
            }
        }
        finally { lot--; }
    }
}
`;
