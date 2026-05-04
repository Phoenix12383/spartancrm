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
      var cutlistBtn = (q.trimCutList && (
            (Array.isArray(q.trimCutList.cuts) && q.trimCutList.cuts.length > 0)
            || (q.trimCutList.byTrim && Object.keys(q.trimCutList.byTrim).length > 0)
          ))
        ? '<button onclick="viewDealQuoteCutlist(\''+d.id+'\',\''+q.id+'\')" title="View trim cutlist" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">\ud83d\udccf Cutlist</button>'
        : '<button disabled title="No cutlist yet \u2014 CAD emits it on save (WIP38+)" style="padding:4px 8px;border:1px solid #f3f4f6;border-radius:5px;background:#f9fafb;color:#d1d5db;cursor:not-allowed;font-size:11px">\ud83d\udccf Cutlist</button>';
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
        +    '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">'
        +      editBtn
        +      pdfBtn
        +      cutlistBtn
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
      var cutlistBtn = (q.trimCutList && (
            (Array.isArray(q.trimCutList.cuts) && q.trimCutList.cuts.length > 0)
            || (q.trimCutList.byTrim && Object.keys(q.trimCutList.byTrim).length > 0)
          ))
        ? '<button onclick="viewLeadQuoteCutlist(\''+l.id+'\',\''+q.id+'\')" title="View trim cutlist" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">📏 Cutlist</button>'
        : '<button disabled title="No cutlist yet — CAD emits it on save (WIP38+)" style="padding:4px 8px;border:1px solid #f3f4f6;border-radius:5px;background:#f9fafb;color:#d1d5db;cursor:not-allowed;font-size:11px">📏 Cutlist</button>';
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
        +    '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">'
        +      '<button onclick="editLeadQuote(\''+l.id+'\',\''+q.id+'\')" title="Open in CAD" style="padding:4px 10px;border:none;border-radius:5px;background:#c41230;color:#fff;cursor:pointer;font-size:11px;font-weight:600">\u270f Edit</button>'
        +      pdfBtn
        +      cutlistBtn
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

// ── Cutlist viewer (lead/deal quote → modal table) ──────────────────────────
// trimCutList is the CAD-emitted cut schedule from
// modules/cad_modules/22-trim-cutlist.js. Shape:
//   { cuts: [{ frameId, frameName, surface, side, lengthMm, trimLabel,
//              isCatalogItem, lengthBarMm, ... }],
//     byTrim: { <key>: { label, totalLengthMm, cutCount, barLengthMm,
//                        barsRequired, isCatalogItem } } }
//
// CRM doesn't reshape it — we render the byTrim aggregate as the headline
// table (one row per distinct trim label) and the per-cut detail below.
function viewLeadQuoteCutlist(leadId, quoteId) {
  var lead = (getState().leads||[]).find(function(l){ return l.id === leadId; });
  if (!lead) return;
  var quote = (lead.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  _showCutlistModal(quote.trimCutList, (quote.label || 'Quote') + ' — Cutlist');
}
function viewDealQuoteCutlist(dealId, quoteId) {
  var deal = (getState().deals||[]).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  var quote = (deal.quotes||[]).find(function(q){ return q.id === quoteId; });
  if (!quote) return;
  _showCutlistModal(quote.trimCutList, (quote.label || 'Quote') + ' — Cutlist');
}
window.viewLeadQuoteCutlist = viewLeadQuoteCutlist;
window.viewDealQuoteCutlist = viewDealQuoteCutlist;

function _cutlistEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _showCutlistModal(trimCutList, title) {
  var existing = document.getElementById('cutlistModal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'cutlistModal';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:280;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });

  var hasData = trimCutList && (
    (Array.isArray(trimCutList.cuts) && trimCutList.cuts.length > 0)
    || (trimCutList.byTrim && Object.keys(trimCutList.byTrim).length > 0)
  );

  var inner = '<div style="background:#fff;border-radius:12px;width:100%;max-width:900px;max-height:88vh;display:flex;flex-direction:column;font-family:DM Sans,sans-serif">'
    + '<div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #f0f0f0;flex:0 0 auto">'
    +   '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;color:#1a1a1a;flex:1">' + _cutlistEsc(title) + '</div>'
    +   '<button id="cutlistCloseBtn" style="padding:6px 12px;border:1px solid #e5e7eb;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">Close</button>'
    + '</div>'
    + '<div style="flex:1 1 auto;overflow:auto;padding:16px 20px">';

  if (!hasData) {
    inner += '<div style="padding:40px;text-align:center;color:#9ca3af">'
      +      '<div style="font-size:36px;margin-bottom:8px">📐</div>'
      +      '<div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">No cutlist on this quote</div>'
      +      '<div style="font-size:12px">CAD generates the cutlist on save (WIP38+). Re-open in CAD and save again to populate.</div>'
      +    '</div>';
  } else {
    var byTrim = trimCutList.byTrim || {};
    var byTrimKeys = Object.keys(byTrim).sort();
    var cuts = Array.isArray(trimCutList.cuts) ? trimCutList.cuts : [];

    if (byTrimKeys.length > 0) {
      inner += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">By Trim</div>'
        +     '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">'
        +     '<thead><tr style="background:#f9fafb">'
        +     '<th class="th" style="text-align:left">Trim</th>'
        +     '<th class="th" style="text-align:right">Cuts</th>'
        +     '<th class="th" style="text-align:right">Total length (m)</th>'
        +     '<th class="th" style="text-align:right">Bar length (m)</th>'
        +     '<th class="th" style="text-align:right">Bars required</th>'
        +     '</tr></thead><tbody>';
      byTrimKeys.forEach(function(k, i) {
        var t = byTrim[k] || {};
        var totalM = (Number(t.totalLengthMm) || 0) / 1000;
        var barM = t.barLengthMm ? (Number(t.barLengthMm) / 1000) : null;
        inner += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          +    '<td class="td" style="font-weight:600">' + _cutlistEsc(t.label || k) + '</td>'
          +    '<td class="td" style="text-align:right">' + (t.cutCount || 0) + '</td>'
          +    '<td class="td" style="text-align:right">' + totalM.toFixed(2) + '</td>'
          +    '<td class="td" style="text-align:right">' + (barM != null ? barM.toFixed(2) : '—') + '</td>'
          +    '<td class="td" style="text-align:right;font-weight:600;color:#c41230">' + (t.barsRequired != null ? t.barsRequired : '—') + '</td>'
          +    '</tr>';
      });
      inner += '</tbody></table>';
    }

    if (cuts.length > 0) {
      inner += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Per Cut (' + cuts.length + ')</div>'
        +     '<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +     '<thead><tr style="background:#f9fafb">'
        +     '<th class="th" style="text-align:left">Frame</th>'
        +     '<th class="th" style="text-align:left">Surface</th>'
        +     '<th class="th" style="text-align:left">Side</th>'
        +     '<th class="th" style="text-align:right">Length (mm)</th>'
        +     '<th class="th" style="text-align:left">Trim</th>'
        +     '</tr></thead><tbody>';
      cuts.forEach(function(c, i) {
        inner += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
          +    '<td class="td">' + _cutlistEsc(c.frameName || c.frameId || '—') + '</td>'
          +    '<td class="td">' + _cutlistEsc(c.surface || '') + '</td>'
          +    '<td class="td">' + _cutlistEsc(c.side || '') + '</td>'
          +    '<td class="td" style="text-align:right;font-family:monospace">' + (c.lengthMm || 0) + '</td>'
          +    '<td class="td">' + _cutlistEsc(c.trimLabel || c.trimValue || '') + '</td>'
          +    '</tr>';
      });
      inner += '</tbody></table>';
    }
  }

  inner += '</div></div>';
  overlay.innerHTML = inner;
  document.body.appendChild(overlay);
  document.getElementById('cutlistCloseBtn').addEventListener('click', function(){ overlay.remove(); });
}
