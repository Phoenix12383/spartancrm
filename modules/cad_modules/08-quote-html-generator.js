// ═══════════════════════════════════════════════════════════════════════════
// QUOTE GENERATOR
// Builds a complete HTML quote document matching Spartan's client format.
// Renders inside an iframe (inline, no popup) so Print always works.
// ═══════════════════════════════════════════════════════════════════════════

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _fmtMoney(n) {
  var v = Number(n) || 0;
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Dimension-tick SVG overlay — draws width/height callouts over a thumbnail.
// Padding = 5% of box dimensions, matching the ~90% window fill from captureFrameSnapshots,
// so ticks line up with the window edges in the image.
function dimensionOverlay(widthMm, heightMm, boxW, boxH) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+boxW+'" height="'+boxH+'" viewBox="0 0 '+boxW+' '+boxH+'" style="position:absolute;inset:0;pointer-events:none;">';
  var px = Math.round(boxW * 0.05), py = Math.round(boxH * 0.05);
  var x1 = px, x2 = boxW - px;
  var y1 = py, y2 = boxH - py;
  // Top dimension line — aligned to window edges
  svg += '<line x1="'+x1+'" y1="14" x2="'+x2+'" y2="14" stroke="#222" stroke-width="1"/>';
  svg += '<line x1="'+x1+'" y1="8" x2="'+x1+'" y2="20" stroke="#222" stroke-width="1"/>';
  svg += '<line x1="'+x2+'" y1="8" x2="'+x2+'" y2="20" stroke="#222" stroke-width="1"/>';
  svg += '<rect x="'+((x1+x2)/2-22)+'" y="4" width="44" height="14" fill="#ffffff"/>';
  svg += '<text x="'+((x1+x2)/2)+'" y="14" text-anchor="middle" font-size="11" font-family="Arial" fill="#222" font-weight="700">'+widthMm+'</text>';
  // Left dimension line
  svg += '<line x1="14" y1="'+y1+'" x2="14" y2="'+y2+'" stroke="#222" stroke-width="1"/>';
  svg += '<line x1="8" y1="'+y1+'" x2="20" y2="'+y1+'" stroke="#222" stroke-width="1"/>';
  svg += '<line x1="8" y1="'+y2+'" x2="20" y2="'+y2+'" stroke="#222" stroke-width="1"/>';
  svg += '<rect x="4" y="'+((y1+y2)/2-7)+'" width="20" height="14" fill="#ffffff"/>';
  svg += '<text x="14" y="'+((y1+y2)/2+4)+'" text-anchor="middle" font-size="11" font-family="Arial" fill="#222" font-weight="700" transform="rotate(-90,14,'+((y1+y2)/2)+')">'+heightMm+'</text>';
  svg += '</svg>';
  return svg;
}

// Fallback 2D schematic when a 3D thumbnail isn't available yet
function quoteSchematic2D(frame, filled) {
  var widthMm = frame.width, heightMm = frame.height;
  var MAX_W = 280, MAX_H = 260, M = 36;
  var sc = Math.min((MAX_W - M*2)/widthMm, (MAX_H - M*2)/heightMm);
  var W = widthMm*sc, H = heightMm*sc;
  var fw = Math.max(5, 65*sc);
  var svgW = W + M*2, svgH = H + M*2, ox = M, oy = M;
  var panels = Math.max(1, frame.panelCount || 1);
  var glassFill = filled ? '#dae6ef' : '#ffffff';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+svgW+'" height="'+svgH+'" viewBox="0 0 '+svgW+' '+svgH+'" style="display:block;margin:0 auto;">';
  svg += '<line x1="'+ox+'" y1="'+(oy-18)+'" x2="'+(ox+W)+'" y2="'+(oy-18)+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<line x1="'+ox+'" y1="'+(oy-23)+'" x2="'+ox+'" y2="'+(oy-13)+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<line x1="'+(ox+W)+'" y1="'+(oy-23)+'" x2="'+(ox+W)+'" y2="'+(oy-13)+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<text x="'+(ox+W/2)+'" y="'+(oy-22)+'" text-anchor="middle" font-size="9" font-family="Arial" fill="#333">'+widthMm+'</text>';
  svg += '<line x1="'+(ox-18)+'" y1="'+oy+'" x2="'+(ox-18)+'" y2="'+(oy+H)+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<line x1="'+(ox-23)+'" y1="'+oy+'" x2="'+(ox-13)+'" y2="'+oy+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<line x1="'+(ox-23)+'" y1="'+(oy+H)+'" x2="'+(ox-13)+'" y2="'+(oy+H)+'" stroke="#333" stroke-width="0.8"/>';
  svg += '<text x="'+(ox-24)+'" y="'+(oy+H/2+3)+'" text-anchor="middle" font-size="9" font-family="Arial" fill="#333" transform="rotate(-90,'+(ox-24)+','+(oy+H/2)+')">'+heightMm+'</text>';
  svg += '<rect x="'+ox+'" y="'+oy+'" width="'+W+'" height="'+H+'" fill="#ffffff" stroke="#1a1a1a" stroke-width="2.5"/>';
  svg += '<rect x="'+(ox+fw)+'" y="'+(oy+fw)+'" width="'+(W-fw*2)+'" height="'+(H-fw*2)+'" fill="'+glassFill+'" stroke="#1a1a1a" stroke-width="1"/>';
  // WIP18: removed double_hung_window branches (product not offered by Spartan;
  // not in PRODUCTS picker at line 42). Simple multi-panel path applies to every
  // product type with panels > 1.
  if (panels > 1) {
    var pw = (W - fw*2) / panels;
    for (var i = 1; i < panels; i++) {
      var mx = ox + fw + pw*i;
      svg += '<line x1="'+mx+'" y1="'+(oy+fw)+'" x2="'+mx+'" y2="'+(oy+H-fw)+'" stroke="#1a1a1a" stroke-width="2"/>';
    }
  }
  svg += '</svg>';
  return svg;
}

// ─── WIP10: the natural sash type for each product. Used when the user
// clicks "+" on an empty aperture — we don't offer a picker, we give them
// the sash that matches their chosen product. ───
function defaultSashTypeFor(productType) {
  switch (productType) {
    case 'awning_window':     return 'awning';
    case 'casement_window':   return 'casement_l';
    case 'tilt_turn_window':  return 'tilt_turn';
    case 'fixed_window':      return 'fixed';
    default:                  return 'fixed'; // doors / sliders drive sashes through panelCount, not cellTypes
  }
}

// ─── WIP10: Fly screens only apply to frames that contain at least one sash.
// Any non-'fixed' cell counts. After the addNewFrame / loadFrameState
// migration, cellTypes[0][0] accurately reflects single-aperture state too. ───
function frameHasAnySash(frame) {
  if (!frame) return false;
  var ct = frame.cellTypes;
  if (ct && ct.length && ct[0] && ct[0].length) {
    for (var r = 0; r < ct.length; r++) {
      for (var c = 0; c < ct[r].length; c++) {
        if (ct[r][c] && ct[r][c] !== 'fixed') return true;
      }
    }
    return false;
  }
  // No cellTypes at all — fall back to product heuristic
  var pt = frame.productType;
  if (pt === 'fixed_window') return false;
  return true;
}

function hardwareBadges(frame) {
  var type = frame.productType;
  var badges = [];
  if (type === 'awning_window' || type === 'casement_window') badges.push({code:'TW', label:'Cross Arm Winder'});
  if (type === 'tilt_turn_window') badges.push({code:'TT', label:'Tilt & Turn Handle'});
  if (type === 'sliding_window') badges.push({code:'SL', label:'Sash Lock'});
  if (['hinged_door','french_door','bifold_door','lift_slide_door','smart_slide_door','vario_slide_door','stacker_door'].indexOf(type) >= 0) badges.push({code:'HD', label:'Door Handle'});
  if (frame.showFlyScreen !== false && type !== 'hopper_window' && frameHasAnySash(frame)) badges.push({code:'FS', label:'Fixed Fly Screen'});
  return badges;
}

function renderBadge(code) {
  return '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1a1a1a;color:#fff;font-size:9px;font-weight:700;font-family:Arial,sans-serif;margin-right:4px;">'+_esc(code)+'</span>';
}

// Render a single view (front or back) — uses 3D thumbnail if available, falls back to 2D SVG
function viewWithDimensions(frame, which) {
  var boxW = 280, boxH = 260;
  var src = which === 'back' ? (frame.thumbnailBack || frame.thumbnailFront || frame.thumbnail) : (frame.thumbnailFront || frame.thumbnail);
  if (src) {
    // 3D thumbnail with dimension overlay
    return '<div style="position:relative;width:'+boxW+'px;height:'+boxH+'px;margin:0 auto;">'
      + '<img src="'+_esc(src)+'" style="width:100%;height:100%;object-fit:contain;display:block;"/>'
      + dimensionOverlay(frame.width, frame.height, boxW, boxH)
      + '</div>';
  }
  // Fallback: 2D schematic
  return quoteSchematic2D(frame, which === 'back');
}

function generateQuoteHTML(ctx) {
  var items = ctx.items || [];
  var s = ctx.appSettings;
  var co = s.company || {};
  var projectName = ctx.projectName || 'Project';
  var clientName = ctx.clientName || projectName;
  var priceListId = ctx.priceListId || 'trade';
  var logoSrc = ctx.logoSrc || '';
  var fwText = ((s.forewords || [])[0] || {}).text || '';
  var tcText = ((s.termsAndConditions || [])[0] || {}).text || '';
  var ancillaries = (ctx.projectAncillaries && ctx.projectAncillaries.length) ? ctx.projectAncillaries : (s.ancillaries || []);
  var promotions = ctx.projectPromotions || [];
  var gstRate = 10;

  var today = new Date();
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

  var pricedItems = items.map(function(f, i) {
    var fp;
    try { fp = calculateFramePrice(f, s.pricingConfig); }
    catch(e) { fp = { costPrice:0, priceLists:{}, priceListsFactory:{}, priceListsInstall:{}, installTotal:0 }; }
    // New calculator exposes priceListsFactory/priceListsInstall so frame and
    // install can be shown as separate line items that sum to the markup-total.
    // Fallback to legacy costPrice + installTotal if older calc shape present.
    var framePrice = (fp.priceListsFactory && fp.priceListsFactory[priceListId])
                  || (fp.priceLists && fp.priceLists[priceListId])
                  || fp.costPrice || 0;
    var install    = (fp.priceListsInstall && fp.priceListsInstall[priceListId])
                  || fp.installTotal || 0;
    // If fp.priceLists[priceListId] exists AND we fell back to it for framePrice,
    // it already includes install — zero out install to avoid double-count.
    if (!(fp.priceListsFactory && fp.priceListsFactory[priceListId]) && fp.priceLists && fp.priceLists[priceListId]) {
      install = 0;
    }
    return { frame: f, idx: i+1, framePrice: framePrice, install: install, total: framePrice + install };
  });

  var totalFrames = pricedItems.reduce(function(a,x){return a + x.framePrice;}, 0);
  var totalInstall = pricedItems.reduce(function(a,x){return a + x.install;}, 0);
  // Split ancillaries by discountability so a "% off" promotion only applies
  // to lines explicitly marked discountable.
  var ancDisc = 0, ancNonDisc = 0;
  ancillaries.forEach(function(a){
    var amt = Number(a.amount) || 0;
    if (a.disc !== false) ancDisc += amt; else ancNonDisc += amt;
  });
  var totalAncillaries = ancDisc + ancNonDisc;
  // Apply promotions in the same order as the Price panel: % first off the
  // gross of selected targets, then $ off capped at the remaining base.
  // Promotions with enabled === false are skipped entirely.
  var promoLines = []; var totalDiscount = 0;
  promotions.forEach(function(prm){
    if (prm.enabled === false) return;
    var base = 0;
    if (prm.applyFrames !== false) base += totalFrames;
    if (prm.applyInstall !== false) base += totalInstall;
    if (prm.applyAncillaries !== false) base += ancDisc;
    var d = prm.kind === 'pct' ? base * ((Number(prm.amount) || 0) / 100) : Math.min(Number(prm.amount) || 0, base);
    if (d > 0) {
      totalDiscount += d;
      promoLines.push({ name: prm.name || 'Promotion', kind: prm.kind, amount: prm.amount, discount: d });
    }
  });
  var subtotal = totalFrames + totalInstall + totalAncillaries - totalDiscount;
  if (subtotal < 0) subtotal = 0;
  // Effective overall discount % shown on the totals page so the customer sees
  // exactly what discount they're getting.
  var preDiscount = totalFrames + totalInstall + totalAncillaries;
  var effectiveDiscountPct = preDiscount > 0 ? (totalDiscount / preDiscount * 100) : 0;
  var gstAmount = subtotal - (subtotal / (1 + gstRate/100));
  var grandTotal = subtotal;

  var tcPageCount = 4;
  var totalPages = 1 + pricedItems.length + 1 + tcPageCount;

  function pageHeader(pageN, total) {
    var logoHtml = logoSrc ? '<img src="'+_esc(logoSrc)+'" style="height:78px;width:auto;" alt="Spartan"/>' : '<div style="width:90px;height:78px;"></div>';
    return '<div class="page-header">'
      + '<div class="logo-col">'+logoHtml+'</div>'
      + '<div class="header-meta">'
      +   '<div style="font-size:22px;font-weight:700;">Quotation</div>'
      +   '<table style="font-size:10px;margin-top:4px;border-collapse:collapse;margin-left:auto;">'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Date</td><td style="padding:1px 0;font-weight:700;">'+_esc(dateStr)+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Page</td><td style="padding:1px 0;font-weight:700;">'+pageN+' of '+total+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Items</td><td style="padding:1px 0;font-weight:700;">'+pricedItems.length+'</td></tr>'
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

  // Page 1: Cover + foreword
  var p1 = pageHeader(1, totalPages) + '<div class="page-body">'
    + '<div style="margin-top:18px;font-size:11px;line-height:1.55;">'
    + '<p style="margin:0 0 10px 0;">Dear '+_esc(clientName)+'</p>'
    + fwText.split(/\n\n+/).map(function(para) {
        if (/^(What's|Additional Information:)/i.test(para)) {
          var lines = para.split('\n');
          var heading = lines.shift();
          return '<p style="margin:10px 0 4px 0;font-weight:700;">'+_esc(heading)+'</p>' + (lines.length ? '<p style="margin:0 0 8px 0;">'+lines.map(_esc).join('<br/>')+'</p>' : '');
        }
        return '<p style="margin:0 0 8px 0;">'+_esc(para).replace(/\n/g,'<br/>')+'</p>';
      }).join('')
    + '</div></div>';
  pages.push(p1);

  // Item pages — one per frame
  pricedItems.forEach(function(pi, i) {
    var f = pi.frame;
    var prodMeta = PRODUCTS.find(function(p){return p.id===f.productType;});
    var prodLabel = prodMeta ? prodMeta.label : f.productType;
    var colourMeta = COLOURS.find(function(c){return c.id===f.colour;});
    var colourLabel = colourMeta ? colourMeta.label : (f.colour || 'White');
    var colourIntMeta = COLOURS.find(function(c){return c.id===(f.colourInt || f.colour);});
    var colourIntLabel = colourIntMeta ? colourIntMeta.label : colourLabel;
    var glassMeta = GLASS_OPTIONS.find(function(g){return g.id===f.glassSpec;});
    var glassLabel = glassMeta ? glassMeta.label : (f.glassSpec || '4/12/4');
    var glassDesc = glassMeta ? glassMeta.desc : '';
    var badges = hardwareBadges(f);
    var hardwareCol = f.hardwareColour === 'black' ? 'Black' : f.hardwareColour === 'silver' ? 'Silver' : 'White';
    var pageN = i + 2;

    var body = pageHeader(pageN, totalPages) + '<div class="page-body">'
      + '<div style="margin-top:14px;"><span style="font-size:14px;font-weight:700;">Frame '+pi.idx+'</span><span style="font-size:11px;color:#666;margin-left:12px;">'+f.width+' x '+f.height+'</span></div>'
      + '<div style="display:flex;gap:40px;justify-content:center;margin:20px 0 16px 0;">'
      +   '<div style="text-align:center;">'
      +     '<div style="font-size:10px;font-weight:700;margin-bottom:6px;text-align:left;">External</div>'
      +     viewWithDimensions(f, 'front')
      +     '<div style="margin-top:4px;">'+badges.map(function(b){return renderBadge(b.code);}).join('')+'</div>'
      +   '</div>'
      +   '<div style="text-align:center;">'
      +     '<div style="font-size:10px;font-weight:700;margin-bottom:6px;text-align:left;">Internal</div>'
      +     viewWithDimensions(f, 'back')
      +     '<div style="margin-top:4px;">'+badges.map(function(b){return renderBadge(b.code);}).join('')+'</div>'
      +   '</div>'
      + '</div>'
      + '<div style="max-width:560px;margin:0 auto;">'
      +   '<div class="info-block"><div class="info-title">Frame</div>'
      +     '<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;">'
      +       '<div style="width:36px;height:36px;border:2px solid #1a1a1a;box-sizing:border-box;"></div>'
      +       '<div><div style="font-weight:700;font-size:11px;">'+_esc(prodLabel)+' uPVC Windows</div><div style="font-size:10px;color:#333;">'+_esc(prodLabel)+' '+(f.panelCount||1)+'x1</div></div>'
      +     '</div>'
      +     '<div style="display:flex;gap:20px;">'
      +       '<div style="display:flex;gap:8px;align-items:center;"><div style="width:16px;height:16px;border-radius:50%;background:'+(colourMeta?colourMeta.hex:'#F2F0EC')+';border:1px solid #999;"></div><div><div style="font-size:9px;font-weight:700;">External</div><div style="font-size:9px;">'+_esc(colourLabel)+' Body Colour</div></div></div>'
      +       '<div style="display:flex;gap:8px;align-items:center;"><div style="width:16px;height:16px;border-radius:50%;background:'+(colourIntMeta?colourIntMeta.hex:'#F2F0EC')+';border:1px solid #999;"></div><div><div style="font-size:9px;font-weight:700;">Internal</div><div style="font-size:9px;">'+_esc(colourIntLabel)+' Body Colour</div></div></div>'
      +     '</div>'
      +     '<div style="display:flex;gap:10px;align-items:center;margin-top:8px;"><div style="font-size:18px;">&#8976;</div><div><div style="font-size:9px;font-weight:700;">Frame profile</div><div style="font-size:9px;">German Ideal 4000 Main Frame</div></div></div>'
      +   '</div>'
      +   '<div class="info-block"><div class="info-title">Glazing</div>'
      +     '<div style="display:flex;gap:10px;align-items:flex-start;">'
      +       '<div style="width:22px;height:22px;border-radius:50%;background:#dae6ef;border:1px solid #999;margin-top:2px;"></div>'
      +       '<div style="font-size:10px;line-height:1.4;"><div style="font-weight:700;">'+_esc(glassLabel)+'</div>'+(glassDesc?'<div style="color:#555;">'+_esc(glassDesc)+'</div>':'')+'<div style="color:#555;">Black Spacer Bar</div></div>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:12px;">'
      +     '<div class="info-block" style="flex:1;"><div class="info-title">Hardware</div>'
      +       badges.map(function(b){
                return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'+renderBadge(b.code)+'<div style="font-size:10px;"><div style="font-weight:700;">'+_esc(b.label)+'</div><div style="color:#555;">'+_esc(b.label)+(b.code==='TW'?' '+hardwareCol:'')+'</div></div></div>';
              }).join('')
      +     '</div>'
      +     '<div class="info-block" style="width:200px;"><div class="info-title">Price</div>'
      +       '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
      +         '<tr><td style="padding:4px 0;border-bottom:1px solid #e0e0e0;">Frame</td><td style="padding:4px 0;border-bottom:1px solid #e0e0e0;text-align:right;">'+_fmtMoney(pi.framePrice)+'</td></tr>'
      +         '<tr><td style="padding:4px 0;border-bottom:1px solid #e0e0e0;">Installation</td><td style="padding:4px 0;border-bottom:1px solid #e0e0e0;text-align:right;">'+_fmtMoney(pi.install)+'</td></tr>'
      +         '<tr><td style="padding:6px 0;font-weight:700;">Total</td><td style="padding:6px 0;font-weight:700;text-align:right;">'+_fmtMoney(pi.total)+'</td></tr>'
      +       '</table>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';
    pages.push(body);
  });

  // Totals page
  var pTotalsN = 2 + pricedItems.length;
  var promosBlock = promoLines.length > 0
    ? '<div class="info-block"><div class="info-title">Promotions</div>'
      + '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
      + promoLines.map(function(p){
          var label = p.kind === 'pct' ? (p.amount+'% off') : ('$'+(Number(p.amount)||0).toFixed(2)+' off');
          return '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">'+_esc(p.name)+' ('+label+')</td>'
               + '<td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;color:#c41230;">−'+_fmtMoney(p.discount)+'</td></tr>';
        }).join('')
      + '</table></div>'
    : '';
  var totalsPage = pageHeader(pTotalsN, totalPages) + '<div class="page-body">'
    + '<div class="info-block" style="margin-top:18px;"><div class="info-title">Ancillaries</div>'
    +   '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
    +     ancillaries.map(function(a) {
            return '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">'+_esc(a.name)+'</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;">'+_fmtMoney(a.amount)+'</td></tr>';
          }).join('')
    +   '</table>'
    + '</div>'
    + promosBlock
    + '<div class="info-block"><div class="info-title">Total</div>'
    +   '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
    +     '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">Frames</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;">'+_fmtMoney(totalFrames)+'</td></tr>'
    +     '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">Installation</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;">'+_fmtMoney(totalInstall)+'</td></tr>'
    +     '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">Ancillaries</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;">'+_fmtMoney(totalAncillaries)+'</td></tr>'
    +     (totalDiscount > 0 ? '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;color:#c41230;">Promotional discount ('+effectiveDiscountPct.toFixed(1)+'%)</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;color:#c41230;">−'+_fmtMoney(totalDiscount)+'</td></tr>' : '')
    +     '<tr><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;">Of which GST 10%</td><td style="padding:6px 0;border-bottom:1px solid #e8e8e8;text-align:right;">'+_fmtMoney(gstAmount)+'</td></tr>'
    +     '<tr><td style="padding:8px 0;font-weight:700;font-size:12px;">Total</td><td style="padding:8px 0;font-weight:700;font-size:12px;text-align:right;">'+_fmtMoney(grandTotal)+'</td></tr>'
    +   '</table>'
    + '</div></div>';
  pages.push(totalsPage);

  // T&C pages
  var bankDetailsHtml = 'Bank Details:\n\n'
    + 'VICTORIA BRANCH\nName: '+(co.bankVic && co.bankVic.name || '')+'\nBSB: '+(co.bankVic && co.bankVic.bsb || '')+'\nAccount: '+(co.bankVic && co.bankVic.account || '')+'\n________________________\n\n'
    + 'ACT BRANCH\nName: '+(co.bankAct && co.bankAct.name || '')+'\nBSB: '+(co.bankAct && co.bankAct.bsb || '')+'\nAccount: '+(co.bankAct && co.bankAct.account || '')+'\n________________________\n\n'
    + 'SA BRANCH\nName: '+(co.bankSa && co.bankSa.name || '')+'\nBSB: '+(co.bankSa && co.bankSa.bsb || '')+'\nAccount: '+(co.bankSa && co.bankSa.account || '')+'\n________________________';
  var fullTc = tcText.replace('[[BANK_DETAILS]]', bankDetailsHtml);
  var paragraphs = fullTc.split(/\n\n+/);
  var perPage = Math.ceil(paragraphs.length / tcPageCount);
  for (var tp = 0; tp < tcPageCount; tp++) {
    var slice = paragraphs.slice(tp*perPage, (tp+1)*perPage);
    if (slice.length === 0) continue;
    var pageNum = pTotalsN + 1 + tp;
    var isLast = (tp === tcPageCount - 1);
    var tcBody = pageHeader(pageNum, totalPages) + '<div class="page-body">'
      + '<div style="margin-top:14px;font-size:9.5px;line-height:1.45;">'
      + slice.map(function(para) {
          if (!para.trim()) return '';
          var first = para.split('\n')[0];
          var isHeading = /^[0-9]+\.\s+[A-Z]/.test(first) || /^[A-Z][A-Z\s\-&]{3,}$/.test(first.trim()) || /^(Payment Terms|Initial Deposit|Check Measure|Pre-Delivery|Completion|Bank Details:|Payment and Warranty|Architrave Selection|MISCELLANEOUS)/.test(first);
          if (isHeading) {
            var lines = para.split('\n');
            var hd = lines.shift();
            return '<p style="margin:8px 0 3px 0;font-weight:700;">'+_esc(hd)+'</p>' + (lines.length ? '<p style="margin:0 0 6px 0;">'+lines.map(_esc).join('<br/>')+'</p>' : '');
          }
          return '<p style="margin:0 0 6px 0;">'+_esc(para).replace(/\n/g,'<br/>')+'</p>';
        }).join('')
      + '</div>'
      + (isLast ? '<div style="margin-top:40px;font-size:10px;">'
          + '<div style="margin-bottom:24px;">Signed by Consultant</div>'
          + '<div>X.___________________________________________________</div>'
          + '<div style="margin-top:28px;margin-bottom:24px;">Signed by Owner</div>'
          + '<div>X.___________________________________________________</div>'
          + '</div>' : '')
      + '</div>';
    pages.push(tcBody);
  }

  var styles = '<style>'
    + '* { box-sizing: border-box; }'
    + 'body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:#222; background:#f0f0f0; }'
    + '.page { width:210mm; min-height:297mm; background:#fff; margin:10px auto; padding:14mm; page-break-after: always; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.12); }'
    + '.page:last-child { page-break-after:auto; }'
    + '.page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }'
    + '.logo-col { flex:0 0 auto; }'
    + '.header-meta { text-align:right; }'
    + '.project-pill { margin-top:18px; background:#e8e8e8; padding:10px 18px; font-weight:700; font-size:12px; display:inline-block; }'
    + '.company-strip { margin-top:14px; font-size:10px; line-height:1.5; }'
    + '.page-body { margin-top:6px; }'
    + '.info-block { background:#f5f5f5; padding:14px 16px; margin:10px 0; border-radius:4px; }'
    + '.info-title { font-weight:700; font-size:12px; margin-bottom:10px; }'
    + '@media print {'
    + '  body { background:#fff; }'
    + '  .page { margin:0; box-shadow:none; width:auto; min-height:auto; padding:14mm; }'
    + '}'
    + '@page { size: A4; margin:0; }'
    + '</style>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quotation - '+_esc(projectName)+'</title>'+styles+'</head><body>'
    + pages.map(function(p){return '<div class="page">'+p+'</div>';}).join('')
    + '</body></html>';
}

