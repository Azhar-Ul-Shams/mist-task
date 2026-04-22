import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from "recharts";

/* ══════════════════════════════════════════════════════
   SUPABASE CONFIGURATION
   Replace these with your own values from supabase.com
   Project Settings → API → Project URL & anon/public key
══════════════════════════════════════════════════════ */
const SUPABASE_URL   = "https://frdjogmhhjpmksciaieo.supabase.co";
const SUPABASE_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyZGpvZ21oaGpwbWtzY2lhaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjY2NjYsImV4cCI6MjA5MjQ0MjY2Nn0.T0Bqt709IUrXpKLiClZHca2pgJfcGIc-BkIQmJOcuLc";

const supabase = {
  async insert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async update(table, id, patch) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(await r.text());
  },
};

const DB_ENABLED = SUPABASE_URL !== "YOUR_SUPABASE_URL";

/* ══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */
const TRAINING_BLOCK_SECS  = 60;
const CONDITION_BLOCK_SECS = 120;
const REST_DURATION_SECS   = 120;
const FEEDBACK_MS          = 500;
const FAKE_OTHERS_PCT      = 84;
const INIT_TIMEOUTS_S      = { 1: 15, 2: 17, 3: 20, 4: 23, 5: 26 };

/* ══════════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════════ */
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
const COND_COLORS = { experimental: "#DC2626", control: "#1B4F72", rest: "#059669" };
const COND_LABEL  = { experimental: "Experimental", control: "Control", rest: "Rest" };

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'IBM Plex Mono', monospace";

/* ══════════════════════════════════════════════════════
   INJECT GLOBAL STYLES ONCE
══════════════════════════════════════════════════════ */
if (!document.getElementById("mist-styles")) {
  const s = document.createElement("style");
  s.id = "mist-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap');
    *{box-sizing:border-box}
    body{margin:0;background:#F8F7F4;font-family:'DM Sans',sans-serif}
    input:focus{outline:none}
    button{cursor:pointer;font-family:'DM Sans',sans-serif}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    .fade-up{animation:fadeUp .4s ease both}
    .pop-in{animation:pop .28s cubic-bezier(.34,1.56,.64,1) both}
    .shake{animation:shake .3s ease}
  `;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════ */
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const shuffle = a => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rand(0, i); [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function genProblem(level) {
  for (let _ = 0; _ < 5000; _++) {
    let txt, ans;
    if (level === 1) {
      const a=rand(1,9),b=rand(0,8),op=Math.random()>.5?"+":"-";
      ans=op==="+"?a+b:a-b; txt=`${a} ${op} ${b}`;
    } else if (level === 2) {
      const a=rand(10,20),b=rand(1,19),op=Math.random()>.5?"+":"-";
      ans=op==="+"?a+b:a-b; txt=`${a} ${op} ${b}`;
    } else if (level === 3) {
      const a=rand(5,15),b=rand(1,10),c=rand(1,10);
      const o1=Math.random()>.5?"+":"-",o2=Math.random()>.5?"+":"-";
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c; ans=r; txt=`${a} ${o1} ${b} ${o2} ${c}`;
    } else if (level === 4) {
      const a=rand(20,50),b=rand(5,20),c=rand(5,20);
      const o1=Math.random()>.5?"+":"-",o2=Math.random()>.5?"+":"-";
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c; ans=r; txt=`${a} ${o1} ${b} ${o2} ${c}`;
    } else {
      const a=rand(30,60),b=rand(10,25),c=rand(5,20),d=rand(1,10);
      const o1=Math.random()>.5?"+":"-",o2=Math.random()>.5?"+":"-",o3=Math.random()>.5?"+":"-";
      let r=a; r=o1==="+"?r+b:r-b; r=o2==="+"?r+c:r-c; r=o3==="+"?r+d:r-d; ans=r;
      txt=`${a} ${o1} ${b} ${o2} ${c} ${o3} ${d}`;
    }
    if (ans >= 0 && ans <= 9) return { text: `${txt} = ?`, answer: ans };
  }
  return { text: "3 + 4 = ?", answer: 7 };
}

const calcStats = trials => {
  if (!trials?.length) return { acc: 0, meanRT: 0, n: 0, correct: 0 };
  const ok  = trials.filter(t => t.correct && !t.timeout);
  const rts = ok.map(t => t.rt).filter(Boolean);
  return {
    acc:    Math.round((ok.length / trials.length) * 100),
    meanRT: rts.length ? Math.round(rts.reduce((s,v)=>s+v,0)/rts.length) : 0,
    n:      trials.length,
    correct: ok.length,
  };
};

/* ══════════════════════════════════════════════════════
   SHARED UI COMPONENTS
══════════════════════════════════════════════════════ */
const Chip = ({ label, color }) => (
  <span style={{
    display:"inline-block", padding:"3px 11px", borderRadius:20,
    fontSize:11, fontWeight:600, letterSpacing:".07em",
    background:`${color}18`, color, border:`1px solid ${color}28`, fontFamily:sans,
  }}>{label}</span>
);

const Divider = ({ color = C.amber }) => (
  <div style={{ display:"flex", alignItems:"center", gap:6, margin:"14px 0 20px" }}>
    <div style={{ width:28, height:2, background:color, borderRadius:1 }}/>
    <div style={{ width:7,  height:7, borderRadius:"50%", background:color, marginTop:-1 }}/>
    <div style={{ width:28, height:2, background:color, borderRadius:1 }}/>
  </div>
);

const TimerBar = ({ value, max, label, height=6 }) => {
  const pct = Math.max(0,(value/max)*100);
  const clr = pct>55?C.green:pct>25?C.amber:C.red;
  return (
    <div style={{ width:"100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:11, color:C.muted, fontFamily:mono }}>
        <span>{label}</span><span>{Math.ceil(value)}s</span>
      </div>
      <div style={{ width:"100%", height, background:C.border, borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:clr, transition:"width .1s linear, background .4s", borderRadius:4 }}/>
      </div>
    </div>
  );
};

const PrimaryBtn = ({ onClick, children, color=C.navy, disabled=false, fullWidth=false }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding:"12px 30px", background:disabled?"#94A3B8":color,
    color:"#fff", border:"none", borderRadius:10,
    fontSize:15, fontWeight:600, letterSpacing:".02em",
    transition:"opacity .18s", fontFamily:sans, opacity:disabled?.6:1,
    width:fullWidth?"100%":undefined,
  }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.opacity=".85"; }}
    onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}
  >{children}</button>
);

const SkipBtn = ({ onClick, label="Skip →" }) => (
  <button onClick={onClick} style={{
    background:"transparent", border:`1.5px solid ${C.border}`,
    color:C.sub, borderRadius:8, padding:"10px 20px", fontSize:13,
    transition:"all .18s", fontFamily:sans,
  }}
    onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.amber; e.currentTarget.style.color=C.amber; }}
    onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.sub; }}
  >{label}</button>
);

/* ══════════════════════════════════════════════════════
   CIRCULAR DIAL
══════════════════════════════════════════════════════ */
function CircularDial({ value, onChange, disabled }) {
  const cx=115, cy=115, r=78;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <div style={{ fontSize:10.5, color:C.muted, letterSpacing:".08em", fontFamily:sans }}>
        LEFT CLICK ↻ &nbsp;·&nbsp; RIGHT CLICK ↺
      </div>
      <svg width={230} height={230}
        onClick={e=>{ e.preventDefault(); if(!disabled) onChange((value+1)%10); }}
        onContextMenu={e=>{ e.preventDefault(); if(!disabled) onChange((value-1+10)%10); }}
        style={{ cursor:disabled?"not-allowed":"pointer", userSelect:"none", opacity:disabled?.5:1 }}
      >
        <circle cx={cx} cy={cy} r={r+30} fill="#F1F5F9" stroke={C.border} strokeWidth={1}/>
        {[0,1,2,3,4,5,6,7,8,9].map(n=>{
          const a=(n*36-90)*Math.PI/180, x=cx+r*Math.cos(a), y=cy+r*Math.sin(a);
          const sel=n===value;
          return (
            <g key={n}>
              <circle cx={x} cy={y} r={19} fill={sel?C.amber:C.card}
                stroke={sel?"#F59E0B":C.border} strokeWidth={sel?2:1}
                style={{filter:sel?"drop-shadow(0 0 8px rgba(217,119,6,.4))":"drop-shadow(0 1px 2px rgba(0,0,0,.06))"}}
              />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fill={sel?"#fff":C.sub} fontSize={13} fontWeight={sel?"600":"400"}
                style={{fontFamily:mono,pointerEvents:"none"}}
              >{n}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={28} fill={C.navy} fillOpacity={.07} stroke={C.navy} strokeWidth={1.5} strokeDasharray="4 3"/>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fill={C.navy} fontSize={28} fontWeight="600" style={{fontFamily:mono}}
        >{value}</text>
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PERFORMANCE BAR (experimental)
══════════════════════════════════════════════════════ */
const PerfBar = ({ pct }) => (
  <div style={{ background:"#1E293B", borderRadius:12, padding:"14px 18px", border:"1px solid #334155" }}>
    <div style={{ fontSize:9.5, color:"#64748B", letterSpacing:".1em", marginBottom:10, textTransform:"uppercase", fontFamily:sans }}>
      Performance
    </div>
    <div style={{ display:"flex", gap:14, alignItems:"flex-end", height:72 }}>
      {[{l:"You",v:Math.min(58,pct),c:"#EF4444"},{l:"Others",v:FAKE_OTHERS_PCT,c:"#10B981"}].map(({l,v,c})=>(
        <div key={l} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ fontSize:9, color:"#94A3B8", fontFamily:mono }}>{Math.round(v)}%</div>
          <div style={{ width:"100%", height:60, display:"flex", alignItems:"flex-end" }}>
            <div style={{ width:"100%", height:`${v}%`, background:c, borderRadius:"3px 3px 0 0", transition:"height .6s ease", minHeight:3 }}/>
          </div>
          <div style={{ fontSize:9, color:"#64748B", textTransform:"uppercase", letterSpacing:".05em", fontFamily:sans }}>{l}</div>
        </div>
      ))}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════
   WELCOME PAGE
══════════════════════════════════════════════════════ */
function WelcomePage({ onStart }) {
  const [name,  setName]  = useState("");
  const [age,   setAge]   = useState("");
  const [email, setEmail] = useState("");
  const [errs,  setErrs]  = useState({});
  const [hit,   setHit]   = useState(false);

  const validate = () => {
    const v = {};
    if (!name.trim())                                v.name  = "Full name is required";
    if (!age || isNaN(+age) || +age<18 || +age>100) v.age   = "Enter a valid age (18–100)";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))  v.email = "Enter a valid email address";
    return v;
  };

  const handleStart = () => {
    setHit(true);
    const v = validate();
    setErrs(v);
    if (!Object.keys(v).length) onStart({ name: name.trim(), age: +age, email: email.trim() });
  };

  const InputField = ({ id, label, type="text", placeholder, val, setter }) => {
    const err = hit && errs[id];
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        <label htmlFor={id} style={{ fontSize:11.5, fontWeight:600, color:C.sub, letterSpacing:".07em", textTransform:"uppercase", fontFamily:sans }}>
          {label}
        </label>
        <input
          id={id} type={type} placeholder={placeholder} value={val}
          onChange={e => { setter(e.target.value); if(hit) { setHit(false); setHit(true); } }}
          style={{
            padding:"12px 16px", borderRadius:8, width:"100%",
            border:`1.5px solid ${err?C.red:C.border}`,
            fontSize:15, color:C.text, background:"#FAFAF9",
            fontFamily:sans, WebkitAppearance:"none", appearance:"none",
          }}
        />
        {err && <span style={{ fontSize:12, color:C.red, fontFamily:sans }}>{err}</span>}
      </div>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:480, width:"100%" }} className="fade-up">
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ display:"inline-flex", gap:8, alignItems:"center", marginBottom:16 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber }}/>
            <span style={{ fontSize:11, letterSpacing:".14em", color:C.muted, textTransform:"uppercase", fontFamily:sans }}>
              Neuroimaging Research Protocol
            </span>
            <div style={{ width:7, height:7, borderRadius:"50%", background:C.amber }}/>
          </div>
          <h1 style={{ fontSize:40, fontWeight:400, color:C.text, fontFamily:serif, margin:0, lineHeight:1.1 }}>
            Montreal Imaging<br/><em>Stress Task</em>
          </h1>
          <div style={{ display:"flex", justifyContent:"center" }}><Divider/></div>
          <p style={{ color:C.sub, lineHeight:1.75, fontSize:14, margin:0, maxWidth:360, marginInline:"auto" }}>
            A computerized protocol measuring cognitive performance and psychosocial stress responses.
            Developed at McGill University, 2005.
          </p>
        </div>

        <div style={{ background:C.card, borderRadius:18, padding:36, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          <h2 style={{ margin:"0 0 5px", fontSize:19, fontWeight:400, color:C.text, fontFamily:serif }}>
            Participant Registration
          </h2>
          <p style={{ margin:"0 0 24px", fontSize:13, color:C.muted, fontFamily:sans }}>
            All fields are required. Your data is stored securely.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <InputField id="name"  label="Full Name"     type="text"   placeholder="Jane Smith"       val={name}  setter={setName}/>
            <InputField id="age"   label="Age"           type="number" placeholder="28"               val={age}   setter={setAge}/>
            <InputField id="email" label="Email Address" type="email"  placeholder="jane@example.com" val={email} setter={setEmail}/>
          </div>
          <div style={{ marginTop:28 }}>
            <PrimaryBtn onClick={handleStart} color={C.navy} fullWidth>Begin Session →</PrimaryBtn>
          </div>
        </div>
        <p style={{ textAlign:"center", fontSize:12, color:C.muted, marginTop:14, lineHeight:1.7, fontFamily:sans }}>
          Estimated duration: 25–35 minutes.&nbsp; Please be in a quiet environment.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   INSTRUCTIONS PAGE
══════════════════════════════════════════════════════ */
function InstructionsPage({ subtitle, title, body, bullets, primaryLabel, onPrimary, skipLabel, onSkip, accent=C.navy }) {
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} className="fade-up">
      <div style={{ maxWidth:620, width:"100%" }}>
        <div style={{ background:C.card, borderRadius:18, padding:42, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          {subtitle && <div style={{ fontSize:11, letterSpacing:".12em", color:C.muted, textTransform:"uppercase", marginBottom:10, fontFamily:sans }}>{subtitle}</div>}
          <h2 style={{ margin:"0 0 4px", fontSize:27, fontWeight:400, color:C.text, fontFamily:serif, lineHeight:1.2 }}>{title}</h2>
          <div style={{ width:40, height:2.5, background:accent, marginBottom:22, borderRadius:2 }}/>
          {body && <p style={{ color:C.sub, fontSize:14.5, lineHeight:1.75, marginBottom:24, fontFamily:sans }}>{body}</p>}
          {bullets && (
            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:28 }}>
              {bullets.map((b,i)=>(
                <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:accent, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0, marginTop:1, fontFamily:sans }}>{i+1}</div>
                  <p style={{ margin:0, color:C.sub, fontSize:14, lineHeight:1.65, fontFamily:sans }}>{b}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            <PrimaryBtn onClick={onPrimary} color={accent}>{primaryLabel}</PrimaryBtn>
            {onSkip && <SkipBtn onClick={onSkip} label={skipLabel||"Skip →"}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   LEVEL INTRO
══════════════════════════════════════════════════════ */
function LevelIntro({ level, condition, isTraining, onStart, onSkip }) {
  const acc = isTraining ? C.navy : COND_COLORS[condition];
  const descs = {
    1:"Single-digit arithmetic. Get comfortable with the interface.",
    2:"Two-digit operations. A step up in complexity.",
    3:"Three-operand problems. Work through each step.",
    4:"Larger numbers with multiple operations. Stay focused.",
    5:"Most challenging level. Do your best under time pressure.",
  };
  const lvRom = ["I","II","III","IV","V"][level-1];
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} className="fade-up">
      <div style={{ maxWidth:440, width:"100%", textAlign:"center" }}>
        <div style={{ background:C.card, borderRadius:18, padding:40, boxShadow:"0 4px 24px rgba(0,0,0,.07)", border:`1px solid ${C.border}` }}>
          <Chip label={isTraining?"TRAINING":COND_LABEL[condition].toUpperCase()} color={acc}/>
          <div style={{ fontSize:52, fontWeight:400, fontFamily:serif, color:C.text, margin:"18px 0 6px", lineHeight:1 }}>
            Level {lvRom}
          </div>
          <p style={{ color:C.sub, fontSize:14, marginBottom:26, fontFamily:sans, lineHeight:1.65 }}>{descs[level]}</p>
          <div style={{ background:C.bg, borderRadius:10, padding:"10px 18px", marginBottom:28, border:`1px solid ${C.border}` }}>
            <span style={{ fontSize:13, color:C.muted, fontFamily:sans }}>
              Duration: {isTraining?`${TRAINING_BLOCK_SECS}s`:`${CONDITION_BLOCK_SECS/60} min`}
            </span>
          </div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <PrimaryBtn onClick={onStart} color={acc}>Start Level →</PrimaryBtn>
            {onSkip && <SkipBtn onClick={onSkip}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   REST SCREEN
══════════════════════════════════════════════════════ */
function RestScreen({ timeLeft, onSkip }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0F172A", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20 }}>
      <div style={{ color:"#334155", fontSize:11, letterSpacing:".12em", fontFamily:sans, textTransform:"uppercase" }}>Rest Period</div>
      <div style={{ position:"relative", width:40, height:40 }}>
        <div style={{ position:"absolute", top:"50%", left:0, right:0, height:1, background:"#1E293B" }}/>
        <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:1, background:"#1E293B" }}/>
      </div>
      <div style={{ color:"#475569", fontSize:13, fontFamily:mono, marginTop:10 }}>{Math.ceil(timeLeft)}s remaining</div>
      <div style={{ marginTop:20 }}><SkipBtn onClick={onSkip} label="Skip Rest →"/></div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TASK SCREEN
══════════════════════════════════════════════════════ */
function TaskScreen({ condition, level, problem, dial, onDial, onSubmit, feedback, trialTL, trialTO, blockTL, perfPct, disabled }) {
  const isExp = condition === "experimental";
  const acc   = COND_COLORS[condition];
  const lvRom = ["I","II","III","IV","V"][level-1];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"20px 16px", fontFamily:sans }}>
      <div style={{ maxWidth:700, marginInline:"auto", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div style={{ display:"flex", gap:8 }}>
          <Chip label={COND_LABEL[condition].toUpperCase()} color={acc}/>
          <Chip label={`Level ${lvRom}`} color={C.sub}/>
        </div>
        <span style={{ fontSize:11, color:C.muted, fontFamily:mono, letterSpacing:".05em" }}>MIST</span>
      </div>

      <div style={{ maxWidth:700, marginInline:"auto", marginBottom:22 }}>
        <TimerBar value={blockTL} max={CONDITION_BLOCK_SECS} label="BLOCK TIME" height={5}/>
      </div>

      <div style={{ maxWidth:700, marginInline:"auto", display:"flex", gap:20, alignItems:"flex-start" }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:16 }}>

          {/* Problem */}
          <div className="pop-in" key={problem?.text} style={{
            background:C.card, borderRadius:16, padding:"26px 30px",
            boxShadow:"0 4px 24px rgba(0,0,0,.07)",
            border:`1.5px solid ${feedback?feedback==="correct"?"#34D399":feedback==="timeout"?"#F59E0B":"#F87171":C.border}`,
            transition:"border-color .3s",
          }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:".1em", marginBottom:12, textTransform:"uppercase", fontFamily:sans }}>Arithmetic Problem</div>
            <div style={{ fontSize:32, fontWeight:600, color:C.text, fontFamily:mono, textAlign:"center", padding:"14px 0", minHeight:58, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {problem?.text || "…"}
            </div>
            <div style={{ marginTop:16 }}>
              <TimerBar value={trialTL} max={trialTO} label="TIME LIMIT" height={8}/>
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className={feedback==="incorrect"?"shake":""} style={{
              borderRadius:12, padding:"12px 20px", fontSize:14, fontWeight:600, textAlign:"center", fontFamily:sans,
              background:feedback==="correct"?"#D1FAE5":feedback==="incorrect"?C.redLt:"#FEF3C7",
              border:`1.5px solid ${feedback==="correct"?"#34D399":feedback==="incorrect"?"#F87171":"#F59E0B"}`,
              color:feedback==="correct"?"#065F46":feedback==="incorrect"?"#7F1D1D":"#78350F",
            }}>
              {feedback==="correct"?"✓ Correct":feedback==="incorrect"?"✗ Incorrect":"⚠ Time expired"}
            </div>
          )}

          {/* Answer + Submit */}
          <div style={{ background:C.card, borderRadius:14, padding:"18px 22px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:20 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6, fontFamily:sans }}>Your Answer</div>
              <div style={{ fontSize:38, fontWeight:600, color:C.navy, fontFamily:mono, width:54, height:54, borderRadius:12, background:C.amberLt, border:`2px solid ${C.amber}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {dial}
              </div>
            </div>
            <PrimaryBtn onClick={onSubmit} color={C.navy} disabled={disabled||!!feedback}>Submit</PrimaryBtn>
          </div>

          {/* Dial */}
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", justifyContent:"center" }}>
            <CircularDial value={dial} onChange={onDial} disabled={disabled||!!feedback}/>
          </div>
        </div>

        {/* Perf bar (exp only) */}
        {isExp && (
          <div style={{ width:155, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <PerfBar pct={perfPct}/>
            <div style={{ background:"#FEF2F2", borderRadius:10, padding:"10px 13px", border:"1px solid #FECACA", fontSize:12, color:"#B91C1C", lineHeight:1.55, fontFamily:sans }}>
              ⚠ Performance significantly below group average.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SUMMARY PAGE
══════════════════════════════════════════════════════ */
function SummaryPage({ participant, allTrials, conditionOrder, onReset }) {
  const expT   = allTrials.filter(t=>t.condition==="experimental");
  const ctrlT  = allTrials.filter(t=>t.condition==="control");
  const expS   = calcStats(expT);
  const ctrlS  = calcStats(ctrlT);
  const allTC  = [...expT,...ctrlT];
  const overall= calcStats(allTC);

  const stress = ctrlS.acc>0 ? Math.round(((ctrlS.acc-expS.acc)/ctrlS.acc)*100) : 0;

  const levelData = [1,2,3,4,5].map(lv=>({
    name:`L${lv}`,
    Experimental: calcStats(expT.filter(t=>t.level===lv)).acc,
    Control:      calcStats(ctrlT.filter(t=>t.level===lv)).acc,
  }));

  const tips = [];
  if (stress>15) tips.push({icon:"🧠",title:"Stress sensitivity noted",body:`Your accuracy dropped approximately ${stress}% under social comparison conditions — a common physiological stress response. Mindfulness-based exercises and regular timed arithmetic drills can build resilience. Consider a brief breathing exercise before cognitively demanding tasks.`});
  else if (stress>5) tips.push({icon:"✨",title:"Good stress resilience",body:`Your accuracy held fairly steady under pressure (${stress}% difference between conditions). Continue strengthening this with gentle timed practice. Daily mental arithmetic for 10 minutes is a simple, effective tool.`});
  else tips.push({icon:"🏅",title:"Excellent stress resilience",body:`Your performance was remarkably consistent across conditions — a strong indicator of working memory robustness and healthy stress tolerance. Continue challenging yourself with complex cognitive tasks.`});

  const weak = [1,2,3,4,5].filter(lv=>calcStats(allTC.filter(t=>t.level===lv)).acc<55&&allTC.filter(t=>t.level===lv).length>0);
  if (weak.length) tips.push({icon:"📐",title:`Areas to strengthen: Level${weak.length>1?"s":""} ${weak.map(l=>["I","II","III","IV","V"][l-1]).join(", ")}`,body:`You found these difficulty levels particularly challenging. Dedicated 10–15 minute daily practice with multi-step arithmetic will meaningfully improve both accuracy and speed over a few weeks.`});

  const toRate = allTC.length ? allTrials.filter(t=>t.timeout).length/allTC.length : 0;
  if (toRate>0.2) tips.push({icon:"⏱",title:"Response speed opportunity",body:`A notable fraction of problems exceeded the time limit. "Beat the clock" drills — sets of 10 problems with a gradually decreasing time budget — are a highly effective way to improve processing speed.`});
  if (expS.acc>70) tips.push({icon:"💪",title:"Strong performance under social pressure",body:`Achieving over ${expS.acc}% accuracy in the experimental (stress) condition is commendable. Your working memory is robust under social evaluation pressure.`});

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"32px 16px", fontFamily:sans }}>
      <div style={{ maxWidth:740, marginInline:"auto" }} className="fade-up">

        <div style={{ textAlign:"center", marginBottom:38 }}>
          <div style={{ fontSize:11, letterSpacing:".14em", color:C.muted, textTransform:"uppercase", marginBottom:12 }}>Session Complete</div>
          <h1 style={{ fontSize:36, fontWeight:400, fontFamily:serif, color:C.text, margin:0 }}>
            Your Results, <em>{participant.name.split(" ")[0]}</em>
          </h1>
          <div style={{ display:"flex", justifyContent:"center" }}><Divider/></div>
        </div>

        {/* Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:13, marginBottom:26 }}>
          {[
            {label:"Overall Accuracy", val:`${overall.acc}%`,       sub:"Exp. + Control",        color:C.navy},
            {label:"Stress Impact",    val:`${Math.abs(stress)}%`,  sub:stress>=0?"accuracy drop under stress":"stronger under stress", color:stress>15?C.red:stress>5?C.amber:C.green},
            {label:"Total Trials",     val:allTC.length,             sub:`${overall.correct} correct`, color:C.sub},
          ].map(({label,val,sub,color})=>(
            <div key={label} style={{ background:C.card, borderRadius:14, padding:"18px 20px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:".07em", textTransform:"uppercase", marginBottom:7 }}>{label}</div>
              <div style={{ fontSize:32, fontWeight:600, fontFamily:mono, color, lineHeight:1 }}>{val}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:5, lineHeight:1.4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Condition cards */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13, marginBottom:26 }}>
          {["experimental","control"].map(cond=>{
            const s = cond==="experimental"?expS:ctrlS;
            return (
              <div key={cond} style={{ background:C.card, borderRadius:14, padding:"20px 24px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`2px solid ${COND_COLORS[cond]}22` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <Chip label={COND_LABEL[cond].toUpperCase()} color={COND_COLORS[cond]}/>
                    <div style={{ marginTop:10, fontSize:28, fontWeight:600, fontFamily:mono }}>{s.acc}%</div>
                    <div style={{ fontSize:12, color:C.muted }}>accuracy</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:".06em", marginBottom:4 }}>Mean RT</div>
                    <div style={{ fontSize:22, fontWeight:600, fontFamily:mono, color:C.sub }}>{s.meanRT>0?`${(s.meanRT/1000).toFixed(2)}s`:"—"}</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{s.correct}/{s.n} correct</div>
                  </div>
                </div>
                <div style={{ height:4, background:C.border, borderRadius:2 }}>
                  <div style={{ width:`${s.acc}%`, height:"100%", background:COND_COLORS[cond], borderRadius:2 }}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div style={{ background:C.card, borderRadius:16, padding:"26px 28px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, marginBottom:26 }}>
          <h3 style={{ margin:"0 0 18px", fontSize:17, fontWeight:400, fontFamily:serif }}>Accuracy by Difficulty Level</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={levelData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name" tick={{fill:C.sub,fontFamily:mono,fontSize:12}}/>
              <YAxis domain={[0,100]} tick={{fill:C.sub,fontFamily:mono,fontSize:11}} unit="%"/>
              <Tooltip contentStyle={{borderRadius:10,border:`1px solid ${C.border}`,fontFamily:sans,fontSize:13}} formatter={v=>[`${v}%`]}/>
              <Legend wrapperStyle={{fontFamily:sans,fontSize:13}}/>
              <Bar dataKey="Experimental" fill={C.red}  radius={[4,4,0,0]}/>
              <Bar dataKey="Control"      fill={C.navy} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tips */}
        <div style={{ marginBottom:32 }}>
          <h3 style={{ fontSize:20, fontWeight:400, fontFamily:serif, color:C.text, marginBottom:16 }}>Personalised Insights</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {tips.map((t,i)=>(
              <div key={i} style={{ background:C.card, borderRadius:14, padding:"20px 22px", boxShadow:"0 2px 8px rgba(0,0,0,.05)", border:`1px solid ${C.border}`, display:"flex", gap:16, alignItems:"flex-start" }}>
                <div style={{ fontSize:26, lineHeight:1, flexShrink:0 }}>{t.icon}</div>
                <div>
                  <div style={{ fontWeight:600, color:C.text, marginBottom:5, fontSize:14.5 }}>{t.title}</div>
                  <p style={{ margin:0, color:C.sub, fontSize:13.5, lineHeight:1.7 }}>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ background:"#EFF6FF", borderRadius:14, padding:"18px 22px", border:"1px solid #BFDBFE", marginBottom:28 }}>
          <div style={{ fontWeight:600, color:"#1E3A8A", marginBottom:5, fontSize:14 }}>A note on this task</div>
          <p style={{ margin:0, color:"#1D4ED8", fontSize:13, lineHeight:1.7 }}>
            The MIST intentionally induces mild, temporary stress in a controlled research context.
            Performance differences between conditions are a normal physiological response — not a reflection of your
            intelligence or ability. The "Others" performance shown during the experimental condition was a simulated
            value, as specified in the MIST protocol. Please speak with the administering researcher if you have any concerns.
          </p>
        </div>

        <div style={{ textAlign:"center" }}>
          <PrimaryBtn onClick={onReset} color={C.navy}>Register New Participant</PrimaryBtn>
          <p style={{ fontSize:12, color:C.muted, marginTop:10 }}>This starts a fresh session. Current data has been saved.</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════ */
export default function MISTApp() {

  const [phase,        setPhase]        = useState("welcome");
  const [participant,  setParticipant]  = useState(null);

  // Training
  const [trLvIdx,   setTrLvIdx]   = useState(0);
  const [trSubPhase,setTrSubPhase]= useState("intro");
  const [trainTOs,  setTrainTOs]  = useState({...INIT_TIMEOUTS_S});
  const trTrialsRef = useRef({});

  // Conditions
  const [condOrder,    setCondOrder]    = useState([]);
  const [condIdx,      setCondIdx]      = useState(0);
  const [blkOrder,     setBlkOrder]     = useState([]);
  const [blkIdx,       setBlkIdx]       = useState(0);
  const [condSubPhase, setCondSubPhase] = useState("level_intro");

  // Task UI
  const [problem,  setProblem]  = useState(null);
  const [dial,     setDial]     = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [blockTL,  setBlockTL]  = useState(CONDITION_BLOCK_SECS);
  const [trialTL,  setTrialTL]  = useState(15);
  const [trialTO,  setTrialTO]  = useState(15);
  const [perfPct,  setPerfPct]  = useState(50);
  const [allTrials,setAllTrials]= useState([]);

  // Refs
  const blockRef  = useRef(null);
  const trialRef  = useRef(null);
  const fbRef     = useRef(null);
  const blockTime = useRef(CONDITION_BLOCK_SECS);
  const trialTout = useRef(15);
  const trialStart= useRef(0);
  const dialRef   = useRef(0);
  const probRef   = useRef(null);
  const fbActive  = useRef(false);
  const condR     = useRef("control");
  const levelR    = useRef(1);
  const blkTrials = useRef([]);
  const adaptTO   = useRef(15);
  const sessionId = useRef(null);
  const trainTOsRef=useRef({...INIT_TIMEOUTS_S});

  // Keep trainTOsRef in sync
  useEffect(() => { trainTOsRef.current = trainTOs; }, [trainTOs]);

  const clearAll = () => {
    clearInterval(blockRef.current);
    clearInterval(trialRef.current);
    clearTimeout(fbRef.current);
  };

  /* ── DB ── */
  const createSession = async p => {
    if (!DB_ENABLED) return null;
    try {
      const rows = await supabase.insert("mist_sessions",{
        participant_name:p.name, participant_age:p.age,
        participant_email:p.email, session_start:new Date().toISOString()
      });
      return rows[0]?.id||null;
    } catch { return null; }
  };
  const insertTrial = async t => {
    if (!DB_ENABLED||!sessionId.current) return;
    supabase.insert("mist_trials",{
      session_id:sessionId.current, condition:t.condition, level:t.level,
      problem:t.problem, correct_answer:t.correctAnswer, submitted_answer:t.submitted,
      is_correct:t.correct, is_timeout:t.timeout, response_time_ms:t.rt,
      trial_timestamp:new Date(t.timestamp).toISOString()
    }).catch(()=>{});
  };
  const finalizeSession = (trials, cOrder) => {
    if (!DB_ENABLED||!sessionId.current) return;
    const eS=calcStats(trials.filter(t=>t.condition==="experimental"));
    const cS=calcStats(trials.filter(t=>t.condition==="control"));
    supabase.update("mist_sessions",sessionId.current,{
      session_end:new Date().toISOString(), condition_order:cOrder,
      training_timeouts_s:trainTOsRef.current,
      overall_accuracy:calcStats(trials).acc,
      exp_accuracy:eS.acc, control_accuracy:cS.acc,
      exp_mean_rt_ms:eS.meanRT, control_mean_rt_ms:cS.meanRT
    }).catch(()=>{});
  };

  /* ── Trial lifecycle ── */
  const startNextTrial = useCallback(() => {
    if (fbActive.current) return;
    const prb = genProblem(levelR.current);
    const tout = adaptTO.current;
    probRef.current = prb;
    trialTout.current = tout;
    trialStart.current = Date.now();
    setProblem(prb);
    setDial(0); dialRef.current=0;
    setFeedback(null);
    setTrialTL(tout); setTrialTO(tout);
    clearInterval(trialRef.current);
    let elapsed=0;
    trialRef.current = setInterval(()=>{
      elapsed+=0.1;
      const left=trialTout.current-elapsed;
      setTrialTL(Math.max(0,left));
      if (left<=0) { clearInterval(trialRef.current); endTrial(null,true); }
    },100);
  },[]);  // eslint-disable-line

  const endTrial = useCallback((submitted,timedOut)=>{
    if (fbActive.current) return;
    fbActive.current=true;
    clearInterval(trialRef.current);
    const rt=timedOut?0:Date.now()-trialStart.current;
    const correct=!timedOut&&submitted===probRef.current?.answer;
    setFeedback(timedOut?"timeout":correct?"correct":"incorrect");
    if (condR.current==="experimental") {
      if (correct)  adaptTO.current=Math.max(4,adaptTO.current*0.93);
      if (timedOut) adaptTO.current=Math.min(30,adaptTO.current*1.06);
    }
    const trial={
      condition:condR.current, level:levelR.current,
      problem:probRef.current?.text, correctAnswer:probRef.current?.answer,
      submitted:timedOut?null:submitted, correct, timeout:timedOut, rt,
      timestamp:Date.now()
    };
    blkTrials.current=[...blkTrials.current,trial];
    setAllTrials(prev=>{
      const up=[...prev,trial];
      const recent=up.filter(t=>t.condition==="experimental").slice(-10);
      if(recent.length) setPerfPct(Math.min(58,Math.max(20,(recent.filter(t=>t.correct).length/recent.length)*100)));
      return up;
    });
    insertTrial(trial);
    fbRef.current=setTimeout(()=>{
      fbActive.current=false;
      setFeedback(null);
      if (blockTime.current>1.5) startNextTrial();
    },FEEDBACK_MS);
  },[startNextTrial]); // eslint-disable-line

  /* ── Advance block (stored in ref to avoid stale closure in setInterval) ── */
  const advanceFn = useRef(null);
  advanceFn.current = (cIdx, bIdx, bOrder, cOrder) => {
    const cond = cOrder[cIdx];
    const isRest = cond==="rest";
    const maxBlk = isRest?1:bOrder.length;
    if (bIdx<maxBlk-1) {
      setBlkIdx(bIdx+1);
      setCondSubPhase("level_intro");
    } else if (cIdx<cOrder.length-1) {
      const nextCI=cIdx+1;
      setCondIdx(nextCI);
      setBlkIdx(0);
      const nb=shuffle([1,2,3,4,5]);
      setBlkOrder(nb);
      setCondSubPhase(cOrder[nextCI]==="rest"?"running":"level_intro");
      setPhase("instructions_condition");
    } else {
      // All done
      setAllTrials(prev=>{
        finalizeSession(prev,cOrder);
        return prev;
      });
      setPhase("summary");
    }
  };

  /* ── Start condition block ── */
  const startCondBlockFn = useRef(null);
  startCondBlockFn.current = (cIdx, bIdx, bOrder, cOrder) => {
    const cond=cOrder[cIdx];
    const lv=cond==="rest"?1:(bOrder[bIdx]||1);
    condR.current=cond; levelR.current=lv;
    blkTrials.current=[]; fbActive.current=false;
    adaptTO.current=trainTOsRef.current[lv]||INIT_TIMEOUTS_S[lv]||15;
    setPerfPct(50);
    const dur=cond==="rest"?REST_DURATION_SECS:CONDITION_BLOCK_SECS;
    blockTime.current=dur; setBlockTL(dur);
    clearAll();
    blockRef.current=setInterval(()=>{
      blockTime.current-=0.1;
      setBlockTL(t=>Math.max(0,t-0.1));
      if (blockTime.current<=0) {
        clearAll(); fbActive.current=false;
        advanceFn.current(cIdx,bIdx,bOrder,cOrder);
      }
    },100);
    if (cond!=="rest") startNextTrial();
  };

  /* ── Start training block ── */
  const startTrainingFn = useRef(null);
  startTrainingFn.current = (lvIdx) => {
    const lv=lvIdx+1;
    levelR.current=lv; condR.current="training";
    blkTrials.current=[]; fbActive.current=false;
    adaptTO.current=INIT_TIMEOUTS_S[lv];
    blockTime.current=TRAINING_BLOCK_SECS; setBlockTL(TRAINING_BLOCK_SECS);
    clearAll();
    blockRef.current=setInterval(()=>{
      blockTime.current-=0.1;
      setBlockTL(t=>Math.max(0,t-0.1));
      if (blockTime.current<=0) {
        clearAll();
        const ok=blkTrials.current.filter(t=>t.correct&&!t.timeout&&t.rt>0);
        const meanS=ok.length?(ok.reduce((s,t)=>s+t.rt,0)/ok.length)/1000:INIT_TIMEOUTS_S[lv];
        const newTO=Math.max(5,+(meanS*1.25).toFixed(1));
        trTrialsRef.current[lv]=blkTrials.current;
        setTrainTOs(prev=>{
          const up={...prev,[lv]:newTO};
          trainTOsRef.current=up;
          return up;
        });
        fbActive.current=false;
        if (lvIdx<4) { setTrLvIdx(lvIdx+1); setTrSubPhase("intro"); }
        else {
          const order=shuffle(["experimental","control","rest"]);
          const nb=shuffle([1,2,3,4,5]);
          setCondOrder(order); setCondIdx(0); setBlkOrder(nb); setBlkIdx(0);
          setPhase("instructions_condition");
        }
      }
    },100);
    startNextTrial();
  };

  /* ── Effects ── */
  useEffect(()=>{
    if (phase==="training"&&trSubPhase==="running") startTrainingFn.current(trLvIdx);
  },[phase,trSubPhase,trLvIdx]);

  useEffect(()=>{
    if (phase==="condition"&&condSubPhase==="running"&&condOrder.length&&blkOrder.length)
      startCondBlockFn.current(condIdx,blkIdx,blkOrder,condOrder);
  },[phase,condSubPhase,condIdx,blkIdx]); // eslint-disable-line

  useEffect(()=>()=>clearAll(),[]);

  /* ── Handlers ── */
  const handleSubmit = useCallback(()=>{
    if (fbActive.current||!probRef.current) return;
    endTrial(dialRef.current,false);
  },[endTrial]);

  const handleDial = useCallback(v=>{ dialRef.current=v; setDial(v); },[]);

  const skipRest = () => {
    clearAll(); fbActive.current=false;
    advanceFn.current(condIdx,blkIdx,blkOrder,condOrder);
  };

  const skipTrainingLv = () => {
    clearAll(); fbActive.current=false;
    if (trLvIdx<4) { setTrLvIdx(trLvIdx+1); setTrSubPhase("intro"); }
    else {
      const order=shuffle(["experimental","control","rest"]);
      const nb=shuffle([1,2,3,4,5]);
      setCondOrder(order); setCondIdx(0); setBlkOrder(nb); setBlkIdx(0);
      setPhase("instructions_condition");
    }
  };

  const handleRegister = async p => {
    setParticipant(p);
    const sid=await createSession(p);
    sessionId.current=sid;
    setPhase("instructions_training");
  };

  const handleReset = () => {
    clearAll();
    setPhase("welcome"); setParticipant(null);
    sessionId.current=null;
    setAllTrials([]); setTrLvIdx(0); setTrSubPhase("intro");
    setTrainTOs({...INIT_TIMEOUTS_S});
    setCondOrder([]); setCondIdx(0); setBlkOrder([]); setBlkIdx(0);
    setCondSubPhase("level_intro");
    trTrialsRef.current={}; blkTrials.current=[]; fbActive.current=false;
  };

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */

  if (phase==="welcome") return <WelcomePage onStart={handleRegister}/>;

  if (phase==="instructions_training") return (
    <InstructionsPage
      subtitle="Phase 1 of 4 · Optional"
      title="Training Session"
      body="You'll work through all five difficulty levels for 60 seconds each. This calibrates your personal response-time limits for the main task. You may skip training to use default time limits."
      bullets={[
        "Problems appear on screen. Solve each one mentally.",
        "Use the circular dial to select your answer: left-click moves clockwise, right-click counterclockwise.",
        "Press Submit once your answer is selected. Work as quickly and accurately as you can.",
        "If the countdown expires, the problem advances automatically.",
        "Your mean response time per level sets the timeout for the main task.",
      ]}
      primaryLabel="Start Training →"
      onPrimary={()=>{ setTrLvIdx(0); setTrSubPhase("intro"); setPhase("training"); }}
      skipLabel="Skip Training (use defaults)"
      onSkip={()=>{
        const order=shuffle(["experimental","control","rest"]);
        const nb=shuffle([1,2,3,4,5]);
        setCondOrder(order); setCondIdx(0); setBlkOrder(nb); setBlkIdx(0);
        setPhase("instructions_condition");
      }}
    />
  );

  if (phase==="training") {
    if (trSubPhase==="intro") return (
      <LevelIntro level={trLvIdx+1} condition="control" isTraining onStart={()=>setTrSubPhase("running")} onSkip={skipTrainingLv}/>
    );
    return (
      <>
        <TaskScreen
          condition="control" level={trLvIdx+1} problem={problem}
          dial={dial} onDial={handleDial} onSubmit={handleSubmit}
          feedback={feedback} trialTL={trialTL} trialTO={trialTO}
          blockTL={blockTL} perfPct={50} disabled={false}
        />
        <div style={{ position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",background:C.amberLt,padding:"5px 16px",borderRadius:"0 0 10px 10px",fontSize:12,color:"#92400E",fontFamily:sans,fontWeight:600,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.07)",display:"flex",gap:12,alignItems:"center" }}>
          <span>TRAINING · Level {trLvIdx+1} of 5</span>
          <button onClick={skipTrainingLv} style={{ background:"none",border:"none",color:"#B45309",fontSize:12,cursor:"pointer",padding:0,fontFamily:sans }}>Skip level →</button>
        </div>
      </>
    );
  }

  if (phase==="instructions_condition"&&condOrder.length>0) {
    const cond=condOrder[condIdx];
    const mandatory=cond==="experimental"||cond==="control";
    const acc=COND_COLORS[cond];
    const info={
      experimental:{
        title:"Experimental Condition",
        body:"MANDATORY — This is the core stress measurement of the MIST. You will solve arithmetic problems while your performance is compared unfavourably to others in real time. This condition cannot be skipped.",
        bullets:[
          "Problems appear with a countdown timer. Respond before it expires.",
          "A performance bar shows your accuracy vs. other participants (continuously updated).",
          "Response time limits adapt dynamically — shortening when you succeed, extending when you timeout.",
          "Five difficulty levels, 2 minutes each (10 minutes total).",
          "Both Experimental and Control conditions are required for valid data.",
        ]
      },
      control:{
        title:"Control Condition",
        body:"MANDATORY — This provides the stress-free baseline for comparison. You will solve the same arithmetic problems without any social comparison feedback. This condition cannot be skipped.",
        bullets:[
          "Problems appear with a countdown timer fixed to your training baseline.",
          "No performance comparison is shown.",
          "Five difficulty levels, 2 minutes each (10 minutes total).",
        ]
      },
      rest:{
        title:"Rest Period",
        body:"OPTIONAL — A brief 2-minute neurological baseline. No problems will be presented. Primarily useful for fMRI/PET imaging studies. You may skip this if you are not in an imaging environment.",
        bullets:[
          "Simply sit quietly for 2 minutes. No interaction is needed.",
          "Keep movements to a minimum.",
          "A fixation cross will be displayed on screen.",
        ]
      }
    }[cond];

    return (
      <InstructionsPage
        subtitle={`Condition ${condIdx+1} of ${condOrder.length} · ${mandatory?"Mandatory":"Optional"}`}
        title={info.title}
        body={info.body}
        bullets={info.bullets}
        primaryLabel={cond==="rest"?"Begin Rest →":"Begin Condition →"}
        onPrimary={()=>{ setCondSubPhase(cond==="rest"?"running":"level_intro"); setPhase("condition"); }}
        skipLabel={!mandatory?"Skip Rest Period →":undefined}
        onSkip={!mandatory?()=>advanceFn.current(condIdx,0,blkOrder,condOrder):undefined}
        accent={acc}
      />
    );
  }

  if (phase==="condition"&&condOrder.length>0) {
    const cond=condOrder[condIdx];
    if (cond==="rest") return <RestScreen timeLeft={blockTL} onSkip={skipRest}/>;
    if (condSubPhase==="level_intro") return (
      <LevelIntro
        level={blkOrder[blkIdx]||1} condition={cond}
        isTraining={false} onStart={()=>setCondSubPhase("running")}
        onSkip={undefined}
      />
    );
    return (
      <>
        <TaskScreen
          condition={cond} level={blkOrder[blkIdx]||1} problem={problem}
          dial={dial} onDial={handleDial} onSubmit={handleSubmit}
          feedback={feedback} trialTL={trialTL} trialTO={trialTO}
          blockTL={blockTL} perfPct={perfPct} disabled={false}
        />
        <div style={{ position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",background:`${COND_COLORS[cond]}15`,padding:"5px 18px",borderRadius:"0 0 10px 10px",fontSize:12,color:COND_COLORS[cond],fontFamily:sans,fontWeight:600,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.07)",border:`1px solid ${COND_COLORS[cond]}25`,borderTop:"none" }}>
          {COND_LABEL[cond].toUpperCase()} · Block {blkIdx+1} of 5
        </div>
      </>
    );
  }

  if (phase==="summary") return (
    <SummaryPage participant={participant} allTrials={allTrials} conditionOrder={condOrder} onReset={handleReset}/>
  );

  return null;
}
