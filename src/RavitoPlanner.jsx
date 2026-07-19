import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, Trash2, Flame, Clock, AlertTriangle, Check, Timer,
  ChevronUp, ChevronDown, RotateCcw, Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Calculateur de nutrition sportive — POC (glucides + électrolytes)
 *
 * Les glucides pilotent l'intervalle unique et la séquence ordonnée :
 *   T = 60 * (glucides moyens / dose) / cible_glucides
 * Chaque produit porte un profil complet (glucides, Na, K, Mg, Ca).
 * La séquence délivre aussi les électrolytes → couverture par nutriment.
 * Les produits sans glucides sont des compléments espacés régulièrement.
 * ------------------------------------------------------------------ */

const C = {
  ink: "#0F1620", panel: "#17212E", panel2: "#1D2A38", line: "#26333F",
  text: "#E8EEF2", muted: "#8A9BA8", ideal: "#4FD1C5", bad: "#FF5C6C", good: "#5AD19A",
};

// Nutriments : source unique de vérité (inputs, légende, cibles, couverture)
const NUTRIENTS = [
  { key: "carbs", label: "Glucides", short: "Glu", unit: "g", color: "#FFB020", def: "60" },
  { key: "sodium", label: "Sodium", short: "Na", unit: "mg", color: "#4EA8FF", def: "500" },
  { key: "potassium", label: "Potassium", short: "K", unit: "mg", color: "#B98BFF", def: "200" },
  { key: "magnesium", label: "Magnésium", short: "Mg", unit: "mg", color: "#48D597", def: "50" },
  { key: "calcium", label: "Calcium", short: "Ca", unit: "mg", color: "#FF7AA2", def: "25" },
];
const ELEC = NUTRIENTS.filter((n) => n.key !== "carbs");

const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const int = (v) => Math.max(0, Math.round(num(v)));
const round1 = (x) => Math.round(x * 10) / 10;
const fmtClock = (min) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return `${h}:${String(m).padStart(2, "0")}`; };
const electroSum = (p) => ELEC.reduce((s, n) => s + num(p[n.key]), 0);

const defaultTargets = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.def]));
const mkProduct = (o) => ({ id: uid(), name: "", carbs: "", sodium: "", potassium: "", magnesium: "", calcium: "", qty: "1", ...o });

export default function RavitoPlanner() {
  const [targets, setTargets] = useState(defaultTargets);
  const [durH, setDurH] = useState("3");
  const [durM, setDurM] = useState("0");
  const [rounded, setRounded] = useState(false);
  const [mode, setMode] = useState("simple"); // "simple" = glucides seuls · "advanced" = + électrolytes
  const [products, setProducts] = useState([
    mkProduct({ name: "Gel", carbs: "25", sodium: "40", potassium: "10", magnesium: "3", calcium: "0", qty: "4" }),
    mkProduct({ name: "Barre", carbs: "40", sodium: "60", potassium: "40", magnesium: "10", calcium: "20", qty: "2" }),
    mkProduct({ name: "Boisson (dose)", carbs: "30", sodium: "200", potassium: "50", magnesium: "12", calcium: "10", qty: "3" }),
    mkProduct({ name: "Capsule de sel", carbs: "0", sodium: "300", potassium: "40", magnesium: "25", calcium: "10", qty: "3" }),
  ]);
  const [manual, setManual] = useState({ sig: null, ids: null });

  const addProduct = () => setProducts((p) => [...p, mkProduct({ name: "" })]);
  const removeProduct = (id) => setProducts((p) => p.filter((x) => x.id !== id));
  const patch = (id, key, val) => setProducts((p) => p.map((x) => (x.id === id ? { ...x, [key]: val } : x)));
  const setTarget = (key, val) => setTargets((t) => ({ ...t, [key]: val }));

  // Affichage : le mode simplifié ne montre que les glucides, le mode avancé ajoute
  // les électrolytes. Les calculs (base/plan) restent inchangés dans les deux modes.
  const showElectro = mode === "advanced";
  const visibleNutrients = showElectro ? NUTRIENTS : NUTRIENTS.filter((n) => n.key === "carbs");
  const cols = (n) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` });

  /* ---------- Base : intervalle + séquence pilotés par les glucides ---------- */
  const base = useMemo(() => {
    const cible = num(targets.carbs);
    const durMin = int(durH) * 60 + int(durM);
    const durHours = durMin / 60;

    // Une "unité" par exemplaire, avec profil complet
    const allUnits = [];
    products.forEach((p) => {
      const q = int(p.qty);
      const profile = Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(p[n.key])]));
      for (let i = 0; i < q; i++) allUnits.push({ id: `${p.id}#${i}`, name: p.name.trim() || "Produit", ...profile });
    });
    const carbUnits = allUnits.filter((u) => u.carbs > 0);
    const complementUnits = allUnits.filter((u) => u.carbs <= 0 && (u.sodium + u.potassium + u.magnesium + u.calcium) > 0);

    const dispoCarbs = carbUnits.reduce((s, u) => s + u.carbs, 0);
    if (cible <= 0 || durMin <= 0 || carbUnits.length === 0 || dispoCarbs <= 0)
      return { invalid: true, durMin, hasCarbSource: carbUnits.length > 0 && dispoCarbs > 0 };

    const Nc = carbUnits.length;
    const moyenne = dispoCarbs / Nc;
    const besoin = cible * durHours;
    const faisable = dispoCarbs >= besoin - 1e-9;
    const Texact = (60 * moyenne) / cible;
    const Tround = Math.max(5, Math.round(Texact / 5) * 5);
    const T = rounded ? Tround : Texact;

    let k = faisable ? Math.round(besoin / moyenne) : Nc;
    k = Math.min(Nc, Math.max(1, k));

    // Sélection + ordre optimisés (glouton, colle à la ligne cible glucides)
    const remaining = carbUnits.map((u) => ({ ...u }));
    const perStep = (cible * T) / 60;
    const optIds = [];
    let cum = 0;
    for (let step = 0; step < k; step++) {
      const wanted = (step + 1) * perStep - cum;
      let best = 0, bestErr = Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const err = Math.abs(remaining[j].carbs - wanted);
        if (err < bestErr) { bestErr = err; best = j; }
      }
      const chosen = remaining.splice(best, 1)[0];
      cum += chosen.carbs;
      optIds.push(chosen.id);
    }
    const scheduled = new Set(optIds);
    const carbSurplus = carbUnits.filter((u) => !scheduled.has(u.id));
    const byId = Object.fromEntries(allUnits.map((u) => [u.id, u]));

    // Compléments électrolytes regroupés par produit (cadence propre)
    const complements = products
      .filter((p) => num(p.carbs) <= 0 && electroSum(p) > 0 && int(p.qty) > 0)
      .map((p) => ({
        id: p.id, name: p.name.trim() || "Produit", qty: int(p.qty),
        spacing: durMin / int(p.qty),
        profile: Object.fromEntries(ELEC.map((n) => [n.key, num(p[n.key])])),
      }));

    const sig = JSON.stringify({
      cible, durMin, rounded,
      items: products.map((p) => ({ c: num(p.carbs), q: int(p.qty), n: p.name.trim() })),
    });

    return {
      invalid: false, cible, durMin, durHours, Nc, dispoCarbs, moyenne, besoin, faisable,
      Texact, Tround, T, perStep, k, optIds, carbSurplus, complementUnits, complements, byId, sig,
    };
  }, [targets.carbs, durH, durM, rounded, products]);

  const manualActive =
    !base.invalid && manual.sig === base.sig && Array.isArray(manual.ids) &&
    manual.ids.length === base.optIds.length;
  const effectiveIds = base.invalid ? [] : manualActive ? manual.ids : base.optIds;

  /* ---------- Plan : séquence + couverture par nutriment ---------- */
  const plan = useMemo(() => {
    if (base.invalid) return { invalid: true };
    const { T, cible, perStep, byId, durHours, complementUnits } = base;

    const devOf = (ids) => {
      let cum = 0, s = 0;
      ids.forEach((id, step) => { cum += byId[id].carbs; s += Math.abs(cum - (step + 1) * perStep); });
      return ids.length ? s / ids.length : 0;
    };

    const rows = [];
    const chart = [{ t: 0, real: 0, ideal: 0 }];
    let cumC = 0;
    effectiveIds.forEach((id, step) => {
      const u = byId[id];
      const atMin = step * T;
      const idealAt = round1((cible * atMin) / 60);
      chart.push({ t: atMin, real: round1(cumC), ideal: idealAt });
      cumC += u.carbs;
      chart.push({ t: atMin, real: round1(cumC), ideal: idealAt });
      rows.push({ num: step + 1, id, name: u.name, carbs: u.carbs, atMin, cum: cumC });
    });
    const coverMin = effectiveIds.length * T;
    chart.push({ t: coverMin, real: round1(cumC), ideal: round1((cible * coverMin) / 60) });

    // Totaux par nutriment : doses glucidiques programmées + compléments
    const totals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));
    effectiveIds.forEach((id) => NUTRIENTS.forEach((n) => (totals[n.key] += byId[id][n.key] || 0)));
    complementUnits.forEach((u) => NUTRIENTS.forEach((n) => (totals[n.key] += u[n.key] || 0)));

    const coverage = NUTRIENTS.map((n) => {
      const total = totals[n.key];
      const rate = durHours > 0 ? total / durHours : 0;
      const target = num(targets[n.key]);
      const need = target * durHours;
      return { ...n, total, rate, target, need, met: total >= need - 1e-9, delta: rate - target };
    });

    return {
      invalid: false, rows, chart, coverMin,
      meanDev: devOf(effectiveIds), optDev: devOf(base.optIds),
      carbRate: durHours > 0 ? totals.carbs / durHours : cible,
      coverage,
    };
  }, [base, effectiveIds, targets]);

  const move = (index, dir) => {
    const ids = [...effectiveIds];
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setManual({ sig: base.sig, ids });
  };
  const resetOrder = () => setManual({ sig: null, ids: null });

  return (
    <div style={{ background: C.ink, color: C.text }} className="min-h-screen w-full">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <header className="mb-7">
          <div className="font-mono text-xs tracking-[0.25em] uppercase mb-2" style={{ color: C.muted }}>
            Plan de ravitaillement
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
            Un seul intervalle. Le bon ordre.
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            {showElectro
              ? "Glucides et électrolytes. Les glucides fixent la cadence ; on vérifie la couverture de chaque nutriment sur la durée d'effort."
              : "Les glucides fixent la cadence : un seul intervalle, dans le bon ordre."}
          </p>
        </header>

        {/* Sélecteur de mode */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Seg active={mode === "simple"} onClick={() => setMode("simple")}>Simplifié</Seg>
          <Seg active={mode === "advanced"} onClick={() => setMode("advanced")}>Avancé</Seg>
          <span className="font-mono text-[11px] ml-1" style={{ color: C.muted }}>
            {showElectro ? "glucides + électrolytes" : "glucides seuls"}
          </span>
        </div>

        {/* Cibles par nutriment */}
        <section className="rounded-xl border p-4 mb-3" style={{ background: C.panel, borderColor: C.line }}>
          <div className="font-mono text-xs tracking-[0.2em] uppercase mb-3" style={{ color: C.muted }}>
            Cibles par heure
          </div>
          <div className="grid gap-2" style={cols(visibleNutrients.length)}>
            {visibleNutrients.map((n) => (
              <label key={n.key} className="flex flex-col min-w-0">
                <span className="font-mono text-[11px] mb-1 truncate" style={{ color: n.color }}>
                  {n.short} <span style={{ color: C.muted }}>{n.unit}/h</span>
                </span>
                <input
                  value={targets[n.key]}
                  onChange={(e) => setTarget(n.key, e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg px-2 py-2 text-sm text-center font-mono outline-none min-w-0"
                  style={{ background: C.panel2, color: C.text }}
                />
              </label>
            ))}
          </div>
        </section>

        {/* Durée */}
        <section className="rounded-xl border p-4 mb-3" style={{ background: C.panel, borderColor: C.line }}>
          <div className="font-mono text-xs tracking-[0.2em] uppercase mb-2" style={{ color: C.muted }}>
            Durée d'effort
          </div>
          <div className="flex items-baseline gap-2">
            <BigInput value={durH} onChange={setDurH} width="w-16" />
            <span className="font-mono text-sm" style={{ color: C.muted }}>h</span>
            <BigInput value={durM} onChange={setDurM} width="w-16" />
            <span className="font-mono text-sm" style={{ color: C.muted }}>min</span>
          </div>
        </section>

        {/* Produits */}
        <section className="rounded-xl border p-4 mb-6" style={{ background: C.panel, borderColor: C.line }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: C.muted }}>
              Produits en stock
            </div>
          </div>
          {/* Légende couleurs */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            {visibleNutrients.map((n) => (
              <span key={n.key} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: n.color }} />
                {n.label} <span className="font-mono">({n.unit})</span>
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {products.map((p) => {
              const onlyElectro = num(p.carbs) <= 0 && electroSum(p) > 0;
              return (
                <div key={p.id} className="rounded-lg border p-3" style={{ background: C.panel2, borderColor: C.line }}>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={p.name}
                      onChange={(e) => patch(p.id, "name", e.target.value)}
                      placeholder="Gel, barre, capsule de sel…"
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: C.ink, color: C.text }}
                    />
                    {showElectro && onlyElectro && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-1 rounded" style={{ color: C.ideal, background: C.ink }}>
                        <Zap size={11} /> élec.
                      </span>
                    )}
                    <label className="flex items-center gap-1">
                      <span className="text-[11px]" style={{ color: C.muted }}>×</span>
                      <input
                        value={p.qty}
                        onChange={(e) => patch(p.id, "qty", e.target.value)}
                        inputMode="numeric"
                        className="w-14 rounded-lg px-2 py-2 text-sm text-right font-mono outline-none"
                        style={{ background: C.ink, color: C.text }}
                      />
                    </label>
                    <button
                      onClick={() => removeProduct(p.id)}
                      className="w-8 h-8 grid place-items-center rounded-lg shrink-0"
                      style={{ color: C.muted }}
                      aria-label="Supprimer le produit"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid gap-1.5" style={cols(visibleNutrients.length)}>
                    {visibleNutrients.map((n) => (
                      <label key={n.key} className="flex flex-col min-w-0">
                        <span className="font-mono text-[10px] mb-0.5 truncate" style={{ color: n.color }}>{n.short}</span>
                        <input
                          value={p[n.key]}
                          onChange={(e) => patch(p.id, n.key, e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          className="w-full rounded-md px-1.5 py-1.5 text-sm text-center font-mono outline-none min-w-0"
                          style={{ background: C.ink, color: C.text }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addProduct}
            className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border"
            style={{ borderColor: C.line, color: C.text }}
          >
            <Plus size={16} /> Ajouter un produit
          </button>
        </section>

        {/* Résultat */}
        {base.invalid ? (
          <EmptyState hasCarbSource={base.hasCarbSource} />
        ) : (
          <section>
            {/* Faisabilité glucides */}
            <CarbFeasibility base={base} plan={plan} />

            {/* Hero intervalle */}
            <div className="rounded-xl border p-4 mt-3" style={{ background: C.panel, borderColor: C.line }}>
              <div className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] uppercase mb-2" style={{ color: C.muted }}>
                <Timer size={16} style={{ color: NUTRIENTS[0].color }} /> Intervalle glucides
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-5xl font-semibold" style={{ color: NUTRIENTS[0].color }}>{round1(base.T)}</span>
                <span className="font-mono text-sm" style={{ color: C.muted }}>min</span>
                <span className="font-mono text-xs ml-2" style={{ color: C.muted }}>
                  {base.k} dose{base.k > 1 ? "s" : ""} · couvre {fmtClock(plan.coverMin)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Seg active={!rounded} onClick={() => setRounded(false)}>Exact ({round1(base.Texact)})</Seg>
                <Seg active={rounded} onClick={() => setRounded(true)}>Arrondi ({base.Tround})</Seg>
              </div>
            </div>

            {/* Couverture par nutriment */}
            <div className="rounded-xl border p-4 mt-3" style={{ background: C.panel, borderColor: C.line }}>
              <div className="font-mono text-xs tracking-[0.2em] uppercase mb-3" style={{ color: C.muted }}>
                Couverture sur {fmtClock(base.durMin)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {plan.coverage
                  .filter((c) => showElectro || c.key === "carbs")
                  .map((c) => (
                    <Coverage key={c.key} c={c} />
                  ))}
              </div>
            </div>

            {/* Courbe glucides */}
            <div className="rounded-xl border p-4 mt-3" style={{ background: C.panel, borderColor: C.line }}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: C.muted }}>Glucides cumulés</div>
                <Legend />
              </div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={plan.chart} margin={{ top: 6, right: 8, bottom: 6, left: -12 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={fmtClock} stroke={C.muted} tick={{ fontSize: 11, fontFamily: "monospace", fill: C.muted }} />
                    <YAxis stroke={C.muted} tick={{ fontSize: 11, fontFamily: "monospace", fill: C.muted }} />
                    <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: "monospace", fontSize: 12, color: C.text }} labelFormatter={(t) => `à ${fmtClock(t)}`} formatter={(v, n) => [`${v} g`, n === "real" ? "réel" : "cible"]} />
                    <Line type="linear" dataKey="ideal" stroke={C.ideal} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line type="linear" dataKey="real" stroke={NUTRIENTS[0].color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[11px] font-mono" style={{ color: C.muted }}>
                Écart moyen au débit constant : <span style={{ color: plan.meanDev <= plan.optDev + 1e-6 ? C.good : NUTRIENTS[0].color }}>{round1(plan.meanDev)} g</span>
                {manualActive && <> · optimisé {round1(plan.optDev)} g</>}
              </div>
            </div>

            {/* Séquence glucides réordonnable */}
            <div className="rounded-xl border mt-3 overflow-hidden" style={{ background: C.panel, borderColor: C.line }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.line }}>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: C.muted }} />
                  <span className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: C.muted }}>Séquence · 1 dose / {round1(base.T)} min</span>
                </div>
                {manualActive && (
                  <button onClick={resetOrder} className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border" style={{ borderColor: C.line, color: C.ideal }}>
                    <RotateCcw size={13} /> Ordre optimisé
                  </button>
                )}
              </div>
              <ol>
                {plan.rows.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b last:border-b-0" style={{ borderColor: C.line }}>
                    <span className="w-6 h-6 shrink-0 grid place-items-center rounded-full font-mono text-xs" style={{ background: C.panel2, color: C.muted }}>{r.num}</span>
                    <span className="font-mono text-sm w-12 shrink-0" style={{ color: C.ideal }}>{fmtClock(r.atMin)}</span>
                    <span className="flex-1 min-w-0 text-sm truncate">{r.name}</span>
                    <span className="font-mono text-sm w-14 text-right shrink-0" style={{ color: NUTRIENTS[0].color }}>+{round1(r.carbs)} g</span>
                    <div className="flex flex-col shrink-0 -my-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="grid place-items-center h-4" style={{ color: i === 0 ? C.line : C.muted }} aria-label="Monter la dose"><ChevronUp size={15} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === plan.rows.length - 1} className="grid place-items-center h-4" style={{ color: i === plan.rows.length - 1 ? C.line : C.muted }} aria-label="Descendre la dose"><ChevronDown size={15} /></button>
                    </div>
                  </li>
                ))}
              </ol>
              {base.carbSurplus.length > 0 && (
                <div className="px-4 py-3 text-xs font-mono" style={{ color: C.muted }}>
                  Réserve : {base.carbSurplus.length} dose{base.carbSurplus.length > 1 ? "s" : ""} glucidique{base.carbSurplus.length > 1 ? "s" : ""} non programmée{base.carbSurplus.length > 1 ? "s" : ""}.
                </div>
              )}
            </div>

            {/* Compléments électrolytes */}
            {showElectro && base.complements.length > 0 && (
              <div className="rounded-xl border mt-3 overflow-hidden" style={{ background: C.panel, borderColor: C.line }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: C.line }}>
                  <Zap size={14} style={{ color: C.ideal }} />
                  <span className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: C.muted }}>Compléments électrolytes</span>
                </div>
                <ul>
                  {base.complements.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0" style={{ borderColor: C.line }}>
                      <span className="flex-1 min-w-0 text-sm truncate">{c.name}</span>
                      <span className="font-mono text-xs" style={{ color: C.muted }}>×{c.qty}</span>
                      <span className="font-mono text-sm" style={{ color: C.ideal }}>1 / {round1(c.spacing)} min</span>
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-3 text-xs font-mono" style={{ color: C.muted }}>
                  Espacés régulièrement sur la durée ; leurs électrolytes sont comptés dans la couverture.
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="mt-8 text-center text-xs font-mono" style={{ color: C.muted }}>
          POC · intervalle = 60 × (g moyens / dose) ÷ cible glucides
        </footer>
      </div>
    </div>
  );
}

/* --------------------------------- UI --------------------------------- */

function BigInput({ value, onChange, width }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal"
      className={`${width} bg-transparent font-mono text-3xl sm:text-4xl font-semibold outline-none`}
      style={{ color: C.text }} />
  );
}

function Seg({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
      style={{ background: active ? NUTRIENTS[0].color : "transparent", borderColor: active ? NUTRIENTS[0].color : C.line, color: active ? C.ink : C.muted }}>
      {children}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: C.muted }}>
      <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[2px]" style={{ background: NUTRIENTS[0].color }} /> réel</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[2px]" style={{ background: C.ideal }} /> cible</span>
    </div>
  );
}

function Coverage({ c }) {
  const pct = c.need > 0 ? Math.min(1.5, c.total / c.need) : 0;
  const ok = c.met;
  return (
    <div className="rounded-lg border p-3" style={{ background: C.panel2, borderColor: C.line }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color }} />
          {c.label}
        </span>
        <span className="font-mono text-xs" style={{ color: ok ? C.good : C.bad }}>
          {ok ? "couvert" : `−${round1(Math.abs(c.delta))} ${c.unit}/h`}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-lg" style={{ color: c.color }}>{round1(c.rate)}</span>
        <span className="font-mono text-xs" style={{ color: C.muted }}>/ {round1(c.target)} {c.unit}/h</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: C.ink }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: ok ? c.color : C.bad, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function CarbFeasibility({ base, plan }) {
  if (base.faisable) {
    const s = base.carbSurplus.length;
    return (
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: C.panel, borderColor: C.good }}>
        <Check size={18} style={{ color: C.good }} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <span style={{ color: C.good }} className="font-medium">Glucides couverts.</span>{" "}
          <span style={{ color: C.text }}>{base.k} dose{base.k > 1 ? "s" : ""} sur tes {base.Nc} tiennent {round1(base.cible)} g/h sur {fmtClock(base.durMin)}.</span>{" "}
          {s > 0 && <span style={{ color: C.muted }}>Marge : {s} dose{s > 1 ? "s" : ""}.</span>}
        </div>
      </div>
    );
  }
  const deficit = round1(base.besoin - base.dispoCarbs);
  const hold = (base.dispoCarbs / base.cible) * 60;
  const maxRate = base.dispoCarbs / base.durHours;
  return (
    <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: C.panel, borderColor: C.bad }}>
      <AlertTriangle size={18} style={{ color: C.bad }} className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <span style={{ color: C.bad }} className="font-medium">Glucides insuffisants.</span>{" "}
        <span style={{ color: C.text }}>Il manque {deficit} g pour tenir {round1(base.cible)} g/h sur {fmtClock(base.durMin)}.</span>
        <div className="mt-1" style={{ color: C.muted }}>Soit tu tiens la cible {fmtClock(hold)}, soit tu baisses à {round1(maxRate)} g/h sur toute la durée.</div>
      </div>
    </div>
  );
}

function EmptyState({ hasCarbSource }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: C.line }}>
      <div className="text-sm" style={{ color: C.muted }}>
        {hasCarbSource
          ? "Renseigne une cible glucides et une durée pour voir le plan."
          : "Ajoute au moins un produit contenant des glucides : ce sont eux qui fixent la cadence. Les produits sans glucides seront gérés en compléments électrolytes."}
      </div>
    </div>
  );
}
