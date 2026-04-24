/**
 * Montreal Imaging Stress Task (MIST)
 *
 * Workflow:
 *   Welcome → Training (skippable) → Control → Rest (skippable) → Experimental → Summary
 *
 * Supabase is used for real-time persistent storage.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const SUPABASE_URL   = "https://frdjogmhhjpmksciaieo.supabase.co";
const SUPABASE_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyZGpvZ21oaGpwbWtzY2lhaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjY2NjYsImV4cCI6MjA5MjQ0MjY2Nn0.T0Bqt709IUrXpKLiClZHca2pgJfcGIc-BkIQmJOcuLc";

const DB = {
  async insert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(table, id, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(data),
    });
  },
};
const DB_ON = SUPABASE_URL !== "YOUR_SUPABASE_URL";

/* ─────────────────────────────────────────────────────────
   PROTOCOL CONSTANTS
───────────────────────────────────────────────────────── */
// Control first (clean baseline), then Rest (cortisol recovery),
// then Experimental (stress induction last so it cannot contaminate baseline).
const CONDITION_ORDER = ["control", "rest", "experimental"];

const TRAINING_SECS   = 60;   // per difficulty level during training
const BLOCK_SECS      = 120;  // 2 min per difficulty block (control / experimental)
const REST_SECS       = 120;  // 2 min rest (one block, skippable)
const FEEDBACK_MS     = 500;  // how long to show correct/incorrect
const FAKE_OTHERS_PCT = 84;   // simulated "others" accuracy shown in experimental
const DEFAULT_TO      = { 1: 15, 2: 17, 3: 20, 4: 23, 5: 26 }; // seconds

/* ─────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────── */
const C = {
  bg:      "#F8F7F4",
  card:    "#FFFFFF",
  border:  "#E2E8F0",
  text:    "#1E293B",
  sub:     "#64748B",
  muted:   "#94A3B8",
  navy:    "#1B4F72",
  navyDk:  "#163f5c",
  amber:   "#D97706",
  amberLt: "#FEF3C7",
  green:   "#059669",
  red:     "#DC2626",
  redLt:   "#FEE2E2",
};
const COND_COLOR = { experimental: "#DC2626", control: "#1B4F72", rest: "#059669" };
const COND_LABEL = { experimental: "Experimental", control: "Control", rest: "Rest" };

const SERIF = "'DM Serif Display', serif";
const SANS  = "'DM Sans', sans-serif";
const MONO  = "'IBM Plex Mono', monospace";

/* ─────────────────────────────────────────────────────────
   INJECT GLOBAL CSS ONCE  (fonts + keyframes)
───────────────────────────────────────────────────────── */
if (!document.getElementById("mist-global-styles")) {
  const el = document.createElement("style");
  el.id = "mist-global-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #F8F7F4; font-family: 'DM Sans', sans-serif; }
    button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
    @keyframes fadeUp  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
    @keyframes popIn   { from { opacity:0; transform:scale(.88) } to { opacity:1; transform:scale(1) } }
    @keyframes shake   { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
    .fade-up  { animation: fadeUp  .42s ease both; }
    .pop-in   { animation: popIn   .28s cubic-bezier(.34,1.56,.64,1) both; }
    .shake    { animation: shake   .3s ease; }
  `;
  document.head.appendChild(el);
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
const rnd    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick   = arr => arr[rnd(0, arr.length - 1)];
const shufl  = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=rnd(0,i);[a[i],a[j]]=[a[j],a[i]];}return a; };

/** Generate an arithmetic problem whose single-digit answer is 0–9 */
function genProblem(level) {
  for (let attempt = 0; attempt < 8000; attempt++) {
    let txt, ans;
    const op = () => (Math.random() > .5 ? "+" : "-");
    if (level === 1) {
      const a = rnd(1,9), b = rnd(0,8), o = op();
      ans = o==="+" ? a+b : a-b;  txt = `${a} ${o} ${b}`;
    } else if (level === 2) {
      const a = rnd(10,20), b = rnd(1,19), o = op();
      ans = o==="+" ? a+b : a-b;  txt = `${a} ${o} ${b}`;
    } else if (level === 3) {
      const a=rnd(5,15), b=rnd(1,10), c=rnd(1,10), o1=op(), o2=op();
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c;
      ans=r; txt=`${a} ${o1} ${b} ${o2} ${c}`;
    } else if (level === 4) {
      const a=rnd(20,50), b=rnd(5,20), c=rnd(5,20), o1=op(), o2=op();
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c;
      ans=r; txt=`${a} ${o1} ${b} ${o2} ${c}`;
    } else {
      const a=rnd(30,60), b=rnd(10,25), c=rnd(5,20), d=rnd(1,10);
      const o1=op(), o2=op(), o3=op();
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c; r=o3==="+"?r+d:r-d;
      ans=r; txt=`${a} ${o1} ${b} ${o2} ${c} ${o3} ${d}`;
    }
    if (ans >= 0 && ans <= 9) return { text: `${txt} = ?`, answer: ans };
  }
  return { text: "3 + 4 = ?", answer: 7 };
}

/** Compute accuracy / mean RT from an array of trial objects */
const mkStats = trials => {
  if (!trials?.length) return { acc: 0, meanRT: 0, n: 0, correct: 0 };
  const ok  = trials.filter(t => t.correct && !t.timeout);
  const rts = ok.map(t => t.rt).filter(Boolean);
  return {
    acc:     Math.round((ok.length / trials.length) * 100),
    meanRT:  rts.length ? Math.round(rts.reduce((s,v)=>s+v,0)/rts.length) : 0,
    n:       trials.length,
    correct: ok.length,
  };
};

/* ─────────────────────────────────────────────────────────
   SMALL SHARED UI  (defined at MODULE level — never inside a component)
───────────────────────────────────────────────────────── */

const Chip = ({ label, color }) => (
  <span style={{
    display:"inline-block", padding:"3px 11px", borderRadius:20,
    fontSize:11, fontWeight:600, letterSpacing:".07em",
    background:`${color}18`, color, border:`1px solid ${color}28`, fontFamily:SANS,
  }}>{label}</span>
);

const GoldRule = () => (
  <div style={{ display:"flex", alignItems:"center", gap:6, margin:"14px 0 20px" }}>
    <div style={{ width:28, height:2, background:C.amber, borderRadius:1 }}/>
    <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber, marginTop:-1 }}/>
    <div style={{ width:28, height:2, background:C.amber, borderRadius:1 }}/>
  </div>
);

const BlockBar = ({ value, max, label, height=5 }) => {
  const pct = Math.max(0, (value/max)*100);
  const col = pct>55?C.green:pct>25?C.amber:C.red;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:11, color:C.muted, fontFamily:MONO }}>
        <span>{label}</span><span>{Math.ceil(value)}s</span>
      </div>
      <div style={{ height, background:C.border, borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:col, transition:"width .1s linear, background .4s", borderRadius:4 }}/>
      </div>
    </div>
  );
};

/** Primary action button */
const Btn = ({ onClick, children, color=C.navy, disabled=false, wide=false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding:"12px 30px", background:disabled?"#94A3B8":color,
      color:"#fff", border:"none", borderRadius:10,
      fontSize:15, fontWeight:600, letterSpacing:".02em",
      fontFamily:SANS, opacity:disabled?.6:1, transition:"opacity .18s",
      width:wide?"100%":undefined,
    }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.opacity=".83"; }}
    onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}
  >{children}</button>
);

/** Ghost skip button */
const SkipBtn = ({ onClick, label="Skip →" }) => (
  <button
    onClick={onClick}
    style={{
      background:"transparent", border:`1.5px solid ${C.border}`,
      color:C.sub, borderRadius:8, padding:"11px 22px", fontSize:13,
      fontFamily:SANS, transition:"all .18s",
    }}
    onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.amber; e.currentTarget.style.color=C.amber; }}
    onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.sub; }}
  >{label}</button>
);

/* ─────────────────────────────────────────────────────────
   CIRCULAR DIAL
───────────────────────────────────────────────────────── */
function CircularDial({ value, onChange, disabled }) {
  const cx=115, cy=115, r=78;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <div style={{ fontSize:10.5, color:C.muted, letterSpacing:".08em", fontFamily:SANS }}>
        LEFT CLICK ↻&nbsp;&nbsp;·&nbsp;&nbsp;RIGHT CLICK ↺
      </div>
      <svg
        width={230} height={230}
        onClick={e=>{ e.preventDefault(); if(!disabled) onChange((value+1)%10); }}
        onContextMenu={e=>{ e.preventDefault(); if(!disabled) onChange((value-1+10)%10); }}
        style={{ cursor:disabled?"not-allowed":"pointer", userSelect:"none", opacity:disabled?.5:1 }}
      >
        <circle cx={cx} cy={cy} r={r+30} fill="#F1F5F9" stroke={C.border} strokeWidth={1}/>
        {[0,1,2,3,4,5,6,7,8,9].map(n=>{
          const angle=(n*36-90)*Math.PI/180;
          const x=cx+r*Math.cos(angle), y=cy+r*Math.sin(angle);
          const sel = n===value;
          return (
            <g key={n}>
              <circle cx={x} cy={y} r={19}
                fill={sel?C.amber:C.card}
                stroke={sel?"#F59E0B":C.border}
                strokeWidth={sel?2:1}
                style={{filter:sel?"drop-shadow(0 0 8px rgba(217,119,6,.4))":"drop-shadow(0 1px 2px rgba(0,0,0,.06))"}}
              />
              <text
                x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fill={sel?"#fff":C.sub} fontSize={13} fontWeight={sel?"600":"400"}
                style={{fontFamily:MONO, pointerEvents:"none"}}
              >{n}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={28} fill={C.navy} fillOpacity={.07} stroke={C.navy} strokeWidth={1.5} strokeDasharray="4 3"/>
        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fill={C.navy} fontSize={28} fontWeight="600" style={{fontFamily:MONO}}
        >{value}</text>
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PERFORMANCE COMPARISON BAR  (experimental condition only)
───────────────────────────────────────────────────────── */
function PerfBar({ pct }) {
  return (
    <div style={{ background:"#1E293B", borderRadius:12, padding:"14px 18px", border:"1px solid #334155" }}>
      <div style={{ fontSize:9.5, color:"#64748B", letterSpacing:".1em", marginBottom:10, textTransform:"uppercase", fontFamily:SANS }}>
        Performance
      </div>
      <div style={{ display:"flex", gap:14, alignItems:"flex-end", height:72 }}>
        {[
          { label:"You",    val:Math.min(58, pct), color:"#EF4444" },
          { label:"Others", val:FAKE_OTHERS_PCT,   color:"#10B981" },
        ].map(({label,val,color})=>(
          <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <div style={{ fontSize:9, color:"#94A3B8", fontFamily:MONO }}>{Math.round(val)}%</div>
            <div style={{ width:"100%", height:60, display:"flex", alignItems:"flex-end" }}>
              <div style={{ width:"100%", height:`${val}%`, background:color, borderRadius:"3px 3px 0 0", transition:"height .6s ease", minHeight:3 }}/>
            </div>
            <div style={{ fontSize:9, color:"#64748B", textTransform:"uppercase", letterSpacing:".05em", fontFamily:SANS }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 1 — WELCOME / REGISTRATION
═══════════════════════════════════════════════════════════════ */
function WelcomePage({ onStart }) {
  const [name,  setName]  = useState("");
  const [age,   setAge]   = useState("");
  const [email, setEmail] = useState("");
  const [errs,  setErrs]  = useState({});
  const [tried, setTried] = useState(false);

  const validate = (n, a, e) => {
    const v = {};
    if (!n.trim())                               v.name  = "Full name is required";
    if (!a || isNaN(+a) || +a<18 || +a>100)     v.age   = "Enter a valid age (18–100)";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))  v.email = "Enter a valid email address";
    return v;
  };

  const handleStart = () => {
    const v = validate(name, age, email);
    setTried(true);
    setErrs(v);
    if (!Object.keys(v).length) {
      onStart({ name: name.trim(), age: +age, email: email.trim() });
    }
  };

  // Shared input style factory — called inline, not a component
  const inputStyle = hasErr => ({
    padding: "12px 16px",
    borderRadius: 8,
    border: `1.5px solid ${hasErr ? C.red : C.border}`,
    fontSize: 15,
    color: C.text,
    background: "#FAFAF9",
    fontFamily: SANS,
    width: "100%",
    display: "block",
    WebkitAppearance: "none",
    appearance: "none",
  });

  const labelStyle = {
    display: "block",
    fontSize: 11.5, fontWeight: 600, color: C.sub,
    letterSpacing: ".07em", textTransform: "uppercase",
    fontFamily: SANS, marginBottom: 6,
  };

  const errStyle = { fontSize: 12, color: C.red, fontFamily: SANS, marginTop: 4, display: "block" };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:480, width:"100%" }} className="fade-up">

        {/* Hero */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ display:"inline-flex", gap:8, alignItems:"center", marginBottom:16 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber }}/>
            <span style={{ fontSize:11, letterSpacing:".14em", color:C.muted, textTransform:"uppercase", fontFamily:SANS }}>
              Neuroimaging Research Protocol
            </span>
            <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber }}/>
          </div>
          <h1 style={{ fontSize:40, fontWeight:400, color:C.text, fontFamily:SERIF, margin:"0 0 4px", lineHeight:1.1 }}>
            Montreal Imaging<br/><em>Stress Task</em>
          </h1>
          <div style={{ display:"flex", justifyContent:"center" }}><GoldRule/></div>
          <p style={{ color:C.sub, lineHeight:1.75, fontSize:14, margin:0, maxWidth:370, marginInline:"auto" }}>
            A computerized protocol measuring cognitive performance and psychosocial
            stress responses. Developed at McGill University, 2005.
          </p>
        </div>

        {/* Registration card */}
        <div style={{ background:C.card, borderRadius:18, padding:36, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          <h2 style={{ margin:"0 0 4px", fontSize:20, fontWeight:400, color:C.text, fontFamily:SERIF }}>
            Participant Registration
          </h2>
          <p style={{ margin:"0 0 26px", fontSize:13, color:C.muted, fontFamily:SANS }}>
            All fields are required. Your data is stored securely.
          </p>

          {/* ── Name ── */}
          <div style={{ marginBottom:18 }}>
            <label htmlFor="mist-name" style={labelStyle}>Full Name</label>
            <input
              id="mist-name"
              type="text"
              placeholder="Jane Smith"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle(tried && errs.name)}
            />
            {tried && errs.name && <span style={errStyle}>{errs.name}</span>}
          </div>

          {/* ── Age ── */}
          <div style={{ marginBottom:18 }}>
            <label htmlFor="mist-age" style={labelStyle}>Age</label>
            <input
              id="mist-age"
              type="number"
              placeholder="28"
              autoComplete="off"
              min="18" max="100"
              value={age}
              onChange={e => setAge(e.target.value)}
              style={inputStyle(tried && errs.age)}
            />
            {tried && errs.age && <span style={errStyle}>{errs.age}</span>}
          </div>

          {/* ── Email ── */}
          <div style={{ marginBottom:28 }}>
            <label htmlFor="mist-email" style={labelStyle}>Email Address</label>
            <input
              id="mist-email"
              type="email"
              placeholder="jane@example.com"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle(tried && errs.email)}
            />
            {tried && errs.email && <span style={errStyle}>{errs.email}</span>}
          </div>

          <Btn onClick={handleStart} color={C.navy} wide>Begin Session →</Btn>
        </div>

        {/* Session flow preview */}
        <div style={{ marginTop:22, background:C.card, borderRadius:14, padding:"18px 24px", border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:".1em", textTransform:"uppercase", marginBottom:12, fontFamily:SANS }}>
            What to expect
          </div>
          <div style={{ display:"flex", gap:0, position:"relative" }}>
            {[
              { step:"Training",     note:"skippable", color:C.navy   },
              { step:"Control",      note:"mandatory",  color:C.navy   },
              { step:"Rest",         note:"skippable", color:C.green  },
              { step:"Experimental", note:"mandatory",  color:C.red    },
              { step:"Summary",      note:"",           color:C.amber  },
            ].map(({step,note,color},i,arr)=>(
              <div key={step} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
                {i < arr.length-1 && (
                  <div style={{ position:"absolute", top:10, left:"50%", width:"100%", height:2, background:C.border, zIndex:0 }}/>
                )}
                <div style={{ width:20, height:20, borderRadius:"50%", background:color, zIndex:1, flexShrink:0 }}/>
                <div style={{ fontSize:10.5, fontWeight:600, color:C.text, marginTop:6, textAlign:"center", fontFamily:SANS }}>{step}</div>
                {note && <div style={{ fontSize:9.5, color:C.muted, textAlign:"center", fontFamily:SANS }}>{note}</div>}
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign:"center", fontSize:12, color:C.muted, marginTop:14, lineHeight:1.7, fontFamily:SANS }}>
          Estimated duration: 25–35 minutes.&nbsp; Please be in a quiet environment.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 2 — GENERIC INSTRUCTIONS PAGE
═══════════════════════════════════════════════════════════════ */
function InstructionsPage({ subtitle, title, body, bullets, primaryLabel, onPrimary, skipLabel, onSkip, accent=C.navy }) {
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} className="fade-up">
      <div style={{ maxWidth:620, width:"100%" }}>
        <div style={{ background:C.card, borderRadius:18, padding:44, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          {subtitle && (
            <div style={{ fontSize:11, letterSpacing:".12em", color:C.muted, textTransform:"uppercase", marginBottom:10, fontFamily:SANS }}>
              {subtitle}
            </div>
          )}
          <h2 style={{ margin:"0 0 4px", fontSize:28, fontWeight:400, color:C.text, fontFamily:SERIF, lineHeight:1.2 }}>{title}</h2>
          <div style={{ width:42, height:2.5, background:accent, marginBottom:22, borderRadius:2 }}/>
          {body && <p style={{ color:C.sub, fontSize:14.5, lineHeight:1.8, marginBottom:bullets?24:0, fontFamily:SANS }}>{body}</p>}
          {bullets && (
            <div style={{ display:"flex", flexDirection:"column", gap:13, marginBottom:30 }}>
              {bullets.map((b,i)=>(
                <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{
                    width:26, height:26, borderRadius:"50%", background:accent,
                    color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:700, flexShrink:0, marginTop:1, fontFamily:SANS,
                  }}>{i+1}</div>
                  <p style={{ margin:0, color:C.sub, fontSize:14, lineHeight:1.7, fontFamily:SANS }}>{b}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            <Btn onClick={onPrimary} color={accent}>{primaryLabel}</Btn>
            {onSkip && <SkipBtn onClick={onSkip} label={skipLabel||"Skip →"}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 3 — LEVEL INTRO  (shown before each 2-min block)
═══════════════════════════════════════════════════════════════ */
const LEVEL_DESC = {
  1: "Single-digit arithmetic. Get comfortable with the dial interface.",
  2: "Two-digit operations. A small step up in complexity.",
  3: "Three-operand problems. Work through each step carefully.",
  4: "Larger numbers with multiple operations. Stay focused.",
  5: "Most challenging level. Do your best under time pressure.",
};
const ROM = ["I","II","III","IV","V"];

function LevelIntro({ level, condition, isTraining, onStart, onSkip }) {
  const acc  = isTraining ? C.navy : COND_COLOR[condition];
  const secs = isTraining ? TRAINING_SECS : BLOCK_SECS;
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} className="fade-up">
      <div style={{ maxWidth:440, width:"100%", textAlign:"center" }}>
        <div style={{ background:C.card, borderRadius:18, padding:42, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          <Chip label={isTraining?"TRAINING":COND_LABEL[condition].toUpperCase()} color={acc}/>
          <div style={{ fontSize:54, fontWeight:400, fontFamily:SERIF, color:C.text, margin:"18px 0 6px", lineHeight:1 }}>
            Level {ROM[level-1]}
          </div>
          <p style={{ color:C.sub, fontSize:14, marginBottom:26, fontFamily:SANS, lineHeight:1.65 }}>
            {LEVEL_DESC[level]}
          </p>
          <div style={{ background:C.bg, borderRadius:10, padding:"10px 18px", marginBottom:28, border:`1px solid ${C.border}` }}>
            <span style={{ fontSize:13, color:C.muted, fontFamily:SANS }}>
              Duration: {secs < 60 ? `${secs}s` : `${secs/60} min`}
            </span>
          </div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Btn onClick={onStart} color={acc}>Start Level →</Btn>
            {onSkip && <SkipBtn onClick={onSkip}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 4 — REST SCREEN
═══════════════════════════════════════════════════════════════ */
function RestScreen({ timeLeft, onSkip }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0F172A", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ color:"#334155", fontSize:11, letterSpacing:".14em", fontFamily:SANS, textTransform:"uppercase" }}>Rest Period</div>
      {/* Fixation cross */}
      <div style={{ position:"relative", width:48, height:48, margin:"8px 0" }}>
        <div style={{ position:"absolute", top:"50%", left:0, right:0, height:2, background:"#1E3A5F", transform:"translateY(-50%)" }}/>
        <div style={{ position:"absolute", left:"50%",  top:0, bottom:0, width:2, background:"#1E3A5F", transform:"translateX(-50%)" }}/>
      </div>
      <div style={{ color:"#475569", fontSize:13, fontFamily:MONO }}>{Math.ceil(timeLeft)}s remaining</div>
      <div style={{ marginTop:24 }}>
        <SkipBtn onClick={onSkip} label="Skip Rest →"/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 5 — TASK SCREEN  (control & experimental)
═══════════════════════════════════════════════════════════════ */
function TaskScreen({ condition, level, problem, dial, onDial, onSubmit, feedback, trialTL, trialTO, blockTL, perfPct }) {
  const isExp = condition === "experimental";
  const acc   = COND_COLOR[condition];

  const fbBg    = feedback==="correct"?"#D1FAE5":feedback==="incorrect"?C.redLt:"#FEF3C7";
  const fbBrd   = feedback==="correct"?"#34D399":feedback==="incorrect"?"#F87171":"#F59E0B";
  const fbColor = feedback==="correct"?"#065F46":feedback==="incorrect"?"#7F1D1D":"#78350F";
  const fbMsg   = feedback==="correct"?"✓ Correct":feedback==="incorrect"?"✗ Incorrect":"⚠ Time expired";

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"20px 16px", fontFamily:SANS }}>
      {/* Header row */}
      <div style={{ maxWidth:700, marginInline:"auto", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div style={{ display:"flex", gap:8 }}>
          <Chip label={COND_LABEL[condition].toUpperCase()} color={acc}/>
          <Chip label={`Level ${ROM[level-1]}`} color={C.sub}/>
        </div>
        <span style={{ fontSize:11, color:C.muted, fontFamily:MONO, letterSpacing:".05em" }}>MIST</span>
      </div>

      {/* Block time bar */}
      <div style={{ maxWidth:700, marginInline:"auto", marginBottom:22 }}>
        <BlockBar value={blockTL} max={BLOCK_SECS} label="BLOCK TIME"/>
      </div>

      <div style={{ maxWidth:700, marginInline:"auto", display:"flex", gap:20, alignItems:"flex-start" }}>
        {/* Left column: problem + feedback + answer + dial */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:16 }}>

          {/* Problem card */}
          <div
            className="pop-in"
            key={problem?.text}
            style={{
              background:C.card, borderRadius:16, padding:"26px 30px",
              boxShadow:"0 4px 24px rgba(0,0,0,.07)",
              border:`1.5px solid ${
                feedback==="correct" ? "#34D399" :
                feedback==="incorrect" ? "#F87171" :
                feedback==="timeout" ? "#F59E0B" : C.border
              }`,
              transition:"border-color .3s",
            }}
          >
            <div style={{ fontSize:11, color:C.muted, letterSpacing:".1em", marginBottom:12, textTransform:"uppercase", fontFamily:SANS }}>
              Arithmetic Problem
            </div>
            <div style={{ fontSize:32, fontWeight:600, color:C.text, fontFamily:MONO, textAlign:"center", padding:"14px 0", minHeight:58, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {problem?.text ?? "…"}
            </div>
            {/* Trial timer */}
            <div style={{ marginTop:16 }}>
              <BlockBar value={trialTL} max={trialTO} label="TIME LIMIT" height={8}/>
            </div>
          </div>

          {/* Feedback strip */}
          {feedback && (
            <div
              className={feedback==="incorrect"?"shake":""}
              style={{ borderRadius:12, padding:"12px 20px", fontSize:14, fontWeight:600, textAlign:"center", fontFamily:SANS, background:fbBg, border:`1.5px solid ${fbBrd}`, color:fbColor }}
            >
              {fbMsg}
            </div>
          )}

          {/* Answer display + submit */}
          <div style={{ background:C.card, borderRadius:14, padding:"18px 22px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:20 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6, fontFamily:SANS }}>
                Your Answer
              </div>
              <div style={{ fontSize:38, fontWeight:600, color:C.navy, fontFamily:MONO, width:54, height:54, borderRadius:12, background:C.amberLt, border:`2px solid ${C.amber}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {dial}
              </div>
            </div>
            <Btn onClick={onSubmit} color={C.navy} disabled={!!feedback}>Submit</Btn>
          </div>

          {/* Circular dial */}
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", justifyContent:"center" }}>
            <CircularDial value={dial} onChange={onDial} disabled={!!feedback}/>
          </div>
        </div>

        {/* Right column: performance bar (experimental only) */}
        {isExp && (
          <div style={{ width:158, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <PerfBar pct={perfPct}/>
            <div style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 13px", border:"1px solid #FECACA", fontSize:12, color:"#B91C1C", lineHeight:1.55, fontFamily:SANS }}>
              ⚠ Performance significantly below group average.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCREEN 6 — SUMMARY  (Control vs Experimental comparison)
═══════════════════════════════════════════════════════════════ */
function SummaryPage({ participant, allTrials, onReset }) {
  const expT  = allTrials.filter(t => t.condition==="experimental");
  const ctrlT = allTrials.filter(t => t.condition==="control");
  const expS  = mkStats(expT);
  const ctrlS = mkStats(ctrlT);
  const allTC = [...expT,...ctrlT];
  const over  = mkStats(allTC);

  // Stress impact: % drop in accuracy from control → experimental
  const stressDelta = ctrlS.acc > 0
    ? Math.round(((ctrlS.acc - expS.acc) / ctrlS.acc) * 100)
    : 0;

  // Per-level chart data
  const lvlData = [1,2,3,4,5].map(lv=>({
    name: `L${lv}`,
    Control:      mkStats(ctrlT.filter(t=>t.level===lv)).acc,
    Experimental: mkStats(expT.filter(t=>t.level===lv)).acc,
  }));

  // Personalised insights
  const insights = [];
  if (stressDelta > 15) {
    insights.push({ icon:"🧠", title:"Stress sensitivity detected",
      body:`Your accuracy dropped ~${stressDelta}% under social-comparison pressure — a completely normal physiological response. Consistent mindfulness practice and timed arithmetic drills (10 min/day) are the most evidence-backed tools for building stress resilience over weeks.` });
  } else if (stressDelta > 5) {
    insights.push({ icon:"✨", title:"Good stress resilience",
      body:`Your accuracy held reasonably well under pressure (${stressDelta}% difference). Continue with regular timed practice to narrow that gap further. Even 10 minutes of focused daily drill makes a measurable difference.` });
  } else {
    insights.push({ icon:"🏅", title:"Excellent stress resilience",
      body:`Your performance was nearly identical across both conditions — a strong signal of robust working memory and effective stress regulation. Consider more complex cognitive challenges to keep growing.` });
  }

  const weakLevels = [1,2,3,4,5].filter(lv =>
    mkStats(allTC.filter(t=>t.level===lv)).acc < 55 &&
    allTC.filter(t=>t.level===lv).length > 0
  );
  if (weakLevels.length) {
    insights.push({ icon:"📐",
      title:`Strengthen: Level${weakLevels.length>1?"s":""} ${weakLevels.map(l=>ROM[l-1]).join(", ")}`,
      body:`These difficulty levels were particularly challenging. Daily 10–15 min practice with multi-step mental arithmetic will meaningfully improve both accuracy and speed over a few weeks. Start slow and gradually reduce your self-imposed time budget.` });
  }

  const toRate = allTC.length ? allTrials.filter(t=>t.timeout).length / allTC.length : 0;
  if (toRate > 0.2) {
    insights.push({ icon:"⏱", title:"Response speed opportunity",
      body:`More than 1 in 5 problems exceeded the time limit. "Beat the clock" drills — 10 problems with a gradually shrinking time budget — are highly effective for improving processing speed. Start with generous limits and tighten weekly.` });
  }

  if (expS.acc > 68) {
    insights.push({ icon:"💪", title:"Strong performance under social pressure",
      body:`Maintaining ${expS.acc}% accuracy in the experimental condition despite negative social-comparison feedback is commendable. Your working memory appears robust under evaluative pressure.` });
  }

  // RT comparison
  const rtDelta = ctrlS.meanRT > 0 && expS.meanRT > 0 ? expS.meanRT - ctrlS.meanRT : null;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"32px 16px", fontFamily:SANS }}>
      <div style={{ maxWidth:740, marginInline:"auto" }} className="fade-up">

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:38 }}>
          <div style={{ fontSize:11, letterSpacing:".14em", color:C.muted, textTransform:"uppercase", marginBottom:12 }}>
            Session Complete
          </div>
          <h1 style={{ fontSize:36, fontWeight:400, fontFamily:SERIF, color:C.text, margin:0 }}>
            Your Results,&nbsp;<em>{participant.name.split(" ")[0]}</em>
          </h1>
          <div style={{ display:"flex", justifyContent:"center" }}><GoldRule/></div>
          <p style={{ color:C.sub, fontSize:14, margin:0, fontFamily:SANS, lineHeight:1.7 }}>
            Control condition completed first (your clean baseline), then Experimental (under social stress).<br/>
            The comparison below shows how stress affected your cognitive performance.
          </p>
        </div>

        {/* Top metric cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:13, marginBottom:24 }}>
          {[
            { label:"Overall Accuracy",  val:`${over.acc}%`,           sub:"Control + Experimental",        col:C.navy  },
            { label:"Stress Impact",     val:`${Math.abs(stressDelta)}%`, sub:stressDelta>=0?"accuracy drop under stress":"accuracy boost under stress", col:stressDelta>15?C.red:stressDelta>5?C.amber:C.green },
            { label:"Total Trials",      val:allTC.length,              sub:`${over.correct} correct`,       col:C.sub   },
          ].map(({label,val,sub,col})=>(
            <div key={label} style={{ background:C.card, borderRadius:14, padding:"18px 20px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:".07em", textTransform:"uppercase", marginBottom:8 }}>{label}</div>
              <div style={{ fontSize:32, fontWeight:600, fontFamily:MONO, color:col, lineHeight:1 }}>{val}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:5, lineHeight:1.4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Per-condition cards */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13, marginBottom:24 }}>
          {/* Control first (matches protocol order) */}
          {["control","experimental"].map(cond=>{
            const s = cond==="control" ? ctrlS : expS;
            return (
              <div key={cond} style={{ background:C.card, borderRadius:14, padding:"22px 26px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`2px solid ${COND_COLOR[cond]}22` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <Chip label={COND_LABEL[cond].toUpperCase()} color={COND_COLOR[cond]}/>
                    {cond==="control" && <div style={{ fontSize:11, color:C.muted, marginTop:6, fontFamily:SANS }}>Baseline (no stress)</div>}
                    {cond==="experimental" && <div style={{ fontSize:11, color:C.muted, marginTop:6, fontFamily:SANS }}>Under social comparison pressure</div>}
                    <div style={{ marginTop:10, fontSize:30, fontWeight:600, fontFamily:MONO }}>{s.acc}%</div>
                    <div style={{ fontSize:12, color:C.muted }}>accuracy</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:".05em", marginBottom:4 }}>Mean RT</div>
                    <div style={{ fontSize:22, fontWeight:600, fontFamily:MONO, color:C.sub }}>
                      {s.meanRT>0 ? `${(s.meanRT/1000).toFixed(2)}s` : "—"}
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{s.correct}/{s.n} correct</div>
                  </div>
                </div>
                <div style={{ height:5, background:C.border, borderRadius:3 }}>
                  <div style={{ width:`${s.acc}%`, height:"100%", background:COND_COLOR[cond], borderRadius:3 }}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* RT comparison note */}
        {rtDelta !== null && (
          <div style={{ background:C.card, borderRadius:14, padding:"16px 22px", border:`1px solid ${C.border}`, marginBottom:24, display:"flex", gap:16, alignItems:"center" }}>
            <div style={{ fontSize:22 }}>⚡</div>
            <p style={{ margin:0, color:C.sub, fontSize:13.5, lineHeight:1.65, fontFamily:SANS }}>
              Under stress your mean response time was&nbsp;
              <strong style={{ color:rtDelta>0?C.red:C.green }}>
                {Math.abs(rtDelta)}ms {rtDelta>0?"slower":"faster"}
              </strong>
              &nbsp;than in the control condition ({(ctrlS.meanRT/1000).toFixed(2)}s control vs {(expS.meanRT/1000).toFixed(2)}s experimental).
              {rtDelta>200?" Stress often increases response latency alongside accuracy drops.":rtDelta<-100?" Interestingly, you were faster under pressure — some people experience facilitated performance under mild arousal.":" This is a small difference and within the normal range."}
            </p>
          </div>
        )}

        {/* Level-by-level chart */}
        <div style={{ background:C.card, borderRadius:16, padding:"26px 28px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, marginBottom:24 }}>
          <h3 style={{ margin:"0 0 18px", fontSize:18, fontWeight:400, fontFamily:SERIF }}>
            Accuracy by Difficulty Level: Control vs Experimental
          </h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={lvlData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name"  tick={{fill:C.sub, fontFamily:MONO, fontSize:12}}/>
              <YAxis domain={[0,100]} tick={{fill:C.sub, fontFamily:MONO, fontSize:11}} unit="%"/>
              <Tooltip
                contentStyle={{borderRadius:10, border:`1px solid ${C.border}`, fontFamily:SANS, fontSize:13}}
                formatter={v=>[`${v}%`]}
              />
              <Legend wrapperStyle={{fontFamily:SANS, fontSize:13}}/>
              <Bar dataKey="Control"      fill={C.navy} radius={[4,4,0,0]}/>
              <Bar dataKey="Experimental" fill={C.red}  radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Personalised insights */}
        <div style={{ marginBottom:32 }}>
          <h3 style={{ fontSize:20, fontWeight:400, fontFamily:SERIF, color:C.text, marginBottom:16 }}>
            Personalised Insights
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {insights.map((t,i)=>(
              <div key={i} style={{ background:C.card, borderRadius:14, padding:"20px 22px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", gap:16, alignItems:"flex-start" }}>
                <div style={{ fontSize:26, lineHeight:1, flexShrink:0 }}>{t.icon}</div>
                <div>
                  <div style={{ fontWeight:600, color:C.text, marginBottom:5, fontSize:14.5 }}>{t.title}</div>
                  <p style={{ margin:0, color:C.sub, fontSize:13.5, lineHeight:1.72 }}>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Protocol disclosure */}
        <div style={{ background:"#EFF6FF", borderRadius:14, padding:"18px 22px", border:"1px solid #BFDBFE", marginBottom:28 }}>
          <div style={{ fontWeight:600, color:"#1E3A8A", marginBottom:5, fontSize:14 }}>A note on this task</div>
          <p style={{ margin:0, color:"#1D4ED8", fontSize:13, lineHeight:1.72 }}>
            The MIST intentionally induces mild, temporary stress in a controlled research context.
            Any performance differences between conditions are a completely normal physiological response —
            not a reflection of your intelligence or ability. The "Others" performance bar shown during the
            experimental condition was a <em>simulated value</em>, as specified in the published MIST protocol
            (Dedovic et al., 2005). If you have any concerns about how you're feeling, please speak with
            the administering researcher.
          </p>
        </div>

        <div style={{ textAlign:"center" }}>
          <Btn onClick={onReset} color={C.navy}>Register New Participant</Btn>
          <p style={{ fontSize:12, color:C.muted, marginTop:10, fontFamily:SANS }}>
            Starts a fresh session. This participant's data has been saved.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP  —  State machine + timers
═══════════════════════════════════════════════════════════════ */
export default function MISTApp() {

  /* ── phase drives all navigation ── */
  const [phase,        setPhase]        = useState("welcome");
  const [participant,  setParticipant]  = useState(null);

  /* Training */
  const [trLvIdx,    setTrLvIdx]    = useState(0);           // 0–4
  const [trSubPhase, setTrSubPhase] = useState("intro");     // intro | running
  const [trainTOs,   setTrainTOs]   = useState({...DEFAULT_TO}); // personalised seconds
  const trainTOsRef  = useRef({...DEFAULT_TO});              // always in sync
  const trTrialsRef  = useRef({});

  /* Conditions — fixed order, index walks through CONDITION_ORDER */
  const [condIdx,      setCondIdx]      = useState(0);
  const [blkOrder,     setBlkOrder]     = useState(()=>shufl([1,2,3,4,5]));
  const [blkIdx,       setBlkIdx]       = useState(0);
  const [condSubPhase, setCondSubPhase] = useState("level_intro");

  /* Task UI */
  const [problem,   setProblem]   = useState(null);
  const [dial,      setDial]      = useState(0);
  const [feedback,  setFeedback]  = useState(null);
  const [blockTL,   setBlockTL]   = useState(BLOCK_SECS);
  const [trialTL,   setTrialTL]   = useState(15);
  const [trialTO,   setTrialTO]   = useState(15);
  const [perfPct,   setPerfPct]   = useState(50);
  const [allTrials, setAllTrials] = useState([]);

  /* Mutable refs — never trigger re-renders */
  const blockIv   = useRef(null);
  const trialIv   = useRef(null);
  const fbTimer   = useRef(null);
  const blockTime = useRef(BLOCK_SECS);
  const trialTout = useRef(15);
  const trialT0   = useRef(0);
  const dialRef   = useRef(0);
  const probRef   = useRef(null);
  const fbActive  = useRef(false);
  const condR     = useRef("control");
  const levelR    = useRef(1);
  const blkTrials = useRef([]);
  const adaptTO       = useRef(15);
  const sessionId     = useRef(null);
  // Accumulates every control trial so we can compute per-level mean RTs at the end of control
  const controlTrials = useRef([]);
  // Per-level timeout (seconds) derived from control mean correct RT — seeds experimental
  const controlTOsRef = useRef({});

  useEffect(() => { trainTOsRef.current = trainTOs; }, [trainTOs]);

  const killTimers = () => {
    clearInterval(blockIv.current);
    clearInterval(trialIv.current);
    clearTimeout(fbTimer.current);
  };

  /* ── Database helpers ── */
  const dbCreateSession = async p => {
    if (!DB_ON) return null;
    try {
      const rows = await DB.insert("mist_sessions", {
        participant_name:  p.name,
        participant_age:   p.age,
        participant_email: p.email,
        session_start:     new Date().toISOString(),
      });
      return rows[0]?.id ?? null;
    } catch { return null; }
  };

  const dbInsertTrial = t => {
    if (!DB_ON || !sessionId.current) return;
    DB.insert("mist_trials", {
      session_id:       sessionId.current,
      condition:        t.condition,
      level:            t.level,
      problem:          t.problem,
      correct_answer:   t.correctAnswer,
      submitted_answer: t.submitted,
      is_correct:       t.correct,
      is_timeout:       t.timeout,
      response_time_ms: t.rt,
      trial_timestamp:  new Date(t.timestamp).toISOString(),
    }).catch(()=>{});
  };

  const dbFinalise = trials => {
    if (!DB_ON || !sessionId.current) return;
    const eS = mkStats(trials.filter(t=>t.condition==="experimental"));
    const cS = mkStats(trials.filter(t=>t.condition==="control"));
    DB.patch("mist_sessions", sessionId.current, {
      session_end:          new Date().toISOString(),
      condition_order:      CONDITION_ORDER,
      training_timeouts_s:  trainTOsRef.current,
      overall_accuracy:     mkStats(trials).acc,
      exp_accuracy:         eS.acc,
      control_accuracy:     cS.acc,
      exp_mean_rt_ms:       eS.meanRT,
      control_mean_rt_ms:   cS.meanRT,
    }).catch(()=>{});
  };

  /* ── Trial lifecycle ── */
  const startNextTrial = useCallback(() => {
    if (fbActive.current) return;
    const prb  = genProblem(levelR.current);
    const tout = adaptTO.current;
    probRef.current  = prb;
    trialTout.current = tout;
    trialT0.current  = Date.now();
    setProblem(prb);
    setDial(0); dialRef.current = 0;
    setFeedback(null);
    setTrialTL(tout); setTrialTO(tout);
    clearInterval(trialIv.current);
    let e = 0;
    trialIv.current = setInterval(() => {
      e += 0.1;
      const left = trialTout.current - e;
      setTrialTL(Math.max(0, left));
      if (left <= 0) { clearInterval(trialIv.current); endTrial(null, true); }
    }, 100);
  }, []); // eslint-disable-line

  const endTrial = useCallback((submitted, timedOut) => {
    if (fbActive.current) return;
    fbActive.current = true;
    clearInterval(trialIv.current);

    const rt      = timedOut ? 0 : Date.now() - trialT0.current;
    const correct = !timedOut && submitted === probRef.current?.answer;
    setFeedback(timedOut?"timeout":correct?"correct":"incorrect");

    // Adaptive timeout (experimental condition only)
    if (condR.current === "experimental") {
      if (correct)  adaptTO.current = Math.max(4,  adaptTO.current * 0.93);
      if (timedOut) adaptTO.current = Math.min(30, adaptTO.current * 1.06);
    }

    const trial = {
      condition:     condR.current,
      level:         levelR.current,
      problem:       probRef.current?.text,
      correctAnswer: probRef.current?.answer,
      submitted:     timedOut ? null : submitted,
      correct, timeout: timedOut, rt,
      timestamp: Date.now(),
    };

    blkTrials.current = [...blkTrials.current, trial];
    // Keep a running log of all control trials for timeout derivation
    if (trial.condition === "control") controlTrials.current.push(trial);
    setAllTrials(prev => {
      const up = [...prev, trial];
      const recent = up.filter(t=>t.condition==="experimental").slice(-10);
      if (recent.length) {
        setPerfPct(Math.min(58, Math.max(20, recent.filter(t=>t.correct).length / recent.length * 100)));
      }
      return up;
    });
    dbInsertTrial(trial);

    fbTimer.current = setTimeout(() => {
      fbActive.current = false;
      setFeedback(null);
      if (blockTime.current > 1.5) startNextTrial();
    }, FEEDBACK_MS);
  }, [startNextTrial]); // eslint-disable-line

  /* ─── advanceFn — stored in ref so setInterval closures always call latest ─── */
  const advanceFn = useRef(null);
  advanceFn.current = (cIdx, bIdx, bOrd) => {
    const cond    = CONDITION_ORDER[cIdx];
    const isRest  = cond === "rest";
    const maxBlks = isRest ? 1 : bOrd.length;

    if (bIdx < maxBlks - 1) {
      // More blocks in this condition
      setBlkIdx(bIdx + 1);
      setCondSubPhase("level_intro");
    } else if (cIdx < CONDITION_ORDER.length - 1) {
      // This condition is fully done — if it was control, derive per-level timeouts now
      if (cond === "control") {
        const derived = {};
        [1,2,3,4,5].forEach(lv => {
          const ok = controlTrials.current.filter(t => t.level === lv && t.correct && !t.timeout && t.rt > 0);
          if (ok.length > 0) {
            const meanS = ok.reduce((s,t) => s + t.rt, 0) / ok.length / 1000;
            // Add a 20 % buffer so participants aren't immediately timed out
            derived[lv] = Math.max(4, +(meanS * 1.2).toFixed(1));
          } else {
            // No correct responses for this level — fall back to training or default
            derived[lv] = trainTOsRef.current[lv] ?? DEFAULT_TO[lv] ?? 15;
          }
        });
        controlTOsRef.current = derived;
      }

      // Move to next condition
      const nextCI   = cIdx + 1;
      const nextCond = CONDITION_ORDER[nextCI];
      const newBOrd  = shufl([1,2,3,4,5]);
      setCondIdx(nextCI);
      setBlkIdx(0);
      setBlkOrder(newBOrd);
      setCondSubPhase(nextCond === "rest" ? "running" : "level_intro");
      setPhase("instructions_condition");
    } else {
      // All conditions done
      setAllTrials(prev => { dbFinalise(prev); return prev; });
      setPhase("summary");
    }
  };

  /* ─── startCondBlock — also in ref ─── */
  const startCondBlockFn = useRef(null);
  startCondBlockFn.current = (cIdx, bIdx, bOrd) => {
    const cond  = CONDITION_ORDER[cIdx];
    const lv    = cond === "rest" ? 1 : (bOrd[bIdx] ?? 1);
    condR.current    = cond;
    levelR.current   = lv;
    blkTrials.current = [];
    fbActive.current  = false;

    // Timeout priority: control-derived → training-derived → protocol default
    // For experimental: always start from control mean RT (+ buffer), never training.
    // For control itself: training → default.
    if (cond === "experimental") {
      adaptTO.current = controlTOsRef.current[lv] ?? trainTOsRef.current[lv] ?? DEFAULT_TO[lv] ?? 15;
    } else {
      adaptTO.current = trainTOsRef.current[lv] ?? DEFAULT_TO[lv] ?? 15;
    }
    setPerfPct(50);

    const dur = cond === "rest" ? REST_SECS : BLOCK_SECS;
    blockTime.current = dur;
    setBlockTL(dur);
    killTimers();

    blockIv.current = setInterval(() => {
      blockTime.current -= 0.1;
      setBlockTL(t => Math.max(0, t - 0.1));
      if (blockTime.current <= 0) {
        killTimers();
        fbActive.current = false;
        advanceFn.current(cIdx, bIdx, bOrd);
      }
    }, 100);

    if (cond !== "rest") startNextTrial();
  };

  /* ─── startTrainingFn ─── */
  const startTrainingFn = useRef(null);
  startTrainingFn.current = lvIdx => {
    const lv = lvIdx + 1;
    levelR.current    = lv;
    condR.current     = "training";
    blkTrials.current = [];
    fbActive.current  = false;
    adaptTO.current   = DEFAULT_TO[lv];
    blockTime.current = TRAINING_SECS;
    setBlockTL(TRAINING_SECS);
    killTimers();

    blockIv.current = setInterval(() => {
      blockTime.current -= 0.1;
      setBlockTL(t => Math.max(0, t - 0.1));
      if (blockTime.current <= 0) {
        killTimers();
        const ok = blkTrials.current.filter(t => t.correct && !t.timeout && t.rt > 0);
        const meanS = ok.length
          ? ok.reduce((s,t)=>s+t.rt,0) / ok.length / 1000
          : DEFAULT_TO[lv];
        const newTO = Math.max(5, +(meanS * 1.25).toFixed(1));
        trTrialsRef.current[lv] = blkTrials.current;

        setTrainTOs(prev => {
          const up = { ...prev, [lv]: newTO };
          trainTOsRef.current = up;
          return up;
        });
        fbActive.current = false;

        if (lvIdx < 4) {
          setTrLvIdx(lvIdx + 1);
          setTrSubPhase("intro");
        } else {
          // Training complete → first condition is "control"
          setCondIdx(0);
          setBlkIdx(0);
          setBlkOrder(shufl([1,2,3,4,5]));
          setPhase("instructions_condition");
        }
      }
    }, 100);

    startNextTrial();
  };

  /* ── Effects ── */
  useEffect(() => {
    if (phase === "training" && trSubPhase === "running")
      startTrainingFn.current(trLvIdx);
  }, [phase, trSubPhase, trLvIdx]);

  useEffect(() => {
    if (phase === "condition" && condSubPhase === "running")
      startCondBlockFn.current(condIdx, blkIdx, blkOrder);
  }, [phase, condSubPhase, condIdx, blkIdx]); // eslint-disable-line

  useEffect(() => () => killTimers(), []);

  /* ── Action handlers ── */
  const handleSubmit = useCallback(() => {
    if (fbActive.current || !probRef.current) return;
    endTrial(dialRef.current, false);
  }, [endTrial]);

  const handleDial = useCallback(v => { dialRef.current = v; setDial(v); }, []);

  const skipRest = () => {
    killTimers(); fbActive.current = false;
    advanceFn.current(condIdx, blkIdx, blkOrder);
  };

  const skipTrainingLv = () => {
    killTimers(); fbActive.current = false;
    if (trLvIdx < 4) { setTrLvIdx(trLvIdx+1); setTrSubPhase("intro"); }
    else {
      setCondIdx(0); setBlkIdx(0); setBlkOrder(shufl([1,2,3,4,5]));
      setPhase("instructions_condition");
    }
  };

  const handleRegister = async p => {
    setParticipant(p);
    const sid = await dbCreateSession(p);
    sessionId.current = sid;
    setPhase("instructions_training");
  };

  const handleReset = () => {
    killTimers();
    setPhase("welcome"); setParticipant(null); sessionId.current = null;
    setAllTrials([]); setTrLvIdx(0); setTrSubPhase("intro");
    setTrainTOs({...DEFAULT_TO}); trainTOsRef.current = {...DEFAULT_TO};
    setCondIdx(0); setBlkIdx(0); setBlkOrder(shufl([1,2,3,4,5])); setCondSubPhase("level_intro");
    trTrialsRef.current = {}; blkTrials.current = []; fbActive.current = false;
    controlTrials.current = {}; controlTOsRef.current = {};
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER  —  phase-driven
  ═══════════════════════════════════════════════════════════════ */

  /* 1 — Welcome */
  if (phase === "welcome") return <WelcomePage onStart={handleRegister}/>;

  /* 2 — Training instructions */
  if (phase === "instructions_training") return (
    <InstructionsPage
      subtitle="Step 1 of 5 · Optional"
      title="Training Session"
      body="Work through all five difficulty levels for 60 seconds each. This familiarises you with the dial interface and calibrates your personal response-time limits for the main task. You may skip training to use default time limits."
      bullets={[
        "Problems appear on screen. Solve each one mentally.",
        "Use the circular dial to select your single-digit answer: left-click moves clockwise; right-click counterclockwise.",
        "Press Submit once your answer is selected. Work as quickly and accurately as you can.",
        "If the countdown timer reaches zero the problem advances automatically — that is fine.",
        "Your mean response time per level becomes the time budget for that level in the main task.",
      ]}
      primaryLabel="Start Training →"
      onPrimary={() => { setTrLvIdx(0); setTrSubPhase("intro"); setPhase("training"); }}
      skipLabel="Skip Training (use defaults)"
      onSkip={() => { setCondIdx(0); setBlkIdx(0); setBlkOrder(shufl([1,2,3,4,5])); setPhase("instructions_condition"); }}
    />
  );

  /* 3 — Training running */
  if (phase === "training") {
    if (trSubPhase === "intro") return (
      <LevelIntro level={trLvIdx+1} condition="control" isTraining onStart={()=>setTrSubPhase("running")} onSkip={skipTrainingLv}/>
    );
    return (
      <>
        <TaskScreen
          condition="control" level={trLvIdx+1} problem={problem}
          dial={dial} onDial={handleDial} onSubmit={handleSubmit}
          feedback={feedback} trialTL={trialTL} trialTO={trialTO}
          blockTL={blockTL} perfPct={50}
        />
        {/* Training badge + in-task skip */}
        <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", background:C.amberLt, padding:"5px 18px", borderRadius:"0 0 10px 10px", fontSize:12, color:"#92400E", fontFamily:SANS, fontWeight:600, zIndex:100, display:"flex", gap:14, alignItems:"center", boxShadow:"0 2px 8px rgba(0,0,0,.07)" }}>
          <span>TRAINING · Level {trLvIdx+1} of 5</span>
          <button onClick={skipTrainingLv} style={{ background:"none", border:"none", color:"#B45309", fontSize:12, cursor:"pointer", padding:0, fontFamily:SANS, fontWeight:600 }}>
            Skip level →
          </button>
        </div>
      </>
    );
  }

  /* 4 — Condition instructions */
  if (phase === "instructions_condition") {
    const cond      = CONDITION_ORDER[condIdx];
    const stepNum   = condIdx + 2;   // Training=1, Control=2, Rest=3, Exp=4
    const mandatory = cond === "control" || cond === "experimental";
    const acc       = COND_COLOR[cond];

    const INFO = {
      control: {
        subtitle: `Step ${stepNum} of 5 · Mandatory`,
        title:    "Control Condition",
        body:     "MANDATORY — This is your clean cognitive baseline. You will solve arithmetic problems without any social comparison. Your accuracy and response time here will be compared against the Experimental condition to measure how stress affects your performance.",
        bullets:  [
          "Problems appear with a countdown timer. Respond before it expires.",
          "No performance comparison is shown — just you and the problems.",
          "Response time limits are based on your training performance (or defaults if training was skipped).",
          "Five difficulty levels, 2 minutes each (10 minutes total).",
          "This condition runs first so it is a pure, stress-free baseline.",
        ],
      },
      rest: {
        subtitle: `Step ${stepNum} of 5 · Optional`,
        title:    "Rest Period",
        body:     "OPTIONAL — A 2-minute neurological rest. This allows cortisol levels raised during the control condition to return toward baseline before the stress induction phase begins. Recommended for research validity; skippable if you prefer.",
        bullets:  [
          "Simply sit quietly for 2 minutes. No problems will appear.",
          "A fixation cross is displayed — you may gaze at it or close your eyes.",
          "Keep movements to a minimum.",
          "Used as a washout period between the control and experimental conditions.",
        ],
      },
      experimental: {
        subtitle: `Step ${stepNum} of 5 · Mandatory`,
        title:    "Experimental Condition",
        body:     "MANDATORY — This is the core stress-induction phase of the MIST. You will solve the same types of arithmetic problems, but now your performance is compared unfavourably to others in real time. This social comparison is the primary psychological stressor.",
        bullets:  [
          "Problems appear with a countdown timer that adapts to your performance.",
          "A performance bar shows your accuracy vs. other participants — it is designed to look unfavourable.",
          "The time limit shortens when you succeed and grows when you time out.",
          "Five difficulty levels, 2 minutes each (10 minutes total).",
          "After this condition your session summary will appear.",
        ],
      },
    };

    const info = INFO[cond];

    return (
      <InstructionsPage
        subtitle={info.subtitle}
        title={info.title}
        body={info.body}
        bullets={info.bullets}
        primaryLabel={cond==="rest" ? "Begin Rest →" : "Begin Condition →"}
        onPrimary={() => {
          setCondSubPhase(cond==="rest" ? "running" : "level_intro");
          setPhase("condition");
        }}
        skipLabel={!mandatory ? "Skip Rest →" : undefined}
        onSkip={!mandatory ? () => advanceFn.current(condIdx, 0, blkOrder) : undefined}
        accent={acc}
      />
    );
  }

  /* 5 — Condition running */
  if (phase === "condition") {
    const cond = CONDITION_ORDER[condIdx];

    if (cond === "rest") return (
      <RestScreen timeLeft={blockTL} onSkip={skipRest}/>
    );

    if (condSubPhase === "level_intro") return (
      <LevelIntro
        level={blkOrder[blkIdx] ?? 1}
        condition={cond}
        isTraining={false}
        onStart={() => setCondSubPhase("running")}
        onSkip={undefined}  /* No skipping individual blocks in mandatory conditions */
      />
    );

    return (
      <>
        <TaskScreen
          condition={cond} level={blkOrder[blkIdx]??1} problem={problem}
          dial={dial} onDial={handleDial} onSubmit={handleSubmit}
          feedback={feedback} trialTL={trialTL} trialTO={trialTO}
          blockTL={blockTL} perfPct={perfPct}
        />
        <div style={{
          position:"fixed", top:0, left:"50%", transform:"translateX(-50%)",
          background:`${COND_COLOR[cond]}14`, padding:"5px 18px", zIndex:100,
          borderRadius:"0 0 10px 10px", fontSize:12, color:COND_COLOR[cond],
          fontFamily:SANS, fontWeight:600, boxShadow:"0 2px 8px rgba(0,0,0,.07)",
          border:`1px solid ${COND_COLOR[cond]}22`, borderTop:"none",
        }}>
          {COND_LABEL[cond].toUpperCase()} · Block {blkIdx+1} of 5
        </div>
      </>
    );
  }

  /* 6 — Summary */
  if (phase === "summary") return (
    <SummaryPage participant={participant} allTrials={allTrials} onReset={handleReset}/>
  );

  return null;
}
