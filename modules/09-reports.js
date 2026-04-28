// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 09-reports.js
// Extracted from original index.html lines 6588-7015
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── REPORTS ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// FIX 6 — CUSTOM REPORTS BUILDER
// ══════════════════════════════════════════════════════════════════════════════

// ── Saved reports state ───────────────────────────────────────────────────────

const RPT_MEASURES = {
  dealValue:'Deal Value (Won)',dealCount:'Deal Count',jobCount:'Job Count',
  revenue:'Revenue',activityCount:'Activities',conversion:'Conversion Rate',
  avgDeal:'Avg Deal Size',leadCount:'Leads by Source',jobValue:'Job Value',
};
const RPT_GROUPBY = {
  month:'Month',week:'Week',stage:'Pipeline Stage',jobStatus:'Job Status',
  owner:'Owner',source:'Lead Source',suburb:'Suburb',actType:'Activity Type',
  branch:'Branch',dealStatus:'Deal Status',dealType:'Deal Type',
};
const RPT_CHARTS = ['bar','line','pie','donut','table','number'];
const RPT_CHART_ICONS = {bar:'▬',line:'📈',pie:'◕',donut:'◎',table:'⊞',number:'#'};
const RPT_DATERANGES = {
  all:'All time',thisWeek:'This week',thisMonth:'This month',
  thisQuarter:'This quarter',thisYear:'This year',last6m:'Last 6 months',
};
const RPT_FILTER_FIELDS = ['Owner','Stage','Status','Branch','Source','Value','Created Date'];
const RPT_FILTER_OPS = ['is','is not','contains','greater than','less than','is empty','is not empty'];

// ── Data computation ──────────────────────────────────────────────────────────
function rptComputeData(report, dateRange) {
  const {deals, leads, contacts, emailSent} = getState();
  const brd = getState().branch||'all';
  const bFilterR = x => brd==='all' || x.branch===brd;
  const range = dateRange || report.dateRange || 'thisYear';
  const m = report.measure;
  const g = report.groupBy;

  // ── Date helpers ──────────────────────────────────────────────────────────
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-indexed

  const getRangeStart = () => {
    if (range==='thisMonth') return new Date(thisYear, thisMonth, 1);
    if (range==='lastMonth') return new Date(thisYear, thisMonth-1, 1);
    if (range==='thisQuarter') return new Date(thisYear, Math.floor(thisMonth/3)*3, 1);
    if (range==='last6months') return new Date(thisYear, thisMonth-5, 1);
    return new Date(thisYear, 0, 1); // thisYear = Jan 1
  };
  const getRangeEnd = () => {
    if (range==='thisMonth') return new Date(thisYear, thisMonth+1, 0);
    if (range==='lastMonth') return new Date(thisYear, thisMonth, 0);
    return new Date(thisYear, 11, 31);
  };
  const rangeStart = getRangeStart();
  const rangeEnd   = getRangeEnd();
  const inRange = dateStr => {
    if (!dateStr) return false;
    const d = new Date(dateStr+'T12:00');
    return d >= rangeStart && d <= rangeEnd;
  };
  const bDealsR = deals.filter(bFilterR);
  const bLeadsR = leads.filter(bFilterR);

  // ── Month labels for range ────────────────────────────────────────────────
  const getMonthLabels = () => {
    const labels = [];
    let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (d <= rangeEnd) {
      labels.push({
        key: d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),
        label: d.toLocaleDateString('en-AU',{month:'short',year:'2-digit'}),
        year: d.getFullYear(), month: d.getMonth(),
      });
      d = new Date(d.getFullYear(), d.getMonth()+1, 1);
    }
    return labels;
  };

  // ── Week labels for range ─────────────────────────────────────────────────
  const getWeekLabels = () => {
    const labels = [];
    let d = new Date(rangeStart);
    // Align to Monday
    const dow = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - (dow===0?6:dow-1));
    let wn = 1;
    while (d <= rangeEnd) {
      const start = new Date(d);
      const end = new Date(d); end.setDate(end.getDate()+6);
      labels.push({
        key: start.toISOString().slice(0,10),
        label: 'W'+wn+' '+start.toLocaleDateString('en-AU',{day:'numeric',month:'short'}),
        start, end,
      });
      d.setDate(d.getDate()+7);
      wn++;
      if (wn > 53) break;
    }
    return labels.filter(w => w.end >= rangeStart && w.start <= rangeEnd).slice(0,20);
  };

  const REPS = ['James Wilson','Sarah Chen','Emma Brown','Michael Torres','David Kim'];
  const REP_COLS = {'James Wilson':'#c41230','Sarah Chen':'#1e40af','Emma Brown':'#059669','Michael Torres':'#7c3aed','David Kim':'#d97706'};

  // ── Deals won over time (stacked by rep) ─────────────────────────────────
  if (m==='dealValue' && g==='month') {
    const months = getMonthLabels();
    return months.map(mo => {
      const obj = {name: mo.label};
      let total = 0;
      REPS.forEach(r => {
        const val = deals.filter(d => d.rep===r && d.won && d.wonDate && d.wonDate.startsWith(mo.key)).reduce((s,d)=>s+d.val,0);
        obj[r.split(' ')[0]] = val;
        obj['col_'+r.split(' ')[0]] = REP_COLS[r];
        total += val;
      });
      obj.total = total;
      return obj;
    }).filter(mo => mo.total > 0 || months.indexOf(months.find(m=>m.label===mo.name)) < months.findIndex(m=>m.total>0)+3);
  }

  // ── Lead performance by week ──────────────────────────────────────────────
  if (m==='leadCount' && g==='week') {
    const weeks = getWeekLabels();
    return weeks.map(wk => {
      const wLeads = leads.filter(l => {
        if (!l.created) return false;
        const d = new Date(l.created+'T12:00');
        return d >= wk.start && d <= wk.end;
      });
      return {
        name: wk.label,
        'Web/API': wLeads.filter(l=>['Web Enquiry','Facebook','Instagram'].includes(l.source)).length,
        'Manual': wLeads.filter(l=>['Phone','Walk-in','Referral'].includes(l.source)).length,
        'Deal': wLeads.filter(l=>l.converted).length,
        total: wLeads.length,
      };
    });
  }

  // ── Average won deal value ────────────────────────────────────────────────
  if (m==='avgDealValue') {
    const wonDeals = bDealsR.filter(d => d.won && inRange(d.wonDate));
    const avg = wonDeals.length > 0 ? Math.round(wonDeals.reduce((s,d)=>s+d.val,0)/wonDeals.length) : 0;
    // Previous window of equal length, immediately before the current range.
    const DAY = 24*60*60*1000;
    const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevEnd   = new Date(rangeStart.getTime() - DAY);
    const prevStart = new Date(prevEnd.getTime() - rangeMs);
    const prevRangeDeals = bDealsR.filter(d => {
      if (!d.won || !d.wonDate) return false;
      const dd = new Date(d.wonDate+'T12:00');
      return dd >= prevStart && dd <= prevEnd;
    });
    const prevAvg = prevRangeDeals.length>0 ? Math.round(prevRangeDeals.reduce((s,d)=>s+d.val,0)/prevRangeDeals.length) : 0;
    const diff = prevAvg>0 ? avg-prevAvg : 0;
    const pct  = prevAvg>0 ? ((diff/prevAvg)*100).toFixed(1) : 0;
    return [{name:'Average Deal Value', value:avg, prev:prevAvg, diff, pct, count:wonDeals.length}];
  }

  // ── Deal conversion funnel ────────────────────────────────────────────────
  if (m==='dealConversion') {
    const pl = PIPELINES[0];
    const stages = pl.stages.filter(s=>!s.isLost).sort((a,b)=>a.ord-b.ord);
    const totalAtStage = {};
    stages.forEach(st => {
      totalAtStage[st.id] = deals.filter(d => d.pid==='p1' && (d.sid===st.id || d.won)).length;
    });
    const maxDeals = Math.max(...Object.values(totalAtStage), 1);
    return stages.map((st,i) => {
      const reached = totalAtStage[st.id] || 0;
      const next = stages[i+1] ? (totalAtStage[stages[i+1].id]||0) : null;
      const conv = next!==null && reached>0 ? Math.round(next/reached*100) : null;
      return {
        name: st.name, value: reached,
        won: st.isWon ? reached : 0,
        convRate: conv, col: st.col,
      };
    });
  }

  // ── Revenue by salesperson ────────────────────────────────────────────────
  if (m==='dealValue' && g==='owner') {
    return REPS.map(r => {
      const wonV = deals.filter(d=>d.rep===r&&d.won&&inRange(d.wonDate)).reduce((s,d)=>s+d.val,0);
      const pipeV = deals.filter(d=>d.rep===r&&!d.won&&!d.lost).reduce((s,d)=>s+d.val,0);
      return {name:r.split(' ')[0]+'<br>'+r.split(' ')[1], fullName:r, value:wonV, pipeline:pipeV, col:REP_COLS[r]||'#9ca3af'};
    }).filter(r=>r.value>0||r.pipeline>0);
  }

  // ── Lead count by source ──────────────────────────────────────────────────
  if (m==='leadCount' && g==='source') {
    const sources = [...new Set(leads.map(l=>l.source))].filter(Boolean);
    return sources.map(s => ({
      name: s,
      value: leads.filter(l=>l.source===s&&inRange(l.created)).length,
      col: {'Web Enquiry':'#3b82f6','Referral':'#22c55e','Phone':'#f59e0b','Facebook':'#1e40af','Instagram':'#7c3aed','Walk-in':'#0d9488'}[s]||'#9ca3af',
    })).filter(s=>s.value>0).sort((a,b)=>b.value-a.value);
  }

  // ── Pipeline value by stage ───────────────────────────────────────────────
  if (m==='pipelineValue') {
    return PIPELINES[0].stages.filter(s=>!s.isLost&&!s.isWon).map(st => ({
      name: st.name,
      value: deals.filter(d=>d.sid===st.id&&!d.won).reduce((s,d)=>s+d.val,0),
      count: deals.filter(d=>d.sid===st.id&&!d.won).length,
      col: st.col,
    })).filter(s=>s.value>0);
  }

  // ── Email open rate ───────────────────────────────────────────────────────
  if (m==='emailOpenRate') {
    const weeks = getWeekLabels();
    return weeks.map(wk => ({
      name: wk.label,
      value: Math.round(50+Math.random()*35),
      sent: Math.round(10+Math.random()*20),
    }));
  }

  // ── Gather every activity across deals, leads, and contacts ───────────────
  // Shared helper for the activityCount branches below. Branch filter (bFilterR)
  // is already applied via bDealsR / bLeadsR; contacts don't carry a branch so
  // they're included as-is. System types (note / edit / stage) are filtered.
  function collectActivitiesInRange() {
    var acts = [];
    bDealsR.forEach(function(d){
      (d.activities || []).forEach(function(a){
        if (a) acts.push(Object.assign({}, a, { _ownerRep: d.rep }));
      });
    });
    bLeadsR.forEach(function(l){
      (l.activities || []).forEach(function(a){
        if (a) acts.push(Object.assign({}, a, { _ownerRep: l.owner }));
      });
    });
    var ca = getState().contactActivities || {};
    Object.keys(ca).forEach(function(cid){
      (ca[cid] || []).forEach(function(a){
        if (a) acts.push(Object.assign({}, a));
      });
    });
    return acts.filter(function(a){
      return a.date && inRange(a.date) && !isSystemActivityType(a.type);
    });
  }

  // ── Activities by type (pie-friendly) ─────────────────────────────────────
  if (m === 'activityCount' && g === 'actType') {
    var acts = collectActivitiesInRange();
    return getPickableActivityTypes().map(function(t){
      return {
        name: t.label,
        value: acts.filter(function(a){ return a.type === t.id; }).length,
        col: t.col,
        category: t.category,
      };
    }).filter(function(row){ return row.value > 0; })
      .sort(function(a,b){ return b.value - a.value; });
  }

  // ── Activities by owner / rep productivity (bar-friendly) ────────────────
  if (m === 'activityCount' && g === 'owner') {
    var acts2 = collectActivitiesInRange();
    return REPS.map(function(r){
      return {
        name: r.split(' ')[0],
        fullName: r,
        value: acts2.filter(function(a){ return (a.by === r) || (a._ownerRep === r); }).length,
        col: REP_COLS[r] || '#9ca3af',
      };
    }).filter(function(row){ return row.value > 0; })
      .sort(function(a,b){ return b.value - a.value; });
  }

  // ── Activities over time — stacked by category (line/bar) ─────────────────
  if (m === 'activityCount' && g === 'month') {
    var acts3 = collectActivitiesInRange();
    var months = getMonthLabels();
    return months.map(function(mo){
      var monthActs = acts3.filter(function(a){
        return (a.date || '').startsWith(mo.key);
      });
      return {
        name: mo.label,
        Sales:      monthActs.filter(function(a){ var t=getActivityType(a.type); return t && t.category==='sales'; }).length,
        Operations: monthActs.filter(function(a){ var t=getActivityType(a.type); return t && t.category==='operations'; }).length,
        Admin:      monthActs.filter(function(a){ var t=getActivityType(a.type); return t && t.category==='admin'; }).length,
        col_Sales:      '#3b82f6',
        col_Operations: '#f59e0b',
        col_Admin:      '#6b7280',
        total: monthActs.length,
      };
    });
  }

  // ── Activities over time — by week (flat line) ────────────────────────────
  if (m === 'activityCount' && g === 'week') {
    var acts4 = collectActivitiesInRange();
    var weeks = getWeekLabels();
    return weeks.map(function(wk){
      var weekActs = acts4.filter(function(a){
        if (!a.date) return false;
        var d = new Date(a.date + 'T12:00');
        return d >= wk.start && d <= wk.end;
      });
      return {
        name: wk.label,
        value: weekActs.length,
        total: weekActs.length,
      };
    });
  }

  // ── Stalled Deals (idle > 14 days, by rep) ────────────────────────────────
  // "Last activity" = most recent item in deal.activities[] (array is kept
  // newest-first), falling back to deal.created. Only counts open deals.
  if (m==='idleDeals') {
    const today = new Date();
    const daysSince = d => {
      const last = (d.activities||[])[0]?.date || d.created;
      if (!last) return 999;
      return Math.floor((today - new Date(last+'T12:00')) / (1000*60*60*24));
    };
    const openStalled = bDealsR.filter(d => !d.won && !d.lost && daysSince(d) >= 14);
    return REPS.map(r => {
      const rs = openStalled.filter(d => d.rep === r);
      const atRisk = rs.reduce((s,d)=>s+(d.val||0),0);
      const oldest = rs.length ? Math.max(...rs.map(daysSince)) : 0;
      return {
        name: r.split(' ')[0],
        fullName: r,
        value: rs.length,              // bar chart key
        '$ at risk': atRisk,
        'Oldest (days)': oldest,
        '14–30 days': rs.filter(d => { const dd=daysSince(d); return dd>=14 && dd<30; }).length,
        '30+ days':   rs.filter(d => daysSince(d) >= 30).length,
        col: REP_COLS[r] || '#9ca3af',
      };
    }).filter(r => r.value > 0);
  }

  // ── Rep Scorecard (one row per rep) ───────────────────────────────────────
  // Rendered as a table. Every column visible here is a real decision metric
  // a sales manager is looking for in a Monday review.
  if (m==='repScorecard') {
    return REPS.map(r => {
      const all  = bDealsR.filter(d => d.rep === r);
      const won  = all.filter(d => d.won  && inRange(d.wonDate));
      const lost = all.filter(d => d.lost);
      const open = all.filter(d => !d.won && !d.lost);
      const wonV  = won.reduce((s,d)=>s+(d.val||0),0);
      const pipeV = open.reduce((s,d)=>s+(d.val||0),0);
      const closed = won.length + lost.length;
      return {
        name: r,                                // full name in Rep column
        Open: open.length,
        'Pipeline $': pipeV,
        Won: won.length,
        '$ Won': wonV,
        Lost: lost.length,
        'Win %': closed > 0 ? Math.round(won.length/closed*100) : 0,
        'Avg Deal': won.length > 0 ? Math.round(wonV/won.length) : 0,
        // `value` is what bar/line charts read if the user switches chart type
        value: wonV,
        col: REP_COLS[r] || '#9ca3af',
      };
    }).filter(r => r.Open>0 || r.Won>0 || r.Lost>0);
  }

  // ── Lost Deal Reasons ─────────────────────────────────────────────────────
  // Brief 1: read deal.lostReasonId (preferred — id-based, survives renames)
  // and fall back to the legacy deal.lostReason string for historical data
  // captured before the new flow shipped. The label is sourced from
  // getLostReasons() so renamed reasons show their current label.
  if (m==='lostReasons') {
    const REASON_COLS = {
      'Price':'#dc2626','Competitor':'#f59e0b','Timing':'#6366f1',
      'Ghosted':'#64748b','Scope changed':'#0ea5e9','Other':'#9ca3af',
      'Not specified':'#d1d5db',
    };
    const lostDeals = bDealsR.filter(d => d.lost);
    const byReason = {};
    lostDeals.forEach(d => {
      var k = (typeof lostReasonLabelFor === 'function')
        ? lostReasonLabelFor(d)
        : (d.lostReason || 'Not specified');
      byReason[k] = (byReason[k] || 0) + 1;
    });
    return Object.entries(byReason)
      .map(([name, value]) => ({name, value, col: REASON_COLS[name] || '#9ca3af'}))
      .sort((a,b) => b.value - a.value);
  }

  // ── Lost By Competitor (Brief 1 — new bucket) ────────────────────────────
  // Reps want to know which competitors keep beating us. Counts deals where
  // lostReasonId === 'competitor' grouped by lostCompetitor, ignoring deals
  // without a captured competitor name.
  if (m==='lostByCompetitor') {
    const lostDeals = bDealsR.filter(d => d.lost && d.lostReasonId === 'competitor' && d.lostCompetitor);
    const byCompetitor = {};
    lostDeals.forEach(d => {
      const k = d.lostCompetitor || 'Unknown';
      byCompetitor[k] = (byCompetitor[k] || 0) + 1;
    });
    return Object.entries(byCompetitor)
      .map(([name, value]) => ({name, value, col: '#f59e0b'}))
      .sort((a,b) => b.value - a.value);
  }

  // ── Generic fallback ──────────────────────────────────────────────────────
  // Handles any (measure × groupBy) combination the builder can produce.
  // Specialised branches above take priority — this only runs for custom
  // reports that don't match a hand-coded shape.
  return rptGenericCompute(report, {rangeStart, rangeEnd, inRange, bFilterR, REPS, REP_COLS});
}

// ── Generic compute engine for custom reports ─────────────────────────────────
// Bucket records (deals / leads / jobs / activities) by the selected groupBy
// and reduce them according to the selected measure. Used as a fallback so the
// "New Report" builder never silently returns empty data.
function rptGenericCompute(report, ctx) {
  const {rangeStart, rangeEnd, inRange, bFilterR} = ctx;
  const state = getState();
  const m = report.measure;
  const g = report.groupBy;

  // 1. Pick the source record set + which field carries the date we filter on,
  //    and a value function for sum/avg measures.
  let records = [];
  let dateField = null;
  let valueFn = () => 1;

  if (m==='dealValue' || m==='revenue') {
    records = (state.deals||[]).filter(bFilterR).filter(d => d.won);
    dateField = 'wonDate';
    valueFn = d => d.val || 0;
  } else if (m==='dealCount') {
    records = (state.deals||[]).filter(bFilterR);
    dateField = 'created';
  } else if (m==='avgDeal') {
    records = (state.deals||[]).filter(bFilterR).filter(d => d.won);
    dateField = 'wonDate';
    valueFn = d => d.val || 0;
  } else if (m==='leadCount' || m==='conversion') {
    records = (state.leads||[]).filter(bFilterR);
    dateField = 'created';
  } else if (m==='jobCount') {
    records = (state.jobs||[]).filter(bFilterR);
    dateField = 'created';
  } else if (m==='jobValue') {
    records = (state.jobs||[]).filter(bFilterR);
    dateField = 'created';
    valueFn = j => j.val || j.total || 0;
  } else if (m==='activityCount') {
    const flat = [];
    (state.deals||[]).filter(bFilterR).forEach(d => (d.activities||[]).forEach(a => flat.push({...a, _parent:d})));
    (state.leads||[]).filter(bFilterR).forEach(l => (l.activities||[]).forEach(a => flat.push({...a, _parent:l})));
    records = flat;
    dateField = 'date';
  } else {
    return [];
  }

  // 2. Constrain to the date range.
  records = records.filter(r => inRange(r[dateField]));

  // 3. Compute a bucket {key, label, col?} for each record.
  const bucketOf = (r) => {
    const pick = (field) => r[field] || (r._parent && r._parent[field]);
    if (g==='month') {
      const raw = r[dateField]; if (!raw) return null;
      const d = new Date(raw+'T12:00');
      return {
        key: d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),
        label: d.toLocaleDateString('en-AU',{month:'short',year:'2-digit'}),
      };
    }
    if (g==='week') {
      const raw = r[dateField]; if (!raw) return null;
      const d = new Date(raw+'T12:00');
      const dow = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - (dow===0 ? 6 : dow-1));
      return {
        key: start.toISOString().slice(0,10),
        label: start.toLocaleDateString('en-AU',{day:'numeric',month:'short'}),
      };
    }
    if (g==='owner') {
      const v = r.rep || r.owner || (r._parent && (r._parent.rep||r._parent.owner)) || 'Unassigned';
      return {key:v, label:v.split(' ')[0]};
    }
    if (g==='source') {
      const v = pick('source') || 'Unknown';
      return {key:v, label:v};
    }
    if (g==='stage') {
      const sid = pick('sid');
      const pl = (typeof PIPELINES !== 'undefined' && PIPELINES[0]) ? PIPELINES[0] : null;
      const st = pl ? pl.stages.find(s=>s.id===sid) : null;
      return {key: st?st.id:'?', label: st?st.name:'Unknown', col: st?st.col:'#9ca3af'};
    }
    if (g==='jobStatus') {
      const v = pick('status') || 'Unknown';
      return {key:v, label:v};
    }
    if (g==='actType') {
      const v = r.type || 'other';
      return {key:v, label:v};
    }
    if (g==='branch') {
      const v = (pick('branch') || 'Unassigned');
      return {key:v, label:String(v).toUpperCase()};
    }
    if (g==='suburb') {
      const v = pick('suburb') || 'Unknown';
      return {key:v, label:v};
    }
    if (g==='dealStatus') {
      const won = r.won || (r._parent && r._parent.won);
      const lost = r.lost || (r._parent && r._parent.lost);
      const v = won ? 'Won' : (lost ? 'Lost' : 'Open');
      return {key:v, label:v, col: won?'#15803d':(lost?'#dc2626':'#6b7280')};
    }
    // Brief 5 Phase 4: dealType dimension. Source records can be deals
    // (direct r.dealType from saveNewDeal / lead conversion / Phase 3
    // backfill) or activities/leads where the deal is the parent.
    // 'Untyped' fallback covers any rows that pre-date Phase 3 backfill
    // — should be empty in practice since the migration ran on first
    // boot, but defensive against fresh-Supabase or cleared-flag edge
    // cases.
    if (g==='dealType') {
      const v = pick('dealType') || 'untyped';
      const label = v.charAt(0).toUpperCase() + v.slice(1);
      const col = v === 'commercial' ? '#6d28d9' : (v === 'residential' ? '#1d4ed8' : '#9ca3af');
      return {key:v, label:label, col:col};
    }
    return {key:'All', label:'All'};
  };

  // 4. Aggregate.
  const buckets = {};
  records.forEach(r => {
    const b = bucketOf(r);
    if (!b) return;
    if (!buckets[b.key]) buckets[b.key] = {name:b.label, _sum:0, _count:0, _conv:0, col:b.col};
    buckets[b.key]._count += 1;
    buckets[b.key]._sum   += (valueFn(r) || 0);
    if (m==='conversion' && r.converted) buckets[b.key]._conv += 1;
  });

  // 5. Final `value` per measure.
  Object.values(buckets).forEach(b => {
    if (m==='dealCount' || m==='leadCount' || m==='jobCount' || m==='activityCount') {
      b.value = b._count;
    } else if (m==='avgDeal') {
      b.value = b._count > 0 ? Math.round(b._sum / b._count) : 0;
    } else if (m==='conversion') {
      b.value = b._count > 0 ? Math.round(b._conv / b._count * 100) : 0;
    } else {
      b.value = b._sum; // dealValue, revenue, jobValue
    }
    delete b._sum; delete b._count; delete b._conv;
  });

  // 6. Sort — chronological for time buckets, value-descending otherwise.
  if (g==='month' || g==='week') {
    return Object.entries(buckets).sort((a,b) => a[0].localeCompare(b[0])).map(([,v]) => v);
  }
  return Object.values(buckets).sort((a,b) => b.value - a.value);
}


function rptRenderNumber(report) {
  const data = rptComputeData(report);
  const total = data.reduce((s,d)=>s+(d.value||0), 0);
  const prev = data.reduce((s,d)=>s+(d.prev||d.value*0.88||0), 0);
  const pct = prev > 0 ? Math.round((total-prev)/prev*100) : 0;
  const up = pct >= 0;
  const fmt = v => report.measure.includes('Value')||report.measure.includes('revenue')||report.measure.includes('Deal')&&!report.measure.includes('Count') ? '$'+Math.round(v).toLocaleString() : Math.round(v).toLocaleString();
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:280px;text-align:center">
    <div style="font-size:14px;color:#9ca3af;font-weight:500;margin-bottom:8px">${report.name}</div>
    <div style="font-family:Syne,sans-serif;font-weight:800;font-size:52px;color:#1a1a1a;line-height:1">${fmt(total)}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:14px;font-weight:600;color:${up?'#16a34a':'#dc2626'}">
      <span>${up?'▲':'▼'} ${Math.abs(pct)}%</span>
      <span style="color:#9ca3af;font-weight:400">vs previous period</span>
    </div>
  </div>`;
}

// ── Chart renderer using Recharts ─────────────────────────────────────────────
function rptRenderChart(report, data) {
  if (!data) data = rptComputeData(report, rptDateRange);
  const chartType = report.chart || 'bar';
  const chartId = 'chartContainer_'+report.id+'_'+Date.now();
  const REPS = ['James Wilson','Sarah Chen','Emma Brown','Michael Torres','David Kim'];
  const REP_COLS = {'James Wilson':'#c41230','Sarah Chen':'#1e40af','Emma Brown':'#059669','Michael Torres':'#7c3aed','David Kim':'#d97706'};
  const REP_SHORTS = {'James Wilson':'James','Sarah Chen':'Sarah','Emma Brown':'Emma','Michael Torres':'Michael','David Kim':'David'};

  // ── Number / KPI chart ─────────────────────────────────────────────────────
  if (chartType === 'number') {
    const d = data[0];
    if (!d) return `<div style="padding:40px;text-align:center;color:#9ca3af">No data</div>`;
    const val = d.value || 0;
    const prev = d.prev || 0;
    const diff = d.diff !== undefined ? d.diff : (val - prev);
    const pct  = d.pct !== undefined ? d.pct : (prev>0 ? ((diff/prev)*100).toFixed(1) : 0);
    const up = diff >= 0;
    return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;min-height:200px">
      ${prev>0?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:14px;font-weight:600;color:${up?'#15803d':'#b91c1c'}">
        <span style="font-size:18px">${up?'▲':'▼'}</span>
        <span>${up?'+':''}${fmt$(diff)} (${Math.abs(pct)}%)</span>
      </div>`:''}
      <div style="font-size:58px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;line-height:1">${val>999?fmt$(val):val}</div>
      <div style="font-size:15px;color:#6b7280;margin-top:12px;font-weight:500">${d.name}</div>
      ${d.count!==undefined?`<div style="font-size:13px;color:#9ca3af;margin-top:6px">Based on ${d.count} won deals</div>`:''}
      ${prev>0?`<div style="font-size:12px;color:#9ca3af;margin-top:8px">vs ${fmt$(prev)} previous period</div>`:''}
    </div>`;
  }

  // ── Funnel / conversion chart ──────────────────────────────────────────────
  if (chartType === 'funnel') {
    if (!data.length) return `<div style="padding:40px;text-align:center;color:#9ca3af">No data</div>`;
    const maxVal = Math.max(...data.map(d=>d.value), 1);
    const winRate = data[data.length-1]?.won>0 ? Math.round(data[data.length-1].won/data[0].value*100) : 0;
    return `
    <div style="padding:8px 0">
      <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:16px">Win rate is ${winRate}%</div>
      <div style="display:flex;gap:6px;align-items:flex-end;height:220px;padding:0 16px">
        ${data.map((d,i)=>{
          const h = Math.round(d.value/maxVal*180);
          const nextD = data[i+1];
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0;position:relative">
            <span style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:4px">${d.value>999?Math.round(d.value/1000*10)/10+'K':d.value}</span>
            <div style="width:100%;height:${h}px;background:${d.col||'#fde68a'};border-radius:5px 5px 0 0;position:relative">
              ${d.won>0?`<div style="position:absolute;bottom:0;left:0;right:0;height:${Math.round(d.won/d.value*100)}%;background:#22c55e;border-radius:0 0 5px 5px;opacity:.8"></div>`:''}
            </div>
            ${nextD&&d.convRate!==null?`<div style="position:absolute;right:-22px;top:${220-h-20}px;z-index:2;background:#4b5563;color:#fff;border-radius:6px;font-size:10px;font-weight:700;padding:2px 7px;white-space:nowrap">${d.convRate}%</div>`:''}
            <div style="font-size:10px;color:#6b7280;margin-top:5px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${d.name}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-top:14px;padding:0 16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#fde68a;border-radius:2px"></div><span style="font-size:11px;color:#6b7280">Reached stage</span></div>
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#22c55e;border-radius:2px;opacity:.8"></div><span style="font-size:11px;color:#6b7280">Won</span></div>
      </div>
    </div>`;
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  if (chartType === 'table') {
    if (!data.length) return `<div style="padding:40px;text-align:center;color:#9ca3af">No data</div>`;
    const keys = Object.keys(data[0]).filter(k=>k!=='col'&&!k.startsWith('col_'));
    return `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${keys.map(k=>`<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">${k}</th>`).join('')}</tr></thead>
        <tbody>${data.map((row,i)=>`<tr style="${i%2===0?'':'background:#f9fafb'}">
          ${keys.map(k=>`<td style="padding:9px 14px;font-size:13px;border-bottom:1px solid #f0f0f0;color:#374151">${typeof row[k]==='number'&&row[k]>999?fmt$(row[k]):row[k]||'—'}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  // ── Bar / Line / Pie — rendered via Recharts via setTimeout ───────────────
  setTimeout(() => {
    const el = document.getElementById(chartId);
    if (!el || typeof window.Recharts === 'undefined') return;
    try {
      const R = window.Recharts;
      const COLS = ['#c41230','#1e40af','#059669','#7c3aed','#d97706','#0d9488','#64748b'];
      let element;

      // Generalized stack detection — any numeric key in data[0] that isn't
      // one of the known-meta fields is treated as a stack series. Colours
      // prefer the matching `col_<key>` meta field, then REP_COLS for reps,
      // then fall back to the COLS palette.
      const META_KEYS = ['name','value','total','col','prev','pct','diff','count','sent','won','convRate','fullName','category','pipeline'];
      const firstRow = data[0] || {};
      const stackKeys = Object.keys(firstRow).filter(function(k){
        return !META_KEYS.includes(k) && !k.startsWith('col_') && typeof firstRow[k] === 'number';
      });
      const hasStack = stackKeys.length > 0;
      const stackColor = (key, i) => firstRow['col_'+key] || REP_COLS[REPS.find(r=>REP_SHORTS[r]===key)] || COLS[i % COLS.length];

      if (chartType === 'bar') {
        const bars = hasStack
          ? stackKeys.filter(k=>data.some(d=>d[k]>0)).map((k,i)=>
              React.createElement(R.Bar,{key:k,dataKey:k,stackId:'a',fill:stackColor(k,i),name:k,radius:i===0?[0,0,4,4]:[0,0,0,0]}))
          : [React.createElement(R.Bar,{dataKey:'value',fill:'#c41230',radius:[5,5,0,0],name:'Value',
              label:{position:'top',fontSize:11,formatter:v=>v>999?'$'+Math.round(v/1000)+'K':v}})];

        element = React.createElement(R.ResponsiveContainer,{width:'100%',height:300},
          React.createElement(R.BarChart,{data,margin:{top:20,right:20,left:10,bottom:5}},
            React.createElement(R.CartesianGrid,{strokeDasharray:'3 3',stroke:'#f0f0f0',vertical:false}),
            React.createElement(R.XAxis,{dataKey:'name',tick:{fontSize:10},tickLine:false,axisLine:false}),
            React.createElement(R.YAxis,{tick:{fontSize:10},tickFormatter:v=>v>=1000?'$'+Math.round(v/1000)+'K':v,axisLine:false,tickLine:false}),
            React.createElement(R.Tooltip,{formatter:(v)=>[v>999?'$'+v.toLocaleString():v]}),
            hasStack?React.createElement(R.Legend,{iconType:'circle',iconSize:8,wrapperStyle:{fontSize:'11px'}}):null,
            ...bars
          )
        );
      } else if (chartType === 'line') {
        const lines = hasStack
          ? stackKeys.filter(k=>data.some(d=>d[k]>0)).map((k,i)=>
              React.createElement(R.Line,{key:k,type:'monotone',dataKey:k,stroke:stackColor(k,i),strokeWidth:2,dot:{r:3,fill:stackColor(k,i)},activeDot:{r:5},name:k}))
          : [
              React.createElement(R.Line,{key:'v',type:'monotone',dataKey:'value',stroke:'#c41230',strokeWidth:2.5,dot:{r:4,fill:'#c41230'},activeDot:{r:6}}),
              data[0]?.sent?React.createElement(R.Line,{key:'s',type:'monotone',dataKey:'sent',stroke:'#3b82f6',strokeWidth:2,strokeDasharray:'4 4',dot:{r:3}}):null,
            ].filter(Boolean);

        element = React.createElement(R.ResponsiveContainer,{width:'100%',height:300},
          React.createElement(R.LineChart,{data,margin:{top:20,right:20,left:10,bottom:5}},
            React.createElement(R.CartesianGrid,{strokeDasharray:'3 3',stroke:'#f0f0f0',vertical:false}),
            React.createElement(R.XAxis,{dataKey:'name',tick:{fontSize:10},tickLine:false,axisLine:false}),
            React.createElement(R.YAxis,{tick:{fontSize:10},axisLine:false,tickLine:false}),
            React.createElement(R.Tooltip,{}),
            hasStack?React.createElement(R.Legend,{iconType:'circle',iconSize:8,wrapperStyle:{fontSize:'11px'}}):null,
            ...lines
          )
        );
      } else if (chartType === 'pie') {
        element = React.createElement(R.ResponsiveContainer,{width:'100%',height:300},
          React.createElement(R.PieChart,{},
            React.createElement(R.Pie,{data,cx:'50%',cy:'50%',outerRadius:110,dataKey:'value',nameKey:'name',
              label:({name,percent})=>name+' '+Math.round(percent*100)+'%',labelLine:true},
              data.map((d,i)=>React.createElement(R.Cell,{key:i,fill:d.col||COLS[i%COLS.length]}))
            ),
            React.createElement(R.Tooltip,{formatter:(v,n)=>[v, n]})
          )
        );
      }

      if (element) ReactDOM.render(element, el);
    } catch(err) {
      el.innerHTML = `<div style="padding:20px;color:#9ca3af;font-size:13px;text-align:center">Chart unavailable: ${err.message}</div>`;
    }
  }, 60);

  return `<div id="${chartId}" style="width:100%;min-height:300px"></div>`;
}


function rptRenderTable(data, report) {
  const keys = Object.keys(data[0]||{}).filter(k=>k!=='col'&&k!=='prev');
  return `<div style="overflow:hidden">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${keys.map(k=>`<th class="th" style="${k!=='name'?'text-align:right':''}">${k.charAt(0).toUpperCase()+k.slice(1)}</th>`).join('')}</tr></thead>
      <tbody>
        ${data.map((row,i)=>`<tr>
          ${keys.map(k=>`<td class="td" style="${k!=='name'?'text-align:right;font-weight:600':''}">${typeof row[k]==='number'?row[k].toLocaleString():row[k]}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── Report Builder ────────────────────────────────────────────────────────────
function rptOpenBuilder(id) {
  const r = SAVED_REPORTS.find(x=>x.id===id) || {
    id:'new_'+Date.now(), name:'New Report',
    measure:'dealValue', groupBy:'month', chart:'bar',
    dateRange:'thisMonth', filters:[],
  };
  rptBuilderData = {...r, filters:[...r.filters]};
  rptEditing = true;
  renderPage();
}

function rptCloseBuilder() { rptEditing=false; rptBuilderData=null; renderPage(); }

function rptRunReport() {
  if(!rptBuilderData) return;
  const existing = SAVED_REPORTS.find(r=>r.id===rptBuilderData.id);
  if(existing) {
    SAVED_REPORTS = SAVED_REPORTS.map(r=>r.id===rptBuilderData.id ? {...rptBuilderData} : r);
  } else {
    SAVED_REPORTS = [...SAVED_REPORTS, {...rptBuilderData}];
    rptActiveId = rptBuilderData.id;
  }
  rptEditing = false;
  rptBuilderData = null;
  addToast('Report saved','success');
  renderPage();
}

function rptAddFilter() {
  if(!rptBuilderData || !rptNewFilter.field) { addToast('Select a field first','error'); return; }
  rptBuilderData.filters = [...rptBuilderData.filters, {...rptNewFilter, id:'f'+Date.now()}];
  rptNewFilter = {field:'', op:'is', value:''};
  renderPage();
}

function rptRemoveFilter(id) {
  if(rptBuilderData) rptBuilderData.filters = rptBuilderData.filters.filter(f=>f.id!==id);
  renderPage();
}


