/**
 * Le moteur de « dessinee pour 1440 par 900 » : boîtes, flex, grille, placement absolu, dégradés,
 * formes découpées et icônes tracées, à l'échelle de la fenêtre. Les styles viennent de css-exact.ts.
 */
import type { IconeDessinee } from '../../icones-svg.js';

export const DESSIN_SWIFT = String.raw`// Produit par Humalis : le rendu au point près des pages « dessinee pour ».
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct ContexteDessin { let z: CGFloat; let vue: CGSize }

struct MesureHumalis: Codable, Hashable {
    var p: CGFloat?
    var c: CGFloat?
    var v: CGFloat?
    var w: CGFloat?
    /** nil : un pourcentage sans base connue vaut « auto ». */
    func en(_ base: CGFloat?, _ x: ContexteDessin) -> CGFloat? {
        var t = (p ?? 0) * x.z + (v ?? 0) * x.vue.height / 100 + (w ?? 0) * x.vue.width / 100
        if let c {
            guard let base else { return nil }
            t += base * c / 100
        }
        return t
    }
}

struct MargeHumalis: Codable, Hashable {
    var m: MesureHumalis?
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        m = (try? c.decode(String.self)) == "auto" ? nil : try c.decode(MesureHumalis.self)
    }
    func encode(to e: Encoder) throws {}
    var auto: Bool { m == nil }
}

struct PisteHumalis: Codable, Hashable { var m: MesureHumalis?; var fr: CGFloat?; var af: CGFloat? }
struct ArretHumalis: Codable, Hashable { var c: [Double]; var p: CGFloat }
struct LineaireHumalis: Codable, Hashable { var a: Double; var s: [ArretHumalis] }
struct RadialHumalis: Codable, Hashable { var x: CGFloat; var y: CGFloat; var rx: CGFloat; var ry: CGFloat; var s: [ArretHumalis] }
struct FondHumalis: Codable, Hashable { var c: [Double]?; var l: LineaireHumalis?; var r: RadialHumalis? }
struct OmbreHumalis: Codable, Hashable { var x: CGFloat; var y: CGFloat; var f: CGFloat; var e: CGFloat; var c: [Double]; var i: Bool? }
struct BordHumalis: Codable, Hashable {
    var e: CGFloat
    var c: [Double]
    init(from d: Decoder) throws {
        var u = try d.unkeyedContainer()
        e = try u.decode(CGFloat.self)
        c = try u.decode([Double].self)
    }
    func encode(to e: Encoder) throws {}
}

extension Array where Element == Double {
    var couleurHumalis: Color { Color(.sRGB, red: self[0], green: self[1], blue: self[2], opacity: self[3]) }
}

struct StyleHumalis: Codable, Hashable {
    var d: String?, ix: Bool?, col: Bool?, wr: Bool?, jc: String?, ai: String?, ji: String?, ac: String?, as_: String?, js: String?
    var gl: CGFloat?, gc: CGFloat?, co: [PisteHumalis]?, ro: [PisteHumalis]?, gcs: Int?, gce: Int?, grs: Int?, gre: Int?
    var pa: [CGFloat]?, ma: [MargeHumalis]?
    var la: MesureHumalis?, ha: MesureHumalis?, lm: MesureHumalis?, hm: MesureHumalis?, lM: MesureHumalis?, hM: MesureHumalis?
    var ab: Bool?, to: MesureHumalis?, ri: MesureHumalis?, bo: MesureHumalis?, le: MesureHumalis?, z: Double?
    var fg: CGFloat?, fs: CGFloat?, fb: MesureHumalis?
    var tx: MesureHumalis?, ty: MesureHumalis?, ro2: Double?
    var fo: [FondHumalis]?, ar: [CGFloat]?, bd: [BordHumalis?]?, om: [OmbreHumalis]?, po: [[MesureHumalis]]?, op: Double?, oh: Bool?, sc: Bool?, cach: Bool?
    var ic: Int?, fi: Int?
    var t: CGFloat?, g: Double?, f: String?, c: [Double]?, li: CGFloat?, lp: CGFloat?, tr: CGFloat?, ta: String?, cas: String?, nw: Bool?, el: Bool?, it: Bool?, nb: Bool?

    enum CodingKeys: String, CodingKey {
        case d, ix, col, wr, jc, ai, ji, ac, js, gl, gc, co, ro, gcs, gce, grs, gre, pa, ma, la, ha, lm, hm, lM, hM, ab, to, ri, bo, le, z, fg, fs, fb, tx, ty, ro2, fo, ar, bd, om, po, op, oh, sc, cach, ic, fi, t, g, f, c, li, lp, tr, ta, cas, nw, el, it, nb
        case as_ = "as"
    }

    static func lire(_ json: String) -> StyleHumalis {
        (try? JSONDecoder().decode(StyleHumalis.self, from: Data(json.utf8))) ?? StyleHumalis()
    }
    static let racine: StyleHumalis = { var s = StyleHumalis(); s.d = "block"; return s }()
    /** Ce qui remplit sa boîte : une icône, une image. */
    static let plein = StyleHumalis.lire(#"{"d":"block","la":{"c":100},"ha":{"c":100}}"#)

    var enLigne: Bool { ix == true }
    var estAbsolu: Bool { ab == true }
    var bordsEp: [CGFloat] { (0..<4).map { i in (bd?[i]?.e) ?? 0 } }
}

/** Choisit le style d'une ligne de boucle selon sa place. */
func rangHumalis(_ i: Int, _ n: Int, _ pp: StyleHumalis, _ pd: StyleHumalis, _ dp: StyleHumalis, _ dd: StyleHumalis) -> StyleHumalis {
    let premier = i == 0, dernier = i == n - 1
    return premier ? (dernier ? pp : pd) : (dernier ? dp : dd)
}

/**
 * La variante en cours : la plage de largeur de l'écran (iPhone, iPad, rotation), puis clair ou sombre.
 * Posée par la page dessinée, lue par chaque style qui change d'une variante à l'autre.
 */
@MainActor @Observable final class VarianteDessinHumalis {
    static let commune = VarianteDessinHumalis()
    private(set) var index = 0
    /** Change après chaque nouvelle variante : réveille les vues déjà écrites pendant le changement. */
    private(set) var tour = 0
    @ObservationIgnored private var posee = 0
    /** Posée pendant l'écriture de la page : la première image a déjà la bonne variante. */
    func regler(_ largeur: CGFloat, _ sombre: Bool) {
        let i = Self.indexPour(largeur, sombre)
        if i != posee { posee = i; index = i }
    }
    /** Après la mise à jour : un changement fait pendant l'écriture peut ne réveiller personne. */
    func confirmer() { tour &+= 1 }
    nonisolated static func indexPour(_ largeur: CGFloat, _ sombre: Bool) -> Int {
        let plage = PlagesDessinees.debuts.lastIndex { $0 <= largeur } ?? 0
        return PlagesDessinees.sombre ? plage * 2 + (sombre ? 1 : 0) : plage
    }
}

@MainActor func varianteHumalis(_ s: StyleHumalis...) -> StyleHumalis {
    let v = VarianteDessinHumalis.commune
    _ = v.tour
    return s[min(s.count - 1, v.index)]
}

/** Confirme la variante quand la largeur ou le mode sombre change. */
private struct SuiviVarianteHumalis: ViewModifier {
    let index: Int
    func body(content: Content) -> some View {
        content.onChange(of: index) { VarianteDessinHumalis.commune.confirmer() }
    }
}

/** Un bouton plus petit que 44 points se touche quand même sur iPhone : la zone grandit, pas le dessin. */
struct CibleTactileHumalis: ViewModifier {
    #if os(iOS)
    @State private var taille = CGSize(width: 44, height: 44)
    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGSize.self) { $0.size } action: { taille = $0 }
            .contentShape(ZoneTactileHumalis(dx: min(0, (taille.width - 44) / 2), dy: min(0, (taille.height - 44) / 2)))
    }
    #else
    func body(content: Content) -> some View { content.contentShape(Rectangle()) }
    #endif
}

private struct ZoneTactileHumalis: Shape {
    let dx: CGFloat
    let dy: CGFloat
    func path(in r: CGRect) -> Path { Path(r.insetBy(dx: dx, dy: dy)) }
}

@MainActor func estOuverteHumalis(_ route: Route) -> Bool { (Routeur.commun.chemin.last ?? .accueilHumalis) == route }

private struct CleEchelle: EnvironmentKey { static let defaultValue: CGFloat = 1 }
private struct CleVue: EnvironmentKey { static let defaultValue = CGSize(width: 1440, height: 900) }
private struct CleEchelleFenetre: EnvironmentKey { static let defaultValue: CGFloat? = nil }
private struct CleFondEtendu: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var echelleHumalis: CGFloat { get { self[CleEchelle.self] } set { self[CleEchelle.self] = newValue } }
    var vueHumalis: CGSize { get { self[CleVue.self] } set { self[CleVue.self] = newValue } }
    /** Posée par la coquille : toutes les pages suivent la taille de la fenêtre entière. */
    var echelleFenetreHumalis: CGFloat? { get { self[CleEchelleFenetre.self] } set { self[CleEchelleFenetre.self] = newValue } }
    /** La boîte qui le reçoit dessine son fond jusque sous la zone sûre ; ses enfants, non. */
    var fondEtenduHumalis: Bool { get { self[CleFondEtendu.self] } set { self[CleFondEtendu.self] = newValue } }
}

struct CleItemHumalis: LayoutValueKey { static let defaultValue: StyleHumalis? = nil }

extension View {
    /** Ce que la boîte parente doit savoir de cet élément. */
    func itemHumalis(_ s: StyleHumalis) -> some View {
        layoutValue(key: CleItemHumalis.self, value: s).zIndex(s.z ?? 0)
    }
}

private func fini(_ v: CGFloat?) -> CGFloat? { if let v, v.isFinite { return v }; return nil }

struct LayoutBoiteHumalis: Layout {
    let s: StyleHumalis
    let x: ContexteDessin

    struct Resultat { var taille: CGSize; var places: [(Int, CGRect)] }
    final class Memoire { var r: [String: Resultat] = [:] }
    func makeCache(subviews: Subviews) -> Memoire { Memoire() }
    func updateCache(_ cache: inout Memoire, subviews: Subviews) { cache = Memoire() }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Memoire) -> CGSize {
        resultat(proposal, subviews, cache).taille
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Memoire) {
        let r = resultat(ProposedViewSize(bounds.size), subviews, cache)
        for (i, rect) in r.places {
            subviews[i].place(at: CGPoint(x: bounds.minX + rect.minX, y: bounds.minY + rect.minY), anchor: .topLeading, proposal: ProposedViewSize(rect.size))
        }
    }
    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Memoire) -> CGFloat? {
        guard guide == .firstTextBaseline else { return nil }
        let r = resultat(ProposedViewSize(bounds.size), subviews, cache)
        guard let (i, rect) = r.places.first else { return nil }
        return bounds.minY + rect.minY + subviews[i].dimensions(in: ProposedViewSize(rect.size))[.firstTextBaseline]
    }

    private func resultat(_ p: ProposedViewSize, _ sub: Subviews, _ cache: Memoire) -> Resultat {
        let cle = "\(p.width ?? -1)x\(p.height ?? -1)"
        if let r = cache.r[cle] { return r }
        let r = calculer(p, sub)
        cache.r[cle] = r
        return r
    }

    private func borne(_ v: CGFloat, _ mini: MesureHumalis?, _ maxi: MesureHumalis?, _ base: CGFloat?) -> CGFloat {
        var r = v
        if let m = maxi?.en(base, x) { r = min(r, m) }
        if let m = mini?.en(base, x) { r = max(r, m) }
        return r
    }

    private func calculer(_ p: ProposedViewSize, _ sub: Subviews) -> Resultat {
        let pa = (s.pa ?? [0, 0, 0, 0]).map { $0 * x.z }
        let bd = s.bordsEp.map { $0 * x.z }
        let horiz = pa[1] + pa[3] + bd[1] + bd[3], vert = pa[0] + pa[2] + bd[0] + bd[2]
        // La boîte parente a déjà résolu largeur et hauteur : une taille proposée est la taille voulue.
        var w = fini(p.width) ?? s.la?.en(nil, x)
        var h = fini(p.height) ?? s.ha?.en(nil, x)
        if let v = w { w = borne(v, s.lm, s.lM, nil) }
        if let v = h { h = borne(v, s.hm, s.hM, nil) }
        var interieur = disposer(w.map { max(0, $0 - horiz) }, h.map { max(0, $0 - vert) }, sub)
        // Une hauteur minimale compte comme une hauteur : on dispose à nouveau, ses enfants s'en servent.
        if h == nil {
            let voulue = borne(interieur.contenu.height + vert, s.hm, s.hM, nil)
            if voulue != interieur.contenu.height + vert {
                h = voulue
                interieur = disposer(w.map { max(0, $0 - horiz) }, max(0, voulue - vert), sub)
            }
        }
        if w == nil {
            let voulue = borne(interieur.contenu.width + horiz, s.lm, s.lM, nil)
            if voulue != interieur.contenu.width + horiz {
                w = voulue
                interieur = disposer(max(0, voulue - horiz), h.map { max(0, $0 - vert) }, sub)
            }
        }
        let tw = w ?? (interieur.contenu.width + horiz), th = h ?? (interieur.contenu.height + vert)
        let ox = pa[3] + bd[3], oy = pa[0] + bd[0]
        var places = interieur.places.map { ($0.0, $0.1.offsetBy(dx: ox, dy: oy)) }
        placerAbsolus(sub, &places, CGSize(width: tw, height: th), bd, CGPoint(x: ox, y: oy))
        // « transform: translate(…) » : un pourcentage vise la taille de l'élément lui-même.
        places = places.map { (i, r) in
            guard let t = sub[i][CleItemHumalis.self], t.tx != nil || t.ty != nil else { return (i, r) }
            return (i, r.offsetBy(dx: t.tx?.en(r.width, x) ?? 0, dy: t.ty?.en(r.height, x) ?? 0))
        }
        return Resultat(taille: CGSize(width: tw, height: th), places: places)
    }

    private struct Disposition { var contenu: CGSize; var places: [(Int, CGRect)] }

    private func disposer(_ w: CGFloat?, _ h: CGFloat?, _ sub: Subviews) -> Disposition {
        let flot = sub.indices.filter { sub[$0][CleItemHumalis.self]?.estAbsolu != true && sub[$0][CleItemHumalis.self]?.d != "none" }
        switch s.d {
        case "flex": return flex(w, h, sub, flot)
        case "grid": return grille(w, h, sub, flot)
        default: return bloc(w, h, sub, flot)
        }
    }

    private func marges(_ t: StyleHumalis?, _ base: CGFloat?) -> [CGFloat] {
        guard let m = t?.ma else { return [0, 0, 0, 0] }
        return m.map { $0.m?.en(base, x) ?? 0 }
    }
    private func alignerTexte(_ place: CGFloat, _ taille: CGFloat) -> CGFloat {
        switch s.ta { case "c": return (place - taille) / 2; case "e": return place - taille; default: return 0 }
    }

    // ─── Le flot normal ───
    private func bloc(_ w: CGFloat?, _ h: CGFloat?, _ sub: Subviews, _ flot: [Int]) -> Disposition {
        var places: [(Int, CGRect)] = []
        var y: CGFloat = 0, largeur: CGFloat = 0, margeBas: CGFloat = 0
        var ligne: [(Int, CGSize)] = []
        func viderLigne() {
            guard !ligne.isEmpty else { return }
            var lignes: [[(Int, CGSize)]] = [[]]
            var cumul: CGFloat = 0
            for it in ligne {
                if let w, cumul + it.1.width > w + 0.5, !lignes[lignes.count - 1].isEmpty { lignes.append([]); cumul = 0 }
                lignes[lignes.count - 1].append(it)
                cumul += it.1.width
            }
            for l in lignes {
                let total = l.reduce(0) { $0 + $1.1.width }, haut = l.map { $0.1.height }.max() ?? 0
                var cx = w.map { alignerTexte($0, total) } ?? 0
                for (i, t) in l {
                    places.append((i, CGRect(x: cx, y: y, width: t.width, height: t.height)))
                    cx += t.width
                }
                y += haut
                largeur = max(largeur, total)
            }
            ligne = []
            margeBas = 0
        }
        for i in flot {
            let t = sub[i][CleItemHumalis.self]
            if t == nil || t?.enLigne == true {
                let voulue = t?.la?.en(w, x)
                var taille = sub[i].sizeThatFits(ProposedViewSize(width: voulue, height: t?.ha?.en(h, x)))
                if voulue == nil, let w, taille.width > w { taille = sub[i].sizeThatFits(ProposedViewSize(width: w, height: t?.ha?.en(h, x))) }
                ligne.append((i, taille))
                continue
            }
            viderLigne()
            let m = marges(t, w)
            let dispo = w.map { max(0, $0 - m[1] - m[3]) }
            let cw = t?.la?.en(w, x) ?? dispo
            let taille = sub[i].sizeThatFits(ProposedViewSize(width: cw, height: t?.ha?.en(h, x)))
            var ox = m[3]
            if let w, let ma = t?.ma, ma[3].auto {
                let reste = w - taille.width - m[1]
                ox = ma[1].auto ? reste / 2 : reste
            }
            y += max(margeBas, m[0]) - min(margeBas, m[0]) == 0 ? 0 : max(0, m[0] - margeBas)
            if m[0] == margeBas { y += 0 }
            places.append((i, CGRect(x: ox, y: y, width: taille.width, height: taille.height)))
            y += taille.height + m[2]
            margeBas = m[2]
            largeur = max(largeur, taille.width + m[1] + m[3])
        }
        viderLigne()
        return Disposition(contenu: CGSize(width: largeur, height: y), places: places)
    }

    // ─── Flex ───
    private func flex(_ w: CGFloat?, _ h: CGFloat?, _ sub: Subviews, _ flot: [Int]) -> Disposition {
        let colonne = s.col == true
        let principal = colonne ? h : w, croise = colonne ? w : h
        let ecartP = ((colonne ? s.gl : s.gc) ?? 0) * x.z, ecartC = ((colonne ? s.gc : s.gl) ?? 0) * x.z
        struct It { var i: Int; var t: StyleHumalis?; var m: [CGFloat]; var mp: CGFloat; var mc: CGFloat; var base: CGFloat; var taille: CGFloat; var ct: CGFloat = 0; var fixeC: CGFloat?; var etire: Bool }
        func prop(_ p: CGFloat?, _ c: CGFloat?) -> ProposedViewSize { colonne ? ProposedViewSize(width: c, height: p) : ProposedViewSize(width: p, height: c) }
        func axeP(_ t: CGSize) -> CGFloat { colonne ? t.height : t.width }
        func axeC(_ t: CGSize) -> CGFloat { colonne ? t.width : t.height }
        let aligneDefaut = s.ai ?? "x"
        var items: [It] = flot.map { i in
            let t = sub[i][CleItemHumalis.self]
            let m = marges(t, w)
            let mp = colonne ? m[0] + m[2] : m[1] + m[3], mc = colonne ? m[1] + m[3] : m[0] + m[2]
            let fixeP = colonne ? t?.ha?.en(h, x) : t?.la?.en(w, x)
            let fixeC = colonne ? t?.la?.en(w, x) : t?.ha?.en(h, x)
            let etire = (t?.as_ ?? aligneDefaut) == "x" && fixeC == nil
            var base: CGFloat
            if let b = t?.fb?.en(principal, x), !(t?.fb?.c == 0 && principal == nil) { base = b }
            else if let fixeP { base = fixeP }
            else {
                let cx: CGFloat? = fixeC ?? (colonne && etire ? croise.map { max(0, $0 - mc) } : nil)
                var mesure = sub[i].sizeThatFits(prop(nil, cx))
                if colonne, cx == nil, let croise, axeC(mesure) > croise - mc { mesure = sub[i].sizeThatFits(prop(nil, croise - mc)) }
                base = axeP(mesure)
            }
            let mini = (colonne ? t?.hm : t?.lm)?.en(principal, x), maxi = (colonne ? t?.hM : t?.lM)?.en(principal, x)
            if let maxi { base = min(base, maxi) }
            if let mini { base = max(base, mini) }
            return It(i: i, t: t, m: m, mp: mp, mc: mc, base: base, taille: base, fixeC: fixeC, etire: etire)
        }
        // Les lignes : une seule, sauf « flex-wrap: wrap ».
        var lignes: [[Int]] = [[]]
        if s.wr == true, let principal {
            var cumul: CGFloat = 0
            for k in items.indices {
                let t = items[k].base + items[k].mp
                if !lignes[lignes.count - 1].isEmpty, cumul + ecartP + t > principal + 0.5 { lignes.append([]); cumul = 0 }
                cumul += (lignes[lignes.count - 1].isEmpty ? 0 : ecartP) + t
                lignes[lignes.count - 1].append(k)
            }
        } else { lignes[0] = Array(items.indices) }

        var places: [(Int, CGRect)] = []
        var cy: CGFloat = 0, largeurP: CGFloat = 0
        var hauteursLignes: [CGFloat] = []
        for (nl, l) in lignes.enumerated() {
            if l.isEmpty { continue }
            let ecarts = CGFloat(l.count - 1) * ecartP
            if let principal {
                let libre = principal - ecarts - l.reduce(0) { $0 + items[$1].base + items[$1].mp }
                if libre > 0 {
                    let g = l.reduce(0) { $0 + (items[$1].t?.fg ?? 0) }
                    if g > 0 { for k in l { items[k].taille += libre * (items[k].t?.fg ?? 0) / max(g, 1) } }
                } else if libre < 0 {
                    let g = l.reduce(0) { $0 + (items[$1].t?.fs ?? 1) * items[$1].base }
                    if g > 0 { for k in l { items[k].taille = max(0, items[k].taille + libre * (items[k].t?.fs ?? 1) * items[k].base / g) } }
                }
                for k in l {
                    let t = items[k].t
                    if let v = (colonne ? t?.hM : t?.lM)?.en(principal, x) { items[k].taille = min(items[k].taille, v) }
                    if let v = (colonne ? t?.hm : t?.lm)?.en(principal, x) { items[k].taille = max(items[k].taille, v) }
                }
            }
            for k in l {
                let cx: CGFloat? = items[k].fixeC ?? (colonne && items[k].etire ? croise.map { max(0, $0 - items[k].mc) } : nil)
                var mesure = sub[items[k].i].sizeThatFits(prop(items[k].taille, cx))
                if colonne, cx == nil, let croise, axeC(mesure) > croise - items[k].mc { mesure = sub[items[k].i].sizeThatFits(prop(items[k].taille, croise - items[k].mc)) }
                items[k].ct = items[k].fixeC ?? axeC(mesure)
            }
            var hl = l.map { items[$0].ct + items[$0].mc }.max() ?? 0
            if lignes.count == 1, let croise { hl = croise }
            for k in l where items[k].etire { items[k].ct = max(0, hl - items[k].mc) }
            let utilise = ecarts + l.reduce(0) { $0 + items[$1].taille + items[$1].mp }
            var reste = (principal ?? utilise) - utilise
            // Les marges « auto » prennent la place libre.
            let autos = l.flatMap { k -> [Int] in
                guard let ma = items[k].t?.ma else { return [] }
                return (colonne ? [0, 2] : [3, 1]).filter { ma[$0].auto }.map { _ in k }
            }
            let parAuto = autos.isEmpty ? 0 : max(0, reste) / CGFloat(autos.count)
            if !autos.isEmpty { reste = 0 }
            var debut: CGFloat = 0, entre = ecartP
            switch s.jc ?? "s" {
            case "e": debut = reste
            case "c": debut = reste / 2
            case "b": if l.count > 1 { entre += max(0, reste) / CGFloat(l.count - 1) }
            case "a": let u = max(0, reste) / CGFloat(l.count); debut = u / 2; entre += u
            case "v": let u = max(0, reste) / CGFloat(l.count + 1); debut = u; entre += u
            default: break
            }
            // Les lignes de base, si des éléments s'alignent sur elles.
            var baseMax: CGFloat = 0
            var lignesDeBase: [Int: CGFloat] = [:]
            if !colonne {
                for k in l where (items[k].t?.as_ ?? aligneDefaut) == "l" {
                    let d = sub[items[k].i].dimensions(in: prop(items[k].taille, nil))
                    let b = d[.firstTextBaseline]
                    lignesDeBase[k] = b
                    baseMax = max(baseMax, b + items[k].m[0])
                }
            }
            var pos = debut
            for k in l {
                let it = items[k], ma = it.t?.ma
                let av = colonne ? it.m[0] : it.m[3], ap = colonne ? it.m[2] : it.m[1]
                if let ma, ma[colonne ? 0 : 3].auto { pos += parAuto }
                pos += av
                let debutC = colonne ? it.m[3] : it.m[0]
                var cpos = debutC
                switch it.t?.as_ ?? aligneDefaut {
                case "e": cpos = hl - it.ct - (colonne ? it.m[1] : it.m[2])
                case "c": cpos = (hl - it.ct - it.mc) / 2 + debutC
                case "l": cpos = baseMax - (lignesDeBase[k] ?? 0)
                default: break
                }
                let rect = colonne ? CGRect(x: cpos, y: pos, width: it.ct, height: it.taille) : CGRect(x: pos, y: cy + cpos, width: it.taille, height: it.ct)
                places.append((it.i, rect))
                pos += it.taille + ap + (k == l.last ? 0 : entre)
                if let ma, ma[colonne ? 2 : 1].auto { pos += parAuto }
            }
            largeurP = max(largeurP, utilise)
            hauteursLignes.append(hl)
            cy += hl + (nl < lignes.count - 1 ? ecartC : 0)
        }
        let croiseTotal = hauteursLignes.reduce(0, +) + CGFloat(max(0, hauteursLignes.count - 1)) * ecartC
        let contenu = colonne ? CGSize(width: croise ?? croiseTotal, height: principal ?? largeurP) : CGSize(width: principal ?? largeurP, height: croise ?? croiseTotal)
        return Disposition(contenu: contenu, places: places)
    }

    // ─── Grille ───
    private func grille(_ w: CGFloat?, _ h: CGFloat?, _ sub: Subviews, _ flot: [Int]) -> Disposition {
        let ecartC = (s.gc ?? 0) * x.z, ecartL = (s.gl ?? 0) * x.z
        var pistes = s.co ?? [PisteHumalis()]
        if let af = pistes.first?.af {
            let mini = af * x.z
            let n = max(1, Int(((w ?? mini) + ecartC) / (mini + ecartC)))
            pistes = Array(repeating: PisteHumalis(fr: 1), count: n)
        }
        if pistes.isEmpty { pistes = [PisteHumalis()] }
        let nc = pistes.count
        struct Case { var i: Int; var t: StyleHumalis?; var c: Int; var nc: Int; var l: Int; var nl: Int }
        var cases: [Case] = []
        var occupe = Set<[Int]>()
        var cl = 0, cc = 0
        for i in flot {
            let t = sub[i][CleItemHumalis.self]
            var debutC = t?.gcs.map { $0 - 1 }
            var nC = 1
            if let e = t?.gce {
                if e >= 1000 { nC = e / 1000 }
                else if e < 0 { nC = max(1, nc + e + 1 - (debutC ?? 0) + 0) + 0; if e == -1 { nC = nc - (debutC ?? 0) } }
                else { nC = max(1, e - 1 - (debutC ?? 0)) }
            }
            nC = min(nC, nc)
            let debutL = t?.grs.map { $0 - 1 }
            var nL = 1
            if let e = t?.gre { nL = e >= 1000 ? e / 1000 : max(1, e - 1 - (debutL ?? 0)) }
            var l = debutL ?? cl, c = debutC ?? cc
            if debutC == nil {
                while true {
                    if c + nC > nc { c = 0; l += 1; continue }
                    if (0..<nC).allSatisfy({ !occupe.contains([l, c + $0]) }) { break }
                    c += 1
                }
            } else if debutL == nil {
                while occupe.contains([l, c]) { l += 1 }
            }
            debutC = c
            for a in 0..<nL { for b in 0..<nC { occupe.insert([l + a, c + b]) } }
            cases.append(Case(i: i, t: t, c: c, nc: nC, l: l, nl: nL))
            if debutL == nil { cl = l; cc = c + nC }
        }
        // Les colonnes.
        var largeurs = [CGFloat](repeating: 0, count: nc)
        var totalFr: CGFloat = 0
        for (k, p) in pistes.enumerated() {
            if let m = p.m?.en(w, x) { largeurs[k] = m }
            else if let fr = p.fr { totalFr += fr }
        }
        func auto(_ k: Int) -> CGFloat { cases.filter { $0.c == k && $0.nc == 1 }.map { $0.t?.la?.en(nil, x) ?? sub[$0.i].sizeThatFits(.unspecified).width }.max() ?? 0 }
        for (k, p) in pistes.enumerated() where p.m == nil && p.fr == nil { largeurs[k] = auto(k) }
        let ecartsC = CGFloat(nc - 1) * ecartC
        if let w {
            let libre = w - ecartsC - largeurs.reduce(0, +)
            if totalFr > 0 {
                for (k, p) in pistes.enumerated() { if let fr = p.fr { largeurs[k] = max(0, libre) * fr / totalFr } }
            } else if libre > 0 {
                let autos = pistes.indices.filter { pistes[$0].m == nil }
                for k in autos { largeurs[k] += libre / CGFloat(autos.count) }
            }
        } else if totalFr > 0 {
            for (k, p) in pistes.enumerated() where p.fr != nil { largeurs[k] = auto(k) }
        }
        // Les rangées.
        let nl = (cases.map { $0.l + $0.nl }.max() ?? 0)
        let definies = s.ro ?? []
        var hauteurs = [CGFloat](repeating: 0, count: max(nl, definies.count))
        func largeurCase(_ c: Case) -> CGFloat { largeurs[c.c..<(c.c + c.nc)].reduce(0, +) + CGFloat(c.nc - 1) * ecartC }
        let ai = s.ai ?? "x"
        func tailleItem(_ c: Case, _ lc: CGFloat) -> CGSize {
            let j = c.t?.js ?? s.ji ?? "x"
            let fw = c.t?.la?.en(lc, x)
            if j == "x" || fw != nil {
                return sub[c.i].sizeThatFits(ProposedViewSize(width: fw ?? max(0, lc), height: c.t?.ha?.en(nil, x)))
            }
            var t = sub[c.i].sizeThatFits(ProposedViewSize(width: nil, height: c.t?.ha?.en(nil, x)))
            if t.width > lc { t = sub[c.i].sizeThatFits(ProposedViewSize(width: lc, height: c.t?.ha?.en(nil, x))) }
            return t
        }
        for k in hauteurs.indices {
            let p = k < definies.count ? definies[k] : PisteHumalis()
            if let m = p.m?.en(h, x) { hauteurs[k] = m; continue }
            if p.fr != nil && h != nil { continue }
            hauteurs[k] = cases.filter { $0.l == k && $0.nl == 1 }.map { c in
                let m = marges(c.t, w)
                return tailleItem(c, largeurCase(c)).height + m[0] + m[2]
            }.max() ?? 0
        }
        let ecartsL = CGFloat(max(0, hauteurs.count - 1)) * ecartL
        if let h {
            let frs = hauteurs.indices.filter { $0 < definies.count && definies[$0].fr != nil }
            let totalFrL = frs.reduce(0) { $0 + (definies[$1].fr ?? 0) }
            let libre = h - ecartsL - hauteurs.reduce(0, +)
            if totalFrL > 0 {
                for k in frs { hauteurs[k] = max(0, libre) * (definies[k].fr ?? 0) / totalFrL }
            } else if libre > 0, (s.ac ?? "x") == "x" {
                let autos = hauteurs.indices.filter { !($0 < definies.count && definies[$0].m != nil) }
                if !autos.isEmpty { for k in autos { hauteurs[k] += libre / CGFloat(autos.count) } }
            }
        }
        func position(_ tab: [CGFloat], _ e: CGFloat, _ k: Int) -> CGFloat { tab[0..<k].reduce(0, +) + CGFloat(k) * e }
        var places: [(Int, CGRect)] = []
        for c in cases {
            let lc = largeurCase(c)
            let hc = hauteurs[c.l..<(c.l + c.nl)].reduce(0, +) + CGFloat(c.nl - 1) * ecartL
            let m = marges(c.t, lc)
            let px = position(largeurs, ecartC, c.c), py = position(hauteurs, ecartL, c.l)
            let jS = c.t?.js ?? s.ji ?? "x", aS = c.t?.as_ ?? ai
            let dispoL = max(0, lc - m[1] - m[3]), dispoH = max(0, hc - m[0] - m[2])
            let fw = c.t?.la?.en(lc, x), fh = c.t?.ha?.en(hc, x)
            var tw = fw ?? dispoL, th = fh ?? dispoH
            var sansStyle = c.t == nil
            if c.t?.d == "block", c.t?.fo == nil, c.t?.bd == nil, false { sansStyle = true }
            if (jS != "x" && fw == nil) || sansStyle {
                var t = sub[c.i].sizeThatFits(ProposedViewSize(width: nil, height: fh))
                if t.width > dispoL { t = sub[c.i].sizeThatFits(ProposedViewSize(width: dispoL, height: fh)) }
                tw = t.width
                if sansStyle && aS == "x" { th = t.height }
            }
            if aS != "x" && fh == nil { th = sub[c.i].sizeThatFits(ProposedViewSize(width: tw, height: nil)).height }
            var ox = px + m[3], oy = py + m[0]
            let jx = sansStyle && jS == "x" ? (s.ta ?? "s") : jS
            switch jx { case "c": ox += (dispoL - tw) / 2; case "e": ox += dispoL - tw; default: break }
            switch aS { case "c": oy += (dispoH - th) / 2; case "e": oy += dispoH - th; default: break }
            places.append((c.i, CGRect(x: ox, y: oy, width: tw, height: th)))
        }
        let contenu = CGSize(width: w ?? (largeurs.reduce(0, +) + ecartsC), height: h ?? (hauteurs.reduce(0, +) + ecartsL))
        return Disposition(contenu: contenu, places: places)
    }

    // ─── Placement absolu : par rapport à la boîte, marges intérieures comprises ───
    private func placerAbsolus(_ sub: Subviews, _ places: inout [(Int, CGRect)], _ taille: CGSize, _ bd: [CGFloat], _ origine: CGPoint) {
        let bw = taille.width - bd[1] - bd[3], bh = taille.height - bd[0] - bd[2]
        for i in sub.indices {
            guard let t = sub[i][CleItemHumalis.self], t.estAbsolu, t.d != "none" else { continue }
            let g = t.le?.en(bw, x), d = t.ri?.en(bw, x), hh = t.to?.en(bh, x), b = t.bo?.en(bh, x)
            let m = marges(t, bw)
            var tw = t.la?.en(bw, x), th = t.ha?.en(bh, x)
            if tw == nil, let g, let d { tw = max(0, bw - g - d - m[1] - m[3]) }
            if th == nil, let hh, let b { th = max(0, bh - hh - b - m[0] - m[2]) }
            let mesure = sub[i].sizeThatFits(ProposedViewSize(width: tw, height: th))
            // Rétrécie à son contenu, comme un navigateur : arrondie au point supérieur, le texte ne se coupe pas.
            let w = tw ?? ceil(mesure.width), h = th ?? mesure.height
            let ox = g.map { $0 + m[3] + bd[3] } ?? d.map { bw - $0 - w - m[1] + bd[3] } ?? origine.x + m[3]
            let oy = hh.map { $0 + m[0] + bd[0] } ?? b.map { bh - $0 - h - m[2] + bd[0] } ?? origine.y + m[0]
            places.append((i, CGRect(x: ox, y: oy, width: w, height: h)))
        }
    }
}

struct PolygoneHumalis: Shape {
    let points: [[MesureHumalis]]
    let x: ContexteDessin
    func path(in r: CGRect) -> Path {
        var p = Path()
        for (i, pt) in points.enumerated() {
            let c = CGPoint(x: pt[0].en(r.width, x) ?? 0, y: pt[1].en(r.height, x) ?? 0)
            if i == 0 { p.move(to: c) } else { p.addLine(to: c) }
        }
        p.closeSubpath()
        return p
    }
}

struct DegradeJSON: Codable {
    struct Arret: Codable { var p: Double; var c: [Double] }
    var de: [Double]; var a: [Double]; var arrets: [Arret]
}
struct TraceJSON: Codable {
    struct R: Codable { var opacite: Double; var couleur: [Double]?; var degrade: DegradeJSON? }
    struct E: Codable { var epaisseur: Double; var opacite: Double; var couleur: [Double]?; var fixe: Bool? }
    var commandes: String
    var valeurs: [Double]
    var remplissage: R?
    var trait: E?
}
struct IconeJSON: Codable { var largeur: Double; var hauteur: Double; var traces: [TraceJSON]; var cadrage: String? }

private func chemin(_ t: TraceJSON, _ e: CGFloat, _ ey: CGFloat? = nil) -> Path {
    var p = Path(), i = 0
    func pt() -> CGPoint { defer { i += 2 }; return CGPoint(x: t.valeurs[i] * e, y: t.valeurs[i + 1] * (ey ?? e)) }
    for c in t.commandes {
        switch c {
        case "M": p.move(to: pt())
        case "L": p.addLine(to: pt())
        case "C": let a = pt(), b = pt(), f = pt(); p.addCurve(to: f, control1: a, control2: b)
        default: p.closeSubpath()
        }
    }
    return p
}

/** Une icône tracée : elle suit la couleur du texte, ou celle qu'on lui donne. */
struct IconeTraceeHumalis: View {
    let icone: IconeJSON
    var couleur: Color?
    var body: some View {
        Canvas { ctx, taille in
            // Comme « preserveAspectRatio » : tout voir (meet), couvrir (slice) ou étirer (none).
            let ex = taille.width / icone.largeur, ey = taille.height / icone.hauteur
            let e = icone.cadrage == "couvre" ? max(ex, ey) : min(ex, ey)
            let etire = icone.cadrage == "etire"
            if !etire { ctx.translateBy(x: (taille.width - icone.largeur * e) / 2, y: (taille.height - icone.hauteur * e) / 2) }
            let encre: GraphicsContext.Shading = couleur.map { .color($0) } ?? .foreground
            for t in icone.traces {
                let p = etire ? chemin(t, ex, ey) : chemin(t, e)
                if let r = t.remplissage {
                    var c = ctx; c.opacity = r.opacite
                    if let g = r.degrade {
                        // Les proportions du dégradé se lisent dans la boîte de la forme.
                        let b = p.boundingRect
                        let arrets = g.arrets.map { Gradient.Stop(color: $0.c.couleurHumalis, location: $0.p) }
                        c.fill(p, with: .linearGradient(Gradient(stops: arrets), startPoint: CGPoint(x: b.minX + g.de[0] * b.width, y: b.minY + g.de[1] * b.height), endPoint: CGPoint(x: b.minX + g.a[0] * b.width, y: b.minY + g.a[1] * b.height)))
                    } else {
                        c.fill(p, with: r.couleur.map { .color($0.couleurHumalis) } ?? encre)
                    }
                }
                if let s = t.trait {
                    var c = ctx; c.opacity = s.opacite
                    let largeur = s.fixe == true ? s.epaisseur : s.epaisseur * (etire ? min(ex, ey) : e)
                    c.stroke(p, with: s.couleur.map { .color($0.couleurHumalis) } ?? encre, style: StrokeStyle(lineWidth: largeur, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

struct IconeDessineeHumalis: View {
    let nom: String
    var body: some View {
        if let i = IconesDessinees.table[nom] { IconeTraceeHumalis(icone: i) }
    }
}

/** Le fond, les bordures et les ombres d'une boîte, dessinés comme un navigateur. */
private struct DecorHumalis: View {
    let s: StyleHumalis
    let x: ContexteDessin
    @Environment(\.displayScale) private var pixels

    private func forme(_ r: CGFloat = 0) -> UnevenRoundedRectangle {
        let a = (s.ar ?? [0, 0, 0, 0]).map { max(0, $0 * x.z - r) }
        return UnevenRoundedRectangle(topLeadingRadius: a[0], bottomLeadingRadius: a[3], bottomTrailingRadius: a[2], topTrailingRadius: a[1], style: .circular)
    }
    /** Comme un navigateur : une épaisseur tombe sur un pixel entier, jamais à zéro. */
    private func ep(_ v: CGFloat) -> CGFloat { max(1 / pixels, floor(v * x.z * pixels) / pixels) }

    var body: some View {
        ZStack {
            ForEach(Array((s.om ?? []).enumerated()).filter { $0.element.i != true }, id: \.offset) { _, o in
                forme().fill(o.c.couleurHumalis).padding(-o.e * x.z).shadow(color: o.c.couleurHumalis, radius: o.f * x.z / 2, x: o.x * x.z, y: o.y * x.z)
                    .mask(alignment: .center) { Rectangle().padding(-400).overlay { forme().blendMode(.destinationOut) }.compositingGroup() }
            }
            if let ic = s.ic, ic < IconesDessinees.masques.count {
                IconeTraceeHumalis(icone: IconesDessinees.masques[ic], couleur: (s.fo?.first?.c ?? s.c ?? [0, 0, 0, 1]).couleurHumalis)
            } else if let fo = s.fo, !fo.isEmpty {
                if fo.count == 1, let c = fo[0].c { forme().fill(c.couleurHumalis) }
                else { Canvas { ctx, t in dessiner(&ctx, t, fo) }.clipShape(forme()) }
            }
            // Une image de fond SVG : par-dessus la couleur, sous le contenu, avec ses propres couleurs.
            if let fi = s.fi, fi < IconesDessinees.masques.count {
                IconeTraceeHumalis(icone: IconesDessinees.masques[fi]).clipShape(forme())
            }
            ForEach(Array((s.om ?? []).enumerated()).filter { $0.element.i == true && $0.element.f == 0 }, id: \.offset) { _, o in
                forme().strokeBorder(o.c.couleurHumalis, lineWidth: o.e * x.z)
            }
            bordures
        }
    }

    @ViewBuilder private var bordures: some View {
        if let bd = s.bd {
            if bd.allSatisfy({ $0 != nil && $0?.e == bd[0]?.e && $0?.c == bd[0]?.c }), let b = bd[0] {
                forme().strokeBorder(b.c.couleurHumalis, lineWidth: ep(b.e))
            } else {
                ZStack {
                    if let b = bd[0] { Rectangle().fill(b.c.couleurHumalis).frame(height: ep(b.e)).frame(maxHeight: .infinity, alignment: .top) }
                    if let b = bd[1] { Rectangle().fill(b.c.couleurHumalis).frame(width: ep(b.e)).frame(maxWidth: .infinity, alignment: .trailing) }
                    if let b = bd[2] { Rectangle().fill(b.c.couleurHumalis).frame(height: ep(b.e)).frame(maxHeight: .infinity, alignment: .bottom) }
                    if let b = bd[3] { Rectangle().fill(b.c.couleurHumalis).frame(width: ep(b.e)).frame(maxWidth: .infinity, alignment: .leading) }
                }
            }
        }
    }

    private func degrade(_ a: [ArretHumalis]) -> Gradient { Gradient(stops: a.map { .init(color: $0.c.couleurHumalis, location: min(1, max(0, $0.p))) }) }

    private func dessiner(_ ctx: inout GraphicsContext, _ t: CGSize, _ fo: [FondHumalis]) {
        let toute = Path(CGRect(origin: .zero, size: t))
        for f in fo {
            if let c = f.c { ctx.fill(toute, with: .color(c.couleurHumalis)) }
            else if let l = f.l {
                let a = l.a * .pi / 180
                let long = abs(t.width * sin(a)) + abs(t.height * cos(a))
                let c = CGPoint(x: t.width / 2, y: t.height / 2)
                let dx = sin(a) * long / 2, dy = cos(a) * long / 2
                ctx.fill(toute, with: .linearGradient(degrade(l.s), startPoint: CGPoint(x: c.x - dx, y: c.y + dy), endPoint: CGPoint(x: c.x + dx, y: c.y - dy)))
            } else if let r = f.r {
                var c = ctx
                let rx = max(0.1, t.width * r.rx / 100), ry = max(0.1, t.height * r.ry / 100)
                let cx = t.width * r.x / 100, cy = t.height * r.y / 100
                c.translateBy(x: cx, y: cy)
                c.scaleBy(x: 1, y: ry / rx)
                let grand = CGRect(x: -cx - 10, y: (-cy - 10) * rx / ry, width: t.width + 20, height: (t.height + 20) * rx / ry)
                c.fill(Path(grand), with: .radialGradient(degrade(r.s), center: .zero, startRadius: 0, endRadius: rx))
            }
        }
    }
}

/** Une boîte CSS : sa mise en page, puis ce qui la décore. */
struct BoiteHumalis<Contenu: View>: View {
    let s: StyleHumalis
    @ViewBuilder let contenu: () -> Contenu
    @Environment(\.echelleHumalis) private var z
    @Environment(\.vueHumalis) private var vue
    @Environment(\.fondEtenduHumalis) private var fondEtendu

    init(_ s: StyleHumalis, @ViewBuilder contenu: @escaping () -> Contenu) {
        self.s = s
        self.contenu = contenu
    }

    private var x: ContexteDessin { ContexteDessin(z: z, vue: vue) }

    @ViewBuilder private var corps: some View {
        if s.sc == true {
            ScrollView(.vertical) {
                LayoutBoiteHumalis(s: { var t = s; t.ha = nil; t.hm = nil; t.hM = nil; return t }(), x: x) { contenu().environment(\.fondEtenduHumalis, false) }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .scrollIndicators(.never)
            .scrollClipDisabled()
        } else {
            LayoutBoiteHumalis(s: s, x: x) { contenu().environment(\.fondEtenduHumalis, false) }
        }
    }

    private var forme: UnevenRoundedRectangle {
        let a = (s.ar ?? [0, 0, 0, 0]).map { $0 * z }
        return UnevenRoundedRectangle(topLeadingRadius: a[0], bottomLeadingRadius: a[3], bottomTrailingRadius: a[2], topTrailingRadius: a[1], style: .circular)
    }

    var body: some View {
        if s.d != "none" { boite }
    }

    private var boite: some View {
        corps
            .modifier(CoupeHumalis(actif: s.oh == true, forme: forme))
            .background { DecorHumalis(s: s, x: x).ignoresSafeArea(.container, edges: fondEtendu ? .vertical : []) }
            .modifier(PolygoneCoupe(points: s.po, x: x))
            .opacity(s.cach == true ? 0 : (s.op ?? 1))
            .rotationEffect(.degrees(s.ro2 ?? 0))
            .allowsHitTesting(s.cach != true)
    }
}

private struct CoupeHumalis: ViewModifier {
    let actif: Bool
    let forme: UnevenRoundedRectangle
    func body(content: Content) -> some View { if actif { content.clipShape(forme) } else { content } }
}
private struct PolygoneCoupe: ViewModifier {
    let points: [[MesureHumalis]]?
    let x: ContexteDessin
    func body(content: Content) -> some View {
        if let points { content.clipShape(PolygoneHumalis(points: points, x: x)).contentShape(PolygoneHumalis(points: points, x: x)) } else { content }
    }
}

private func graisseHumalis(_ g: Double) -> Font.Weight {
    switch g {
    case ..<150: return .ultraLight
    case ..<250: return .thin
    case ..<350: return .light
    case ..<450: return .regular
    case ..<550: return .medium
    case ..<650: return .semibold
    case ..<750: return .bold
    case ..<850: return .heavy
    default: return .black
    }
}

/** Le texte : police, graisse, couleur, interligne, à l'échelle. */
struct StyleTexteHumalis: ViewModifier {
    let s: StyleHumalis
    @Environment(\.echelleHumalis) private var z
    init(_ s: StyleHumalis) { self.s = s }

    private var naturelle: CGFloat {
        let t = (s.t ?? 16) * z
        #if os(macOS)
        let p = s.f.flatMap { NSFont(name: PolicesHumalis.vrai($0), size: t) } ?? NSFont.systemFont(ofSize: t)
        return p.ascender - p.descender + p.leading
        #else
        let p = s.f.flatMap { UIFont(name: PolicesHumalis.vrai($0), size: t) } ?? UIFont.systemFont(ofSize: t)
        return p.lineHeight
        #endif
    }

    @ViewBuilder func body(content: Content) -> some View {
        // « font-size: 0 » : le texte reste pour le lecteur d'écran, mais ne prend aucune place.
        if (s.t ?? 16) <= 0 { content.frame(width: 0, height: 0).opacity(0) } else { texte(content) }
    }

    private func texte(_ content: Content) -> some View {
        let t = (s.t ?? 16) * z
        let base: Font = s.f.map { .custom(PolicesHumalis.vrai($0), fixedSize: t) } ?? .system(size: t)
        var police = base.weight(graisseHumalis(s.g ?? 400))
        if s.it == true { police = police.italic() }
        if s.nb == true { police = police.monospacedDigit() }
        let voulue: CGFloat? = s.lp.map { $0 * z } ?? s.li.map { $0 * t }
        let ecart = voulue.map { $0 - naturelle } ?? 0
        return content
            .font(police)
            .foregroundStyle((s.c ?? [0, 0, 0, 1]).couleurHumalis)
            .tracking((s.tr ?? 0) * z)
            .lineSpacing(max(0, ecart))
            .textCase(s.cas == "u" ? .uppercase : s.cas == "l" ? .lowercase : nil)
            .multilineTextAlignment(s.ta == "c" ? .center : s.ta == "e" ? .trailing : .leading)
            .lineLimit(s.nw == true || s.el == true ? 1 : nil)
            .truncationMode(.tail)
            .padding(.vertical, ecart / 2)
    }
}

#if os(macOS)
/** Comme une maquette : pas de titre, le contenu passe sous les trois boutons. */
private struct FenetreDessineeHumalis: NSViewRepresentable {
    final class Vue: NSView {
        func regler() {
            guard let f = window else { return }
            f.titleVisibility = .hidden
            f.titlebarAppearsTransparent = true
            f.styleMask.insert(.fullSizeContentView)
            f.titlebarSeparatorStyle = .none
        }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            regler()
        }
    }
    func makeNSView(context: Context) -> Vue { Vue() }
    // SwiftUI remet le titre à chaque changement de page.
    func updateNSView(_ v: Vue, context: Context) { DispatchQueue.main.async { v.regler() } }
}
#endif

#if os(macOS)
/** Sur les Mac récents, le titre de la fenêtre se montre malgré « titleVisibility ». */
private struct SansTitreHumalis: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) { content.toolbar(removing: .title) } else { content }
    }
}
#endif

func couleurHumalis(_ s: StyleHumalis) -> Color { (s.c ?? [0, 0, 0, 1]).couleurHumalis }

func echelleDessinHumalis(_ t: CGSize, _ l: CGFloat, _ h: CGFloat) -> CGFloat { max(0.5, min(t.width / l, t.height / h)) }

/**
 * Une page dessinée. Sur Mac : toute la place, à l'échelle de la fenêtre.
 * Sur iPhone et iPad : comme Safari, un pixel CSS pour un point, les « @media » suivant la largeur
 * de l'écran ; le contenu reste dans la zone sûre, le fond passe dessous, la page défile.
 */
struct PageDessineeHumalis<Contenu: View>: View {
    let largeur: CGFloat
    let hauteur: CGFloat
    var fond: StyleHumalis = .racine
    @ViewBuilder let contenu: () -> Contenu
    @Environment(\.echelleFenetreHumalis) private var fenetre
    @Environment(\.colorScheme) private var theme
    #if os(macOS)
    var body: some View {
        GeometryReader { g in
            // Dans la coquille, c'est la fenêtre entière qui choisit la variante.
            let _ = fenetre == nil ? VarianteDessinHumalis.commune.regler(g.size.width, theme == .dark) : ()
            BoiteHumalis(StyleHumalis.racine) { contenu() }
                .environment(\.echelleHumalis, fenetre ?? echelleDessinHumalis(g.size, largeur, hauteur))
                .environment(\.vueHumalis, g.size)
                .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
        }
        .ignoresSafeArea()
        .background(FenetreDessineeHumalis())
        .toolbarBackground(.hidden, for: .windowToolbar)
        .modifier(SansTitreHumalis())
        .background { GeometryReader { g in Color.clear.modifier(SuiviVarianteHumalis(index: VarianteDessinHumalis.indexPour(g.size.width, theme == .dark))) } }
    }
    #else
    var body: some View {
        GeometryReader { g in
            let _ = fenetre == nil ? VarianteDessinHumalis.commune.regler(g.size.width, theme == .dark) : ()
            ScrollView(.vertical) {
                BoiteHumalis(StyleHumalis.racine) { contenu() }
                    .environment(\.echelleHumalis, 1)
                    .environment(\.vueHumalis, g.size)
                    .frame(width: g.size.width, alignment: .topLeading)
                    .frame(minHeight: g.size.height, alignment: .topLeading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background { BoiteHumalis(fond) { EmptyView() }.ignoresSafeArea() }
        .background { GeometryReader { g in Color.clear.modifier(SuiviVarianteHumalis(index: VarianteDessinHumalis.indexPour(g.size.width, theme == .dark))) } }
        .toolbar(.hidden, for: .navigationBar)
    }
    #endif
}

/** La barre latérale écrite comme une page, à côté de la pile des pages (Mac, et iPad en grand). */
struct CoquilleDessineeHumalis<Barre: View, Contenu: View>: View {
    let largeur: CGFloat
    let hauteur: CGFloat
    let sansBarre: Bool
    @ViewBuilder let barre: () -> Barre
    @ViewBuilder let contenu: () -> Contenu
    @Environment(\.colorScheme) private var theme
    var body: some View {
        GeometryReader { g in
            #if os(macOS)
            let z = echelleDessinHumalis(g.size, largeur, hauteur)
            #else
            let z: CGFloat = 1
            #endif
            let _ = VarianteDessinHumalis.commune.regler(g.size.width, theme == .dark)
            BoiteHumalis(StyleHumalis.lire(#"{"d":"flex","ai":"x"}"#)) {
                // Sur iPad, le fond de la barre passe sous l'heure et sous la barre du bas ; son contenu, non.
                if !sansBarre { barre().environment(\.fondEtenduHumalis, true) }
                contenu()
                    .environment(\.echelleFenetreHumalis, z)
                    .itemHumalis(StyleHumalis.lire(#"{"fg":1,"fs":1,"fb":{"c":0}}"#))
            }
            .environment(\.echelleHumalis, z)
            .environment(\.vueHumalis, g.size)
            .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
            .modifier(SuiviVarianteHumalis(index: VarianteDessinHumalis.indexPour(g.size.width, theme == .dark)))
        }
        #if os(macOS)
        .ignoresSafeArea()
        .background(FenetreDessineeHumalis())
        .focusEffectDisabled()
        #endif
    }
}
`;

/** Les tables propres au projet : les icônes, puis les styles rencontrés. */
export function tablesDessin(icones: IconeDessinee[], masques: IconeDessinee[], styles: string): string {
  const json = (i: IconeDessinee) => JSON.stringify({ largeur: i.largeur, hauteur: i.hauteur, traces: i.traces, ...(i.cadrage ? { cadrage: i.cadrage } : {}) });
  const lire = (i: IconeDessinee) => `lire(#"${json(i)}"#)`;
  return `
enum IconesDessinees {
    private static func lire(_ j: String) -> IconeJSON { try! JSONDecoder().decode(IconeJSON.self, from: Data(j.utf8)) }
    static let table: [String: IconeJSON] = [${icones.map((i) => `\n        ${JSON.stringify(i.nom)}: ${lire(i)},`).join('')}${icones.length ? '\n    ' : ':'}]
    static let masques: [IconeJSON] = [${masques.map((i) => `\n        ${lire(i)},`).join('')}${masques.length ? '\n    ' : ''}]
}

${styles}`;
}
