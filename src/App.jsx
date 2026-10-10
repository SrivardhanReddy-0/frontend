import {useState, useEffect, useRef} from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';   // empty = same address (dev proxy); set it when the backend is hosted separately
const api = axios.create({baseURL: API + '/api'});
api.interceptors.request.use(c => { const a = JSON.parse(localStorage.getItem('auth') || 'null'); if (a) c.headers.Authorization = 'Bearer ' + a.token; return c; });
api.interceptors.response.use(r => r, e => { if (e.response?.status === 401 && !e.config.url.includes('/auth/')) { localStorage.removeItem('auth'); location.reload(); } return Promise.reject(e); });

const COLORS = {Occupied: '#14a3a0', Empty: '#9fadc2', Scheduled: '#5b6cf0', Underutilized: '#f0a21a', Maintenance: '#e0524a'};
const W = 108, PITCH = 150, COLS = 4, SW = 960, SH = 600, HOME = {rx: 58, rz: -32, s: 0.85};

function Login({onAuth}) {
  const [mode, setMode] = useState('login'), [f, setF] = useState({username: '', password: ''}), [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try { const {data} = await api.post('/auth/' + mode, f); localStorage.setItem('auth', JSON.stringify(data)); onAuth(data); }
    catch (x) { setErr(x.response?.data?.error || 'Cannot reach the server'); }
  };
  return (
    <form className="login" onSubmit={submit}>
      <h1>HoloCampus</h1>
      <input placeholder="Username" value={f.username} onChange={e => setF({...f, username: e.target.value})} autoFocus />
      <input type="password" placeholder="Password" value={f.password} onChange={e => setF({...f, password: e.target.value})} />
      {err && <div className="err">{err}</div>}
      <button>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}

// Interactive 3D model: each room is a block. Height = utilization today, colour = status right now.
// With a floor plan uploaded, blocks sit on top of it; "edit" mode flattens the view so blocks can be dragged onto their rooms.
function Scene({rooms, sel, onSel, plan, holo, slab, blocks, pos, setPos, edit, inv, onMove}) {
  const [v, setV] = useState(HOME), drag = useRef(null), moved = useRef(false), mv = useRef(null), vr = useRef(v);
  vr.current = v;
  const mvCb = useRef(onMove); mvCb.current = onMove;
  useEffect(() => {
    const move = e => {
      const c = mv.current;
      if (c) { const x = c.ox + (e.clientX - c.sx) / vr.current.s, y = c.oy + (e.clientY - c.sy) / vr.current.s; c.last = {x, y}; setPos(p => ({...p, [c.id]: {x, y}})); return; }
      const d = drag.current; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
      drag.current = {x: e.clientX, y: e.clientY};
      setV(p => ({...p, rz: p.rz + dx * 0.4, rx: Math.max(25, Math.min(80, p.rx - dy * 0.3))}));
    };
    const up = () => { const c = mv.current; if (c?.last) mvCb.current(c.id, c.last.x, c.last.y); drag.current = null; mv.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  const rows = Math.ceil(rooms.length / COLS), gw = COLS * PITCH - (PITCH - W), gh = rows * PITCH - (PITCH - W);
  const at = (r, i) => pos[r.id] || (r.x != null ? {x: r.x, y: r.y} : {x: (SW - gw) / 2 + (i % COLS) * PITCH, y: (SH - gh) / 2 + Math.floor(i / COLS) * PITCH});
  const zoom = k => setV(p => ({...p, s: Math.max(0.4, Math.min(1.8, p.s + k))}));
  return (
    <div className={'scene' + (edit ? ' edit' : '')} onPointerDown={e => { if (!edit) { drag.current = {x: e.clientX, y: e.clientY}; moved.current = false; } }}
      onPointerMove={e => { if (drag.current || edit) return; const el = e.currentTarget, r = el.getBoundingClientRect(); el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5) * 10 + 'deg'); el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5) * -6 + 'deg'); }}
      onPointerLeave={e => { e.currentTarget.style.setProperty('--px', '0deg'); e.currentTarget.style.setProperty('--py', '0deg'); }}>
      <div className="stage" style={{width: SW, height: SH, '--rx': (edit ? 0 : v.rx) + 'deg', '--rz': (edit ? 0 : v.rz) + 'deg', '--s': v.s}}>
        <div className={'floor' + (plan ? ' plan' : '') + (inv ? ' inv' : '')} style={plan ? {backgroundImage: `url(${plan})`} : undefined} />
        {holo && <div key={holo.length} className="holo" style={{'--holo': `url(${holo})`, '--slab': `url(${slab})`}}>{slab && <i className="slab" />}{Array.from({length: 16}, (_, k) => <i key={k} className="hl" style={{'--k': k}} />)}</div>}
        {blocks && rooms.map((r, i) => { const p = at(r, i); return (
          <div key={r.id} className={'cube' + (sel === r.id ? ' sel' : '') + (r.wasteKwh > 0 ? ' waste' : '')}
            style={{left: p.x, top: p.y, '--h': (24 + r.utilization * 1.5) + 'px', '--c': COLORS[r.status]}}
            onPointerDown={e => { if (edit) { e.stopPropagation(); mv.current = {id: r.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y}; } }}
            onClick={() => { if (!moved.current) onSel(r.id); }}>
            <i className="f top" /><i className="f side front" /><i className="f side back" /><i className="f side right" /><i className="f side left" />
            <span className="tag3d"><b>{r.name}</b><small>{r.utilization}% used{r.wasteKwh > 0 ? ', ' + r.wasteKwh + ' kWh lost' : ''}</small></span>
          </div>); })}
      </div>
      <div className="tools" onPointerDown={e => e.stopPropagation()}>
        <button onClick={() => zoom(0.15)} aria-label="Zoom in">+</button><button onClick={() => zoom(-0.15)} aria-label="Zoom out">-</button>
        <button onClick={() => setV(HOME)}>Reset view</button>
      </div>
    </div>
  );
}

function answer(q, d) {
  const t = q.toLowerCase(), R = d.rooms, num = t.match(/\d+/)?.[0];
  const room = R.find(r => t.includes(r.name.toLowerCase()) || (num && r.name.includes(num)));
  const list = a => a.map(r => r.name).join(', ');
  if (room) return {text: `${room.name} is ${room.status.toLowerCase()} right now. Today it was used ${room.utilization}% of the day, sat unused for ${room.unusedHours} hours and wasted ${room.wasteKwh} kWh.`, focus: room.id};
  if (/wast|electric|kwh|lost|power/.test(t)) {
    const w = R.filter(r => r.wasteKwh > 0).sort((a, b) => b.wasteKwh - a.wasteKwh).slice(0, 3);
    return w.length ? {text: `${d.totals.wasteKwh} kWh wasted today. Biggest losses: ${w.map(r => r.name + ' (' + r.wasteKwh + ' kWh)').join(', ')}.`, focus: w[0].id} : {text: 'No energy is being wasted right now.'};
  }
  if (/sav|recommend|suggest|advice|should|fix/.test(t)) {
    const r = d.recommendations.slice(0, 3);
    return r.length ? {text: `You could save about ${d.totals.savingsKwh} kWh. Top actions: ` + r.map(x => `${x.room}: ${x.message}`).join(' ')} : {text: 'Nothing to fix right now.'};
  }
  if (/empty|unused|vacant|free|booked/.test(t)) {
    const e = R.filter(r => r.status === 'Empty'), s = R.filter(r => r.status === 'Scheduled');
    return {text: `Empty and unbooked: ${e.length ? list(e) : 'none'}. Booked but nobody there: ${s.length ? list(s) : 'none'}.`, focus: (s[0] || e[0])?.id};
  }
  if (/busy|busiest|most|crowd|occupied/.test(t)) { const b = [...R].sort((a, c) => c.utilization - a.utilization)[0]; return {text: `${b.name} is the busiest today at ${b.utilization}% utilization.`, focus: b.id}; }
  if (/util|average|overall|summary/.test(t)) return {text: `Average utilization is ${d.totals.avgUtilization}%. ${d.totals.wasteKwh} kWh wasted so far, ${d.totals.savingsKwh} kWh could be saved.`};
  if (/\bhi\b|hello|hey/.test(t)) return {text: 'Hello! Ask me what is wasting energy, how much you can save, or about a room by name.'};
  return {text: 'I can answer: what is wasting energy, how much we can save, which rooms are empty, the busiest room, or ask about a room by name (for example "Room 101").'};
}

function Chat({d, onFocus, open, onClose}) {
  const [msgs, setMsgs] = useState([{b: 1, t: 'Hi, I am the Energy Assistant. I read the live data. Ask about waste, savings or any room.'}]), [q, setQ] = useState(''), box = useRef(null), [busy, setBusy] = useState(false);
  useEffect(() => { box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const ask = async text => {
    if (!text.trim() || busy) return;
    setMsgs(m => [...m, {t: text}]); setQ(''); setBusy(true);
    const history = [...msgs.slice(1), {t: text}].slice(-10).map(m => ({role: m.b ? 'assistant' : 'user', content: m.t}));
    let a = null;
    try { const r = await api.post('/chat/ask', {message: text, history}); if (r.data.reply) a = {text: r.data.reply, ai: true, focus: d.rooms.find(x => r.data.reply.toLowerCase().includes(x.name.toLowerCase()))?.id}; } catch {}
    if (!a) a = answer(text, d);
    setMsgs(m => [...m, {b: 1, t: a.text, ai: a.ai}]); if (a.focus) onFocus(a.focus); setBusy(false);
  };
  return (
    <aside className={'chat' + (open ? ' open' : '')}>
      <div className="chathead"><h2>Energy Assistant</h2><button className="x" onClick={onClose} aria-label="Close assistant">Close</button></div>
      <div className="msgs" ref={box}>{msgs.map((m, i) => <div key={i} className={'m' + (m.b ? '' : ' me')}>{m.t}{m.ai && <small className="aitag">AI</small>}</div>)}{busy && <div className="m">Thinking...</div>}</div>
      <div className="quick">{['What is wasting energy?', 'How much can we save?', 'Which rooms are empty?', 'Busiest room'].map(c => <button key={c} onClick={() => ask(c)}>{c}</button>)}</div>
      <form className="send" onSubmit={e => { e.preventDefault(); ask(q); }}><input placeholder="Ask about a room or energy" value={q} onChange={e => setQ(e.target.value)} /><button>Send</button></form>
    </aside>
  );
}

const tilt = e => {   // hover: panel tilts toward the cursor and a glow follows it
  const el = e.currentTarget, r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--ty', (x - 0.5) * 8 + 'deg'); el.style.setProperty('--tx', (0.5 - y) * 8 + 'deg'); el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
};
const untilt = e => { e.currentTarget.style.setProperty('--ty', '0deg'); e.currentTarget.style.setProperty('--tx', '0deg'); };

// Builds a 3D model from the blueprint picture: long wall lines are extruded, small text and symbols are dropped,
// and each drawn building outline gets a floor slab.
function buildModel(img) {
  const sc = Math.min(1, 1200 / img.width), w = Math.round(img.width * sc), h = Math.round(img.height * sc), n = w * h;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const q = g.getImageData(0, 0, w, h).data, lum = new Float32Array(n); let sum = 0;
  for (let i = 0; i < n; i++) { lum[i] = (q[4 * i] + q[4 * i + 1] + q[4 * i + 2]) / 3; sum += lum[i]; }
  const bg = sum / n, ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = (bg < 128 ? lum[i] - bg : bg - lum[i]) > 45 ? 1 : 0;
  const seen = new Uint8Array(n), keep = new Uint8Array(n), slab = new Uint8Array(n), stack = new Int32Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (!ink[s0] || seen[s0]) continue;
    let sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; const list = []; stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0; list.push(p);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const m = ny * w + nx; if (ink[m] && !seen[m]) { seen[m] = 1; stack[sp++] = m; }
      }
    }
    const bw = x1 - x0, bh = y1 - y0;
    if ((bw > w * 0.9 && bh > h * 0.9) || Math.max(bw, bh) < 70) continue;   // drawing frame, text and symbols are dropped
    for (const p of list) keep[p] = 1;
    if (bw > 220 && bh > 160) for (let yy = y0; yy <= y1; yy++) slab.fill(1, yy * w + x0, yy * w + x1 + 1);
  }
  const wall = new Uint8Array(n);   // thicken walls by one pixel
  for (let i = 0; i < n; i++) if (keep[i]) { const x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) wall[ny * w + nx] = 1; } }
  const png = (mask, r, gr, b, a) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cg = cv.getContext('2d'), id = cg.createImageData(w, h);
    for (let i = 0; i < n; i++) if (mask[i]) { id.data[4 * i] = r; id.data[4 * i + 1] = gr; id.data[4 * i + 2] = b; id.data[4 * i + 3] = a; }
    cg.putImageData(id, 0, 0); return cv.toDataURL('image/png');
  };
  return {walls: png(wall, 205, 228, 255, 255), slab: png(slab, 34, 56, 96, 235)};
}

function useCount(n) {   // numbers count up/down smoothly when live data changes
  const [v, setV] = useState(0), prev = useRef(0);
  useEffect(() => {
    const from = prev.current, t0 = performance.now(); let f;
    const step = t => { const k = Math.min(1, (t - t0) / 900); setV(from + (n - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) f = requestAnimationFrame(step); else prev.current = n; };
    f = requestAnimationFrame(step); return () => cancelAnimationFrame(f);
  }, [n]);
  return v;
}

function Hero({d, go, openChat}) {
  const u = useCount(d.totals.avgUtilization), w = useCount(d.totals.wasteKwh), sv = useCount(d.totals.savingsKwh);
  const idle = d.rooms.filter(r => r.status === 'Empty' || r.status === 'Scheduled').length;
  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <p className="eyebrow">Live campus energy intelligence</p>
        <h2 className="glitch" data-text="See every watt. Find every empty room.">See every watt. Find every empty room.</h2>
        <p className="lead">Wi-Fi signals, timetables and meters become a living 3D hologram of your campus, so wasted power is found while it happens.</p>
        <div className="row"><button onClick={() => go('campus')}>Explore the hologram</button><button className="ghost" onClick={openChat}>Ask the assistant</button></div>
        <div className="kpis"><div><b>{u.toFixed(0)}%</b>average use</div><div className="warn"><b>{w.toFixed(1)}</b>kWh wasted today</div><div><b>{sv.toFixed(1)}</b>kWh saveable</div><div><b>{idle}</b>idle rooms now</div></div>
      </div>
      <div className="core" aria-hidden="true"><div className="cube3"><i /><i /><i /><i /><i /><i /></div><span className="ring1" /><span className="ring2" /></div>
      <a className="scrollhint" onClick={() => go('campus')}>Scroll</a>
    </section>
  );
}

function ChatSettings() {
  const blank = {format: 'openai', baseUrl: '', model: '', apiKey: '', systemPrompt: '', enabled: false};
  const [c, setC] = useState(blank), [hasKey, setHasKey] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => { api.get('/chat/settings').then(r => { setC({...blank, ...r.data, apiKey: ''}); setHasKey(r.data.hasKey); }); }, []);
  const f = k => e => setC({...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value});
  const save = async () => { await api.put('/chat/settings', c); const r = await api.get('/chat/settings'); setHasKey(r.data.hasKey); setC({...c, apiKey: ''}); setMsg('Saved.'); };
  const test = async () => {
    setMsg('Testing...');
    try { const r = await api.post('/chat/test'); setMsg(r.data.reply ? 'It works. The model said: ' + r.data.reply : 'No reply: ' + (r.data.error || 'unknown error')); }
    catch (x) { setMsg(x.response?.data?.error || 'Test failed'); }
  };
  return (
    <section className="panel"><h2>Chatbot API</h2>
      <p className="mute">Connect the assistant to an AI service. It works with Anthropic or any OpenAI-compatible service (OpenAI, Groq, OpenRouter, Gemini's OpenAI-compatible URL, or a local Ollama at http://localhost:11434/v1). The key stays on the server. When this is off or fails, the built-in answers are used.</p>
      <div className="form">
        <label><span><input type="checkbox" checked={c.enabled} onChange={f('enabled')} /> Use the AI chatbot</span></label>
        <label>Service type<select value={c.format} onChange={f('format')}><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic</option></select></label>
        <label>Base URL (blank = default)<input value={c.baseUrl} onChange={f('baseUrl')} placeholder={c.format === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'} /></label>
        <label>Model name<input value={c.model} onChange={f('model')} placeholder={c.format === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'a model name from your provider'} /></label>
        <label>API key<input type="password" value={c.apiKey} onChange={f('apiKey')} placeholder={hasKey ? 'Saved. Leave blank to keep it' : 'Paste your key'} autoComplete="off" /></label>
        <label>Instructions for the bot<textarea rows="5" value={c.systemPrompt} onChange={f('systemPrompt')} /></label>
        <div className="row"><button onClick={save}>Save</button><button className="ghost" onClick={test}>Test connection</button></div>
        {msg && <p className="mute">{msg}</p>}
      </div>
    </section>
  );
}

function AdminPage({user, floors, cur, setFl, planInfo, onFile, onExample, onDeploy, onUndeploy, onRemove, onTimetable}) {
  const fileRef = useRef(null), ttRef = useRef(null);
  return (
    <div className="adminpage">
      <section className="panel"><h2>Blueprint</h2>
        <p className="mute">1. Pick the floor. 2. Upload its blueprint (PNG or JPG). 3. Press Deploy and a 3D model of your building, with its walls raised, appears on the dashboard.</p>
        <div className="row">
          <select value={cur || ''} onChange={e => setFl(e.target.value)} aria-label="Building and floor">{floors.map(f => <option key={f}>{f}</option>)}</select>
          <button onClick={() => fileRef.current.click()}>Upload blueprint</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} />
          <button className="ghost" onClick={onExample}>Use example blueprint</button>
        </div>
        {planInfo ? <>
          <div className="planprev"><figure><img src={planInfo.image} alt="Blueprint" /><figcaption>Blueprint</figcaption></figure>
            <figure><img className="dark" src={planInfo.holo} alt="Hologram" /><figcaption>3D walls found in your blueprint</figcaption></figure></div>
          <div className="row"><span className={'state ' + (planInfo.deployed ? 'live' : 'stale')}>{planInfo.deployed ? 'Deployed' : 'Draft, not deployed yet'}</span>
            {planInfo.deployed ? <button onClick={onUndeploy}>Undeploy</button> : <button onClick={onDeploy}>Deploy 3D model</button>}
            <button className="ghost" onClick={onRemove}>Remove</button></div>
        </> : <p className="mute">No blueprint for this floor yet.</p>}
      </section>
      <section className="panel"><h2>Timetable</h2>
        <p className="mute">CSV with the columns room, day, start, end, course, students. Room names must match exactly (see examples/example-timetable.csv).</p>
        <button onClick={() => ttRef.current.click()}>Upload timetable (CSV)</button>
        <input ref={ttRef} type="file" accept=".csv,text/csv" hidden onChange={onTimetable} />
      </section>
      {user.role === 'ADMIN' && <ChatSettings />}
    </div>
  );
}

function Dashboard({user, out, theme, flip}) {
  const [d, setD] = useState(null), [sel, setSel] = useState(null), [n, setN] = useState({name: '', building: 'Main Block', floor: 'Ground', type: 'Classroom', capacity: 40, watts: 1200});
  const [live, setLive] = useState(false), [sim, setSim] = useState(null), [at, setAt] = useState(null);
  const [planInfo, setPlanInfo] = useState(null), [pos, setPos] = useState({}), [fl, setFl] = useState(''), [view, setView] = useState('dash'), [blocks, setBlocks] = useState(true);
  const [edit, setEdit] = useState(false), [chatOpen, setChatOpen] = useState(false), fileRef = useRef(null), ttRef = useRef(null), mainRef = useRef(null);
  const [inv, setInv] = useState(false), [wifi, setWifi] = useState(null), [testAp, setTestAp] = useState(''), [testN, setTestN] = useState(10), [txt, setTxt] = useState('');
  const floors = d ? [...new Set(d.rooms.map(r => r.building + ' / ' + r.floor))] : [], cur = floors.includes(fl) ? fl : floors[0];
  const plan = planInfo?.deployed ? planInfo.image : null, holo = planInfo?.deployed ? planInfo.holo : null, slab = planInfo?.deployed ? planInfo.slab : null;
  useEffect(() => { if (cur) api.get('/plans', {params: {key: cur}}).then(r => setPlanInfo(r.data.image ? r.data : null)); }, [cur]);
  useEffect(() => { const f = () => api.get('/wifi/status').then(r => setWifi(r.data)).catch(() => {}); f(); const t = setInterval(f, 5000); return () => clearInterval(t); }, []);
  useEffect(() => {   // scroll effects: the 3D view tilts back as you scroll, panels fly in when they appear
    const el = mainRef.current; if (!el) return;
    const onScroll = () => { el.style.setProperty('--sp', Math.min(1, el.scrollTop / 420)); el.style.setProperty('--sr', el.scrollTop / 14 + 'deg'); };
    el.addEventListener('scroll', onScroll);
    const glow = e => { el.style.setProperty('--gx', e.clientX + 'px'); el.style.setProperty('--gy', e.clientY + 'px'); }; el.addEventListener('pointermove', glow);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), {root: el, threshold: 0.12});
    el.querySelectorAll('.reveal').forEach(n => io.observe(n));
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('pointermove', glow); io.disconnect(); };
  }, [!!d]);
  const load = () => api.get('/analytics').then(r => setD(r.data));
  useEffect(() => {
    load(); api.get('/live/simulator').then(r => setSim(r.data.on));
    const es = new EventSource(API + '/api/live/stream?token=' + JSON.parse(localStorage.getItem('auth')).token);
    es.addEventListener('analytics', e => { setD(JSON.parse(e.data)); setAt(new Date()); setLive(true); });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, []);
  const toggleSim = async () => { const r = await api.post('/live/simulator?on=' + !sim); setSim(r.data.on); };
  const refreshPlan = () => api.get('/plans', {params: {key: cur}}).then(r => setPlanInfo(r.data.image ? r.data : null));
  const loadPlan = f => {   // reads the picture, builds the 3D model from it and saves everything as a draft
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / img.width), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const m = buildModel(img);
      api.put('/plans', {image: c.toDataURL('image/jpeg', 0.85), holo: m.walls, slab: m.slab}, {params: {key: cur}}).then(refreshPlan);
    };
    img.src = URL.createObjectURL(f);
  };
  const useExample = async () => loadPlan(await (await fetch('/examples/' + (/first|upper|1st/i.test(cur) ? 'blueprint-first.png' : 'blueprint-ground.png'))).blob());
  const deploy = async () => { await api.post('/plans/deploy', null, {params: {key: cur}}); await refreshPlan(); setBlocks(false); setView('dash'); mainRef.current?.scrollTo({top: 0}); };
  const undeploy = async () => { await api.post('/plans/undeploy', null, {params: {key: cur}}); refreshPlan(); };
  const go = id => { setView('dash'); setTimeout(() => { const el = mainRef.current?.querySelector('#' + id); id === 'top' ? mainRef.current?.scrollTo({top: 0, behavior: 'smooth'}) : el?.scrollIntoView({behavior: 'smooth'}); }, 60); };
  const removePlan = async () => { if (confirm('Remove this blueprint?')) { await api.delete('/plans', {params: {key: cur}}); setPlanInfo(null); } };
  const sendTest = async e => { e.preventDefault(); const ap = testAp || wifi.aps[0].ap; await api.post('/wifi/test', {ap, clients: testN}); api.get('/wifi/status').then(x => setWifi(x.data)); };
  const loadCurrent = async () => setTxt((await api.get('/structure/export')).data);
  const loadExample = async () => setTxt(await (await fetch('/examples/example-structure.txt')).text());
  const applyText = async replace => {
    if (replace && !confirm('Replace all rooms with this text? Rooms that are not listed will be deleted.')) return;
    try {
      const r = await api.post('/structure/import', txt, {params: {replace}, headers: {'Content-Type': 'text/plain'}}); load();
      alert(`Created ${r.data.created}, updated ${r.data.updated}, removed ${r.data.removed}.` + (r.data.warnings.length ? '\n' + r.data.warnings.join('\n') : ''));
    } catch (x) { alert(x.response?.data?.error || 'Could not apply the text'); }
  };
  const uploadTT = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try {
      const r = await api.post('/timetable/import', await f.text(), {headers: {'Content-Type': 'text/plain'}}); load();
      alert(`Imported ${r.data.imported} classes.` + (r.data.unknownRooms.length ? ` Skipped unknown rooms: ${r.data.unknownRooms.join(', ')}.` : '') + (r.data.badRows ? ` ${r.data.badRows} bad rows skipped.` : ''));
    } catch (x) { alert(x.response?.data?.error || 'Upload failed'); }
  };
  const add = async e => { e.preventDefault(); await api.post('/rooms', n); setN({...n, name: ''}); load(); };
  const del = async id => { if (confirm('Delete this room?')) { await api.delete('/rooms/' + id); setSel(null); load(); } };
  if (!d) return <div className="main">Loading...</div>;
  const room = d.rooms.find(r => r.id === sel), canEdit = user.role !== 'VIEWER';
  return (
    <div className={'app' + (chatOpen ? ' open' : '')}><div className={'main' + (view === 'admin' ? ' admin' : '')} ref={mainRef}>
      <header><h1>HoloCampus</h1><nav>{[['Overview', 'top'], ['Campus', 'campus'], ['Rooms', 'rooms'], ['Wi-Fi', 'wifi']].map(([t, id]) => <a key={id} onClick={() => go(id)}>{t}</a>)}</nav><div className="who"><span>{user.username} ({user.role.toLowerCase()})</span>{canEdit && <button className="ghost" onClick={() => setView(view === 'admin' ? 'dash' : 'admin')}>{view === 'admin' ? 'Back to dashboard' : 'Admin panel'}</button>}
        <button className="ghost" onClick={flip}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button><button className="ghost" onClick={out}>Sign out</button></div></header>
      <div className="livebar"><span className={'dot' + (live ? ' on' : '')} />{live ? 'Live' : 'Connecting...'}{at && <small>updated {at.toLocaleTimeString()}</small>}
        {user.role === 'ADMIN' && sim !== null && <button className="ghost" onClick={toggleSim}>Simulator: {sim ? 'on' : 'off'}</button>}</div>
      {view === 'admin' && <AdminPage user={user} floors={floors} cur={cur} setFl={setFl} planInfo={planInfo} onFile={loadPlan} onExample={useExample} onDeploy={deploy} onUndeploy={undeploy} onRemove={removePlan} onTimetable={uploadTT} />}
      <Hero d={d} go={go} openChat={() => setChatOpen(true)} />
      <section id="campus" className="stagewrap">
        <Scene rooms={d.rooms.filter(r => r.building + ' / ' + r.floor === cur)} sel={sel} onSel={setSel} plan={null} holo={holo} slab={slab} blocks={blocks} pos={pos} setPos={setPos} edit={edit} inv={inv} onMove={(id, x, y) => api.put('/rooms/' + id + '/position', {x, y})} />
        <div className="chips">
          <div className="chip"><b>{d.totals.avgUtilization}%</b>average use</div>
          <div className="chip waste"><b>{d.totals.wasteKwh} kWh</b>wasted today</div>
          <div className="chip"><b>{d.totals.savingsKwh} kWh</b>could be saved</div>
        </div>
        {edit && <div className="chips" style={{top: 82}}><div className="chip">Drag each block onto its room, then press Done</div></div>}
        <div className="planbar">
          <select value={cur || ''} onChange={e => { setFl(e.target.value); setSel(null); setEdit(false); }} aria-label="Building and floor">{floors.map(f => <option key={f}>{f}</option>)}</select>
          {canEdit && <button onClick={() => { setEdit(!edit); setBlocks(true); }}>{edit ? 'Done' : 'Edit layout'}</button>}
          {holo && <button onClick={() => setBlocks(!blocks)}>{blocks ? 'Hide room blocks' : 'Show room blocks'}</button>}
          {canEdit && !planInfo && <button onClick={() => setView('admin')}>Add blueprint</button>}
        </div>
        <div className="legend">{Object.entries(COLORS).map(([k, c]) => <span key={k}><i style={{background: c}} />{k}</span>)}</div>
      </section>
      <section id="rooms" className="rooms reveal"><h2>All rooms</h2><div className="roomgrid">
        {d.rooms.map((r, i) => (
          <div className="rcard" key={r.id} style={{'--c': COLORS[r.status], '--u': r.utilization + '%', '--i': i}} onMouseMove={tilt} onMouseLeave={untilt}
            onClick={() => { setFl(r.building + ' / ' + r.floor); setSel(r.id); go('campus'); }}>
            <div className="ring"><b>{r.utilization}%</b></div>
            <div><h3>{r.name}</h3><small>{r.building} / {r.floor}</small><br /><span className="tag" style={{background: COLORS[r.status]}}>{r.status}</span>{r.wasteKwh > 0 && <em> {r.wasteKwh} kWh lost</em>}</div>
          </div>))}
      </div></section>
      <div className="cols">
        <section className="panel reveal" onMouseMove={tilt} onMouseLeave={untilt}><h2>{room ? room.name : 'Room details'}</h2>
          {!room && <p className="mute">Click a room in the model, or ask the assistant about one.</p>}
          {room && <>
            <p className="mute">{room.building} / {room.floor}</p>
            <span className="tag" style={{background: COLORS[room.status]}}>{room.status}</span>
            <div className="metrics"><div><b>{room.capacity}</b>seats</div><div><b>{room.utilization}%</b>used today</div><div><b>{room.unusedHours}</b>unused hours</div><div><b>{room.wasteKwh}</b>kWh wasted</div></div>
            {d.recommendations.filter(r => r.room === room.name).map((r, i) => <div className="rec" key={i}>{r.message}{r.kwh > 0 && <em>{r.kwh} kWh</em>}</div>)}
            {user.role === 'ADMIN' && <button className="del" onClick={() => del(room.id)}>Delete room</button>}
          </>}
        </section>
        <section className="panel reveal" onMouseMove={tilt} onMouseLeave={untilt}><h2>Recommendations</h2>
          {d.recommendations.length === 0 && <p className="mute">No waste found. Nothing to change.</p>}
          {d.recommendations.map((r, i) => {
            const rm = d.rooms.find(x => x.name === r.room);
            return <div className="rec click" key={i} onClick={() => rm && setSel(rm.id)}><div><b>{r.room}</b>: {r.message}</div>{r.kwh > 0 && <em>{r.kwh} kWh</em>}</div>;
          })}
        </section>
      </div>
      <section className="panel reveal" onMouseMove={tilt} onMouseLeave={untilt}><h2 id="wifi">Wi-Fi signals</h2>
        {!wifi || wifi.aps.length === 0 ? <p className="mute">No room has a Wi-Fi access point yet. Add "ap AP-NAME" to a room in the building text below.</p> :
          <table className="wifi"><thead><tr><th>Room</th><th>Access point</th><th>Devices</th><th>People (est.)</th><th>Last report</th><th /></tr></thead>
            <tbody>{wifi.aps.map(a => <tr key={a.ap}><td>{a.room}</td><td>{a.ap}</td><td>{a.clients ?? '-'}</td><td>{a.people ?? '-'}</td><td>{a.secondsAgo == null ? 'never' : a.secondsAgo + ' s ago'}</td>
              <td><span className={'state ' + a.state}>{a.state === 'live' ? 'Live' : a.state === 'stale' ? 'Stale' : 'No data'}</span></td></tr>)}</tbody></table>}
        {wifi && <p className="mute">Assumes {wifi.devicesPerPerson} devices per person. Reports older than {wifi.staleSeconds} s are marked stale.</p>}
        {user.role === 'ADMIN' && wifi && wifi.aps.length > 0 && <form className="row" onSubmit={sendTest}>
          <select value={testAp || wifi.aps[0].ap} onChange={e => setTestAp(e.target.value)}>{wifi.aps.map(a => <option key={a.ap}>{a.ap}</option>)}</select>
          <input type="number" min="0" style={{width: 100}} value={testN} onChange={e => setTestN(+e.target.value)} title="Connected devices" />
          <button>Send test Wi-Fi report</button></form>}
      </section>
      {canEdit && <section className="panel reveal" onMouseMove={tilt} onMouseLeave={untilt}><h2>Describe your buildings in text</h2>
        <p className="mute">One line per item: <code>building NAME</code>, <code>floor NAME</code>, <code>room NAME: classroom, 60 seats, 1500 W, ap AP-NAME, at (col,row)</code>. Rooms without <code>at</code> are placed automatically.</p>
        <textarea rows="10" value={txt} onChange={e => setTxt(e.target.value)} placeholder={"building Main Block\nfloor Ground\nroom Room 101: classroom, 60 seats, 1500 W, ap AP-101"} />
        <div className="row"><button onClick={loadCurrent}>Load current structure</button><button onClick={loadExample}>Load example</button>
          <button onClick={() => applyText(false)}>Apply (add / update)</button>{user.role === 'ADMIN' && <button className="ghost" onClick={() => applyText(true)}>Apply (replace all rooms)</button>}</div>
      </section>}
      {canEdit && <section className="panel reveal" onMouseMove={tilt} onMouseLeave={untilt}><h2>Add a room</h2>
        <form className="row" onSubmit={add}>
          <input required placeholder="Room name" value={n.name} onChange={e => setN({...n, name: e.target.value})} />
          <input placeholder="Building" value={n.building} onChange={e => setN({...n, building: e.target.value})} /><input placeholder="Floor" style={{width: 100}} value={n.floor} onChange={e => setN({...n, floor: e.target.value})} />
          <select value={n.type} onChange={e => setN({...n, type: e.target.value})}><option>Classroom</option><option>Laboratory</option><option>Office</option></select>
          <input type="number" min="1" style={{width: 90}} title="Seats" value={n.capacity} onChange={e => setN({...n, capacity: +e.target.value})} />
          <input type="number" min="0" style={{width: 100}} title="Equipment watts" value={n.watts} onChange={e => setN({...n, watts: +e.target.value})} />
          <button>Add room</button>
        </form></section>}
    </div><Chat d={d} onFocus={setSel} open={chatOpen} onClose={() => setChatOpen(false)} />
      {!chatOpen && <button className="fab" onClick={() => setChatOpen(true)} aria-label="Open Energy Assistant"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg></button>}</div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('auth') || 'null'));
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  const out = () => { localStorage.removeItem('auth'); setUser(null); };
  return user ? <Dashboard user={user} out={out} theme={theme} flip={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} /> : <Login onAuth={setUser} />;
}
