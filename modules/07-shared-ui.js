// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 07-shared-ui.js
// Extracted from original index.html lines 2628-3085
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt$ = v => '$'+Number(v).toLocaleString();
const contactName = cid => { const c=_state.contacts.find(x=>x.id===cid); return c?c.fn+' '+c.ln:'—'; };
const avatar = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const clr = {
  gray:'background:#f1f5f9;color:#475569',red:'background:#fee2e2;color:#b91c1c',
  green:'background:#dcfce7;color:#15803d',blue:'background:#dbeafe;color:#1d4ed8',
  amber:'background:#fef3c7;color:#b45309',purple:'background:#ede9fe;color:#6d28d9',
  indigo:'background:#e0e7ff;color:#3730a3',teal:'background:#ccfbf1;color:#0f766e',
};
const jobStatusColor = {};
const invStatusColor = {Draft:'gray',Sent:'blue',Partial:'amber',Paid:'green',Overdue:'red'};

// ── SVG ICON ──────────────────────────────────────────────────────────────────
const PATHS = {
  dashboard:'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z|M9 22V12h6v10',
  contacts:'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8|M23 21v-2a4 4 0 00-3-3.87|M16 3.13a4 4 0 010 7.75',
  deals:'M22 7H2|M22 12H2|M22 17H2',
  jobs:'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z|M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
  schedule:'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2|M16 2v4|M8 2v4|M3 10h18|M8 14h.01|M12 14h.01|M16 14h.01|M8 18h.01|M12 18h.01',
  capacity:'M12 2a10 10 0 100 20 10 10 0 000-20z|M12 6v6l4 2|M2 12h2|M20 12h2|M12 2v2|M12 20v2',
  cmmap:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M12 10a2 2 0 100-4 2 2 0 000 4z',
  jobsettings:'M12 15a3 3 0 100-6 3 3 0 000 6z|M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  servicelist:'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  servicemap:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M15 10a3 3 0 11-6 0 3 3 0 016 0z',
  svcschedule:'M12 8v4l3 3|M3.05 11a9 9 0 0117.9 0|M3.05 13a9 9 0 0017.9 0',
  jobdashboard:'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  weeklyrev:'M18 20V10|M12 20V4|M6 20v-6',
  finalsignoff:'M9 11l3 3L22 4|M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  factory:'M2 20h20|M6 20V8l6-6 6 6v12|M10 14h4v6h-4z|M9 10h1v1H9z|M14 10h1v1h-1z',
  dispatch:'M1 3h15v13H1z|M16 8h4l3 3v5h-2|M5.5 18a2.5 2.5 0 100-5 2.5 2.5 0 000 5z|M18.5 18a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  prodboard:'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z|M9 3v18|M15 3v18|M3 9h18',
  factorydash:'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  prodqueue:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2|M9 5a2 2 0 012-2h0a2 2 0 012 2v0|M9 14l2 2 4-4',
  factorydispatch:'M16 3h5v5|M21 3l-7 7|M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5',
  factorycap:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7',
  accdash:'M12 2a10 10 0 100 20 10 10 0 000-20z|M12 6v6l4 2',
  accoutstanding:'M12 1v22|M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  acccashflow:'M2 12h5l2-7 4 14 2-7h5|M22 12h-3',
  accrecon:'M9 11l3 3L22 4|M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  accbills:'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8',
  accweekly:'M18 20V10|M12 20V4|M6 20v-6|M2 20h20',
  accbranch:'M18 20V10|M12 20V4|M6 20v-6',
  accxero:'M4 4l8 8|M20 4l-8 8|M4 20l8-8|M20 20l-8-8',
  factorybom:'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8',
  scheduler:'M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z|M8 2v4|M16 2v4|M3 10h18',
  timesheets:'M12 2a10 10 0 100 20 10 10 0 000-20z|M12 6v6l4 2',
  reports:'M18 20V10|M12 20V4|M6 20v-6',
  audit:'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M10 14l2 2 4-4',
  settings:'M12 15a3 3 0 100-6 3 3 0 000 6z|M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  plus:'M12 5v14|M5 12h14', search:'M11 17a6 6 0 100-12 6 6 0 000 12z|M21 21l-4.35-4.35',
  bell:'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9|M13.73 21a2 2 0 01-3.46 0',
  x:'M18 6L6 18|M6 6l12 12', left:'M15 18l-6-6 6-6', right:'M9 18l6-6-6-6', down:'M6 9l6 6 6-6',
  arr:'M5 12h14|M12 5l7 7-7 7', edit:'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7|M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z',
  trash:'M3 6h18|M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6|M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  check:'M20 6L9 17l-5-5', alert:'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z|M12 9v4|M12 17h.01',
  dollar:'M12 1v22|M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  trend:'M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6', send:'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
  download:'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  user:'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2|M12 11a4 4 0 100-8 4 4 0 000 8',
  clock:'M12 2a10 10 0 100 20 10 10 0 000-20z|M12 6v6l4 2',
  pkg:'M12 3L2 7l10 4 10-4-10-4z|M2 17l10 4 10-4|M2 12l10 4 10-4',
  menu:'M3 12h18|M3 6h18|M3 18h18',
  filter:'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  email2:'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6l-10 7L2 6',
  map:'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z|M8 2v16|M16 6v16',
  map:'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z|M8 2v16|M16 6v16',
  inbox:'M22 13H2|M16 2H8a2 2 0 00-2 2v9l-4 7h20l-4-7V4a2 2 0 00-2-2z',
  mail2:'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6l-10 7L2 6',
  phone2:'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 13.6a19.79 19.79 0 01-3.07-8.67A2 2 0 013.6 3h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 10.9a16 16 0 006.02 6.02l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 17z',
  calendar:'M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z|M16 2v4|M8 2v4|M3 10h18',
  pin:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M12 10a2 2 0 100-4 2 2 0 000 4z',
  filetext:'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8',
  external:'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6|M15 3h6v6|M10 14L21 3',
  leads:'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8',
  phone:'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 13.6a19.79 19.79 0 01-3.07-8.67A2 2 0 013.6 3h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 10.9a16 16 0 006.02 6.02l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 17z',
  won:'M8.21 13.89L7 23l5-3 5 3-1.21-9.12|M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2',
  commission:'M12 2v20|M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  invoicing:'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8',
  email:'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6l-10 7L2 6',
  calendar:'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2|M16 2v4|M8 2v4|M3 10h18',
};

function Icon({n,size=16,style='',cls=''}){
  const paths=(PATHS[n]||'').split('|');
  const s=`width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;flex-shrink:0;${style}`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${s}" class="${cls}">${paths.map(d=>`<path d="${d}"/>`).join('')}</svg>`;
}

function Badge(label, type='gray'){
  const c=clr[type]||clr.gray;
  return `<span class="bdg" style="${c}">${label}</span>`;
}
function StatusBadge(status, variant='deal'){
  const m={};
  return Badge(status, m[status]||'gray');
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function renderToasts(){
  const el=document.getElementById('toasts'); if(!el)return;
  const {toasts}=getState();
  const typeStyle={success:'background:#f0fdf4;border:1px solid #bbf7d0;color:#166534',error:'background:#fef2f2;border:1px solid #fecaca;color:#991b1b',warning:'background:#fffbeb;border:1px solid #fde68a;color:#92400e',info:'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af'};
  el.innerHTML=toasts.map(t=>`<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.1);font-size:13px;font-weight:500;min-width:260px;${typeStyle[t.type]||typeStyle.info}">${t.msg}</div>`).join('');
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────

// ── TOPBAR ────────────────────────────────────────────────────────────────────
let topbarSearchTimer=null;
// ── Module Bar (top-level red bar for Sales CRM / Job CRM / future modules) ─
var MODULE_BAR_HEIGHT = 40;
var TOPBAR_HEIGHT = 56;
// Bottom nav is the primary navigation in the wrapper (no sidebar). Height
// stays 0 on desktop so layouts compute correctly there.
var BOTTOMNAV_HEIGHT = 0;
// Capacitor wrapper: hide the red module bar, switch to a black header bar
// at 48px (room for the SPARTAN logo) and reserve 56px for the bottom nav.
if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
  MODULE_BAR_HEIGHT = 0;
  TOPBAR_HEIGHT = 48;
  BOTTOMNAV_HEIGHT = 56;
}
function renderModuleBar(){
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) return '';
  const mode = getState().crmMode || 'sales';
  const modules = [
    {key:'sales', label:'Sales CRM', icon:'deals'},
    {key:'jobs',  label:'Job CRM',   icon:'jobs'},
    {key:'factory', label:'Factory CRM',  icon:'factory'},
    {key:'accounts', label:'Accounts',  icon:'invoicing'},
    {key:'service', label:'Service CRM', icon:'phone'},
  ].filter(function(m){return canAccessModule(m.key);});
  return `<div id="moduleBar" style="position:fixed;top:0;left:0;right:0;height:${MODULE_BAR_HEIGHT}px;background:#c41230;z-index:50;display:flex;align-items:center;padding:0 16px;gap:0;font-family:Syne,sans-serif">
    <div style="display:flex;align-items:center;gap:6px;margin-right:20px">
      <span style="font-weight:800;font-size:13px;color:#fff;letter-spacing:.5px">SPARTAN</span>
    </div>
    <div style="display:flex;align-items:center;gap:2px">
      ${modules.filter(function(m){return canAccessModule(m.key);}).map(function(m){
        var on = mode === m.key;
        var defPage = m.key==='jobs'?'jobdashboard':m.key==='service'?'servicelist':m.key==='factory'?'factorydash':m.key==='accounts'?'accdash':'dashboard';
        return '<button onclick="setState({crmMode:\'' + m.key + '\',page:\'' + defPage + '\',dealDetailId:null,leadDetailId:null,contactDetailId:null,jobDetailId:null,serviceDetailId:null})" style="padding:6px 16px;border:none;border-radius:6px;font-size:12px;font-weight:700;font-family:Syne,sans-serif;cursor:pointer;letter-spacing:.3px;transition:all .15s;' + (on ? 'background:rgba(255,255,255,.22);color:#fff' : 'background:transparent;color:rgba(255,255,255,.55)') + '" onmouseover="if(!' + on + ')this.style.background=\'rgba(255,255,255,.1)\'" onmouseout="if(!' + on + ')this.style.background=\'transparent\'">' + m.label + '</button>';
      }).join('')}
    </div>
  </div>`;
}

// ── Bottom Nav (native wrapper only) ─────────────────────────────────────────
// Primary navigation on phone — replaces the desktop sidebar. Seven tabs:
// Today (→ dashboard), Deals, Leads, Email, Calendar, Comm, More. The "More"
// tab opens a screen with the less-frequently-used pages (Won, Contacts,
// Reports, Audit, Schedule Map, Phone, Profile, Settings, Invoicing).
function renderBottomNav(){
  if (typeof isNativeWrapper !== 'function' || !isNativeWrapper()) return '';
  const { page } = getState();
  const NAV = [
    { id:'dashboard',  label:'Today',    icon:'dashboard' },
    { id:'deals',      label:'Deals',    icon:'deals' },
    { id:'leads',      label:'Leads',    icon:'leads' },
    { id:'email',      label:'Email',    icon:'email' },
    { id:'calendar',   label:'Calendar', icon:'calendar' },
    { id:'commission', label:'Comm',     icon:'commission' },
    { id:'more',       label:'More',     icon:'settings' },
  ];
  // Map the current `page` to the tab that "owns" it so the right tab stays
  // highlighted when the user is on a less-common screen.
  var ownerTab = page;
  if (['won','contacts','reports','audit','map','settings','profile','phone','invoicing'].indexOf(page) >= 0) ownerTab = 'more';
  return `<nav id="bottomNav" style="position:fixed;bottom:0;left:0;right:0;height:${BOTTOMNAV_HEIGHT}px;background:#fff;border-top:1px solid #e5e7eb;display:flex;z-index:40;box-shadow:0 -2px 12px rgba(0,0,0,.04)">
    ${NAV.map(function(n){
      var active = ownerTab === n.id;
      return `<button onclick="setState({page:'${n.id}',dealDetailId:null,leadDetailId:null,contactDetailId:null,jobDetailId:null})" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;cursor:pointer;padding:6px 2px;color:${active ? '#c41230' : '#6b7280'};font-family:inherit;position:relative">
        ${active ? '<span style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:32px;height:2px;background:#c41230;border-radius:0 0 4px 4px"></span>' : ''}
        ${Icon({n: n.icon, size: 18})}
        <span style="font-size:9px;font-weight:700;letter-spacing:.02em;white-space:nowrap">${n.label}</span>
      </button>`;
    }).join('')}
  </nav>`;
}

function renderTopBar(){
  const {sidebarOpen,branch,notifs}=getState();
  const native = typeof isNativeWrapper === 'function' && isNativeWrapper();
  // On native the sidebar is an overlay drawer — no left offset for content.
  const offset = native ? 0 : (sidebarOpen ? 220 : 64);
  const unread=notifs.filter(n=>!n.read).length;
  const dev = (typeof isDevMode === 'function') && isDevMode();
  const devBadge = (dev && !native)
    ? `<span title="Dev mode is on — stand-in trigger buttons are visible. Add ?dev=0 to URL to disable." style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:11px;font-weight:700;color:#92400e;padding:4px 10px;cursor:help;letter-spacing:.5px">🧪 DEV</span>`
    : '';
  // Native: SPARTAN word-mark on the left as brand anchor. The drawer is
  // gone now that the bottom nav owns navigation, so no hamburger.
  const brandLeft = native
    ? `<div style="display:flex;align-items:baseline;gap:6px;flex:1;min-width:0;color:#fff;font-family:Syne,sans-serif;font-weight:800;font-size:15px;letter-spacing:.5px">SPARTAN<span style="font-size:9px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:.6px">SALES</span></div>`
    : '';
  // Native theme tokens — black header surface, white text/icons.
  const tbBg = native ? '#0a0a0a' : '#fff';
  const tbBorder = native ? '0' : '1px solid #f0f0f0';
  return `<header id="topbar" style="position:fixed;top:${MODULE_BAR_HEIGHT}px;left:${offset}px;right:0;height:${TOPBAR_HEIGHT}px;background:${tbBg};border-bottom:${tbBorder};display:flex;align-items:center;padding:0 ${native ? '12' : '24'}px;gap:${native ? '8' : '16'}px;z-index:20;transition:left .2s">
    ${brandLeft}
    ${devBadge}
    ${native ? '' : `<div style="position:relative;flex:1;max-width:400px">
      <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#9ca3af">${Icon({n:'search',size:14})}</span>
      <input id="topSearch" placeholder="Search contacts, deals, leads... (/)" style="width:100%;padding:7px 10px 7px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;font-family:inherit" oninput="handleTopSearch(this.value)" onfocus="document.getElementById('searchDrop').style.display='block'" onblur="setTimeout(()=>{const d=document.getElementById('searchDrop');if(d)d.style.display='none'},200)">
      <div id="searchDrop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:100;max-height:320px;overflow-y:auto"></div>
    </div>`}
    <div style="display:flex;align-items:center;gap:${native ? '4' : '8'}px">
      ${native ? '' : `<div style="position:relative">
        <button onclick="toggleBranchDrop()" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          <span style="width:8px;height:8px;background:#c41230;border-radius:50%;display:inline-block"></span>
          ${branch==='all'?'All Branches':branch}
          ${Icon({n:'down',size:11})}
        </button>
        <div id="branchDrop" style="display:none;position:absolute;right:0;top:calc(100%+4px);background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.1);z-index:100;min-width:140px;padding:4px">
          ${['all','VIC','ACT','SA'].map(b=>`<div onclick="setState({branch:'${b}'});hideBranchDrop()" style="padding:8px 14px;font-size:13px;cursor:pointer;border-radius:6px;font-weight:${branch===b?'700':'400'};color:${branch===b?'#c41230':'#333'}" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">${b==='all'?'All Branches':b}</div>`).join('')}
        </div>
      </div>`}
      ${native ? '' : (function(){
        // Voicemail badge — only renders when there's at least one unread voicemail.
        // Click navigates to the Phone page where the voicemails section lives.
        if (typeof unreadVoicemailCount !== 'function') return '';
        var vmCount = unreadVoicemailCount();
        if (vmCount <= 0) return '';
        return `<button title="${vmCount} unread voicemail${vmCount===1?'':'s'}" onclick="setState({page:'phone'})" style="position:relative;padding:7px;border:none;background:none;cursor:pointer;color:#6b7280;border-radius:8px;font-size:18px" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">📨<span style="position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;background:#c41230;border-radius:50%;font-size:10px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center">${vmCount}</span></button>`;
      })()}
      <div style="position:relative">
        <button id="notifBell" onclick="toggleNotifDrop()" style="position:relative;padding:7px;border:none;background:none;cursor:pointer;transition:transform .2s,color .2s;color:${native ? 'rgba(255,255,255,.85)' : '#6b7280'};border-radius:8px" onmouseover="this.style.background='${native ? 'rgba(255,255,255,.1)' : '#f3f4f6'}'" onmouseout="this.style.background=''">
          ${Icon({n:'bell',size:18})}
          ${unread>0?`<span style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;background:#c41230;border-radius:50%;font-size:10px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center">${unread}</span>`:''}
        </button>
        <div id="notifDrop" style="display:none;position:absolute;right:0;top:calc(100%+4px);width:300px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:100;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f0f0f0">
            <span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px">Notifications</span>
            ${unread>0?`<button onclick="markAllRead()" style="font-size:12px;color:#c41230;background:none;border:none;cursor:pointer;font-family:inherit">Mark all read</button>`:''}
          </div>
          <div style="max-height:280px;overflow-y:auto">
            ${notifs.map(n=>`<div style="padding:12px 16px;border-bottom:1px solid #f9fafb;cursor:pointer;${!n.read?'background:#fff5f6':''}" onclick="handleNotifClick('${n.id}','${n.to||'dashboard'}','${n.emailId||''}','${n.type||''}')" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${!n.read?'#fff5f6':''}'">
              <div style="display:flex;gap:8px;align-items:flex-start">
                ${!n.read?`<div style="width:6px;height:6px;background:#c41230;border-radius:50%;margin-top:5px;flex-shrink:0"></div>`:'<div style="width:6px;flex-shrink:0"></div>'}
                <div style="flex:1"><div style="font-size:12px;font-weight:600;color:#111">${n.title}</div><div style="font-size:11px;color:#6b7280;margin-top:2px;line-height:1.5">${n.body}</div>
                <div style="font-size:10px;color:#9ca3af;margin-top:3px">${n.time||''}</div></div>
              </div>
            </div>`).join('')}
            ${notifs.length===0?`<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px">\u2713 All caught up</div>`:''}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;${native ? '' : 'padding-left:8px;border-left:1px solid #f0f0f0;'}position:relative;cursor:pointer" onclick="toggleProfileDrop()">
        <div style="width:30px;height:30px;background:#c41230;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${(getCurrentUser()||{initials:"AD"}).initials}</div>
        ${native ? '' : `<div><div style="font-size:12px;font-weight:600;color:#111;line-height:1.2">${(getCurrentUser()||{name:"Admin"}).name}</div><div style="font-size:10px;color:#9ca3af">${(getCurrentUser()||{role:"admin"}).role}</div></div>
        <span style="font-size:10px;color:#9ca3af;margin-left:2px">▾</span>`}
        <!-- Profile dropdown -->
        <div id="profileDrop" style="display:none;position:absolute;top:${native ? '44' : '44'}px;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);z-index:200;width:220px;overflow:hidden" onclick="event.stopPropagation()">
          <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;background:#c41230;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${(getCurrentUser()||{initials:'AD'}).initials}</div>
            <div><div style="font-size:13px;font-weight:600">${(getCurrentUser()||{name:'Admin'}).name}</div><div style="font-size:11px;color:#6b7280">${(getCurrentUser()||{email:''}).email}</div></div>
          </div>
          <div style="padding:6px">
            <button onclick="profileDropOpen=false;setState({page:'profile',dealDetailId:null,leadDetailId:null,contactDetailId:null})" style="width:100%;text-align:left;padding:9px 12px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;border-radius:8px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">${Icon({n:'contacts',size:15})} My Profile</button>
            ${(getCurrentUser()||{role:''}).role==='admin'?`<button onclick="profileDropOpen=false;settTab='users';setState({page:'settings'})" style="width:100%;text-align:left;padding:9px 12px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;border-radius:8px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">${Icon({n:'settings',size:15})} Manage Users</button>`:''}
            <button onclick="profileDropOpen=false;setState({page:'settings',dealDetailId:null,leadDetailId:null,contactDetailId:null})" style="width:100%;text-align:left;padding:9px 12px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;border-radius:8px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">${Icon({n:'settings',size:15})} Settings</button>
          </div>
          <div style="padding:6px;border-top:1px solid #f0f0f0">
            <button onclick="logout()" style="width:100%;text-align:left;padding:9px 12px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:13px;color:#b91c1c;border-radius:8px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">↪ Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  </header>`;
}

function toggleBranchDrop(){const d=document.getElementById('branchDrop');d&&(d.style.display=d.style.display==='none'?'block':'none');}
function hideBranchDrop(){const d=document.getElementById('branchDrop');if(d)d.style.display='none';}
function toggleNotifDrop(){const d=document.getElementById('notifDrop');d&&(d.style.display=d.style.display==='none'?'block':'none');}
function hideNotifDrop(){const d=document.getElementById('notifDrop');if(d)d.style.display='none';}

function handleNotifClick(id, to, emailId, ntype) {
  setState({notifs: getState().notifs.map(n=>n.id===id?{...n,read:true}:n)});
  hideNotifDrop();
  if(ntype==='email_open'||ntype==='email_click'||to==='email')
    setState({page:'email', emailFolder:'tracking', emailSelectedId:emailId||null});
  else if(ntype==='invoice_overdue'||ntype==='invoice_due'||to==='invoicing')
    setState({page:'invoicing'});
  else if(ntype==='appointment'||to==='calendar')
    setState({page:'calendar'});
  else if(to==='deals') setState({page:'deals'});
  else if(to==='leads') setState({page:'leads'});
  else if(to==='contacts') setState({page:'contacts'});
  else setState({page:'dashboard'});
}

function markAllRead(){setState({notifs:getState().notifs.map(n=>({...n,read:true}))});hideNotifDrop();}

// ── NOTIFICATION GENERATOR — builds live notifs from real data ────────────────
function generateNotifications() {
  var notifs = [];
  var now = new Date();
  var todayStr = now.toISOString().slice(0,10);
  var cu = getCurrentUser() || {name:'Admin',role:'admin'};

  // 1. TODAY'S APPOINTMENTS
  var todayApts = MOCK_APPOINTMENTS.filter(function(a) {
    return a.date === todayStr && (cu.role === 'admin' || cu.role === 'accounts' || cu.role === 'sales_manager' || a.rep === cu.name);
  });
  todayApts.forEach(function(apt) {
    var nowMins = now.getHours() * 60 + now.getMinutes();
    var aptParts = (apt.time || '09:00').split(':');
    var aptMins = parseInt(aptParts[0]) * 60 + parseInt(aptParts[1] || 0);
    var diff = aptMins - nowMins;
    var label = '';
    if (diff > 0 && diff <= 60) label = 'in ' + diff + ' min';
    else if (diff > 60 && diff <= 120) label = 'in ' + Math.round(diff/60) + 'h';
    else if (diff <= 0 && diff > -30) label = 'now';
    else if (diff > 0) label = 'at ' + apt.time;
    else return; // past appointment

    notifs.push({
      id: 'n_apt_' + apt.id,
      title: (diff > 0 && diff <= 60 ? '\u23f0 ' : '\ud83d\udcc5 ') + apt.client,
      body: '\ud83d\udccd ' + apt.suburb + ' \u00b7 ' + apt.type + ' ' + label + (apt.rep && apt.rep !== cu.name ? ' \u00b7 ' + apt.rep.split(' ')[0] : ''),
      read: diff > 60,
      time: label,
      type: 'appointment',
      to: apt.dealId ? 'deals' : apt.leadId ? 'leads' : 'calendar',
      dealId: apt.dealId || null,
      leadId: apt.leadId || null,
      urgent: diff > 0 && diff <= 30,
    });
  });

  // 2. UPCOMING APPOINTMENTS (tomorrow)
  var tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = tomorrow.toISOString().slice(0,10);
  var tomorrowApts = MOCK_APPOINTMENTS.filter(function(a) {
    return a.date === tomorrowStr && (cu.role !== 'sales_rep' || a.rep === cu.name);
  });
  if (tomorrowApts.length > 0) {
    notifs.push({
      id: 'n_tomorrow_' + tomorrowStr,
      title: '\ud83d\udcc5 Tomorrow: ' + tomorrowApts.length + ' appointment' + (tomorrowApts.length !== 1 ? 's' : ''),
      body: tomorrowApts.slice(0,3).map(function(a){ return a.client + ' (' + a.suburb + ')'; }).join(', '),
      read: true, time: 'Tomorrow', type: 'appointment', to: 'calendar',
    });
  }

  // 3. OVERDUE INVOICES
  var invoices = getInvoices ? getInvoices() : [];
  var overdue = invoices.filter(function(i) { return i.status === 'overdue' || (i.status === 'sent' && i.dueDate && i.dueDate < todayStr); });
  overdue.forEach(function(inv) {
    notifs.push({
      id: 'n_overdue_' + inv.id,
      title: '\u26a0\ufe0f Invoice ' + inv.invoiceNumber + ' overdue',
      body: inv.contactName + ' \u00b7 ' + fmt$(inv.total) + ' \u00b7 Due: ' + inv.dueDate,
      read: false, time: 'Overdue', type: 'invoice_overdue', to: 'invoicing',
    });
  });

  // 4. INVOICES DUE SOON (next 3 days)
  var threeDays = new Date(now.getTime() + 3*24*3600000).toISOString().slice(0,10);
  invoices.filter(function(i) { return i.status === 'sent' && i.dueDate && i.dueDate >= todayStr && i.dueDate <= threeDays; }).forEach(function(inv) {
    notifs.push({
      id: 'n_duesoon_' + inv.id,
      title: '\ud83d\udcb0 Invoice ' + inv.invoiceNumber + ' due soon',
      body: inv.contactName + ' \u00b7 ' + fmt$(inv.total) + ' \u00b7 Due: ' + inv.dueDate,
      read: true, time: 'Due soon', type: 'invoice_due', to: 'invoicing',
    });
  });

  // 5. NEW LEADS (today)
  var leads = getState().leads;
  var newToday = leads.filter(function(l) { return l.status === 'New' && !l.converted && l.created === todayStr; });
  if (newToday.length > 0) {
    notifs.push({
      id: 'n_newleads_' + todayStr,
      title: '\ud83c\udf1f ' + newToday.length + ' new lead' + (newToday.length !== 1 ? 's' : '') + ' today',
      body: newToday.slice(0,3).map(function(l){ return l.fn + ' ' + l.ln; }).join(', '),
      read: false, time: 'Today', type: 'new_lead', to: 'leads',
    });
  }

  // 6. PRESERVE existing email tracking notifs (from real-time tracking)
  var existing = getState().notifs.filter(function(n) { return n.type === 'email_open' || n.type === 'email_click'; });
  existing.forEach(function(n) { notifs.push(n); });

  // 7. JOB NOTIFICATIONS
  var allJobs = getState().jobs || [];
  // Check measures due today
  allJobs.filter(function(j){ return j.cmBookedDate === todayStr && !j.cmCompletedAt; }).forEach(function(j){
    notifs.push({id:'n_cm_today_'+j.id, title:'📏 CM today: '+j.jobNumber, body:(j.suburb||'')+ ' — '+(j.title||''), read:false, time:'Today', type:'job_cm_due', to:'jobs'});
  });
  // Overdue check measures
  allJobs.filter(function(j){ return j.cmBookedDate && j.cmBookedDate < todayStr && !j.cmCompletedAt && j.status === 'a_check_measure'; }).forEach(function(j){
    notifs.push({id:'n_cm_overdue_'+j.id, title:'⚠️ CM overdue: '+j.jobNumber, body:'Booked '+j.cmBookedDate+' — no upload yet', read:false, time:'Overdue', type:'job_cm_overdue', to:'jobs'});
  });
  // Installs scheduled today
  allJobs.filter(function(j){ return j.installDate === todayStr && j.status !== 'g_final_payment'; }).forEach(function(j){
    notifs.push({id:'n_inst_today_'+j.id, title:'🔧 Install today: '+j.jobNumber, body:(j.suburb||'')+' — '+(j.title||''), read:false, time:'Today', type:'job_install_today', to:'jobs'});
  });
  // Jobs on hold
  allJobs.filter(function(j){ return j.hold || j.status === 'c4_date_change_hold'; }).forEach(function(j){
    notifs.push({id:'n_hold_'+j.id, title:'⏸️ Job on HOLD: '+j.jobNumber, body:j.holdReason||'No reason specified', read:true, time:'Hold', type:'job_hold', to:'jobs'});
  });
  // Preserve job_created notifs
  var jobNotifs = getState().notifs.filter(function(n){ return n.type === 'job_created'; });
  jobNotifs.forEach(function(n){ notifs.push(n); });

  // Skip the setState (and the full-page rerender it triggers via the global
  // subscribe() listener) when the regenerated list is structurally identical
  // to what's already in state. The timer fires every 60s, so without this
  // guard the page rebuilds itself once a minute even when nothing changed —
  // which wipes uncontrolled DOM input values (e.g. the Users & Roles modal).
  try {
    var prev = getState().notifs || [];
    if (prev.length === notifs.length && JSON.stringify(prev) === JSON.stringify(notifs)) return;
  } catch(e) {}
  setState({ notifs: notifs });
}

// Run on page load and every 60 seconds
function startNotifTimer() {
  generateNotifications();
  setInterval(generateNotifications, 60000);
}

function handleTopSearch(q){
  const drop=document.getElementById('searchDrop');
  if(!drop)return;
  if(!q||q.length<2){drop.style.display='none';drop.innerHTML='';return;}
  const lq=q.toLowerCase();
  const {deals,contacts,leads}=getState();
  let html='<div style="max-height:380px;overflow-y:auto">';
  const hide="document.getElementById('searchDrop').style.display='none';document.getElementById('topSearch').value=''";
  const cs=contacts.filter(c=>(c.fn+' '+c.ln).toLowerCase().includes(lq)||c.email.toLowerCase().includes(lq)||c.phone.includes(lq)).slice(0,4);
  if(cs.length){
    html+='<div style="padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f9fafb">Contacts</div>';
    html+=cs.map(c=>`<div onclick="setState({contactDetailId:'${c.id}',page:'contacts'});${hide}" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid #f9fafb" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
      <div style="width:28px;height:28px;background:#c41230;border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn+' '+c.ln)}</div>
      <div><div style="font-size:13px;font-weight:500">${c.fn} ${c.ln}</div><div style="font-size:11px;color:#9ca3af">${c.email}</div></div>
    </div>`).join('');
  }
  const ds=deals.filter(d=>d.title.toLowerCase().includes(lq)||(d.suburb||'').toLowerCase().includes(lq)||(d.rep||'').toLowerCase().includes(lq)).slice(0,4);
  if(ds.length){
    html+='<div style="padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f9fafb">Deals</div>';
    html+=ds.map(d=>{
      const pl=PIPELINES.find(p=>p.id===d.pid);
      const st=pl?pl.stages.find(s=>s.id===d.sid):null;
      return `<div onclick="setState({dealDetailId:'${d.id}',page:'deals'});${hide}" style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;border-bottom:1px solid #f9fafb" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
        <div><div style="font-size:13px;font-weight:500">${d.title}</div><div style="font-size:11px;color:#9ca3af">${d.suburb||d.branch}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700">${fmt$(d.val)}</div>${st?`<span class="bdg" style="background:${st.col}22;color:${st.col};font-size:10px">${st.name}</span>`:''}</div>
      </div>`;
    }).join('');
  }
  const ls=leads.filter(l=>(l.fn+' '+l.ln).toLowerCase().includes(lq)||l.email.toLowerCase().includes(lq)||(l.suburb||'').toLowerCase().includes(lq)).slice(0,3);
  if(ls.length){
    html+='<div style="padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f9fafb">Leads</div>';
    html+=ls.map(l=>`<div onclick="setState({leadDetailId:'${l.id}',page:'leads'});${hide}" style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
      <div><div style="font-size:13px;font-weight:500">${l.fn} ${l.ln}</div><div style="font-size:11px;color:#9ca3af">${l.source} · ${l.suburb||''}</div></div>
      <div style="text-align:right"><div style="font-size:13px;font-weight:700">${fmt$(l.val)}</div><span class="bdg" style="font-size:10px">${l.status}</span></div>
    </div>`).join('');
  }
  if(!cs.length&&!ds.length&&!ls.length) html+=`<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No results for "${q}"</div>`;
  // Jobs search
  const allJobs=(getState().jobs||[]);
  const js=allJobs.filter(j=>(j.jobNumber||'').toLowerCase().includes(lq)||(j.title||'').toLowerCase().includes(lq)||(j.suburb||'').toLowerCase().includes(lq)).slice(0,4);
  if(js.length){
    html+='<div style="padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f9fafb">Jobs</div>';
    html+=js.map(j=>{
      const stObj=getJobStatusObj(j.status);
      return `<div onclick="setState({jobDetailId:'${j.id}',page:'jobs'});${hide}" style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;border-bottom:1px solid #f9fafb" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
        <div><div style="font-size:13px;font-weight:600;color:#c41230">${j.jobNumber||''}</div><div style="font-size:11px;color:#9ca3af">${j.title||''} · ${j.suburb||''}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700">${fmt$(j.val)}</div><span class="bdg" style="background:${stObj.col}22;color:${stObj.col};font-size:10px">${stObj.label}</span></div>
      </div>`;
    }).join('');
  }
  if(!cs.length&&!ds.length&&!ls.length&&!js.length) html=html.replace(/<\/div>$/,'')+'<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No results</div></div>';
  html+='</div>';
  drop.innerHTML=html; drop.style.display='block';
}

function renderSidebar(){
  // Native wrapper: bottom nav owns navigation, no sidebar at all.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) return '';
  const {page,sidebarOpen,dealDetailId,leadDetailId,contactDetailId,jobDetailId,leads,crmMode}=getState();
  const native = false;
  const w = sidebarOpen ? 220 : 64;
  const mode = crmMode || 'sales';
  const salesNav=[
    ['dashboard','Dashboard'],['contacts','Contacts'],['leads','Leads'],['deals','Deals'],['won','Won Deals'],['calendar','Calendar'],['invoicing','Invoicing'],['commission','Commission'],
    ['email','Email'],['phone','Phone'],['reports','Reports'],['audit','Audit'],['map','Schedule Map'],['settings','Settings'],
  ];
  const jobsNav=[
    ['jobdashboard','Dashboard'],['jobs','Jobs'],['finalsignoff','Final Sign Off'],['schedule','Installation Schedule'],['capacity','Smart Planner'],['cmmap','CM Schedule Map'],['weeklyrev','Weekly Revenue'],['invoicing','Invoicing'],['audit','Audit'],['jobsettings','Settings'],
  ];
  const factoryNav=[
    ['factorydash','Dashboard'],['prodqueue','Job Queue'],['prodboard','Production Board'],['factorybom','BOM & Cut Sheets'],['factorycap','Capacity Planner'],['factorydispatch','Dispatch'],['audit','Audit'],
  ];
  const accountsNav=[
    ['accdash','Dashboard'],['accoutstanding','Outstanding'],['accbills','Supplier Bills'],['accweekly','Weekly In vs Out'],['acccashflow','Cash Flow'],['accrecon','Reconciliation'],['accbranch','Branch P&L'],['accxero','Xero Integration'],['audit','Audit'],
  ];
  const serviceNav=[
    ['servicelist','Service Calls'],['servicemap','Service Scheduler'],['svcschedule','Install Openings'],['invoicing','Invoicing'],['audit','Audit'],['jobsettings','Settings'],
  ];
  const nav = mode === 'jobs' ? jobsNav : mode === 'service' ? serviceNav : mode === 'factory' ? factoryNav : mode === 'accounts' ? accountsNav : salesNav;
  // Filter nav items by permissions
  const filteredNav = nav.filter(function(n){ return canAccessPage(n[0]); });
  // On native: drawer overlays from top:0 covering the topbar area, slides
  // in via transform. On desktop: traditional always-visible sidebar.
  const sbTop = native ? 0 : MODULE_BAR_HEIGHT;
  const sbHeight = native ? '100vh' : `calc(100vh - ${MODULE_BAR_HEIGHT}px)`;
  const sbTransform = native ? `transform:translateX(${sidebarOpen ? '0' : '-100%'});` : '';
  return `<div id="sidebar" style="position:fixed;top:${sbTop}px;left:0;width:${w}px;height:${sbHeight};background:#1a1a1a;z-index:30;display:flex;flex-direction:column;transition:width .2s,transform .2s;${sbTransform}">
    <div style="display:flex;align-items:center;padding:0 12px;height:56px;border-bottom:1px solid rgba(255,255,255,.08);gap:12px">
      <img src="data:image/png;base64,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" style="width:32px;height:32px;border-radius:8px;flex-shrink:0;object-fit:contain" alt="Spartan DG">
      ${sidebarOpen?`<div style="min-width:0"><div style="font-family:Syne,sans-serif;font-weight:800;color:#fff;font-size:14px;white-space:nowrap">SPARTAN</div><div style="font-size:10px;color:#666;white-space:nowrap">DOUBLE GLAZING CRM</div></div>`:''}
      ${native ? '' : `<button onclick="setState({sidebarOpen:!getState().sidebarOpen})" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#555;padding:4px;border-radius:6px;display:flex" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#555'">${Icon({n:sidebarOpen?'left':'right',size:14})}</button>`}
    </div>
    <nav style="flex:1;overflow-y:auto;padding:8px">
      ${filteredNav.map(([id,label])=>{
        const on=(id==='jobs'&&!!jobDetailId)||(id==='deals'&&!!dealDetailId)||(id==='leads'&&!!leadDetailId)||(id==='contacts'&&!!contactDetailId)||(page===id&&!dealDetailId&&!leadDetailId&&!contactDetailId&&!jobDetailId);
        const emailUnread=id==='email'?getState().emailInbox.filter(m=>!m.read).length:0;
        const newLeads=id==='leads'?leads.filter(l=>l.status==='New'&&!l.converted).length:0;
        const wonCount=id==='won'?getState().deals.filter(d=>d.won).length:0;
        const jobCount=id==='jobs'?(getState().jobs||[]).length:0;
        return `<div class="nav-item${on?' on':''}" onclick="setState({page:'${id}',dealDetailId:null,leadDetailId:null,contactDetailId:null,jobDetailId:null${native ? ',sidebarOpen:false' : ''}})" title="${!sidebarOpen?label:''}">
          ${Icon({n:id,size:17})}
          ${sidebarOpen?`<span style="flex:1">${label}</span>`:''}
          ${sidebarOpen&&newLeads>0?`<span style="background:#c41230;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${newLeads}</span>`:''}
          ${sidebarOpen&&emailUnread>0?`<span style="background:#c41230;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${emailUnread}</span>`:''}
          ${sidebarOpen&&wonCount>0?`<span style="background:#22c55e;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${wonCount}</span>`:''}
          ${sidebarOpen&&jobCount>0?`<span style="background:#3b82f6;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${jobCount}</span>`:''}
        </div>`;
      }).join('')}
    </nav>
    <div style="padding:8px;border-top:1px solid rgba(255,255,255,.08)">
      <div class="nav-item" style="cursor:pointer" onclick="setState({page:'profile',dealDetailId:null,leadDetailId:null,contactDetailId:null${native ? ',sidebarOpen:false' : ''}})">
        <div style="width:28px;height:28px;background:#c41230;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;flex-shrink:0">${(getCurrentUser()||{initials:'AD'}).initials}</div>
        ${sidebarOpen?`<div><div style="font-size:12px;font-weight:600;color:#fff">${(getCurrentUser()||{name:'Admin'}).name}</div><div style="font-size:10px;color:#555">${(getCurrentUser()||{role:'admin'}).role} · ${(getCurrentUser()||{branch:'All'}).branch}</div></div>`:''}
      </div>
      ${sidebarOpen?`<button onclick="logout()" style="width:100%;margin-top:4px;padding:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#9ca3af;font-size:11px;cursor:pointer;font-family:inherit">Sign Out</button>`:''}
    </div>
  </div>
  ${native && sidebarOpen ? `<div onclick="setState({sidebarOpen:false})" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:25"></div>` : ''}`;
}


