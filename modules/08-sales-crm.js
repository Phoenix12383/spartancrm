// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 08-sales-crm.js
// Extracted from original index.html lines 3086-6587
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDashboard(){
  const {deals,leads,emailSent,emailInbox,contacts}=getState();
  const now  = new Date();
  const B    = getState().branch || 'all'; // 'all' | 'VIC' | 'SA' | 'ACT'

  // ── Branch filter ───────────────────────────────────────────────────────────
  const bFilter = x => B==='all' || x.branch===B;

  const bDeals  = deals.filter(bFilter);
  const bLeads  = leads.filter(bFilter);

  // ── Date helpers ────────────────────────────────────────────────────────────
  // This week: Mon–Sun
  const dow    = now.getDay(); // 0=Sun
  const monday = new Date(now); monday.setDate(now.getDate() - (dow===0?6:dow-1)); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  const inWeek = ds => { if(!ds) return false; const d=new Date(ds+'T12:00'); return d>=monday && d<=sunday; };

  const weekLabel = monday.toLocaleDateString('en-AU',{day:'numeric',month:'short'})
                  + ' – '
                  + sunday.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth()+1, 0);
  const monthKey   = now.toLocaleDateString('en-AU',{month:'long',year:'numeric'});
  const inMonth    = ds => { if(!ds) return false; const d=new Date(ds+'T12:00'); return d>=monthStart && d<=monthEnd; };

  // Previous month
  const prevStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
  const inPrevMonth = ds => { if(!ds) return false; const d=new Date(ds+'T12:00'); return d>=prevStart && d<=prevEnd; };

  // ── This WEEK's leads ────────────────────────────────────────────────────────
  const weekLeads      = bLeads.filter(l => inWeek(l.created));
  const weekLeadsNew   = weekLeads.filter(l => l.status==='New').length;
  const weekLeadsQual  = weekLeads.filter(l => l.status==='Qualified').length;
  const weekLeadsConv  = weekLeads.filter(l => l.converted).length;

  // Daily breakdown Mon–Sun
  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weekDayLeads = DAY_NAMES.map((dn, i) => {
    const dayDate = new Date(monday); dayDate.setDate(monday.getDate()+i);
    const dayStr  = dayDate.toISOString().slice(0,10);
    const dayLeads = bLeads.filter(l => l.created && l.created.slice(0,10)===dayStr);
    return {
      day: dn, date: dayStr, total: dayLeads.length,
      new: dayLeads.filter(l=>l.status==='New').length,
      qual: dayLeads.filter(l=>l.status==='Qualified').length,
      conv: dayLeads.filter(l=>l.converted).length,
      isToday: dayStr===now.toISOString().slice(0,10),
    };
  });
  const maxDayLeads = Math.max(...weekDayLeads.map(d=>d.total), 1);

  // ── This month's won deals ───────────────────────────────────────────────────
  const monthWon      = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const monthWonValue = monthWon.reduce((s,d)=>s+d.val, 0);
  const avgDealValue  = monthWon.length>0 ? Math.round(monthWonValue/monthWon.length) : 0;
  const prevWon       = bDeals.filter(d => d.won && inPrevMonth(d.wonDate));
  const prevWonValue  = prevWon.reduce((s,d)=>s+d.val, 0);
  const prevAvgVal    = prevWon.length>0 ? Math.round(prevWonValue/prevWon.length) : 0;

  // ── Closing ratio (month) ────────────────────────────────────────────────────
  const allMonthActive  = bDeals.filter(d => inMonth(d.created)||inMonth(d.wonDate));
  const monthCreatedWon = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const closeRatio      = allMonthActive.length>0 ? Math.round(monthCreatedWon.length/allMonthActive.length*100) : 0;

  // ── Leaderboard (won value this month by rep, filtered by branch) ────────────
  const REP_COLS = {'James Wilson':'#c41230','Sarah Chen':'#1e40af','Emma Brown':'#059669','Michael Torres':'#7c3aed','David Kim':'#d97706'};
  const repMap   = {};
  monthWon.forEach(d => {
    if (!repMap[d.rep]) repMap[d.rep] = {name:d.rep, val:0, count:0};
    repMap[d.rep].val += d.val; repMap[d.rep].count++;
  });
  const leaderboard = Object.values(repMap)
    .map(r => ({...r, col:REP_COLS[r.name]||'#9ca3af', initials:r.name.split(' ').map(w=>w[0]).join('')}))
    .sort((a,b) => b.val-a.val);
  const maxRepVal = Math.max(...leaderboard.map(r=>r.val), 1);

  // ── Pipeline by stage ────────────────────────────────────────────────────────
  const pipeline = bDeals.filter(d=>!d.won&&!d.lost).reduce((s,d)=>s+d.val, 0);
  const stageRows = PIPELINES[0].stages.filter(s=>!s.isLost).map(st=>{
    const sd = bDeals.filter(d=>d.sid===st.id&&!d.won);
    return {...st, count:sd.length, val:sd.reduce((s,d)=>s+d.val,0)};
  }).filter(s=>s.count>0);
  const maxStageVal = Math.max(...stageRows.map(s=>s.val), 1);

  // ── Recent activity ──────────────────────────────────────────────────────────
  const allActs = [];
  bDeals.forEach(d=>(d.activities||[]).forEach(a=>allActs.push({...a,_title:d.title,_id:d.id,_et:'deal'})));
  bLeads.forEach(l=>(l.activities||[]).forEach(a=>allActs.push({...a,_title:l.fn+' '+l.ln,_id:l.id,_et:'lead'})));
  allActs.sort((a,b)=>b.date>a.date?1:-1);
  const recentActs = allActs.slice(0,5);
  const AICON = {note:'📝',call:'📞',email:'✉️',task:'☑️',stage:'🔀',created:'⭐',meeting:'📅',file:'📎',edit:'✏️'};
  const unread = (emailInbox||[]).filter(m=>!m.read).length;

  // ── Branch config ────────────────────────────────────────────────────────────
  const BRANCHES = [
    {id:'all', label:'All Branches', col:'#1a1a1a', bg:'#1a1a1a',   flag:'🇦🇺'},
    {id:'VIC', label:'VIC',          col:'#1d4ed8', bg:'#1d4ed8',   flag:'📍'},
    {id:'SA',  label:'SA',           col:'#059669', bg:'#059669',   flag:'📍'},
    {id:'ACT', label:'ACT',          col:'#7c3aed', bg:'#7c3aed',   flag:'📍'},
  ];
  const activeBranch = BRANCHES.find(b=>b.id===B)||BRANCHES[0];

  const trendBadge = (val, prev, suffix='') => {
    if (!prev) return '';
    const d = val-prev, pct = Math.round(Math.abs(d)/prev*100);
    const up = d>=0;
    return `<span style="font-size:11px;font-weight:600;color:${up?'#15803d':'#b91c1c'}">${up?'▲':'▼'} ${pct}%</span>`;
  };

  return `
  <!-- ══ HEADER ══ -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:26px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">
        ${B==='all'?'All Branches':B+' Branch'} Dashboard
      </h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${monthKey}</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button onclick="setState({page:'leads'})" class="btn-w" style="font-size:12px;gap:5px">${Icon({n:'user',size:13})} Add Lead</button>
      <button onclick="openNewDealModal()" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'plus',size:14})} New Deal</button>
    </div>
  </div>

  <!-- ══ BRANCH SWITCHER ══ -->
  <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">
    ${BRANCHES.map(br => {
      const brDeals   = deals.filter(d=>br.id==='all'||d.branch===br.id);
      const brLeads   = leads.filter(l=>br.id==='all'||l.branch===br.id);
      const brWon     = brDeals.filter(d=>d.won&&inMonth(d.wonDate)).reduce((s,d)=>s+d.val,0);
      const brWeekNew = brLeads.filter(l=>inWeek(l.created)).length;
      const isActive  = B===br.id;
      return `<button onclick="setState({branch:'${br.id}'})"
        style="display:flex;flex-direction:column;align-items:flex-start;padding:10px 16px;border-radius:12px;border:2px solid ${isActive?br.col:'#e5e7eb'};background:${isActive?br.col+'12':'#fff'};cursor:pointer;font-family:inherit;min-width:110px;transition:all .15s;flex:1;max-width:200px"
        onmouseover="this.style.borderColor='${br.col}'" onmouseout="if((getState().branch||'all')!=='${br.id}')this.style.borderColor='#e5e7eb'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:${isActive?br.col:'#1a1a1a'}">${br.label}</span>
          ${isActive?`<span style="width:6px;height:6px;border-radius:50%;background:${br.col};display:inline-block"></span>`:''}
        </div>
        <div style="font-size:11px;color:#9ca3af">${brWeekNew} leads this wk · ${fmt$(brWon)} won</div>
      </button>`;
    }).join('')}
  </div>

  <!-- ══ KPI CARDS ══ -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin-bottom:18px">

    <!-- Leads This Week -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid ${activeBranch.col}"
      onclick="setState({page:'leads'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Leads This Week</span>
        <div style="width:30px;height:30px;border-radius:8px;background:${activeBranch.col}18;color:${activeBranch.col};display:flex;align-items:center;justify-content:center">${Icon({n:'user',size:14})}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${weekLeads.length}</div>
      <div style="font-size:11px;color:#9ca3af;line-height:1.5">
        <span style="color:${activeBranch.col};font-weight:600">${weekLeadsNew} new</span>
        · ${weekLeadsQual} qualified
        · ${weekLeadsConv} converted
      </div>
      <div style="font-size:10px;color:#d1d5db;margin-top:4px">${weekLabel}</div>
    </div>

    <!-- Sales This Month -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #15803d"
      onclick="setState({page:'deals'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Sales This Month</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center">${Icon({n:'check',size:14})}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(monthWonValue)}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#9ca3af">${monthWon.length} deal${monthWon.length!==1?'s':''}</span>
        ${trendBadge(monthWonValue, prevWonValue)}
      </div>
    </div>

    <!-- Average Sale Value -->
    <div class="card" style="padding:18px;border-top:3px solid #b45309">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Avg Sale Value</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center">${Icon({n:'trend',size:14})}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(avgDealValue)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${avgDealValue>0&&prevAvgVal>0
          ? (avgDealValue>=prevAvgVal
            ? `<span style="font-size:11px;color:#15803d;font-weight:600">▲ +${fmt$(avgDealValue-prevAvgVal)}</span>`
            : `<span style="font-size:11px;color:#b91c1c;font-weight:600">▼ ${fmt$(avgDealValue-prevAvgVal)}</span>`)
          : `<span style="font-size:11px;color:#9ca3af">No prev data</span>`}
        ${prevAvgVal>0?`<span style="font-size:11px;color:#9ca3af">prev ${fmt$(prevAvgVal)}</span>`:''}
      </div>
    </div>

    <!-- Closing Ratio -->
    <div class="card" style="padding:18px;border-top:3px solid #1d4ed8">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Close Rate</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center">${Icon({n:'arr',size:14})}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${closeRatio}%</div>
      <div style="font-size:11px;color:#9ca3af">${monthCreatedWon.length} won / ${allMonthActive.length} active this month</div>
    </div>

    ${unread>0&&B==='all'?`<div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #b91c1c"
      onclick="setState({page:'email'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Unread Email</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center">${Icon({n:'email2',size:14})}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#c41230;line-height:1;margin-bottom:6px">${unread}</div>
      <div style="font-size:11px;color:#9ca3af">in your inbox</div>
    </div>`:''}
  </div>

  <!-- ══ MAIN GRID ══ -->
  <div style="display:grid;grid-template-columns:1fr 300px;gap:18px;margin-bottom:18px">

    <!-- Leads This Week — daily bar chart -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <h3 style="font-size:14px;font-weight:700;margin:0 0 2px;font-family:Syne,sans-serif">
            Leads This Week${B!=='all'?' — '+B:''}
          </h3>
          <p style="font-size:11px;color:#9ca3af;margin:0">${weekLabel} · ${weekLeads.length} total</p>
        </div>
        <button onclick="setState({page:'leads'})" class="btn-g" style="font-size:11px">View all →</button>
      </div>

      <!-- Day bars -->
      <div style="display:flex;gap:8px;align-items:flex-end;height:140px;padding-bottom:24px;position:relative">
        ${weekDayLeads.map(d => {
          const barH = maxDayLeads>0 ? Math.max(Math.round(d.total/maxDayLeads*110), d.total>0?10:0) : 0;
          const colBase = activeBranch.col!=='#1a1a1a' ? activeBranch.col : '#c41230';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
            ${d.total>0?`<span style="font-size:11px;font-weight:700;color:#1a1a1a">${d.total}</span>`:'<span style="font-size:11px;color:#d1d5db">0</span>'}
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px">
              ${d.total>0?`<div style="width:100%;border-radius:5px 5px 0 0;overflow:hidden">
                ${d.conv>0 ?`<div style="height:${Math.round(d.conv/d.total*barH)}px;background:#7c3aed;min-height:4px"></div>`:''}
                ${d.qual>0 ?`<div style="height:${Math.round(d.qual/d.total*barH)}px;background:#fde68a;min-height:4px"></div>`:''}
                ${d.new>0  ?`<div style="height:${Math.round(d.new/d.total*barH)}px;background:${colBase};min-height:4px"></div>`:''}
              </div>`:`<div style="width:100%;height:3px;background:#f3f4f6;border-radius:3px"></div>`}
            </div>
            <span style="font-size:10px;font-weight:${d.isToday?700:400};color:${d.isToday?colBase:'#9ca3af'}">${d.day}</span>
            ${d.isToday?`<div style="width:4px;height:4px;border-radius:50%;background:${colBase}"></div>`:``}
          </div>`;
        }).join('')}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${[['New',activeBranch.col!=='#1a1a1a'?activeBranch.col:'#c41230'],['Qualified','#fde68a'],['Converted','#7c3aed']].map(([l,c])=>
          `<div style="display:flex;align-items:center;gap:5px">
            <div style="width:10px;height:10px;border-radius:2px;background:${c}"></div>
            <span style="font-size:11px;color:#6b7280">${l}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- 🏆 Leaderboard -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          🏆 ${now.toLocaleDateString('en-AU',{month:'short'})} Leaders${B!=='all'?' ('+B+')':''}
        </h3>
        <button onclick="setState({page:'reports'})" class="btn-g" style="font-size:11px">Report →</button>
      </div>

      ${leaderboard.length===0
        ? `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">
            <div style="font-size:28px;margin-bottom:8px">🏆</div>
            No won deals this month${B!=='all'?' for '+B:''}
          </div>`
        : leaderboard.map((rep,i)=>`
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="font-size:14px;font-weight:800;color:${i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b45309':'#d1d5db'};width:18px;text-align:center;flex-shrink:0">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
            <div style="width:28px;height:28px;border-radius:50%;background:${rep.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rep.initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${rep.name}</div>
              <div style="font-size:10px;color:#9ca3af">${rep.count} deal${rep.count!==1?'s':''}</div>
            </div>
            <div style="font-size:13px;font-weight:800;font-family:Syne,sans-serif;color:#1a1a1a;flex-shrink:0">${fmt$(rep.val)}</div>
          </div>
          <div style="margin-left:54px;height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(rep.val/maxRepVal*100)}%;background:${rep.col};border-radius:3px"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 2: Sales vs Pipeline + Activity ══ -->
  <div style="display:grid;grid-template-columns:1fr 280px;gap:18px;margin-bottom:18px">

    <!-- Sales vs Pipeline by rep (branch-filtered) -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          Sales vs Pipeline${B!=='all'?' — '+B:''} · ${monthKey}
        </h3>
      </div>
      ${(()=>{
        const repsInBranch = REP_BASES.filter(r=>B==='all'||r.branch===B);
        const maxBar = Math.max(...repsInBranch.map(r=>{
          const w = bDeals.filter(d=>d.rep===r.name&&d.won&&inMonth(d.wonDate)).reduce((s,d)=>s+d.val,0);
          const p = bDeals.filter(d=>d.rep===r.name&&!d.won&&!d.lost).reduce((s,d)=>s+d.val,0);
          return Math.max(w,p);
        }),1);
        return repsInBranch.map(r=>{
          const wonV  = bDeals.filter(d=>d.rep===r.name&&d.won&&inMonth(d.wonDate)).reduce((s,d)=>s+d.val,0);
          const pipeV = bDeals.filter(d=>d.rep===r.name&&!d.won&&!d.lost).reduce((s,d)=>s+d.val,0);
          if(wonV===0&&pipeV===0) return '<div style="font-size:12px;color:#d1d5db;padding:4px 0">'+r.name.split(' ')[0]+': no activity</div>';
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:24px;height:24px;border-radius:50%;background:${r.col};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
                <span style="font-weight:600">${r.name.split(' ')[0]}</span>
                <span style="color:#9ca3af">${wonV>0?fmt$(wonV)+' won':''}${pipeV>0?' · '+fmt$(pipeV)+' pipeline':''}</span>
              </div>
              <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;display:flex">
                ${wonV>0?`<div style="width:${Math.round(wonV/maxBar*100)}%;background:${r.col};border-radius:4px 0 0 4px"></div>`:''}
                ${pipeV>0?`<div style="width:${Math.round(pipeV/maxBar*100)}%;background:${r.col}55;border-radius:${wonV===0?'4px':'0'} 4px 4px ${wonV===0?'4px':'0'}"></div>`:''}
              </div>
            </div>
          </div>`;
        }).join('');
      })()}
      <div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c41230"></div><span style="font-size:11px;color:#6b7280">Won this month</span></div>
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c4123055"></div><span style="font-size:11px;color:#6b7280">Pipeline</span></div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="card" style="padding:18px">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">Recent Activity</h3>
      ${recentActs.length===0?`<div style="color:#9ca3af;font-size:13px;padding:20px 0;text-align:center">No recent activity</div>`:''}
      ${recentActs.map((act,i)=>`
        <div style="display:flex;gap:8px;padding:7px 0;${i<recentActs.length-1?'border-bottom:1px solid #f9fafb':''};cursor:pointer"
          onclick="setState({${act._et==='deal'?`dealDetailId:'${act._id}'`:`leadDetailId:'${act._id}'`},page:'${act._et==='deal'?'deals':'leads'}'})"
          onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
          <div style="width:24px;height:24px;border-radius:50%;background:${act.type==='email'?'#ede9fe':act.type==='call'?'#dbeafe':'#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">${AICON[act.type]||'📌'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${act.subject||act.text?.slice(0,40)||act.type}</div>
            <div style="font-size:10px;color:#9ca3af">${act._title} · ${act.date}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 3: Active pipeline table ══ -->
  <div class="card" style="overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
        Active Pipeline${B!=='all'?' — '+B:' — All Branches'}
      </h3>
      <button onclick="setState({page:'deals'})" class="btn-g" style="font-size:11px">View kanban →</button>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f9fafb">
        <th class="th">Deal</th>
        <th class="th">Contact</th>
        <th class="th">Branch</th>
        <th class="th">Stage</th>
        <th class="th" style="text-align:right">Value</th>
        <th class="th">Owner</th>
        <th class="th"></th>
      </tr></thead>
      <tbody>
        ${bDeals.filter(d=>!d.won&&!d.lost).slice(0,8).map(d=>{
          const c  = contacts.find(x=>x.id===d.cid);
          const pl = PIPELINES.find(p=>p.id===d.pid);
          const st = pl?pl.stages.find(s=>s.id===d.sid):null;
          const bc = {'VIC':'#1d4ed8','SA':'#059669','ACT':'#7c3aed'}[d.branch]||'#9ca3af';
          return `<tr style="cursor:pointer" onclick="setState({dealDetailId:'${d.id}',page:'deals'})"
            onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
            <td class="td">
              <div style="font-size:13px;font-weight:600">${d.title}</div>
              <div style="font-size:11px;color:#9ca3af">${d.suburb||''}</div>
            </td>
            <td class="td" style="font-size:12px;color:#374151">${c?c.fn+' '+c.ln:'—'}</td>
            <td class="td">
              <span style="font-size:11px;font-weight:700;color:${bc};background:${bc}18;padding:2px 8px;border-radius:8px">${d.branch}</span>
            </td>
            <td class="td">${st?`<span class="bdg" style="background:${st.col}22;color:${st.col};border:1px solid ${st.col}44;font-size:11px">${st.name}</span>`:'—'}</td>
            <td class="td" style="font-size:14px;font-weight:700;text-align:right">${fmt$(d.val)}</td>
            <td class="td" style="font-size:12px;color:#6b7280">${d.rep.split(' ')[0]}</td>
            <td class="td" onclick="event.stopPropagation()">
              <button onclick="emailFromDeal('${d.id}')" style="width:24px;height:24px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px" title="Email">✉️</button>
            </td>
          </tr>`;
        }).join('')}
        ${bDeals.filter(d=>!d.won&&!d.lost).length===0?`<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No active deals${B!=='all'?' in '+B:''}</td></tr>`:''}
      </tbody>
    </table>
  </div>`;
}

function renderContacts(){
  const {contacts,panel,contactDetailId}=getState();
  if(contactDetailId) return renderContactDetail() + (getState().editingContactId ? renderEditContactDrawer() : '');
  const filt=contacts.filter(c=>{
    const q=cSearch.toLowerCase();
    const matchQ=!q||(c.fn+' '+c.ln).toLowerCase().includes(q)||c.email.toLowerCase().includes(q)||c.phone.includes(q);
    const matchB=cBranch==='all'||c.branch===cBranch;
    const matchT=cType==='all'||c.type===cType;
    return matchQ&&matchB&&matchT;
  });
  const srcColor={Referral:'green','Web Form':'blue','Phone Call':'purple',Facebook:'indigo','Walk-in':'amber','Repeat Customer':'teal'};
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div><h1 style="font-size:24px;font-weight:800;margin:0 0 2px">Contacts</h1><p style="color:#6b7280;font-size:14px;margin:0">${contacts.length} contacts</p></div>
      <button class="btn-r" onclick="openNewContactModal()">
        ${Icon({n:'plus',size:15})} New Contact
      </button>
    </div>
    <div class="card" style="padding:12px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="position:relative;flex:1;min-width:200px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({n:'search',size:13})}</span>
        <input id="contactSearchInput" class="inp" value="${cSearch}" placeholder="Search name, email, phone…" style="padding-left:32px;font-size:12px;padding-top:7px;padding-bottom:7px" oninput="cSearch=this.value;renderPage()">
      </div>
      <select class="sel" style="width:150px;font-size:12px" onchange="cBranch=this.value;renderPage()">
        <option value="all" ${cBranch==='all'?'selected':''}>All Branches</option>
        ${['VIC','ACT','SA'].map(b=>`<option ${cBranch===b?'selected':''}>${b}</option>`).join('')}
      </select>
      <select class="sel" style="width:150px;font-size:12px" onchange="cType=this.value;renderPage()">
        <option value="all" ${cType==='all'?'selected':''}>All Types</option>
        <option value="residential" ${cType==='residential'?'selected':''}>Residential</option>
        <option value="commercial" ${cType==='commercial'?'selected':''}>Commercial</option>
      </select>
      <span style="font-size:12px;color:#9ca3af;align-self:center">${filt.length} results</span>
    </div>
    <div class="card" style="overflow:hidden">
      ${filt.length===0?`<div style="padding:48px;text-align:center;color:#9ca3af">${Icon({n:'contacts',size:40,style:'opacity:.3;display:block;margin:0 auto 12px'})}<div style="font-size:14px">No contacts found</div></div>`:`
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="th">Name</th>
          <th class="th">Contact</th>
          <th class="th">Type</th>
          <th class="th">Source</th>
          <th class="th">Branch</th>
          <th class="th">Tags</th>
        </tr></thead>
        <tbody>
          ${filt.map(c=>`
            <tr style="cursor:pointer" onclick="setState({contactDetailId:'${c.id}',page:'contacts'})" style="cursor:pointer">
              <td class="td">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;background:#c41230;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn+' '+c.ln)}</div>
                  <div><div style="font-size:13px;font-weight:600">${c.fn} ${c.ln}</div>${c.co?`<div style="font-size:11px;color:#9ca3af">${c.co}</div>`:''}</div>
                </div>
              </td>
              <td class="td"><div style="font-size:12px">${c.email}</div><div style="font-size:11px;color:#9ca3af">${c.phone}</div></td>
              <td class="td">${Badge(c.type,c.type==='commercial'?'purple':'blue')}</td>
              <td class="td">${Badge(c.source,srcColor[c.source]||'gray')}</td>
              <td class="td"><span style="font-size:12px;color:#6b7280">${c.branch}</span></td>
              <td class="td">${c.tags.map(t=>`<span class="tag">${t}</span>`).join(' ')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>
    ${panel&&panel.type==='contact'?renderContactPanel(panel.data):''}
    ${getState().modal&&getState().modal.type==='newContact'?renderNewContactModal():''}
    ${getState().editingContactId?renderEditContactDrawer():''}`;
}

function openContactPanel(cid){
  const c=getState().contacts.find(x=>x.id===cid);
  if(c)setState({panel:{type:'contact',data:c}});
}
function openNewContactModal(){setState({modal:{type:'newContact',data:{fn:'',ln:'',email:'',phone:'',suburb:'',type:'residential',source:'Web Form',branch:'VIC'}}});}

let cSearch='',cBranch='all',cType='all';

function renderContactPanel(c){
  return `<div class="ovl" onclick="if(event.target===this)setState({panel:null})">
    <div class="panel" style="width:480px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <div style="width:40px;height:40px;background:#c41230;border-radius:50%;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn+' '+c.ln)}</div>
            <div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px">${c.fn} ${c.ln}</div>${c.co?`<div style="font-size:12px;color:#6b7280">${c.co}</div>`:''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${Badge(c.type,c.type==='commercial'?'purple':'blue')} ${Badge(c.branch,'gray')} ${c.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
        </div>
        <button onclick="setState({panel:null})" style="background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;color:#9ca3af" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          ${[['Email',c.email],['Phone',c.phone],['Suburb',c.suburb],['State',c.state],['Source',c.source],['Rep',c.rep],['Branch',c.branch]].map(([l,v])=>`
            <div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">${l}</div><div style="font-size:13px;font-weight:500">${v||'—'}</div></div>`).join('')}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:12px">Deals</div>
          ${getState().deals.filter(d=>d.cid===c.id).map(d=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f9fafb;border-radius:10px;margin-bottom:8px">
              <div><div style="font-size:13px;font-weight:500">${d.title}</div><div style="font-size:11px;color:#9ca3af">${d.suburb}</div></div>
              <span style="font-size:14px;font-weight:700">${fmt$(d.val)}</span>
            </div>`).join('') || '<div style="font-size:13px;color:#9ca3af">No deals yet</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function renderNewContactModal(){
  const d=getState().modal.data;
  return `<div class="modal-bg" onclick="if(event.target===this)setState({modal:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Contact</h3>
        <button onclick="setState({modal:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label>
            <input class="inp" id="nc_fn" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label>
            <input class="inp" id="nc_ln" placeholder="Smith"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="nc_email" placeholder="jane@email.com"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label>
            <input class="inp" id="nc_phone" placeholder="0412 345 678"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Company</label>
            <input class="inp" id="nc_co" placeholder="Superb Developments"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="nc_street" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="nc_suburb" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="nc_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="nc_postcode" placeholder="3121"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select class="sel" id="nc_type"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="nc_source">${['Web Form','Phone Call','Referral','Facebook','Walk-in','Repeat Customer'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="nc_branch">${['VIC','ACT','SA'].map(b=>`<option>${b}</option>`).join('')}</select></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({modal:null})">Cancel</button>
        <button class="btn-r" onclick="saveNewContact()">Create Contact</button>
      </div>
    </div>
  </div>`;
}

// ── Edit Contact drawer ───────────────────────────────────────────────────
// Same pattern as Edit Lead: owner/admin only, single audit activity per save
// with a structured diff. Contact "owner" = contact.rep.

function openContactEditDrawer(contactId) {
  var c = getState().contacts.find(function(x){ return x.id === contactId; });
  if (!c) return;
  if (!canEditContact(c)) { addToast('Only the rep or an admin can edit this contact', 'error'); return; }
  setState({ editingContactId: contactId });
}

function renderEditContactDrawer() {
  var id = getState().editingContactId;
  var c = getState().contacts.find(function(x){ return x.id === id; });
  if (!c) return '';
  var esc = function(v){ return (v == null ? '' : String(v)).replace(/"/g,'&quot;'); };
  var escText = function(v){ return (v == null ? '' : String(v)).replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  return `<div class="modal-bg" onclick="if(event.target===this)setState({editingContactId:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Edit Contact</h3>
        <button onclick="setState({editingContactId:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label>
            <input class="inp" id="ce_fn" value="${esc(c.fn)}" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label>
            <input class="inp" id="ce_ln" value="${esc(c.ln)}" placeholder="Smith"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="ce_email" value="${esc(c.email)}" placeholder="jane@email.com">
          <div id="ce_email_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label>
            <input class="inp" id="ce_phone" value="${esc(c.phone)}" placeholder="0412 345 678">
            <div id="ce_phone_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
          </div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Company</label>
            <input class="inp" id="ce_co" value="${esc(c.co)}" placeholder="Superb Developments"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="ce_street" value="${esc(c.street)}" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="ce_suburb" value="${esc(c.suburb)}" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="ce_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(function(s){return '<option'+(c.state===s?' selected':'')+'>'+s+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="ce_postcode" value="${esc(c.postcode)}" placeholder="3121"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select class="sel" id="ce_type"><option value="residential"${c.type==='residential'?' selected':''}>Residential</option><option value="commercial"${c.type==='commercial'?' selected':''}>Commercial</option></select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="ce_source">${['Web Form','Phone Call','Referral','Facebook','Walk-in','Repeat Customer'].map(function(s){return '<option'+(c.source===s?' selected':'')+'>'+s+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="ce_branch">${['VIC','ACT','SA'].map(function(b){return '<option'+(c.branch===b?' selected':'')+'>'+b+'</option>';}).join('')}</select></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({editingContactId:null})">Cancel</button>
        <button class="btn-r" onclick="saveContactEdit()">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function saveContactEdit() {
  var id = getState().editingContactId;
  var c = getState().contacts.find(function(x){ return x.id === id; });
  if (!c) return;
  if (!canEditContact(c)) { addToast('Only the rep or an admin can edit this contact', 'error'); return; }

  var fn = (document.getElementById('ce_fn').value || '').trim();
  var ln = (document.getElementById('ce_ln').value || '').trim();
  if (!fn || !ln) { addToast('First and last name are required', 'error'); return; }

  var emailV = validateEmail(document.getElementById('ce_email').value);
  var phoneV = validateAuPhone(document.getElementById('ce_phone').value);
  var emailErr = document.getElementById('ce_email_err');
  var phoneErr = document.getElementById('ce_phone_err');
  emailErr.style.display = emailV.ok ? 'none' : 'block';
  emailErr.textContent = emailV.error;
  phoneErr.style.display = phoneV.ok ? 'none' : 'block';
  phoneErr.textContent = phoneV.error;
  if (!emailV.ok || !phoneV.ok) { addToast('Please fix the highlighted fields', 'error'); return; }

  var next = {
    fn: fn, ln: ln,
    email: emailV.normalized,
    phone: phoneV.normalized,
    co: (document.getElementById('ce_co').value || '').trim(),
    street: (document.getElementById('ce_street').value || '').trim(),
    suburb: (document.getElementById('ce_suburb').value || '').trim(),
    state: document.getElementById('ce_state').value,
    postcode: (document.getElementById('ce_postcode').value || '').trim(),
    type: document.getElementById('ce_type').value,
    source: document.getElementById('ce_source').value,
    branch: document.getElementById('ce_branch').value,
  };

  var FIELD_LABELS = { fn:'First name', ln:'Last name', email:'Email', phone:'Phone',
    co:'Company', street:'Street', suburb:'Suburb', state:'State', postcode:'Postcode',
    type:'Type', source:'Source', branch:'Branch' };
  var changes = [];
  Object.keys(next).forEach(function(k) {
    var oldStr = (c[k] == null ? '' : String(c[k]));
    var newStr = (next[k] == null ? '' : String(next[k]));
    if (oldStr !== newStr) changes.push({ field: k, label: FIELD_LABELS[k] || k, from: oldStr, to: newStr });
  });

  if (changes.length === 0) { addToast('No changes to save', 'info'); setState({ editingContactId: null }); return; }

  var user = getCurrentUser() || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' edited ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
    text: changes.map(function(x){ return x.label + ': "' + x.from + '" → "' + x.to + '"'; }).join('\n'),
    by: user.name,
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    done: false,
    changes: changes,
  };

  // Contacts store their activities in the top-level `contactActivities` map.
  var ca = Object.assign({}, getState().contactActivities || {});
  ca[id] = [actObj].concat(ca[id] || []);
  var updated = Object.assign({}, c, next);
  setState({
    contacts: getState().contacts.map(function(x){ return x.id === id ? updated : x; }),
    contactActivities: ca,
    editingContactId: null,
  });
  try { dbInsert('activities', actToDb(actObj, 'contact', id)); } catch(e) {}

  addToast('Saved — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' updated', 'success');
}

// ── Edit Deal drawer ────────────────────────────────────────────────────────
// Same owner/admin gate + single-audit-activity-per-save pattern as the
// Lead + Contact edit drawers. Doesn't touch quotes, pipeline/stage, or
// won/lost state — those have their own dedicated flows.

function openDealEditDrawer(dealId) {
  var d = getState().deals.find(function(x){ return x.id === dealId; });
  if (!d) return;
  if (!canEditDeal(d)) { addToast('Only the deal owner or an admin can edit this deal', 'error'); return; }
  setState({ editingDealId: dealId });
}

function renderEditDealDrawer() {
  var id = getState().editingDealId;
  var d = getState().deals.find(function(x){ return x.id === id; });
  if (!d) return '';
  var esc = function(v){ return (v == null ? '' : String(v)).replace(/"/g,'&quot;'); };
  var escText = function(v){ return (v == null ? '' : String(v)).replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  return `<div class="ovl" onclick="if(event.target===this)setState({editingDealId:null})">
    <div class="panel" style="width:440px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h2 style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;margin:0">Edit Deal</h2>
        <button onclick="setState({editingDealId:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:13px">
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Title *</label>
          <input class="inp" id="de_title" value="${esc(d.title)}" placeholder="Smith — Richmond"></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Value ($)</label>
          <input class="inp" id="de_val" type="number" min="0" step="any" value="${d.val||0}" placeholder="15000">
          <div id="de_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Owner</label>
            <select class="sel" id="de_rep">${getUsers().filter(function(u){return u.active&&u.role!=='viewer';}).map(function(o){return '<option'+(d.rep===o.name?' selected':'')+'>'+o.name+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="de_branch">${['VIC','ACT','SA'].map(function(b){return '<option'+(d.branch===b?' selected':'')+'>'+b+'</option>';}).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address <span style="font-size:10px;color:#9ca3af;font-weight:400">(type to search)</span></label>
          <input class="inp" id="de_street" value="${esc(d.street)}" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="de_suburb" value="${esc(d.suburb)}" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="de_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(function(s){return '<option'+(d.state===s?' selected':'')+'>'+s+'</option>';}).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="de_postcode" value="${esc(d.postcode)}" placeholder="3121"></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Expected close date</label>
          <input class="inp" id="de_closeDate" type="date" value="${esc(d.closeDate||'')}"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">
        <button class="btn-w" onclick="setState({editingDealId:null})">Cancel</button>
        <button class="btn-r" onclick="saveDealEdit()">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function saveDealEdit() {
  var id = getState().editingDealId;
  var d = getState().deals.find(function(x){ return x.id === id; });
  if (!d) return;
  if (!canEditDeal(d)) { addToast('Only the deal owner or an admin can edit this deal', 'error'); return; }

  var title = (document.getElementById('de_title').value || '').trim();
  if (!title) { addToast('Deal title is required', 'error'); return; }
  var street = (document.getElementById('de_street').value || '').trim();
  var suburb = (document.getElementById('de_suburb').value || '').trim();
  if (!street || !suburb) {
    addToast('Street and suburb are required so the deal can be scheduled on the map', 'error');
    return;
  }

  var valEl = document.getElementById('de_val');
  var valErr = document.getElementById('de_val_err');
  var valV = validateDealValue(valEl.value);
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }

  var next = {
    title: title,
    val: valV.normalized,
    rep: document.getElementById('de_rep').value,
    branch: document.getElementById('de_branch').value,
    street: street,
    suburb: suburb,
    state: document.getElementById('de_state').value,
    postcode: (document.getElementById('de_postcode').value || '').trim(),
    closeDate: (document.getElementById('de_closeDate').value || '').trim(),
  };

  var FIELD_LABELS = { title:'Title', val:'Value', rep:'Owner', branch:'Branch',
    street:'Street', suburb:'Suburb', state:'State', postcode:'Postcode', closeDate:'Close date' };
  var changes = [];
  Object.keys(next).forEach(function(k) {
    var oldStr = (d[k] == null ? '' : String(d[k]));
    var newStr = (next[k] == null ? '' : String(next[k]));
    if (oldStr !== newStr) changes.push({ field: k, label: FIELD_LABELS[k] || k, from: oldStr, to: newStr });
  });

  if (changes.length === 0) { addToast('No changes to save', 'info'); setState({ editingDealId: null }); return; }

  var user = getCurrentUser() || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' edited ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
    text: changes.map(function(x){ return x.label + ': "' + x.from + '" → "' + x.to + '"'; }).join('\n'),
    by: user.name,
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    done: false,
    changes: changes,
  };

  var updated = Object.assign({}, d, next);
  updated.activities = [actObj].concat(d.activities || []);
  setState({
    deals: getState().deals.map(function(x){ return x.id === id ? updated : x; }),
    editingDealId: null,
  });
  try { dbInsert('activities', actToDb(actObj, 'deal', id)); } catch(e) {}

  addToast('Saved — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' updated', 'success');
}

function saveNewContact(){
  const fn=document.getElementById('nc_fn').value.trim();
  const ln=document.getElementById('nc_ln').value.trim();
  if(!fn||!ln){addToast('First and last name are required','error');return;}
  const nc={id:'c'+Date.now(),fn,ln,co:document.getElementById('nc_co').value.trim(),email:document.getElementById('nc_email').value,phone:document.getElementById('nc_phone').value,street:document.getElementById('nc_street').value.trim(),suburb:document.getElementById('nc_suburb').value.trim(),state:document.getElementById('nc_state').value,postcode:document.getElementById('nc_postcode').value.trim(),type:document.getElementById('nc_type').value,source:document.getElementById('nc_source').value,branch:document.getElementById('nc_branch').value,rep:(getCurrentUser()||{name:'Admin'}).name,tags:['new']};
  setState({contacts:[nc,...getState().contacts],modal:null});
  dbInsert('contacts', contactToDb(nc));
  addToast(`${fn} ${ln} created`,'success');
}

// ── DEALS ─────────────────────────────────────────────────────────────────────
let dPipeline='p1',dragDeal=null,dragOverStage=null;
let kanbanEditModal=null;

// ── DEAL KANBAN FILTER STATE ──────────────────────────────────────────────────
let kFilterOwners=[], kFilterStages=[], kFilterSource=[], kFilterValMin='', kFilterValMax='', kFilterOpen=false;


// ── Kanban edit functions ─────────────────────────────────────────────────────
function openStageEdit(stageId) {
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  const st=pl?pl.stages.find(s=>s.id===stageId):null;
  if(!st)return;
  kanbanEditModal={type:'stage',data:{...st,pid:dPipeline}};
  renderPage();
}
function openNewStageModal(){
  kanbanEditModal={type:'newStage',data:{name:'',prob:50,col:'#94a3b8',pid:dPipeline}};
  renderPage();
}
function openDealEdit(dealId){
  const d=getState().deals.find(x=>x.id===dealId);
  if(!d)return;
  kanbanEditModal={type:'deal',data:{...d}};
  renderPage();
}
function closeKanbanModal(){kanbanEditModal=null;renderPage();}

function saveStageEdit(){
  const d=kanbanEditModal.data;
  const name=document.getElementById('ke_name')?.value.trim();
  const prob=parseInt(document.getElementById('ke_prob')?.value||'50');
  const col=document.getElementById('ke_col')?.value||'#94a3b8';
  if(!name){addToast('Stage name required','error');return;}
  PIPELINES.forEach(pl=>{
    if(pl.id!==d.pid)return;
    pl.stages=pl.stages.map(s=>s.id===d.id?{...s,name,prob,col}:s);
  });
  kanbanEditModal=null;
  addToast('Stage updated','success');
  renderPage();
}
function saveNewStage(){
  const name=document.getElementById('ke_name')?.value.trim();
  const prob=parseInt(document.getElementById('ke_prob')?.value||'50');
  const col=document.getElementById('ke_col')?.value||'#94a3b8';
  if(!name){addToast('Stage name required','error');return;}
  const newId='s'+Date.now();
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  if(!pl)return;
  const mid=pl.stages.filter(s=>!s.isWon&&!s.isLost);
  const won=pl.stages.filter(s=>s.isWon);
  const lost=pl.stages.filter(s=>s.isLost);
  mid.push({id:newId,name,prob,col,ord:mid.length+1});
  pl.stages=[...mid.map((s,i)=>({...s,ord:i+1})),...won,...lost];
  kanbanEditModal=null;
  addToast('"'+name+'" stage added','success');
  renderPage();
}
function deleteStage(stageId){
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  if(!pl)return;
  const count=getState().deals.filter(d=>d.sid===stageId).length;
  if(count>0){addToast('Move '+count+' deal(s) out first','error');return;}
  pl.stages=pl.stages.filter(s=>s.id!==stageId);
  kanbanEditModal=null;
  addToast('Stage deleted','warning');
  renderPage();
}
function moveStage(stageId,dir){
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  if(!pl)return;
  const mid=pl.stages.filter(s=>!s.isWon&&!s.isLost);
  const idx=mid.findIndex(s=>s.id===stageId);
  if(idx<0)return;
  const ni=idx+dir;
  if(ni<0||ni>=mid.length)return;
  [mid[idx],mid[ni]]=[mid[ni],mid[idx]];
  pl.stages=[...mid.map((s,i)=>({...s,ord:i+1})),...pl.stages.filter(s=>s.isWon),...pl.stages.filter(s=>s.isLost)];
  renderPage();
}
function saveDealEdit(){
  // NOTE: this is the kanban quick-edit variant. A second saveDealEdit for the
  // full Edit Deal drawer lives ~line 771 — keep the two in sync or consolidate.
  const d=kanbanEditModal.data;
  const title=document.getElementById('de_title')?.value.trim();
  const valEl=document.getElementById('de_val');
  const valErr=document.getElementById('de_val_err');
  const valV=validateDealValue(valEl?valEl.value:'');
  if(valErr){valErr.style.display=valV.ok?'none':'block';valErr.textContent=valV.error;}
  if(!valV.ok){addToast(valV.error,'error');return;}
  const val=valV.normalized;
  const sid=document.getElementById('de_stage')?.value;
  const rep=document.getElementById('de_rep')?.value;
  const street=document.getElementById('de_street')?.value.trim()||'';
  const suburb=document.getElementById('de_suburb')?.value.trim();
  const state=document.getElementById('de_state')?.value||'';
  const postcode=document.getElementById('de_postcode')?.value.trim()||'';
  const closeDate=document.getElementById('de_close')?.value;
  if(!title){addToast('Title required','error');return;}
  setState({deals:getState().deals.map(deal=>
    deal.id===d.id?{...deal,title,val:val,sid:sid||deal.sid,
      rep:rep||deal.rep,street:street,suburb:suburb||deal.suburb,state:state||deal.state,postcode:postcode,closeDate:closeDate||deal.closeDate}:deal
  )});
  dbUpdate('deals', d.id, {title:title, val:val, sid:sid||d.sid, rep:rep||d.rep, street:street, suburb:suburb||d.suburb, postcode:postcode, close_date:closeDate||d.closeDate||null});
  kanbanEditModal=null;
  addToast('Deal updated','success');
  renderPage();
}

// ── Kanban modal renderer ─────────────────────────────────────────────────────
function renderKanbanModal(){
  if(!kanbanEditModal)return'';
  const {type,data}=kanbanEditModal;
  const COLS=['#94a3b8','#60a5fa','#818cf8','#a78bfa','#f472b6',
              '#fb923c','#facc15','#4ade80','#34d399','#22d3ee',
              '#c41230','#ef4444','#f59e0b','#22c55e'];

  if(type==='stage'||type==='newStage'){
    const isNew=type==='newStage';
    return `<div class="modal-bg" onclick="if(event.target===this)closeKanbanModal()">
      <div class="modal" style="max-width:400px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">${isNew?'Add Stage':'Edit Stage'}</h3>
          <button onclick="closeKanbanModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
        </div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Stage Name *</label>
            <input id="ke_name" class="inp" value="${isNew?'':data.name}" placeholder="e.g. Site Survey" style="font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">
              Win Probability: <span id="ke_prob_label">${data.prob}%</span>
            </label>
            <input type="range" id="ke_prob" min="0" max="100" value="${data.prob}"
              oninput="document.getElementById('ke_prob_label').textContent=this.value+'%'"
              style="width:100%;accent-color:#c41230">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:8px">Colour</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              ${COLS.map(c=>`<button onclick="document.getElementById('ke_col').value='${c}';this.parentElement.querySelectorAll('button').forEach(b=>b.style.outline='none');this.style.outline='3px solid #1a1a1a'"
                style="width:28px;height:28px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:${data.col===c?'3px solid #1a1a1a':'none'};outline-offset:2px"></button>`).join('')}
              <input type="color" id="ke_col" value="${data.col}" style="width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none">
            </div>
          </div>
          ${!isNew?`
          <div style="display:flex;gap:8px">
            <button onclick="moveStage('${data.id}',-1)" class="btn-w" style="font-size:12px;flex:1">↑ Earlier</button>
            <button onclick="moveStage('${data.id}',1)"  class="btn-w" style="font-size:12px;flex:1">↓ Later</button>
          </div>
          <div style="border-top:1px dashed #fee2e2;padding-top:12px">
            <button onclick="deleteStage('${data.id}')" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete stage…</button>
          </div>`:''}
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:8px">
          <button onclick="closeKanbanModal()" class="btn-w">Cancel</button>
          <button onclick="${isNew?'saveNewStage()':'saveStageEdit()'}'" class="btn-r">${isNew?'Add':'Save'}</button>
        </div>
      </div>
    </div>`;
  }

  if(type==='deal'){
    const pl=PIPELINES.find(p=>p.id===dPipeline);
    const allStages=pl?pl.stages.filter(s=>!s.isLost):[];
    const c=getState().contacts.find(x=>x.id===data.cid);
    const REPS=['James Wilson','Sarah Chen','Emma Brown','Michael Torres','David Kim'];
    return `<div class="modal-bg" onclick="if(event.target===this)closeKanbanModal()">
      <div class="modal" style="max-width:460px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Edit Deal</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="setState({dealDetailId:'${data.id}'});closeKanbanModal()" class="btn-w" style="font-size:12px">Full view →</button>
            <button onclick="closeKanbanModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">×</button>
          </div>
        </div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Title *</label>
            <input id="de_title" class="inp" value="${data.title}" style="font-size:14px;font-weight:500">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Value ($)</label>
              <input id="de_val" type="number" min="0" step="any" class="inp" value="${data.val}">
              <div id="de_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Stage</label>
              <select id="de_stage" class="sel">
                ${allStages.map(s=>`<option value="${s.id}" ${data.sid===s.id?'selected':''}>${s.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Owner</label>
              <select id="de_rep" class="sel">
                ${REPS.map(r=>`<option value="${r}" ${data.rep===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Close Date</label>
              <input id="de_close" type="date" class="inp" value="${data.closeDate||''}">
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Street Address</label>
            <input id="de_street" class="inp" value="${data.street||''}" placeholder="Start typing address…" autocomplete="off">
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Suburb</label>
              <input id="de_suburb" class="inp" value="${data.suburb||''}" placeholder="e.g. Richmond">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">State</label>
              <select id="de_state" class="sel">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(s=>`<option ${data.state===s?'selected':''}>${s}</option>`).join('')}</select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Postcode</label>
              <input id="de_postcode" class="inp" value="${data.postcode||''}" placeholder="3121">
            </div>
          </div>
          ${c?`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
            <div style="width:30px;height:30px;background:#c41230;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn+' '+c.ln)}</div>
            <div><div style="font-size:13px;font-weight:600">${c.fn} ${c.ln}</div><div style="font-size:11px;color:#6b7280">${c.email||''}</div></div>
            <button onclick="event.stopPropagation();emailFromDeal('${data.id}')" style="margin-left:auto;padding:5px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit">✉️ Email</button>
          </div>`:''}
          <div style="display:flex;gap:8px;padding-top:6px;border-top:1px solid #f0f0f0">
            <button onclick="markDealWon('${data.id}');closeKanbanModal()" style="flex:1;padding:9px;border:1px solid #86efac;background:#f0fdf4;color:#15803d;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✓ Won</button>
            <button onclick="markDealLost('${data.id}');closeKanbanModal()" style="flex:1;padding:9px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✗ Lost</button>
          </div>
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:space-between">
          <button onclick="if(confirm('Delete this deal?')){dbDelete('deals','${data.id}');setState({deals:getState().deals.filter(d=>d.id!=='${data.id}')});closeKanbanModal();addToast('Deal deleted','warning')}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete</button>
          <div style="display:flex;gap:8px">
            <button onclick="closeKanbanModal()" class="btn-w">Cancel</button>
            <button onclick="saveDealEdit()" class="btn-r">Save</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  return '';
}



// ── Drag-drop DOM helpers (NO renderPage — manipulate DOM directly) ──────────
function highlightCol(stageId) {
  // Only update if this is a new column
  if (dragOverStage === stageId) return;
  if (dragOverStage) unhighlightCol(dragOverStage);
  dragOverStage = stageId;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#eff6ff';
    el.style.borderColor = '#3b82f6';
    el.style.borderStyle = 'dashed';
  }
}
function unhighlightCol(stageId) {
  dragOverStage = null;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#f8f9fa';
    el.style.borderColor = 'transparent';
    el.style.borderStyle = 'solid';
  }
}
function unhighlightAllCols() {
  dragOverStage = null;
  try {
    document.querySelectorAll('[id^="col_"]').forEach(el => {
      if (el && el.style) {
        el.style.background = '#f8f9fa';
        el.style.borderColor = 'transparent';
        el.style.borderStyle = 'solid';
      }
    });
  } catch(e) {}
}


function renderDeals(){
  const {deals,contacts,modal,dealDetailId}=getState();
  if(dealDetailId) return renderDealDetail() + (getState().editingDealId ? renderEditDealDrawer() : '');

  const pl=PIPELINES.find(p=>p.id===dPipeline);
  // Include the lost stage as a visible "Not Proceeding" column. It lives at
  // ord:6 so it naturally sits at the right next to Won.
  const stages=pl.stages.sort((a,b)=>a.ord-b.ord);
  const pDeals=deals.filter(d=>d.pid===dPipeline);
  // Pipeline value and the "X open" headline must exclude both Won and Not
  // Proceeding — otherwise Not Proceeding deals inflate the numbers.
  const totalVal=pDeals.filter(d=>!d.won&&!d.lost).reduce((s,d)=>s+d.val,0);
  const byStage={};
  stages.forEach(s=>byStage[s.id]=[]);
  pDeals.forEach(d=>{if(byStage[d.sid])byStage[d.sid].push(d);});

  const allOwners=[...new Set(deals.map(d=>d.rep))];
  const allSources=[...new Set(getState().contacts.map(c=>c.source))].filter(Boolean);
  const activeFilters=kFilterOwners.length+kFilterStages.length+kFilterSource.length+(kFilterValMin?1:0)+(kFilterValMax?1:0);
  const matchesFilter=d=>{
    if(kFilterOwners.length>0&&!kFilterOwners.includes(d.rep))return false;
    if(kFilterStages.length>0&&!kFilterStages.includes(d.sid))return false;
    if(kFilterValMin!==''&&d.val<parseFloat(kFilterValMin))return false;
    if(kFilterValMax!==''&&d.val>parseFloat(kFilterValMax))return false;
    if(kFilterSource.length>0){const c=getState().contacts.find(x=>x.id===d.cid);if(!c||!kFilterSource.includes(c.source))return false;}
    return true;
  };

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">Deals</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${pDeals.filter(d=>!d.won&&!d.lost).length} open · ${fmt$(totalVal)} pipeline</p>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;background:#f3f4f6;border-radius:10px;padding:3px;gap:2px">
        ${PIPELINES.map(p=>`<button onclick="dPipeline='${p.id}';renderPage()" style="padding:5px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:${dPipeline===p.id?'#fff':'transparent'};color:${dPipeline===p.id?'#1a1a1a':'#6b7280'};box-shadow:${dPipeline===p.id?'0 1px 4px rgba(0,0,0,.1)':'none'}">${p.name}</button>`).join('')}
      </div>
      <button onclick="openNewStageModal()" class="btn-w" style="font-size:12px;gap:5px">${Icon({n:'plus',size:13})} Stage</button>
      <button onclick="openNewDealModal()" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'plus',size:15})} New Deal</button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="card" style="padding:10px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button onclick="kFilterOpen=!kFilterOpen;renderPage()" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:20px;background:#fff;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500">
        ${Icon({n:'filter',size:13})} Filters${activeFilters>0?` <span style="background:#c41230;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${activeFilters}</span>`:''}
      </button>
      ${kFilterOpen?`
        <select onchange="kFilterOwners=this.value?[this.value]:[];renderPage()" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Owners</option>
          ${allOwners.map(o=>`<option value="${o}" ${kFilterOwners.includes(o)?'selected':''}>${o.split(' ')[0]}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:5px">
          <input id="dealValueMinInput" type="number" placeholder="Min $" value="${kFilterValMin}" oninput="kFilterValMin=this.value;renderPage()" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <span style="color:#9ca3af">–</span>
          <input id="dealValueMaxInput" type="number" placeholder="Max $" value="${kFilterValMax}" oninput="kFilterValMax=this.value;renderPage()" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
        </div>
        <select onchange="kFilterSource=this.value?[this.value]:[];renderPage()" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Sources</option>
          ${allSources.map(s=>`<option value="${s}" ${kFilterSource.includes(s)?'selected':''}>${s}</option>`).join('')}
        </select>
        ${activeFilters>0?`<button onclick="kFilterOwners=[];kFilterStages=[];kFilterSource=[];kFilterValMin='';kFilterValMax='';renderPage()" style="font-size:12px;color:#c41230;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Clear all</button>`:''}
      `:''}
    </div>
  </div>

  <!-- Kanban board -->
  <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:16px;align-items:flex-start">
    ${stages.map(st=>{
      const sd=(byStage[st.id]||[]);
      // Column $ total: exclude won AND lost so the number reflects live pipe.
      // (For the Not Proceeding column itself this naturally shows $0 since
      // its deals all have lost:true — the column is visible but calls out
      // that nothing in it is counted toward the pipeline.)
      const stVal=sd.filter(d=>!d.won&&!d.lost).reduce((s,d)=>s+d.val,0);
      const isNP=!!st.isLost;
      const colBg=isNP?'#fef2f2':'#f8f9fa';
      return `<div id="col_${st.id}" style="flex-shrink:0;width:236px;display:flex;flex-direction:column;border-radius:12px;background:${colBg};border:2px solid transparent;transition:background .15s,border-color .15s;min-height:460px${isNP?';opacity:0.92':''}"
        ondragover="event.preventDefault();highlightCol('${st.id}')"
        ondragleave="if(!event.currentTarget.contains(event.relatedTarget))unhighlightCol('${st.id}')"
        ondrop="dropDeal('${st.id}')">

        <div style="padding:12px 12px 6px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
            <div style="width:10px;height:10px;border-radius:50%;background:${st.col};flex-shrink:0"></div>
            <span style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${st.name}</span>
            <span style="background:#e5e7eb;color:#6b7280;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;flex-shrink:0">${sd.length}</span>
          </div>
          <button onclick="openStageEdit('${st.id}')" title="Edit stage"
            style="width:24px;height:24px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1"
            onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='transparent'">⋯</button>
        </div>
        <div style="padding:0 10px 6px;font-size:11px;color:#9ca3af;font-weight:500">${fmt$(stVal)}</div>

        <div style="flex:1;padding:0 8px 8px;display:flex;flex-direction:column;gap:7px">
          ${sd.length===0?`<div style="height:70px;border:2px dashed #e2e8f0;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Drop here</div>`:''}
          ${sd.map(d=>{
            const c=contacts.find(x=>x.id===d.cid);
            const passes=matchesFilter(d);
            const sent=getState().emailSent.filter(m=>m.dealId===d.id||(c&&m.to===c.email));
            const opened=sent.filter(m=>m.opened);
            return `<div
              draggable="true"
              ondragstart="dragDeal='${d.id}';event.dataTransfer.effectAllowed='move';event.currentTarget.style.opacity='0.45';event.currentTarget.style.cursor='grabbing'"
              ondragend="event.currentTarget.style.opacity='1';if(!dragDeal){return;}dragDeal=null;dragOverStage=null;unhighlightAllCols();renderPage()"
              onclick="setState({dealDetailId:'${d.id}'})"
              style="background:#fff;border-radius:10px;padding:12px;border:1px solid #e5e7eb;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .1s;opacity:${activeFilters>0&&!passes?.3:(isNP?.7:1)};position:relative;user-select:none"
              onmouseover="if(!dragDeal){this.style.boxShadow='0 4px 14px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)';}"
              onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';this.style.transform=''">

              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:5px">
                <div style="font-size:13px;font-weight:600;line-height:1.3;color:#1a1a1a;flex:1">${d.title}</div>
                <button onclick="event.stopPropagation();openDealEdit('${d.id}')"
                  style="width:20px;height:20px;border-radius:5px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1"
                  onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'" title="Quick edit">✎</button>
              </div>

              ${c?`<div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
                <div style="width:16px;height:16px;background:#c41230;border-radius:50%;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn+' '+c.ln)}</div>
                <span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.fn} ${c.ln}</span>
              </div>`:''}

              <div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;margin-bottom:8px">${fmt$(d.val)}</div>

              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:4px">
                  ${Badge(d.branch,'gray')}
                  ${d.age>7?`<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:10px;font-weight:600">🔥${d.age}d</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                  ${sent.length>0?`<span class="etrack" style="font-size:10px;color:${opened.length>0?'#15803d':'#9ca3af'};background:${opened.length>0?'#f0fdf4':'#f3f4f6'};padding:1px 6px;border-radius:10px;cursor:default">👁${opened.length}/${sent.length}<div class="etrack-tip" style="text-align:left">${sent.map(m=>'<div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.1)"><div style="font-weight:600;font-size:11px">'+(m.subject||'Email')+'</div><div style="color:#9ca3af;font-size:10px">Sent: '+(m.date||'')+'</div><div style="font-size:10px;margin-top:2px;'+(m.opened?'color:#4ade80':'color:#fbbf24')+'">'+(m.opened?'✓ Opened'+(m.openedAt?' · '+m.openedAt:''):'✗ Not opened')+'</div></div>').join('')}</div></span>`:''}
                  <button onclick="event.stopPropagation();emailFromDeal('${d.id}')"
                    style="width:22px;height:22px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center" title="Email">✉️</button>
                </div>
              </div>
              ${d.closeDate?`<div style="margin-top:7px;font-size:10px;color:#9ca3af">📅 ${d.closeDate}</div>`:''}
              ${d.won?`<div style="position:absolute;top:8px;right:30px;background:#22c55e;color:#fff;border-radius:20px;font-size:9px;font-weight:700;padding:2px 7px">WON</div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}

    <!-- Add Stage button -->
    <div style="flex-shrink:0;width:210px">
      <button onclick="openNewStageModal()"
        style="width:100%;height:56px;border:2px dashed #d1d5db;border-radius:12px;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;color:#9ca3af;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s"
        onmouseover="this.style.borderColor='#c41230';this.style.color='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#d1d5db';this.style.color='#9ca3af';this.style.background='transparent'">
        ${Icon({n:'plus',size:15})} Add Stage
      </button>
    </div>
  </div>

  ${kanbanEditModal?renderKanbanModal():''}
  ${modal&&modal.type==='newDeal'?renderNewDealModal():''}`;
}

function dropDeal(stageId){
  if(!dragDeal)return;
  const s=getState();
  const deal=s.deals.find(d=>d.id===dragDeal);
  if(!deal||deal.sid===stageId){dragDeal=null;dragOverStage=null;return;}
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  const st=pl?pl.stages.find(s=>s.id===stageId):null;
  // Step 4 §1: drag-to-won column must route through the quote-selection gate.
  if (st && st.isWon) {
    var _draggedId = dragDeal;
    dragDeal=null; dragOverStage=null; unhighlightAllCols();
    _requestWonTransition(_draggedId, stageId, {source:'kanban-drag'});
    return;
  }
  // Not Proceeding is a dead-end — require confirmation so an accidental drag
  // doesn't silently kill a live deal. The existing undrag/renderPage cleanup
  // on cancel mirrors the won-cancel path.
  if (st && st.isLost) {
    if (!confirm('Mark this deal as Not Proceeding? It will drop out of the active pipeline.')) {
      dragDeal=null; dragOverStage=null; unhighlightAllCols(); renderPage();
      return;
    }
  }
  const act={id:'a'+Date.now(),type:'stage',text:'Moved to: '+(st?st.name:stageId),
    date:new Date().toISOString().slice(0,10),time:new Date().toTimeString().slice(0,5),
    by:(getCurrentUser()||{name:'Admin'}).name,done:false,dueDate:''};
  var _did = dragDeal;
  setState({deals:s.deals.map(d=>d.id===dragDeal
    ?{...d,sid:stageId,
      won:!!(st&&st.isWon),
      lost:!!(st&&st.isLost),
      wonDate:(st&&st.isWon)?new Date().toISOString().slice(0,10):(d.wonDate||null),
      activities:[act,...(d.activities||[])]}:d)});
  dbUpdate('deals', _did, {sid:stageId, won:!!(st&&st.isWon), lost:!!(st&&st.isLost), won_date:(st&&st.isWon)?new Date().toISOString().slice(0,10):null});
  dbInsert('activities', actToDb(act, 'deal', _did));
  dragDeal=null; dragOverStage=null; unhighlightAllCols();
  if(st&&st.isWon)addToast('🎉 Deal Won!','success');
  else if(st&&st.isLost){addToast('Deal marked as Not Proceeding','warning');askLostReason(_did);}
  else addToast('Moved to '+(st?st.name:stageId),'info');
  renderPage();
}

// ── Detail page tab state ────────────────────────────────────────────────────
// ── Detail tab state (per entity type, so tabs persist independently) ─────────
let detailTab = 'notes';
let schedActivityModal = false;
let schedActivityData = {type:'call', title:'', date:'', time:'09:00', duration:30, entityId:'', entityType:'', notes:''};

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Get activities for an entity (deals + leads store on entity; contacts pull from contactActivities + linked entity activities)
function getEntityActivities(entityId, entityType) {
  const s = getState();
  if (entityType === 'deal') {
    const d = s.deals.find(x=>x.id===entityId);
    return d ? (d.activities||[]) : [];
  }
  if (entityType === 'lead') {
    const l = s.leads.find(x=>x.id===entityId);
    return l ? (l.activities||[]) : [];
  }
  if (entityType === 'contact') {
    // Merge contact-level activities with activities from all linked deals/leads
    const contactActs = (s.contactActivities||{})[entityId] || [];
    const contact = s.contacts.find(c=>c.id===entityId);
    if (!contact) return contactActs;
    const dealActs = s.deals
      .filter(d=>d.cid===entityId)
      .flatMap(d=>(d.activities||[]).map(a=>({...a, _source:'deal', _dealTitle:d.title})));
    const leadActs = s.leads
      .filter(l=>l.email===contact.email&&contact.email)
      .flatMap(l=>(l.activities||[]).map(a=>({...a, _source:'lead', _leadName:l.fn+' '+l.ln})));
    return [...contactActs, ...dealActs, ...leadActs].sort((a,b)=>b.date>a.date?1:-1);
  }
  return [];
}

function saveActivityToEntity(entityId, entityType, actObj) {
  const s = getState();
  if (entityType === 'deal') {
    setState({deals: s.deals.map(d=>d.id===entityId ? {...d,activities:[actObj,...(d.activities||[])]} : d)});
    const d = s.deals.find(x=>x.id===entityId);
    if (d && d.cid) mirrorActivityToContact(d.cid, {...actObj, _source:'deal'});
  } else if (entityType === 'lead') {
    setState({leads: s.leads.map(l=>l.id===entityId ? {...l,activities:[actObj,...(l.activities||[])]} : l)});
  } else if (entityType === 'contact') {
    const ca = {...(s.contactActivities||{})};
    ca[entityId] = [actObj, ...(ca[entityId]||[])];
    setState({contactActivities: ca});
  }
  dbInsert('activities', actToDb(actObj, entityType, entityId));
}

function mirrorActivityToContact(contactId, actObj) {
  const s = getState();
  const ca = {...(s.contactActivities||{})};
  // Don't double-store if it already has the same id
  if ((ca[contactId]||[]).find(a=>a.id===actObj.id)) return;
  ca[contactId] = [actObj, ...(ca[contactId]||[])];
  setState({contactActivities: ca});
}

// Build a Google Calendar URL
function buildGCalURL(title, date, time, durationMins, notes) {
  const d = date || new Date().toISOString().slice(0,10);
  const t = time || '09:00';
  const [yr,mo,dy] = d.split('-');
  const [hr,mn] = t.split(':');
  const startDT = yr+mo+dy+'T'+hr+mn+'00';
  const endDate = new Date(parseInt(yr),parseInt(mo)-1,parseInt(dy),parseInt(hr),parseInt(mn)+durationMins);
  const pad = n => String(n).padStart(2,'0');
  const endDT = endDate.getFullYear()+pad(endDate.getMonth()+1)+pad(endDate.getDate())+'T'+pad(endDate.getHours())+pad(endDate.getMinutes())+'00';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}&details=${encodeURIComponent(notes||'')}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE ACTIVITY MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openScheduleModal(entityId, entityType, prefType) {
  schedActivityModal = true;
  schedActivityData = {type:prefType||'call', title:'', date:'', time:'09:00', duration:30, entityId, entityType, notes:''};
  renderPage();
}

function renderScheduleModal() {
  const d  = schedActivityData;
  const sd = d.suburb || '';
  const br = d.branch || 'VIC';
  const repName = d.repName || mapSelectedRep || 'all';

  const TYPES = getPickableActivityTypes();

  // Quick time shortcuts
  const addHours = (h) => {
    const dt = new Date(); dt.setHours(dt.getHours()+h);
    const dd = dt.toISOString().slice(0,10);
    const tt = String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    return {date:dd, time:tt};
  };
  const quickSlots = [
    {label:'In 1h',    ...addHours(1)},
    {label:'In 3h',    ...addHours(3)},
    {label:'Tomorrow', ...addHours(24)},
    {label:'Next week',...addHours(168)},
  ];

  // Rep's existing appointments for selected date
  const dayDate   = d.date || new Date().toISOString().slice(0,10);
  const dayApts   = MOCK_APPOINTMENTS.filter(a =>
    a.date === dayDate && (repName === 'all' || a.rep === repName)
  ).sort((a,b)=> a.time > b.time ? 1 : -1);

  // Time slots for the day view (8am–6pm)
  const HOURS = Array.from({length:20}, (_,i)=>{
    const h = Math.floor(i/2)+8;
    const m = i%2===0 ? '00':'30';
    return String(h).padStart(2,'0')+':'+m;
  });

  // Rep recommendations for this suburb
  const repRecs = sd ? REP_BASES
    .map(r=>({...r,score:scoreRepForLead(r,{suburb:sd,branch:br,status:'New'}),
              apts:MOCK_APPOINTMENTS.filter(a=>a.rep===r.name&&a.date===dayDate)}))
    .filter(r=>r.score>=0)
    .sort((a,b)=>b.score-a.score)
    : [];

  const gcalUrl = (d.date && d.time) ? buildGCalURL(
    d.title || (d.type.charAt(0).toUpperCase()+d.type.slice(1)),
    d.date, d.time, d.duration||30, d.notes||''
  ) : '';

  return `<div class="modal-bg" onclick="if(event.target===this){schedActivityModal=false;renderPage()}">
    <div class="modal" style="max-width:860px;width:95vw;height:88vh;display:flex;flex-direction:column">

      <!-- Header -->
      <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h3 style="margin:0;font-size:17px;font-weight:700;font-family:Syne,sans-serif">Schedule Activity</h3>
        <div style="display:flex;align-items:center;gap:8px">
          ${gcalUrl?`<a href="${gcalUrl}" target="_blank" class="btn-w" style="font-size:12px;text-decoration:none;gap:5px">📅 Add to Google Cal</a>`:''}
          <button onclick="schedActivityModal=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
        </div>
      </div>

      <!-- Body: left form + right day schedule -->
      <div style="display:grid;grid-template-columns:340px 1fr;flex:1;overflow:hidden">

        <!-- ── LEFT: Activity form ── -->
        <div style="padding:18px;border-right:1px solid #f0f0f0;overflow-y:auto;display:flex;flex-direction:column;gap:14px">

          <!-- Type selector -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Activity Type</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${TYPES.map(t=>`<button
                onclick="schedActivityData.type='${t.id}';document.getElementById('sm_type').value='${t.id}';this.closest('.modal').querySelectorAll('.stype-btn').forEach(b=>{b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#e5e7eb'});this.style.background='#fff5f6';this.style.color='#c41230';this.style.borderColor='#c41230'"
                class="stype-btn"
                style="display:flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid ${d.type===t.id?'#c41230':'#e5e7eb'};border-radius:20px;font-size:12px;cursor:pointer;font-family:inherit;background:${d.type===t.id?'#fff5f6':'#fff'};color:${d.type===t.id?'#c41230':'#6b7280'};font-weight:500">
                ${t.icon} ${t.label}
              </button>`).join('')}
              <input type="hidden" id="sm_type" value="${d.type||'call'}">
            </div>
          </div>

          <!-- Title -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Subject</label>
            <input id="sm_title" class="inp" value="${d.title||''}" placeholder="Activity subject…"
              oninput="schedActivityData.title=this.value" style="font-size:13px">
          </div>

          <!-- Date + quick picks -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Date & Time</label>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${quickSlots.map(q=>`<button onclick="schedActivityData.date='${q.date}';schedActivityData.time='${q.time}';document.getElementById('sm_date').value='${q.date}';document.getElementById('sm_time').value='${q.time}';mapSelectedDate='${q.date}';renderPage()"
                style="padding:4px 10px;border:1px solid #e5e7eb;border-radius:12px;font-size:11px;cursor:pointer;background:#fff;font-family:inherit;color:#6b7280"
                onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">${q.label}</button>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input type="date" id="sm_date" value="${d.date||new Date().toISOString().slice(0,10)}"
                oninput="schedActivityData.date=this.value;mapSelectedDate=this.value;renderPage()" class="inp" style="font-size:12px;padding:6px 8px">
              <input type="time" id="sm_time" value="${d.time||'09:00'}"
                oninput="schedActivityData.time=this.value" class="inp" style="font-size:12px;padding:6px 8px">
            </div>
          </div>

          <!-- Duration -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Duration</label>
            <select id="sm_dur" class="sel" onchange="schedActivityData.duration=parseInt(this.value)"
              style="font-size:12px;padding:6px 8px">
              <option value="15" ${(d.duration||30)===15?'selected':''}>15 min</option>
              <option value="30" ${(d.duration||30)===30?'selected':''}>30 min</option>
              <option value="60" ${(d.duration||30)===60?'selected':''}>1 hour</option>
              <option value="90" ${(d.duration||30)===90?'selected':''}>1.5 hrs</option>
              <option value="120" ${(d.duration||30)===120?'selected':''}>2 hours</option>
              <option value="180" ${(d.duration||30)===180?'selected':''}>3 hours</option>
            </select>
          </div>

          <!-- Notes -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Note (private)</label>
            <textarea id="sm_notes" class="inp" rows="3" placeholder="Add a note…"
              oninput="schedActivityData.notes=this.value"
              style="font-size:13px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;resize:none">${d.notes||''}</textarea>
          </div>

          <!-- Rep recommendation (if location known) -->
          ${repRecs.length>0?`<div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Assign Rep ${sd?'· '+sd:''}</label>
            ${repRecs.slice(0,3).map((r,i)=>{
              const coords = getSuburbCoords(sd, br);
              const dist   = haversine(r.lat,r.lng,coords.lat,coords.lng);
              const drive  = estDriveTime(dist);
              const isSel  = (mapSelectedRep===r.name);
              return `<div onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:2px solid ${isSel?r.col:'#e5e7eb'};background:${isSel?r.col+'10':'#fff'};margin-bottom:5px;cursor:pointer">
                <div style="width:26px;height:26px;background:${r.col};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600">${r.name}</div>
                  <div style="font-size:11px;color:#6b7280">🚗 ~${drive}min · ${r.apts.length} appts today</div>
                </div>
                ${i===0?`<span style="font-size:9px;background:#fef9c3;color:#92400e;padding:1px 6px;border-radius:8px;font-weight:700;flex-shrink:0">Best fit</span>`:''}
                ${isSel?`<span style="color:${r.col};font-size:16px">✓</span>`:''}
              </div>`;
            }).join('')}
          </div>`:''}
        </div>

        <!-- ── RIGHT: Day schedule view ── -->
        <div style="overflow-y:auto;background:#f9fafb;display:flex;flex-direction:column">
          <!-- Day header -->
          <div style="padding:12px 16px;background:#fff;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <div>
              <div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">
                ${new Date((d.date||new Date().toISOString().slice(0,10))+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}
              </div>
              <div style="font-size:12px;color:#6b7280">${mapSelectedRep==='all'?'All reps':'Rep: '+mapSelectedRep}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button onclick="mapSelectedDate=(d.date||new Date().toISOString().slice(0,10));mapSelectedRep='all';renderPage()" class="btn-g" style="font-size:11px">All reps</button>
              ${REP_BASES.slice(0,3).map(r=>`<button onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
                style="padding:3px 8px;border-radius:8px;border:1px solid ${mapSelectedRep===r.name?r.col:'#e5e7eb'};background:${mapSelectedRep===r.name?r.col+'20':'#fff'};color:${mapSelectedRep===r.name?r.col:'#6b7280'};font-size:11px;cursor:pointer;font-family:inherit">${r.name.split(' ')[0]}</button>`).join('')}
            </div>
          </div>

          <!-- Time grid -->
          <div style="flex:1;padding:8px 12px;position:relative">
            ${dayApts.length===0?`<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">
              <div style="font-size:32px;margin-bottom:8px">📅</div>
              <div style="font-weight:500">No appointments scheduled</div>
              <div style="font-size:12px;margin-top:4px">${mapSelectedRep==='all'?'Select a rep above to see their schedule':'${mapSelectedRep} is free all day'}</div>
            </div>`:''}

            ${HOURS.filter((_,i)=>i%2===0||dayApts.some(a=>a.time===HOURS[i])).map(hour=>{
              const aptsAtHour = dayApts.filter(a=>a.time===hour);
              const isNewActTime = (d.time||'').slice(0,5)===hour;
              return `<div style="display:flex;gap:10px;min-height:38px;align-items:flex-start;padding:3px 0;${isNewActTime?'background:#fff5f6;border-radius:6px;margin:0 -4px;padding:3px 4px':''}">
                <div style="width:44px;font-size:11px;color:${isNewActTime?'#c41230':'#9ca3af'};font-weight:${isNewActTime?700:400};flex-shrink:0;padding-top:2px;text-align:right">${hour}</div>
                <div style="flex:1;min-width:0">
                  ${isNewActTime?`<div style="background:#c41230;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;margin-bottom:3px">← New: ${d.title||d.type}</div>`:''}
                  ${aptsAtHour.map(apt=>{
                    const rep=REP_BASES.find(r=>r.name===apt.rep);
                    return `<div style="background:#fff;border:1px solid ${rep?rep.col:'#e5e7eb'};border-left:3px solid ${rep?rep.col:'#e5e7eb'};border-radius:6px;padding:5px 10px;margin-bottom:3px">
                      <div style="font-size:12px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
                      <div style="font-size:10px;color:#6b7280">📍 ${apt.suburb} · ${apt.type} · ${apt.rep.split(' ')[0]}</div>
                    </div>`;
                  }).join('')}
                  ${aptsAtHour.length===0&&!isNewActTime?`<div style="height:1px;background:#f0f0f0;margin:16px 0"></div>`:''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="font-size:12px;color:#9ca3af">
          ${dayApts.length} appointment${dayApts.length!==1?'s':''} on this day${mapSelectedRep!=='all'?' for '+mapSelectedRep:''}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="schedActivityModal=false;renderPage()" class="btn-w">Cancel</button>
          <button onclick="saveScheduledActivity()" class="btn-r" style="font-size:13px;padding:7px 22px">Save Activity</button>
        </div>
      </div>
    </div>
  </div>`;
}


function saveScheduledActivity() {
  const d = schedActivityData;
  if (!d.date || !d.time) { addToast('Pick a date and time','error'); return; }
  const title = d.title || (d.type.charAt(0).toUpperCase()+d.type.slice(1));
  const calLink = buildGCalURL(title, d.date, d.time, d.duration, d.notes);
  const act = {
    id: 'a'+Date.now(), type: d.type,
    text: title + (d.notes?'\n'+d.notes:''),
    date: d.date, time: d.time, duration: d.duration,
    by: (getCurrentUser()||{name:'Admin'}).name, done: false, dueDate: d.date,
    calLink, scheduled: true,
  };
  saveActivityToEntity(d.entityId, d.entityType, act);
  schedActivityModal = false;
  // Also add to MOCK_APPOINTMENTS so it shows in the map
  const rep = REP_BASES.find(r=>r.name===(d.repName||(getCurrentUser()||{name:'Admin'}).name)) || REP_BASES[0];
  const coords = getSuburbCoords(d.suburb||'', d.branch||rep.branch);
  const entity = d.entityType==='deal' ? getState().deals.find(x=>x.id===d.entityId) :
                 d.entityType==='lead' ? getState().leads.find(x=>x.id===d.entityId) : null;
  if (entity) {
    MOCK_APPOINTMENTS.push({
      id:'ap_'+Date.now(), rep:rep.name, repCol:rep.col,
      date:d.date, time:d.time,
      client: d.entityType==='deal'?(entity.title||'Deal'):((entity.fn||'')+' '+(entity.ln||'')),
      suburb:d.suburb||entity.suburb||'',
      lat:coords.lat, lng:coords.lng,
      type:title, status:'Confirmed',
    });
    saveAppointments();
  }
  addToast('✓ '+title+' scheduled for '+d.date+' at '+d.time,'success');
}


// ── Email tracking lookup for timeline activities ─────────────────────────────
// Build hover tooltip HTML for email tracking status
function emailTrackTip(act, sentEmails) {
  // Try to match from emailSent array for richer data
  var msg = null;
  if (sentEmails && act.to) {
    msg = sentEmails.find(function(m){ return m.gmailMsgId && m.gmailMsgId === act.gmailMsgId; });
    if (!msg && act.subject) msg = sentEmails.find(function(m){ return m.subject === act.subject && m.date === act.date; });
  }
  var opens = act.opens || (msg && msg.opens) || 0;
  var openedAt = act.openedAt || (msg && msg.openedAt) || null;
  var clicked = act.clicked || (msg && msg.clicked) || false;
  var to = act.to || (msg && msg.to) || '';
  var sentDate = act.date || '';
  var sentTime = act.time || '';
  var lines = [];
  lines.push('<div style="font-weight:700;margin-bottom:4px;font-size:12px">' + (act.subject||'Email') + '</div>');
  if (to) lines.push('<div style="color:#9ca3af">To: ' + to + '</div>');
  lines.push('<div style="color:#9ca3af">Sent: ' + sentDate + (sentTime ? ' ' + sentTime : '') + '</div>');
  lines.push('<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.15)">');
  if (opens > 0) {
    lines.push('<div style="color:#4ade80;font-weight:600">✓ Opened ' + opens + '× </div>');
    if (openedAt) lines.push('<div style="color:#86efac">Last: ' + openedAt + '</div>');
  } else {
    lines.push('<div style="color:#fbbf24">✗ Not opened yet</div>');
  }
  if (clicked) lines.push('<div style="color:#60a5fa;font-weight:600;margin-top:2px">🔗 Link clicked</div>');
  lines.push('</div>');
  return lines.join('');
}

function getEmailTrackingForActivity(act) {
  // Match activity to sent email by subject/date
  if (act.type !== 'email') return null;
  const sent = getState().emailSent;
  // Match by gmailMsgId first, then by subject+date
  let msg = act.gmailMsgId ? sent.find(m => m.gmailMsgId === act.gmailMsgId) : null;
  if (!msg && act.subject) {
    msg = sent.find(m => m.subject === act.subject && m.date === act.date);
  }
  if (!msg && act.subject) {
    msg = sent.find(m => m.subject.includes(act.subject.slice(0,20)));
  }
  return msg || null;
}

// Simulate opening a tracked email from the timeline
function simulateOpenFromTimeline(actId, entityId, entityType) {
  const activities = getEntityActivities(entityId, entityType);
  const act = activities.find(a => a.id === actId);
  if (!act) return;
  // Find matching sent email
  const msg = getEmailTrackingForActivity(act);
  if (msg) {
    trackEmailOpen(msg.id);
  } else {
    // Create a virtual tracking event
    const newOpens = (act.opens || 0) + 1;
    const timeStr = new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short'}) + ' ' + new Date().toTimeString().slice(0,5);
    if (entityType === 'deal') {
      setState({deals: getState().deals.map(d => {
        if (d.id !== entityId) return d;
        return {...d, activities: (d.activities||[]).map(a =>
          a.id===actId ? {...a, opens:newOpens, opened:true, openedAt:timeStr} : a
        )};
      })});
    } else if (entityType === 'lead') {
      setState({leads: getState().leads.map(l => {
        if (l.id !== entityId) return l;
        return {...l, activities: (l.activities||[]).map(a =>
          a.id===actId ? {...a, opens:newOpens, opened:true, openedAt:timeStr} : a
        )};
      })});
    } else {
      const ca = {...(getState().contactActivities||{})};
      ca[entityId] = (ca[entityId]||[]).map(a =>
        a.id===actId ? {...a, opens:newOpens, opened:true, openedAt:timeStr} : a
      );
      setState({contactActivities:ca});
    }
    pushEmailOpenNotif({toName:'Contact', subject:act.subject||'Email', opens:newOpens});
    addToast('👁 Email marked as opened', 'success');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPEDRIVE-IDENTICAL DETAIL PAGE RENDERER
// Layout: LEFT sidebar (details/person/org) | RIGHT main (tabs + history)
// ══════════════════════════════════════════════════════════════════════════════


// ── Sync a clicked time slot from the inline map back to the activity form ────
function setActivityTime(entityId, time, date, repName) {
  // Update atime input if visible
  const timeEl = document.getElementById('atime_'+entityId);
  if (timeEl) timeEl.value = time;
  const dateEl = document.getElementById('adate_'+entityId);
  if (dateEl && date) dateEl.value = date;
  // Update schedule state
  schedActivityData.time = time;
  if (date) schedActivityData.date = date;
  if (repName) { schedActivityData.repName = repName; mapSelectedRep = repName; }
  // Flash the selected slot visually (re-render)
  renderPage();
}

// (Previous OSM-iframe mount helper removed — the inline map now uses real
//  Google Maps via mountInlineGoogleMap in 14a-google-maps-real.js.)

// ── Inline map scheduler — embeds directly under the Activity tab ─────────────
// Shows rep's day at a glance + book button without opening a separate modal
function renderInlineMapScheduler(entityId, entityType) {
  // Get entity data for location + rep
  const s = getState();
  let suburb='', branch='VIC', repName=(getCurrentUser()||{name:'Admin'}).name, entityVal=0;
  if (entityType === 'deal') {
    const d = s.deals.find(x=>x.id===entityId);
    if (d) { suburb=d.suburb||''; branch=d.branch||'VIC'; repName=d.rep||(getCurrentUser()||{name:'Admin'}).name; entityVal=d.val; }
  } else if (entityType === 'lead') {
    const l = s.leads.find(x=>x.id===entityId);
    if (l) { suburb=l.suburb||''; branch=l.branch||'VIC'; repName=l.owner||(getCurrentUser()||{name:'Admin'}).name; entityVal=l.val; }
  } else {
    const c = s.contacts.find(x=>x.id===entityId);
    if (c) { suburb=c.suburb||''; branch=c.branch||'VIC'; }
  }

  // Use mapSelectedDate (shared state), default today
  const date = mapSelectedDate || new Date().toISOString().slice(0,10);

  // Get rep's appointments for the selected day
  const activeRep = mapSelectedRep !== 'all' ? mapSelectedRep : repName;
  const repApts = MOCK_APPOINTMENTS.filter(a => a.date===date && a.rep===activeRep)
                    .sort((a,b)=>a.time>b.time?1:-1);

  // All reps + scores for this location
  const coords = getSuburbCoords(suburb, branch);
  const repScores = REP_BASES
    .map(r => {
      const score = scoreRepForLead(r, {suburb, branch, status:'New'});
      const dist  = haversine(r.lat, r.lng, coords.lat, coords.lng);
      const drive = estDriveTime(dist);
      const dayApts = MOCK_APPOINTMENTS.filter(a=>a.rep===r.name&&a.date===date);
      return {...r, score, dist, drive, dayApts};
    })
    .filter(r=>r.score>=0)
    .sort((a,b)=>b.score-a.score);

  const bestRep = repScores[0];

  // Time slots 08:00–17:00 every 30 min
  const SLOTS = [];
  for (let h=8; h<=17; h++) {
    SLOTS.push(String(h).padStart(2,'0')+':00');
    if (h<17) SLOTS.push(String(h).padStart(2,'0')+':30');
  }

  // Map centre + plotting handled by mountInlineGoogleMap in 14a-google-maps-real.js.

  return `
  <div style="border-top:2px solid #f0f0f0;background:#fafafa">

    <!-- ── Inline map header ── -->
    <div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;background:#fff;border-bottom:1px solid #e5e7eb">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:#1a1a1a;font-family:Syne,sans-serif">📍 Schedule Map</span>
        ${suburb?`<span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:10px">${suburb}</span>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="date" value="${date}" onchange="mapSelectedDate=this.value;renderPage()"
          class="inp" style="font-size:12px;padding:4px 8px;width:auto">
        <select onchange="mapSelectedRep=this.value;renderPage()" class="sel" style="font-size:12px;padding:4px 8px;width:auto">
          <option value="all">All reps</option>
          ${REP_BASES.map(r=>`<option value="${r.name}" ${activeRep===r.name?'selected':''}>${r.name.split(' ')[0]} (${r.branch})</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- ── Body: left schedule + right map+recs ── -->
    <div style="display:grid;grid-template-columns:1fr 260px;min-height:300px">

      <!-- LEFT: Day timeline -->
      <div style="border-right:1px solid #e5e7eb;overflow-y:auto;max-height:420px;background:#fff">
        <div style="padding:8px 14px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;background:#f9fafb">
          ${new Date(date+'T12:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'})} — ${activeRep.split(' ')[0]}
        </div>

        ${repApts.length===0?`
        <div style="padding:20px 14px;text-align:center;color:#9ca3af">
          <div style="font-size:24px;margin-bottom:6px">📅</div>
          <div style="font-size:12px;font-weight:500">${activeRep.split(' ')[0]} is free all day</div>
          <div style="font-size:11px;margin-top:3px;color:#d1d5db">Great day to book!</div>
        </div>`:'' }

        <!-- Time grid -->
        ${SLOTS.map(slot=>{
          const apt = repApts.find(a=>a.time===slot);
          const isScheduling = (schedActivityData.time||'').slice(0,5)===slot && schedActivityModal;
          return `<div style="display:flex;align-items:flex-start;min-height:32px;border-bottom:1px solid #f9fafb;${apt?'background:#fff':''}">
            <div style="width:40px;font-size:10px;color:#9ca3af;flex-shrink:0;padding:7px 4px 0 8px;text-align:right">${slot}</div>
            <div style="flex:1;padding:2px 8px">
              ${apt?`<div style="background:${(REP_BASES.find(r=>r.name===apt.rep)||{col:'#9ca3af'}).col}18;border-left:3px solid ${(REP_BASES.find(r=>r.name===apt.rep)||{col:'#9ca3af'}).col};border-radius:0 6px 6px 0;padding:4px 8px;margin:2px 0">
                <div style="font-size:11px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
                <div style="font-size:10px;color:#6b7280">📍 ${apt.suburb} · ${apt.type}</div>
              </div>`:''}
              ${!apt&&slot.endsWith(':00')?`<div style="height:1px;background:#f3f4f6;margin:15px 0 0"></div>`:''}
            </div>
            <!-- Quick-book button on empty slots -->
            ${!apt?`<button onclick="
                document.getElementById('atime_${entityId}')&&(document.getElementById('atime_${entityId}').value='${slot}');
                schedActivityData.time='${slot}';
                schedActivityData.date='${date}';
                schedActivityData.repName='${activeRep}';
                mapSelectedRep='${activeRep}';
                if(document.getElementById('sm_time'))document.getElementById('sm_time').value='${slot}'"
              style="width:22px;height:22px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#d1d5db;font-size:14px;flex-shrink:0;margin:4px 4px 0 0;display:flex;align-items:center;justify-content:center;transition:all .15s"
              onmouseover="this.style.background='#f0fdf4';this.style.color='#22c55e';this.title='Book ${slot}'"
              onmouseout="this.style.background='transparent';this.style.color='#d1d5db'"
              title="Set time to ${slot}">+</button>`:'<div style="width:26px;flex-shrink:0"></div>'}
          </div>`;
        }).join('')}
      </div>

      <!-- RIGHT: Map + rep recommendations -->
      <div style="display:flex;flex-direction:column;overflow:hidden">

        <!-- Mini map -->
        <div style="position:relative;flex-shrink:0">
          <div id="inlineMapSlot" style="width:100%;height:160px;overflow:hidden;background:#f3f4f6"></div>
          <!-- Rep dots overlay legend -->
          <div style="position:absolute;bottom:6px;left:6px;right:6px;background:rgba(255,255,255,.95);border-radius:7px;padding:5px 8px;box-shadow:0 1px 6px rgba(0,0,0,.12)">
            ${repScores.slice(0,3).map(r=>`<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <div style="width:8px;height:8px;border-radius:50%;background:${r.col};flex-shrink:0"></div>
              <span style="font-size:10px;font-weight:500;color:#374151">${r.name.split(' ')[0]}</span>
              <span style="font-size:10px;color:#9ca3af">🚗${r.drive}min · ${r.dayApts.length}apt${r.dayApts.length!==1?'s':''}</span>
            </div>`).join('')}
            ${suburb?`<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(suburb+', Australia')}&travelmode=driving" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none">Get directions ↗</a>`:''}
          </div>
        </div>

        <!-- Rep recommendations -->
        <div style="flex:1;overflow-y:auto;padding:8px;background:#fafafa">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px;padding:0 2px">Best reps${suburb?' for '+suburb:''}</div>

          ${repScores.slice(0,4).map((r,i)=>{
            const isSel = activeRep===r.name;
            return `<div onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
              style="display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:8px;border:1.5px solid ${isSel?r.col:'#e5e7eb'};background:${isSel?r.col+'14':'#fff'};margin-bottom:5px;cursor:pointer;transition:all .15s"
              onmouseover="if(!${isSel})this.style.borderColor='${r.col}';if(!${isSel})this.style.background='${r.col}08'"
              onmouseout="if(!${isSel})this.style.borderColor='#e5e7eb';if(!${isSel})this.style.background='#fff'">
              <div style="width:24px;height:24px;border-radius:50%;background:${r.col};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name.split(' ')[0]} ${r.name.split(' ')[1]||''}</span>
                  ${i===0?`<span style="font-size:8px;background:#fef9c3;color:#92400e;padding:0 4px;border-radius:6px;font-weight:700;flex-shrink:0">Best</span>`:''}
                </div>
                <div style="font-size:10px;color:#6b7280">🚗${r.drive}min · ${r.dayApts.length} today</div>
              </div>
              ${isSel?`<span style="color:${r.col};font-size:14px;flex-shrink:0">✓</span>`:''}
            </div>`;
          }).join('')}

          <!-- View full map -->
          <button onclick="setState({page:'map'})" class="btn-w" style="width:100%;justify-content:center;font-size:11px;margin-top:10px;gap:4px">
            📍 Open full schedule map
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderEntityDetail({
  entityType, entityId,
  title, owner,
  stageBarHtml,               // optional stage progress bar HTML
  wonLostHtml,                // buttons top right
  leftSidebarHtml,            // Summary + Details + Person + Org
  backOnclick, backLabel,
  activities,
  contact,
}) {
  const TABS = [
    {id:'activity', label:'Activity', icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'},
    {id:'notes',    label:'Notes',    icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'},
    {id:'call',     label:'Call',     icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>'},
    {id:'email',    label:'Email',    icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'},
    {id:'files',    label:'Files',    icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'},
  ];

  // Inline form content
  const inlineForm = renderTabForm(entityId, entityType, detailTab, contact);

  // ── History items ─────────────────────────────────────────────────────────
  const AICON = {note:'📝',call:'📞',email:'✉️',task:'☑️',stage:'🔀',created:'⭐',meeting:'📅',file:'📎',edit:'✏️'};
  const ACOLBORDER = {note:'#f59e0b',call:'#3b82f6',email:'#8b5cf6',task:'#22c55e',stage:'#9ca3af',created:'#ef4444',meeting:'#0d9488',file:'#6366f1',edit:'#64748b'};

  const historyItems = activities.length === 0
    ? `<div style="padding:40px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:10px">📋</div>
        <div style="font-size:14px;font-weight:500;color:#374151;margin-bottom:4px">No activity yet</div>
        <div style="font-size:13px;color:#9ca3af">Scheduled activities, pinned notes and emails will appear here.</div>
        <button onclick="openScheduleModal('${entityId}','${entityType}','call')" class="btn-r" style="margin-top:16px;font-size:12px">+ Schedule an activity</button>
      </div>`
    : `<div>
        ${activities.map((act,idx)=>`
          <div style="display:flex;gap:0;padding:14px 20px;${idx<activities.length-1?'border-bottom:1px solid #f3f4f6':''}">
            <!-- Icon column -->
            <div style="display:flex;flex-direction:column;align-items:center;margin-right:14px;flex-shrink:0">
              <div style="width:36px;height:36px;border-radius:50%;background:${ACOLBORDER[act.type]||'#9ca3af'}18;border:2px solid ${ACOLBORDER[act.type]||'#9ca3af'}40;display:flex;align-items:center;justify-content:center;font-size:16px">${AICON[act.type]||'📌'}</div>
              ${idx<activities.length-1?`<div style="width:2px;flex:1;background:#f3f4f6;margin-top:6px;min-height:20px"></div>`:''}
            </div>
            <!-- Content -->
            <div style="flex:1;min-width:0;padding-bottom:4px">
              <!-- Header row -->
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
                <div>
                  <span style="font-size:13px;font-weight:600;color:#111">${act.type==='created'?'Created':''}${act.type==='stage'?'Stage change':''}</span>
                  ${act.subject?('<span style="font-size:13px;font-weight:600;color:#111">'+act.subject+'</span>'+(act.type==='email'?('<span class="etrack" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:8px;'+(act.opens>0?'background:#f0fdf4;color:#15803d':'background:#f3f4f6;color:#9ca3af')+'"> 👁 '+(act.opens>0?act.opens+'× opened':'Not opened')+(act.opens>0&&act.openedAt?' <span style="opacity:.7">· '+act.openedAt+'</span>':'')+'<div class="etrack-tip">'+emailTrackTip(act, getState().emailSent)+'</div></span>'):'')):''}
                  ${!act.subject&&act.type!=='created'&&act.type!=='stage'?`<span style="font-size:13px;font-weight:600;color:#111">${act.type.charAt(0).toUpperCase()+act.type.slice(1)}${act.scheduled?` <span style="font-size:11px;font-weight:600;color:#0d9488;background:#ccfbf1;padding:1px 7px;border-radius:20px">Scheduled</span>`:''}</span>`:''}
                  ${act._source?`<span style="font-size:11px;color:#9ca3af;margin-left:6px">via ${act._source==='deal'?act._dealTitle||'deal':act._leadName||'lead'}</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                  ${act.by?`<span style="font-size:11px;color:#9ca3af">${act.by}</span>`:''}
                  <span style="font-size:11px;color:#d1d5db">·</span>
                  <span style="font-size:11px;color:#9ca3af">${act.date||''} ${act.time||''}</span>
                </div>
              </div>

              <!-- Body -->
              ${act.text&&act.type!=='stage'?`<div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;background:#f9fafb;padding:10px 14px;border-radius:8px;border-left:3px solid ${ACOLBORDER[act.type]||'#e5e7eb'}">${act.text}</div>`:''}
              ${act.type==='stage'?`<div style="font-size:13px;color:#6b7280">${act.text}</div>`:''}

              <!-- Email tracking row (emails only) -->
              ${act.type==='email'?('<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">'
                +'<div class="etrack" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;'+(act.opens>0?'background:#f0fdf4;color:#15803d;border:1px solid #86efac':'background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb')+'">'
                +' 👁 '+(act.opens>0?act.opens+'× opened':'Not yet opened')
                +(act.opens>0&&act.openedAt?' <span style="font-weight:400;opacity:.8">· '+act.openedAt+'</span>':'')
                +'<div class="etrack-tip">'+emailTrackTip(act, getState().emailSent)+'</div>'
                +'</div>'
                +(act.clicked?'<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd">🔗 Clicked</div>':'')
                +'<button onclick="emailReplyFromActivity(\''+act.id+'\',\''+entityId+'\',\''+entityType+'\')" style="padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;font-size:11px;cursor:pointer;font-family:inherit;color:#6b7280">↩ Reply</button>'
                +'</div>'):''}

              <!-- Task actions -->
              ${act.type==='task'||act.type==='call'||act.type==='meeting'?`<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
                ${act.dueDate?`<span style="font-size:11px;background:#fef9c3;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:500">📅 ${act.dueDate}${act.time?' '+act.time:''}</span>`:''}
                ${act.duration?`<span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:20px">⏱ ${act.duration<60?act.duration+'min':act.duration/60+'h'}</span>`:''}
                <button onclick="toggleActivityDone('${entityId}','${act.id}','${entityType}')" style="font-size:11px;padding:3px 12px;border-radius:20px;border:1px solid;cursor:pointer;font-family:inherit;font-weight:600;${act.done?'background:#dcfce7;border-color:#86efac;color:#15803d':'background:#f9fafb;border-color:#e5e7eb;color:#6b7280'}">${act.done?'✓ Done':'Mark done'}</button>
                ${act.calLink?`<a href="${act.calLink}" target="_blank" style="font-size:11px;color:#0369a1;text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:1px solid #bae6fd;border-radius:20px;background:#f0f9ff">📅 Calendar</a>`:''}
              </div>`:''}
            </div>
          </div>`).join('')}
      </div>`;

  const scheduledActs = activities.filter(a=>a.scheduled&&!a.done);

  return `
  <div style="margin:-24px;background:#f8f9fa;min-height:calc(100vh - 56px)">

    <!-- ── TOP BAR ── -->
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:0 24px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 0 8px;flex-wrap:wrap">
        <button onclick="${backOnclick}" style="font-size:13px;color:#6b7280;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:4px;flex-shrink:0" onmouseover="this.style.color='#c41230'" onmouseout="this.style.color='#6b7280'">
          ← ${backLabel}
        </button>
        <span style="color:#e5e7eb">|</span>
        <h1 style="font-size:17px;font-weight:800;margin:0;font-family:Syne,sans-serif;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</h1>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:6px;padding:4px 10px;background:${owner?'#f3f4f6':'#fef3c7'};border-radius:8px;border:${owner?'none':'1px solid #fde68a'}">
            <div style="width:22px;height:22px;background:${owner?'#c41230':'#f59e0b'};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${owner?owner.split(' ').map(w=>w[0]).join('').slice(0,2):'?'}</div>
            <span style="font-size:12px;font-weight:${owner?500:700};color:${owner?'#374151':'#92400e'}">${owner||'Unassigned'}</span>
          </div>
          ${wonLostHtml||''}
        </div>
      </div>
      <!-- Stage bar -->
      ${stageBarHtml?`<div style="display:flex;overflow-x:auto;border-top:1px solid #f0f0f0">${stageBarHtml}</div>`:``}
    </div>

    <!-- ── BODY: Left sidebar + Right main ── -->
    <div style="display:grid;grid-template-columns:300px 1fr;min-height:calc(100vh - 120px)">

      <!-- ── LEFT SIDEBAR ── -->
      <div style="background:#fff;border-right:1px solid #e5e7eb;overflow-y:auto;padding:0 0 40px">
        ${leftSidebarHtml||''}
      </div>

      <!-- ── RIGHT MAIN: Tabs + Feed ── -->
      <div style="overflow-y:auto;padding:0 0 40px">

        <!-- Focus section (scheduled upcoming) -->
        ${scheduledActs.length>0?`<div style="padding:14px 20px 0">
          <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">
            Focus <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          ${scheduledActs.slice(0,3).map(act=>`<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:13px;font-weight:600;color:#92400e">${act.text.split('\n')[0]}</div>
              <div style="font-size:12px;color:#b45309;margin-top:2px">📅 ${act.date} ${act.time||''} · ${act.duration?act.duration+'min':''}</div>
            </div>
            <button onclick="toggleActivityDone('${entityId}','${act.id}','${entityType}')" style="font-size:11px;padding:3px 10px;border:1px solid #fcd34d;border-radius:20px;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600;white-space:nowrap">Mark done</button>
          </div>`).join('')}
        </div>`:''}

        <!-- Tab bar -->
        <div style="display:flex;border-bottom:1px solid #e5e7eb;background:#fff;position:sticky;top:0;z-index:10">
          ${TABS.map(t=>`<button onclick="detailTab='${t.id}';renderPage()" style="display:flex;align-items:center;gap:5px;padding:11px 16px;border:none;border-bottom:2px solid ${detailTab===t.id?'#1a1a1a':'transparent'};background:none;font-size:13px;font-weight:${detailTab===t.id?'600':'400'};color:${detailTab===t.id?'#1a1a1a':'#6b7280'};cursor:pointer;font-family:inherit;white-space:nowrap">${t.icon} ${t.label}</button>`).join('')}
          <div style="flex:1"></div>
          <button onclick="openScheduleModal('${entityId}','${entityType}','call')" class="btn-r" style="font-size:12px;margin:8px 16px 8px auto;padding:5px 12px;align-self:center">+ Activity</button>
        </div>

        <!-- Inline form -->
        <div style="background:#fff;border-bottom:1px solid ${detailTab==='activity'?'transparent':'#e5e7eb'}">
          ${inlineForm}
          ${detailTab==='activity' ? renderInlineMapScheduler(entityId, entityType) : ''}
        </div>

        <!-- History header -->
        <div style="padding:14px 20px 8px;display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:#374151">History</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <span style="font-size:12px;color:#9ca3af">${activities.length} item${activities.length!==1?'s':''}</span>
        </div>

        <!-- History feed -->
        <div style="background:#fff;border-radius:0;margin:0 0 16px">
          ${historyItems}
        </div>

        <!-- Gmail threads (if contact has email) -->
        ${contact && contact.email ? renderGmailInbox(contact.email) : ''}

        <!-- Calendar -->
        ${renderCalendarWidget(entityId, entityType, contact ? contact.email : '')}

      </div>
    </div>
  </div>
  ${schedActivityModal ? renderScheduleModal() : ''}
  ${gmailComposerOpen ? renderGmailComposer() : ''}
  ${renderCalendarCreateModal()}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTITY FILES (deals / leads / contacts) — localStorage + Supabase mirror
// Mirrors the job-files pattern (getJobFiles / addJobFile / removeJobFile) so
// every detail-view Files tab behaves the same.
// Caveat: base64 files in localStorage share the ~5 MB per-domain quota. For
// heavier usage, graduate this to Supabase Storage and keep only URLs here.
// ══════════════════════════════════════════════════════════════════════════════
function getEntityFiles(entityType, entityId) {
  try { return JSON.parse(localStorage.getItem('spartan_files_'+entityType+'_'+entityId)||'[]'); }
  catch(e) { return []; }
}
function saveEntityFiles(entityType, entityId, files) {
  localStorage.setItem('spartan_files_'+entityType+'_'+entityId, JSON.stringify(files));
}
function addEntityFile(entityType, entityId, name, dataUrl) {
  var files = getEntityFiles(entityType, entityId);
  var user = getCurrentUser() || {name:'Admin'};
  files.push({
    id:'file_'+Date.now(),
    name:name,
    dataUrl:dataUrl,
    size: dataUrl ? dataUrl.length : 0,
    uploadedBy:user.name,
    uploadedAt:new Date().toISOString()
  });
  saveEntityFiles(entityType, entityId, files);
  if (typeof _sb !== 'undefined' && _sb) {
    try { dbInsert('entity_files', {entity_type:entityType, entity_id:entityId, name:name, data_url:dataUrl, uploaded_by:user.name}); } catch(e) {}
  }
  // Log to activity timeline so the History pane shows the upload.
  saveActivityToEntity(entityId, entityType, {
    id:'a'+Date.now(), type:'file',
    text:'File uploaded: '+name,
    date:new Date().toISOString().slice(0,10),
    by:user.name, done:false, dueDate:''
  });
  addToast('Uploaded: '+name, 'success');
}
function removeEntityFile(entityType, entityId, fileId) {
  var files = getEntityFiles(entityType, entityId);
  var f = files.find(function(x){return x.id===fileId;});
  saveEntityFiles(entityType, entityId, files.filter(function(x){return x.id!==fileId;}));
  if (f) addToast('Removed: '+f.name, 'warning');
  renderPage();
}
function handleEntityFileUpload(entityType, entityId, input) {
  if (!input.files || !input.files.length) return;
  var remaining = input.files.length;
  Array.from(input.files).forEach(function(file){
    var reader = new FileReader();
    reader.onload = function(e){
      addEntityFile(entityType, entityId, file.name, e.target.result);
      remaining--;
      if (remaining === 0) renderPage();
    };
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB FORM RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function renderTabForm(entityId, entityType, tab, contact) {
  const emailTo = contact ? (contact.email||'') : '';
  const phone   = contact ? (contact.phone||'') : '';
  const name    = contact ? (contact.fn+' '+contact.ln) : '';

  // ── Notes tab ────────────────────────────────────────────────────────────
  if (tab === 'notes') {
    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <textarea id="tabInput_${entityId}" class="inp" rows="3"
        placeholder="Write a note… (supports @mentions)"
        style="font-size:13px;resize:vertical;min-height:70px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;line-height:1.5"
        onkeydown="if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){saveTabActivity('${entityId}','${entityType}','note');event.preventDefault();}"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:11px;color:#9ca3af">Cmd+Enter to save</span>
        <button onclick="saveTabActivity('${entityId}','${entityType}','note')" class="btn-r" style="font-size:12px;padding:5px 18px">Save note</button>
      </div>
    </div>`;
  }

  // ── Activity tab — Pipedrive-style: type picker + schedule form ───────────
  if (tab === 'activity') {
    const ATYPES = getPickableActivityTypes();
    const today = new Date().toISOString().slice(0,10);
    const nowHr = String(new Date().getHours()).padStart(2,'0');
    const nowMin = String(Math.ceil(new Date().getMinutes()/30)*30%60).padStart(2,'0');
    const nowTime = nowHr+':'+nowMin;

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <!-- Activity type selector -->
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        ${ATYPES.map(t=>`<button id="atype_${entityId}_${t.id}"
          onclick="document.querySelectorAll('[id^=atype_${entityId}_]').forEach(b=>{b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#e5e7eb';});this.style.background='#fff5f6';this.style.color='#c41230';this.style.borderColor='#c41230';document.getElementById('atype_hidden_${entityId}').value='${t.id}'"
          style="display:flex;align-items:center;gap:5px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;background:#fff;color:#6b7280;transition:all .15s">
          ${t.icon} ${t.label}
        </button>`).join('')}
      </div>
      <input type="hidden" id="atype_hidden_${entityId}" value="call">

      <!-- Title + quick time -->
      <input id="atitle_${entityId}" class="inp" placeholder="Activity subject…" style="font-size:13px;margin-bottom:8px">

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Due date</label>
          <input type="date" id="adate_${entityId}" value="${today}" class="inp" style="font-size:12px;padding:5px 8px">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Time</label>
          <input type="time" id="atime_${entityId}" value="${nowTime}" class="inp" style="font-size:12px;padding:5px 8px">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Duration</label>
          <select id="adur_${entityId}" class="sel" style="font-size:12px;padding:5px 8px">
            <option value="15">15 min</option>
            <option value="30" selected>30 min</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hrs</option>
            <option value="120">2 hours</option>
          </select>
        </div>
      </div>

      <textarea id="tabInput_${entityId}" class="inp" rows="2" placeholder="Notes (optional)…"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:10px"></textarea>

      <!-- Bottom actions -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <button onclick="openScheduleWithMap('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:6px">
          📅 Open full schedule modal
        </button>
        <div style="display:flex;gap:6px">
          <button onclick="saveActivityFromTab('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Save activity</button>
        </div>
      </div>
    </div>`;
  }

  // ── Call tab ──────────────────────────────────────────────────────────────
  if (tab === 'call') {
    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <!-- Contact info bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:12px">
        <div>
          <div style="font-size:13px;font-weight:600">${name||'Contact'}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:1px">${phone||'No phone on file'}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${phone?`<a href="tel:${phone}" style="background:#22c55e;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px">📞 Call</a>`:''}
          ${phone?`<a href="https://wa.me/${phone.replace(/\s/g,'')}" target="_blank" style="background:#25d366;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px">💬 WhatsApp</a>`:''}
        </div>
      </div>
      <!-- Call outcome -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Outcome</label>
          <select id="callOutcome_${entityId}" class="sel" style="font-size:12px">
            <option>Answered</option>
            <option>No answer</option>
            <option>Voicemail left</option>
            <option>Callback requested</option>
            <option>Wrong number</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Duration</label>
          <input id="callDur_${entityId}" class="inp" placeholder="e.g. 5 min" style="font-size:12px;padding:5px 8px">
        </div>
      </div>
      <textarea id="tabInput_${entityId}" class="inp" rows="3" placeholder="Call notes…"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:10px"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <button onclick="openScheduleWithMap('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:5px">📅 Schedule follow-up</button>
        <button onclick="saveCallLog('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Log call</button>
      </div>
    </div>`;
  }

  // ── Email tab ─────────────────────────────────────────────────────────────
  if (tab === 'email') {
    const connected = getState().gmailConnected;
    // Top 5 templates as quick-apply chips; rest available via "More…" picker.
    const allTpls = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
    const topTpls = allTpls.slice(0, 5);
    // Custom merge fields available for this entity (includes deal-from-lead).
    const customFields = (typeof getEntityCustomMergeFields === 'function') ? getEntityCustomMergeFields(entityId, entityType) : [];
    const standardFields = (typeof MERGE_FIELDS !== 'undefined') ? MERGE_FIELDS : [];
    // Pull any in-progress draft (template applied + unsent, or mid-typing)
    // so re-renders don't wipe it. Kept per-entity.
    const _draft = (typeof _getInlineEmailDraft === 'function') ? _getInlineEmailDraft(entityId) : { subject:'', body:'' };

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      ${!connected ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;margin-bottom:12px">
        <div style="font-size:24px;margin-bottom:6px">📧</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Connect Gmail to send emails</div>
        <!-- Call OAuth directly so the popup opens over the current lead/deal.
             Don't navigate to Settings — detail IDs would override page:'settings'. -->
        <button onclick="gmailConnect()" class="btn-r" style="font-size:12px;margin-top:6px">Connect Gmail →</button>
      </div>` : ''}

      <!-- Template chips — click to fill subject + body with merge-resolved content -->
      ${allTpls.length > 0 ? `
      <div style="padding:8px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">📋 Apply template</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${topTpls.map(t => `<button onclick="applyEmailTemplateInline('${t.id}','${entityId}','${entityType}')"
            style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600"
            onmouseover="this.style.background='#fffbeb'" onmouseout="this.style.background='#fff'"
            title="${(t.subject||'').replace(/"/g,'&quot;')}">${t.name}</button>`).join('')}
          ${allTpls.length > 5 ? `<button onclick="openTemplatePickerInline('${entityId}','${entityType}')" style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px dashed #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e">More… (${allTpls.length - 5})</button>` : ''}
        </div>
      </div>` : ''}

      <input id="emailTo_${entityId}" class="inp" value="${emailTo}" placeholder="To: email@example.com" style="font-size:13px;margin-bottom:6px">
      <input id="emailSubj_${entityId}" class="inp" value="${_escAttr(_draft.subject)}" oninput="setInlineEmailDraftField('${entityId}','subject',this.value)" placeholder="Subject…" style="font-size:13px;margin-bottom:6px">
      <textarea id="tabInput_${entityId}" class="inp" rows="4" placeholder="Write your email…" oninput="setInlineEmailDraftField('${entityId}','body',this.value)"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px">${_escText(_draft.body)}</textarea>

      <!-- Insert-field dropdown. Custom fields first (with captured values shown),
           then standard merge fields. Selecting inserts {{key}} at the cursor. -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <select id="mergeInsert_${entityId}" onchange="insertMergeFieldInline('${entityId}', this.value); this.value=''"
          class="sel" style="font-size:11px;padding:4px 8px;max-width:260px">
          <option value="">{{ }} Insert field…</option>
          ${customFields.length > 0 ? `<optgroup label="From web enquiry / custom fields">
            ${customFields.map(f => {
              const hasVal = f.value !== undefined && f.value !== null && f.value !== '';
              const preview = hasVal ? ' — ' + String(f.value).slice(0, 20) : ' (empty)';
              return `<option value="${f.key}">${f.label}${preview}</option>`;
            }).join('')}
          </optgroup>` : ''}
          <optgroup label="Standard fields">
            ${standardFields.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
          </optgroup>
        </select>
        <span style="font-size:11px;color:#9ca3af">Tokens resolve on Log email / Send</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center">
        <button onclick="emailFromEntityTab('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:5px">↗ Open in full composer</button>
        <button onclick="saveEmailLog('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Log email</button>
      </div>
    </div>`;
  }

  // ── Files tab ─────────────────────────────────────────────────────────────
  if (tab === 'files') {
    var files = getEntityFiles(entityType, entityId);
    var listHtml = files.length === 0
      ? '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">No files yet</div>'
      : '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px">'
        + '<thead><tr>'
        + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Name</th>'
        + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Uploaded By</th>'
        + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Date</th>'
        + '<th style="padding:6px;border-bottom:1px solid #e5e7eb"></th>'
        + '</tr></thead><tbody>'
        + files.map(function(f){
            return '<tr>'
              + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6"><a href="'+f.dataUrl+'" target="_blank" download="'+f.name+'" style="color:#c41230;text-decoration:none;font-weight:600">📎 '+f.name+'</a></td>'
              + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280">'+(f.uploadedBy||'—')+'</td>'
              + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280">'+new Date(f.uploadedAt).toLocaleDateString('en-AU')+'</td>'
              + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right">'
              + '<button onclick="if(confirm(\'Remove this file?\'))removeEntityFile(\''+entityType+'\',\''+entityId+'\',\''+f.id+'\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:14px">🗑</button>'
              + '</td></tr>';
          }).join('')
        + '</tbody></table>';

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <label style="display:block;border:2px dashed #e5e7eb;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#fafafa"
        onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fafafa'">
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
          style="display:none"
          onchange="handleEntityFileUpload('${entityType}','${entityId}',this)">
        <div style="font-size:28px;margin-bottom:8px">📎</div>
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">Drop files here or click to upload</div>
        <div style="font-size:11px;color:#9ca3af">PDF, images, documents</div>
      </label>
      ${listHtml}
    </div>`;
  }

  return '<div style="padding:16px;color:#9ca3af;font-size:13px">Select a tab above</div>';
}



// ── Save activity from the structured activity tab ────────────────────────────
function saveActivityFromTab(entityId, entityType) {
  const type    = document.getElementById('atype_hidden_'+entityId)?.value || 'call';
  const title   = document.getElementById('atitle_'+entityId)?.value.trim() || '';
  const date    = document.getElementById('adate_'+entityId)?.value || new Date().toISOString().slice(0,10);
  const time    = document.getElementById('atime_'+entityId)?.value || '09:00';
  const dur     = document.getElementById('adur_'+entityId)?.value || '30';
  const notes   = document.getElementById('tabInput_'+entityId)?.value.trim() || '';
  const text    = title || (type.charAt(0).toUpperCase()+type.slice(1));
  const fullText = [text, notes].filter(Boolean).join('\n');
  const calLink = buildGCalURL(text, date, time, parseInt(dur), notes);

  saveActivityToEntity(entityId, entityType, {
    id: 'a'+Date.now(), type, text: fullText,
    subject: title || type,
    date, time, duration: parseInt(dur),
    by: (getCurrentUser()||{name:'Admin'}).name, done: false, dueDate: date,
    calLink, scheduled: true,
  });

  // Meetings also need a map pin. Calls / notes / emails / tasks stay
  // activity-only — they're not location-bound. Mirrors saveScheduledActivity
  // (~line 1634) so both entry points behave identically.
  if (type === 'meeting') {
    const entity = entityType === 'deal' ? getState().deals.find(x => x.id === entityId) :
                   entityType === 'lead' ? getState().leads.find(x => x.id === entityId) : null;
    if (entity) {
      const repName = entityType === 'deal' ? entity.rep : entity.owner;
      const branch  = entity.branch || 'VIC';
      const rep = REP_BASES.find(r => r.name === repName) || REP_BASES[0];
      const coords = getSuburbCoords(entity.suburb || '', branch);
      MOCK_APPOINTMENTS.push({
        id: 'ap_'+Date.now(), rep: rep.name, repCol: rep.col,
        date, time,
        client: entityType === 'deal' ? (entity.title || 'Deal')
                                      : ((entity.fn || '') + ' ' + (entity.ln || '')).trim(),
        suburb: entity.suburb || '',
        lat: coords.lat, lng: coords.lng,
        type: text, status: 'Confirmed',
      });
      saveAppointments();
    }
  }

  // Clear form
  const titleEl = document.getElementById('atitle_'+entityId);
  const notesEl = document.getElementById('tabInput_'+entityId);
  if (titleEl) titleEl.value = '';
  if (notesEl) notesEl.value = '';
  detailTab = 'activity';
  addToast((type.charAt(0).toUpperCase()+type.slice(1))+' scheduled for '+date+' at '+time, 'success');
  renderPage();
}

// ── Open email from entity tab using full composer ────────────────────────────
function emailFromEntityTab(entityId, entityType) {
  const to   = document.getElementById('emailTo_'+entityId)?.value.trim()||'';
  const subj = document.getElementById('emailSubj_'+entityId)?.value.trim()||'';
  const body = document.getElementById('tabInput_'+entityId)?.value.trim()||'';
  // Resolve merge tokens so the composer opens with rendered text, not raw {{…}}.
  let subjResolved = subj, bodyResolved = body;
  if (typeof buildMergeContext === 'function' && typeof emailFillTemplate === 'function') {
    const ctx = buildMergeContext(entityId, entityType);
    const filled = emailFillTemplate({ subject: subj, body: body }, ctx);
    subjResolved = filled.subject;
    bodyResolved = filled.body;
  }
  const did = entityType==='deal' ? entityId : null;
  const cid = entityType==='contact' ? entityId : null;
  const lid = entityType==='lead' ? entityId : null;
  // Hand off to the full composer — clear the inline draft since the composer
  // now owns this email's content.
  clearInlineEmailDraft(entityId);
  emailOpenCompose(to, '', subjResolved, bodyResolved, did, cid, lid, null, null);
  setState({page:'email'});
}

// Per-entity email draft map. The inline <input>/<textarea> in renderTabForm
// have no value= binding in the HTML, so a re-render (e.g. the addToast below
// firing setState → renderPage → innerHTML rebuild) wipes anything written to
// .value programmatically. Stashing the draft here lets the renderer
// re-populate the inputs' value/content on every render.
var _inlineEmailDrafts = {}; // { [entityId]: {subject, body} }
function _getInlineEmailDraft(entityId) {
  return _inlineEmailDrafts[entityId] || { subject: '', body: '' };
}
function setInlineEmailDraftField(entityId, field, value) {
  var d = _inlineEmailDrafts[entityId] || { subject: '', body: '' };
  d[field] = value;
  _inlineEmailDrafts[entityId] = d;
}
function clearInlineEmailDraft(entityId) { delete _inlineEmailDrafts[entityId]; }

// HTML-escape for use inside attribute values (subject input's `value=`).
function _escAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
// HTML-escape for text content inside <textarea>...</textarea>.
function _escText(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Apply a template to the inline Email tab — resolves merge tokens for this
// entity's context (including custom fields from the originating lead) and
// fills the Subject + Body inputs. Persists to the draft store so the values
// survive the re-render that addToast triggers via setState.
function applyEmailTemplateInline(templateId, entityId, entityType) {
  const all = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
  const tpl = all.find(function(t){ return t.id === templateId; });
  if (!tpl) { addToast('Template not found', 'error'); return; }
  const ctx = buildMergeContext(entityId, entityType);
  const filled = emailFillTemplate({ subject: tpl.subject || '', body: tpl.body || '' }, ctx);
  // Stash in draft state FIRST so the upcoming render (via addToast) picks it up.
  setInlineEmailDraftField(entityId, 'subject', filled.subject);
  setInlineEmailDraftField(entityId, 'body',    filled.body);
  // Also write to the DOM right now so the user sees the change immediately,
  // before the re-render fires. The re-render will read back from the draft.
  const subjEl = document.getElementById('emailSubj_'+entityId);
  const bodyEl = document.getElementById('tabInput_'+entityId);
  if (subjEl) subjEl.value = filled.subject;
  if (bodyEl) bodyEl.value = filled.body;
  addToast('Template applied: ' + tpl.name, 'success');
}

// Insert a {{key}} merge token at the current cursor position in the body
// textarea. If focus is elsewhere, append to the end.
function insertMergeFieldInline(entityId, key) {
  if (!key) return;
  const el = document.getElementById('tabInput_'+entityId);
  if (!el) return;
  const token = '{{' + key + '}}';
  if (document.activeElement === el) {
    const start = el.selectionStart, end = el.selectionEnd;
    el.value = el.value.slice(0, start) + token + el.value.slice(end);
    const pos = start + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  } else {
    el.value = (el.value || '') + token;
    el.focus();
  }
}

// "More…" picker — shows every template in a modal so the user can pick
// beyond the top 5 chips shown inline.
function openTemplatePickerInline(entityId, entityType) {
  const all = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
  if (all.length === 0) { addToast('No templates available', 'info'); return; }
  // Group templates by category for a cleaner list.
  const byCat = {};
  all.forEach(function(t){ var c = t.category || 'Other'; (byCat[c] = byCat[c] || []).push(t); });
  const html = '<div class="modal-bg" onclick="if(event.target===this)this.remove()">' +
    '<div class="modal" style="max-height:80vh">' +
    '<div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
    '<h3 style="margin:0;font-size:15px;font-weight:700">Pick a template</h3>' +
    '<button onclick="this.closest(\'.modal-bg\').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px">×</button>' +
    '</div>' +
    '<div style="overflow-y:auto;max-height:calc(80vh - 60px);padding:8px">' +
    Object.keys(byCat).sort().map(function(cat){
      return '<div style="padding:8px 12px 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">' + cat + '</div>' +
        byCat[cat].map(function(t){
          return '<div onclick="applyEmailTemplateInline(\''+t.id+'\',\''+entityId+'\',\''+entityType+'\'); this.closest(\'.modal-bg\').remove()" ' +
            'style="padding:10px 14px;border-radius:8px;cursor:pointer" ' +
            'onmouseover="this.style.background=\'#fff5f6\'" onmouseout="this.style.background=\'\'">' +
            '<div style="font-size:13px;font-weight:600;color:#111">' + (t.name||'Untitled') + '</div>' +
            '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + (t.subject||'').slice(0, 80) + '</div>' +
            '</div>';
        }).join('');
    }).join('') +
    '</div></div></div>';
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}

// ── Open Schedule modal with map showing rep's day ────────────────────────────
function openScheduleWithMap(entityId, entityType) {
  // Pre-fill the schedule modal with activity tab data
  const type  = document.getElementById('atype_hidden_'+entityId)?.value || 'call';
  const title = document.getElementById('atitle_'+entityId)?.value.trim() || '';
  const date  = document.getElementById('adate_'+entityId)?.value || new Date().toISOString().slice(0,10);
  const time  = document.getElementById('atime_'+entityId)?.value || '09:00';
  const dur   = parseInt(document.getElementById('adur_'+entityId)?.value||'30');
  const notes = document.getElementById('tabInput_'+entityId)?.value.trim()||'';

  // Get entity location for rep matching
  const s = getState();
  let suburb = '', branch = 'VIC', repName = (getCurrentUser()||{name:'Admin'}).name;
  if (entityType==='deal') {
    const d = s.deals.find(x=>x.id===entityId);
    if (d) { suburb=d.suburb||''; branch=d.branch||'VIC'; repName=d.rep||(getCurrentUser()||{name:'Admin'}).name; }
  } else if (entityType==='lead') {
    const l = s.leads.find(x=>x.id===entityId);
    if (l) { suburb=l.suburb||''; branch=l.branch||'VIC'; repName=l.owner||(getCurrentUser()||{name:'Admin'}).name; }
  } else {
    const c = s.contacts.find(x=>x.id===entityId);
    if (c) { suburb=c.suburb||''; branch=c.branch||'VIC'; }
  }

  schedActivityModal = true;
  schedActivityData  = { type, title, date, time, duration:dur, entityId, entityType, notes, suburb, branch, repName };
  mapSelectedDate    = date;
  mapSelectedRep     = repName;
  renderPage();
}

function saveTabActivity(entityId, entityType, type) {
  const el = document.getElementById('tabInput_'+entityId);
  const text = el ? el.value.trim() : '';
  if (!text) { addToast('Write something first','error'); return; }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id:'a'+Date.now(), type,
    text,
    subject: type === 'note' ? text.slice(0,60) : null,
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name, done: false, dueDate: '',
  });
  if (el) el.value = '';
  // Stay on notes/activity tab but force re-render so timeline shows new entry
  renderPage();
  addToast(type==='note' ? 'Note saved' : type.charAt(0).toUpperCase()+type.slice(1)+' logged', 'success');
}

function saveCallLog(entityId, entityType) {
  const notesEl   = document.getElementById('tabInput_'+entityId);
  const outcomeEl = document.getElementById('callOutcome_'+entityId);
  const durEl     = document.getElementById('callDur_'+entityId);
  const notes   = notesEl   ? notesEl.value.trim() : '';
  const outcome = outcomeEl ? outcomeEl.value : '';
  const dur     = durEl     ? durEl.value : '';
  const text = [outcome&&`Outcome: ${outcome}`, dur&&`Duration: ${dur}`, notes].filter(Boolean).join('\n');
  if (!text) { addToast('Add call notes first','error'); return; }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id:'a'+Date.now(), type:'call', text,
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name, done:false, dueDate:'',
  });
  // Clear the form inputs so the next visit to the Call tab isn't pre-filled.
  if (notesEl)   notesEl.value = '';
  if (outcomeEl) outcomeEl.selectedIndex = 0;
  if (durEl)     durEl.value = '';
  // Switch to Activity + explicitly re-render in that order. Without the
  // explicit renderPage, the tab only flips when addToast below incidentally
  // triggers one (fragile — breaks if addToast's side effect ever changes).
  detailTab = 'activity';
  renderPage();
  addToast('Call logged','success');
}

function saveEmailLog(entityId, entityType) {
  const subjEl = document.getElementById('emailSubj_'+entityId);
  const bodyEl = document.getElementById('tabInput_'+entityId);
  const toEl   = document.getElementById('emailTo_'+entityId);
  const subj = subjEl ? subjEl.value.trim() : '';
  const body = bodyEl ? bodyEl.value.trim() : '';
  const to   = toEl   ? toEl.value.trim()   : '';
  if (!subj && !body) { addToast('Add subject or body','error'); return; }
  // Resolve any remaining {{tokens}} using the entity's merge context. Anything
  // typed manually after the template was applied (or entered directly) gets
  // rendered before we write to the activity history.
  let subjResolved = subj, bodyResolved = body;
  if (typeof buildMergeContext === 'function' && typeof emailFillTemplate === 'function') {
    const ctx = buildMergeContext(entityId, entityType);
    const filled = emailFillTemplate({ subject: subj, body: body }, ctx);
    subjResolved = filled.subject;
    bodyResolved = filled.body;
  }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id:'a'+Date.now(), type:'email',
    text: bodyResolved,
    subject: subjResolved || '(no subject)',
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name, done:false, dueDate:'',
  });
  // Clear inputs AND the persistent draft so next visit to the Email tab is
  // empty (otherwise the rendered `value=` would reinstate the just-sent text).
  if (subjEl) subjEl.value = '';
  if (bodyEl) bodyEl.value = '';
  clearInlineEmailDraft(entityId);
  // Explicit tab switch + render, same rationale as saveCallLog.
  detailTab = 'activity';
  renderPage();
  addToast('Email logged','success');
}

function logFileUpload(entityId, entityType, input) {
  if (!input.files?.length) return;
  const names = Array.from(input.files).map(f=>f.name).join(', ');
  saveActivityToEntity(entityId, entityType, {
    id:'a'+Date.now(), type:'file',
    text: 'Files uploaded: '+names,
    date: new Date().toISOString().slice(0,10),
    by: (getCurrentUser()||{name:'Admin'}).name, done:false, dueDate:'',
  });
  addToast(input.files.length+' file(s) uploaded','success');
}

function toggleActivityDone(entityId, actId, entityType) {
  if (entityType==='deal') {
    setState({deals:getState().deals.map(d=>{
      if(d.id!==entityId) return d;
      return {...d,activities:(d.activities||[]).map(a=>a.id===actId?{...a,done:!a.done}:a)};
    })});
  } else if (entityType==='lead') {
    setState({leads:getState().leads.map(l=>{
      if(l.id!==entityId) return l;
      return {...l,activities:(l.activities||[]).map(a=>a.id===actId?{...a,done:!a.done}:a)};
    })});
  } else {
    const ca = {...(getState().contactActivities||{})};
    ca[entityId] = (ca[entityId]||[]).map(a=>a.id===actId?{...a,done:!a.done}:a);
    setState({contactActivities:ca});
  }
}

// Legacy compatibility
function openActivityForm(dealId,type){detailTab=type==='email'?'email':type==='call'?'call':'notes';renderPage();}
function saveActivity(dealId,type){saveTabActivity(dealId,'deal','note');}
function toggleTaskDone(dealId,actId){toggleActivityDone(dealId,actId,'deal');}
function saveQuickActivity(id,type){saveTabActivity(id,type,'note');}
function saveDetailNote(id,type){saveTabActivity(id,type,'note');}
function saveDetailEmail(id,type){saveEmailLog(id,type);}
function saveDetailCall(id,type){saveCallLog(id,type);}

// ══════════════════════════════════════════════════════════════════════════════
// DEAL DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// DEAL ACTION FUNCTIONS (restored)
// ══════════════════════════════════════════════════════════════════════════════

function moveDealToStage(dealId, stageId, opts) {
  opts = opts || {};
  const {deals} = getState();
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  const pl = PIPELINES.find(p => p.id === deal.pid);
  const stage = pl ? pl.stages.find(s => s.id === stageId) : null;
  // Step 4 §1: programmatic stage change to a won stage must route through the
  // quote-selection gate unless we're being called from inside the commit path.
  if (stage && stage.isWon && !opts.skipWonGate) {
    _requestWonTransition(dealId, stageId, {source: opts.source || 'stage-change'});
    return;
  }
  const act = {
    id: 'a'+Date.now(), type:'stage',
    text: 'Stage changed to: ' + (stage ? stage.name : stageId),
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name, done:false, dueDate:'',
  };
  var _wd = (stage&&stage.isWon)?new Date().toISOString().slice(0,10):(deal.wonDate||null);
  setState({ deals: deals.map(d => d.id===dealId
    ? {...d, sid:stageId,
        won:!!(stage&&stage.isWon),
        lost:!!(stage&&stage.isLost),
        wonDate:_wd,
        activities:[act,...(d.activities||[])]}
    : d)
  });
  dbUpdate('deals', dealId, {sid:stageId, won:!!(stage&&stage.isWon), lost:!!(stage&&stage.isLost), won_date:_wd});
  dbInsert('activities', actToDb(act, 'deal', dealId));
  if (stage && stage.isWon)  { addToast('🎉 Deal Won!', 'success'); }
  if (stage && stage.isLost) { addToast('Deal marked as Not Proceeding', 'warning'); askLostReason(dealId); }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 4: WON FLOW — two-step gate
// ══════════════════════════════════════════════════════════════════════════════
// All three won entry points (drag, button, stage-change) converge on
// _requestWonTransition. It enforces:
//   • zero quotes -> error toast, abort
//   • one quote -> skip the radio modal but still require confirmation
//   • 2+ quotes -> open quote-selection modal, default to activeQuoteId
// On confirmation the single _commitWon() writes atomically through state +
// Supabase, then chains into the existing payment-method modal so the job
// creation logic in confirmDealWon keeps working.

var _pendingWonDealId = null;                  // payment-method phase (existing)
var _pendingWonQuoteSelection = null;          // {dealId, targetStageId, selectedQuoteId}
var _pendingUnwindDealId = null;               // unwind admin modal

function _findWonStageId(deal) {
  var pl = PIPELINES.find(function(p){ return p.id === deal.pid; });
  if (!pl) return null;
  var ws = (pl.stages||[]).find(function(s){ return s.isWon; });
  return ws ? ws.id : null;
}

function _findFallbackStageId(deal) {
  // First non-won non-lost stage by ord — used when preWonStageId is null on unwind.
  var pl = PIPELINES.find(function(p){ return p.id === deal.pid; });
  if (!pl) return deal.sid;
  var candidates = (pl.stages||[])
    .filter(function(s){ return !s.isWon && !s.isLost; })
    .sort(function(a,b){ return (a.ord||0) - (b.ord||0); });
  return candidates.length ? candidates[0].id : deal.sid;
}

function _requestWonTransition(dealId, targetStageId, opts) {
  opts = opts || {};
  var deal = (getState().deals || []).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  // Resolve target stage — fall back to the pipeline's won stage if caller didn't pass one.
  var resolvedStageId = targetStageId || _findWonStageId(deal);
  if (!resolvedStageId) { addToast('No won stage configured for this pipeline', 'error'); return; }

  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  if (quotes.length === 0) {
    addToast('A quote must be designed in CAD before this deal can be won', 'error');
    return;
  }
  if (quotes.length === 1) {
    // Single-quote case: skip the radio modal but still require confirmation.
    var q = quotes[0];
    var label = (q.label || 'Quote 1') + ' ($' + Math.round(q.totalPrice||0).toLocaleString()
      + ', ' + (q.frameCount||(q.projectItems||[]).length) + ' frame'
      + ((q.frameCount||(q.projectItems||[]).length)===1?'':'s') + ')';
    if (!confirm('Mark deal as Won with ' + label + '?')) return;
    _commitWon(dealId, resolvedStageId, q.id);
    return;
  }
  // 2+ quotes: default to active quote, fall back to first.
  var defaultId = (deal.activeQuoteId && quotes.some(function(q){ return q.id === deal.activeQuoteId; }))
    ? deal.activeQuoteId : quotes[0].id;
  _pendingWonQuoteSelection = { dealId: dealId, targetStageId: resolvedStageId, selectedQuoteId: defaultId };
  renderPage();
}

function selectWonQuote(quoteId) {
  if (!_pendingWonQuoteSelection) return;
  _pendingWonQuoteSelection.selectedQuoteId = quoteId;
  renderPage();
}

function cancelWonQuoteSelection() {
  _pendingWonQuoteSelection = null;
  renderPage();
}

function confirmWonQuoteSelection() {
  var pend = _pendingWonQuoteSelection;
  if (!pend || !pend.selectedQuoteId) return;
  _pendingWonQuoteSelection = null;
  _commitWon(pend.dealId, pend.targetStageId, pend.selectedQuoteId);
}

function _commitWon(dealId, targetStageId, selectedQuoteId) {
  var st0 = getState();
  var deal = (st0.deals || []).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  var selectedQuote = quotes.find(function(q){ return q.id === selectedQuoteId; });
  if (!selectedQuote) { addToast('Selected quote not found', 'error'); return; }

  // Capture the pre-won stage so unwind can restore it. If the deal is already
  // sitting on the won stage for some reason, fall back to a sensible non-won stage.
  var pl = PIPELINES.find(function(p){ return p.id === deal.pid; });
  var currentStage = pl ? (pl.stages||[]).find(function(s){ return s.id === deal.sid; }) : null;
  var preWonStageId = (currentStage && currentStage.isWon) ? _findFallbackStageId(deal) : deal.sid;

  var todayStr = new Date().toISOString().slice(0,10);
  var wonPrice = (typeof selectedQuote.totalPrice === 'number') ? selectedQuote.totalPrice : (deal.val || 0);

  // Build the new cadData mirror to match the won quote (same shape as setActiveDealQuote writes).
  var newCadData = {
    projectItems: selectedQuote.projectItems || [],
    totalPrice: selectedQuote.totalPrice || 0,
    savedAt: selectedQuote.savedAt || null,
    quoteNumber: selectedQuote.quoteNumber || '',
    projectName: (deal.cadData && deal.cadData.projectName) || deal.title || ''
  };

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal won with ' + (selectedQuote.label || 'Quote') + ' ($' + Math.round(wonPrice).toLocaleString() + ')',
    date: todayStr,
    time: new Date().toTimeString().slice(0,5),
    by: (getCurrentUser()||{name:'Admin'}).name,
    done: false, dueDate: '',
  };

  setState({
    deals: st0.deals.map(function(d){
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: selectedQuoteId,
        won: true,
        lost: false,
        wonDate: todayStr,
        sid: targetStageId,
        activeQuoteId: selectedQuoteId,
        val: wonPrice,
        preWonStageId: preWonStageId,
        cadData: newCadData,
        activities: [act, ...(d.activities||[])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    won_quote_id: selectedQuoteId,
    won: true,
    lost: false,
    won_date: todayStr,
    active_quote_id: selectedQuoteId,
    sid: targetStageId,
    val: wonPrice,
    pre_won_stage_id: preWonStageId,
    cad_data: newCadData
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  addToast('\ud83c\udf89 Deal Won!', 'success');

  // Chain into the existing payment-method modal. confirmDealWon() now only
  // needs to persist paymentMethod + create the job — the won state is already written.
  _pendingWonDealId = dealId;
  renderPage();
}

function markDealWon(dealId) {
  var deal = (getState().deals || []).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  // Step 4: route through the gate. It handles zero/one/two+ quote cases and
  // chains into the payment-method modal on confirmation.
  var wonStageId = _findWonStageId(deal);
  _requestWonTransition(dealId, wonStageId, {source:'mark-button'});
}

function confirmDealWon(paymentMethod) {
  var dealId = _pendingWonDealId;
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
  if (!dealId) return;

  // At this point _commitWon has already run — the deal is already won, at the
  // won stage, with wonQuoteId set. All that's left is persisting the payment
  // method and kicking off job creation.
  setState({ deals: getState().deals.map(function(d){ return d.id === dealId ? Object.assign({}, d, {paymentMethod: paymentMethod}) : d; }) });
  dbUpdate('deals', dealId, { payment_method: paymentMethod });
  addToast('Payment method: ' + (paymentMethod==='zip'?'Zip Money':'COD'), 'info');

  var updatedDeal = getState().deals.find(function(d){ return d.id === dealId; });
  if (updatedDeal && !updatedDeal.jobRef) {
    createJobFromWonDeal(updatedDeal, paymentMethod);
  }
}

function cancelDealWon() {
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
}

// ── Quote selection modal (Step 4 §2) ─────────────────────────────────────
function renderWonQuoteSelectionModal() {
  var pend = _pendingWonQuoteSelection;
  if (!pend) return '';
  var deal = (getState().deals||[]).find(function(d){ return d.id === pend.dealId; });
  if (!deal) return '';
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];

  var rowsHtml = quotes.map(function(q){
    var sel = q.id === pend.selectedQuoteId;
    var frameCount = (typeof q.frameCount === 'number') ? q.frameCount : (q.projectItems||[]).length;
    var savedAtStr = q.savedAt ? new Date(q.savedAt).toLocaleDateString('en-AU') : '\u2014';
    var isActive = deal.activeQuoteId === q.id;
    var rowBg = sel ? '#f0fdf4' : '#ffffff';
    var rowBorder = sel ? '#86efac' : '#e5e7eb';
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:'+rowBg+';border:1px solid '+rowBorder+';border-radius:8px;margin-bottom:8px;cursor:pointer" onclick="event.stopPropagation()">'
      + '<input type="radio" name="wonQuote" value="'+q.id+'" '+(sel?'checked':'')+' onchange="selectWonQuote(\''+q.id+'\')" style="margin-top:3px;accent-color:#c41230">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:13px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:8px">'
      +     (q.label || 'Quote')
      +     (isActive ? '<span style="font-size:9px;color:#6b7280;font-weight:500">(currently active)</span>' : '')
      +   '</div>'
      +   '<div style="font-size:12px;color:#6b7280;margin-top:3px">'+frameCount+' frame'+(frameCount===1?'':'s')+' \u00b7 $'+Math.round(q.totalPrice||0).toLocaleString()+'</div>'
      +   '<div style="font-size:11px;color:#9ca3af;margin-top:2px">Saved: '+savedAtStr
      +     '  <a href="javascript:void(0)" onclick="event.stopPropagation();viewDealQuote(\''+deal.id+'\',\''+q.id+'\')" style="color:#c41230;text-decoration:none;margin-left:10px">View design \u2192</a>'
      +   '</div>'
      + '</div>'
      + '</label>';
  }).join('');

  var canContinue = !!pend.selectedQuoteId;
  return '<div id="wonQuoteModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelWonQuoteSelection()">'
    + '<div class="modal" style="max-width:520px;padding:0;overflow:hidden">'
    +   '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    +     '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0">Which quote did the customer accept?</h3>'
    +     '<p style="color:#6b7280;font-size:12px;margin:6px 0 0">Once confirmed, this choice is locked and drives job creation.</p>'
    +   '</div>'
    +   '<div style="padding:18px 24px;max-height:60vh;overflow-y:auto">' + rowsHtml + '</div>'
    +   '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    +     '<button onclick="cancelWonQuoteSelection()" class="btn-g" style="font-size:12px">Cancel</button>'
    +     '<button onclick="confirmWonQuoteSelection()" '+(canContinue?'':'disabled')
    +       ' style="padding:7px 18px;border:none;border-radius:8px;background:'+(canContinue?'#c41230':'#e5e7eb')+';color:'+(canContinue?'#fff':'#9ca3af')
    +       ';font-size:12px;font-weight:700;cursor:'+(canContinue?'pointer':'not-allowed')+';font-family:inherit">Continue</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

// ── Unwind-won admin action (Step 4 §5) ───────────────────────────────────
function unwindDealWon(dealId) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin') { addToast('Admin only', 'error'); return; }
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  if (!deal.won) { addToast('Deal is not won', 'error'); return; }
  _pendingUnwindDealId = dealId;
  renderPage();
  // Focus the confirm input after render for a good UX.
  setTimeout(function(){
    var el = document.getElementById('unwindConfirmInput');
    if (el) el.focus();
  }, 50);
}

function cancelUnwindDealWon() {
  _pendingUnwindDealId = null;
  renderPage();
}

function confirmUnwindDealWon() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return;
  var el = document.getElementById('unwindConfirmInput');
  var typed = el ? (el.value || '') : '';
  if (typed !== 'UNWIND') { addToast('Type UNWIND exactly to confirm', 'error'); return; }

  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) { _pendingUnwindDealId = null; renderPage(); return; }
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var cu = getCurrentUser() || {name:'Admin'};

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal unwound from Won by ' + cu.name,
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    by: cu.name, done: false, dueDate: '',
  };

  setState({
    deals: getState().deals.map(function(d){
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: null,
        won: false,
        wonDate: null,
        preWonStageId: null,
        sid: restoreStageId,
        // Intentionally do NOT touch activeQuoteId or quotes[] — the rep can
        // still see what was previously won. Job (if any) is NOT deleted.
        activities: [act, ...(d.activities||[])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    sid: restoreStageId,
    won_quote_id: null,
    won: false,
    won_date: null,
    pre_won_stage_id: null
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  _pendingUnwindDealId = null;
  addToast('Deal unwound from Won', 'warning');
  renderPage();
}

function renderUnwindDealModal() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return '';
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) return '';
  var pl = PIPELINES.find(function(p){ return p.id === deal.pid; });
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var restoreStage = pl ? (pl.stages||[]).find(function(s){ return s.id === restoreStageId; }) : null;
  var restoreStageName = restoreStage ? restoreStage.name : restoreStageId;

  // Find associated job (if any) via jobRef → job.jobNumber.
  var job = null;
  if (deal.jobRef) {
    job = (getState().jobs||[]).find(function(j){ return j.jobNumber === deal.jobRef; });
  }

  var jobWarning = job
    ? '<div style="margin-top:10px;padding:10px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e">'
      + '\u26a0 Job <b>' + (job.jobNumber||'') + '</b> has already been created from this deal. '
      + 'Unwinding will NOT delete the job \u2014 you\u2019ll need to handle it manually on the Jobs page.'
      + '</div>'
    : '';

  return '<div id="unwindDealModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelUnwindDealWon()">'
    + '<div class="modal" style="max-width:480px;padding:0;overflow:hidden">'
    +   '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    +     '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0;color:#b91c1c">\u26a0 Unwind won state</h3>'
    +   '</div>'
    +   '<div style="padding:20px 24px">'
    +     '<div style="font-size:13px;color:#374151;line-height:1.5">This will clear the won quote and move the deal back to <b>' + restoreStageName + '</b>.</div>'
    +     jobWarning
    +     '<div style="margin-top:16px;font-size:12px;color:#6b7280">Type <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-weight:700;color:#b91c1c">UNWIND</code> to confirm:</div>'
    +     '<input id="unwindConfirmInput" type="text" autocomplete="off" style="margin-top:6px;width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:monospace;font-size:13px" placeholder="UNWIND">'
    +   '</div>'
    +   '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    +     '<button onclick="cancelUnwindDealWon()" class="btn-g" style="font-size:12px">Cancel</button>'
    +     '<button onclick="confirmUnwindDealWon()" style="padding:7px 18px;border:none;border-radius:8px;background:#b91c1c;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Unwind</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

function renderPaymentMethodModal() {
  return '<div id="payMethodModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelDealWon()">'
    +'<div class="modal" style="max-width:420px;padding:0;overflow:hidden">'
    +'<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;margin:0">\ud83c\udf89 Deal Won! Select Payment Method</h3>'
    +'<p style="color:#6b7280;font-size:13px;margin:6px 0 0">This determines the invoicing structure for the job.</p></div>'
    +'<div style="padding:24px;display:flex;flex-direction:column;gap:12px">'
    // COD option
    +'<div onclick="confirmDealWon(\'cod\')" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #22c55e;border-radius:12px;cursor:pointer;background:#f0fdf4" onmouseover="this.style.background=\'#dcfce7\'" onmouseout="this.style.background=\'#f0fdf4\'">'
    +'<div style="width:48px;height:48px;border-radius:12px;background:#22c55e;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">\ud83d\udcb5</div>'
    +'<div><div style="font-size:15px;font-weight:700;color:#15803d">COD \u2014 Cash on Delivery</div>'
    +'<div style="font-size:12px;color:#6b7280;margin-top:2px">Standard 4-stage invoicing: 5% deposit \u2192 45% CM \u2192 45% pre-install \u2192 5% completion</div></div></div>'
    // Zip option
    +'<div onclick="confirmDealWon(\'zip\')" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #a855f7;border-radius:12px;cursor:pointer;background:#faf5ff" onmouseover="this.style.background=\'#f3e8ff\'" onmouseout="this.style.background=\'#faf5ff\'">'
    +'<div style="width:48px;height:48px;border-radius:12px;background:#a855f7;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">ZIP</div>'
    +'<div><div style="font-size:15px;font-weight:700;color:#7c3aed">Zip Money \u2014 Finance</div>'
    +'<div style="font-size:12px;color:#6b7280;margin-top:2px">20% deposit invoice raised. Remaining 80% funded by Zip Money. Weekly cap: $20,000.</div></div></div>'
    +'</div>'
    +'<div style="padding:12px 24px;border-top:1px solid #f0f0f0;text-align:right"><button onclick="cancelDealWon()" class="btn-g" style="font-size:12px">Cancel</button></div>'
    +'</div></div>';
}

function markDealLost(dealId) {
  const {deals} = getState();
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  const pl = PIPELINES.find(p => p.id === deal.pid);
  const lostStage = pl ? pl.stages.find(s => s.isLost) : null;
  if (lostStage) {
    // moveDealToStage already surfaces the toast + prompt; don't duplicate.
    moveDealToStage(dealId, lostStage.id);
    return;
  }
  setState({ deals: deals.map(d => d.id===dealId ? {...d, won:false, lost:true, wonDate:null} : d) });
  dbUpdate('deals', dealId, {won:false, lost:true, won_date:null});
  addToast('Deal marked as Not Proceeding', 'warning');
  askLostReason(dealId);
}

// ── Lost-reason capture ──────────────────────────────────────────────────────
// Kept deliberately lightweight: a browser prompt with a numbered menu. It
// runs after a deal lands in the Lost stage (drag, button, or stage-change).
// The reason is written to deal.lostReason in local state only — DB schema
// change (adding `lost_reason` column) can follow later; this is safe to ship
// without it because the Lost Deal Reasons report just bucket-sorts whatever
// is present and groups unset deals under "Not specified".
const LOST_REASONS = ['Price','Competitor','Timing','Ghosted','Scope changed','Other'];
function askLostReason(dealId) {
  // Defer so the toast + re-render from the stage move flushes first.
  setTimeout(function(){
    try {
      const prompt_ = (typeof window !== 'undefined' && window.prompt) ? window.prompt : null;
      if (!prompt_) return;
      const menu = 'Why was this deal lost?\n\n' +
        LOST_REASONS.map((r,i)=>(i+1)+'. '+r).join('\n') +
        '\n\nEnter 1-'+LOST_REASONS.length+' (Cancel to skip):';
      const ans = prompt_(menu, '1');
      if (!ans) return;
      const idx = parseInt(ans, 10) - 1;
      const reason = LOST_REASONS[idx];
      if (!reason) { addToast('Invalid choice — reason not recorded','error'); return; }
      const {deals} = getState();
      setState({ deals: deals.map(d => d.id===dealId ? {...d, lostReason: reason} : d) });
      addToast('Lost reason: '+reason, 'info');
    } catch(err) { /* swallow — don't block the stage transition if prompt fails */ }
  }, 50);
}

// ── Create Job from Won Deal (replaces old convertDealToJob stub) ────────────
async function createJobFromWonDeal(deal, paymentMethod) {
  if (!deal || deal.jobRef) return;
  var branch = (deal.branch || 'VIC').toUpperCase();
  var cu = getCurrentUser() || {id:'system', name:'System'};
  var pm = paymentMethod || deal.paymentMethod || 'cod';

  try {
    var jobNumber = await rpcNextJobNumber(branch);
    var contact = getState().contacts.find(function(c){ return c.id === deal.cid; });

    // Step 4 §4: prefer the won quote as the source design. Fall back to the
    // cadData mirror only for legacy deals that were won before Step 4 shipped
    // AND have no quotes[]. This is the customer-agreed design, not whatever
    // happened to be mirrored last.
    var sourceQuote = null;
    if (deal.wonQuoteId && Array.isArray(deal.quotes)) {
      sourceQuote = deal.quotes.find(function(q){ return q.id === deal.wonQuoteId; }) || null;
    }
    var jobCadData, jobVal, sourceQuoteId;
    if (sourceQuote) {
      jobCadData = {
        projectItems: sourceQuote.projectItems || [],
        totalPrice:  sourceQuote.totalPrice || 0,
        savedAt:     sourceQuote.savedAt || null,
        quoteNumber: sourceQuote.quoteNumber || '',
        projectName: (deal.cadData && deal.cadData.projectName) || deal.title || ''
      };
      jobVal = sourceQuote.totalPrice || deal.val || 0;
      sourceQuoteId = sourceQuote.id;
    } else {
      jobCadData = deal.cadData || null;
      jobVal = (deal.cadData && deal.cadData.totalPrice > 0) ? deal.cadData.totalPrice : (deal.val || 0);
      sourceQuoteId = null;
    }

    var job = {
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      jobNumber: jobNumber,
      dealId: deal.id,
      contactId: deal.cid || null,
      branch: branch,
      legalEntity: JOB_LEGAL_ENTITIES[branch] || '',
      title: deal.title || '',
      val: jobVal,
      cadData: jobCadData, // Design data from the won quote (or legacy mirror)
      sourceQuoteId: sourceQuoteId, // Step 4 §4: which quote this job was built from
      cadSurveyData: null, // Survey/check measure data (added by surveyor)
      street: deal.street || '',
      suburb: deal.suburb || '',
      postcode: deal.postcode || '',
      state: {VIC:'VIC',ACT:'ACT',SA:'SA',TAS:'TAS'}[branch] || 'VIC',
      lat: null,
      lng: null,
      status: 'a_check_measure',
      statusHistory: [{status:'a_check_measure', at:new Date().toISOString(), by:cu.id, note:'Job created from Won deal'}],
      hold: false,
      holdReason: '',
      cmBookedDate: null,
      cmBookedTime: null,
      cmAssignedTo: null,
      cmCompletedAt: null,
      cmDocUrl: null,
      cmPhotos: [],
      renderWarning: false,
      accessNotes: '',
      parkingNotes: '',
      signatures: {},
      finalSignedAt: null,
      finalSignedPdfUrl: null,
      // Step 5 §2.1: init new job-side CAD lifecycle fields. Null = "not yet
      // captured" — downstream code treats null as the pre-Step-5 default.
      cadFinalData: null,
      estimatedInstallMinutes: null,
      estimatedProductionMinutes: null,
      stationTimes: null,
      finalRenderedPdfUrl: null,
      dispatchDate: null,
      installDate: null,
      installTime: null,
      installCrew: [],
      installDurationHours: null,
      installCompletedAt: null,
      paymentMethod: pm, // 'cod' or 'zip'
      invoice45Id: null,
      invoiceFinalId: null,
      orderSuffix: 'O',
      tags: [],
      notes: '',
      windows: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      createdBy: cu.id,
    };

    // Optimistic state update
    setState({ jobs: [...(getState().jobs || []), job] });

    // Persist job
    dbInsert('jobs', jobToDb(job));

    // Link back to deal via jobRef
    setState({ deals: getState().deals.map(function(d){ return d.id === deal.id ? {...d, jobRef:jobNumber} : d; }) });
    dbUpdate('deals', deal.id, { job_ref: jobNumber });

    // Log activity on the deal
    var dealAct = {
      id: 'a' + Date.now() + '_dj',
      type: 'note',
      text: '🏗️ Job ' + jobNumber + ' created from this deal',
      date: new Date().toISOString().slice(0,10),
      by: cu.name, done: false, dueDate: '',
    };
    dbInsert('activities', actToDb(dealAct, 'deal', deal.id));

    // Log activity on the job
    var jobAct = {
      id: 'a' + Date.now() + '_jc',
      type: 'note',
      text: 'Job created from Won deal: ' + deal.title + (contact ? ' — ' + contact.fn + ' ' + contact.ln : ''),
      date: new Date().toISOString().slice(0,10),
      by: cu.name, done: false, dueDate: '',
    };
    dbInsert('activities', actToDb(jobAct, 'job', job.id));

    // Push notification
    var notif = {
      id: 'n_job_' + Date.now(),
      title: '🏗️ New Job: ' + jobNumber,
      body: deal.title + ' — ready for check measure booking',
      read: false,
      to: 'jobs',
      type: 'job_created',
    };
    setState({ notifs: [notif, ...getState().notifs] });

    // Initialize 4-stage progress claims and auto-generate 5% deposit invoice
    initJobClaims(job.id, job.val, pm);
    if (pm === 'zip') {
      generateJobInvoice(job.id, 'cl_dep', 20, '20% Deposit (Zip Finance) — ' + jobNumber + ' — ' + (deal.title||''), new Date(Date.now() + 7*24*3600000).toISOString().slice(0,10));
      logJobAudit(job.id, 'Job Created', 'Created from Won deal (ZIP MONEY). 20% deposit invoice auto-generated. Remaining 80% via Zip Money.');
    } else {
      generateJobInvoice(job.id, 'cl_dep', 5, '5% Deposit — ' + jobNumber + ' — ' + (deal.title||''), new Date(Date.now() + 7*24*3600000).toISOString().slice(0,10));
      logJobAudit(job.id, 'Job Created', 'Created from Won deal (COD). 5% deposit invoice auto-generated.');
    }

    addToast('Job ' + jobNumber + ' created \u2014 5% deposit invoice sent', 'success');
    return job;
  } catch(e) {
    console.error('[jobs] createJobFromWonDeal failed:', e);
    addToast('Failed to create job — ' + (e.message || e), 'error');
    return null;
  }
}

// Legacy stub — redirects to new function
function convertDealToJob(dealId) {
  var deal = getState().deals.find(function(d){ return d.id === dealId; });
  if (deal) createJobFromWonDeal(deal);
}

function openDealPanel(did) { setState({dealDetailId:did}); }

function openNewDealModal() { setState({page:'deals',dealDetailId:null,modal:{type:'newDeal'}}); }

function renderDealDetail(){
  const {deals,contacts,dealDetailId,dealFields,dealFieldValues}=getState();
  const d=deals.find(x=>x.id===dealDetailId);
  if(!d){
    // Deal not found in state yet — may be a race with an in-flight dbInsert
    // (e.g. right after lead-to-deal conversion, the realtime echo from the
    // leads update can fire before the deals insert lands). Show a brief
    // loading state and let the next render resolve it, rather than hard-
    // bouncing back to the deals list.
    return '<div style="display:flex;align-items:center;justify-content:center;height:60vh;flex-direction:column;gap:12px;color:#6b7280"><div style="font-family:Syne,sans-serif;font-size:16px;font-weight:600">Opening deal…</div><div style="font-size:12px;color:#9ca3af">If this persists, <span style="color:#c41230;cursor:pointer;text-decoration:underline" onclick="setState({dealDetailId:null})">return to deals</span>.</div></div>';
  }
  const pl=PIPELINES.find(p=>p.id===d.pid);
  const stages=pl?pl.stages.sort((a,b)=>a.ord-b.ord):[];
  const curStage=pl?pl.stages.find(s=>s.id===d.sid):null;
  const contact=contacts.find(c=>c.id===d.cid);
  const fv=(dealFieldValues&&dealFieldValues[d.id])||{};
  const activities=getEntityActivities(d.id,'deal');
  const pct=curStage?curStage.prob:0;

  // Stage bar
  const stageBarHtml = stages.map((st,i)=>{
    const idx=stages.findIndex(s=>s.id===d.sid);
    const active=st.id===d.sid, past=i<idx;
    return `<button onclick="moveDealToStage('${d.id}','${st.id}')" style="flex:1;min-width:80px;padding:10px 6px;border:none;border-bottom:3px solid ${active?'#c41230':'transparent'};cursor:pointer;font-size:11px;font-weight:${active?700:500};font-family:inherit;background:none;color:${active?'#c41230':past?'#16a34a':'#9ca3af'};text-align:center;transition:all .15s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'">
      ${past?'✓ ':''}${st.name}<br><span style="font-size:10px;opacity:.55">${d.age||0}d</span>
    </button>`;
  }).join('');

  // LEFT SIDEBAR
  const leftSidebar = `
    <!-- Summary -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Summary</span>
      </div>

      <!-- Value -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:2px">Deal value</div>
        <div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#1a1a1a">${fmt$(getDealDisplayValue(d))}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">Weighted: ${fmt$(Math.round(getDealDisplayValue(d)*(pct/100)))} · ${pct}%</div>
      </div>

      <!-- Key fields -->
      ${[
        ['Pipeline → Stage', curStage?curStage.name:'—', curStage?curStage.col:''],
        ['Owner', d.rep, ''],
        ['Branch', d.branch, ''],
        ['Address', [d.street,d.suburb,d.postcode].filter(Boolean).join(', ')||'—', ''],
        ['Expected close', d.closeDate||'—', ''],
        ['Source', contact?contact.source:'—', ''],
      ].map(([l,v,col])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f9fafb">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:${col||'#374151'}">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Person -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Person</span>
        ${contact?`<button onclick="setState({contactDetailId:'${contact.id}',dealDetailId:null})" class="btn-g" style="font-size:11px;padding:3px 8px">View</button>`:''}
      </div>
      ${contact?`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;cursor:pointer" onclick="setState({contactDetailId:'${contact.id}',dealDetailId:null})">
        <div style="width:38px;height:38px;background:#c41230;border-radius:50%;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(contact.fn+' '+contact.ln)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#1a1a1a">${contact.fn} ${contact.ln}</div>
          ${contact.co?`<div style="font-size:12px;color:#6b7280">${contact.co}</div>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <a href="mailto:${contact.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({n:'mail2',size:13})} ${contact.email||'—'}</a>
        ${contact.email?`<button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:11px;padding:4px 10px;margin-top:4px;width:100%;justify-content:center;gap:5px">${Icon({n:'send',size:12})} Send Email</button>`:''}
        <a href="tel:${contact.phone}" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({n:'phone2',size:13})} ${contact.phone||'—'}</a>
        <div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({n:'pin',size:13})} ${[contact.street,contact.suburb,contact.state,contact.postcode].filter(Boolean).join(', ')||'No address'}</div>
      </div>`:`<div style="font-size:13px;color:#9ca3af">No contact linked</div>`}
    </div>

    <!-- Details (custom fields) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Details</span>
        <button onclick="addToast('Field editor in Settings → Custom Fields','info')" class="btn-g" style="font-size:11px;padding:3px 8px">${Icon({n:'edit',size:12})}</button>
      </div>
      ${dealFields.sort((a,b)=>a.ord-b.ord).map(field=>`
        <div style="padding:6px 0;border-bottom:1px solid #f9fafb" onclick="cfStartEdit('${d.id}','${field.id}','deal')">
          <div style="font-size:11px;color:#9ca3af;margin-bottom:2px">${field.label}</div>
          <div id="cf_${d.id}_${field.id}_display" style="font-size:13px;font-weight:500;color:#374151;cursor:pointer">${renderCFValue(field,fv[field.id])}</div>
        </div>`).join('')}
    </div>

    <!-- Invoicing -->
    ${renderDealInvoiceSection(d.id)}

    <!-- Spartan CAD Design — multi-quote (spec §3.2) -->
    ${renderDealQuoteList(d)}

    <!-- Labels -->
    <div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Labels</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${(d.tags||[contact&&contact.tags?contact.tags[0]:null]).filter(Boolean).map(t=>`<span class="tag">${t}</span>`).join('')||'<span style="font-size:12px;color:#9ca3af">+ Add label</span>'}
      </div>
    </div>
  `;

  return renderEntityDetail({
    entityType:'deal', entityId:d.id,
    title: d.title, owner: d.rep,
    stageBarHtml,
    wonLostHtml: `
      ${canEditDeal(d) ? `<button onclick="openDealEditDrawer('${d.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({n:'edit',size:12})} Edit</button>` : ''}
      ${d.jobRef?`<button onclick="setState({crmMode:'jobs',page:'jobs',jobDetailId:(getState().jobs.find(function(j){return j.jobNumber==='${d.jobRef}'})||{}).id||null})" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px;color:#15803d;border-color:#86efac;background:#f0fdf4">🏗️ Job ${d.jobRef} — View</button>`:
      `<button onclick="convertDealToJob('${d.id}')" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px">🏗️ Create Job</button>`}
      <button onclick="markDealWon('${d.id}')" style="padding:6px 16px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Won</button>
      <button onclick="markDealLost('${d.id}')" style="padding:6px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-left:6px">Not Proceeding</button>
      ${(d.won && (getCurrentUser()||{}).role === 'admin') ? `<button onclick="unwindDealWon('${d.id}')" title="Admin: reverse the won state" style="padding:5px 12px;background:transparent;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;margin-left:6px">↶ Unwind won</button>` : ''}`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({dealDetailId:null})",
    backLabel: "Pipeline",
    activities,
    contact,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAD DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

function setLeadStatus(leadId, status) {
  setState({leads: getState().leads.map(l =>
    l.id === leadId ? {...l, status} : l
  )});
  dbUpdate('leads', leadId, {status: status});
  addToast('Status set to ' + status, 'success');
}

// Claim an unassigned lead. Gated by canEditLead so only reps whose
// serviceStates cover the lead's state can take it. Logs an activity for
// the audit trail so "who picked this up" is visible on the lead.
function claimLead(leadId) {
  var u = getCurrentUser();
  if (!u) { addToast('Sign in required', 'error'); return; }
  var lead = getState().leads.find(function(l){ return l.id === leadId; });
  if (!lead) return;
  if (lead.owner) { addToast('Already owned by ' + lead.owner, 'error'); return; }
  if (!canEditLead(lead)) { addToast('Lead is outside your service states', 'error'); return; }
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'claim',
    subject: u.name + ' claimed this lead',
    text: 'Was unassigned — now owned by ' + u.name,
    by: u.name,
    date: now.toISOString().slice(0,10),
    time: now.toTimeString().slice(0,5),
    done: false,
  };
  var updated = Object.assign({}, lead, { owner: u.name });
  updated.activities = [actObj].concat(lead.activities || []);
  setState({
    leads: getState().leads.map(function(l){ return l.id === leadId ? updated : l; }),
  });
  try { dbInsert('activities', actToDb(actObj, 'lead', leadId)); } catch(e) {}
  addToast('Claimed — ' + lead.fn + ' ' + lead.ln + ' is now yours', 'success');
}


function renderLeadDetail(){
  const {leads,contacts,leadDetailId}=getState();
  const lead=leads.find(x=>x.id===leadDetailId);
  if(!lead){setState({leadDetailId:null});return renderLeads();}
  const contact=contacts.find(c=>c.email===lead.email&&lead.email);
  const activities=getEntityActivities(lead.id,'lead');
  const statusColor={New:'#3b82f6',Contacted:'#f59e0b',Qualified:'#22c55e',Unqualified:'#9ca3af',Archived:'#6b7280'};
  const col=statusColor[lead.status]||'#9ca3af';

  const leftSidebar = `
    <!-- Details -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:14px">Details</div>
      ${[
        ['Value', fmt$(getLeadDisplayValue(lead))],
        ['Status', `<span class="bdg" style="background:${col}22;color:${col};border:1px solid ${col}44">${lead.status}</span>`],
        ['Source', lead.source||'—'],
        ['Owner', lead.owner
          ? lead.owner
          : `<span class="bdg" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Unassigned</span>${canEditLead(lead)?` <button onclick="claimLead('${lead.id}')" class="btn-r" style="font-size:10px;padding:2px 8px;margin-left:6px">Claim</button>`:''}`],
        ['Branch', lead.branch||'—'],
        ['Address', [lead.street,lead.suburb,lead.state,lead.postcode].filter(Boolean).join(', ')||'—'],
        ['Created', lead.created||'—'],
      ].map(([l,v])=>`<div style="padding:7px 0;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:#374151">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Person -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px">Person</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:36px;height:36px;background:#c41230;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(lead.fn+' '+lead.ln)}</div>
        <div>
          <div style="font-size:14px;font-weight:600">${lead.fn} ${lead.ln}</div>
          ${contact?`<div style="font-size:11px;color:#16a34a">✓ In contacts</div>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${lead.email?`<a href="mailto:${lead.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({n:'mail2',size:13})} ${lead.email}</a>`:''}
        ${lead.phone?`<a href="tel:${lead.phone}" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({n:'phone2',size:13})} ${lead.phone}</a>`:''}
      ${lead.email?`<a href="mailto:${lead.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({n:'mail2',size:13})} ${lead.email}</a>`:''}
      <button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:12px;padding:5px 10px;margin-top:6px;width:100%;justify-content:center;gap:5px">${Icon({n:'send',size:12})} Send Email</button>
        ${lead.suburb?`<div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({n:'pin',size:13})} ${[lead.street,lead.suburb,lead.state,lead.postcode].filter(Boolean).join(', ')}</div>`:''}
      </div>
    </div>

    <!-- Nearby Leads (for efficient scheduling) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">\ud83d\udccd Nearby Leads</span>
        <button onclick="mapSchedulingLead='${lead.id}';setState({page:'leads'})" class="btn-g" style="font-size:10px;padding:3px 7px">Map view</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Book these on the same day to reduce driving</div>
      ${renderNearbyLeadsList(lead, 5)}
    </div>

    <!-- Spartan CAD Design — multi-quote (spec §3.2) -->
    ${renderLeadQuoteList(lead)}

    <!-- Status change -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Change Status</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${['New','Contacted','Qualified','Unqualified','Archived'].map(s=>`<button onclick="setLeadStatus('${lead.id}','${s}')" style="text-align:left;padding:8px 12px;border-radius:8px;border:1px solid ${lead.status===s?statusColor[s]||'#e5e7eb':'#e5e7eb'};background:${lead.status===s?statusColor[s]+'18':'#fff'};font-size:13px;font-weight:${lead.status===s?600:400};color:${lead.status===s?statusColor[s]||'#374151':'#374151'};cursor:pointer;font-family:inherit">${lead.status===s?'✓ ':''} ${s}</button>`).join('')}
      </div>
    </div>

    <!-- Notes -->
    ${lead.notes?`<div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Original Notes</div>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap">${lead.notes}</p>
    </div>`:''}

    ${lead.converted&&lead.dealRef?`<div style="padding:14px 16px;margin:0 16px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px">
      <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px">✓ Converted to Deal</div>
      <button onclick="setState({page:'deals',dealDetailId:'${lead.dealRef}',leadDetailId:null})" class="btn-w" style="font-size:12px;width:100%;justify-content:center">View Deal →</button>
    </div>`:''}
  `;

  return renderEntityDetail({
    entityType:'lead', entityId:lead.id,
    title: lead.fn+' '+lead.ln, owner: lead.owner,
    stageBarHtml: null,
    wonLostHtml: (canEditLead(lead) ? `<button onclick="openLeadEditDrawer('${lead.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({n:'edit',size:12})} Edit</button>` : '') + (!lead.converted ? `<button onclick="directConvertLead('${lead.id}')" class="btn-r" style="font-size:12px;padding:6px 14px">Convert to Deal →</button>` : Badge('Converted','teal')),
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({leadDetailId:null})",
    backLabel: "Leads",
    activities,
    contact: contact||{fn:lead.fn,ln:lead.ln,email:lead.email,phone:lead.phone,suburb:lead.suburb},
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTACT DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderContactDetail(){
  const {contacts,deals,leads,contactDetailId}=getState();
  const c=contacts.find(x=>x.id===contactDetailId);
  if(!c){setState({contactDetailId:null});return renderContacts();}
  const activities=getEntityActivities(c.id,'contact');
  const cDeals=deals.filter(d=>d.cid===c.id);
  const cLeads=leads.filter(l=>l.email===c.email&&c.email);

  const leftSidebar = `
    <!-- Summary -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:50px;height:50px;background:#c41230;border-radius:50%;color:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn+' '+c.ln)}</div>
        <div>
          <div style="font-size:16px;font-weight:700;font-family:Syne,sans-serif">${c.fn} ${c.ln}</div>
          ${c.co?`<div style="font-size:13px;color:#6b7280">${c.co}</div>`:''}
          <div style="margin-top:4px">${Badge(c.type,c.type==='commercial'?'purple':'blue')}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="mailto:${c.email}" style="font-size:13px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({n:'mail2',size:14})} <span>${c.email||'—'}</span></a>
        <a href="tel:${c.phone}" style="font-size:13px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({n:'phone2',size:14})} <span>${c.phone||'—'}</span></a>
        <div style="font-size:13px;color:#6b7280;display:flex;align-items:center;gap:8px">${Icon({n:'pin',size:14})} ${[c.street,c.suburb,c.state,c.postcode].filter(Boolean).join(', ')||'No address'}</div>
      </div>
    </div>

    <!-- Organisation -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Organisation</div>
      ${c.co?`
      <button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:12px;padding:6px 12px;margin-top:8px;width:100%;justify-content:center;gap:5px">${Icon({n:'send',size:12})} Send Email</button><div style="font-size:13px;font-weight:500;color:#374151">${c.co}</div>`:`<div style="font-size:12px;color:#3b82f6;cursor:pointer">+ Link an organisation</div>`}
    </div>

    <!-- Details -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Details</div>
      ${[
        ['First name', c.fn],
        ['Last name', c.ln],
        ['Company', c.co||'—'],
        ['Street', c.street||'—'],
        ['Suburb', c.suburb||'—'],
        ['State', c.state||'—'],
        ['Postcode', c.postcode||'—'],
        ['Source', c.source||'—'],
        ['Owner/Rep', c.rep||'—'],
        ['Branch', c.branch||'—'],
        ['Tags', (c.tags||[]).join(', ')||'—'],
      ].map(([l,v])=>`<div style="padding:6px 0;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:#374151">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Deals linked -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Deals (${cDeals.length})</span>
        <button onclick="setState({page:'deals',contactDetailId:null})" class="btn-g" style="font-size:11px;padding:3px 8px">+ New deal</button>
      </div>
      ${cDeals.length===0?`<div style="font-size:12px;color:#9ca3af">No deals yet</div>`:''}
      ${cDeals.map(d=>`<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="setState({dealDetailId:'${d.id}',contactDetailId:null})">
        <div style="font-size:13px;font-weight:600;color:#1a1a1a">${d.title}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
          <span style="font-size:12px;color:#9ca3af">${d.suburb||d.branch}</span>
          <span style="font-size:13px;font-weight:700">${fmt$(d.val)}</span>
        </div>
      </div>`).join('')}
    </div>

    <!-- Leads linked -->
    ${cLeads.length>0?`<div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Leads (${cLeads.length})</div>
      ${cLeads.map(l=>`<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="setState({leadDetailId:'${l.id}',contactDetailId:null})">
        <div style="font-size:13px;font-weight:600">${l.fn} ${l.ln}</div>
        <div style="font-size:12px;color:#9ca3af">${l.source} · ${fmt$(l.val)}</div>
      </div>`).join('')}
    </div>`:''}
  `;

  return renderEntityDetail({
    entityType:'contact', entityId:c.id,
    title: c.fn+' '+c.ln, owner: c.rep,
    stageBarHtml: null,
    wonLostHtml: (canEditContact(c) ? `<button onclick="openContactEditDrawer('${c.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({n:'edit',size:12})} Edit</button>` : '') + `<button onclick="setState({page:'deals',contactDetailId:null})" class="btn-r" style="font-size:12px;padding:6px 14px">+ Deal</button>`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({contactDetailId:null})",
    backLabel: "Contacts",
    activities,
    contact: c,
  });
}


function renderNewDealModal(){
  const {contacts}=getState();
  return `<div class="modal-bg" onclick="if(event.target===this)setState({modal:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Deal</h3>
        <button onclick="setState({modal:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Title *</label>
          <input class="inp" id="nd_title" placeholder="e.g. Double glazing - Full home"></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Contact *</label>
          <select class="sel" id="nd_cid"><option value="">Select contact…</option>${contacts.map(c=>`<option value="${c.id}">${c.fn} ${c.ln}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Value ($)</label>
            <input class="inp" id="nd_val" type="number" min="0" step="any" placeholder="15000">
            <div id="nd_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="nd_branch">${['VIC','ACT','SA'].map(b=>`<option>${b}</option>`).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="nd_street" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="nd_suburb" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="nd_state">${['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'].map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="nd_postcode" placeholder="3121"></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({modal:null})">Cancel</button>
        <button class="btn-r" onclick="saveNewDeal()">Create Deal</button>
      </div>
    </div>
  </div>`;
}

function saveNewDeal(){
  const title=document.getElementById('nd_title').value.trim();
  const cid=document.getElementById('nd_cid').value;
  if(!title||!cid){addToast('Title and contact are required','error');return;}
  const valEl=document.getElementById('nd_val');
  const valErr=document.getElementById('nd_val_err');
  const valV=validateDealValue(valEl.value);
  if(valErr){valErr.style.display=valV.ok?'none':'block';valErr.textContent=valV.error;}
  if(!valV.ok){addToast(valV.error,'error');return;}
  const pl=PIPELINES.find(p=>p.id===dPipeline);
  const nd={id:'d'+Date.now(),title,cid,pid:dPipeline,sid:pl.stages[0].id,val:valV.normalized,rep:(getCurrentUser()||{name:'Admin'}).name,branch:document.getElementById('nd_branch').value,street:document.getElementById('nd_street')?.value.trim()||'',suburb:document.getElementById('nd_suburb')?.value.trim()||'',state:document.getElementById('nd_state')?.value||'VIC',postcode:document.getElementById('nd_postcode')?.value.trim()||'',age:0,won:false,lost:false,wonDate:null,created:new Date().toISOString().slice(0,10),tags:[],quotes:[],activeQuoteId:null,wonQuoteId:null,activities:[{id:'a'+Date.now(),type:'created',text:'Deal created.',date:new Date().toISOString().slice(0,10),by:(getCurrentUser()||{name:'Admin'}).name,done:false,dueDate:''}]};
  setState({deals:[nd,...getState().deals],modal:null,page:'deals',dealDetailId:null});
  dbInsert('deals', dealToDb(nd));
  if (nd.activities && nd.activities[0]) dbInsert('activities', actToDb(nd.activities[0], 'deal', nd.id));
  addToast(`"${title}" created`,'success');
}

// ── Installer profiles ────────────────────────────────────────────────────────
const INSTALLER_PROFILES = [];

// ── Scheduled entries ─────────────────────────────────────────────────────────
let SCHED_ENTRIES = [
  {id:'se1', jid:'j1', instId:'i1', date:'2024-11-05', startTime:'07:00', durationH:8},
  {id:'se2', jid:'j1', instId:'i2', date:'2024-11-05', startTime:'07:00', durationH:8},
  {id:'se3', jid:'j2', instId:'i1', date:'2024-11-20', startTime:'07:30', durationH:10},
  {id:'se4', jid:'j2', instId:'i3', date:'2024-11-20', startTime:'07:30', durationH:10},
  {id:'se5', jid:'j2', instId:'i4', date:'2024-11-21', startTime:'07:30', durationH:10},
  {id:'se6', jid:'j4', instId:'i1', date:'2024-11-25', startTime:'07:30', durationH:12},
  {id:'se7', jid:'j4', instId:'i3', date:'2024-11-25', startTime:'07:30', durationH:12},
  {id:'se8', jid:'j4', instId:'i4', date:'2024-11-26', startTime:'07:30', durationH:12},
  {id:'se9', jid:'j3', instId:'i2', date:'2024-11-19', startTime:'08:00', durationH:6},
  {id:'se10',jid:'j8', instId:'i1', date:'2024-11-14', startTime:'07:00', durationH:8},
  {id:'se11',jid:'j8', instId:'i2', date:'2024-11-14', startTime:'07:00', durationH:8},
];

// ── Scheduler module state ────────────────────────────────────────────────────
let schView = 'week';        // 'week' | 'day'
let schOffset = 0;           // week offset from base date
let schDayOffset = 0;        // day offset for day view
let schInstFilter = 'all';   // installer id or 'all'
let schDragEntryId = null;   // entry being dragged (day view)
let schModalOpen = false;
let schModalData = {jid:'', date:'', startTime:'08:00', durationH:4, staffRequired:2, assignedIds:[]};

const SCH_BASE_DATE = '2024-11-18'; // Monday reference

// ── Helpers ───────────────────────────────────────────────────────────────────
function schGetWeekDays(offsetWeeks) {
  const base = new Date(SCH_BASE_DATE);
  base.setDate(base.getDate() + offsetWeeks * 7);
  return Array.from({length:5}, (_,i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function schFmtDate(d) { return d.toISOString().slice(0,10); }
function schFmtShort(d) { return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'}); }
function schFmtWeekday(d) { return d.toLocaleDateString('en-AU',{weekday:'short'}); }

function schTimeToH(t) {
  const [h,m] = t.split(':').map(Number);
  return h + (m||0)/60;
}
function schHToTime(h) {
  const hh = Math.floor(h), mm = Math.round((h-hh)*60);
  return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
}

function schGetConflicts(instId, date, startTime, durationH, excludeId) {
  const s1 = schTimeToH(startTime);
  const e1 = s1 + durationH;
  return SCHED_ENTRIES.filter(en => {
    if(en.instId !== instId || en.date !== date) return false;
    if(excludeId && en.id === excludeId) return false;
    const s2 = schTimeToH(en.startTime);
    const e2 = s2 + en.durationH;
    return s1 < e2 && e1 > s2;
  });
}

function schGetJobColor(j) {
  if(!j) return '#9ca3af';
  const st = getState().jobStatuses.find(s => s.label === j.status);
  return st ? st.col : '#9ca3af';
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
function renderSchWeek() {
  const {contacts} = getState();
  const jobs = [];
  const days = schGetWeekDays(schOffset);
  const activeInstallers = INSTALLER_PROFILES.filter(i => i.active && (schInstFilter==='all' || i.id===schInstFilter));

  const unscheduledJobs = getState().deals.filter(d => {
    if(d.won) return false;
    const hasEntry = SCHED_ENTRIES.find(e => e.jid===d.id);
    return !hasEntry;
  }).slice(0,8);

  return `
    <!-- Controls row -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h1 style="font-size:24px;font-weight:800;margin:0">Scheduler</h1>
        <div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:2px">
          ${['week','day'].map(v=>`<button onclick="schView='${v}';renderPage()" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView===v?'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)':'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase()+v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn-w" style="padding:7px" onclick="schOffset--;renderPage()">${Icon({n:'left',size:14})}</button>
        <span style="font-size:13px;font-weight:600;min-width:160px;text-align:center">${schFmtShort(days[0])} — ${schFmtShort(days[4])}</span>
        <button class="btn-w" style="padding:7px" onclick="schOffset++;renderPage()">${Icon({n:'right',size:14})}</button>
        <button class="btn-g" style="font-size:12px" onclick="schOffset=0;renderPage()">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" onchange="schInstFilter=this.value;renderPage()">
          <option value="all" ${schInstFilter==='all'?'selected':''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i=>i.active).map(i=>`<option value="${i.id}" ${schInstFilter===i.id?'selected':''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" onclick="schOpenModal()">${Icon({n:'plus',size:14})} Schedule Appointment</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start">

      <!-- Unscheduled sidebar -->
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 14px;border-bottom:1px solid #f0f0f0">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Unscheduled (${unscheduledJobs.length})</div>
        </div>
        <div style="padding:8px;max-height:500px;overflow-y:auto">
          ${unscheduledJobs.length===0?'<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">All appointments scheduled ✓</p>':''}
          ${unscheduledJobs.map(j=>{
            const c=contacts.find(x=>x.id===j.cid);
            return `<div style="padding:10px;border-radius:10px;border:1.5px dashed #e5e7eb;background:#f9fafb;margin-bottom:6px;cursor:pointer" onclick="schOpenModal('${j.id}')" onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'" onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#f9fafb'">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#c41230">${j.id.toUpperCase().slice(-6)}</div>
              <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-top:2px">${j.title?.split(' ').slice(0,4).join(' ')||j.id}</div>
              <div style="font-size:11px;color:#6b7280">${j.suburb||j.branch||''}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Resource grid -->
      <div style="overflow-x:auto">
        <div class="card" style="overflow:hidden;min-width:500px">
          <!-- Header -->
          <div style="display:grid;grid-template-columns:110px repeat(5,1fr);background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <div style="padding:10px 8px;border-right:1px solid #e5e7eb"></div>
            ${days.map(d=>`<div style="padding:10px 6px;text-align:center;border-right:1px solid #e5e7eb">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af">${schFmtWeekday(d)}</div>
              <div style="font-size:13px;font-weight:700;margin-top:1px">${schFmtShort(d)}</div>
            </div>`).join('')}
          </div>
          <!-- Installer rows -->
          ${activeInstallers.map(inst=>`
            <div style="display:grid;grid-template-columns:110px repeat(5,1fr);border-bottom:1px solid #f0f0f0">
              <div style="padding:10px 6px;border-right:1px solid #e5e7eb;background:#f9fafb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                <div style="width:30px;height:30px;border-radius:50%;background:${inst.col};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${inst.initials}</div>
                <div style="font-size:10px;color:#6b7280;text-align:center;line-height:1.3">${inst.name.split(' ')[0]}</div>
              </div>
              ${days.map(day=>{
                const ds = schFmtDate(day);
                const dayEntries = SCHED_ENTRIES.filter(e=>e.instId===inst.id&&e.date===ds);
                return `<div style="min-height:70px;border-right:1px solid #e5e7eb;padding:3px;position:relative" ondragover="event.preventDefault()" ondrop="schDropWeek('${inst.id}','${ds}')">
                  ${dayEntries.map(en=>{
                    const j=null; const c=null;
                    const col=schGetJobColor(j);
                    return `<div style="background:${col};color:#fff;border-radius:6px;padding:5px 7px;margin-bottom:3px;cursor:pointer;font-size:10px;position:relative" onclick="addToast('Deal: '+getState().deals.find(d=>d.id===\'${en.jid}\')?.title||'${en.jid}','info')" draggable="true" ondragstart="schDragEntryId='${en.id}'" ondragend="schDragEntryId=null">
                      <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${en.id.slice(-4)}</div>
                      <div style="opacity:.75">${en.startTime} · ${en.durationH}h</div>
                    </div>`;
                  }).join('')}
                  ${dayEntries.length===0?`<div style="height:100%;min-height:60px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="schOpenModal(null,'${ds}')" onmouseover="this.style.background='rgba(196,18,48,.04)'" onmouseout="this.style.background=''">
                    <span style="font-size:18px;color:#e5e7eb">+</span>
                  </div>`:''}
                </div>`;
              }).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${schModalOpen ? renderSchModal() : ''}
  `;
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────
function renderSchDay() {
  const {contacts} = getState();
  const jobs = [];
  const base = new Date(SCH_BASE_DATE);
  base.setDate(base.getDate() + schDayOffset);
  const dateStr = schFmtDate(base);
  const dateLabel = base.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
  const activeInstallers = INSTALLER_PROFILES.filter(i => i.active && (schInstFilter==='all' || i.id===schInstFilter));

  const HOURS = Array.from({length:27}, (_,i) => 6 + i*0.5); // 6:00 to 19:30 in 30min slots
  const TOTAL_H = 13; // 6am to 7pm
  const PX_PER_H = 64;
  const GRID_H = TOTAL_H * PX_PER_H;

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <h1 style="font-size:24px;font-weight:800;margin:0">Scheduler</h1>
        <div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:2px">
          ${['week','day'].map(v=>`<button onclick="schView='${v}';renderPage()" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView===v?'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)':'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase()+v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn-w" style="padding:7px" onclick="schDayOffset--;renderPage()">${Icon({n:'left',size:14})}</button>
        <span style="font-size:13px;font-weight:600;min-width:200px;text-align:center">${dateLabel}</span>
        <button class="btn-w" style="padding:7px" onclick="schDayOffset++;renderPage()">${Icon({n:'right',size:14})}</button>
        <button class="btn-g" style="font-size:12px" onclick="schDayOffset=0;renderPage()">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" onchange="schInstFilter=this.value;renderPage()">
          <option value="all" ${schInstFilter==='all'?'selected':''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i=>i.active).map(i=>`<option value="${i.id}" ${schInstFilter===i.id?'selected':''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" onclick="schOpenModal(null,'${dateStr}')">${Icon({n:'plus',size:14})} Schedule</button>
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div style="display:grid;grid-template-columns:60px ${activeInstallers.map(()=>'1fr').join(' ')}">
        <!-- Header -->
        <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:10px 6px"></div>
        ${activeInstallers.map(inst=>`<div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:10px 6px;text-align:center">
          <div style="width:28px;height:28px;border-radius:50%;background:${inst.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">${inst.initials}</div>
          <div style="font-size:11px;font-weight:600;color:#374151">${inst.name.split(' ')[0]}</div>
        </div>`).join('')}

        <!-- Time grid body -->
        <div style="position:relative;border-right:1px solid #e5e7eb">
          ${HOURS.map(h=>`<div style="height:${PX_PER_H/2}px;border-bottom:1px solid #f0f0f0;padding:2px 4px;display:flex;align-items:flex-start">
            ${Number.isInteger(h)?`<span style="font-size:10px;color:#9ca3af;font-weight:600">${String(h).padStart(2,'0')}:00</span>`:''}
          </div>`).join('')}
        </div>

        ${activeInstallers.map(inst=>{
          const dayEntries = SCHED_ENTRIES.filter(e=>e.instId===inst.id&&e.date===dateStr);
          return `<div style="position:relative;border-right:1px solid #e5e7eb;height:${GRID_H}px;background:#fafafa">
            ${HOURS.map(h=>`<div style="position:absolute;top:${(h-6)*PX_PER_H}px;left:0;right:0;height:${PX_PER_H/2}px;border-bottom:1px solid ${Number.isInteger(h)?'#e5e7eb':'#f3f4f6'}" ondragover="event.preventDefault()" ondrop="schDropDay('${inst.id}','${dateStr}',${h})"></div>`).join('')}
            ${dayEntries.map(en=>{
              const col = '#c41230';
              const top = (schTimeToH(en.startTime)-6)*PX_PER_H;
              const height = Math.max(en.durationH*PX_PER_H-4, 20);
              return `<div draggable="true"
                ondragstart="schDragEntryId='${en.id}'"
                ondragend="schDragEntryId=null"
                onclick="addToast('Deal: '+getState().deals.find(d=>d.id===\'${en.jid}\')?.title||'${en.jid}','info')"
                style="position:absolute;top:${top}px;left:4px;right:4px;height:${height}px;background:${col};color:#fff;border-radius:8px;padding:6px 8px;cursor:pointer;overflow:hidden;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.15)">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${en.id.slice(-4)}</div>

                <div style="opacity:.85">${en.startTime} – ${schHToTime(schTimeToH(en.startTime)+en.durationH)}</div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
    ${schModalOpen ? renderSchModal() : ''}
  `;
}

// ── MAIN SCHEDULER RENDER ─────────────────────────────────────────────────────
function renderScheduler(){
  return schView==='day' ? renderSchDay() : renderSchWeek();
}

// ── DRAG HANDLERS ─────────────────────────────────────────────────────────────
function schDropWeek(instId, dateStr) {
  if(!schDragEntryId) return;
  SCHED_ENTRIES = SCHED_ENTRIES.map(e => e.id===schDragEntryId ? {...e, instId, date:dateStr} : e);
  schDragEntryId = null;
  addToast('Job rescheduled', 'success');
  renderPage();
}

function schDropDay(instId, dateStr, hour) {
  if(!schDragEntryId) return;
  const newStart = schHToTime(Math.floor(hour*2)/2); // snap to 30min
  SCHED_ENTRIES = SCHED_ENTRIES.map(e => e.id===schDragEntryId ? {...e, instId, date:dateStr, startTime:newStart} : e);
  schDragEntryId = null;
  addToast('Job rescheduled to '+newStart, 'success');
  renderPage();
}

// ── SCHEDULE JOB MODAL ────────────────────────────────────────────────────────
function schOpenModal(jid, date) {
  schModalOpen = true;
  schModalData = {
    jid: jid || '',
    date: date || SCH_BASE_DATE,
    startTime: '08:00',
    durationH: 4,
    staffRequired: 2,
    assignedIds: [],
  };
  renderPage();
}

function renderSchModal() {
  const {contacts} = getState();
  const jobs = [];
  const d = schModalData;
  const availableJobs = getState().deals.filter(d=>!d.won&&!d.lost).map(d=>({...d, jn:d.title, addr:d.suburb||d.branch||''}))

  // Availability check
  const availability = INSTALLER_PROFILES.filter(i=>i.active).map(inst => {
    const conflicts = d.date && d.startTime && d.durationH
      ? schGetConflicts(inst.id, d.date, d.startTime, parseFloat(d.durationH)||4)
      : [];
    return {inst, conflicts};
  });

  const assignedCount = d.assignedIds.length;
  const staffWarn = assignedCount > 0 && assignedCount < (parseInt(d.staffRequired)||2);

  return `<div class="modal-bg" onclick="if(event.target===this){schModalOpen=false;renderPage()}">
    <div class="modal" style="max-width:480px">
      <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Schedule Job</h3>
        <button onclick="schModalOpen=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({n:'x',size:16})}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:13px;max-height:70vh;overflow-y:auto">

        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Job</label>
          <select class="sel" style="font-size:13px" onchange="schModalData.jid=this.value;renderPage()">
            <option value="">Select job…</option>
            ${availableJobs.map(j=>{
              const c=contacts.find(x=>x.id===j.cid);
              return `<option value="${j.id}" ${d.jid===j.id?'selected':''}>${j.title||j.id} — ${j.suburb||j.branch||''}</option>`;
            }).join('')}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Date</label>
            <input class="inp" type="date" value="${d.date}" style="font-size:13px" oninput="schModalData.date=this.value;renderPage()"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Start Time</label>
            <input class="inp" type="time" value="${d.startTime}" style="font-size:13px" oninput="schModalData.startTime=this.value;renderPage()"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Duration (hours)</label>
            <input class="inp" type="number" value="${d.durationH}" min="1" max="16" step="0.5" style="font-size:13px" oninput="schModalData.durationH=parseFloat(this.value)||4;renderPage()"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Staff required</label>
            <input class="inp" type="number" value="${d.staffRequired}" min="1" max="8" style="font-size:13px" oninput="schModalData.staffRequired=parseInt(this.value)||2;renderPage()"></div>
        </div>

        <!-- Assign installers with availability check -->
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:8px">Assign Installers</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${availability.map(({inst,conflicts})=>{
              const checked = d.assignedIds.includes(inst.id);
              const hasConflict = conflicts.length > 0;
              const conflictJob = null;
              return `<label style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#f9fafb;border-radius:8px;cursor:pointer;border:1px solid ${checked?inst.col+'44':'#f0f0f0'}">
                <div style="display:flex;align-items:center;gap:10px">
                  <input type="checkbox" ${checked?'checked':''} onchange="schToggleInstaller('${inst.id}')" style="accent-color:${inst.col};width:15px;height:15px">
                  <div style="width:24px;height:24px;border-radius:50%;background:${inst.col};color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${inst.initials}</div>
                  <span style="font-size:13px;font-weight:500">${inst.name}</span>
                </div>
                ${d.date&&d.startTime?`<span style="font-size:11px;font-weight:600;${hasConflict?'color:#d97706':'color:#16a34a'}">${hasConflict?'⚠️ '+conflictJob?.jn:'✅ Available'}</span>`:''}
              </label>`;
            }).join('')}
          </div>
          ${staffWarn?`<div style="margin-top:8px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e">⚠️ ${assignedCount} assigned but ${d.staffRequired} staff required</div>`:''}
        </div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="schModalOpen=false;renderPage()">Cancel</button>
        <button class="btn-r" onclick="schSaveModal()">Schedule</button>
      </div>
    </div>
  </div>`;
}

function schToggleInstaller(instId) {
  const ids = schModalData.assignedIds;
  schModalData.assignedIds = ids.includes(instId) ? ids.filter(x=>x!==instId) : [...ids, instId];
  renderPage();
}

function schSaveModal() {
  const d = schModalData;
  if(!d.jid || !d.date || !d.startTime) { addToast('Job, date, and time are required','error'); return; }
  if(d.assignedIds.length === 0) { addToast('Assign at least one installer','error'); return; }
  d.assignedIds.forEach(instId => {
    SCHED_ENTRIES = [...SCHED_ENTRIES, {
      id: 'se'+Date.now()+instId,
      jid: d.jid,
      instId,
      date: d.date,
      startTime: d.startTime,
      durationH: parseFloat(d.durationH)||4,
    }];
  });
  schModalOpen = false;
  addToast('Job scheduled for '+d.assignedIds.length+' installer(s)','success');
  renderPage();
}

