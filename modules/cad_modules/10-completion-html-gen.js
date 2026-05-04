// ═══════════════════════════════════════════════════════════════════════════
// COMPLETION DOCUMENT / SERVICE HTML GENERATOR
// An interactive fillable form for the installer/carpenter to complete on-site
// at the end of a service visit. Mirrors the layout of the Spartan Completion
// Document PDF: carpenter instructions, per-frame sign-off with outstanding
// issues + parts required lists, agreement-of-completion with signatures,
// and a 20-item service re-order & parts checklist.
// ═══════════════════════════════════════════════════════════════════════════
function generateCompletionDocumentHTML(ctx) {
  var items = ctx.items || [];
  var s = ctx.appSettings;
  var co = s.company || {};
  var projectName = ctx.projectName || 'Project';
  var logoSrc = ctx.logoSrc || '';

  var today = new Date();
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

  // Layout:
  //   Page 1           — Carpenter instructions
  //   Pages 2..N+1     — Per-frame sign-off (one page per project frame)
  //   Page N+2         — Agreement of Service Completion (signatures)
  //   Pages N+3..N+6   — Service Re-Order & Parts Checklist (20 items, 5/page)
  //                      + Additional Notes on the last checklist page
  var totalPages = 1 + items.length + 1 + 4;

  function pageHeader(pageN, title) {
    var logoHtml = logoSrc ? '<img src="'+_esc(logoSrc)+'" style="height:78px;width:auto;" alt="Spartan"/>' : '<div style="width:90px;height:78px;"></div>';
    return '<div class="page-header">'
      + '<div class="logo-col">'+logoHtml+'</div>'
      + '<div class="header-meta">'
      +   '<div style="font-size:20px;font-weight:700;">'+_esc(title || 'Completion Document/Service')+'</div>'
      +   '<table style="font-size:10px;margin-top:4px;border-collapse:collapse;margin-left:auto;">'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Date</td><td style="padding:1px 0;font-weight:700;">'+_esc(dateStr)+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Page</td><td style="padding:1px 0;font-weight:700;">'+pageN+' of '+totalPages+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Items</td><td style="padding:1px 0;font-weight:700;">'+items.length+'</td></tr>'
      +   '</table>'
      +   '<div class="project-pill">'+_esc(projectName)+'</div>'
      + '</div>'
      + '</div>'
      + '<div class="company-strip">'
      +   '<div>'+_esc(co.address1 || '')+(co.address2?' / '+_esc(co.address2):'')+(co.address3?' / '+_esc(co.address3):'')+'</div>'
      +   '<div>'+_esc(co.phone || '')+'</div>'
      +   '<div>'+_esc(co.email || '')+'</div>'
      +   '<div>'+_esc(co.website || '')+'</div>'
      +   '<div style="color:#555;margin-top:4px;">'+_esc(co.abnVic || co.abn || '')+' (VIC Branch) / '+_esc(co.abnAct || '')+' (ACT Branch) / '+_esc(co.abnSa || '')+' (SA Branch)</div>'
      + '</div>';
  }

  var pages = [];

  // ─── PAGE 1: Carpenter Instructions ───
  var instructions = [
    { title: '1. Final Walk-Through with Client:', body: 'Please guide the client through every window where an assessment was made or work was carried out. Briefly explain any identified items requiring attention or completed work.' },
    { title: '2. Window Diagram & Client Confirmation:', body: 'For any glass identified for replacement, ensure you have: circled the specific pane(s) on the window diagram, written the exact glass size (e.g., "800x1200mm") under "Parts Required" next to the circled item, and clearly numbered any other items requiring attention on the window diagram (e.g., "1. Loose handle," "2. Seal replacement"). Crucially, obtain the client\'s signature next to each window on the diagram. This confirms they\'ve reviewed the noted items for that specific window and understand the proposed next steps.' },
    { title: '3. "Parts Required" Section – Accuracy Check:', body: 'Review the "Parts Required" list. Confirm you\'ve noted the EXACT part needed (e.g., "Left-hand casement hinge," "Bronze lock mechanism"). For any linear items (like seals or trim), write down the FULL, EXACT LENGTH required (e.g., "Weather seal - 3.2 meters"). This precision helps us get the right parts ordered efficiently.' },
    { title: '4. Work Description – Be Clear & Factual:', body: 'In the "Work Description" section, briefly describe every item that needs attention. Keep descriptions concise and factual (e.g., "Window 4: Outer glass pane identified for replacement," "Window 6: Locking mechanism requires adjustment").' },
    { title: '5. Site Cleanliness:', body: 'Ensure the work area is left spotlessly clean – no dust, debris, or packaging materials remaining.' },
    { title: '6. Client Satisfaction & Next Steps:', body: 'Ask the client if they are satisfied with the inspection and discussion. Clearly explain the next steps (e.g., "We will now order the necessary parts and contact you within [X] business days to schedule the next visit for installation/repair," or "The work on these items is now complete.").' },
    { title: '7. Documentation Submission:', body: 'Confirm all sections of this document are fully and accurately completed. Submit the document as per our standard company procedure (e.g., scan and upload to the system, return to the office).' },
  ];
  var p1 = pageHeader(1) + '<div class="page-body">'
    + '<div style="margin-top:14px;font-weight:700;font-size:14px;margin-bottom:10px;">For Our Carpenter (To Complete On-Site):</div>'
    + instructions.map(function(ins){
        return '<div style="margin:10px 0;font-size:11px;line-height:1.55;">'
          + '<div style="font-weight:700;margin-bottom:3px;">'+_esc(ins.title)+'</div>'
          + '<div style="color:#333;">'+_esc(ins.body)+'</div>'
          + '</div>';
      }).join('')
    + '</div>';
  pages.push(p1);

  // ─── FRAME PAGES: one sign-off form per frame ───
  items.forEach(function(f, i) {
    var pageN = 2 + i;
    var fid = 'cf'+i; // input name prefix — "cf" for Completion Frame

    // Left column — issues, parts, sign-off
    var leftCol = ''
      + '<div style="font-weight:700;font-size:14px;margin-bottom:12px;">Frame '+(i+1)+(f.name?' — '+_esc(f.name):'')+'</div>'

      // Current Outstanding Issues
      + '<div style="font-weight:700;font-size:11px;margin-bottom:4px;">Current Outstanding Issues</div>'
      + '<div style="margin-bottom:16px;">'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_iss1" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_iss2" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_iss3" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_iss4" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_iss5" class="cd-line"/></div>'
      + '</div>'

      // Parts Required (For Production)
      + '<div style="font-weight:700;font-size:11px;margin-bottom:4px;">Parts Required (For Production)</div>'
      + '<div style="margin-bottom:16px;">'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_part1" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_part2" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_part3" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_part4" class="cd-line"/></div>'
      +   '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;"><span>—</span><input type="text" name="'+fid+'_part5" class="cd-line"/></div>'
      + '</div>'

      // Window Sign Off
      + '<div style="font-weight:700;font-size:11px;margin-bottom:4px;">Window Sign Off</div>'
      + '<div style="margin-bottom:16px;font-size:11px;">'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_open"/> Window Opening/Closing</label>'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_timber"/> Timber is finished ready for paint</label>'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_trims"/> Trims done</label>'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_sealed"/> Window is fully sealed</label>'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_screens"/> Fly Screens On, Working</label>'
      +   '<label class="cd-chk"><input type="checkbox" name="'+fid+'_so_glass"/> Glass is within Australian Standard</label>'
      + '</div>'

      // Client Signature
      + '<div style="font-weight:700;font-size:11px;margin-bottom:4px;">Client Signature</div>'
      + '<div style="display:flex;gap:6px;margin:4px 0;align-items:center;">'
      +   '<span>&gt;</span><input type="text" name="'+fid+'_sig" class="cd-line" placeholder="Signature / printed name"/>'
      + '</div>';

    // Right column — CAD spec reference (Internal view only)
    var rightCol = ''
      + '<div style="text-align:center;margin-bottom:10px;">'
      +   viewWithDimensions(f, 'back')
      + '</div>'
      + '<div style="text-align:center;font-size:10px;color:#666;">'+_esc(f.width)+' &times; '+_esc(f.height)+' mm</div>';

    var body = pageHeader(pageN) + '<div class="page-body">'
      + '<div style="display:grid;grid-template-columns:1fr 300px;gap:24px;margin-top:12px;">'
      +   '<div>'+leftCol+'</div>'
      +   '<div>'+rightCol+'</div>'
      + '</div>'
      + '</div>';
    pages.push(body);
  });

  // ─── AGREEMENT PAGE (N+2) ───
  var agreementN = 2 + items.length;
  var agreementPage = pageHeader(agreementN) + '<div class="page-body">'
    + '<div style="margin-top:14px;font-weight:700;font-size:16px;margin-bottom:10px;">Agreement of Service Completion</div>'
    + '<div style="font-size:11px;line-height:1.55;margin-bottom:14px;">This confirms that our service visit has been completed today, <input type="text" name="ag_date" class="cd-line-inline" style="width:140px;"/>.</div>'
    + '<div style="font-size:11px;font-weight:700;margin-bottom:6px;">Please tick the appropriate box:</div>'
    + '<div style="font-size:11px;line-height:1.6;margin-bottom:16px;">'
    +   '<label class="cd-chk"><input type="radio" name="ag_type" value="all_done"/> All requested service work has been completed to my satisfaction. <span style="color:#666;">(For jobs where all work is finished.)</span></label>'
    +   '<label class="cd-chk"><input type="radio" name="ag_type" value="inspection"/> An inspection has been completed, and specific items requiring future attention have been noted on the diagram. <span style="color:#666;">(For inspection-only visits or jobs requiring parts ordering.)</span></label>'
    +   '<label class="cd-chk"><input type="radio" name="ag_type" value="no_issues"/> No service issues were identified during today\'s inspection. <span style="color:#666;">(For routine checks with no problems found.)</span></label>'
    + '</div>'
    + '<div style="font-size:11px;line-height:1.55;margin-bottom:14px;">By signing below, you acknowledge that you have reviewed the work performed or the inspection findings as noted on this document and the attached diagram. We strive for excellence in all our services, and we truly appreciate your business.</div>'
    + '<div style="font-size:11px;line-height:1.55;margin-bottom:20px;">The final balance for today\'s service is now due. Your invoice will be sent to you shortly or has been provided.</div>'

    // Customer signature block
    + '<div style="margin-top:24px;padding:14px;border:1px solid #ccc;border-radius:4px;background:#fafafa;">'
    +   '<div style="font-weight:700;font-size:11px;margin-bottom:10px;">Customer Signature:</div>'
    +   '<div style="height:40px;border-bottom:1px solid #888;margin-bottom:10px;"></div>'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:10px;">'
    +     '<div><div style="color:#555;margin-bottom:3px;">Print Name</div><input type="text" name="cust_name" class="cd-line"/></div>'
    +     '<div><div style="color:#555;margin-bottom:3px;">Date</div><input type="text" name="cust_date" class="cd-line"/></div>'
    +   '</div>'
    + '</div>'

    // Installer signature block
    + '<div style="margin-top:16px;padding:14px;border:1px solid #ccc;border-radius:4px;background:#fafafa;">'
    +   '<div style="font-weight:700;font-size:11px;margin-bottom:10px;">Installer Signature:</div>'
    +   '<div style="height:40px;border-bottom:1px solid #888;margin-bottom:10px;"></div>'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:10px;">'
    +     '<div><div style="color:#555;margin-bottom:3px;">Print Name</div><input type="text" name="inst_name" class="cd-line"/></div>'
    +     '<div><div style="color:#555;margin-bottom:3px;">Date</div><input type="text" name="inst_date" class="cd-line"/></div>'
    +   '</div>'
    + '</div>'
    + '</div>';
  pages.push(agreementPage);

  // ─── SERVICE RE-ORDER & PARTS CHECKLIST (4 pages × 5 items = 20 items) ───
  function buildItemBlock(n) {
    return '<div style="margin:10px 0;padding:8px 0;border-bottom:1px dashed #ccc;">'
      + '<div style="font-weight:700;font-size:10px;margin-bottom:5px;">ITEM ' + n + ' DESCRIPTION:</div>'
      + '<textarea name="item_' + n + '_desc" class="cd-desc" rows="3"></textarea>'
      + '<div style="display:flex;gap:20px;align-items:center;margin-top:6px;font-size:10px;flex-wrap:wrap;">'
      +   '<label class="cd-chk-inline"><input type="checkbox" name="item_' + n + '_reorder"/> Re-Order Required?</label>'
      +   '<label class="cd-chk-inline"><input type="checkbox" name="item_' + n + '_packed"/> Packed &amp; Ready to Dispatch</label>'
      +   '<label class="cd-chk-inline"><input type="checkbox" name="item_' + n + '_ascora"/> Updated in Ascora</label>'
      +   '<div>Dispatch Date: <input type="text" name="item_' + n + '_date" class="cd-line-inline" style="width:100px;" placeholder="__/__/____"/></div>'
      + '</div>'
      + '</div>';
  }

  for (var pg = 0; pg < 4; pg++) {
    var pageN = agreementN + 1 + pg;
    var startItem = pg * 5 + 1;
    var endItem = Math.min(startItem + 4, 20);

    var chkBody = pageHeader(pageN) + '<div class="page-body">'
      + (pg === 0 ? '<div style="text-align:center;font-weight:700;font-size:14px;margin:10px 0 4px 0;letter-spacing:1px;">SERVICE RE-ORDER &amp; PARTS CHECKLIST</div>'
                  + '<div style="text-align:center;font-size:11px;margin-bottom:12px;">Date: <input type="text" name="chk_date" class="cd-line-inline" style="width:140px;"/></div>'
               : '<div style="text-align:center;font-weight:600;font-size:11px;color:#666;margin:4px 0 10px 0;">Service Re-Order &amp; Parts Checklist (continued)</div>')
      ;

    for (var k = startItem; k <= endItem; k++) {
      chkBody += buildItemBlock(k);
    }

    // Additional Notes on the very last page
    if (pg === 3) {
      chkBody += '<div style="margin-top:18px;">'
        + '<div style="font-weight:700;font-size:12px;margin-bottom:6px;">ADDITIONAL NOTES:</div>'
        + '<textarea name="additional_notes" class="cd-desc" rows="8"></textarea>'
        + '</div>';
    }

    chkBody += '</div>';
    pages.push(chkBody);
  }

  // ─── STYLES ───
  var styles = '<style>'
    + '* { box-sizing: border-box; }'
    + 'body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:#222; background:#f0f0f0; }'
    + '.page { width:210mm; min-height:297mm; background:#fff; margin:10px auto; padding:14mm; page-break-after:always; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.12); }'
    + '.page:last-child { page-break-after:auto; }'
    + '.page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }'
    + '.logo-col { flex:0 0 auto; }'
    + '.header-meta { text-align:right; }'
    + '.project-pill { margin-top:18px; background:#e8e8e8; padding:10px 18px; font-weight:700; font-size:12px; display:inline-block; }'
    + '.company-strip { margin-top:14px; font-size:10px; line-height:1.5; }'
    + '.page-body { margin-top:6px; }'
    // Completion-doc-specific
    + '.cd-line { flex:1; border:none; border-bottom:1px solid #666; padding:2px 4px; font-size:11px; font-family:inherit; background:transparent; outline:none; }'
    + '.cd-line:focus { border-bottom-color:#c41230; background:#fffbeb; }'
    + '.cd-line-inline { border:none; border-bottom:1px solid #666; padding:2px 4px; font-size:11px; font-family:inherit; background:transparent; outline:none; }'
    + '.cd-line-inline:focus { border-bottom-color:#c41230; background:#fffbeb; }'
    + '.cd-chk { display:block; margin:4px 0; cursor:pointer; line-height:1.4; }'
    + '.cd-chk input { margin-right:8px; vertical-align:middle; }'
    + '.cd-chk-inline { display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap; }'
    + '.cd-desc { width:100%; font-family:inherit; font-size:10px; padding:6px 8px; border:1px solid #bbb; border-radius:3px; resize:vertical; background:#fff; }'
    + '.cd-desc:focus { border-color:#c41230; outline:none; background:#fffbeb; }'
    + '@media print {'
    + '  body { background:#fff; }'
    + '  .page { margin:0; box-shadow:none; width:auto; min-height:auto; padding:14mm; }'
    + '  input:focus, textarea:focus { outline:none !important; background:transparent !important; }'
    + '  .cd-line, .cd-line-inline, .cd-desc { border-color:#666 !important; }'
    + '}'
    + '@page { size: A4; margin:0; }'
    + '</style>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Completion Document - '+_esc(projectName)+'</title>'+styles+'</head><body>'
    + pages.map(function(p){return '<div class="page">'+p+'</div>';}).join('')
    + '</body></html>';
}

function generateFinalSignOffHTML(ctx) {
  var items = ctx.items || [];
  var s = ctx.appSettings;
  var co = s.company || {};
  var projectName = ctx.projectName || 'Project';
  var logoSrc = ctx.logoSrc || '';

  var today = new Date();
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

  // Pages: one per frame, then agreement pages (2 pages = page N+1, N+2), then payment page (N+3)
  var agreementPages = 3;
  var totalPages = items.length + agreementPages;

  var styles = '<style>'
    + '@page { size: A4; margin: 0; }'
    + 'body { margin:0; padding:0; font-family:Arial,sans-serif; font-size:11px; color:#111; }'
    + '.page { width:210mm; min-height:297mm; padding:12mm 14mm 10mm; box-sizing:border-box; page-break-after:always; position:relative; }'
    + '.page:last-child { page-break-after: auto; }'
    + '.page-header { display:flex; align-items:flex-start; justify-content:space-between; border-bottom:3px solid #c41230; padding-bottom:8px; margin-bottom:8px; }'
    + '.logo-col { flex:0 0 100px; }'
    + '.header-meta { text-align:right; }'
    + '.project-pill { display:inline-block; background:#c41230; color:#fff; font-size:10px; font-weight:700; padding:2px 10px; border-radius:3px; margin-top:4px; letter-spacing:0.5px; }'
    + '.company-strip { font-size:9px; color:#555; border-bottom:1px solid #ddd; padding-bottom:6px; margin-bottom:10px; display:flex; flex-wrap:wrap; gap:0 14px; }'
    + '.frame-section { display:flex; gap:14px; margin-top:6px; }'
    + '.frame-views { display:flex; gap:8px; flex:0 0 auto; }'
    + '.view-box { text-align:center; }'
    + '.view-box img { width:140px; height:130px; object-fit:contain; border:1px solid #ccc; display:block; }'
    + '.view-label { font-size:9px; color:#555; margin-top:2px; font-weight:700; }'
    + '.frame-specs { flex:1; }'
    + '.spec-block { background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; padding:6px 10px; margin-bottom:8px; }'
    + '.spec-block .block-title { font-weight:700; font-size:10px; margin-bottom:4px; color:#c41230; text-transform:uppercase; letter-spacing:0.5px; }'
    + '.spec-row { font-size:10px; line-height:1.6; }'
    + '.handle-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:10px; }'
    + '.handle-field { border:none; border-bottom:1.5px solid #333; width:120px; font-size:10px; background:transparent; outline:none; padding:1px 2px; }'
    + '.sign-off-box { margin-top:8px; background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; padding:6px 10px; }'
    + '.sig-line { border:none; border-bottom:1.5px solid #333; flex:1; min-width:120px; font-size:10px; background:transparent; outline:none; padding:1px 2px; }'
    + '.agreement-section { margin-bottom:14px; }'
    + '.agreement-section .ag-title { font-weight:700; font-size:11px; margin-bottom:4px; }'
    + '.agreement-section .ag-body { font-size:10px; color:#333; line-height:1.55; margin-bottom:6px; }'
    + '.sig-block { display:flex; align-items:center; gap:10px; margin-top:6px; font-size:10px; }'
    + '.badge-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:4px; }'
    + '.hw-badge { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:#222; color:#fff; font-size:9px; font-weight:700; flex-shrink:0; }'
    + '.hw-label { font-size:10px; }'
    + '.window-signoff-label { display:flex; align-items:center; gap:6px; margin:3px 0; font-size:10px; }'
    + '@media print { .page { page-break-after: always; } .page:last-child { page-break-after: auto; } }'
    + '</style>';

  function pageHeader(pageN, extraTitle) {
    var logoHtml = logoSrc ? '<img src="'+_esc(logoSrc)+'" style="height:72px;width:auto;" alt="Spartan"/>' : '<div style="width:90px;height:72px;"></div>';
    return '<div class="page-header">'
      + '<div class="logo-col">'+logoHtml+'</div>'
      + '<div class="header-meta">'
      +   '<div style="font-size:18px;font-weight:700;">Final Sign Off (Replacement)</div>'
      +   '<table style="font-size:10px;margin-top:4px;border-collapse:collapse;margin-left:auto;">'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Date</td><td style="padding:1px 0;font-weight:700;">'+_esc(dateStr)+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Page</td><td style="padding:1px 0;font-weight:700;">'+pageN+' of '+totalPages+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Items</td><td style="padding:1px 0;font-weight:700;">'+items.length+'</td></tr>'
      +   '</table>'
      +   '<div class="project-pill">'+_esc(projectName)+'</div>'
      + '</div>'
      + '</div>'
      + '<div class="company-strip">'
      +   '<div>'+_esc(co.address1 || '')+(co.address2?' / '+_esc(co.address2):'')+(co.address3?' / '+_esc(co.address3):'')+'</div>'
      +   '<div>'+_esc(co.phone || '')+'</div>'
      +   '<div>'+_esc(co.email || '')+'</div>'
      +   '<div>'+_esc(co.website || '')+'</div>'
      +   '<div style="color:#555;margin-top:2px;">'+_esc(co.abnVic || co.abn || '')+' (VIC Branch) / '+_esc(co.abnAct || '')+' (ACT Branch) / '+_esc(co.abnSa || '')+' (SA Branch)</div>'
      + '</div>';
  }

  // Helper: product type label
  var PRODUCT_LABELS = {
    awning_window:'Awning uPVC Windows', casement_window:'Casement uPVC Windows',
    tilt_turn_window:'Tilt & Turn uPVC Windows', fixed_window:'Fixed uPVC Windows',
    sliding_window:'Sliding uPVC Windows', sliding_door:'Sliding uPVC Door',
    french_door:'French uPVC Door', bi_fold_door:'Bi-Fold uPVC Door',
    awning_door:'Awning uPVC Door',
  };

  function productLabel(f) {
    return PRODUCT_LABELS[f.productType] || (f.productType||'Window/Door').replace(/_/g,' ');
  }

  function glassDesc(f) {
    var spec = f.glassSpec || '4/16/4';
    var parts = spec.split('/');
    var inner = parts[0]||'4', gap = parts[1]||'16', outer = parts[2]||'4';
    return inner+'mm ('+gap+' Argon Filled) '+outer+'mm Safety Glass – Low-E Eco S/E';
  }

  function hardwareDesc(f) {
    var items = [];
    var pt = f.productType || '';
    if (pt === 'tilt_turn_window') items.push('TW Cross Arm Winder');
    else if (pt === 'casement_window') items.push('Casement Handle');
    else if (pt === 'awning_window') items.push('Cross Arm Winder');
    else if (pt.indexOf('sliding') !== -1) items.push('Sliding Lock & Handle');
    else if (pt.indexOf('door') !== -1) items.push('Door Handle Set');
    if (f.showFlyScreen && frameHasAnySash(f)) items.push('Fixed Fly Screen');
    var hwc = (f.hardwareColour||'White');
    return items.map(function(i){ return i+' – '+(hwc.charAt(0).toUpperCase()+hwc.slice(1)); }).join(', ');
  }

  function hw_badges(f) {
    var badges = [];
    var pt = f.productType || '';
    if (pt === 'tilt_turn_window') badges.push({ code:'TW', label:'TW Cross Arm Winder', sub:'Cross Arm Winder\n'+(f.hardwareColour||'White').charAt(0).toUpperCase()+(f.hardwareColour||'White').slice(1) });
    else if (pt === 'casement_window') badges.push({ code:'CH', label:'Casement Handle', sub:'Casement Handle\n'+(f.hardwareColour||'White').charAt(0).toUpperCase()+(f.hardwareColour||'White').slice(1) });
    else badges.push({ code:'TW', label:'Cross Arm Winder', sub:'Cross Arm Winder\n'+(f.hardwareColour||'White').charAt(0).toUpperCase()+(f.hardwareColour||'White').slice(1) });
    if (f.showFlyScreen && frameHasAnySash(f)) badges.push({ code:'FS', label:'Fixed Fly Screen', sub:'Fixed Fly Screen' });
    return '<div class="badge-row">'
      + badges.map(function(b){
          return '<div style="display:flex;align-items:flex-start;gap:5px;margin-right:10px;">'
            + '<span class="hw-badge">'+b.code+'</span>'
            + '<div style="font-size:10px;line-height:1.4;"><div style="font-weight:700;">'+_esc(b.label)+'</div><div style="color:#555;white-space:pre-line;">'+_esc(b.sub)+'</div></div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  var pages = [];

  // ─── FRAME PAGES ───
  items.forEach(function(f, i) {
    var pageN = i + 1;
    var fid = 'fsof'+i;

    // Views (External = front, Internal = back)
    var extImg = f.thumbnailFront ? '<img src="'+f.thumbnailFront+'" style="width:140px;height:130px;object-fit:contain;border:1px solid #ccc;display:block;" />' : '<div style="width:140px;height:130px;border:1px solid #ccc;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;">No Preview</div>';
    var intImg = f.thumbnailBack  ? '<img src="'+f.thumbnailBack+'"  style="width:140px;height:130px;object-fit:contain;border:1px solid #ccc;display:block;" />' : '<div style="width:140px;height:130px;border:1px solid #ccc;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;">No Preview</div>';

    // Colour labels
    var extColour = (f.colour||'white_body').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
    var intColour = (f.colourInt||f.colour||'white_body').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});

    // Is tilt & turn or sliding (show handle height field)
    var showHandleHeight = (f.productType === 'tilt_turn_window' || (f.productType||'').indexOf('sliding') !== -1);

    var page = pageHeader(pageN)
      + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">Frame '+(i+1)+(f.name?' — '+_esc(f.name):'')+'</div>'

      // Handle fields row
      + '<div style="margin-bottom:8px;font-size:10px;">'
      + '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:4px;">'
      + '<div><strong>Handle Colour</strong>&nbsp;&nbsp;Internal: <input type="text" name="'+fid+'_hc_int" class="handle-field" placeholder="e.g. White"/> &nbsp; External: <input type="text" name="'+fid+'_hc_ext" class="handle-field" placeholder="e.g. White"/></div>'
      + '</div>'
      + (showHandleHeight ? '<div style="margin-top:4px;"><strong>Handle Height</strong> <span style="color:#555;">(Tilt &amp; Turn/Sliding Only — e.g. -100 for lower / +100 for higher)</span>&nbsp;&nbsp;<input type="text" name="'+fid+'_hh" class="handle-field" style="width:160px;" placeholder="0"/></div>' : '')
      + '</div>'

      // Window sign off field (short)
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:10px;">'
      + '<strong>Window Sign Off</strong>'
      + '<input type="text" name="'+fid+'_signoff" style="border:none;border-bottom:1.5px solid #333;width:200px;font-size:10px;background:transparent;outline:none;padding:1px 2px;" placeholder="Surveyor initial/notes"/>'
      + '</div>'

      // Main section: views + specs
      + '<div class="frame-section">'

      // Left: external + internal views
      + '<div>'
      + '<div style="font-weight:700;font-size:10px;color:#555;text-align:center;margin-bottom:2px;">External</div>'
      + extImg
      + '<div style="font-weight:700;font-size:10px;color:#555;text-align:center;margin-top:8px;margin-bottom:2px;">Internal</div>'
      + intImg
      + '</div>'

      // Right: specs
      + '<div class="frame-specs">'

      // Frame spec block
      + '<div class="spec-block">'
      + '<div class="block-title">Frame</div>'
      + '<div style="display:flex;align-items:flex-start;gap:10px;">'
      + '<div style="font-size:24px;">&#9723;</div>'
      + '<div>'
      + '<div style="font-weight:700;font-size:10px;">'+_esc(productLabel(f))+'</div>'
      + '<div style="font-size:10px;">'+_esc(f.panelCount||1)+'x'+_esc(f.panelCount||1)+'</div>'
      + '<div style="margin-top:4px;display:flex;gap:14px;">'
      + '<div><span style="color:#555;font-size:9px;">External</span><br/><span style="font-size:10px;">'+_esc(extColour)+' Body Colour</span></div>'
      + '<div><span style="color:#555;font-size:9px;">Internal</span><br/><span style="font-size:10px;">'+_esc(intColour)+' Body Colour</span></div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>'

      // Glazing spec block
      + '<div class="spec-block">'
      + '<div class="block-title">Glazing</div>'
      + '<div class="spec-row">'+_esc(glassDesc(f))+'</div>'
      + '<div style="font-size:9px;color:#555;margin-top:2px;">Black Spacer Bar</div>'
      + '</div>'

      // Hardware spec block
      + '<div class="spec-block">'
      + '<div class="block-title">Hardware</div>'
      + hw_badges(f)
      + '</div>'

      + '</div>' // end frame-specs
      + '</div>'; // end frame-section

    pages.push(page);
  });

  // ─── AGREEMENT PAGE 1 (Window Design Confirmation) ───
  var agPage1 = pageHeader(items.length + 1, 'Window Design Confirmation and Approval Agreement')
    + '<div style="font-weight:700;font-size:13px;margin-bottom:10px;">Window Design Confirmation and Approval Agreement</div>'
    + '<div style="font-weight:700;font-size:11px;margin-bottom:8px;color:#c41230;">Window Details:</div>'
    + [
        { num:'1', title:'Opening Directions', body:'I confirm and approve the opening directions for the specified windows as followed in this document. I also acknowledge all items are viewed INTERNALLY.' },
        { num:'2', title:'Style of Opening', body:'I confirm and approve the style of opening for the specified windows and doors in this document.' },
        { num:'3', title:'Frame Colours', body:'I confirm and approve the frame color for the specified windows and doors in this document.' },
        { num:'4', title:'Transom and Mullion Heights', body:'I confirm and approve the transom and mullion heights specified windows and doors in this document.' },
        { num:'5', title:'Glass Types', body:'I confirm and approve the glass type for the specified windows and doors in this document.' },
        { num:'6', title:'Type of Low-E Coatings', body:'I confirm and approve the type of Low-E coating for the specified windows and doors in this document.' },
        { num:'7', title:'No door is flush to the floor line', body:'In most cases there is a step from the floor to the door frame. We can do our best to mitigate this but this cannot be guaranteed.' },
      ].map(function(ag) {
        return '<div class="agreement-section">'
          + '<div class="ag-title">'+ag.num+'. '+_esc(ag.title)+':</div>'
          + '<div class="ag-body">'+_esc(ag.body)+'</div>'
          + '<div class="sig-block"><strong>Client Signature</strong>&nbsp; X.<input type="text" name="ag_sig'+ag.num+'" class="sig-line" placeholder="___________________________"/></div>'
          + '<div style="margin-top:6px;font-size:9px;color:#aaa;">...</div>'
          + '</div>';
      }).join('');

  pages.push(agPage1);

  // ─── AGREEMENT PAGE 2 (Special Requests + Full Acceptance) ───
  var agPage2 = pageHeader(items.length + 2)
    + '<div style="font-weight:700;font-size:11px;margin-bottom:6px;">Special Requests:</div>'
    + '<div style="margin-bottom:10px;">'
    + Array(8).fill('').map(function(_,i){ return '<div style="border-bottom:1px solid #bbb;height:22px;margin-bottom:3px;"></div>'; }).join('')
    + '</div>'
    + '<div class="agreement-section">'
    + '<div class="ag-body">I agree that anything that has been verbally discussed is not applicable to this project. It must be here in writing. By signing below you agree to these terms and understand we will only be completing works as per our terms and conditions in our quotation and this survey document. All designs on this document will be what we are delivering. Not your quotation. It is important to think of anything you have discussed with the consultant is clear in this document. Otherwise it will not be accommodated too.</div>'
    + '<div class="sig-block" style="margin-top:8px;"><strong>Client Signature</strong>&nbsp; X.<input type="text" name="ag_full_accept" class="sig-line" placeholder="___________________________"/></div>'
    + '</div>'
    + '<div class="agreement-section" style="margin-top:14px;">'
    + '<div class="ag-title">I acknowledge that the following payment terms are applicable.</div>'
    + '<div class="ag-body" style="margin-bottom:4px;">'
    + '<div>1. The initial 5% was due prior to this measure.</div>'
    + '<div>2. The next 45% is due today on measurement to confirm your booking and order material.</div>'
    + '<div>3. The last 45% is due 7 business days prior to your installation date. Any delays may delay your installation date.</div>'
    + '<div>4. The final 5% balance is to paid on the day of completion before the installers leave.</div>'
    + '</div>'
    + '<div class="sig-block"><strong>Client Signature</strong>&nbsp; X.<input type="text" name="ag_payment" class="sig-line" placeholder="___________________________"/></div>'
    + '</div>'
    + '<div class="agreement-section" style="margin-top:14px;">'
    + '<div class="ag-body">I understand that the above-approved window design details will be used in the production and installation of my windows by Spartan Double Glazing. I acknowledge that any changes or modifications to the approved design details at survey may result in additional charges that will be quoted and agreed to by you (The client) and Spartan Double Glazing PTY LTD the company in writing.</div>'
    + '<div style="margin-top:6px;font-size:10px;font-weight:700;">By signing below, I signify my complete understanding and agreement with the specified window design details.</div>'
    + '<div class="sig-block" style="margin-top:8px;"><strong>Client Signature</strong>&nbsp; X.<input type="text" name="ag_final" class="sig-line" placeholder="___________________________"/></div>'
    + '</div>'
    + '<div style="margin-top:24px;font-size:10px;color:#555;text-align:center;">For any questions or further assistance, please contact us at '+_esc(co.phone||'1300 912 161')+' or '+_esc(co.email||'yuan@spartandoubleglazing.com.au')+'<br/>Thank you for entrusting Spartan Double Glazing with your window project. We look forward to delivering the exceptional results you deserve.</div>';

  pages.push(agPage2);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Final Sign Off – '+_esc(projectName)+'</title>'+styles+'</head><body>'
    + pages.map(function(p){ return '<div class="page">'+p+'</div>'; }).join('')
    + '</body></html>';
}

// Maps productType → which keys in profileCosts/steelCosts to use.
// Used by calculateFramePrice so changing a row in the Settings UI
// actually affects the right products. Lookup falls back to white if
// the colour variant doesn't exist for the system.
//
// Per Spartan supplier reality: the 14x307 70mm Frame (i4_frame) is the
// outer frame for *every* hinged/tilt/fixed/awning/casement/door product.
// Only sliding systems (HST85 lift-slide, Smart-Slide, Vario-Slide,
// Stacker) use their own dedicated frames. Sash differs per product:
//   awning/casement  → 10x355 75.5mm T-sash
//   tilt & turn      → 14x320 Z77 sash
//   fixed/sliding    → 14x320 Z77 sash
//   french/hinged/bifold → 14x330 Z105 door sash
function profileKeysForType(type) {
  if (type === 'awning_window' || type === 'casement_window')
    return { frame: 'i4_frame', sash: 'c4_sash755', mullion: 'i4_mullion84' };
  if (type === 'lift_slide_door')
    return { frame: 'ls_frame', sash: 'ls_sash100', mullion: 'ls_interlock' };
  if (type === 'smart_slide_door')
    return { frame: 'ss_frame140', sash: 'ss_sash97', mullion: 'ss_interlock' };
  if (type === 'vario_slide_door' || type === 'stacker_door')
    return { frame: 'vs_frame50_3t', sash: 'vs_sash90', mullion: 'vs_interlockD' };
  // Sliding window now correctly maps to Vario-Slide platform (72mm window
  // sash, 20x083 window interlock, 10x084 3-track frame by default). Was
  // previously falling through to the I4000 defaults — wrong profile family.
  if (type === 'sliding_window')
    return { frame: 'vs_frame50_3t', sash: 'vs_sash72', mullion: 'vs_interlockW' };
  if (type === 'french_door' || type === 'hinged_door' || type === 'bifold_door')
    return { frame: 'i4_frame', sash: 'i4_sash105z', mullion: 'i4_mullion84' };
  return { frame: 'i4_frame', sash: 'i4_sash77', mullion: 'i4_mullion84' };
}
function steelKeysForType(type) {
  // Awning/casement use the I4000 14x307 frame so they share the I4000 frame
  // steel; their T-sash uses the C4000 sash steel.
  if (type === 'awning_window' || type === 'casement_window')
    return { frame: 'generic_2mm', sash: 'c4_sash_steel_2mm', mullion: 'i4_mull_steel_25mm' };
  if (type === 'lift_slide_door')
    return { frame: 'ls_steel', sash: 'ls_steel', mullion: 'ls_steel' };
  return { frame: 'generic_2mm', sash: 'i4_sash_steel_2mm', mullion: 'i4_mull_steel_25mm' };
}

// ═══ FRAME PRICE CALCULATOR — Station-based, per-corner costing ═══
// REWRITTEN 2026-04-18: fixed the 10 systemic pricing bugs, added per-category
// waste, per-category markup, per-frame hardware override, supply-only flag,
// bar-mode cut optimization, and installation integrated into the price-list
// markup chain. Every BOM line carries its cut-size / quantity / rate / total
// so production module can consume it directly.
function calculateFramePrice(frame, pricingConfig) {
  var pc = pricingConfig || PRICING_DEFAULTS;
  var st = pc.stations || {};
  var pd = getProfileDims(frame.productType);
  var mk = pc.markups || {};

  // ═══ INPUTS ═══
  var w = frame.width / 1000, h = frame.height / 1000;
  var panels = frame.panelCount || 1;
  var type = frame.productType;

  // Frame-level flags
  // WIP23: supplyOnly is now derived from frame.installationType when present;
  // legacy frame.supplyOnly boolean still respected as fallback.
  var supplyOnly = (frame.installationType === 'supply_only') || (frame.installationType == null && frame.supplyOnly === true);
  var hardwareOverride = (typeof frame.hardwareCostOverride === 'number' && frame.hardwareCostOverride >= 0)
    ? frame.hardwareCostOverride : null;
  var profileOverrides = frame.profileOverrides || {};

  // Colour pricing: real-world a colour foil is applied per face. Profile
  // catalogue prices are for "fully foiled" (both faces). If only one face
  // is colour we apply a calibrated premium of the colour delta. 0.71 is
  // measured against live Aluplast pricing for Spartan in 2026 (see commit
  // history for derivation).
  var isExtColour = frame.colour && frame.colour !== 'white_body' && frame.colour !== 'creme';
  var isIntColour = frame.colourInt && frame.colourInt !== 'white_body' && frame.colourInt !== 'creme';
  var bothColour = isExtColour && isIntColour;
  var oneSideColour = (isExtColour || isIntColour) && !bothColour;
  var colourFactor = bothColour ? 1 : (oneSideColour ? 0.71 : 0);
  var isColour = bothColour;

  var isDoor = 'french_door hinged_door bifold_door lift_slide_door smart_slide_door vario_slide_door stacker_door'.split(' ').indexOf(type) >= 0;

  // Cell-grid / sash counting
  var ct = frame.cellTypes;
  var nRows = (ct && ct.length) ? ct.length : 1;
  var nCols = (ct && ct[0] && ct[0].length) ? ct[0].length : 1;
  var hasGrid = nRows > 1 || nCols > 1;
  var numVMullions = hasGrid ? (nCols - 1) : (panels > 1 ? panels - 1 : 0);
  var numHMullions = hasGrid ? (nRows - 1) : 0;
  if (!hasGrid && frame.transomPct && frame.transomPct > 0.05 && frame.transomPct < 0.95) numHMullions = 1;
  var numMullions = numVMullions + numHMullions;

  var numSashes = type === 'fixed_window' ? 0 : panels;
  if (hasGrid) {
    numSashes = 0;
    for (var rr = 0; rr < nRows; rr++) {
      for (var cc = 0; cc < nCols; cc++) {
        var celTyp = ct[rr][cc];
        if (celTyp && celTyp !== 'fixed' && celTyp !== 'solid') numSashes++;
      }
    }
  }
  var numRects = 1 + numSashes;
  var hasLowThreshold = (type === 'french_door' || type === 'hinged_door');
  var totalCorners = numRects * 4 + numMullions * 2 - (hasLowThreshold ? 2 : 0);

  // ─── Glazing apertures (for bead cutting + bead insertion + IGU ops) ───
  // Every cell that holds a glass pane contributes 4 bead pieces around its
  // perimeter. For grid layouts we count every non-solid cell (sashed and fixed
  // cells both have glass); for non-grid frames each panel is one aperture.
  // Shared so S5 (cut the beads) and S_glazing (insert beads, seat IGU) see
  // identical counts — was previously computed in two different places with
  // divergent formulas that disagreed on grid layouts.
  var totalApertures;
  if (hasGrid) {
    totalApertures = 0;
    for (var ar = 0; ar < nRows; ar++) {
      for (var ac = 0; ac < nCols; ac++) {
        if (ct[ar][ac] !== 'solid') totalApertures++;
      }
    }
  } else {
    totalApertures = panels;
  }
  var beadCuts = totalApertures * 4;

  // ─── WIP-PROFILE-LINKS: catalog-driven sightline override ───────────────
  // The legacy PROFILE_DIMS table sometimes disagrees with the actual linked
  // profile (e.g. PROFILE_DIMS.awning_window says frameW=75 but the linked
  // i4_frame catalog entry says sightlineMm=70). When the catalog has an
  // explicit sightline for the resolved frame/sash/mullion profile, prefer
  // it — that's the only way Profile Manager links produce consistent
  // dimensions across the legacy Profile sheet and the new Profile Cuts
  // sheet. Falls back to PROFILE_DIMS when the catalog lacks the data.
  (function () {
    var slinks = (pc.profileLinks && pc.profileLinks[type]) || {};
    var sysDefault = (typeof profileKeysForType === 'function')
      ? profileKeysForType(type) : { frame:null, sash:null, mullion:null };
    function resolvedKey(role) {
      if (profileOverrides[role]) return profileOverrides[role];
      if (slinks[role])           return slinks[role];
      return sysDefault[role];
    }
    function catalogSightline(profileKey) {
      if (!profileKey) return null;
      var catalog = (pc.profiles) || (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
      var entry = catalog[profileKey];
      if (!entry) return null;
      if (typeof entry.sightlineMm === 'number') return entry.sightlineMm;
      if (entry.bboxMm && typeof entry.bboxMm.w === 'number') return entry.bboxMm.w;
      return null;
    }
    var sFrame   = catalogSightline(resolvedKey('frame'));
    var sSash    = catalogSightline(resolvedKey('sash'));
    var sMullion = catalogSightline(resolvedKey('mullion'));
    pd = Object.assign({}, pd);
    if (sFrame   != null) pd.frameW   = sFrame;
    if (sSash    != null) pd.sashW    = sSash;
    if (sMullion != null) pd.mullionW = sMullion;
  })();

  var fw_m = pd.frameW / 1000, sw_m = pd.sashW / 1000, mw_m = pd.mullionW / 1000;
  var framePerim = (w + h) * 2;
  var sashPerim = 0, glassArea = 0, panelW = 0, panelH = h - fw_m * 2;

  if (type === 'fixed_window') {
    glassArea = (w - fw_m * 2) * panelH;
    panelW = w - fw_m * 2;
  } else {
    panelW = (w - fw_m * 2 - numMullions * mw_m) / Math.max(1, panels);
    sashPerim = (panelW + panelH) * 2 * numSashes;
    glassArea = Math.max(0, (panelW - sw_m * 2) * (panelH - sw_m * 2)) * panels;
  }

  // Glass area for cell grids — sum per cell (BUG-FIX: was using panels multiplier)
  if (hasGrid) {
    glassArea = 0;
    var cellW = (w - fw_m * 2 - numVMullions * mw_m) / nCols;
    var cellH = (h - fw_m * 2 - numHMullions * mw_m) / nRows;
    for (var rrg = 0; rrg < nRows; rrg++) {
      for (var ccg = 0; ccg < nCols; ccg++) {
        var cTyp = ct[rrg][ccg];
        var isSashed = cTyp && cTyp !== 'fixed' && cTyp !== 'solid';
        var cellPanelW = isSashed ? (cellW - sw_m * 2) : cellW;
        var cellPanelH = isSashed ? (cellH - sw_m * 2) : cellH;
        if (cellPanelW > 0 && cellPanelH > 0) glassArea += cellPanelW * cellPanelH;
      }
    }
  }

  var ovhd = pc.overheadMultiplier || 1.22;
  var waste = pc.waste || {
    profile: pc.wasteFactor || 1.05, steel: pc.wasteFactor || 1.05,
    glass: pc.wasteFactor || 1.05, bead: pc.wasteFactor || 1.05,
    gasket: pc.wasteFactor || 1.05, hardware: 1.00, ancillaries: 1.00,
  };

  // ═══ STATION LABOUR HELPERS ═══
  function ot(stn, op) { var s = st[stn]; if (!s || !s.ops || !s.ops[op]) return 0; return s.ops[op].t; }
  function stnRate(stn) { var s = st[stn]; return (s && s.rate) || 40; }
  function labourCost(stn, mins) { return (mins / 60) * stnRate(stn) * ovhd; }

  // ═══ STATION MINUTES ═══
  var stationBreakdown = {};

  // S1: Double-Head Profile Saw — bead cutting moved to S5_hardware in WIP13.
  // beadCuts now lives in the shared geometric block (see above) and is
  // consumed by S5 (cut) and S_glazing (insert). moveStillage was removed
  // from the per-frame formula in WIP14 — it now fires once per save at the
  // save-builder level (the stored op time IS the per-job share; users
  // back-calculate from stillage duration ÷ jobs per stillage).
  // profileBars counts every PVC bar that goes through the double-head saw.
  // hasLowThreshold frames (french/hinged doors) replace the PVC bottom rail
  // with an aluminium threshold — aluminium is cut at S5_hardware (WIP15),
  // not on the PVC saw — so we exclude that one bar from the S1 count.
  var profileBars = numRects * 4 + numMullions - (hasLowThreshold ? 1 : 0);
  var s1_mins = profileBars * ot('S1_profileSaw','identifyGrab')
    + profileBars * ot('S1_profileSaw','loadSaw')
    + profileBars * ot('S1_profileSaw','doubleHeadCut')
    + profileBars * ot('S1_profileSaw','offcutReturn');
  stationBreakdown.S1_profileSaw = { mins: +s1_mins.toFixed(1), cost: +labourCost('S1_profileSaw', s1_mins).toFixed(2),
    detail: profileBars + ' bars double-cut' };

  // S2: Steel Saw
  // steelPieces counts the steel reinforcement inserts that go into each
  // PVC profile chamber. hasLowThreshold frames have no steel in the
  // bottom rail because the aluminium threshold is self-structural —
  // exclude that one piece from the S2 count (WIP15).
  var steelPieces = numRects * 4 + numMullions - (hasLowThreshold ? 1 : 0);
  var s2_mins = steelPieces * (ot('S2_steelSaw','identifyGrabSteel') + ot('S2_steelSaw','cutSteel') + ot('S2_steelSaw','slideInProfile'));
  stationBreakdown.S2_steelSaw = { mins: +s2_mins.toFixed(1), cost: +labourCost('S2_steelSaw', s2_mins).toFixed(2),
    detail: steelPieces + ' steel pieces cut + slid into profile' };

  // S4A: CNC Mill — WIP22 interim simplification (see config comment).
  // Assumes basic CNC does one drainage cycle per frame and one hardware
  // cycle per sash. Special cases (T&T gear slot, multi-point channel,
  // roller cutouts, mullion seat prep) are NOT modelled here — they'll
  // return as product-specific spec lookups once Aluplast/Siegenia DXFs
  // are uploaded and parsed.
  var s4a_mins = ot('S4A_cncMill','drainageCycle')
               + numSashes * ot('S4A_cncMill','hardwareCycle');
  stationBreakdown.S4A_cncMill = { mins: +s4a_mins.toFixed(1), cost: +labourCost('S4A_cncMill', s4a_mins).toFixed(2),
    detail: '1 drainage cycle' + (numSashes > 0 ? ' + ' + numSashes + ' sash hardware cycle(s)' : '') };

  // S4B: Steel Screw
  var screwsPer = (st.S4B_steelScrew && st.S4B_steelScrew.screwsPerSteel) || 4;
  var s4b_mins = steelPieces * (ot('S4B_steelScrew','alignSteel') + screwsPer * ot('S4B_steelScrew','driveScrew'));
  stationBreakdown.S4B_steelScrew = { mins: +s4b_mins.toFixed(1), cost: +labourCost('S4B_steelScrew', s4b_mins).toFixed(2),
    detail: steelPieces + ' steels x ' + screwsPer + ' screws = ' + (steelPieces*screwsPer) + ' screws' };

  // Welder — WIP21. French/hinged door outer frame is a U-shape (top rail +
  // 2 jambs) with the aluminium threshold screwed in, not welded. That means
  // the threshold rect has only 2 weld corners (both at the top, done in 1
  // cycle on the 2-head welder) and no turn. Sashes are unaffected — they
  // weld all 4 corners normally.
  var weldFullBundle = ot('S_welder','insertBlocks') + ot('S_welder','place3Profiles')
                     + ot('S_welder','weldCycle') + ot('S_welder','turnAndPlace4th')
                     + ot('S_welder','weldCycle');
  var weldThresholdBundle = ot('S_welder','insertBlocks') + ot('S_welder','place3Profiles')
                          + ot('S_welder','weldCycle');  // no turn, no 2nd cycle
  var normalRects = numRects - (hasLowThreshold ? 1 : 0);
  var thresholdRects = hasLowThreshold ? 1 : 0;
  var sw_mins = normalRects * weldFullBundle
              + thresholdRects * weldThresholdBundle
              + numMullions * ot('S_welder','mullionWeld');
  var swDetail = normalRects + ' rect(s) x 2 weld cycles';
  if (thresholdRects) swDetail += ' + ' + thresholdRects + ' threshold rect x 1 cycle';
  if (numMullions) swDetail += ' + ' + numMullions + ' mullion joints';
  stationBreakdown.S_welder = { mins: +sw_mins.toFixed(1), cost: +labourCost('S_welder', sw_mins).toFixed(2),
    detail: swDetail };

  // Corner cleaning
  var cc_mins = totalCorners * ot('S_cornerClean','cleanCorner') + numRects * ot('S_cornerClean','moveToTrolley');
  stationBreakdown.S_cornerClean = { mins: +cc_mins.toFixed(1), cost: +labourCost('S_cornerClean', cc_mins).toFixed(2),
    detail: totalCorners + ' corners cleaned + ' + numRects + ' moved to trolley' };

  // ─── S5: Siegenia Hardware Assembly ──────────────────────────────────
  // WIP16 restructure. Single-mode computation: perSash by product type is
  // the source of truth for per-sash hardware time. All 14 individual fit
  // ops (handleFit, hingeFit, etc.) and the hardwareLabourMode switch were
  // removed — the bundle vs granular discrepancy is no longer possible
  // because there's only one path. perSash.parts strings document what's
  // bundled. Gaskets (co-extruded) and drain caps (on-site) removed entirely.
  //
  // Per-X additions alongside the sash bundle:
  //   • mullionFit         per mullion             (WIP11)
  //   • cutBead            per aperture × 4         (WIP13)
  //   • thresholdCut       per french/hinged door   (WIP15)
  //   • colourCornerTouchUp per corner, coloured only (WIP16)
  //
  // fixed_window.perSash.t = 0 — no sash hardware at factory. Bead cuts,
  // corner touch-up, and mullion fit (if any) still apply via per-X ops.
  // Manual corner cleaning at the hardware bench (per rect) is noted as a
  // WIP17 follow-up.
  var hwPerSash = (st.S5_hardware && st.S5_hardware.perSash && st.S5_hardware.perSash[type]) || { t: 10 };
  var s5_mins = hwPerSash.t * Math.max(1, numSashes);
  var hwDetail = Math.max(1,numSashes) + ' sash x ' + hwPerSash.t + 'min — ' + ((hwPerSash.parts)||'');
  // Manual corner cleaning at the hardware bench — WIP17. Touch-up work
  // performed on every rect (outer frame + each sash) after the S_cornerClean
  // machine has done its pass. Unconditional — every frame and every sash
  // gets this attention regardless of product type or colour.
  s5_mins += numRects * ot('S5_hardware','manualCornerClean');
  hwDetail += ' + ' + numRects + ' manual corner clean';
  if (numMullions > 0) {
    s5_mins += numMullions * ot('S5_hardware','mullionFit');
    hwDetail += ' + ' + numMullions + ' mullion fit';
  }
  if (beadCuts > 0) {
    s5_mins += beadCuts * ot('S5_hardware','cutBead');
    hwDetail += ' + ' + beadCuts + ' bead cuts';
  }
  if (hasLowThreshold) {
    s5_mins += ot('S5_hardware','thresholdCut');
    hwDetail += ' + threshold cut';
  }
  // Corner colour touch-up (WIP16) — coloured frames only (white/creme
  // exempt). Applied at every welded corner: the weld-cleaning machine
  // exposes fresh PVC, which needs colour matching for coloured frames.
  // Reuses the isExtColour / isIntColour flags computed above at line 2439.
  if (isExtColour || isIntColour) {
    s5_mins += totalCorners * ot('S5_hardware','colourCornerTouchUp');
    hwDetail += ' + ' + totalCorners + ' corner touch-up';
  }
  stationBreakdown.S5_hardware = { mins: +s5_mins.toFixed(1), cost: +labourCost('S5_hardware', s5_mins).toFixed(2), detail: hwDetail };

  // Glazing — site-glazing work (bead insertion, IGU seating, sealant).
  // cutBeadPiece was removed in WIP13 (bead cutting moved to S5_hardware).
  // Counts are now aperture-based, not panels-based, so grid layouts with
  // fixed cells are counted correctly (previously undercounted).
  var gasketLen = panels > 0 ? panels * ((panelW - sw_m*2) + (panelH - sw_m*2)) * 2 : 0;
  if (type === 'fixed_window') gasketLen = ((w-fw_m*2)+(h-fw_m*2))*2;
  var sg_mins = beadCuts * ot('S_glazing','snapBeadPiece')
    + totalApertures * ot('S_glazing','positionIGU')
    + totalApertures * ot('S_glazing','sealantRun')
    + Math.max(0, gasketLen) * ot('S_glazing','insertGasket');
  stationBreakdown.S_glazing = { mins: +sg_mins.toFixed(1), cost: +labourCost('S_glazing', sg_mins).toFixed(2),
    detail: totalApertures + ' pane(s) + ' + beadCuts + ' bead inserts + ' + gasketLen.toFixed(1) + 'm gasket' };

  // S6: Reveals
  var revealPcs = 3;
  var s6_mins = revealPcs * (ot('S6_reveals','measureReveal') + ot('S6_reveals','cutReveal'))
    + ot('S6_reveals','assembleSet')
    + ot('S6_reveals','cutSill') + ot('S6_reveals','fitSill');
  stationBreakdown.S6_reveals = { mins: +s6_mins.toFixed(1), cost: +labourCost('S6_reveals', s6_mins).toFixed(2),
    detail: revealPcs + ' reveal pcs + sill' };

  // S7: Fly screen (only for windows with showFlyScreen true)
  var hasFlyScreen = frame.showFlyScreen !== false && !isDoor;
  var s7_mins = hasFlyScreen ? (4 * ot('S7_flyScreen','cutAlFrame') + ot('S7_flyScreen','cutMesh')
    + ot('S7_flyScreen','rollSpline') + 4 * ot('S7_flyScreen','pressCorner')
    + ot('S7_flyScreen','trimExcess') + ot('S7_flyScreen','fitPullTab')) : 0;
  stationBreakdown.S7_flyScreen = { mins: +s7_mins.toFixed(1), cost: +labourCost('S7_flyScreen', s7_mins).toFixed(2),
    detail: hasFlyScreen ? '4 frame cuts + mesh + spline + 4 corners' : '(no fly screen)' };

  // QC
  var qc_mins = ot('S_qc','dimCheck') + ot('S_qc','sealCheck') + ot('S_qc','visualInspect')
    + Math.max(1, numSashes) * ot('S_qc','operationCheck');
  stationBreakdown.S_qc = { mins: +qc_mins.toFixed(1), cost: +labourCost('S_qc', qc_mins).toFixed(2),
    detail: 'dims + seal + visual + ' + Math.max(1,numSashes) + ' operation checks' };

  // Dispatch
  var disp_mins = ot('S_dispatch','wrap') + ot('S_dispatch','label') + ot('S_dispatch','loadTruck');
  stationBreakdown.S_dispatch = { mins: +disp_mins.toFixed(1), cost: +labourCost('S_dispatch', disp_mins).toFixed(2),
    detail: 'wrap + label + load' };

  // Installation — WIP38 unification. The per-frame install minutes formula
  // now lives in computeFrameInstallMinutes (06-install-planning.js) and is
  // shared with autoCalcInstallPlanning. Both consumers stay in sync no
  // matter which Settings UI tab the user edits: Install Times Matrix,
  // S_install ops (sealTrim/cleanup), Install Planning baseMinutes (now
  // additive per property type), or floor add-on. supply_only correctly
  // returns 0 here too — no install line at all.
  var _instCalc = (typeof computeFrameInstallMinutes === 'function')
    ? computeFrameInstallMinutes(frame, pc)
    : { minutes: 0, detail: '', supplyOnly: supplyOnly, parts: {} };
  var inst_mins = _instCalc.minutes;
  var installDetail = _instCalc.detail;
  var inst_cost = labourCost('S_install', inst_mins);
  stationBreakdown.S_install = { mins: +inst_mins.toFixed(1), cost: +inst_cost.toFixed(2),
    detail: installDetail };

  // Total factory labour
  var factoryMins = 0, factoryLabour = 0;
  Object.keys(stationBreakdown).forEach(function(k) {
    if (k !== 'S_install') { factoryMins += stationBreakdown[k].mins; factoryLabour += stationBreakdown[k].cost; }
  });

  // ═══ MATERIALS (cut-size based with bar-nest option) ═══
  var prk = profileKeysForType(type);
  var stk = steelKeysForType(type);
  // WIP-PROFILE-LINKS: settings-level link (Profile Manager → Linked Products)
  // overrides system defaults but is itself overridden by per-frame edits.
  // Resolution order: per-frame override > settings link > system default.
  var settingsLinks = (pc.profileLinks && pc.profileLinks[type]) || {};
  if (settingsLinks.frame)   prk.frame   = settingsLinks.frame;
  if (settingsLinks.sash)    prk.sash    = settingsLinks.sash;
  if (settingsLinks.mullion) prk.mullion = settingsLinks.mullion;
  if (profileOverrides.frame)   prk.frame   = profileOverrides.frame;
  if (profileOverrides.sash)    prk.sash    = profileOverrides.sash;
  if (profileOverrides.mullion) prk.mullion = profileOverrides.mullion;

  var isVarioSlideType = (type === 'vario_slide_door' || type === 'stacker_door' || type === 'sliding_window');
  var vsTracks = (frame.tracks === 2) ? 2 : 3;
  if (isVarioSlideType && vsTracks === 2 && !profileOverrides.frame && !settingsLinks.frame) {
    prk.frame = 'vs_frame50_2t';
  }

  function profUnit(prefix, fallback) {
    // WIP36: unified entry shape (perMetreWhite/perMetreColour/perMetreBilateral)
    // with legacy fallback to _white / _colour suffixed keys for any
    // appSettings saved before the migration.
    var pcs = pc.profileCosts || {};
    var e = pcs[prefix];
    var wRate = null, cRate = null, biRate = null;
    if (e && (typeof e.perMetreWhite === 'number' || typeof e.perMetreColour === 'number')) {
      wRate = (typeof e.perMetreWhite === 'number') ? e.perMetreWhite : null;
      cRate = (typeof e.perMetreColour === 'number') ? e.perMetreColour : null;
      biRate = (typeof e.perMetreBilateral === 'number') ? e.perMetreBilateral : null;
    } else {
      // Legacy split-row shape
      var w_ = pcs[prefix + '_white'];
      var c_ = pcs[prefix + '_colour'];
      wRate = w_ && typeof w_.perMetre === 'number' ? w_.perMetre : null;
      cRate = c_ && typeof c_.perMetre === 'number' ? c_.perMetre : null;
      biRate = c_ && typeof c_.bilateralPerMetre === 'number' ? c_.bilateralPerMetre : null;
    }
    if (wRate == null && cRate == null) return fallback;
    if (wRate == null) wRate = cRate;
    if (cRate == null) cRate = wRate;
    if (bothColour) return cRate;
    if (!oneSideColour) return wRate;
    if (biRate != null) return biRate;
    return wRate + colourFactor * (cRate - wRate);
  }
  function profBarLen(prefix) {
    var pcs = pc.profileCosts || {};
    var e = pcs[prefix] || pcs[prefix + '_white'] || pcs[prefix + '_colour'];
    return (e && e.barLen) || 5.85;
  }
  function steelUnit(key, fallback) {
    var e = pc.steelCosts && pc.steelCosts[key];
    return e && typeof e.perMetre === 'number' ? e.perMetre : fallback;
  }
  function steelBarLen(key) {
    var e = pc.steelCosts && pc.steelCosts[key];
    return (e && e.barLen) || 5.80;
  }

  var mode = pc.pricingMode || 'linear';
  var trimM = (pc.trimAllowanceMm || 20) / 1000;
  var kerfM = (pc.sawKerfMm || 3) / 1000;

  // First-Fit Decreasing bar-nest — used in 'bar' mode only.
  function costForPieces(pieces, perMetreRate, barLenM, label) {
    var totalLen = 0, nCuts = 0;
    pieces.forEach(function(p){ totalLen += (p.len * p.qty); nCuts += p.qty; });
    var linearCost = totalLen * perMetreRate;
    var pcs = [];
    pieces.forEach(function(p){ for (var k = 0; k < p.qty; k++) pcs.push(p.len); });
    pcs.sort(function(a,b){ return b-a; });
    var usableBar = Math.max(0.1, barLenM - trimM * 2);
    var bins = [];
    for (var q = 0; q < pcs.length; q++) {
      var pcLen = pcs[q] + kerfM;
      var placed = false;
      for (var b = 0; b < bins.length; b++) {
        if (bins[b] >= pcLen) { bins[b] -= pcLen; placed = true; break; }
      }
      if (!placed) bins.push(usableBar - pcLen);
    }
    var barsNeeded = bins.length;
    var barCost = barsNeeded * barLenM * perMetreRate;
    var bomLines = pieces.filter(function(p){ return p.qty > 0; }).map(function(p){
      return { label: label, lenMm: Math.round(p.len * 1000), qty: p.qty, unitRate: +perMetreRate.toFixed(3),
               lineTotal: +(p.len * p.qty * perMetreRate).toFixed(2) };
    });
    return {
      linear:    +linearCost.toFixed(2),
      bar:       +barCost.toFixed(2),
      barsUsed:   barsNeeded,
      totalLenM: +totalLen.toFixed(3),
      nCuts:      nCuts,
      bomLines:   bomLines,
    };
  }
  function pickCost(c) { return mode === 'bar' ? c.bar : c.linear; }

  var bom = [];

  // ─── Frame profile (outer perimeter) ───
  var frameW_len = w, frameH_len = h;
  var frameRate = profUnit(prk.frame, isColour ? 19.15 : 10.42);
  var frameBar = profBarLen(prk.frame);
  var framePieces = hasLowThreshold
    ? [{ len: frameW_len, qty: 1 }, { len: frameH_len, qty: 2 }]    // PVC: top + 2 jambs
    : [{ len: frameW_len, qty: 2 }, { len: frameH_len, qty: 2 }];   // all 4 sides
  var frameC = costForPieces(framePieces, frameRate, frameBar, 'Frame ' + prk.frame);
  var frameProfileCost = pickCost(frameC);
  frameC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:prk.frame }, ln)); });

  // ─── Aluminium threshold (French/hinged doors) ───
  var thresholdCost = 0;
  if (hasLowThreshold) {
    var thEnt = pc.profileCosts && pc.profileCosts['i4_threshold_silver'];
    // Accept unified (perMetreWhite) or legacy (perMetre) shape — anodised
    // aluminium has no white/colour duality, so either field name fits.
    var thRate = (thEnt && typeof thEnt.perMetreWhite === 'number') ? thEnt.perMetreWhite
               : (thEnt && typeof thEnt.perMetre === 'number') ? thEnt.perMetre : 26.81;
    var thBar = (thEnt && thEnt.barLen) || 5.80;
    var thC = costForPieces([{ len: w, qty: 1 }], thRate, thBar, 'Alu Threshold 70mm');
    thresholdCost = pickCost(thC);
    thC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:'i4_threshold_silver' }, ln)); });
  }

  // ─── Sash profiles ───
  var sashProfileCost = 0;
  if (numSashes > 0) {
    var sashRate = profUnit(prk.sash, isDoor ? (isColour ? 28.76 : 18.08) : (isColour ? 20.54 : 10.36));
    var sashBar = profBarLen(prk.sash);
    var sashPieces = [
      { len: panelW, qty: 2 * numSashes },
      { len: panelH, qty: 2 * numSashes },
    ];
    var sashC = costForPieces(sashPieces, sashRate, sashBar, 'Sash ' + prk.sash);
    sashProfileCost = pickCost(sashC);
    sashC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:prk.sash }, ln)); });
  }

  // ─── Mullions (structural) ───
  var oH = h - fw_m * 2;
  var oW = w - fw_m * 2;
  var mullionRate = profUnit(prk.mullion, isColour ? 24.52 : 12.03);
  var mullionBar = profBarLen(prk.mullion);
  var nVMull = numVMullions;
  var nHMull = numHMullions;
  if (type === 'french_door' && nVMull > 0) nVMull -= 1;
  var mullionPieces = [];
  if (nVMull > 0) mullionPieces.push({ len: oH, qty: nVMull });
  if (nHMull > 0) mullionPieces.push({ len: oW, qty: nHMull });
  var mullionCost = 0;
  if (mullionPieces.length) {
    var mullC = costForPieces(mullionPieces, mullionRate, mullionBar, 'Mullion ' + prk.mullion);
    mullionCost = pickCost(mullC);
    mullC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:prk.mullion }, ln)); });
  }

  // ─── False mullion (French door) ───
  var falseMullionCost = 0;
  var falseMullionLen = 0;
  if (type === 'french_door') {
    var sashInsideH = Math.max(0, h - fw_m * 2 - sw_m * 2);
    falseMullionLen = sashInsideH;
    var fmRate = profUnit('i4_falsemull', isColour ? 17.82 : 11.57);
    var fmBar = profBarLen('i4_falsemull');
    var fmC = costForPieces([{ len: sashInsideH, qty: 1 }], fmRate, fmBar, 'False Mullion i4_falsemull');
    falseMullionCost = pickCost(fmC);
    fmC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:'i4_falsemull' }, ln)); });
  }

  // ─── Vario-Slide ancillary profiles (cover + guide rail) ───
  var coverProfileCost = 0;
  var guideRailCost = 0;
  if (isVarioSlideType) {
    var vsFrameFaceH = 0.050;
    var vsSashHeight = Math.max(0, h - vsFrameFaceH * 2);
    var vsCoverRate = profUnit('vs_cover', bothColour ? 6.14 : 2.07);
    var vsCoverBar = profBarLen('vs_cover');
    if (numSashes > 0 && vsSashHeight > 0) {
      var covC = costForPieces([{ len: vsSashHeight, qty: 2 * numSashes }], vsCoverRate, vsCoverBar, 'Vario Cover vs_cover');
      coverProfileCost = pickCost(covC);
      covC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:'vs_cover' }, ln)); });
    }
    var guideRailEntry = pc.profileCosts && pc.profileCosts['vs_guideRail_silver'];
    var guideRailRate = (guideRailEntry && typeof guideRailEntry.perMetreWhite === 'number') ? guideRailEntry.perMetreWhite
                      : (guideRailEntry && typeof guideRailEntry.perMetre === 'number') ? guideRailEntry.perMetre : 3.32;
    var guideRailBar = (guideRailEntry && guideRailEntry.barLen) || 6.00;
    var grC = costForPieces([{ len: w, qty: 1 }], guideRailRate, guideRailBar, 'Guide Rail vs_guideRail');
    guideRailCost = pickCost(grC);
    grC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'profile', keySuffix:'vs_guideRail_silver' }, ln)); });
  }

  // ─── Steel reinforcement (mirrors profile lengths) ───
  var steelFrameRate = steelUnit(stk.frame, 8.50);
  var steelSashRate  = steelUnit(stk.sash,  8.50);
  var steelMullRate  = steelUnit(stk.mullion, 8.50);
  var steelFalseRate = steelUnit('i4_mull_steel_25mm', 5.96);
  var steelFrameC = costForPieces(framePieces, steelFrameRate, steelBarLen(stk.frame), 'Steel frame ' + stk.frame);
  var steelSashC = numSashes > 0 ? costForPieces([
    { len: panelW, qty: 2 * numSashes }, { len: panelH, qty: 2 * numSashes },
  ], steelSashRate, steelBarLen(stk.sash), 'Steel sash ' + stk.sash) : { linear:0, bar:0, barsUsed:0, totalLenM:0, nCuts:0, bomLines:[] };
  var steelMullC = mullionPieces.length ? costForPieces(mullionPieces, steelMullRate, steelBarLen(stk.mullion), 'Steel mull ' + stk.mullion) : { linear:0, bar:0, barsUsed:0, totalLenM:0, nCuts:0, bomLines:[] };
  var steelFalseC = falseMullionLen > 0 ? costForPieces([{ len: falseMullionLen, qty: 1 }], steelFalseRate, steelBarLen('i4_mull_steel_25mm'), 'Steel false mull') : { linear:0, bar:0, barsUsed:0, totalLenM:0, nCuts:0, bomLines:[] };
  var steelCost = pickCost(steelFrameC) + pickCost(steelSashC) + pickCost(steelMullC) + pickCost(steelFalseC);
  [steelFrameC, steelSashC, steelMullC, steelFalseC].forEach(function(sc){
    sc.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'steel' }, ln)); });
  });

  // ─── Glazing bead ───
  var beadLen = panels > 0 ? panels * ((panelW - sw_m*2) + (panelH - sw_m*2)) * 2 : 0;
  if (type === 'fixed_window') beadLen = ((w-fw_m*2)+(h-fw_m*2))*2;
  if (hasGrid) {
    beadLen = 0;
    var _cellW = (w - fw_m * 2 - numVMullions * mw_m) / nCols;
    var _cellH = (h - fw_m * 2 - numHMullions * mw_m) / nRows;
    for (var _rr = 0; _rr < nRows; _rr++) {
      for (var _cc = 0; _cc < nCols; _cc++) {
        var _cTyp = ct[_rr][_cc];
        var _isSashed = _cTyp && _cTyp !== 'fixed' && _cTyp !== 'solid';
        var _pW = _isSashed ? (_cellW - sw_m * 2) : _cellW;
        var _pH = _isSashed ? (_cellH - sw_m * 2) : _cellH;
        if (_pW > 0 && _pH > 0) beadLen += (_pW + _pH) * 2;
      }
    }
  }
  function _glassThicknessMm(specId) {
    if (!specId) return 24;
    var nums = String(specId).match(/\d+/g) || [];
    var sum = nums.reduce(function(a,n){ return a + (+n); }, 0);
    return sum > 0 ? sum : 24;
  }
  var glassMm = _glassThicknessMm(frame.glassSpec);
  var beadKey = 'bead_22mm_white';
  if (glassMm > 22 && glassMm <= 28) beadKey = 'bead_28mm_white';
  else if (glassMm > 28 && glassMm <= 34) beadKey = 'bead_34mm_white';
  else if (glassMm > 34) beadKey = 'bead_40mm_white';
  var beadColourKey = beadKey.replace('_white', '_colour');
  var beadCostsObj = pc.beadCosts || {};
  // Use colour bead when glazing-rebate face is coloured. pd.rebateSide tells us
  // which side the bead sits on (int for T&T/fixed, ext for casement/awning). If
  // a _colour variant for this thickness is missing from the catalogue, fall back
  // to the 22mm colour/white ratio applied to this thickness's white rate — so
  // colour pricing still affects the total instead of silently going flat.
  var rebateSide = pd.rebateSide || 'int';
  var beadFaceColoured = (rebateSide === 'int' && isIntColour) || (rebateSide === 'ext' && isExtColour);
  var useBeadColour = (bothColour || beadFaceColoured);
  var beadEntry = (useBeadColour && beadCostsObj[beadColourKey]) || beadCostsObj[beadKey];
  var beadKeyUsed = (useBeadColour && beadCostsObj[beadColourKey]) ? beadColourKey : beadKey;
  if (!beadEntry) beadEntry = beadCostsObj[Object.keys(beadCostsObj)[0]];
  var beadRate = (beadEntry && typeof beadEntry.perMetre === 'number') ? beadEntry.perMetre : 3.00;
  // Safety net: if colour was requested but only the white variant was found,
  // apply the 22mm colour/white ratio (~1.75x) so we don't silently charge white.
  if (useBeadColour && !beadCostsObj[beadColourKey]) {
    var ref22w = beadCostsObj['bead_22mm_white'], ref22c = beadCostsObj['bead_22mm_colour'];
    var ratio = (ref22c && ref22w && ref22w.perMetre > 0) ? (ref22c.perMetre / ref22w.perMetre) : 1.75;
    beadRate = beadRate * ratio;
  }
  var beadBar = (beadEntry && beadEntry.barLen) || 6.00;
  var nPanesTotal = hasGrid
    ? (function(){ var n = 0; for (var r = 0; r < nRows; r++) for (var c2 = 0; c2 < nCols; c2++) { var t = ct[r][c2]; if (t && t !== 'solid') n++; } return n; })()
    : Math.max(panels, (type === 'fixed_window' ? 1 : 0));
  var beadC = beadLen > 0 ? costForPieces([
    { len: beadLen / Math.max(1, nPanesTotal), qty: nPanesTotal },
  ], beadRate, beadBar, 'Bead ' + beadKeyUsed) : { linear:0, bar:0, barsUsed:0, totalLenM:0, nCuts:0, bomLines:[] };
  var beadCost = pickCost(beadC);
  beadC.bomLines.forEach(function(ln){ bom.push(Object.assign({ category:'bead', keySuffix:beadKeyUsed }, ln)); });

  // ─── Glass ───
  var glassEntry = pc.glassCosts && pc.glassCosts[frame.glassSpec];
  var glassRate = (glassEntry && typeof glassEntry.perSqm === 'number') ? glassEntry.perSqm : 78;
  var glassCost = glassArea * glassRate;
  bom.push({ category:'glass', label: 'Glass ' + (frame.glassSpec || 'default'), lenMm: 0, qty: 1,
             unitRate: glassRate, lineTotal: +glassCost.toFixed(2), areaM2: +glassArea.toFixed(3) });

  // ─── Hardware ───
  var hwUnitCost = hardwareOverride != null ? hardwareOverride : (pc.hardwareCosts[type] || 85);
  var hwCost = hwUnitCost * Math.max(1, numSashes);
  bom.push({ category:'hardware',
             label: 'Hardware set (' + type + ')' + (hardwareOverride != null ? ' [custom]' : ''),
             lenMm: 0, qty: Math.max(1, numSashes), unitRate: hwUnitCost, lineTotal: +hwCost.toFixed(2) });

  // ─── Gasket ───
  var anc = pc.ancillaries || {};
  var gasketLenTotal = framePerim + sashPerim;
  var gasketRate = anc.gasketPerMetre || 1.20;
  var gasketCost = gasketLenTotal * gasketRate;
  bom.push({ category:'gasket', label:'EPDM gasket', lenMm: Math.round(gasketLenTotal * 1000), qty:1,
             unitRate: gasketRate, lineTotal: +gasketCost.toFixed(2) });

  // ─── Ancillaries ───
  var ancillaryCost = (anc.drainageCapsPerFrame || 2.50)
                    + (anc.fixingsPerUnit || 6)
                    + (anc.sealantPerUnit || 4.50)
                    + (totalCorners * (anc.cornerConnectors || 1.80))
                    + (anc.deliveryPerUnit || 25)
                    + (isDoor ? (anc.revealSetPerDoor || 45) : (anc.revealSetPerWindow || 35))
                    + (isDoor ? 0 : (anc.sillPerWindow || 18))
                    + (hasFlyScreen ? (anc.flyScreenPerUnit || 45) : 0)
                    + (hasLowThreshold ? (anc.thresholdConnectorPerDoor || 6.00) : 0);
  bom.push({ category:'ancillaries', label:'Ancillaries (fixings, sealant, reveals, sill, caps)',
             lenMm:0, qty:1, unitRate: +ancillaryCost.toFixed(2), lineTotal: +ancillaryCost.toFixed(2) });

  // ═══ APPLY PER-CATEGORY WASTE + MARKUP ═══
  var profileGroup = frameProfileCost + sashProfileCost + mullionCost + falseMullionCost + thresholdCost + coverProfileCost + guideRailCost;
  var profileGroupFinal = profileGroup * (waste.profile || 1.08) * (1 + ((mk.materialMarkup || 0) / 100));
  var steelFinal       = steelCost     * (waste.steel || 1.06)   * (1 + ((typeof mk.steelMarkup === 'number' ? mk.steelMarkup : (mk.materialMarkup || 0)) / 100));
  var beadFinal        = beadCost      * (waste.bead || 1.12)    * (1 + ((typeof mk.beadMarkup === 'number' ? mk.beadMarkup : (mk.materialMarkup || 0)) / 100));
  var glassFinal       = glassCost     * (waste.glass || 1.03)   * (1 + ((mk.glassMarkup || 0) / 100));
  var hwFinal          = hwCost        * (waste.hardware || 1)   * (1 + ((mk.hardwareMarkup || 0) / 100));
  var gasketFinal      = gasketCost    * (waste.gasket || 1.10)  * (1 + ((typeof mk.gasketMarkup === 'number' ? mk.gasketMarkup : (mk.materialMarkup || 0)) / 100));
  var ancillariesFinal = ancillaryCost * (waste.ancillaries || 1)* (1 + ((mk.ancillaryMarkup || 0) / 100));

  var totalMaterial = profileGroupFinal + steelFinal + beadFinal + glassFinal + hwFinal + gasketFinal + ancillariesFinal;

  // ═══ FACTORY COST (station rate already × 1.22 overhead — no double-dip) ═══
  var factoryCost = totalMaterial + factoryLabour;
  if (mk.overheadPct && mk.overheadPct > 0) factoryCost *= (1 + mk.overheadPct / 100);

  // ═══ INSTALLATION COST (with its own markup) ═══
  var instMarked = inst_cost * (1 + ((mk.installationMarkup || 0) / 100));

  // ═══ FULL COST (factory + installation) — price-list markup applies to this ═══
  var fullCost = factoryCost + instMarked;

  // ═══ PRICE LISTS ═══
  // Each price list gets THREE values so the quotation can show frame and
  // installation as separate line items that sum correctly:
  //   priceListsFactory[id]  — price-list markup applied to factory cost only
  //   priceListsInstall[id]  — price-list markup applied to install cost only
  //   priceLists[id]         — total (sum of the two)
  // Legacy consumers that read priceLists[id] still get the full total.
  var priceLists = {};
  var priceListsFactory = {};
  var priceListsInstall = {};
  ((mk.priceLists) || []).forEach(function(pl){
    var mult = 1 + (pl.pct || 0) / 100;
    priceListsFactory[pl.id] = +((factoryCost * mult)).toFixed(2);
    priceListsInstall[pl.id] = +((instMarked  * mult)).toFixed(2);
    priceLists[pl.id]        = +((fullCost    * mult)).toFixed(2);
  });

  return {
    stations: stationBreakdown,
    materials: {
      frameProfile: +frameProfileCost.toFixed(2), sashProfile: +sashProfileCost.toFixed(2),
      mullion: +mullionCost.toFixed(2), falseMullion: +falseMullionCost.toFixed(2),
      threshold: +thresholdCost.toFixed(2),
      coverProfile: +coverProfileCost.toFixed(2), guideRail: +guideRailCost.toFixed(2),
      steel: +steelCost.toFixed(2), glazingBead: +beadCost.toFixed(2),
      glass: +glassCost.toFixed(2), hardware: +hwCost.toFixed(2),
      gasket: +gasketCost.toFixed(2), ancillaries: +ancillaryCost.toFixed(2),
      totalMaterial: +totalMaterial.toFixed(2),
      // Per-category post-waste + post-markup — useful for breakdown display
      profileGroupFinal: +profileGroupFinal.toFixed(2),
      steelFinal: +steelFinal.toFixed(2), beadFinal: +beadFinal.toFixed(2),
      glassFinal: +glassFinal.toFixed(2), hardwareFinal: +hwFinal.toFixed(2),
      gasketFinal: +gasketFinal.toFixed(2), ancillariesFinal: +ancillariesFinal.toFixed(2),
    },
    production: {
      factoryMinutes: +factoryMins.toFixed(1),
      factoryLabour: +factoryLabour.toFixed(2),
      totalCorners: totalCorners, profileBars: profileBars,
      steelPieces: steelPieces, numSashes: numSashes, numRects: numRects,
      numMullions: numMullions,
      // Per-station minutes map — ready for production module / capacity planning
      stationMinutes: Object.keys(stationBreakdown).reduce(function(a,k){
        if (k !== 'S_install') a[k] = stationBreakdown[k].mins;
        return a;
      }, {}),
    },
    installation: {
      minutes: +inst_mins.toFixed(1), cost: +inst_cost.toFixed(2),
      costMarked: +instMarked.toFixed(2), supplyOnly: supplyOnly,
    },
    bom: bom,
    costPrice:   +factoryCost.toFixed(2),  // factory only (legacy name kept for back-compat)
    fullCost:    +fullCost.toFixed(2),     // factory + installation
    installTotal:+instMarked.toFixed(2),
    priceLists:  priceLists,
    // Per-list factory and install portions so quotation / price panel can show
    // them as separate line items that sum to priceLists[id] at the same markup.
    priceListsFactory: priceListsFactory,
    priceListsInstall: priceListsInstall,
    hardwareOverride: hardwareOverride,
    pricingMode: mode,
    glassArea: +glassArea.toFixed(3),
    framePerimeter: +framePerim.toFixed(3),
    sashPerimeter: +sashPerim.toFixed(3),
  };
}

