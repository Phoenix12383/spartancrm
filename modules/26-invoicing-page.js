// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 26-invoicing-page.js
// Extracted from original index.html lines 16218-16367
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// INVOICING PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderInvoicingPage() {
  var invoices = getInvoices();
  var contacts = getState().contacts;
  var today = new Date().toISOString().slice(0,10);

  // Auto-detect overdue. Previously this saved unconditionally on every
  // render, turning one page visit into an N-invoice Supabase write storm
  // (any schema-mismatch upsert error then fired once per invoice, per
  // render, per visit). Only save when a status actually flipped.
  var overdueChanged = false;
  invoices.forEach(function(i){
    if (i.status === 'sent' && i.dueDate && i.dueDate < today) {
      i.status = 'overdue';
      overdueChanged = true;
    }
  });
  if (overdueChanged) saveInvoices(invoices);

  // Check auto-reminders
  checkAutoReminders();

  var filtered = invTab === 'all' ? invoices : invoices.filter(function(i){ return i.status === invTab; });
  filtered.sort(function(a,b){ return (b.created||'').localeCompare(a.created||''); });

  var totalOutstanding = invoices.filter(function(i){return i.status==='sent'||i.status==='overdue';}).reduce(function(s,i){return s+i.total;},0);
  var totalPaid = invoices.filter(function(i){return i.status==='paid';}).reduce(function(s,i){return s+i.total;},0);
  var overdueCount = invoices.filter(function(i){return i.status==='overdue';}).length;

  var statusCol = {draft:'#6b7280',sent:'#3b82f6',paid:'#15803d',overdue:'#dc2626',void:'#9ca3af'};
  var selectedInv = invSelectedId ? invoices.find(function(i){return i.id===invSelectedId;}) : null;

  // ── Detail panel ──
  var detailHtml = '';
  if (selectedInv) {
    var si = selectedInv;
    var existingClaims = invoices.filter(function(i){return i.dealId===si.dealId&&i.type==='progress_claim'&&i.status!=='void';});
    var totalClaimed = existingClaims.reduce(function(s,i){return s+(i.claimPercent||0);},0);

    detailHtml = '<div style="flex:1;overflow-y:auto;background:#fff">'
      +'<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">'
      +'<div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif">'+si.invoiceNumber+'</div>'
      +'<div style="font-size:13px;color:#6b7280;cursor:pointer" onclick="setState({dealDetailId:\''+si.dealId+'\',page:\'deals\'})">'+si.dealTitle+' \u2197</div>'
      +(si.type==='progress_claim'?'<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:#e0e7ff;color:#4338ca;font-weight:600;margin-top:4px;display:inline-block">Progress Claim #'+si.claimNumber+'</span>':'')
      +'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<button onclick="generateInvoicePDF(\''+si.id+'\')" class="btn-r" style="font-size:12px;gap:4px">\ud83d\udcc4 Download PDF</button>'
      +(si.status==='draft'?'<button onclick="updateInvoiceStatus(\''+si.id+'\',\'sent\')" class="btn-w" style="font-size:11px">Mark Sent</button>':'')
      +(si.status==='sent'||si.status==='overdue'?'<button onclick="updateInvoiceStatus(\''+si.id+'\',\'paid\')" class="btn-w" style="font-size:11px;color:#15803d;border-color:#86efac">\u2713 Mark Paid</button>':'')
      +(si.status!=='paid'&&si.status!=='void'?'<button onclick="sendInvoiceReminder(\''+si.id+'\',\'email\')" class="btn-w" style="font-size:11px">\u2709 Send Reminder</button>':'')
      +'<button onclick="exportToXero(\''+si.id+'\')" class="btn-w" style="font-size:11px">Xero</button>'
      +(si.status==='draft'?'<button onclick="voidInvoice(\''+si.id+'\')" class="btn-w" style="font-size:11px;color:#b91c1c">Void</button>':'')
      +'</div></div>'

      // Status row
      +'<div style="padding:14px 24px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;border-bottom:1px solid #f0f0f0;font-size:12px">'
      +'<div><span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;display:block">Status</span><span style="font-weight:700;color:'+(statusCol[si.status]||'#6b7280')+'">'+si.status.toUpperCase()+'</span></div>'
      +'<div><span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;display:block">Issued</span><span style="font-weight:600">'+si.issueDate+'</span></div>'
      +'<div><span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;display:block">Due</span><span style="font-weight:600;color:'+(si.status==='overdue'?'#dc2626':'')+'">'+si.dueDate+'</span></div>'
      +'<div><span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;display:block">Branch</span><span style="font-weight:600">'+(si.branch||'VIC')+'</span></div>'
      +'<div><span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;display:block">ABN</span><span style="font-weight:600;font-size:11px">'+(si.abn||'')+'</span></div>'
      +'</div>'

      // Progress claim section
      +(si.type==='progress_claim'?'<div style="padding:14px 24px;border-bottom:1px solid #f0f0f0;background:#f0f9ff">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:700;color:#0369a1">Progress Claims</span><span style="font-size:12px;color:#6b7280">'+Math.round(totalClaimed)+'% claimed of '+fmt$(si.dealValueIncGst)+'</span></div>'
        +'<div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;margin-bottom:8px"><div style="height:100%;background:linear-gradient(90deg,#15803d,#22c55e);border-radius:5px;width:'+Math.min(totalClaimed,100)+'%"></div></div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'
        +existingClaims.map(function(ec){var col=ec.status==='paid'?'#15803d':ec.status==='void'?'#9ca3af':'#1d4ed8'; return '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:'+col+'15;color:'+col+'">Claim #'+ec.claimNumber+': '+ec.claimPercent+'% ('+ec.status+')</span>';}).join('')
        +'</div>'
        +(si.status==='draft'?'<div style="display:flex;align-items:center;gap:10px"><span style="font-size:12px;font-weight:600;color:#374151">Claim percentage:</span><input id="claim_pct_input" type="number" step="0.5" min="0.5" max="'+(100-totalClaimed+si.claimPercent)+'" value="'+si.claimPercent+'" class="inp" style="width:80px;text-align:center;font-size:14px;font-weight:700"><span style="font-size:13px;font-weight:700">%</span><button onclick="updateClaimPercentInput(\''+si.id+'\')" class="btn-r" style="font-size:11px;padding:4px 12px">Apply</button><span style="font-size:11px;color:#6b7280">Max: '+(100-totalClaimed+si.claimPercent)+'%</span></div>':'')
        +'</div>':'')

      // Bill To + Job Ref
      +'<div style="padding:14px 24px;border-bottom:1px solid #f0f0f0;display:grid;grid-template-columns:1fr 1fr;gap:16px">'
      +'<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Bill To</div><div style="font-size:13px;font-weight:600;cursor:pointer;color:#3b82f6" onclick="setState({contactDetailId:\''+si.contactId+'\',page:\'contacts\'})">'+si.contactName+'</div>'+(si.contactEmail?'<div style="font-size:12px;color:#6b7280">'+si.contactEmail+'</div>':'')+(si.contactAddress?'<div style="font-size:12px;color:#6b7280">'+si.contactAddress+'</div>':'')+'</div>'
      +'<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">From</div><div style="font-size:12px;font-weight:600">Spartan Double Glazing Pty Ltd</div><div style="font-size:11px;color:#6b7280">'+(si.spartanAddress||'')+'</div><div style="font-size:11px;color:#6b7280">ABN: '+(si.abn||'')+'</div></div>'
      +'</div>'

      // Line items
      +'<div style="padding:14px 24px">'
      +'<table style="width:100%;border-collapse:collapse"><thead><tr>'
      +'<th style="text-align:left;font-size:10px;color:#6b7280;padding:8px 4px;border-bottom:2px solid #e5e7eb;font-weight:700;text-transform:uppercase">Description</th>'
      +'<th style="text-align:center;font-size:10px;color:#6b7280;padding:8px 4px;border-bottom:2px solid #e5e7eb;width:50px;font-weight:700">Qty</th>'
      +'<th style="text-align:right;font-size:10px;color:#6b7280;padding:8px 4px;border-bottom:2px solid #e5e7eb;width:90px;font-weight:700">Unit Price</th>'
      +'<th style="text-align:right;font-size:10px;color:#6b7280;padding:8px 4px;border-bottom:2px solid #e5e7eb;width:90px;font-weight:700">Amount</th>'
      +(si.status==='draft'?'<th style="width:30px;border-bottom:2px solid #e5e7eb"></th>':'')
      +'</tr></thead><tbody>'
      +si.lineItems.map(function(li){
        if(si.status==='draft') return '<tr><td style="padding:5px 4px"><input class="inp" id="li_desc_'+li.id+'" value="'+li.description+'" onchange="saveLineItem(\''+si.id+'\',\''+li.id+'\')" style="font-size:12px"></td><td style="padding:5px 4px"><input class="inp" id="li_qty_'+li.id+'" type="number" value="'+li.qty+'" onchange="saveLineItem(\''+si.id+'\',\''+li.id+'\')" style="font-size:12px;text-align:center;width:45px"></td><td style="padding:5px 4px"><input class="inp" id="li_price_'+li.id+'" type="number" step="0.01" value="'+li.unitPrice+'" onchange="saveLineItem(\''+si.id+'\',\''+li.id+'\')" style="font-size:12px;text-align:right;width:80px"></td><td style="padding:5px 4px;text-align:right;font-size:13px;font-weight:600">'+fmt$(li.amount)+'</td><td style="text-align:center"><button onclick="removeLineItem(\''+si.id+'\',\''+li.id+'\')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px">\u00d7</button></td></tr>';
        return '<tr><td style="padding:8px 4px;font-size:12px;border-bottom:1px solid #f3f4f6">'+li.description+'</td><td style="padding:8px 4px;text-align:center;font-size:12px;border-bottom:1px solid #f3f4f6">'+li.qty+'</td><td style="padding:8px 4px;text-align:right;font-size:12px;border-bottom:1px solid #f3f4f6">'+fmt$(li.unitPrice)+'</td><td style="padding:8px 4px;text-align:right;font-size:13px;font-weight:600;border-bottom:1px solid #f3f4f6">'+fmt$(li.amount)+'</td></tr>';
      }).join('')
      +'</tbody></table>'
      +(si.status==='draft'?'<button onclick="addLineItem(\''+si.id+'\')" class="btn-w" style="font-size:11px;margin-top:6px">+ Add Line Item</button>':'')

      // Totals
      +'<div style="display:flex;justify-content:flex-end;margin-top:14px"><div style="width:240px">'
      +'<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:#6b7280">Subtotal (ex GST)</span><span style="font-weight:600">'+fmt$(si.subtotal)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:#6b7280">GST (10%)</span><span style="font-weight:600">'+fmt$(si.gst)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:16px;border-top:2px solid #1a1a1a;margin-top:4px"><span style="font-weight:800;font-family:Syne,sans-serif">TOTAL</span><span style="font-weight:800;font-family:Syne,sans-serif;color:#c41230">'+fmt$(si.total)+'</span></div>'
      +'</div></div>'

      // Notes/Terms
      +'<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px">'
      +'<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Notes</div>'+(si.status==='draft'?'<textarea class="inp" rows="3" style="font-size:11px;resize:vertical;font-family:inherit" onchange="updateInvoiceField(\''+si.id+'\',\'notes\',this.value)">'+(si.notes||'')+'</textarea>':'<div style="font-size:11px;color:#374151;white-space:pre-wrap">'+(si.notes||'\u2014')+'</div>')+'</div>'
      +'<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Payment Terms</div>'+(si.status==='draft'?'<textarea class="inp" rows="3" style="font-size:11px;resize:vertical;font-family:inherit" onchange="updateInvoiceField(\''+si.id+'\',\'terms\',this.value)">'+(si.terms||'')+'</textarea>':'<div style="font-size:11px;color:#374151;white-space:pre-wrap">'+(si.terms||'\u2014')+'</div>')+'</div></div>'

      // Reminders
      +(si.reminders.length>0?'<div style="margin-top:14px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Reminders ('+si.reminders.length+')</div>'+si.reminders.slice(0,10).map(function(r){return '<div style="font-size:11px;color:#6b7280;padding:3px 0">\u2709 '+r.method+' \u2014 '+r.date+' '+r.time+' by '+r.by+'</div>';}).join('')+'</div>':'')
      +'<div style="margin-top:14px;display:flex;align-items:center;gap:8px"><label style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px"><input type="checkbox" '+(si.autoRemindersEnabled?'checked':'')+' onchange="updateInvoiceField(\''+si.id+'\',\'autoRemindersEnabled\',this.checked)" style="accent-color:#c41230"> Auto-send email reminders (7, 3, 1, 0 days before due)</label></div>'
      +'</div></div>';
  }

  // ── Full page ──
  return '<div style="display:flex;gap:0;margin:-24px;min-height:calc(100vh - 56px)">'
    +'<div style="width:340px;border-right:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;flex-shrink:0">'
    +'<div style="padding:14px 18px;border-bottom:1px solid #f0f0f0"><h2 style="font-size:16px;font-weight:800;margin:0;font-family:Syne,sans-serif">\ud83d\udcc4 Invoicing</h2>'
    +'<div style="font-size:12px;color:#6b7280;margin-top:2px">'+fmt$(totalPaid)+' paid \u00b7 '+fmt$(totalOutstanding)+' outstanding'+(overdueCount>0?' \u00b7 <span style="color:#dc2626;font-weight:600">'+overdueCount+' overdue</span>':'')+'</div></div>'
    +'<div style="padding:6px 12px;border-bottom:1px solid #f0f0f0;display:flex;gap:4px;flex-wrap:wrap">'
    +['all','draft','sent','paid','overdue','void'].map(function(t){ var cnt=t==='all'?invoices.length:invoices.filter(function(i){return i.status===t;}).length; return '<button onclick="invTab=\''+t+'\';renderPage()" style="padding:3px 8px;border-radius:20px;border:1px solid '+(invTab===t?'#c41230':'#e5e7eb')+';background:'+(invTab===t?'#fff5f6':'#fff')+';color:'+(invTab===t?'#c41230':'#6b7280')+';font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">'+t.charAt(0).toUpperCase()+t.slice(1)+' ('+cnt+')</button>'; }).join('')
    +'</div>'
    +'<div style="flex:1;overflow-y:auto">'
    +(filtered.length===0?'<div style="padding:40px 20px;text-align:center;color:#9ca3af"><div style="font-size:28px;margin-bottom:8px">\ud83d\udcc4</div><div style="font-size:13px">No invoices</div><div style="font-size:12px;color:#9ca3af;margin-top:4px">Create invoices from deal detail pages</div></div>':'')
    +filtered.map(function(inv){ var isSel=invSelectedId===inv.id; return '<div onclick="invSelectedId=\''+inv.id+'\';renderPage()" style="padding:12px 18px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:'+(isSel?'#fff5f6':'#fff')+';border-left:3px solid '+(isSel?'#c41230':'transparent')+'" onmouseover="this.style.background=\''+(isSel?'#fff5f6':'#f9fafb')+'\'" onmouseout="this.style.background=\''+(isSel?'#fff5f6':'#fff')+'\'">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="font-size:13px;font-weight:700">'+inv.invoiceNumber+'</span><span style="font-size:13px;font-weight:800;font-family:Syne,sans-serif">'+fmt$(inv.total)+'</span></div>'
      +'<div style="font-size:11px;color:#6b7280;margin-bottom:3px">'+inv.contactName+' \u2014 '+inv.dealTitle+'</div>'
      +'<div style="display:flex;gap:5px;align-items:center"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:'+(statusCol[inv.status]||'#6b7280')+'15;color:'+(statusCol[inv.status]||'#6b7280')+'">'+inv.status+'</span>'+(inv.type==='progress_claim'?'<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:20px;background:#e0e7ff;color:#4338ca">Claim #'+inv.claimNumber+'</span>':'')+'<span style="font-size:10px;color:#9ca3af;margin-left:auto">Due: '+inv.dueDate+'</span></div></div>'; }).join('')
    +'</div></div>'
    +'<div style="flex:1;overflow-y:auto;background:#fafafa">'
    +(selectedInv ? detailHtml : '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af"><div style="font-size:40px;margin-bottom:12px">\ud83d\udcc4</div><div style="font-size:15px;font-weight:600">Select an invoice</div><div style="font-size:13px">or create one from a deal</div></div>')
    +'</div></div>';
}

// ── Deal detail invoice section ──────────────────────────────────────────────
function renderDealInvoiceSection(dealId) {
  var invoices = getInvoices().filter(function(i){ return i.dealId === dealId; });
  var deal = getState().deals.find(function(d){ return d.id === dealId; });
  if (!deal) return '';
  var totalInvoiced = invoices.filter(function(i){return i.status!=='void';}).reduce(function(s,i){return s+i.total;},0);
  var totalPaid = invoices.filter(function(i){return i.status==='paid';}).reduce(function(s,i){return s+i.total;},0);
  var pctInvoiced = deal.val > 0 ? Math.round(totalInvoiced / deal.val * 100) : 0;

  return '<div style="padding:16px;border-bottom:1px solid #f0f0f0">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    +'<span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Invoices ('+invoices.length+')</span>'
    +'<div style="display:flex;gap:4px">'
    +'<button onclick="createInvoice(\''+dealId+'\',\'standard\')" class="btn-g" style="font-size:10px;padding:3px 7px">+ Invoice</button>'
    +'<button onclick="createInvoice(\''+dealId+'\',\'progress_claim\')" class="btn-g" style="font-size:10px;padding:3px 7px">+ Progress Claim</button>'
    +'</div></div>'
    +(invoices.length>0?'<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:3px"><span>'+pctInvoiced+'% invoiced</span><span>'+fmt$(totalPaid)+' paid of '+fmt$(deal.val)+'</span></div><div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden"><div style="height:100%;background:#15803d;border-radius:4px;width:'+Math.min(pctInvoiced,100)+'%"></div></div></div>':'')
    +invoices.map(function(inv){ var col={draft:'#6b7280',sent:'#3b82f6',paid:'#15803d',overdue:'#dc2626',void:'#9ca3af'}[inv.status]||'#6b7280'; return '<div style="padding:8px 10px;background:#f9fafb;border-radius:8px;margin-bottom:5px;cursor:pointer;border-left:3px solid '+col+'" onclick="invSelectedId=\''+inv.id+'\';setState({page:\'invoicing\'})">'
      +'<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;font-weight:600">'+inv.invoiceNumber+(inv.type==='progress_claim'?' (Claim #'+inv.claimNumber+' \u2014 '+inv.claimPercent+'%)':'')+'</span><span style="font-size:12px;font-weight:700">'+fmt$(inv.total)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:2px"><span style="color:'+col+';font-weight:600">'+inv.status+'</span><span>Due: '+inv.dueDate+'</span></div></div>'; }).join('')
    +(invoices.length===0?'<div style="font-size:12px;color:#9ca3af;text-align:center;padding:8px">No invoices yet</div>':'')
    +'</div>';
}

