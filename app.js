// ==== Config pentru GitHub Pages subfolder ====
console.log('main script loaded');

// Ex: "https://site.com/sub/app/index.html" -> "/sub/app/"
const BASE_SCOPE = location.pathname.replace(/[^/]*$/, '');

// ==== Utilitare timp ====
const H = (h,m=0) => (h*60+m)*60*1000;
const fmtHM = (ms) => {
  const totalMin = Math.max(0, Math.round((ms||0)/60000));
  const h = Math.floor(totalMin/60);
  const m = String(totalMin%60).padStart(2,'0');
  return `${h}:${m}`;
};
const clamp = (v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const todayKey = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
const q = (s)=>document.querySelector(s);

// ==== Limite ====
const LIMITS = {
  dailyDrive9: H(9,0),
  dailyDrive10: H(10,0),
  marker4h30: H(4,30),
  reqBreak:   H(0,45),
  dailyWork:  H(6,0),
  weekDrive:  H(56,0),
  fortDrive:  H(90,0)
};

// ==== Storage keys ====
const LS_DAY='ta-day', LS_LOG='ta-logs', LS_SET='ta-settings';

// ==== Setări ====
const settings = loadSettings();
function loadSettings(){
  const s = JSON.parse(localStorage.getItem(LS_SET) || 'null') || {
    alerts:true, driverName:'', truckId:'', trailerId:'', routeName:''
  };
  localStorage.setItem(LS_SET, JSON.stringify(s));
  return s;
}
function saveSettings(){ localStorage.setItem(LS_SET, JSON.stringify(settings)); }

// ==== Stare zilnică ====
function blankDay(day){
  return {
    day,
    startAt: null,                  // <— adăugat
    current: null,                 // { type:'drive'|'break'|'work', startAt:number }
    totals: { 
      drive: 0, 
      break: 0, 
      work: 0 
    },
    events: [],                    // { type, start, end }
    sessionDriveMs: 0,             // condus de la ultima pauză ≥45'
    extended: false,               // zi extinsă 10h
    notifyFlags: { session45: false, dailyMax: false }
  };
}

function start(type) {
  stopCurrent();
  const now = Date.now();
  if (!state.startAt) state.startAt = now;   // <— salvează ora de start a zilei
  state.current = { type, startAt: now };
  saveState(); render();
}

function selectMainTab(tabName) {
  console.log("[SERVER] selectMainTab loaded !");
  // scoatem aria-selected de la toate butoanele
  document.querySelectorAll('.mobile-actions .action')
    .forEach(btn => btn.setAttribute('aria-selected', 'false'));

  // activăm butonul cerut
  const activeBtn = document.querySelector(`.mobile-actions .action[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.setAttribute('aria-selected', 'true');

  // ascundem toate panourile
  document.querySelectorAll('.tabpanel')
    .forEach(panel => panel.classList.remove('active'));

  console.log("TabName primit:", tabName);
  console.log("ID căutat:", 'tab-' + tabName);
  console.log("Element găsit:", document.getElementById('tab-' + tabName));
  
  // afișăm doar panoul selectat
  const activePanel = document.getElementById('tab-' + tabName);
  
  if (activePanel) {
    activePanel.classList.add('active');
    if (tabName === 'details') renderDetailsTable({ limit: 'all' });
    if (tabName === 'details') {
      document.querySelector('#logTable')?.closest('table')?.classList.add('hidden');
    }
    
    // ascunde/afișează .row în funcție de tab
    document.body.setAttribute('data-tab', tabName);
    
    const rowSection = document.querySelector('.row');
    console.log("Se aplică restricție pe:", rowSection);
    
    if (['details', 'weekly', 'settings'].includes(tabName)) {
      rowSection.style.display = 'none';
    } else {
      rowSection.style.display = '';
    }
    
    console.log("Sa selectat: ", activePanel);
    console.log("Se aplica restrictie pe: ", rowSection);
  }
}

function getAllDaysMerged(){
  // history + today (cu events „live”)
  const logs = getLogs();
  const todayRec = {
    day: state.day,
    totals: calcTotalsWithCurrent(),
    events: [...state.events],
    extended: state.extended,
    startAt: state.startAt || null
  };
  if (state.current) {
    // evenimentul curent ca până la „acum”
    todayRec.events.push({
      type: state.current.type,
      start: state.current.startAt,
      end: Date.now()
    });
  }
  const all = [...logs, todayRec];
  // normalize (asigură câmpuri)
  return all.map(d => ({
    day: d.day,
    startAt: d.startAt || null,
    extended: !!d.extended,
    totals: d.totals || {drive:0, break:0, work:0},
    events: Array.isArray(d.events) ? d.events.slice().sort((a,b)=>a.start-b.start) : []
  })).sort((a,b)=> new Date(b.day) - new Date(a.day)); // descrescător
}

function renderDetailsTable({limit='all', search='' } = {}){
  const host = document.getElementById('detailsContainer');
  console.log("renderDetailsTable loaded...", host);
  
  if (!host) {
    // fallback: îl creăm în panelul Detalii dacă lipsește
    host = document.createElement('div');
    host.id = 'detailsContainer';
    el.panels.details?.appendChild(host);
  }

  const all = getAllDaysMerged();

  // aplică limită zile
  const filteredByLimit = (() => {
    if (limit === 7)  return all.slice(0, 7);
    if (limit === 30) return all.slice(0, 30);
    return all; // toate
  })();

  // filtrare după text (tip sau oră)
  const query = (search || '').trim().toLowerCase();
  const passEvent = (e) => {
    if (!query) return true;
    return (e.type||'').toLowerCase().includes(query)
        || new Date(e.start).toLocaleTimeString('sv-SE').toLowerCase().includes(query)
        || new Date(e.end||e.start).toLocaleTimeString('ro-RO').toLowerCase().includes(query);
  };

  const fmtDate = iso => new Date(iso).toLocaleDateString('sv-SE',{weekday:'short', day:'2-digit', month:'2-digit', year:'numeric'});
  const fmtClock = ms  => new Date(ms).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});

  // construim HTML
  host.innerHTML = filteredByLimit.map((dayRec, idx)=>{
    const dayEvents = (dayRec.events||[]).filter(passEvent);
    const hdr = `
      <div class="day-head" data-day="${dayRec.day}">
        <div class="day-title">${fmtDate(dayRec.day)}</div>
        <div class="day-chips">
          <span class="chip-sm">Condus: <b class="mono">${fmtHM(dayRec.totals.drive||0)}</b></span>
          <span class="chip-sm">Pauză: <b class="mono">${fmtHM(dayRec.totals.break||0)}</b></span>
          <span class="chip-sm">Muncă: <b class="mono">${fmtHM(dayRec.totals.work||0)}</b></span>
          ${dayRec.extended ? '<span class="chip-sm">Zi extinsă</span>' : ''}
          ${dayRec.startAt ? `<span class="chip-sm">Start: <b>${fmtClock(dayRec.startAt)}</b></span>` : ''}
        </div>
        <div class="chip-sm">${dayEvents.length} evenimente</div>
      </div>`;

    const body = `
      <div class="day-body">
        <table class="table">
          <thead><tr><th>Start</th><th>Stop</th><th>Durată</th><th>Tip</th></tr></thead>
          <tbody>
            ${dayEvents.map(e=>{
              const dur = Math.max(0, (e.end||Date.now()) - e.start);
              return `<tr>
                        <td>${fmtClock(e.start)}</td>
                        <td>${e.end ? fmtClock(e.end) : '—'}</td>
                        <td class="mono">${fmtHM(dur)}</td>
                        <td>${e.type}</td>
                      </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // implicit: primele 3 zile deschise, restul pliate
    const collapsed = idx >= 3 ? 'collapsed' : '';
    return `<div class="day-group ${collapsed}">${hdr}${body}</div>`;
  }).join('');

  // toggle expand/collapse pe header
  host.querySelectorAll('.day-head').forEach(head=>{
    head.addEventListener('click', ()=>{
      head.parentElement.classList.toggle('collapsed');
    });
  });
}

// hook pe controale
document.getElementById('btnDet7')?.addEventListener('click', ()=> renderDetailsTable({limit:7,  search: document.getElementById('detSearch')?.value }));
document.getElementById('btnDet30')?.addEventListener('click',()=> renderDetailsTable({limit:30, search: document.getElementById('detSearch')?.value }));
document.getElementById('btnDetAll')?.addEventListener('click',()=> renderDetailsTable({limit:'all', search: document.getElementById('detSearch')?.value }));
document.getElementById('detSearch')?.addEventListener('input', (e)=> renderDetailsTable({limit:'all', search: e.target.value }));

// export CSV (toate evenimentele, toate zilele)
document.getElementById('btnExportCSVFull')?.addEventListener('click', ()=>{
  const all = getAllDaysMerged();
  const rows = [['day','start','end','duration_ms','duration_hhmm','type','extended','startAt_day']];
  all.forEach(d=>{
    (d.events||[]).forEach(e=>{
      const dur = Math.max(0, (e.end||Date.now()) - e.start);
      rows.push([
        d.day,
        new Date(e.start).toISOString(),
        e.end ? new Date(e.end).toISOString() : '',
        dur,
        fmtHM(dur),
        e.type,
        d.extended ? 1 : 0,
        d.startAt ? new Date(d.startAt).toISOString() : ''
      ]);
    });
  });
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'detalii-evenimente.csv';
  document.body.appendChild(a); a.click(); a.remove();
});

function archiveDay(dayObj) {
  if (dayObj.current){
    const now = Date.now();
    const {type,startAt} = dayObj.current;
    const delta = Math.max(0, now - (startAt||now));
    dayObj.events.push({type, start:startAt, end:now});
    dayObj.totals[type] += delta;
    if (type==='drive') dayObj.sessionDriveMs += delta;
    dayObj.current = null;
  }

  const logs = JSON.parse(localStorage.getItem(LS_LOG) || '[]');
  const withoutSame = logs.filter(x => x.day !== dayObj.day);

  // ⬇️ PUNE și startAt, extended rămâne
  withoutSame.push({
    day: dayObj.day,
    startAt: dayObj.startAt || null,
    totals: dayObj.totals,
    events: dayObj.events,
    extended: !!dayObj.extended
  });

  withoutSame.sort((a,b) => a.day.localeCompare(b.day));

  // ⬇️ crește retenția (pune cât vrei)
  const MAX_LOG_DAYS = 180;
  localStorage.setItem(LS_LOG, JSON.stringify(withoutSame.slice(-MAX_LOG_DAYS)));
}

function loadState(){
  const saved = JSON.parse(localStorage.getItem(LS_DAY) || 'null');
  const day = todayKey();
  if (!saved || saved.day !== day){
    if (saved) archiveDay(saved);
    const fresh = blankDay(day);
    localStorage.setItem(LS_DAY, JSON.stringify(fresh));
    return fresh;
  }
  // sanity defaults
  saved.totals ||= {drive:0,break:0,work:0};
  saved.sessionDriveMs ||= 0;
  saved.events ||= [];
  saved.notifyFlags ||= {session45:false,dailyMax:false};
  return saved;
}
let state = loadState();
const saveState = ()=> localStorage.setItem(LS_DAY, JSON.stringify(state));

// ==== Helpers limite ====
const getLogs = ()=> JSON.parse(localStorage.getItem(LS_LOG) || '[]');
const extendedUsedLast7 = ()=> {
  const logs = getLogs();
  const last7 = logs.slice(-7);
  return last7.filter(d=>d.extended).length + (state.extended?1:0);
};
const extendedLeft = ()=> Math.max(0, 2 - extendedUsedLast7());
const currentDailyLimit = ()=> state.extended ? LIMITS.dailyDrive10 : LIMITS.dailyDrive9;

// ==== Notificări ====
async function ensurePermission(){
  if (!settings.alerts || !('Notification' in window)) return false;
  if (Notification.permission==='granted') return true;
  if (Notification.permission==='denied') return false;
  return (await Notification.requestPermission())==='granted';
}
function beep(){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(), g=ctx.createGain(); o.type='sine'; o.frequency.value=880; g.gain.value=0.0001; o.connect(g); g.connect(ctx.destination); o.start(); const t=ctx.currentTime; g.gain.exponentialRampToValueAtTime(0.2,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.6); o.stop(t+0.65);}catch(e){} }
async function notify(title, body){
  if (!settings.alerts) return;
  beep(); if (navigator.vibrate) navigator.vibrate(300);
  if (await ensurePermission()){
    try { new Notification(title,{ body, icon:`${BASE_SCOPE}icons/icon-192.png` }); } catch(e){}
  }
  const old=document.title; document.title=`🔔 ${title}`; setTimeout(()=>document.title=old,2500);
}

// ==== Elemente UI ====
const el = {
  stateLabel: q('#stateLabel'),
  dayLabel:   q('#dayLabel'),
  drivenVal:  q('#drivenVal'),
  remainVal:  q('#remainVal'),
  gaugeProg:  q('#gaugeProg'),
  marker:     q('#marker'),
  bars: {
    driveSess: q('#barDriveSess'),
    driveDay:  q('#barDriveDay'),
    break:     q('#barBreak'),
    work:      q('#barWork'),
    w1:        q('#barW1'),
    w2:        q('#barW2')
  },
  weekGrid: q('#weekGrid'),
  logTable: q('#logTable'),
  switches: {
    alerts: q('#toggleAlerts'),
    extended: q('#toggleExtended'),
    extLeft: q('#extLeftBadge')
  },
  actionBtns: {
    drive: q('#btnStartDrive'),
    break: q('#btnBreak'),
    work:  q('#btnWork'),
    stop:  q('#btnStop')
  },
  panels: {
    daily:  q('#tab-daily'),
    weekly: q('#tab-weekly'),
    details:q('#tab-details'),
    settings:q('#tab-settings')
  },
  settingsUI: {
    driver: q('#inpDriver'),
    truck:  q('#inpTruck'),
    trailer:q('#inpTrailer'),
    route:  q('#inpRoute'),
    saveTripBtn: q('#btnSaveTrip'),
    loadTripInput: q('#loadTripInput'),
    wipeAllBtn: q('#btnWipeAll')
  }
};

function colorByRatio(r){ return r<.8?'var(--ok)':(r<1?'var(--warn)':'var(--bad)'); }
function setBar(elBar, valueMs, targetMs){
  const ratio = targetMs ? clamp((valueMs || 0) / targetMs) : 0;
  elBar.style.width = Math.max(10, ratio * 100) + '%'; //(ratio*100)+'%'; //Math.max(10, (duration / total) * 100) + '%';
  elBar.style.background = colorByRatio(ratio);
}
function calcTotalsWithCurrent(){
  const now = Date.now();
  const t = {...state.totals};
  if (state.current){
    const d = Math.max(0, now - (state.current.startAt||now));
    t[state.current.type] += d;
  }
  return t;
}
function sumWindows(){
  const logs = getLogs();
  const days = [...logs, {day: state.day, totals: {...state.totals}}];
  const extra = state.current?.type==='drive' ? (Date.now()-state.current.startAt) : 0;
  days[days.length-1].totals.drive += extra;
  const lastN = (n)=> days.slice(-n).reduce((a,d)=>a+(d.totals?.drive||0),0);
  return { weekDrive:lastN(7), fortDrive:lastN(14) };
}

// ==== Mașina de stări ====
//function start(type){ stopCurrent(); state.current={type, startAt: Date.now()}; saveState(); render(); }
function stopCurrent(){
  if (!state.current) return;
  const now=Date.now();
  const {type,startAt} = state.current;
  const d = Math.max(0, now - (startAt||now));
  state.totals[type] += d;
  if (type==='drive') state.sessionDriveMs += d;
  if (type==='break' && d >= LIMITS.reqBreak){
    state.sessionDriveMs = 0;      // reset sesiune după pauză ≥45′
    state.notifyFlags.session45 = false;
  }
  state.events.push({ type, start:startAt, end:now });
  state.current=null; saveState();
}
function endOfDayIfChanged(){
  const day=todayKey();
  if (day !== state.day){ archiveDay(state); state=blankDay(day); saveState(); }
}

// ==== Randare ====
function render(){
  endOfDayIfChanged();

  // Auto-pauză dacă nu există activitate și nu e pauză
  if (!state.current || state.current.type !== 'break') {
    start('break');
  }
  
  // header + setări
  el.stateLabel.textContent = state.current ? state.current.type : 'inactiv';
  el.dayLabel.textContent = state.day;
  el.switches.alerts.checked = !!settings.alerts;
  el.switches.extended.checked = !!state.extended;
  const left = extendedLeft();
  el.switches.extLeft.textContent = `Extinse rămase: ${left}`;
  el.switches.extended.disabled = left===0 && !state.extended;

  // totaluri curente + sesiune
  const now = Date.now();
  const totals = calcTotalsWithCurrent();

  let driveSess = state.sessionDriveMs || 0;
  if (state.current?.type==='drive'){
    driveSess += Math.max(0, now - (state.current.startAt||now));
  }
  const driveDay = totals.drive || 0;
  const dayLimit = currentDailyLimit();
  const remain = Math.max(0, dayLimit - driveDay);

  // valori UI
  el.drivenVal.textContent = fmtHM(driveSess);
  el.remainVal.textContent = fmtHM(remain);

  // cerc sesiune (raport la 4h30)
  const r=78, c=2*Math.PI*r, p = clamp(driveSess / LIMITS.marker4h30);
  el.gaugeProg.setAttribute('stroke-dasharray', `${c*p} ${c*(1-p)}`);
  const angle = 2*Math.PI*1 - Math.PI/2; // marker 4:30 jos
  const x = 90 + r*Math.cos(angle), y = 90 + r*Math.sin(angle);
  el.marker.setAttribute('cx', x.toFixed(2)); el.marker.setAttribute('cy', y.toFixed(2));

  // bare
  setBar(el.bars.driveSess, driveSess, LIMITS.marker4h30);
  setBar(el.bars.driveDay,  driveDay,  dayLimit);
  setBar(el.bars.break,     totals.break||0,   LIMITS.reqBreak);
  setBar(el.bars.work,      totals.work||0,    LIMITS.dailyWork);

  const {weekDrive, fortDrive} = sumWindows();
  setBar(el.bars.w1, weekDrive, LIMITS.weekDrive);
  setBar(el.bars.w2, fortDrive, LIMITS.fortDrive);

  // valorile text
  q('#barDriveSessVal').textContent = fmtHM(driveSess);
  q('#barDriveDayVal').textContent  = fmtHM(driveDay);
  q('#barBreakVal').textContent     = fmtHM(totals.break||0);
  q('#barWorkVal').textContent      = fmtHM(totals.work||0);
  q('#barW1Val').textContent        = fmtHM(weekDrive);
  q('#barW2Val').textContent        = fmtHM(fortDrive);

  renderWeeklyCards();
  renderLog();
  updateActionButtons();
  checkAlerts(driveSess, driveDay, dayLimit);
}

function finishDay(){
  // oprește activitatea în curs și pornește repausul (pauză)
  stopCurrent();
  const now = Date.now();
  // setează pauză imediat după terminare
  state.current = { type: 'break', startAt: now };
  // dacă nu ai ora de start a zilei setată, nu o umple aici; doar intră pe pauză
  saveState();
  render();
}

function renderWeeklyCards(){
  const logs = getLogs();

  // indexăm toate zilele cunoscute (inclusiv azi) după ISO day
  const byDay = {};
  logs.forEach(d => { byDay[d.day] = d; });
  byDay[state.day] = { day: state.day, totals: calcTotalsWithCurrent(), extended: state.extended, startAt: state.startAt || null };

  // Construim săptămâna curentă: Duminică (0) → Vineri (5)
  const today = new Date(state.day);
  const dow = today.getDay();        // 0=Sun
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dow);

  const daysIso = Array.from({length:6}, (_,i)=>{
    const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
    return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
  });

  // helperi
  const H = (h,m=0)=> (h*60+m)*60*1000;
  const fmtDate = iso => new Date(iso).toLocaleDateString('sv-SE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const fmtClock = ms  => new Date(ms).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});

  // calculează repausul zilnic: (end-of-day) → (start următoare)
  function restInfoFor(iso){
    const cur = byDay[iso];
    if (!cur || !cur.startAt) return { label:'--:--', cls:'rest-unk', ms:0 };

    const t = cur.totals || {drive:0, work:0, break:0};
    const endOfDay = cur.startAt + (t.drive||0) + (t.work||0) + (t.break||0);

    const dNext = new Date(iso); dNext.setDate(dNext.getDate()+1);
    const nextIso = dNext.toLocaleDateString('sv-SE');
    const nxt = byDay[nextIso];
    if (!nxt || !nxt.startAt) return { label:'--:--', cls:'rest-unk', ms:0 };

    const restMs = Math.max(0, nxt.startAt - endOfDay);
    if (restMs >= H(11)) return { label:'11h', cls:'rest-good', ms:restMs };
    if (restMs >= H(10)) return { label:'10h', cls:'rest-mid',  ms:restMs };
    if (restMs >= H(9))  return { label:'9h',  cls:'rest-low',  ms:restMs };
    return { label: fmtHM(restMs), cls:'rest-low', ms:restMs };
  }

  // generează cardurile
  el.weekGrid.innerHTML = daysIso.map((iso, idx)=>{
    const rec = byDay[iso] || null;
    const t   = rec?.totals || { drive:0, break:0, work:0 };
    const longBreakInDay = (t.break||0) >= LIMITS.reqBreak; // pauze ≥45' în zi (marcaj albastru)
    const ext = !!rec?.extended;
    const startStr = rec?.startAt ? fmtClock(rec.startAt) : '--:--';
    const rest = restInfoFor(iso);
    const isEmpty = !rec;

    return `
      <div class="day-card ${isEmpty ? 'empty' : ''}" data-day="${iso}">
        <div class="day-header">
          <div class="badge-col">
            <div class="day-badge">${idx+1}</div>
            <div class="date-text">${fmtDate(iso)}</div>
          </div>
          <div class="day-dots">
            ${ext ? '<span class="dot-or" title="Zi extinsă 10h"></span>' : ''}
            ${longBreakInDay ? '<span class="dot-bl" title="Pauze ≥45′ în zi"></span>' : ''}
            <span class="rest-chip ${rest.cls}" title="Pauza de repaus (sfârșit zi → start zi următoare)">${rest.label}</span>
          </div>
        </div>

        <div class="row-metric" title="Condus (total zi)">
          <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm0 2a8 8 0 0 1 7.75 6H4.25A8 8 0 0 1 12 4Zm-8 8h6a2 2 0 0 0 2-2h4a6 6 0 0 1-6 6H4a2 2 0 0 1-2-2Zm20 0a2 2 0 0 1-2 2h-4a6 6 0 0 1-6-6h4a2 2 0 0 0 2 2h6Z"/></svg>
          <span class="metric-sub">Condus</span>
          <span class="metric-val mono">${fmtHM(t.drive||0)}</span>
        </div>

        <div class="row-metric" title="Pauza de repaus zilnic">
          <svg viewBox="0 0 24 24"><path d="M6 3h4v18H6V3Zm8 0h4v18h-4V3Z"/></svg>
          <span class="metric-sub">Pauză</span>
          <span class="metric-val mono">${rest.label}</span>
        </div>

        <div class="start-line">Start: <strong>${startStr}</strong></div>
      </div>
    `;
  }).join('');

  // totaluri 7/14 zile
  const { weekDrive, fortDrive } = sumWindows();
  q('#sum7').textContent  = fmtHM(weekDrive);
  q('#sum14').textContent = fmtHM(fortDrive);

  // (bonus) click card => sari în tabul „Detalii”
  document.querySelectorAll('.day-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const day = card.getAttribute('data-day');
      if (!day) return;
      selectMainTab('details');
      highlightLogsForDay(day); // opțional (vezi helperul)
    });
  });
}

function highlightLogsForDay(dayIso){
  // dacă ai evenimente stocate per zi în `history`, poți re-rendera tabelul doar cu ziua respectivă;
  // aici o fac simplu: scrollez în tabel și pun un cap de tabel cu ziua
  const tbl = document.getElementById('logTable');
  if (!tbl) return;
  // (opțional) poți filtra după dayIso și să reumpli tabelul doar cu acele rânduri
  // Pentru acum doar adaug un heading temporar:
  const thead = tbl.closest('table').querySelector('thead');
  if (thead) thead.innerHTML = `<tr><th colspan="3">Log pentru ziua ${new Date(dayIso).toLocaleDateString('ro-RO')}</th></tr>`;
  tbl.scrollIntoView({ behavior:'smooth', block:'start' });
}

/*function renderLog(){
  const list = [...state.events];
  if (state.current){
    list.push({ type: state.current.type, start: state.current.startAt, end: Date.now() });
  }
  el.logTable.innerHTML = list.map(e=>{
    const dur = Math.max(0, (e.end||Date.now()) - e.start);
    const hhmm = fmtHM(dur);
    const start = new Date(e.start).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    return `<tr><td>${start}</td><td>${e.type}</td><td class="mono">${hhmm}</td></tr>`;
  }).join('');
}*/

function renderLog(){
  // construim lista: evenimente încheiate + evenimentul curent până în prezent
  const list = [...state.events];
  if (state.current){
    list.push({ type: state.current.type, start: state.current.startAt, end: Date.now() });
  }

  const tbody = document.getElementById('logTable');
  const empty = document.getElementById('logEmpty');
  const totalEl = document.getElementById('logTotalDur');

  if (!tbody) return;

  if (!list.length){
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (totalEl) totalEl.textContent = 'Total: 0:00';
    return;
  }
  if (empty) empty.style.display = 'none';

  const fmtClock = (ms)=> new Date(ms).toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });

  const typeBadge = (t)=>{
    const map = {
      drive: { cls:'badge-drive', label:'Condus',   icon:'M3 12h18M12 3v18' },   // volan stilizat simplu (linie cruce)
      break: { cls:'badge-break', label:'Pauză',    icon:'M7 4v16M17 4v16' },   // pauză || 
      work:  { cls:'badge-work',  label:'Muncă',    icon:'M4 7h16v10H4z' }      // „cutie”
    };
    const {cls,label,icon} = map[t] || { cls:'', label:t, icon:'M4 12h16' };
    return `
      <span class="badge ${cls}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="${icon}" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        ${label}
      </span>
    `;
  };

  let totalMs = 0;
  const rows = list.map(e=>{
    const dur = Math.max(0, (e.end || Date.now()) - e.start);
    totalMs += dur;
    const start = fmtClock(e.start);
    const stop  = e.end ? fmtClock(e.end) : '—';
    const hhmm  = fmtHM(dur);
    return `<tr>
      <td class="mono">${start}</td>
      <td class="mono">${stop}</td>
      <td class="mono"><strong>${hhmm}</strong></td>
      <td>${typeBadge(e.type)}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows;
  if (totalEl) totalEl.textContent = `Total: ${fmtHM(totalMs)}`;
  document.querySelector('.log-title').textContent = `Jurnal (${new Date(state.day).toLocaleDateString('ro-RO')})`;
}

function updateActionButtons(){
  const t = state.current?.type;
  el.actionBtns.drive.disabled = t==='drive';
  el.actionBtns.break.disabled = t==='break';
  el.actionBtns.work.disabled  = t==='work';
  el.actionBtns.stop.disabled  = !t;
}

async function checkAlerts(driveSess, driveDay, limitDay){
  if (!state.notifyFlags.session45 && driveSess >= LIMITS.marker4h30){
    state.notifyFlags.session45 = true; saveState();
    await notify('Pauză necesară', 'Ai atins 4h30 de condus în sesiunea curentă.');
  }
  if (!state.notifyFlags.dailyMax && driveDay >= limitDay){
    state.notifyFlags.dailyMax = true; saveState();
    await notify('Limită zilnică atinsă', `Ai ajuns la ${limitDay===LIMITS.dailyDrive10?'10h':'9h'} de condus astăzi.`);
  }
}

// ==== Evenimente UI ====
// Footer tabs – delegare
document.querySelector('.mobile-nav').addEventListener('click', (e)=>{
  const btn = e.target.closest('[role="tab"][data-tab]');
  if (!btn) return;
  document.querySelectorAll('.mobile-nav [role="tab"]').forEach(b=>b.setAttribute('aria-selected','false'));
  btn.setAttribute('aria-selected','true');
  const tab = btn.dataset.tab;
  ['daily','weekly','details','settings'].forEach(k =>
    el.panels[k].classList.toggle('active', k===tab)
  );

  if (tab === 'details') renderDetailsTable({limit:'all'});

  console.log("[SERVER] moile nav button has been loaded.");
  const rowSection = document.querySelector('.row');
  
  if (rowSection) {
    if (['weekly', 'details', 'settings'].includes(tab)) {
      rowSection.style.display = 'none';
    } else {
      rowSection.style.display = '';
    }
  }
});

// Acțiuni Zilnic
el.actionBtns.drive.onclick = ()=> start('drive');
el.actionBtns.break.onclick = ()=> start('break');
el.actionBtns.work.onclick  = ()=> start('work');
//el.actionBtns.stop.onclick  = ()=>{ if(!state.current) return; if(confirm('Termini sesiunea curentă?')){ stopCurrent(); render(); } };
el.actionBtns.stop.onclick = () => {
  if (!state.current && !confirm('Nu ai o activitate activă. Începi pauza de repaus?')) return;
  // nu mai cerem confirm separat dacă erai în ceva; intrăm direct în pauză
  finishDay();
};

// Switches
el.switches.alerts.addEventListener('change', async (e)=>{ settings.alerts=e.target.checked; saveSettings(); if(settings.alerts) await ensurePermission(); });
el.switches.extended.addEventListener('change', (e)=>{
  const want = e.target.checked;
  if (want){
    if (extendedLeft()===0){ alert('Ai folosit deja 2 zile extinse în ultimele 7 zile.'); e.target.checked=false; return; }
    state.extended = true;
  } else { state.extended = false; }
  state.notifyFlags.dailyMax=false; saveState(); render();
});

// Export / Import din Detalii
q('#btnExportCSV').onclick = ()=>{
  const logs=getLogs(); const rows=[['day','type','start','end','duration_ms']];
  logs.forEach(d=>d.events.forEach(e=>rows.push([d.day,e.type,new Date(e.start).toISOString(),new Date(e.end).toISOString(),(e.end-e.start)])));
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  download('truck-log.csv','text/csv',csv);
};
q('#btnExportJSON').onclick = ()=>{
  const data={ today:state, history:getLogs() };
  download('truck-log.json','application/json',JSON.stringify(data,null,2));
};
q('#importJsonInput').addEventListener('change', async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(data?.today && data?.history){
      localStorage.setItem(LS_DAY, JSON.stringify(data.today));
      localStorage.setItem(LS_LOG, JSON.stringify(data.history));
      state = loadState(); alert('Import realizat.'); render();
    } else alert('Fișier JSON invalid.');
  }catch(err){ alert('Eroare la import.'); }
  e.target.value='';
});

// Setări – populate & sync
function fillSettingsUI(){
  el.settingsUI.driver.value  = settings.driverName || '';
  el.settingsUI.truck.value   = settings.truckId || '';
  el.settingsUI.trailer.value = settings.trailerId || '';
  el.settingsUI.route.value   = settings.routeName || '';
}
['driver','truck','trailer','route'].forEach(key=>{
  const map = {driver:'driverName', truck:'truckId', trailer:'trailerId', route:'routeName'};
  el.settingsUI[key].addEventListener('input', e=>{
    settings[ map[key] ] = e.target.value;
    saveSettings();
  });
});

function collectTripData(){
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      driverName: settings.driverName || '',
      truckId:    settings.truckId || '',
      trailerId:  settings.trailerId || '',
      routeName:  settings.routeName || ''
    },
    today: state,
    history: getLogs()
  };
}
el.settingsUI.saveTripBtn.onclick = ()=>{
  const data = collectTripData();
  const name = `cursa_${(settings.routeName||state.day||'astazi').replace(/\s+/g,'_')}.json`;
  download(name,'application/json',JSON.stringify(data,null,2));
};
el.settingsUI.loadTripInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(data?.today && data?.history){
      localStorage.setItem(LS_DAY, JSON.stringify(data.today));
      localStorage.setItem(LS_LOG, JSON.stringify(data.history));
      if (data.meta){
        settings.driverName = data.meta.driverName || settings.driverName;
        settings.truckId    = data.meta.truckId    || settings.truckId;
        settings.trailerId  = data.meta.trailerId  || settings.trailerId;
        settings.routeName  = data.meta.routeName  || settings.routeName;
        saveSettings();
      }
      state = loadState();
      fillSettingsUI();
      alert('Cursa a fost încărcată.');
      render();
    } else {
      alert('Fișier invalid.');
    }
  }catch(err){ alert('Eroare la încărcare.'); }
  e.target.value='';
});
el.settingsUI.wipeAllBtn.onclick = ()=>{
  if(!confirm('Sigur vrei să ștergi toate datele locale (ziua curentă, istoric, setări)?')) return;
  localStorage.removeItem(LS_DAY);
  localStorage.removeItem(LS_LOG);
  const keepAlerts = !!settings.alerts;
  localStorage.removeItem(LS_SET);
  settings.alerts = keepAlerts;
  settings.driverName = settings.truckId = settings.trailerId = settings.routeName = '';
  saveSettings();
  state = loadState();
  fillSettingsUI();
  render();
};

// Download helper
function download(name,type,content){ const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

// ==== Tick & init ====
setInterval(render, 1000);
if ('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register(`${BASE_SCOPE}sw.js`, { scope: BASE_SCOPE }).catch(console.error));
}
document.addEventListener('visibilitychange', ()=>{ const day=todayKey(); if(day!==state.day){ archiveDay(state); state=blankDay(day); localStorage.setItem(LS_DAY, JSON.stringify(state)); } render(); });

(async ()=>{ if(settings.alerts) await ensurePermission(); fillSettingsUI(); render(); })();
