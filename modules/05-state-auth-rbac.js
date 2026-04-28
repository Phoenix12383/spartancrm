// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 05-state-auth-rbac.js
// Extracted from original index.html lines 1984-2393
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────────────────────
// ROLE-BASED ACCESS CONTROL (RBAC)
var ALL_ROLES = [
  {id:'admin',label:'Admin',desc:'Full access to everything'},
  {id:'sales_manager',label:'Sales Manager',desc:'Sales + Jobs full, Factory/Accounts view'},
  {id:'sales_rep',label:'Sales Rep',desc:'Sales CRM (own data), view Jobs'},
  {id:'production_manager',label:'Production Manager',desc:'Factory + Jobs full, view Sales'},
  {id:'production_staff',label:'Production Staff',desc:'Factory floor only'},
  {id:'installer',label:'Installer',desc:'Assigned jobs only — CM, Install, Service'},
  {id:'accounts',label:'Accounts',desc:'Full Accounts, Invoicing, read-only elsewhere'},
  {id:'service_staff',label:'Service Staff',desc:'Service CRM full, view Jobs'},
  {id:'viewer',label:'Viewer',desc:'Read-only access'},
];

// Module + page permission matrix per role
// 'full' = read+write, 'view' = read-only, false = hidden
var DEFAULT_PERMISSIONS = {
  admin:              {sales:true,jobs:true,factory:true,accounts:true,service:true,
    pages:['*']},
  sales_manager:      {sales:true,jobs:true,factory:'view',accounts:'view',service:true,
    pages:['dashboard','contacts','leads','deals','won','calendar','email','phone','map','reports','settings','invoicing','commission',
      'jobdashboard','jobs','finalsignoff','schedule','capacity','cmmap','weeklyrev','jobsettings',
      'factorydash','prodqueue','factorycap',
      'accdash','accoutstanding','acccashflow',
      'servicelist','servicemap','svcschedule']},
  sales_rep:          {sales:true,jobs:'view',factory:false,accounts:false,service:false,
    pages:['dashboard','contacts','leads','deals','won','calendar','email','phone','map','commission',
      'jobdashboard','jobs']},
  production_manager: {sales:'view',jobs:true,factory:true,accounts:'view',service:false,
    pages:['dashboard','contacts',
      'jobdashboard','jobs','finalsignoff','schedule','capacity','weeklyrev','jobsettings',
      'factorydash','prodqueue','prodboard','factorybom','factorycap','factorydispatch',
      'accdash','accbills','accweekly']},
  production_staff:   {sales:false,jobs:'view',factory:true,accounts:false,service:false,
    pages:['factorydash','prodqueue','prodboard','factorybom','factorycap','factorydispatch',
      'jobdashboard','jobs']},
  installer:          {sales:false,jobs:true,factory:false,accounts:false,service:true,
    pages:['jobdashboard','jobs','schedule','cmmap',
      'servicelist','svcschedule']},
  accounts:           {sales:'view',jobs:'view',factory:'view',accounts:true,service:'view',
    pages:['dashboard','contacts','deals',
      'jobdashboard','jobs','weeklyrev','invoicing',
      'factorydash','prodqueue',
      'accdash','accoutstanding','accbills','accweekly','acccashflow','accrecon','accbranch','accxero',
      'servicelist']},
  service_staff:      {sales:false,jobs:'view',factory:false,accounts:false,service:true,
    pages:['jobdashboard','jobs',
      'servicelist','servicemap','svcschedule']},
  viewer:             {sales:'view',jobs:'view',factory:'view',accounts:'view',service:'view',
    pages:['dashboard','contacts','leads','deals',
      'jobdashboard','jobs','schedule','weeklyrev',
      'factorydash','prodqueue','factorycap',
      'accdash','accoutstanding','acccashflow','accbranch',
      'servicelist']},
};

function getRolePermissions(){
  try{var s=localStorage.getItem('spartan_permissions');if(s)return JSON.parse(s);}catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
}
function saveRolePermissions(p){localStorage.setItem('spartan_permissions',JSON.stringify(p));}


function canEdit(moduleKey){
  var cu=getCurrentUser();if(!cu)return false;
  if(cu.role==='admin')return true;
  var perms=getRolePermissions();
  var rp=perms[cu.role];if(!rp)return false;
  return rp[moduleKey]===true;
}

function isAdmin(){var cu=getCurrentUser();return cu&&cu.role==='admin';}

// USER AUTH SYSTEM
// serviceStates: AU states a sales rep/manager can service. Used by the
// "Unassigned lead" claim flow so a rep can pick up any unowned lead whose
// state is in this list. Defaults to [branch] for branch-bound staff and to
// all AU states for admin/accounts (branch='All'). Admin can edit per user.
var ALL_AU_STATES = ['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'];
const DEFAULT_USERS=[
{id:'u0',name:'Admin',email:'admin@spartandoubleglazing.com.au',role:'admin',branch:'All',phone:'1300 912 161',initials:'AD',active:true,pw:'spartan2026',serviceStates:ALL_AU_STATES.slice()},
];

// Effective service-states list for a user — tolerates legacy users stored in
// localStorage before the serviceStates field existed. Admins and branch='All'
// users service every state; everyone else falls back to their branch.
function getUserStates(u) {
  if (!u) return [];
  if (Array.isArray(u.serviceStates) && u.serviceStates.length) return u.serviceStates;
  if (u.role === 'admin' || u.branch === 'All') return ALL_AU_STATES.slice();
  return u.branch ? [u.branch] : [];
}
function getUsers(){const s=localStorage.getItem('spartan_users');if(s)return JSON.parse(s);localStorage.setItem('spartan_users',JSON.stringify(DEFAULT_USERS));return[...DEFAULT_USERS];}
// Diff-aware save: snapshot the previously-persisted JSON for each user, then
// only upsert the rows whose serialised form actually changed. Without this,
// editing one user re-upserts the entire users table, generating N writes +
// N realtime echoes per change (each of which fires a full-page rerender).
function saveUsers(u){
  var prev = {};
  try {
    (JSON.parse(localStorage.getItem('spartan_users')||'[]'))
      .forEach(function(x){ prev[x.id] = JSON.stringify(x); });
  } catch(e) {}
  localStorage.setItem('spartan_users', JSON.stringify(u));
  if(!_sb) return;
  u.forEach(function(x){
    var snap = JSON.stringify(x);
    if (prev[x.id] === snap) return;
    dbUpsert('users',{id:x.id,email:x.email,name:x.name,role:x.role,branch:x.branch,phone:x.phone,initials:x.initials,active:x.active!==false,custom_perms:x.customPerms||null,service_states:x.serviceStates||null,google_pic:x.googlePic||null,pw:x.pw||'spartan2026'});
  });
}
function getCurrentUser(){const uid=localStorage.getItem('spartan_current_user');if(!uid)return null;return getUsers().find(u=>u.id===uid&&u.active);}

// Per-rep colour override stored in localStorage (keyed by rep name so it
// survives user-id changes). Kept out of the Supabase users table until we
// can add a column there; backwards-compatible with the hardcoded REP_BASES
// default colours.
function _repColourMap() {
  try { return JSON.parse(localStorage.getItem('spartan_rep_colours') || '{}'); }
  catch(e) { return {}; }
}
function getRepColor(repName) {
  if (!repName) return '#9ca3af';
  var map = _repColourMap();
  if (map[repName]) return map[repName];
  // Fallback to REP_BASES default so existing reps keep their pin colour
  // until an admin sets a custom one.
  if (typeof REP_BASES !== 'undefined') {
    var rep = REP_BASES.find(function(r){ return r.name === repName; });
    if (rep && rep.col) return rep.col;
  }
  return '#9ca3af';
}
function setRepColor(repName, color) {
  if (!repName || !color) return;
  var map = _repColourMap();
  map[repName] = color;
  try { localStorage.setItem('spartan_rep_colours', JSON.stringify(map)); }
  catch(e) {}
}
function setCurrentUser(id){localStorage.setItem('spartan_current_user',id);}
function logout(){localStorage.removeItem('spartan_current_user');location.reload();}

// Edit permission — owner or admin can edit. An unassigned lead (owner=='')
// is claimable by any active sales_rep / sales_manager whose serviceStates
// list includes the lead's state — this is the "available pool" flow.
function canEditLead(lead) {
  var u = getCurrentUser();
  if (!u || !lead) return false;
  if (u.role === 'admin') return true;
  if (lead.owner && lead.owner === u.name) return true;
  if (!lead.owner && (u.role === 'sales_rep' || u.role === 'sales_manager')) {
    var states = getUserStates(u);
    if (lead.state && states.indexOf(lead.state) >= 0) return true;
  }
  return false;
}
function canEditContact(contact) {
  var u = getCurrentUser();
  if (!u || !contact) return false;
  if (u.role === 'admin') return true;
  // Contacts use `rep` as the owner field; treat it the same way.
  return !!contact.rep && contact.rep === u.name;
}
function canEditDeal(deal) {
  var u = getCurrentUser();
  if (!u || !deal) return false;
  if (u.role === 'admin') return true;
  // Deals use `rep` as the owner field.
  return !!deal.rep && deal.rep === u.name;
}

// ── Validation: email + Australian phone ────────────────────────────────────
// Returns {ok, error, normalized}. `normalized` is the canonical form we
// persist — empty string inputs return ok:true with normalized:'' so optional
// fields stay optional.
function validateEmail(raw) {
  var s = (raw || '').trim();
  if (!s) return { ok: true, error: '', normalized: '' };
  // Reasonable RFC-ish check — not exhaustive but catches the common typos.
  var ok = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(s);
  return ok ? { ok: true, error: '', normalized: s }
            : { ok: false, error: 'Invalid email format', normalized: s };
}
// Accepts common AU formats for mobile (04xx / +614xx) and landline
// (02/03/07/08 area codes, with or without parens, spaces or dashes).
// Normalises to `+61 4xx xxx xxx` for mobile, `+61 x xxxx xxxx` for landline.
function validateAuPhone(raw) {
  var s = (raw || '').trim();
  if (!s) return { ok: true, error: '', normalized: '' };
  var digits = s.replace(/[^0-9+]/g, '');
  // Strip leading country code variants to a canonical "0X..." form.
  var local;
  if (/^\+61/.test(digits)) local = '0' + digits.slice(3);
  else if (/^0061/.test(digits)) local = '0' + digits.slice(4);
  else if (/^61/.test(digits) && digits.length === 11) local = '0' + digits.slice(2);
  else local = digits;
  // Mobile: 10 digits, starts with 04
  if (/^04\d{8}$/.test(local)) {
    return { ok: true, error: '', normalized: '+61 ' + local.slice(1,4) + ' ' + local.slice(4,7) + ' ' + local.slice(7) };
  }
  // Landline: 10 digits, starts with 02/03/07/08
  if (/^0[2378]\d{8}$/.test(local)) {
    return { ok: true, error: '', normalized: '+61 ' + local.slice(1,2) + ' ' + local.slice(2,6) + ' ' + local.slice(6) };
  }
  return { ok: false, error: 'Invalid AU phone (expected 04xx xxx xxx or (0x) xxxx xxxx)', normalized: s };
}

// Deal/lead monetary value. Blank is treated as $0 (legitimate for warranty /
// goodwill jobs). Negatives are rejected — they've previously been written to
// the DB by accident via the native number input's down-arrow.
function validateDealValue(raw) {
  var s = (raw == null ? '' : String(raw)).trim();
  if (!s) return { ok: true, error: '', normalized: 0 };
  var n = Number(s);
  if (!isFinite(n)) return { ok: false, error: 'Value must be a number', normalized: 0 };
  if (n < 0) return { ok: false, error: 'Value must be $0 or greater', normalized: 0 };
  return { ok: true, error: '', normalized: n };
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL — Permissions per role, customizable by Admin
// ══════════════════════════════════════════════════════════════════════════════
var ALL_ROLES = [
  {id:'admin',label:'Admin',desc:'Full access — everything'},
  {id:'sales_manager',label:'Sales Manager',desc:'Sales + Jobs overview + limited Accounts'},
  {id:'sales_rep',label:'Sales Rep',desc:'Own leads, deals, contacts. Limited Job view'},
  {id:'accounts',label:'Accounts',desc:'Accounts, invoicing, reconciliation. View jobs/sales'},
  {id:'production_manager',label:'Production Manager',desc:'Factory CRM, Job production, limited financials'},
  {id:'production_staff',label:'Production Staff',desc:'Factory floor only — no financials'},
  {id:'installer',label:'Installer',desc:'Assigned jobs, check measure, schedule. No financials'},
  {id:'service_staff',label:'Service Staff',desc:'Service CRM, limited Job/Sales view'},
  {id:'viewer',label:'Viewer',desc:'Read-only access to allowed modules'},
];

// Permission keys: module.page or module.action
var ALL_PERMISSIONS = [
  // Sales CRM
  {key:'sales.dashboard',label:'Sales Dashboard',module:'Sales CRM',group:'sales'},
  {key:'sales.contacts',label:'Contacts',module:'Sales CRM',group:'sales'},
  {key:'sales.leads',label:'Leads',module:'Sales CRM',group:'sales'},
  {key:'sales.deals',label:'Deals & Pipeline',module:'Sales CRM',group:'sales'},
  {key:'sales.calendar',label:'Calendar',module:'Sales CRM',group:'sales'},
  {key:'sales.invoicing',label:'Invoicing',module:'Sales CRM',group:'sales'},
  {key:'sales.commission',label:'Commission',module:'Sales CRM',group:'sales'},
  {key:'sales.reports',label:'Reports',module:'Sales CRM',group:'sales'},
  {key:'sales.settings',label:'Sales Settings',module:'Sales CRM',group:'sales'},
  // Job CRM
  {key:'jobs.dashboard',label:'Job Dashboard',module:'Job CRM',group:'jobs'},
  {key:'jobs.list',label:'Jobs List',module:'Job CRM',group:'jobs'},
  {key:'jobs.signoff',label:'Final Sign Off',module:'Job CRM',group:'jobs'},
  {key:'jobs.schedule',label:'Install Schedule',module:'Job CRM',group:'jobs'},
  {key:'jobs.planner',label:'Smart Planner',module:'Job CRM',group:'jobs'},
  {key:'jobs.cmmap',label:'CM Schedule Map',module:'Job CRM',group:'jobs'},
  {key:'jobs.revenue',label:'Weekly Revenue',module:'Job CRM',group:'jobs'},
  {key:'jobs.checkmeasure',label:'Perform Check Measure',module:'Job CRM',group:'jobs'},
  // Factory CRM
  {key:'factory.dashboard',label:'Factory Dashboard',module:'Factory CRM',group:'factory'},
  {key:'factory.queue',label:'Production Queue',module:'Factory CRM',group:'factory'},
  {key:'factory.board',label:'Production Board',module:'Factory CRM',group:'factory'},
  {key:'factory.bom',label:'BOM & Cut Sheets',module:'Factory CRM',group:'factory'},
  {key:'factory.capacity',label:'Capacity Planner',module:'Factory CRM',group:'factory'},
  {key:'factory.dispatch',label:'Dispatch',module:'Factory CRM',group:'factory'},
  // Accounts
  {key:'accounts.dashboard',label:'Accounts Dashboard',module:'Accounts',group:'accounts'},
  {key:'accounts.outstanding',label:'Outstanding',module:'Accounts',group:'accounts'},
  {key:'accounts.bills',label:'Supplier Bills',module:'Accounts',group:'accounts'},
  {key:'accounts.weekly',label:'Weekly In vs Out',module:'Accounts',group:'accounts'},
  {key:'accounts.cashflow',label:'Cash Flow',module:'Accounts',group:'accounts'},
  {key:'accounts.recon',label:'Reconciliation',module:'Accounts',group:'accounts'},
  {key:'accounts.branch',label:'Branch P&L',module:'Accounts',group:'accounts'},
  {key:'accounts.xero',label:'Xero Integration',module:'Accounts',group:'accounts'},
  // Service CRM
  {key:'service.list',label:'Service Calls',module:'Service CRM',group:'service'},
  {key:'service.map',label:'Service Scheduler',module:'Service CRM',group:'service'},
  {key:'service.openings',label:'Install Openings',module:'Service CRM',group:'service'},
  // Phone (Twilio Voice + SMS)
  {key:'phone.access',label:'Phone & Voice Calls',module:'Phone',group:'phone'},
  {key:'phone.sms',label:'Send SMS',module:'Phone',group:'phone'},
  // Data visibility
  {key:'data.view_values',label:'See job values & pricing',module:'Data Access',group:'data'},
  {key:'data.view_margins',label:'See profit margins & costs',module:'Data Access',group:'data'},
  {key:'data.edit_jobs',label:'Edit job details',module:'Data Access',group:'data'},
  {key:'data.manage_users',label:'Manage users & roles',module:'Data Access',group:'data'},
  {key:'data.cad_edit',label:'Edit CAD designs (original)',module:'Data Access',group:'data'},
];

// Default permissions per role
var DEFAULT_ROLE_PERMS = {
  admin: ALL_PERMISSIONS.map(function(p){return p.key;}), // everything
  sales_manager: ['sales.dashboard','sales.contacts','sales.leads','sales.deals','sales.calendar','sales.invoicing','sales.commission','sales.reports','sales.settings',
    'jobs.dashboard','jobs.list','jobs.signoff','jobs.schedule','jobs.planner','jobs.cmmap','jobs.revenue',
    'accounts.dashboard','accounts.outstanding',
    'service.list',
    'phone.access','phone.sms',
    'data.view_values','data.view_margins','data.edit_jobs','data.cad_edit'],
  sales_rep: ['sales.dashboard','sales.contacts','sales.leads','sales.deals','sales.calendar','sales.commission',
    'jobs.dashboard','jobs.list',
    'phone.access','phone.sms',
    'data.view_values'],
  accounts: ['accounts.dashboard','accounts.outstanding','accounts.bills','accounts.weekly','accounts.cashflow','accounts.recon','accounts.branch','accounts.xero',
    'sales.invoicing','sales.dashboard',
    'jobs.dashboard','jobs.list','jobs.revenue',
    'phone.access','phone.sms',
    'data.view_values','data.view_margins'],
  production_manager: ['factory.dashboard','factory.queue','factory.board','factory.bom','factory.capacity','factory.dispatch',
    'jobs.dashboard','jobs.list','jobs.schedule',
    'phone.access',
    'data.view_values','data.edit_jobs'],
  production_staff: ['factory.dashboard','factory.queue','factory.board','factory.bom','factory.dispatch'],
  installer: ['jobs.list','jobs.schedule','jobs.cmmap','jobs.checkmeasure',
    'phone.access'],
  service_staff: ['service.list','service.map','service.openings',
    'jobs.dashboard','jobs.list',
    'phone.access','phone.sms'],
  viewer: ['sales.dashboard','jobs.dashboard','factory.dashboard','accounts.dashboard','service.list'],
};

// Map page routes to permission keys
var PAGE_PERM_MAP = {
  dashboard:'sales.dashboard',contacts:'sales.contacts',leads:'sales.leads',deals:'sales.deals',
  won:'sales.deals',calendar:'sales.calendar',invoicing:'sales.invoicing',commission:'sales.commission',
  reports:'sales.reports',settings:'sales.settings',email:'sales.deals',phone:'phone.access',map:'sales.deals',profile:'sales.dashboard',
  jobdashboard:'jobs.dashboard',jobs:'jobs.list',finalsignoff:'jobs.signoff',schedule:'jobs.schedule',
  capacity:'jobs.planner',cmmap:'jobs.cmmap',weeklyrev:'jobs.revenue',jobsettings:'sales.settings',
  factorydash:'factory.dashboard',prodqueue:'factory.queue',prodboard:'factory.board',
  factorybom:'factory.bom',factorycap:'factory.capacity',factorydispatch:'factory.dispatch',
  accdash:'accounts.dashboard',accoutstanding:'accounts.outstanding',accbills:'accounts.bills',
  accweekly:'accounts.weekly',acccashflow:'accounts.cashflow',accrecon:'accounts.recon',
  accbranch:'accounts.branch',accxero:'accounts.xero',
  servicelist:'service.list',servicemap:'service.map',svcschedule:'service.openings',
};

function getUserPerms(user) {
  if (!user) return [];
  if (user.role === 'admin') return ALL_PERMISSIONS.map(function(p){return p.key;});
  // Check for custom permissions override
  if (user.customPerms && Array.isArray(user.customPerms)) return user.customPerms;
  return DEFAULT_ROLE_PERMS[user.role] || [];
}

function hasPermission(permKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var perms = getUserPerms(cu);
  return perms.indexOf(permKey) >= 0;
}

function canAccessPage(pageKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var permKey = PAGE_PERM_MAP[pageKey];
  if (!permKey) return true; // unmapped pages default allow
  return hasPermission(permKey);
}

function canAccessModule(moduleKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var perms = getUserPerms(cu);
  return perms.some(function(p){return p.startsWith(moduleKey+'.');});
}

function canSeeValues() { return hasPermission('data.view_values'); }
function canSeeMargins() { return hasPermission('data.view_margins'); }
function canEditJobs() { return hasPermission('data.edit_jobs'); }
function canManageUsers() { return hasPermission('data.manage_users'); }
function renderLoginScreen(){
document.getElementById('app').innerHTML='<div class="login-bg"><div class="login-card"><div style="text-align:center;margin-bottom:28px"><img src="data:image/png;base64,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" style="width:56px;height:56px;border-radius:14px;margin:0 auto 14px;display:block;object-fit:contain" alt="Spartan DG"><h1 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">SPARTAN CRM</h1><p style="font-size:13px;color:#6b7280;margin:4px 0 0">Double Glazing \u00b7 Sign in</p></div><div id="loginErr" style="display:none;padding:10px;background:#fee2e2;border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-size:12px;margin-bottom:14px;text-align:center"></div><div style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Email</label><input id="loginEmail" class="inp" type="email" placeholder="you@spartandoubleglazing.com.au" autofocus></div><div style="margin-bottom:20px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Password</label><input id="loginPw" class="inp" type="password" placeholder="Enter password" onkeydown="if(event.key===\'Enter\')doLogin()"></div><button onclick="doLogin()" class="btn-r" style="width:100%;justify-content:center;padding:10px;font-size:14px">Sign In</button><div style="display:flex;align-items:center;gap:12px;margin:16px 0"><div style="flex:1;height:1px;background:#e5e7eb"></div><span style="font-size:11px;color:#9ca3af;white-space:nowrap">or</span><div style="flex:1;height:1px;background:#e5e7eb"></div></div><button onclick="googleSignInForLogin()" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;justify-content:center;gap:10px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Sign in with Google</button></div></div>';
}
function doLogin(){
var e=document.getElementById('loginEmail').value.trim().toLowerCase();
var p=document.getElementById('loginPw').value;
var u=getUsers().find(function(x){return x.email.toLowerCase()===e&&x.pw===p&&x.active;});
if(!u){var el=document.getElementById('loginErr');el.textContent='Invalid email/password or account deactivated.';el.style.display='block';return;}
setCurrentUser(u.id);location.reload();
}
var adminEditingUser = null;
// Draft form state for the Add/Edit User modal. Mirrors the inputs so a full
// renderPage() (notif timer, realtime echo, toast lifecycle, …) can rebuild
// the modal HTML without dropping unsaved typing. Seeded on open from the
// user being edited, mutated by oninput/onchange handlers, cleared on close.
var adminEditDraft = null;

function _seedAdminDraftFromUser(u){
  u = u || {};
  var role = u.role || 'sales_rep';
  return {
    name: u.name || '',
    email: u.email || '',
    role: role,
    branch: u.branch || 'VIC',
    phone: u.phone || '',
    pw: '',
    color: getRepColor(u.name||'') || '#c41230',
    customPerms: (u.customPerms || DEFAULT_ROLE_PERMS[role] || []).slice(),
    serviceStates: getUserStates(u).slice(),
  };
}
function adminAddUser(){
  adminEditingUser = 'new';
  adminEditDraft = _seedAdminDraftFromUser({role:'sales_rep',branch:'VIC'});
  renderPage();
}
function adminEditUser(uid){
  adminEditingUser = uid;
  adminEditDraft = _seedAdminDraftFromUser(getUsers().find(function(x){return x.id===uid;}));
  renderPage();
}
function adminCloseModal(){ adminEditingUser = null; adminEditDraft = null; renderPage(); }
function adminDraftSet(field, value){ if(adminEditDraft) adminEditDraft[field] = value; }
function adminDraftTogglePerm(key, on){
  if(!adminEditDraft) return;
  var arr = adminEditDraft.customPerms || [];
  var idx = arr.indexOf(key);
  if(on && idx<0) arr.push(key);
  else if(!on && idx>=0) arr.splice(idx,1);
  adminEditDraft.customPerms = arr;
}
function adminDraftToggleSvcState(st, on){
  if(!adminEditDraft) return;
  var arr = adminEditDraft.serviceStates || [];
  var idx = arr.indexOf(st);
  if(on && idx<0) arr.push(st);
  else if(!on && idx>=0) arr.splice(idx,1);
  adminEditDraft.serviceStates = arr;
}
function adminSaveUser(){
  var d = adminEditDraft;
  if(!d){return;}
  var name = (d.name||'').trim();
  var email = (d.email||'').trim();
  var role = d.role;
  var branch = d.branch;
  var phone = (d.phone||'').trim();
  var color = d.color || '';
  if(!name||!email){addToast('Name and email required','error');return;}
  // Persist the rep colour in localStorage. Keyed by name rather than id so
  // the same colour follows the rep even if their user id changes.
  if (color) setRepColor(name, color);
  // Collapse customPerms to null when they match the role defaults exactly,
  // so role-default changes still flow through to this user.
  var customPerms = (d.customPerms || []).slice();
  var defaults = DEFAULT_ROLE_PERMS[role] || [];
  if (customPerms.length === defaults.length && customPerms.every(function(p){return defaults.indexOf(p)>=0;})) customPerms = null;
  var serviceStates = (d.serviceStates || []).slice();
  var users = getUsers();
  if(adminEditingUser==='new'){
    var pw = d.pw;
    if(!pw){addToast('Password required for new user','error');return;}
    if(users.find(function(u){return u.email.toLowerCase()===email.toLowerCase();})){addToast('Email already in use','error');return;}
    var newUser = {id:'u'+Date.now(),name:name,email:email,role:role,branch:branch,phone:phone,initials:name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase(),active:true,pw:pw};
    if (customPerms) newUser.customPerms = customPerms;
    if (serviceStates) newUser.serviceStates = serviceStates;
    users.push(newUser);
    saveUsers(users);addToast(name+' added','success');
  } else {
    var u = users.find(function(x){return x.id===adminEditingUser;});
    if(!u)return;
    u.name=name;u.email=email;u.role=role;u.branch=branch;u.phone=phone;
    u.initials=name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    if (customPerms) u.customPerms = customPerms; else delete u.customPerms;
    if (serviceStates) u.serviceStates = serviceStates; else delete u.serviceStates;
    if (d.pw) u.pw = d.pw;
    saveUsers(users);addToast(name+' updated','success');
  }
  adminEditingUser=null; adminEditDraft=null; renderPage();
}
function adminToggleUser(uid){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;if(u.id===(getCurrentUser()||{}).id){addToast('Cannot deactivate yourself','error');return;}u.active=!u.active;saveUsers(us);addToast(u.name+(u.active?' activated':' deactivated'));renderPage();}
function adminChangeRole(uid,nr){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;u.role=nr;saveUsers(us);addToast(u.name+' role: '+nr);renderPage();}
function adminChangeBranch(uid,nb){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;u.branch=nb;saveUsers(us);renderPage();}
function adminDeleteUser(uid){if(!confirm('Permanently delete this user? This cannot be undone.'))return;saveUsers(getUsers().filter(function(u){return u.id!==uid;}));if(typeof dbDelete==='function')dbDelete('users',uid);addToast('User deleted','warning');adminEditingUser=null;renderPage();}
function renderAdminUserModal(){
  var isNew = adminEditingUser === 'new';
  // The draft is the source of truth while the modal is open. If it isn't
  // seeded yet (defensive — adminAddUser/adminEditUser always seed it before
  // opening), bail out so we don't render with undefined values.
  if (!adminEditDraft) return '';
  var d = adminEditDraft;
  var existingUser = isNew ? null : getUsers().find(function(u){return u.id===adminEditingUser;});
  // If we're editing a user who has since been deleted (another tab, realtime
  // echo), close silently — matches the original behavior.
  if (!isNew && !existingUser) return '';
  var titleName = isNew ? '' : existingUser.name;
  var deletableId = (!isNew && existingUser && existingUser.id !== (getCurrentUser()||{}).id) ? existingUser.id : null;
  return '<div class="modal-bg" onclick="if(event.target===this)adminCloseModal()"><div class="modal" style="max-width:480px">'
  +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">'+(isNew?'Add New User':'Edit User: '+_escAttr(titleName))+'</h3><button onclick="adminCloseModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">\u00d7</button></div>'
  +'<div style="padding:20px;display:flex;flex-direction:column;gap:14px">'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Full Name *</label><input class="inp" id="au_name" value="'+_escAttr(d.name)+'" placeholder="Jane Smith" oninput="adminDraftSet(\'name\',this.value)"></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Email *</label><input class="inp" id="au_email" value="'+_escAttr(d.email)+'" type="email" placeholder="jane@spartandg.com.au" oninput="adminDraftSet(\'email\',this.value)"></div></div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Role</label><select class="sel" id="au_role" onchange="adminDraftSet(\'role\',this.value)">'
  +'<option value="admin"'+(d.role==='admin'?' selected':'')+'>Admin</option>'
  +'<option value="sales_manager"'+(d.role==='sales_manager'?' selected':'')+'>Sales Manager</option>'
  +'<option value="sales_rep"'+(d.role==='sales_rep'?' selected':'')+'>Sales Rep</option>'
  +'<option value="production_manager"'+(d.role==='production_manager'?' selected':'')+'>Production Manager</option>'
  +'<option value="production_staff"'+(d.role==='production_staff'?' selected':'')+'>Production Staff</option>'
  +'<option value="installer"'+(d.role==='installer'?' selected':'')+'>Installer</option>'
  +'<option value="accounts"'+(d.role==='accounts'?' selected':'')+'>Accounts</option>'
  +'<option value="service_staff"'+(d.role==='service_staff'?' selected':'')+'>Service Staff</option>'
  +'<option value="viewer"'+(d.role==='viewer'?' selected':'')+'>Viewer</option></select></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Branch</label><select class="sel" id="au_branch" onchange="adminDraftSet(\'branch\',this.value)">'
  +'<option value="All"'+(d.branch==='All'?' selected':'')+'>All</option>'
  +'<option value="VIC"'+(d.branch==='VIC'?' selected':'')+'>VIC</option>'
  +'<option value="ACT"'+(d.branch==='ACT'?' selected':'')+'>ACT</option>'
  +'<option value="SA"'+(d.branch==='SA'?' selected':'')+'>SA</option></select></div></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Phone</label><input class="inp" id="au_phone" value="'+_escAttr(d.phone)+'" placeholder="+61 4xx xxx xxx" oninput="adminDraftSet(\'phone\',this.value)"></div>'
  +function(){
    // Service states — AU states this user can claim unassigned leads from.
    // Shown for all roles (harmless for non-sales) so admin can configure
    // coverage for e.g. a sales-manager doubling up as a claims-handler.
    var cur = d.serviceStates || [];
    return '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Service States <span style="font-size:10px;color:#9ca3af;font-weight:400">(can claim unassigned leads in these states)</span></label>'
      +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
      +ALL_AU_STATES.map(function(st){
        var on = cur.indexOf(st) >= 0;
        return '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 9px;border-radius:6px;cursor:pointer;background:'+(on?'#fef2f2':'#f3f4f6')+';border:1px solid '+(on?'#fca5a5':'#e5e7eb')+'"><input type="checkbox" class="svcstate-cb" data-st="'+st+'" '+(on?'checked':'')+' onchange="adminDraftToggleSvcState(\''+st+'\',this.checked)" style="accent-color:#c41230;width:12px;height:12px">'+st+'</label>';
      }).join('')
      +'</div></div>';
  }()
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Map pin colour</label>'
  +'<div style="display:flex;align-items:center;gap:10px">'
  +'<input type="color" id="au_color" value="'+_escAttr(d.color||'#c41230')+'" style="width:50px;height:34px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px" onchange="adminDraftSet(\'color\',this.value)" oninput="adminDraftSet(\'color\',this.value)">'
  +'<span style="font-size:11px;color:#6b7280">Used on the Leads / Schedule / Calendar maps for this rep\u2019s pins.</span>'
  +'</div></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">'+(isNew?'Password *':'New Password (blank = keep current)')+'</label><input class="inp" id="au_pw" type="password" value="'+_escAttr(d.pw)+'" placeholder="'+(isNew?'Set password':'Leave blank to keep')+'" oninput="adminDraftSet(\'pw\',this.value)"></div>'
  +'<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-size:12px;font-weight:600;color:#0369a1">Role Permissions</div><button onclick="document.getElementById(\'permEditor\').style.display=document.getElementById(\'permEditor\').style.display===\'block\'?\'none\':\'block\'" style="font-size:10px;padding:3px 8px;border:1px solid #bae6fd;border-radius:4px;background:#fff;cursor:pointer;color:#0369a1;font-weight:600">Customise \u25bc</button></div><div style="font-size:11px;color:#475569;line-height:1.7"><strong>Admin:</strong> Full access<br><strong>Sales Manager:</strong> Sales + Jobs + limited Accounts<br><strong>Sales Rep:</strong> Own leads, deals, contacts<br><strong>Production Manager:</strong> Factory + Jobs production<br><strong>Production Staff:</strong> Factory floor only<br><strong>Installer:</strong> Assigned jobs, CM, schedule<br><strong>Accounts:</strong> All financials, read-only ops<br><strong>Service Staff:</strong> Service CRM + view Jobs<br><strong>Viewer:</strong> Read-only</div>'
  +'<div id="permEditor" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #bae6fd">'
  +'<div style="font-size:10px;font-weight:700;color:#0369a1;margin-bottom:6px;text-transform:uppercase">Custom Permission Overrides (Admin Only)</div>'
  +function(){var groups={};ALL_PERMISSIONS.forEach(function(p){if(!groups[p.module])groups[p.module]=[];groups[p.module].push(p);});var perms=d.customPerms||[];var html='';Object.entries(groups).forEach(function(g){html+='<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:3px">'+g[0]+'</div><div style="display:flex;flex-wrap:wrap;gap:3px">';g[1].forEach(function(p){var on=perms.indexOf(p.key)>=0;html+='<label style="display:flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:4px;cursor:pointer;background:'+(on?'#dcfce7':'#f3f4f6')+';border:1px solid '+(on?'#86efac':'#e5e7eb')+'"><input type="checkbox" class="perm-cb" data-perm="'+p.key+'" '+(on?'checked':'')+' onchange="adminDraftTogglePerm(\''+p.key+'\',this.checked)" style="accent-color:#22c55e;width:12px;height:12px">'+p.label+'</label>';});html+='</div></div>';});return html;}()
  +'</div></div>'
  +'</div>'
  +'<div style="padding:16px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:'+(isNew?'flex-end':'space-between')+';gap:10px">'
  +(deletableId?'<button onclick="adminDeleteUser(\''+deletableId+'\')" style="padding:8px 14px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#b91c1c;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600">Delete User</button>':'<div></div>')
  +'<div style="display:flex;gap:8px"><button class="btn-w" onclick="adminCloseModal()">Cancel</button><button class="btn-r" onclick="adminSaveUser()">'+(isNew?'Create User':'Save Changes')+'</button></div>'
  +'</div></div></div>';
}

let _state = {
  page: 'dashboard',
  crmMode: 'sales', // 'sales' or 'jobs'
  branch: 'all',
  sidebarOpen: true,
  deals: JSON.parse(JSON.stringify(DEALS)).map(d=>{
    const seed=DEAL_ACTIVITIES_SEED[d.id];
    return seed?{...d,activities:JSON.parse(JSON.stringify(seed))}:{...d,activities:[]};
  }),
  contacts: JSON.parse(JSON.stringify(CONTACTS)),
  notifs: JSON.parse(JSON.stringify(NOTIFS)),
  toasts: [],
  panel: null,
  modal: null,
  dealDetailId: null,
  leadDetailId: null,
  contactDetailId: null,
  contactActivities: {}, // keyed by contactId, shared across deals/leads/contacts
  // Twilio Voice (stage 2). activeCall is null when the rep isn't on a call;
  // when set, the active-call banner renders. callLogs is loaded from
  // public.call_logs by dbLoadAll and kept fresh by the realtime subscription.
  activeCall: null,
  callLogs: [],
  // Stage 3 — set when an inbound call is ringing this rep's browser. The
  // incoming-call banner reads this to render the Answer/Decline UI.
  // Cleared on accept (promotes to activeCall), decline, or auto-timeout.
  incomingCall: null,
  // Stage 4 — Twilio SMS. smsLogs is a flat array of all messages (in/out)
  // loaded by dbLoadAll, kept fresh by realtime. The SMS tab in detail panels
  // filters this by entity_id. smsTemplates is the saved template library.
  smsLogs: [],
  smsTemplates: [],
  leads: JSON.parse(JSON.stringify(LEADS_DATA)),
  leadFilter: 'All',
  leadSearch: '',
  dealFields: JSON.parse(JSON.stringify(DEFAULT_DEAL_FIELDS)),
  leadFields: JSON.parse(JSON.stringify(DEFAULT_LEAD_FIELDS)),
  contactFields: JSON.parse(JSON.stringify(DEFAULT_CONTACT_FIELDS)),
  dealStatuses:    JSON.parse(JSON.stringify(DEFAULT_DEAL_STATUSES)),
  leadStatuses:    JSON.parse(JSON.stringify(DEFAULT_LEAD_STATUSES)),
  contactStatuses: JSON.parse(JSON.stringify(DEFAULT_CONTACT_STATUSES)),
  dealFieldValues: {},
  leadFieldValues: {},
  contactFieldValues: {},
  gmailConnected: false,
  gmailUser: null,       // {email, name, picture}
  gmailToken: null,      // OAuth access token
  emailThreads: {},      // keyed by contactEmail → array of thread summaries
  emailInbox: JSON.parse(JSON.stringify(EMAIL_INBOX_SEED)),
  emailSent:  JSON.parse(JSON.stringify(EMAIL_SENT_SEED)),
  emailDrafts: [],
  emailSelectedId: null, // currently viewed email id
  emailFolder: 'inbox',  // inbox|sent|drafts|templates
  emailComposing: false,
  emailComposeData: {to:'',subject:'',body:'',cc:'',bcc:'',templateId:null,replyToId:null},
  // Jobs module
  jobs: [],
  jobWindows: [],
  jobDetailId: null,
  jobDetailTab: 'overview',
  jobListFilter: 'All',
  jobListSearch: '',
  jobShowHeldOnly: false,
  jobFields: JSON.parse(JSON.stringify(DEFAULT_JOB_FIELDS)),
  jobFieldValues: {},
  jobSortCol: 'created',
  jobSortDir: 'desc',
  // Install schedule
  installers: JSON.parse(localStorage.getItem('spartan_installers')||'[]'),
  scheduleWeekOffset: 0, // 0 = this week, -1 = last week, +1 = next week
  weeklyTargets: {VIC:175000, ACT:100000, SA:75000, TAS:50000},
  // Service CRM
  serviceCalls: JSON.parse(localStorage.getItem('spartan_service_calls')||'[]'),
  serviceDetailId: null,
  // Edit drawers (lead/contact/deal) — holds the id of the entity being
  // edited, or null when the drawer is closed.
  editingLeadId: null,
  editingContactId: null,
  editingDealId: null,
};
let _listeners = [];
const subscribe = fn => { _listeners.push(fn); return ()=>{ _listeners = _listeners.filter(l=>l!==fn); }; };
const getState = () => _state;
var _dbSyncTimer = null;
// setState(patch, opts)
//   opts.skipSync  — when true, don't push the patch back to Supabase. Callers
//                    that are loading FROM Supabase (dbLoadAll, realtime echo)
//                    must pass this, otherwise every load triggers a full
//                    re-upsert, which echoes back as another realtime event,
//                    which triggers another load — infinite feedback loop that
//                    constantly wipes the DOM and kicks focus out of inputs.
const setState = (patch, opts) => {
  opts = opts || {};
  // Capture the pre-patch state so the debounced sync can diff against it and
  // upsert ONLY the records that actually changed — critical because callers
  // like saveActivityToEntity pass setState({leads: leads.map(...)}), which
  // returns a fresh array where unchanged leads keep their original object
  // reference. Without this diff, a one-lead change upsert-storms the whole
  // table (N writes + N realtime echoes + N dbLoadAll cycles).
  var prevState = _state;
  // Skip listener notifications when every patch value is reference-equal to
  // the existing state. Guards against cascading re-renders when a caller
  // passes an unchanged slice.
  var changed = false;
  for (var k in patch) {
    if (patch[k] !== _state[k]) { changed = true; break; }
  }
  _state = {..._state, ...patch};
  if (changed) _listeners.forEach(l=>l());
  if (opts.skipSync) return;
  // Sync changed data to Supabase (debounced). Upsert only the records whose
  // object reference changed — for arrays built with .map, the unchanged
  // entries keep the same reference, so this is an O(changed) filter.
  if (_sb && (patch.contacts || patch.leads || patch.deals || patch.jobs)) {
    clearTimeout(_dbSyncTimer);
    _dbSyncTimer = setTimeout(function() {
      function _upsertChanged(patchArr, prevArr, tableName, toDb) {
        if (!Array.isArray(patchArr)) return;
        var prevById = {};
        (prevArr || []).forEach(function(r){ if (r && r.id) prevById[r.id] = r; });
        patchArr.forEach(function(r) {
          if (!r || !r.id) return;
          if (r !== prevById[r.id]) dbUpsert(tableName, toDb(r));
        });
      }
      _upsertChanged(patch.contacts, prevState.contacts, 'contacts', contactToDb);
      _upsertChanged(patch.leads,    prevState.leads,    'leads',    leadToDb);
      _upsertChanged(patch.deals,    prevState.deals,    'deals',    dealToDb);
      _upsertChanged(patch.jobs,     prevState.jobs,     'jobs',     jobToDb);
    }, 500);
  }
};
const addToast = (msg, type='success') => {
  const id = Date.now().toString();
  setState({toasts:[..._state.toasts,{id,msg,type}]});
  setTimeout(()=>setState({toasts:_state.toasts.filter(t=>t.id!==id)}), 3500);
};

