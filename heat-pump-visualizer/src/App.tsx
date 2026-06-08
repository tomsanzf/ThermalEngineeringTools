import { useState, useEffect, useRef } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";

// ─── Constants ─────────────────────────────────────────────────────────
const SS_RAMP  = 300;
const P_BAND   = 5.0;
const R_TIME   = 600.0;
const ADD_THR  = 0.90;
const SEQ_RAMP = 180;
const HIST_SEC = 600;
const TICK_MS  = 100;
const CP       = 4.18;  // kJ/(kg·K) — specific heat of water

// ─── Physics: calculate CLWT, ELWT, COP from flows + previous temps ────
function physicsTick(Q_cond: number, crwt: number, erwt: number, flowCond: number, flowEvap: number, clwtPrev: number, elwtPrev: number, etaCarnot: number, dt: number) {
  if (Q_cond <= 0) return { clwt: crwt, elwt: erwt, cop: 0, qEvap: 0, wElec: 0, qCond: 0 };

  const lift = Math.max(2, clwtPrev - elwtPrev);
  const copCarnot = (clwtPrev + 273.15) / lift;
  const cop = Math.max(1.5, etaCarnot * copCarnot);

  const wElec = Q_cond / cop;
  const qEvap = Q_cond - wElec;

  const clwtTarget = crwt + Q_cond / ((flowCond / 3.6) * CP);
  const elwtTarget = erwt - qEvap  / ((flowEvap / 3.6) * CP);

  const tau = 45.0; 
  const alpha = 1.0 - Math.exp(-dt / tau);

  const clwt = clwtPrev + alpha * (clwtTarget - clwtPrev);
  const elwt = elwtPrev + alpha * (elwtTarget - elwtPrev);

  return { clwt, elwt, cop, qEvap, wElec, qCond: Q_cond };
}

// ─── Master controller tick ────────────────────────────────────────────
function masterTick(s: any, inp: any, dt: number) {
  const { active, hSP, cSP, clwt, elwt, minMod, hardCap } = inp;
  let { runTimer, latched, intH, intC } = s;
  if (!active) return { ...s, runTimer: 0, intH: 0, intC: 0, outputMod: 0, piH: 0, piC: 0, piRaw: 0, piTarget: 0, phase: 0, errH: 0, errC: 0, rampPct: 0 };
  runTimer += dt;
  const errH = hSP - clwt;
  intH = Math.max(0, Math.min(1, intH + (dt * (errH / P_BAND)) / R_TIME));
  const piH = Math.max(0, Math.min(1, errH / P_BAND + intH));
  const errC = elwt - cSP;
  intC = Math.max(0, Math.min(1, intC + (dt * (errC / P_BAND)) / R_TIME));
  const piC = Math.max(0, Math.min(1, errC / P_BAND + intC));
  const piRaw = Math.min(piH, piC);
  const piTarget = minMod + piRaw * (1 - minMod);
  let outputMod, phase, rampPct = 0;
  if (runTimer <= hardCap) { phase = 1; outputMod = minMod; latched = piTarget; }
  else if (runTimer <= hardCap + SS_RAMP) {
    phase = 2; rampPct = (runTimer - hardCap) / SS_RAMP;
    outputMod = Math.min(piTarget, minMod + rampPct * (latched - minMod));
  } else { phase = 3; outputMod = piTarget; }
  outputMod = Math.max(minMod, outputMod);
  return { runTimer, latched, intH, intC, outputMod, piH, piC, piRaw, piTarget, phase, errH, errC, rampPct };
}

// ─── Sequencer tick ────────────────────────────────────────────────────
function seqTick(s: any, masterMod: number, dt: number, config: any) {
  let { n, addT, subT, inTrans, transTimer, transStart, minMod, total } = s;
  const { addDly, subDly } = config;
  const subThr = minMod + 0.05;
  let changed = false;
  if (masterMod > 0 && n === 0) { n = 1; inTrans = 0; }
  else if (masterMod === 0 && n > 0) { n = 0; addT = 0; subT = 0; inTrans = 0; transTimer = 0; }
  if (n > 0 && n < total && masterMod >= ADD_THR) {
    addT += dt;
    if (addT >= addDly) { transStart = Math.max(minMod, (masterMod * n) / (n + 1)); n++; addT = 0; changed = true; }
  } else { addT = 0; }
  if (n > 1 && masterMod <= subThr) {
    subT += dt;
    if (subT >= subDly) { transStart = Math.min(1, (masterMod * n) / (n - 1)); n--; subT = 0; changed = true; }
  } else { subT = 0; }
  if (changed) { inTrans = 1; transTimer = 0; }
  let dispatchSignal;
  if (inTrans) {
    transTimer += dt;
    if (transTimer >= SEQ_RAMP) { inTrans = 0; dispatchSignal = masterMod; }
    else dispatchSignal = transStart + (transTimer / SEQ_RAMP) * (masterMod - transStart);
  } else { dispatchSignal = masterMod; }
  if (n > 0 && dispatchSignal < minMod) dispatchSignal = minMod;
  return { n, addT, subT, inTrans, transTimer, transStart, dispatchSignal, minMod, total };
}

// ─── Component Logic & Styles ──────────────────────────────────────────
const FF   = { fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" };
const pnl  = (x = {}) => ({ background: "#0d1828", border: "1px solid #1a2e50", borderRadius: 6, padding: 12, ...x });
const GRID = { stroke: "#0f1e38", strokeDasharray: "3 3" };

const SL = ({ children, color = "#4a90b8" }: any) => (
  <div style={{ fontSize: 9, color, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>
);

const Bar = ({ value, color, height = 5 }: any) => (
  <div style={{ height, background: "#060a12", borderRadius: 2, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color, transition: "width 0.12s" }} />
  </div>
);

const Slider = ({ label, value, min, max, step, onChange, color = "#38bdf8", unit = "", fmt }: any) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4a90b8", marginBottom: 2 }}>
      <span>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{fmt ? fmt(value) : value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(+e.target.value)}
      onPointerDown={e => e.stopPropagation()}
      style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
  </div>
);

const ToggleSlider = ({ label, value, min, max, step, onChange, color = "#38bdf8", unit = "", autoChecked, onAutoChange, autoLabel, disabled }: any) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4a90b8", marginBottom: 2 }}>
      <span>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {autoLabel && (
          <label style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={autoChecked} onChange={e => onAutoChange(e.target.checked)} />
            {autoLabel}
          </label>
        )}
        <span style={{ color, fontWeight: 600 }}>{value.toFixed(1)}{unit}</span>
      </div>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(+e.target.value)}
      onPointerDown={e => e.stopPropagation()}
      disabled={disabled}
      style={{ width: "100%", accentColor: color, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.3 : 1 }} />
  </div>
);

const TimerBar = ({ label, value, max, on, color, info }: any) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
      <span style={{ color: on ? color : "#2d3748", transition: "color 0.3s" }}>{label}</span>
      <span style={{ color: "#374151" }}>{on ? info : "—"}</span>
    </div>
    <div style={{ height: 4, background: "#060a12", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${on ? Math.min(100, (value / max) * 100) : 0}%`, background: color, transition: "width 0.1s" }} />
    </div>
  </div>
);

const Leg = ({ color, label, dashed, muted }: any) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: muted ? "#374151" : "#475569" }}>
    <svg width="18" height="6" style={{ flexShrink: 0 }}>
      <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
    {label}
  </div>
);

const SVGSchematic = ({ phys, aux }: { phys: any, aux: any }) => {
  return (
    <div style={pnl({ flex: 1, minHeight: 320, position: "relative", padding: 0, overflow: "hidden" })}>
       <div style={{ position: "absolute", top: 12, left: 16 }}>
          <SL>System Schematic</SL>
       </div>
       <svg viewBox="0 -100 1000 480" style={{ width: "100%", height: "100%", display: "block", marginTop: 20 }}>
          {/* Box */}
          <rect x="400" y="-60" width="200" height="400" fill="#060a12" stroke="#334155" strokeWidth="2" rx="8" />
          <text x="500" y="85" fill="#a78bfa" fontSize="28" fontWeight="bold" textAnchor="middle" letterSpacing="4">HEAT PUMP</text>
          <text x="500" y="115" fill="#6d28d9" fontSize="12" textAnchor="middle" letterSpacing="2">COMPRESSOR & HX</text>
          <text x="500" y="210" fill="#f87171" fontSize="48" fontWeight="bold" textAnchor="middle">{phys.cop.toFixed(2)}</text>
          <text x="500" y="270" fill="#22c55e" fontSize="36" fontWeight="bold" textAnchor="middle" opacity="0.9">{phys.wElec.toFixed(0)} kW</text>

          {/* EVAPORATOR (LEFT) */}
          <path d="M 40 0 L 400 0" fill="none" stroke="#60a5fa" strokeWidth="4" />
          <text x="260" y="-50" fill="#60a5fa" fontSize="22" fontFamily="monospace" fontWeight="bold" textAnchor="middle">ERWT</text>
          <text x="260" y="-22" fill="#60a5fa" fontSize="28" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{aux.erwt.toFixed(1)}°C</text>

          <circle cx="260" cy="0" r="18" fill="#0f172a" stroke="#60a5fa" strokeWidth="2" />
          <polygon points="253,-9 269,0 253,9" fill="#60a5fa" />
          <text x="260" y="45" fill="#7dd3fc" fontSize="32" fontFamily="monospace" textAnchor="middle">{aux.flowEvap.toFixed(0)} m³/h</text>
          <text x="260" y="155" fill="#60a5fa" fontSize="36" fontFamily="monospace" fontWeight="bold" textAnchor="middle" opacity="0.8">{phys.qEvap.toFixed(0)} kW</text>

          <path d="M 160 15 L 160 280" fill="none" stroke="#334155" strokeWidth="3" strokeDasharray="6 4" />
          <polygon points="145,-8 145,8 160,0" fill="#60a5fa" />
          <polygon points="175,-8 175,8 160,0" fill="#60a5fa" />
          <polygon points="152,15 168,15 160,0" fill="#64748b" />

          <path d="M 400 280 L 40 280" fill="none" stroke="#3b82f6" strokeWidth="4" />
          <text x="260" y="325" fill="#3b82f6" fontSize="22" fontFamily="monospace" fontWeight="bold" textAnchor="middle">ELWT</text>
          <text x="260" y="355" fill="#3b82f6" fontSize="28" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{phys.elwt.toFixed(1)}°C</text>

          {/* CONDENSER (RIGHT) */}
          <path d="M 600 0 L 960 0" fill="none" stroke="#f87171" strokeWidth="4" />
          <text x="740" y="-50" fill="#f87171" fontSize="22" fontFamily="monospace" fontWeight="bold" textAnchor="middle">CLWT</text>
          <text x="740" y="-22" fill="#f87171" fontSize="28" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{phys.clwt.toFixed(1)}°C</text>

          <path d="M 960 280 L 600 280" fill="none" stroke="#fca5a5" strokeWidth="4" />
          <text x="740" y="325" fill="#fca5a5" fontSize="22" fontFamily="monospace" fontWeight="bold" textAnchor="middle">CRWT</text>
          <text x="740" y="355" fill="#fca5a5" fontSize="28" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{aux.crwt.toFixed(1)}°C</text>

          <circle cx="740" cy="280" r="18" fill="#0f172a" stroke="#fca5a5" strokeWidth="2" />
          <polygon points="747,271 731,280 747,289" fill="#fca5a5" />
          <text x="740" y="240" fill="#fb923c" fontSize="32" fontFamily="monospace" textAnchor="middle">{aux.flowCond.toFixed(0)} m³/h</text>
          <text x="740" y="145" fill="#f87171" fontSize="36" fontFamily="monospace" fontWeight="bold" textAnchor="middle" opacity="0.8">{(phys.qCond || (phys.qEvap + phys.wElec)).toFixed(0)} kW</text>

          <path d="M 840 0 L 840 265" fill="none" stroke="#334155" strokeWidth="3" strokeDasharray="6 4" />
          <polygon points="855,272 855,288 840,280" fill="#fca5a5" />
          <polygon points="825,272 825,288 840,280" fill="#fca5a5" />
          <polygon points="832,265 848,265 840,280" fill="#64748b" />

          {/* Arrows */}
          <polygon points="350,-5 360,0 350,5" fill="#60a5fa" />
          <polygon points="120,275 110,280 120,285" fill="#3b82f6" />
          <polygon points="640,-5 650,0 640,5" fill="#f87171" />
          <polygon points="900,275 890,280 900,285" fill="#fca5a5" />
       </svg>
    </div>
  );
}

// ─── Tooltips ──────────────────────────────────────────────────────────
const TempTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#07111f", border: "1px solid #1a3060", padding: "8px 12px", ...FF, fontSize: 10, borderRadius: 4 }}>
      <div style={{ color: "#38bdf8", marginBottom: 4 }}>t = {(payload[0]?.payload?.t / 60).toFixed(1)} min</div>
      {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.stroke ?? p.fill }}>{p.name}: {p.value?.toFixed(1)}°C</div>)}
    </div>
  );
};

const PiTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#07111f", border: "1px solid #1a3060", padding: "8px 12px", ...FF, fontSize: 10, borderRadius: 4 }}>
      <div style={{ color: "#38bdf8", marginBottom: 4 }}>t = {(payload[0]?.payload?.t / 60).toFixed(1)} min</div>
      {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.stroke }}>{p.name}: {((p.value || 0) * 100).toFixed(1)}%</div>)}
    </div>
  );
};

const ModTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#07111f", border: "1px solid #1a3060", padding: "8px 12px", ...FF, fontSize: 10, borderRadius: 4 }}>
      <div style={{ color: "#38bdf8", marginBottom: 4 }}>t = {(payload[0]?.payload?.t / 60).toFixed(1)} min</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: {p.dataKey === "power" ? `${Math.round(p.value || 0)} kW` : p.dataKey === "wElec" ? `${(p.value || 0).toFixed(1)} kW` : `${((p.value || 0) * 100).toFixed(1)}%`}
        </div>
      ))}
    </div>
  );
};

// ─── Initial states ────────────────────────────────────────────────────
const M0  = { runTimer: 0, latched: 1, intH: 0, intC: 0, outputMod: 0, piH: 0, piC: 0, piRaw: 0, piTarget: 0, phase: 0, errH: 0, errC: 0, rampPct: 0 };
const SQ0 = { n: 0, addT: 0, subT: 0, inTrans: 0, transTimer: 0, transStart: 0, dispatchSignal: 0, minMod: 0.25, total: 3 };
const AUX0 = { crwt: 80, erwt: 50, flowCond: 18, flowEvap: 18 };

// ─── Main ──────────────────────────────────────────────────────────────
export default function App() {
  const mRef    = useRef({ ...M0 });
  const sqRef   = useRef({ ...SQ0 });
  const physRef = useRef({ clwt: 80, elwt: 50, cop: 0, qEvap: 0, wElec: 0 });
  const auxRef  = useRef({ ...AUX0 });
  const histRef = useRef<any[]>([]);
  const stRef   = useRef(0);

  const [snap, setSnap] = useState({ m: M0, sq: SQ0, phys: { clwt: 80, elwt: 50, cop: 0, qEvap: 0, wElec: 0 }, aux: AUX0, hist: [] as any[], simTime: 0 });
  
  const [playing,    setPlaying]    = useState(true);
  const [timeScale,  setTimeScale]  = useState(30);
  const [active,     setActive]     = useState(true);
  const [hSP,        setHSP]        = useState(90);
  const [cSP,        setCSP]        = useState(40);
  
  const [sliderCrwt,       setSliderCrwt]       = useState(80);
  const [sliderErwt,       setSliderErwt]       = useState(50);
  const [sliderFlowCond,   setSliderFlowCond]   = useState(18);
  const [sliderFlowEvap,   setSliderFlowEvap]   = useState(18);

  const [cAuto3WV, setCAuto3WV] = useState(false);
  const [cAutoPump, setCAutoPump] = useState(false);
  const [hAuto3WV, setHAuto3WV] = useState(false);
  const [hAutoPump, setHAutoPump] = useState(false);

  const [etaCarnot,  setEtaCarnot]  = useState(0.50);
  const [minMod,     setMinMod]     = useState(0.25);
  const [total,      setTotal]      = useState(3);
  const [hpKW,       setHpKW]       = useState(100);
  const [hardCap,    setHardCap]    = useState(300);
  const [addDly,     setAddDly]     = useState(300);
  const [subDly,     setSubDly]     = useState(300);

  const inpRef = useRef({ 
     active, hSP, cSP, minMod, sliderCrwt, sliderErwt, sliderFlowCond, sliderFlowEvap, 
     etaCarnot, hpKW, hardCap, addDly, subDly, cAuto3WV, cAutoPump, hAuto3WV, hAutoPump 
  });
  const tsRef  = useRef(timeScale);
  const plRef  = useRef(playing);
  
  useEffect(() => { 
     inpRef.current = { 
        active, hSP, cSP, minMod, sliderCrwt, sliderErwt, sliderFlowCond, sliderFlowEvap, 
        etaCarnot, hpKW, hardCap, addDly, subDly, cAuto3WV, cAutoPump, hAuto3WV, hAutoPump 
     }; 
  }, [active, hSP, cSP, minMod, sliderCrwt, sliderErwt, sliderFlowCond, sliderFlowEvap, etaCarnot, hpKW, hardCap, addDly, subDly, cAuto3WV, cAutoPump, hAuto3WV, hAutoPump]);
  useEffect(() => { tsRef.current = timeScale; }, [timeScale]);
  useEffect(() => { plRef.current = playing; }, [playing]);
  useEffect(() => { sqRef.current = { ...sqRef.current, minMod, total }; }, [minMod, total]);

  const reset = () => {
    mRef.current  = { ...M0 };
    sqRef.current = { ...SQ0, minMod, total };
    auxRef.current = { ...AUX0 };
    physRef.current = { clwt: AUX0.crwt, elwt: AUX0.erwt, cop: 0, qEvap: 0, wElec: 0 };
    histRef.current = []; stRef.current = 0;
    setSnap({ m: M0, sq: SQ0, phys: physRef.current, aux: AUX0, hist: [], simTime: 0 });
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (!plRef.current) return;
      const dt  = tsRef.current * (TICK_MS / 1000);
      const inp = inpRef.current;

      const { clwt, elwt } = physRef.current;

      // Handle Aux Control (3WV and Pump PI)
      let nextAux = { ...auxRef.current };
      if (!inp.hAuto3WV) {
         nextAux.crwt = inp.sliderCrwt;
      } else {
         nextAux.crwt -= (clwt - inp.hSP) * 0.2 * dt;
         nextAux.crwt = Math.max(60, Math.min(115, nextAux.crwt));
      }
      if (!inp.hAutoPump) {
         nextAux.flowCond = inp.sliderFlowCond;
      } else {
         nextAux.flowCond += (clwt - inp.hSP) * 0.5 * dt;
         nextAux.flowCond = Math.max(5, Math.min(100, nextAux.flowCond));
      }
      if (!inp.cAuto3WV) {
         nextAux.erwt = inp.sliderErwt;
      } else {
         nextAux.erwt -= (elwt - inp.cSP) * 0.2 * dt;
         nextAux.erwt = Math.max(35, Math.min(65, nextAux.erwt));
      }
      if (!inp.cAutoPump) {
         nextAux.flowEvap = inp.sliderFlowEvap;
      } else {
         nextAux.flowEvap -= (elwt - inp.cSP) * 0.5 * dt;
         nextAux.flowEvap = Math.max(5, Math.min(100, nextAux.flowEvap));
      }
      auxRef.current = nextAux;

      const nextM = masterTick(mRef.current, { ...inp, clwt, elwt }, dt);
      mRef.current = nextM;

      const nextSq = seqTick({ ...sqRef.current, minMod: inp.minMod }, nextM.outputMod, dt, { addDly: inp.addDly, subDly: inp.subDly });
      sqRef.current = nextSq;

      // Physics: calculate new CLWT/ELWT from dispatch signal
      const qCond = inp.active ? nextSq.dispatchSignal * nextSq.n * inp.hpKW : 0;
      const nextPhys = physicsTick(qCond, nextAux.crwt, nextAux.erwt, nextAux.flowCond, nextAux.flowEvap, clwt, elwt, inp.etaCarnot, dt);
      physRef.current = nextPhys;

      stRef.current += dt;
      const t = stRef.current;

      const power = Math.round(qCond);
      
      let nextHist = histRef.current;
      // Limit history points to avoid Out of Memory / DataCloneError
      const lastPt = nextHist[nextHist.length - 1];
      if (!lastPt || t - lastPt.t >= Math.max(1, HIST_SEC / 150)) {
        const pt = {
          t,
          clwt:   +nextPhys.clwt.toFixed(2),
          elwt:   +nextPhys.elwt.toFixed(2),
          hSP:    +inp.hSP.toFixed(1),
          cSP:    +inp.cSP.toFixed(1),
          crwt:   +nextAux.crwt.toFixed(1),
          erwt:   +nextAux.erwt.toFixed(1),
          piH:    +nextM.piH.toFixed(3),
          piC:    +nextM.piC.toFixed(3),
          loadReq:    +nextM.outputMod.toFixed(3),
          dispatch:   +nextSq.dispatchSignal.toFixed(3),
          machines:   nextSq.n,
          power,
          cop:    +nextPhys.cop.toFixed(2),
          wElec:  +nextPhys.wElec.toFixed(1),
        };
        nextHist = [...nextHist, pt].filter((p: any) => t - p.t <= HIST_SEC);
        histRef.current = nextHist;
      }

      setSnap({ m: nextM, sq: nextSq, phys: nextPhys, aux: nextAux, hist: nextHist, simTime: t });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const { m, sq, phys, aux, hist, simTime } = snap;
  const subThr    = minMod + 0.05;
  const maxKW     = total * hpKW;
  const qCond     = active ? Math.round(sq.dispatchSignal * sq.n * hpKW) : 0;
  const xMin      = Math.max(0, simTime - HIST_SEC);
  const xMax      = Math.max(60, simTime);
  const simMin    = Math.floor(simTime / 60);
  const simSec    = Math.floor(simTime % 60);
  const rtMin     = Math.floor(m.runTimer / 60);
  const rtSec     = Math.floor(m.runTimer % 60);
  const addCond   = m.outputMod >= ADD_THR && sq.n > 0 && sq.n < total;
  const subCond   = m.outputMod <= subThr && sq.n > 1;
  const hLimiting = active && m.piH <= m.piC;
  const cLimiting = active && m.piC < m.piH;
  const phaseColors = ["#374151", "#f59e0b", "#c084fc", "#22c55e"];
  const phaseLabels = ["INACTIVE", `PHASE 1 · HARD CAP (${Math.round(hardCap / 60)} min)`, "PHASE 2 · SOFT RAMP (5 min)", "PHASE 3 · FREE"];
  const phaseColor = phaseColors[m.phase] ?? "#374151";
  const phaseLabel = phaseLabels[m.phase] ?? "—";
  const softPct = m.phase === 1 ? Math.min(100, (m.runTimer / hardCap) * 100)
                : m.phase === 2 ? m.rampPct * 100
                : m.phase === 3 ? 100 : 0;

  // COP color: green when high, orange when dropping, red when near floor
  const copColor = phys.cop > 4 ? "#22c55e" : phys.cop > 2.5 ? "#f59e0b" : "#f87171";

  return (
    <div style={{ background: "#070b14", color: "#e2e8f0", ...FF, fontSize: 12, minHeight: "100vh" }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ background: "#09111e", borderBottom: "1px solid #1a3060", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: "#38bdf8", letterSpacing: 3, textTransform: "uppercase" }}>Full System — with Hydraulic Physics</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
            Flow & Temperature → COP → PI Controllers → Soft-Start → Load Request → Sequencer → Dispatch Signal
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setActive(a => !a)} style={{ ...FF, background: active ? "#091a10" : "#100018", border: `1.5px solid ${active ? "#16a34a" : "#7c3aed"}`, color: active ? "#4ade80" : "#a78bfa", padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>
            {active ? "● HP ACTIVE" : "○ HP OFF"}
          </button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: "#374151", letterSpacing: 2 }}>SIM TIME</div>
            <div style={{ fontSize: 18, color: "#38bdf8", fontWeight: 700 }}>{String(simMin).padStart(3, "0")}:{String(simSec).padStart(2, "0")}</div>
          </div>
          <button onClick={() => setPlaying(p => !p)} style={{ ...FF, background: playing ? "#1e3a5f" : "#1a4731", border: `1px solid ${playing ? "#2563eb" : "#16a34a"}`, color: playing ? "#60a5fa" : "#4ade80", padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>
            {playing ? "⏸ PAUSE" : "▶ PLAY"}
          </button>
          <button onClick={reset} style={{ ...FF, background: "#1c1a14", border: "1px solid #78350f", color: "#f59e0b", padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>↺ RESET</button>
        </div>
      </div>

      <div style={{ padding: "10px 10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ══ ROW 1: Three charts ════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>

          {/* Temperature chart */}
          <div style={pnl()}>
            <SL>Water Temperatures</SL>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={hist} margin={{ top: 2, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" type="number" domain={[xMin, xMax]} tickFormatter={v => `${(v / 60).toFixed(0)}m`} tick={{ fill: "#374151", fontSize: 9 }} />
                <YAxis domain={[25, 125]} tickFormatter={v => `${v}°`} tick={{ fill: "#374151", fontSize: 9 }} width={28} />
                <Tooltip content={<TempTip />} />
                <ReferenceLine y={hSP} stroke="#fb923c" strokeDasharray="5 4" strokeWidth={1.5} />
                <ReferenceLine y={cSP} stroke="#7dd3fc" strokeDasharray="5 4" strokeWidth={1.5} />
                {/* Return temps as muted dashed lines */}
                <Line dataKey="crwt" name="CRWT" stroke="#7a3f1a" strokeWidth={1} dot={false} strokeDasharray="3 4" isAnimationActive={false} />
                <Line dataKey="erwt" name="ERWT" stroke="#1a3a5c" strokeWidth={1} dot={false} strokeDasharray="3 4" isAnimationActive={false} />
                {/* Leaving temps as bright solid lines */}
                <Line dataKey="clwt" name="CLWT" stroke="#f87171" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line dataKey="elwt" name="ELWT" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <Leg color="#f87171" label="CLWT — condenser leaving" />
              <Leg color="#60a5fa" label="ELWT — evaporator leaving" />
              <Leg color="#fb923c" label={`Heating SP (${hSP}°C)`} dashed />
              <Leg color="#7dd3fc" label={`Evap SP (${cSP}°C)`} dashed />
              <Leg color="#7a3f1a" label="CRWT (return)" dashed muted />
              <Leg color="#1a3a5c" label="ERWT (return)" dashed muted />
            </div>
          </div>

          {/* PI outputs chart */}
          <div style={pnl()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <SL>PI Controller Outputs</SL>
              <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                <div style={{ fontSize: 9, color: "#374151" }}>currently limiting</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: hLimiting ? "#f87171" : "#60a5fa" }}>
                  {active ? (hLimiting ? "piHeating_out" : "piCooling_out") : "—"}
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={hist} margin={{ top: 2, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" type="number" domain={[xMin, xMax]} tickFormatter={v => `${(v / 60).toFixed(0)}m`} tick={{ fill: "#374151", fontSize: 9 }} />
                <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fill: "#374151", fontSize: 9 }} width={32} />
                <Tooltip content={<PiTip />} />
                <Line dataKey="piH" name="piHeating_out" stroke={hLimiting ? "#f87171" : "#4a1f1f"} strokeWidth={hLimiting ? 2.5 : 1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="piC" name="piCooling_out" stroke={cLimiting ? "#60a5fa" : "#1a2e4a"} strokeWidth={cLimiting ? 2.5 : 1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <Leg color="#f87171" label="piHeating_out — condenser side" />
              <Leg color="#60a5fa" label="piCooling_out — evap protection" />
            </div>
          </div>

          {/* Load Request + Dispatch Signal + Power chart */}
          <div style={pnl()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <SL>Load Request, Dispatch Signal & Power</SL>
              <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa" }}>{qCond} kW</div>
                <div style={{ fontSize: 9, color: "#5b21b6" }}>of {maxKW} kW capacity</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", marginTop: 4 }}>
                  {active ? `Dispatch: ${Math.round(sq.dispatchSignal * 100)}%` : "—"}
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={hist} margin={{ top: 2, right: 48, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" type="number" domain={[xMin, xMax]} tickFormatter={v => `${(v / 60).toFixed(0)}m`} tick={{ fill: "#374151", fontSize: 9 }} />
                <YAxis yAxisId="mod" domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fill: "#374151", fontSize: 9 }} width={32} />
                <YAxis yAxisId="pwr" orientation="right" domain={[0, maxKW]} tickFormatter={v => `${v}`} tick={{ fill: "#6d28d9", fontSize: 9 }} width={40} />
                <Tooltip content={<ModTip />} />
                {/* Gray band below minMod — the forbidden zone */}
                {/* @ts-ignore */}
                <ReferenceArea yAxisId="mod" y1={0} y2={minMod} fill="#374151" fillOpacity={0.18} />
                <ReferenceLine yAxisId="mod" y={minMod} stroke="#374151" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine yAxisId="mod" y={ADD_THR} stroke="#92400e" strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine yAxisId="mod" y={subThr}  stroke="#164e63" strokeDasharray="4 4" strokeWidth={1} />
                <Line yAxisId="mod" dataKey="loadReq"  name="Load Request"    stroke="#38bdf8" strokeWidth={2}   dot={false} isAnimationActive={false} />
                <Line yAxisId="mod" dataKey="dispatch" name="Dispatch Signal"  stroke="#f59e0b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="pwr" dataKey="power"    name="Heating Power"    stroke="#a78bfa" strokeWidth={2}   dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <Leg color="#38bdf8" label="Load Request" />
              <Leg color="#f59e0b" label="Dispatch Signal (ramped)" />
              <Leg color="#a78bfa" label={`Heating Power — right axis, max ${maxKW} kW`} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "#374151" }}>
                <div style={{ width: 12, height: 8, background: "#374151", opacity: 0.4, borderRadius: 1 }} />
                minMod dead zone
              </div>
            </div>
          </div>
        </div>

        {/* ══ ROW 2: Hydraulic inputs & Schematic ════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px 1fr", gap: 10 }}>

          {/* Evaporator — left */}
          <div style={pnl()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SL color="#60a5fa">Evaporator Side — Source</SL>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 8, color: "#374151" }}>ELWT (calc.)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{phys.elwt.toFixed(1)}°C</div>
                </div>
                <div style={{ fontSize: 8, padding: "2px 8px", borderRadius: 10, fontWeight: 700, border: `1px solid ${cLimiting ? "#60a5fa" : "#1a2744"}`, color: cLimiting ? "#60a5fa" : "#2d3748", background: cLimiting ? "#060e1c" : "transparent", transition: "all 0.3s" }}>
                  {cLimiting ? "⚠ LIMITING" : "OK"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ToggleSlider label="ERWT — evaporator return water temp"
                 value={cAuto3WV ? aux.erwt : sliderErwt}
                 min={35} max={65} step={1} onChange={setSliderErwt} color="#60a5fa" unit="°C"
                 autoChecked={cAuto3WV} onAutoChange={setCAuto3WV} autoLabel="Controlled by 3WV" disabled={cAuto3WV} />

              <ToggleSlider label="Evaporator flow rate"
                 value={cAutoPump ? aux.flowEvap : sliderFlowEvap}
                 min={5} max={100} step={1} onChange={setSliderFlowEvap} color="#7dd3fc" unit=" m³/h"
                 autoChecked={cAutoPump} onAutoChange={setCAutoPump} autoLabel="Controlled by Pump flow" disabled={cAutoPump} />

              <Slider label="Evap protection SP" value={cSP} min={30} max={60} step={1} onChange={setCSP} color="#93c5fd" unit="°C" />
            </div>
            <div style={{ marginTop: 10, fontSize: 9, padding: "6px 9px", background: "#060a12", borderRadius: 3, borderLeft: `2px solid ${m.errC > 0 ? "#22c55e" : "#f87171"}`, color: m.errC > 0 ? "#4ade80" : "#f87171" }}>
              {m.errC > 0
                ? `▲ ELWT ${phys.elwt.toFixed(1)}°C is ${m.errC.toFixed(1)}°C above SP — source has margin`
                : `▼ ELWT ${phys.elwt.toFixed(1)}°C is ${Math.abs(m.errC).toFixed(1)}°C below SP — evap protection limiting!`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10, borderTop: "1px solid #0f1e38", paddingTop: 10 }}>
              {[
                { label: "Proportional",  val: Math.max(0, Math.min(1, m.errC / P_BAND)), color: "#60a5fa" },
                { label: "Integral",      val: m.intC || 0,                                color: "#7dd3fc" },
                { label: "piCooling_out", val: m.piC  || 0,                                color: cLimiting ? "#60a5fa" : "#2d4a6b" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 3 }}>{label}</div>
                  <Bar value={val} color={color} height={4} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: active ? color : "#1f2937", marginTop: 3 }}>
                    {active ? Math.round(val * 100) : "—"}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SVGSchematic phys={phys} aux={aux} />

          {/* Condenser — right */}
          <div style={pnl()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SL color="#f87171">Condenser Side — Heating Demand</SL>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 8, color: "#374151" }}>CLWT (calc.)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171" }}>{phys.clwt.toFixed(1)}°C</div>
                </div>
                <div style={{ fontSize: 8, padding: "2px 8px", borderRadius: 10, fontWeight: 700, border: `1px solid ${hLimiting ? "#f87171" : "#1a2744"}`, color: hLimiting ? "#f87171" : "#2d3748", background: hLimiting ? "#180a0a" : "transparent", transition: "all 0.3s" }}>
                  {hLimiting ? "⚠ LIMITING" : "OK"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ToggleSlider label="CRWT — condenser return water temp"
                 value={hAuto3WV ? aux.crwt : sliderCrwt}
                 min={60} max={115} step={1} onChange={setSliderCrwt} color="#f87171" unit="°C"
                 autoChecked={hAuto3WV} onAutoChange={setHAuto3WV} autoLabel="Controlled by 3WV" disabled={hAuto3WV} />

              <ToggleSlider label="Condenser flow rate"
                 value={hAutoPump ? aux.flowCond : sliderFlowCond}
                 min={5} max={100} step={1} onChange={setSliderFlowCond} color="#fb923c" unit=" m³/h"
                 autoChecked={hAutoPump} onAutoChange={setHAutoPump} autoLabel="Controlled by Pump flow" disabled={hAutoPump} />

              <Slider label="Heating supply SP" value={hSP} min={70} max={120} step={1} onChange={setHSP} color="#fca5a5" unit="°C" />
            </div>
            <div style={{ marginTop: 10, fontSize: 9, padding: "6px 9px", background: "#060a12", borderRadius: 3, borderLeft: `2px solid ${m.errH > 0 ? "#f87171" : "#22c55e"}`, color: m.errH > 0 ? "#f87171" : "#4ade80" }}>
              {m.errH > 0
                ? `▼ CLWT ${phys.clwt.toFixed(1)}°C is ${m.errH.toFixed(1)}°C below SP — heating demand unsatisfied`
                : `▲ CLWT ${phys.clwt.toFixed(1)}°C is ${Math.abs(m.errH).toFixed(1)}°C above SP — supply temperature satisfied`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10, borderTop: "1px solid #0f1e38", paddingTop: 10 }}>
              {[
                { label: "Proportional", val: Math.max(0, Math.min(1, m.errH / P_BAND)), color: "#f87171" },
                { label: "Integral",     val: m.intH || 0,                                color: "#fb923c" },
                { label: "piHeating_out",val: m.piH  || 0,                                color: hLimiting ? "#f87171" : "#6b2d2d" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 3 }}>{label}</div>
                  <Bar value={val} color={color} height={4} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: active ? color : "#1f2937", marginTop: 3 }}>
                    {active ? Math.round(val * 100) : "—"}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ ROW 3: Settings + Active Units + Timers + COP ══════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 1fr 220px", gap: 10 }}>

          {/* Settings */}
          <div style={pnl({ height: "100%" })}>
            <SL>System Settings</SL>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Slider label={`Min modulation: ${Math.round(minMod * 100)}%`} value={minMod} min={0.10} max={0.50} step={0.05} onChange={setMinMod} color="#c084fc" />
              <Slider label={`Max HP units: ${total}`} value={total} min={1} max={4} step={1} onChange={setTotal} color="#c084fc" />
              <Slider label={`Power per HP: ${hpKW} kW`} value={hpKW} min={20} max={500} step={10} onChange={setHpKW} color="#c084fc" unit=" kW" />
              <Slider label={`Phase 1 hard cap: ${Math.round(hardCap / 60)} min`} value={hardCap} min={0} max={1800} step={60} onChange={setHardCap} color="#c084fc" />
              <Slider label={`Carnot efficiency: ${Math.round(etaCarnot * 100)}%`} value={etaCarnot} min={0.30} max={0.70} step={0.05} onChange={setEtaCarnot} color="#22c55e"
                fmt={(v: any) => Math.round(v * 100)} unit="%" />
              <Slider label={`Speed: ${timeScale}×`} value={timeScale} min={5} max={120} step={5} onChange={setTimeScale} color="#a78bfa" />
            </div>
          </div>

          {/* Active Units */}
          <div style={pnl({ display: "flex", flexDirection: "column", height: "100%" })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <SL>Active Units</SL>
              <div style={{ fontSize: 9, color: "#22c55e" }}>{sq.n} / {total} online</div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-around", flex: 1, minHeight: 140 }}>
              {Array.from({ length: Math.max(3, total) }, (_, i) => {
                const on  = i < sq.n;
                const val = on ? sq.dispatchSignal : 0;
                const col = on ? (sq.inTrans ? "#f59e0b" : "#22c55e") : "#1f2937";
                const kw  = Math.round(val * hpKW);
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: on ? "#091a10" : "#080d18", borderRadius: 4, padding: "10px 8px", border: `1px solid ${on ? (sq.inTrans ? "#92400e" : "#14532d") : "#141d30"}`, transition: "all 0.4s", flex: 1 }}>
                    <div style={{ fontSize: 10, color: col, fontWeight: 600 }}>HP-{i + 1}</div>
                    <div style={{ fontSize: 9, color: col, marginBottom: 4 }}>{on ? "ONLINE" : "STANDBY"}</div>
                    <div style={{ width: 24, flex: 1, background: "#060a12", borderRadius: 2, overflow: "hidden", position: "relative", minHeight: 80 }}>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${val * 100}%`, background: col, transition: "height 0.12s" }} />
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700, marginTop: 4 }}>{Math.round(val * 100)}%</div>
                    <div style={{ fontSize: 10, color: on ? "#a78bfa" : "#1f2937", fontWeight: on ? 600 : 400 }}>{on ? `${kw} kW` : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: "1px solid #0f1e38", paddingTop: 8, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 4 }}>
                <span style={{ color: "#374151" }}>Total heating</span>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>{qCond} / {maxKW} kW</span>
              </div>
              <div style={{ height: 5, background: "#060a12", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(qCond / maxKW) * 100}%`, background: "#a78bfa", transition: "width 0.12s" }} />
              </div>
            </div>
          </div>

          {/* Combined Timers */}
          <div style={pnl({ display: "flex", flexDirection: "column", height: "100%" })}>
            <div>
              <SL>Soft-Start Phase</SL>
              <div style={{ fontSize: 10, color: phaseColor, fontWeight: 700, marginBottom: 6 }}>{phaseLabel}</div>
              <div style={{ height: 5, background: "#060a12", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${softPct}%`, background: phaseColor, transition: "width 0.12s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#374151", marginBottom: 6 }}>
                <span>Run timer</span>
                <span style={{ color: phaseColor, fontWeight: 700 }}>{String(rtMin).padStart(2, "0")}:{String(rtSec).padStart(2, "0")}</span>
              </div>
              <div style={{ fontSize: 9, color: "#4b5563", lineHeight: 1.6 }}>
                {m.phase === 1 && <>Locked at <span style={{ color: "#f59e0b" }}>{Math.round(minMod * 100)}%</span>. PI runs free. Latching target at <span style={{ color: "#c084fc" }}>{Math.round(m.latched * 100)}%</span>.</>}
                {m.phase === 2 && <>Ceiling rising to <span style={{ color: "#c084fc" }}>{Math.round(m.latched * 100)}%</span>. Ramp <span style={{ color: "#c084fc" }}>{Math.round(m.rampPct * 100)}%</span> done.</>}
                {m.phase === 3 && <span style={{ color: "#22c55e" }}>Full PI control — no ceiling constraint.</span>}
                {m.phase === 0 && "HP deactivated — integrals reset."}
              </div>
            </div>
            
            <div style={{ borderTop: "1px solid #0f1e38", paddingTop: 10, marginTop: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SL>Staging Timers</SL>
                <div>
                  <Slider label={`Stage-up timer target: ${addDly} s`} value={addDly} min={30} max={900} step={30} onChange={setAddDly} color="#f59e0b" unit=" s" />
                  <div style={{ marginTop: 4 }}>
                    <TimerBar label={`⬆ Stage-up — Load Req ≥ ${Math.round(ADD_THR * 100)}%`} value={sq.addT} max={addDly} on={addCond} color="#f59e0b" info={`${Math.round(sq.addT)}/${addDly} s`} />
                  </div>
                </div>
                <div>
                  <Slider label={`Stage-down timer target: ${subDly} s`} value={subDly} min={30} max={900} step={30} onChange={setSubDly} color="#38bdf8" unit=" s" />
                  <div style={{ marginTop: 4 }}>
                    <TimerBar label={`⬇ Stage-down — Load Req ≤ ${Math.round(subThr * 100)}%`} value={sq.subT} max={subDly} on={subCond} color="#38bdf8" info={`${Math.round(sq.subT)}/${subDly} s`} />
                  </div>
                </div>
                <TimerBar label="〜 Load Transfer Ramp" value={sq.transTimer} max={SEQ_RAMP} on={!!sq.inTrans} color="#c084fc" info={`${Math.round(sq.transTimer)} / ${SEQ_RAMP} s`} />
              </div>
            </div>
          </div>

          {/* COP */}
          <div style={pnl({ height: "100%" })}>
            <SL>COP — Carnot × {Math.round(etaCarnot * 100)}%</SL>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 2 }}>COP actual</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: active && sq.n > 0 ? copColor : "#1f2937", lineHeight: 1 }}>
                    {active && sq.n > 0 ? phys.cop.toFixed(1) : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 2 }}>W int</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: active && sq.n > 0 ? "#94a3b8" : "#1f2937", lineHeight: 1 }}>
                    {active && sq.n > 0 ? Math.round(phys.wElec) : "—"}
                    <span style={{ fontSize: 10 }}> kW</span>
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 2 }}>Lift ΔT</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: active && sq.n > 0 ? "#94a3b8" : "#1f2937", lineHeight: 1 }}>
                    {active && sq.n > 0 ? (phys.clwt - phys.elwt).toFixed(1) : "—"}
                    <span style={{ fontSize: 10 }}>°C</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#374151", lineHeight: 1.6, borderTop: "1px solid #0f1e38", paddingTop: 8 }}>
                COP↓ as lift (CLWT − ELWT) increases. Low ERWT or high CRWT = high lift = lower COP = more electrical draw per kW of heat.
              </div>
            </div>
        </div>

        {/* ══ ROW 5: Signal Chain ═══════════════════════════════════════ */}
        <div style={pnl()}>
          <SL>Signal Chain — PI → Gate → Net Demand → Load Request → Dispatch Signal</SL>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {[
              { label: "piHeating_out", sub: "condenser", val: m.piH, color: hLimiting ? "#f87171" : "#6b2d2d", badge: hLimiting ? "LIMIT" : null, badgeColor: "#f87171" },
              { label: "piCooling_out", sub: "evaporator", val: m.piC, color: cLimiting ? "#60a5fa" : "#2d4a6b", badge: cLimiting ? "LIMIT" : null, badgeColor: "#60a5fa" },
              { label: "Net Demand", sub: "min(H, C)", val: m.piRaw, color: "#a78bfa" },
              { label: "Load Request", sub: "after soft-start gate", val: m.outputMod, color: "#38bdf8" },
              { label: "Dispatch Signal", sub: sq.inTrans ? "load transfer ramp" : "stable", val: sq.dispatchSignal, color: sq.inTrans ? "#f59e0b" : "#22c55e" },
            ].map(({ label, sub, val, color, badge, badgeColor }) => (
              <div key={label} style={{ background: "#060a12", borderRadius: 4, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#4a90b8", lineHeight: 1.3, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 8, color: "#2d3748", marginBottom: 6, lineHeight: 1.2 }}>{sub}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: active ? color : "#1f2937", lineHeight: 1 }}>
                  {active ? Math.round(val * 100) : "—"}
                </div>
                <div style={{ fontSize: 8, color: "#374151", marginBottom: 5 }}>%</div>
                <Bar value={val} color={active ? color : "#1a2744"} height={4} />
                {badge && <div style={{ marginTop: 5, fontSize: 7, fontWeight: 700, color: badgeColor, border: `1px solid ${badgeColor}`, borderRadius: 8, padding: "1px 4px" }}>{badge}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {[
              { label: `Add ≥ ${Math.round(ADD_THR * 100)}%`, hit: addCond, color: "#f59e0b" },
              { label: `Sub ≤ ${Math.round(subThr * 100)}%`, hit: subCond, color: "#38bdf8" },
              { label: "minMod floor active", hit: active && m.outputMod <= minMod + 0.001, color: "#c084fc" },
              { label: sq.inTrans ? "Load transfer ramp" : "Seq stable", hit: !!sq.inTrans, color: "#f59e0b" },
            ].map(({ label, hit, color }) => (
              <div key={label} style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 3, background: hit ? `${color}15` : "#060a12", border: `1px solid ${hit ? color : "#1a2744"}`, transition: "all 0.3s" }}>
                <div style={{ fontSize: 8, color: hit ? color : "#2d3748", fontWeight: hit ? 700 : 400 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
