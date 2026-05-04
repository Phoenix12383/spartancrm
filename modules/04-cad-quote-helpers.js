// ════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 04-cad-quote-helpers.js
// Quote management for leads and deals (renderers, active/edit/new/delete,
// PDF open). Recovered 2026-05-04 from 5d6a960^:modules/04-cad-integration.js
// after that file was rewritten (5d6a960) and then deleted (5081f3c) as part
// of the CAD-bridge rebuild. The data model (l.quotes, d.quotes,
// activeQuoteId, wonQuoteId) was never touched, so these helpers operate on
// real data; only the CAD-side launch path (°openCadDesigner°) currently
// toasts "coming soon" — once the bridge ships, the New Quote / Edit
// buttons light up automatically.
// ════════════════════════════════════════════════════════════════════════════

function getDealActiveQuote(deal) {
  if (!deal || !Array.isArray(deal.quotes) || deal.quotes.length === 0) return null;
  if (deal.activeQuoteId) {
    var found = deal.quotes.find(function(q){ return q.id === deal.activeQuoteId; });
    if (found) return found;
  }
  return deal.quotes[0];
}

// Spec §3.3: deal.val is derived from the active quote's totalPrice when quotes exist.
// Used by UI readers; aggregations (kanban totals, forecasts) continue to read d.val
// directly because the save handler writes the active quote's price back into d.val.
function getDealDisplayValue(deal) {
  var aq = getDealActiveQuote(deal);
  if (aq && typeof aq.totalPrice === 'number') return aq.totalPrice;
  return deal.val || 0;
}

function renderDealQuoteList(d) {
  var quotes = Array.isArray(d.quotes) ? d.quotes : [];
  var activeId = d.activeQuoteId || null;
  var wonId = d.wonQuoteId || null;
  // Step 4 §3: once a deal has a wonQuoteId, parts of the quote UI lock down.
  var isDealWon = !!wonId;

  var rowsHtml;
  if (quotes.length === 0) {
    rowsHtml = '<div style="font-size:12px;color:#9ca3af;padding:10px 0">No quotes yet \u2014 click "+ New Quote" to start a design.</div>';
  } else {
    rowsHtml = quotes.map(function(q) {
      var isActive = q.id === activeId;
      var isWon = wonId && q.id === wonId;
      var frameCount = (typeof q.frameCount === 'number') ? q.frameCount : (q.projectItems||[]).length;
      var savedAtStr = q.savedAt ? new Date(q.savedAt).toLocaleDateString('en-AU') : '\u2014';
      var rowBg = isActive ? '#f0fdf4' : '#ffffff';
      var rowBorder = isActive ? '#86efac' : '#e5e7eb';
      var pdfBtn = (q.pdfBase64 || q.pdf)
        ? '<button onclick="openQuotePdf(\''+d.id+'\',\''+q.id+'\')" title="Open PDF" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">\ud83d\udcc4 PDF</button>'
        : '<button disabled title="No PDF yet \u2014 CAD generates it on save (v2.0+)" style="padding:4px 8px;border:1px solid #f3f4f6;border-radius:5px;background:#f9fafb;color:#d1d5db;cursor:not-allowed;font-size:11px">\ud83d\udcc4 PDF</button>';
      var deleteBtn = isWon
        ? '<button disabled title="Cannot delete the won quote" style="padding:4px 8px;border:1px solid #f3f4f6;border-radius:5px;background:#f9fafb;color:#d1d5db;cursor:not-allowed;font-size:11px">\ud83d\uddd1 Delete</button>'
        : '<button onclick="deleteDealQuote(\''+d.id+'\',\''+q.id+'\')" title="Delete quote" style="padding:4px 8px;border:1px solid #fecaca;border-radius:5px;background:#fff;color:#b91c1c;cursor:pointer;font-size:11px">\ud83d\uddd1 Delete</button>';
      var setActiveBtn = isActive
        ? '<span style="font-size:10px;font-weight:700;color:#15803d;padding:4px 6px">\u2714 Active</span>'
        : '<button onclick="setActiveDealQuote(\''+d.id+'\',\''+q.id+'\')" title="Make this the active quote" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#6b7280">Set active</button>';
      // Step 4 §3: the won quote's Edit button becomes View (read-only CAD).
      // Non-won quotes still open in design mode even on won deals — users may
      // want to iterate on rejected quotes for records.
      var editBtn = isWon
        ? '<button onclick="viewDealQuote(\''+d.id+'\',\''+q.id+'\')" title="Open in CAD (read-only)" style="padding:4px 10px;border:1px solid #86efac;border-radius:5px;background:#f0fdf4;color:#15803d;cursor:pointer;font-size:11px;font-weight:600">\ud83d\udc41 View</button>'
        : '<button onclick="editDealQuote(\''+d.id+'\',\''+q.id+'\')" title="Open in CAD" style="padding:4px 10px;border:none;border-radius:5px;background:#c41230;color:#fff;cursor:pointer;font-size:11px;font-weight:600">\u270f Edit</button>';
      return '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;background:'+rowBg+';border:1px solid '+rowBorder+';border-radius:8px;margin-bottom:6px">'
        +  '<div style="min-width:0">'
        +    '<div style="font-size:12px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:6px">'
        +      (q.label||'Quote')
        +      (isWon ? '<span style="font-size:9px;font-weight:700;color:#15803d;background:#dcfce7;padding:1px 6px;border-radius:3px">WON</span>' : '')
        +    '</div>'
        +    '<div style="font-size:11px;color:#6b7280;margin-top:2px">'+frameCount+' frame'+(frameCount===1?'':'s')+' \u00b7 $'+Math.round(q.totalPrice||0).toLocaleString()+'</div>'
        +    '<div style="font-size:10px;color:#9ca3af;margin-top:2px">Saved: '+savedAtStr+'</div>'
        +  '</div>'
        +  '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'
        +    setActiveBtn
        +    '<div style="display:flex;gap:4px">'
        +      editBtn
        +      pdfBtn
        +      deleteBtn
        +    '</div>'
        +  '</div>'
        +'</div>';
    }).join('');
  }

  // Step 4 §3: "+ New Quote" is locked once a won quote exists.
  var newQuoteBtn = isDealWon
    ? '<button disabled title="This deal is won \u2014 quote selection is locked." style="font-size:12px;width:100%;justify-content:center;gap:6px;margin-top:8px;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;color:#9ca3af;cursor:not-allowed">+ New Quote</button>'
    : '<button onclick="newDealQuote(\''+d.id+'\')" class="btn-r" style="font-size:12px;width:100%;justify-content:center;gap:6px;margin-top:8px">+ New Quote</button>';

  return '<div style="padding:16px;border-bottom:1px solid #f0f0f0">'
    +    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    +      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">\ud83c\udfae Design \u00b7 Quotes</div>'
    +      (quotes.length > 0 ? '<span style="font-size:10px;color:#9ca3af">'+quotes.length+' quote'+(quotes.length===1?'':'s')+'</span>' : '')
    +    '</div>'
    +    rowsHtml
    +    newQuoteBtn
    +  '</div>';
}

// CRUD operations on deal.quotes[]. All of these call setState (re-renders the
// page) and dbUpdate (persists). Kept fire-and-forget for the DB; the UI is
// optimistic and matches the rest of the app's conventions.
function _dealPatch(dealId, patchFn) {
  var deals = (getState().deals || []).map(function(d) {
    if (d.id !== dealId) return d;
    var next = Object.assign({}, d);
    patchFn(next);
    return next;
  });
  setState({ deals: deals });
  var updated = deals.find(function(d){ return d.id === dealId; });
  if (updated) {
    // Persist the full multi-quote surface + the mirror so DB and memory stay in sync.
    dbUpdate('deals', dealId, {
      quotes: updated.quotes || [],
      active_quote_id: updated.activeQuoteId || null,
      won_quote_id: updated.wonQuoteId || null,
      cad_data: updated.cadData || null,
      val: updated.val || 0
    });
  }
}

function setActiveDealQuote(dealId, quoteId) {
  // Step 4 §3: if a deal is already won, switching the "active" quote must not
  // move the mirror or deal.val off the won quote — those are locked. We still
  // update activeQuoteId so the UI highlights which quote the rep is viewing.
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  var isLockedWon = !!(deal && deal.wonQuoteId);
  if (isLockedWon && quoteId !== deal.wonQuoteId) {
    _dealPatch(dealId, function(d){ d.activeQuoteId = quoteId; });
    addToast("This won't change the won quote \u2014 that's locked.", 'warning');
    return;
  }
  _dealPatch(dealId, function(d) {
    d.activeQuoteId = quoteId;
    // Spec §3.3: deal.val tracks the active quote's totalPrice while the deal is open.
    var aq = (d.quotes||[]).find(function(q){ return q.id === quoteId; });
    if (aq && typeof aq.totalPrice === 'number') d.val = aq.totalPrice;
    // Keep the cadData mirror in sync so existing readers (job creation, etc.) see the active design.
    if (aq) {
      d.cadData = {
        projectItems: aq.projectItems || [],
        totalPrice: aq.totalPrice || 0,
        savedAt: aq.savedAt || null,
        quoteNumber: aq.quoteNumber || '',
        projectName: (d.cadData && d.cadData.projectName) || d.title || ''
      };
    }
  });
  addToast('Active quote set', 'success');
}

// Step 4 §3: read-only CAD view for the won quote. Sets activeQuoteId so CAD
// opens on the right quote, then launches in 'view' mode (CAD honours this;
// older CAD builds fall back to 'design', which is still benign for read-only
// intent since no save is triggered from this path).
function viewDealQuote(dealId, quoteId) {
  _dealPatch(dealId, function(d){ d.activeQuoteId = quoteId; });
  openCadDesigner('deal', dealId, 'view');
}

function editDealQuote(dealId, quoteId) {
  _dealPatch(dealId, function(d){ d.activeQuoteId = quoteId; });
  openCadDesigner('deal', dealId, 'design');
}

function newDealQuote(dealId) {
  // Clear activeQuoteId so openCadDesigner sees null and CAD starts a blank canvas.
  // The save handler will allocate q_N+1 when CAD returns quoteId:null.
  _dealPatch(dealId, function(d){ d.activeQuoteId = null; });
  openCadDesigner('deal', dealId, 'design');
}

function deleteDealQuote(dealId, quoteId) {
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  if (deal.wonQuoteId && deal.wonQuoteId === quoteId) {
    addToast('Cannot delete the won quote', 'error');
    return;
  }
  var quote = (deal.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  if (!confirm('Delete "' + (quote.label||'this quote') + '"? This cannot be undone.')) return;

  _dealPatch(dealId, function(d) {
    d.quotes = (d.quotes||[]).filter(function(q){ return q.id !== quoteId; });
    if (d.activeQuoteId === quoteId) {
      d.activeQuoteId = d.quotes[0] ? d.quotes[0].id : null;
      // Re-sync val + cadData to the new active quote (or clear if no quotes left).
      var newActive = d.quotes[0];
      if (newActive) {
        d.val = newActive.totalPrice || d.val || 0;
        d.cadData = {
          projectItems: newActive.projectItems || [],
          totalPrice: newActive.totalPrice || 0,
          savedAt: newActive.savedAt || null,
          quoteNumber: newActive.quoteNumber || '',
          projectName: (d.cadData && d.cadData.projectName) || d.title || ''
        };
      } else {
        d.cadData = null;
      }
    }
  });
  addToast('Quote deleted', 'success');
}

function openQuotePdf(dealId, quoteId) {
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  var quote = (deal.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  var b64 = quote.pdfBase64 || quote.pdf;
  if (!b64) { addToast('No PDF on this quote yet', 'warning'); return; }
  try {
    var dataUrl = 'data:application/pdf;base64,' + b64;
    window.open(dataUrl, '_blank');
  } catch(e) { addToast('Could not open PDF', 'error'); }
}

// ── Lead-side multi-quote helpers (spec §3.1 final paragraph + §3.2) ────────
// Parallel to the deal-side helpers above. Leads have quotes[] + activeQuoteId,
// but NO wonQuoteId concept (leads aren't "won" — they convert). On conversion,
// lead.quotes is copied verbatim into the new deal (see _executeLead2Deal).

function getLeadActiveQuote(lead) {
  if (!lead || !Array.isArray(lead.quotes) || lead.quotes.length === 0) return null;
  if (lead.activeQuoteId) {
    var found = lead.quotes.find(function(q){ return q.id === lead.activeQuoteId; });
    if (found) return found;
  }
  return lead.quotes[0];
}

// Mirror of getDealDisplayValue for leads — used by the lead detail header so
// the displayed value tracks whatever quote is currently active.
function getLeadDisplayValue(lead) {
  var aq = getLeadActiveQuote(lead);
  if (aq && typeof aq.totalPrice === 'number') return aq.totalPrice;
  return lead.val || 0;
}

function renderLeadQuoteList(l) {
  var quotes = Array.isArray(l.quotes) ? l.quotes : [];
  var activeId = l.activeQuoteId || null;

  var rowsHtml;
  if (quotes.length === 0) {
    rowsHtml = '<div style="font-size:12px;color:#9ca3af;padding:10px 0">No quotes yet \u2014 click "+ New Quote" to start a preliminary design.</div>';
  } else {
    rowsHtml = quotes.map(function(q) {
      var isActive = q.id === activeId;
      var frameCount = (typeof q.frameCount === 'number') ? q.frameCount : (q.projectItems||[]).length;
      var savedAtStr = q.savedAt ? new Date(q.savedAt).toLocaleDateString('en-AU') : '\u2014';
      var rowBg = isActive ? '#f0fdf4' : '#ffffff';
      var rowBorder = isActive ? '#86efac' : '#e5e7eb';
      var pdfBtn = (q.pdfBase64 || q.pdf)
        ? '<button onclick="openLeadQuotePdf(\''+l.id+'\',\''+q.id+'\')" title="Open PDF" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">\ud83d\udcc4 PDF</button>'
        : '<button disabled title="No PDF yet \u2014 CAD generates it on save (v2.0+)" style="padding:4px 8px;border:1px solid #f3f4f6;border-radius:5px;background:#f9fafb;color:#d1d5db;cursor:not-allowed;font-size:11px">\ud83d\udcc4 PDF</button>';
      // Leads have no wonQuoteId — every quote is freely deletable.
      var deleteBtn = '<button onclick="deleteLeadQuote(\''+l.id+'\',\''+q.id+'\')" title="Delete quote" style="padding:4px 8px;border:1px solid #fecaca;border-radius:5px;background:#fff;color:#b91c1c;cursor:pointer;font-size:11px">\ud83d\uddd1 Delete</button>';
      var setActiveBtn = isActive
        ? '<span style="font-size:10px;font-weight:700;color:#15803d;padding:4px 6px">\u2714 Active</span>'
        : '<button onclick="setActiveLeadQuote(\''+l.id+'\',\''+q.id+'\')" title="Make this the active quote" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#6b7280">Set active</button>';
      return '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;background:'+rowBg+';border:1px solid '+rowBorder+';border-radius:8px;margin-bottom:6px">'
        +  '<div style="min-width:0">'
        +    '<div style="font-size:12px;font-weight:700;color:#1a1a1a">'+(q.label||'Quote')+'</div>'
        +    '<div style="font-size:11px;color:#6b7280;margin-top:2px">'+frameCount+' frame'+(frameCount===1?'':'s')+' \u00b7 $'+Math.round(q.totalPrice||0).toLocaleString()+'</div>'
        +    '<div style="font-size:10px;color:#9ca3af;margin-top:2px">Saved: '+savedAtStr+'</div>'
        +  '</div>'
        +  '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'
        +    setActiveBtn
        +    '<div style="display:flex;gap:4px">'
        +      '<button onclick="editLeadQuote(\''+l.id+'\',\''+q.id+'\')" title="Open in CAD" style="padding:4px 10px;border:none;border-radius:5px;background:#c41230;color:#fff;cursor:pointer;font-size:11px;font-weight:600">\u270f Edit</button>'
        +      pdfBtn
        +      deleteBtn
        +    '</div>'
        +  '</div>'
        +'</div>';
    }).join('');
  }

  return '<div style="padding:16px;border-bottom:1px solid #f0f0f0">'
    +    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    +      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">\ud83c\udfae Design \u00b7 Quotes</div>'
    +      (quotes.length > 0 ? '<span style="font-size:10px;color:#9ca3af">'+quotes.length+' quote'+(quotes.length===1?'':'s')+'</span>' : '')
    +    '</div>'
    +    rowsHtml
    +    '<button onclick="newLeadQuote(\''+l.id+'\')" class="btn-r" style="font-size:12px;width:100%;justify-content:center;gap:6px;margin-top:8px">+ New Quote</button>'
    +  '</div>';
}

// Lead-side patch helper. Writes through to dbUpdate('leads', ...) with the
// same snake_case keys as the leadToDb mapping — but NOT won_quote_id, because
// leads never have a won quote (it stays null in the DB).
function _leadPatch(leadId, patchFn) {
  var leads = (getState().leads || []).map(function(l) {
    if (l.id !== leadId) return l;
    var next = Object.assign({}, l);
    patchFn(next);
    return next;
  });
  setState({ leads: leads });
  var updated = leads.find(function(l){ return l.id === leadId; });
  if (updated) {
    dbUpdate('leads', leadId, {
      quotes: updated.quotes || [],
      active_quote_id: updated.activeQuoteId || null,
      cad_data: updated.cadData || null,
      val: updated.val || 0
    });
  }
}

function setActiveLeadQuote(leadId, quoteId) {
  _leadPatch(leadId, function(l) {
    l.activeQuoteId = quoteId;
    var aq = (l.quotes||[]).find(function(q){ return q.id === quoteId; });
    if (aq && typeof aq.totalPrice === 'number') l.val = aq.totalPrice;
    if (aq) {
      l.cadData = {
        projectItems: aq.projectItems || [],
        totalPrice: aq.totalPrice || 0,
        savedAt: aq.savedAt || null,
        quoteNumber: aq.quoteNumber || '',
        projectName: (l.cadData && l.cadData.projectName) || ((l.fn||'')+' '+(l.ln||'')) || ''
      };
    }
  });
  addToast('Active quote set', 'success');
}

function editLeadQuote(leadId, quoteId) {
  _leadPatch(leadId, function(l){ l.activeQuoteId = quoteId; });
  openCadDesigner('lead', leadId, 'design');
}

function newLeadQuote(leadId) {
  // Clear activeQuoteId so openCadDesigner sees null → CAD starts a blank canvas.
  // The save handler will allocate q_N+1 when CAD returns quoteId:null.
  _leadPatch(leadId, function(l){ l.activeQuoteId = null; });
  openCadDesigner('lead', leadId, 'design');
}

function deleteLeadQuote(leadId, quoteId) {
  var lead = (getState().leads||[]).find(function(l){ return l.id === leadId; });
  if (!lead) return;
  var quote = (lead.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  if (!confirm('Delete "' + (quote.label||'this quote') + '"? This cannot be undone.')) return;

  _leadPatch(leadId, function(l) {
    l.quotes = (l.quotes||[]).filter(function(q){ return q.id !== quoteId; });
    if (l.activeQuoteId === quoteId) {
      l.activeQuoteId = l.quotes[0] ? l.quotes[0].id : null;
      var newActive = l.quotes[0];
      if (newActive) {
        l.val = newActive.totalPrice || l.val || 0;
        l.cadData = {
          projectItems: newActive.projectItems || [],
          totalPrice: newActive.totalPrice || 0,
          savedAt: newActive.savedAt || null,
          quoteNumber: newActive.quoteNumber || '',
          projectName: (l.cadData && l.cadData.projectName) || ((l.fn||'')+' '+(l.ln||'')) || ''
        };
      } else {
        l.cadData = null;
      }
    }
  });
  addToast('Quote deleted', 'success');
}

function openLeadQuotePdf(leadId, quoteId) {
  var lead = (getState().leads||[]).find(function(l){ return l.id === leadId; });
  if (!lead) return;
  var quote = (lead.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  var b64 = quote.pdfBase64 || quote.pdf;
  if (!b64) { addToast('No PDF on this quote yet', 'warning'); return; }
  try {
    var dataUrl = 'data:application/pdf;base64,' + b64;
    window.open(dataUrl, '_blank');
  } catch(e) { addToast('Could not open PDF', 'error'); }
}
