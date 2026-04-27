// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 25-invoicing.js
// Extracted from original index.html lines 15780-16217
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// INVOICING SYSTEM — Progress Claims, GST, PDF, Xero-ready, Auto-Reminders
// ══════════════════════════════════════════════════════════════════════════════

var SPARTAN_ABNS = {VIC:'89 933 629 169',ACT:'62 324 172 482',SA:'20 929 144 905',All:'89 933 629 169'};
var SPARTAN_ADDRESSES = {VIC:'162-164 Nicholson St, Abbotsford VIC 3067',ACT:'40/25 Val Reid Crescent, Hume ACT 2620',SA:'Adelaide, SA',All:'162-164 Nicholson St, Abbotsford VIC 3067'};
var SPARTAN_BANK = {name:'Spartan Double Glazing Pty Ltd',bsb:'063-000',acc:'1234 5678'};
var DEFAULT_CLAIM_PERCENT = 5;
var REMINDER_DAYS = [7, 3, 1, 0]; // Auto-remind at 7,3,1,0 days before due

function getInvoices() { try { return JSON.parse(localStorage.getItem('spartan_invoices') || '[]'); } catch(e){ return []; } }
function saveInvoices(inv) {
  localStorage.setItem('spartan_invoices', JSON.stringify(inv));
  // Supabase sync intentionally disabled — dbUpsert now snake-cases field
  // names (fixed in 01-persistence.js), but Bug 2 from the invoicing audit
  // flagged that the Supabase `invoices` table may be missing columns for
  // abn / spartan_address / terms / notes / reminders / line_items. Re-enable
  // once the schema has been audited and the missing columns added (if any):
  //   if (_sb) inv.forEach(function(x){ dbUpsert('invoices', x); });
}

function nextInvoiceNumber() {
  var invs = getInvoices();
  var max = 0;
  invs.forEach(function(i) { var n = parseInt((i.invoiceNumber||'').replace(/\D/g,'')); if(n>max) max=n; });
  return 'INV-' + String(max + 1).padStart(5, '0');
}

function calcGST(exGst) { return { exGst: exGst, gst: Math.round(exGst * 0.1 * 100) / 100, total: Math.round(exGst * 1.1 * 100) / 100 }; }

var invTab = 'all';
var invSelectedId = null;

// ── Create Invoice from Deal ─────────────────────────────────────────────────
function createInvoice(dealId, type) {
  var deal = getState().deals.find(function(d){ return d.id === dealId; });
  if (!deal) { addToast('Deal not found', 'error'); return; }
  var contact = getState().contacts.find(function(c){ return c.id === deal.cid; });
  var invoices = getInvoices();
  var branch = deal.branch || 'VIC';

  var existingClaims = invoices.filter(function(i){ return i.dealId === dealId && i.type === 'progress_claim' && i.status !== 'void'; });
  var claimedPercent = existingClaims.reduce(function(s,i){ return s + (i.claimPercent||0); }, 0);
  var claimNumber = existingClaims.length + 1;
  var dealExGst = Math.round(deal.val / 1.1 * 100) / 100;
  var pct = type === 'progress_claim' ? DEFAULT_CLAIM_PERCENT : 100;
  var claimExGst = Math.round(dealExGst * pct / 100 * 100) / 100;
  var gst = calcGST(claimExGst);

  var inv = {
    id: 'inv' + Date.now(),
    invoiceNumber: nextInvoiceNumber(),
    dealId: dealId,
    contactId: deal.cid || '',
    dealTitle: deal.title,
    contactName: contact ? contact.fn + ' ' + contact.ln : '',
    contactEmail: contact ? contact.email : '',
    contactPhone: contact ? contact.phone : '',
    contactAddress: contact ? [contact.street,contact.suburb,contact.state,contact.postcode].filter(Boolean).join(', ') : '',
    branch: branch,
    abn: SPARTAN_ABNS[branch] || SPARTAN_ABNS.VIC,
    spartanAddress: SPARTAN_ADDRESSES[branch] || SPARTAN_ADDRESSES.VIC,
    type: type || 'standard',
    claimNumber: type === 'progress_claim' ? claimNumber : null,
    claimPercent: pct,
    claimedSoFar: claimedPercent,
    dealValueIncGst: deal.val,
    dealValueExGst: dealExGst,
    lineItems: [{
      id: 'li1',
      description: type === 'progress_claim'
        ? 'Progress Claim #' + claimNumber + ' \u2014 ' + deal.title + ' (' + pct + '%)'
        : 'uPVC Double Glazing \u2014 ' + deal.title,
      qty: 1, unitPrice: claimExGst, amount: claimExGst,
    }],
    subtotal: claimExGst, gst: gst.gst, total: gst.total,
    status: 'draft',
    issueDate: new Date().toISOString().slice(0,10),
    dueDate: new Date(Date.now() + 14*24*3600000).toISOString().slice(0,10),
    paidDate: null,
    notes: '',
    terms: 'Payment due within 14 days.\nBank: ' + SPARTAN_BANK.name + '\nBSB: ' + SPARTAN_BANK.bsb + '\nAccount: ' + SPARTAN_BANK.acc,
    reminders: [],
    autoRemindersEnabled: true,
    createdBy: (getCurrentUser()||{name:'Admin'}).name,
    created: new Date().toISOString(),
  };

  invoices.push(inv);
  saveInvoices(invoices);
  addToast('Invoice ' + inv.invoiceNumber + ' created', 'success');
  invSelectedId = inv.id;
  renderPage();
  return inv;
}

function updateInvoiceStatus(invId, status) {
  var invoices = getInvoices();
  var inv = invoices.find(function(i){ return i.id === invId; });
  if (!inv) return;
  inv.status = status;
  if (status === 'paid') inv.paidDate = new Date().toISOString().slice(0,10);
  if (status === 'sent' && !inv.sentDate) inv.sentDate = new Date().toISOString().slice(0,10);
  saveInvoices(invoices);
  addToast('Invoice ' + inv.invoiceNumber + ' \u2192 ' + status, 'success');
  renderPage();
}

function voidInvoice(invId) { if (!confirm('Void this invoice?')) return; updateInvoiceStatus(invId, 'void'); }
function deleteInvoice(invId) { if (!confirm('Delete this invoice permanently?')) return; saveInvoices(getInvoices().filter(function(i){ return i.id !== invId; })); invSelectedId = null; addToast('Invoice deleted', 'warning'); renderPage(); }

function recalcInvoice(invId) {
  var invoices = getInvoices();
  var inv = invoices.find(function(i){ return i.id === invId; });
  if (!inv) return;
  var sub = inv.lineItems.reduce(function(s,li){ return s + (li.amount||0); }, 0);
  inv.subtotal = Math.round(sub * 100) / 100;
  inv.gst = Math.round(sub * 0.1 * 100) / 100;
  inv.total = Math.round(sub * 1.1 * 100) / 100;
  if (inv.type === 'progress_claim' && inv.dealValueExGst > 0) inv.claimPercent = Math.round(sub / inv.dealValueExGst * 100 * 10) / 10;
  saveInvoices(invoices);
  renderPage();
}

function updateInvoiceField(invId, field, value) { var invoices = getInvoices(); var inv = invoices.find(function(i){ return i.id === invId; }); if (inv) { inv[field] = value; saveInvoices(invoices); } }

function addLineItem(invId) { var invoices = getInvoices(); var inv = invoices.find(function(i){ return i.id === invId; }); if (!inv) return; inv.lineItems.push({ id: 'li' + Date.now(), description: '', qty: 1, unitPrice: 0, amount: 0 }); saveInvoices(invoices); renderPage(); }
function removeLineItem(invId, liId) { var invoices = getInvoices(); var inv = invoices.find(function(i){ return i.id === invId; }); if (!inv) return; inv.lineItems = inv.lineItems.filter(function(li){ return li.id !== liId; }); saveInvoices(invoices); recalcInvoice(invId); }
function saveLineItem(invId, liId) { var desc = document.getElementById('li_desc_'+liId); var qty = document.getElementById('li_qty_'+liId); var price = document.getElementById('li_price_'+liId); if (!desc) return; var invoices = getInvoices(); var inv = invoices.find(function(i){ return i.id === invId; }); if (!inv) return; inv.lineItems = inv.lineItems.map(function(li) { if (li.id !== liId) return li; var q = parseFloat(qty.value) || 1; var p = parseFloat(price.value) || 0; return { ...li, description: desc.value, qty: q, unitPrice: p, amount: Math.round(q * p * 100) / 100 }; }); saveInvoices(invoices); recalcInvoice(invId); }

// ── Update claim percentage via text input ───────────────────────────────────
function updateClaimPercentInput(invId) {
  var el = document.getElementById('claim_pct_input');
  if (!el) return;
  var pct = parseFloat(el.value);
  if (isNaN(pct) || pct <= 0 || pct > 100) { addToast('Enter a valid percentage (1-100)', 'error'); return; }
  var invoices = getInvoices();
  var inv = invoices.find(function(i){ return i.id === invId; });
  if (!inv || inv.type !== 'progress_claim') return;
  // Check remaining
  var existing = getInvoices().filter(function(i){ return i.dealId===inv.dealId && i.type==='progress_claim' && i.status!=='void' && i.id!==invId; });
  var usedPct = existing.reduce(function(s,i){ return s + (i.claimPercent||0); }, 0);
  if (pct + usedPct > 100) { addToast('Cannot exceed 100%. Already claimed: ' + usedPct + '%', 'error'); return; }
  var claimExGst = Math.round(inv.dealValueExGst * pct / 100 * 100) / 100;
  inv.claimPercent = pct;
  inv.lineItems[0].unitPrice = claimExGst;
  inv.lineItems[0].amount = claimExGst;
  inv.lineItems[0].description = 'Progress Claim #' + inv.claimNumber + ' \u2014 ' + inv.dealTitle + ' (' + pct + '%)';
  saveInvoices(invoices);
  recalcInvoice(invId);
}

// ── Send reminder ────────────────────────────────────────────────────────────
function sendInvoiceReminder(invId, method) {
  var invoices = getInvoices();
  var inv = invoices.find(function(i){ return i.id === invId; });
  if (!inv) return;
  if (method === 'email' && getState().gmailConnected && inv.contactEmail) {
    var subject = 'Payment Reminder: ' + inv.invoiceNumber + ' \u2014 ' + fmt$(inv.total) + ' due ' + inv.dueDate;
    var body = 'Dear ' + (inv.contactName.split(' ')[0] || 'Customer') + ',\n\nThis is a friendly reminder that the following invoice is due for payment:\n\nInvoice: ' + inv.invoiceNumber + '\nAmount: ' + fmt$(inv.total) + ' (inc GST)\nDue Date: ' + inv.dueDate + '\n\nPlease arrange payment via bank transfer:\n' + SPARTAN_BANK.name + '\nBSB: ' + SPARTAN_BANK.bsb + '\nAccount: ' + SPARTAN_BANK.acc + '\nReference: ' + inv.invoiceNumber + '\n\nIf you have already made this payment, please disregard this reminder.\n\nKind regards,\n' + (getCurrentUser()||{name:'Admin'}).name + '\nSpartan Double Glazing\n1300 912 161';
    gmailSend(inv.contactEmail, subject, body, '', inv.dealId, 'deal');
  }
  inv.reminders.push({ method: method, date: new Date().toISOString().slice(0,10), time: new Date().toTimeString().slice(0,5), by: (getCurrentUser()||{name:'Admin'}).name });
  saveInvoices(invoices);
  addToast('Reminder ' + (method === 'email' ? 'sent via Gmail' : 'logged'), 'success');
  renderPage();
}

// ── Auto-reminders check (runs on page load) ────────────────────────────────
function checkAutoReminders() {
  var invoices = getInvoices();
  var today = new Date();
  var todayStr = today.toISOString().slice(0,10);
  var changed = false;
  invoices.forEach(function(inv) {
    if (!inv.autoRemindersEnabled || inv.status === 'paid' || inv.status === 'void' || inv.status === 'draft') return;
    if (!inv.dueDate || !inv.contactEmail) return;
    var due = new Date(inv.dueDate + 'T12:00:00');
    var daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (24*3600000));
    REMINDER_DAYS.forEach(function(d) {
      if (daysUntilDue === d) {
        var alreadySent = inv.reminders.some(function(r){ return r.date === todayStr && r.method === 'auto_email'; });
        if (!alreadySent && getState().gmailConnected) {
          sendInvoiceReminder(inv.id, 'email');
          inv.reminders.push({ method: 'auto_email', date: todayStr, time: new Date().toTimeString().slice(0,5), by: 'System (Auto)' });
          changed = true;
        }
      }
    });
  });
  if (changed) saveInvoices(invoices);
}

// ── Xero export ──────────────────────────────────────────────────────────────
function exportToXero(invId) {
  var inv = getInvoices().find(function(i){ return i.id === invId; });
  if (!inv) return;
  var payload = { Type:'ACCREC', InvoiceNumber:inv.invoiceNumber, Reference:inv.dealTitle, Contact:{Name:inv.contactName,EmailAddress:inv.contactEmail}, Date:inv.issueDate, DueDate:inv.dueDate, LineAmountTypes:'Exclusive', LineItems:inv.lineItems.map(function(li){ return {Description:li.description,Quantity:li.qty,UnitAmount:li.unitPrice,AccountCode:'200',TaxType:'OUTPUT'}; }), Status:inv.status==='draft'?'DRAFT':'AUTHORISED' };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  addToast('Xero JSON copied to clipboard', 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF INVOICE GENERATOR — Professional branded document
// ══════════════════════════════════════════════════════════════════════════════
function generateInvoicePDF(invId) {
  var inv = getInvoices().find(function(i){ return i.id === invId; });
  if (!inv) { addToast('Invoice not found', 'error'); return; }
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') { addToast('PDF library not loaded', 'error'); return; }

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('p', 'mm', 'a4');
  var w = 210, h = 297;
  var ml = 20, mr = 20, cw = w - ml - mr;
  var y = 20;
  var red = [196, 18, 48]; // #c41230
  var dark = [26, 26, 26];
  var gray = [107, 114, 128];
  var lightGray = [243, 244, 246];
  var branch = inv.branch || 'VIC';
  var abn = inv.abn || SPARTAN_ABNS[branch] || SPARTAN_ABNS.VIC;
  var spartanAddr = inv.spartanAddress || SPARTAN_ADDRESSES[branch] || SPARTAN_ADDRESSES.VIC;

  // ── Header: Red bar ──
  doc.setFillColor(red[0], red[1], red[2]);
  doc.rect(0, 0, w, 38, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('SPARTAN', ml, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('DOUBLE GLAZING', ml, 22);

  // Invoice title right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(inv.type === 'progress_claim' ? 'PROGRESS CLAIM' : 'TAX INVOICE', w - mr, 16, {align: 'right'});
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(inv.invoiceNumber, w - mr, 23, {align: 'right'});
  if (inv.type === 'progress_claim') doc.text('Claim #' + inv.claimNumber + ' (' + inv.claimPercent + '%)', w - mr, 29, {align: 'right'});

  y = 46;

  // ── Company details (left) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text('Spartan Double Glazing Pty Ltd', ml, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text(spartanAddr, ml, y + 5);
  doc.text('ABN: ' + abn, ml, y + 10);
  doc.text('Phone: 1300 912 161', ml, y + 15);
  doc.text('Email: sales@spartandoubleglazing.com.au', ml, y + 20);

  // ── Invoice details (right) ──
  var rx = w - mr;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  var infoRows = [['Issue Date', inv.issueDate], ['Due Date', inv.dueDate], ['Status', inv.status.toUpperCase()]];
  if (inv.paidDate) infoRows.push(['Paid Date', inv.paidDate]);
  infoRows.forEach(function(r, i) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(r[0] + ':', rx - 40, y + i * 5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(r[1], rx, y + i * 5, {align: 'right'});
  });

  y += 30;

  // ── Bill To ──
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(ml, y, cw, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('BILL TO', ml + 4, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text(inv.contactName, ml + 4, y + 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  if (inv.contactEmail) doc.text(inv.contactEmail, ml + 4, y + 16);
  if (inv.contactAddress) doc.text(inv.contactAddress, ml + 4, y + 21);

  // Job ref right side
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('JOB REFERENCE', rx - 60, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text(inv.dealTitle, rx - 60, y + 11);
  if (inv.type === 'progress_claim') {
    doc.setFontSize(8);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('Total Job Value: ' + fmt$(inv.dealValueIncGst) + ' (inc GST)', rx - 60, y + 16);
    doc.text('This Claim: ' + inv.claimPercent + '% of ' + fmt$(inv.dealValueExGst) + ' (ex GST)', rx - 60, y + 21);
  }

  y += 34;

  // ── Progress Claim Summary (if applicable) ──
  if (inv.type === 'progress_claim') {
    var allClaims = getInvoices().filter(function(i){ return i.dealId === inv.dealId && i.type === 'progress_claim' && i.status !== 'void'; });
    var totalClaimedPct = allClaims.reduce(function(s,i){ return s + (i.claimPercent||0); }, 0);

    doc.setFillColor(240, 249, 255);
    doc.rect(ml, y, cw, 16, 'F');
    doc.setDrawColor(186, 230, 253);
    doc.rect(ml, y, cw, 16, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(3, 105, 161);
    doc.text('PROGRESS CLAIM SUMMARY', ml + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Total claimed to date: ' + Math.round(totalClaimedPct) + '% of job value | Remaining: ' + Math.round(100 - totalClaimedPct) + '%', ml + 4, y + 11);

    // Progress bar
    var barX = ml + cw - 60, barW = 55, barH = 5, barY = y + 5;
    doc.setFillColor(229, 231, 235);
    doc.rect(barX, barY, barW, barH, 'F');
    doc.setFillColor(21, 128, 61);
    doc.rect(barX, barY, barW * Math.min(totalClaimedPct, 100) / 100, barH, 'F');
    doc.setFontSize(7);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(Math.round(totalClaimedPct) + '%', barX + barW + 2, barY + 4);

    y += 22;
  }

  // ── Line Items Table ──
  // Header
  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.rect(ml, y, cw, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Description', ml + 3, y + 5.5);
  doc.text('Qty', ml + cw - 65, y + 5.5, {align: 'center'});
  doc.text('Unit Price', ml + cw - 35, y + 5.5, {align: 'right'});
  doc.text('Amount', ml + cw - 3, y + 5.5, {align: 'right'});
  y += 8;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  inv.lineItems.forEach(function(li, idx) {
    if (idx % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(ml, y, cw, 7, 'F'); }
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(li.description.slice(0, 60), ml + 3, y + 5);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text(String(li.qty), ml + cw - 65, y + 5, {align: 'center'});
    doc.text(fmt$(li.unitPrice), ml + cw - 35, y + 5, {align: 'right'});
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(fmt$(li.amount), ml + cw - 3, y + 5, {align: 'right'});
    doc.setFont('helvetica', 'normal');
    y += 7;
  });

  y += 5;
  doc.setDrawColor(229, 231, 235);
  doc.line(ml + cw - 70, y, ml + cw, y);

  // ── Totals ──
  y += 5;
  var totX = ml + cw - 70;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('Subtotal (ex GST)', totX, y);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text(fmt$(inv.subtotal), ml + cw - 3, y, {align: 'right'});

  y += 6;
  doc.setTextColor(gray[0], gray[1], gray[2]);
  doc.text('GST (10%)', totX, y);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text(fmt$(inv.gst), ml + cw - 3, y, {align: 'right'});

  y += 3;
  doc.setDrawColor(dark[0], dark[1], dark[2]);
  doc.setLineWidth(0.5);
  doc.line(totX, y, ml + cw, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(red[0], red[1], red[2]);
  doc.text('TOTAL (inc GST)', totX, y);
  doc.text(fmt$(inv.total), ml + cw - 3, y, {align: 'right'});

  // ── Payment terms ──
  y += 16;
  if (inv.terms) {
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(ml, y, cw, 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('PAYMENT DETAILS', ml + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    var termLines = inv.terms.split('\n');
    termLines.forEach(function(line, i) { doc.text(line, ml + 4, y + 10 + i * 4); });
  }

  // ── Notes ──
  if (inv.notes) {
    y += 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(gray[0], gray[1], gray[2]);
    doc.text('NOTES', ml, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(inv.notes.slice(0, 200), ml, y + 5);
  }

  // ── Footer ──
  doc.setFillColor(red[0], red[1], red[2]);
  doc.rect(0, h - 14, w, 14, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('Spartan Double Glazing Pty Ltd | ABN: ' + abn + ' | 1300 912 161 | sales@spartandoubleglazing.com.au', w / 2, h - 6, {align: 'center'});

  // Save
  doc.save(inv.invoiceNumber + '.pdf');
  addToast('PDF downloaded: ' + inv.invoiceNumber + '.pdf', 'success');
}

