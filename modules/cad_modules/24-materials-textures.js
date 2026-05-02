// Legacy constants — still used by grid builder and some sub-functions
// These are Ideal 4000 T&T defaults; product-specific overrides in buildProduct
const FW = 0.065;        // Default frame sightline 65mm (Ideal 4000 T&T frame 140007)
const SW = 0.077;        // Default sash width 77mm Z77 CL (140020)
const D  = 0.070;        // Default profile depth 70mm
const MW = 0.084;        // Mullion/transom width 84mm (140041)
const SASH_Z = 0.005;    // Sash 5mm proud of frame
const SASH_OVERLAP = 0.012;  // Sash overlaps frame rebate 12mm
const GLAZING_REBATE = 0.024; // Glazing rebate depth 24mm
const BEAD_PROUD = 0.004;    // Glazing bead 4mm proud
const FALSE_MULLION_W = 0.064; // False mullion 64mm (140066)

// ═══════════════════════════════════════════════════════════════════════════
// MATERIALS — Feature 3: tinted glass
// ═══════════════════════════════════════════════════════════════════════════

function makeMat(hex, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness, envMapIntensity: 0.45 });
}

// Fix 3: Photo-accurate uPVC material system
// Load embedded texture from TEXTURE_DATA base64
function loadEmbeddedTexture(id) {
  const b64 = TEXTURE_DATA[id];
  if (!b64) return null;
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + b64;
  const tex = new THREE.Texture(img);
  img.onload = () => { tex.needsUpdate = true; };
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  return tex;
}

// Generate procedural roughness map — high contrast, visible granularity
function makeRoughnessMap(roughness, cat) {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (cat === 'aludec') {
    // Powder-coat — subtle speckle, controlled contrast
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i/4) % W, py = Math.floor((i/4) / W);
      // Controlled speckle noise
      const grain = (Math.random() - 0.5) * 120 * roughness;
      // Subtle clumps
      const clump = Math.sin(px * 1.2 + Math.random()*2) * Math.cos(py * 0.9 + Math.random()*2) * 30 * roughness;
      const v = 128 + grain * 0.5 + clump * 0.2;
      d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, v));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (cat === 'wood') {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i/4) % W, py = Math.floor((i/4) / W);
      // Subtle directional grain
      const grain = Math.sin(px * 0.3 + Math.sin(py * 0.008) * 8) * 60 * roughness;
      const micro = (Math.random() - 0.5) * 40 * roughness;
      d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, 128 + grain * 0.4 + micro * 0.3));
    }
    ctx.putImageData(imgData, 0, 0);
  } else {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 80 * roughness;
      d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, 128 + noise));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// Generate bump map — heavy displacement for visible 3D surface texture
function makeBumpMap(roughness, cat) {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);

  if (cat === 'aludec') {
    // Subtle granules for powder-coat feel
    const count = Math.floor(2000 + roughness * 12000);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const sz = 0.5 + Math.random() * 2;
      const bright = Math.random() > 0.45;
      ctx.fillStyle = bright ? `rgba(255,255,255,${0.15 + roughness * 0.25})` : `rgba(0,0,0,${0.1 + roughness * 0.2})`;
      ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
    }
    // Mild raised clumps
    for (let i = 0; i < roughness * 200; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const bright = Math.random() > 0.4;
      ctx.fillStyle = bright ? `rgba(200,200,200,${0.1 + roughness*0.2})` : `rgba(50,50,50,${0.08 + roughness*0.15})`;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + Math.random()*2.5, 0, Math.PI*2); ctx.fill();
    }
  } else if (cat === 'wood') {
    // Subtle grain trenches
    for (let x = 0; x < W; x++) {
      const lineVal = Math.sin(x * 0.25 + Math.sin(x*0.05)*4) * 0.5 + 0.5;
      const bright = Math.round(128 + (lineVal - 0.5) * 100 * roughness);
      ctx.fillStyle = `rgb(${Math.max(0,Math.min(255,bright))},${Math.max(0,Math.min(255,bright))},${Math.max(0,Math.min(255,bright))})`;
      ctx.fillRect(x, 0, 1, H);
    }
    // Subtle pores / pitting
    for (let i = 0; i < roughness * 5000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = `rgba(0,0,0,${0.06 + roughness*0.15})`;
      ctx.fillRect(x, y, 0.5 + Math.random()*1, 1 + Math.random()*3);
    }
  } else {
    // Smooth — mild orange peel pitting
    for (let i = 0; i < roughness * 4000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const sz = 0.5 + Math.random() * 1.5;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${0.08+roughness*0.2})` : `rgba(0,0,0,${0.06+roughness*0.15})`;
      ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI*2); ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeProfileMat(colourDef) {
  if (!colourDef) colourDef = { hex: '#FDFCFA', cat: 'smooth', r: 0.20, m: 0.0, cc: 0.5, ccr: 0.08, envI: 0.6 };
  const rough = colourDef.r !== undefined ? colourDef.r : 0.5;
  const metal = colourDef.m !== undefined ? colourDef.m : 0.0;
  const cc = colourDef.cc !== undefined ? colourDef.cc : 0.0;
  const ccr = colourDef.ccr !== undefined ? colourDef.ccr : 0.5;
  const envI = colourDef.envI !== undefined ? colourDef.envI : 0.4;

  // Wood: procedural colour texture from hex + grain style + subtle texture maps
  if (colourDef.cat === 'wood') {
    const roughMap = makeRoughnessMap(rough, 'wood');
    const bumpMap = makeBumpMap(rough, 'wood');
    const bumpScale = 0.004 + rough * 0.012;
    const tex = makeWoodTexture(colourDef.hex, colourDef.grain || 'fine', colourDef);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    return new THREE.MeshPhysicalMaterial({
      map: tex, roughness: rough, metalness: metal,
      roughnessMap: roughMap,
      bumpMap: bumpMap, bumpScale: bumpScale,
      clearcoat: cc, clearcoatRoughness: ccr,
      envMapIntensity: envI, side: THREE.DoubleSide,
    });
  }

  // Aludec: satin uPVC finish with subtle micro-texture (visible up close only)
  if (colourDef.cat === 'aludec') {
    // Ultra-fine roughness variation — breaks CG flatness without visible pattern
    var mtCvs = document.createElement('canvas');
    mtCvs.width = 128; mtCvs.height = 128;
    var mtCtx = mtCvs.getContext('2d');
    var mtId = mtCtx.createImageData(128, 128);
    var baseR = Math.round(rough * 255);
    for (var mi2 = 0; mi2 < mtId.data.length; mi2 += 4) {
      var v = baseR + Math.round((Math.random() - 0.5) * 12); // ±6 variation (~2.5%)
      mtId.data[mi2] = mtId.data[mi2+1] = mtId.data[mi2+2] = Math.max(0, Math.min(255, v));
      mtId.data[mi2+3] = 255;
    }
    mtCtx.putImageData(mtId, 0, 0);
    var mtTex = new THREE.CanvasTexture(mtCvs);
    mtTex.wrapS = THREE.RepeatWrapping; mtTex.wrapT = THREE.RepeatWrapping;
    mtTex.repeat.set(3, 3);
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colourDef.hex),
      roughness: rough, metalness: 0.0,
      roughnessMap: mtTex,
      clearcoat: cc, clearcoatRoughness: ccr,
      envMapIntensity: envI,
      side: THREE.DoubleSide,
    });
  }

  // Smooth uPVC / any other category — clean plastic, soft reflections only
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colourDef.hex), roughness: rough, metalness: metal,
    clearcoat: cc, clearcoatRoughness: ccr,
    envMapIntensity: envI, reflectivity: 0.3,
    specularIntensity: 0.3, specularColor: new THREE.Color(0xffffff),
    side: THREE.DoubleSide,
  });
}

// Photorealistic procedural woodgrain canvas texture
// Designed to match real Aluplast uPVC foil samples (Turner Oak, Sheffield Oak, Golden Oak)
function makeWoodTexture(hex, grainStyle, ov) {
  const W = 1024, H = 1024, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(hex);
  // Derive tonal palette from hex — lighter base, dark/mid/light grain tones
  const br = Math.round(base.r*255), bg = Math.round(base.g*255), bb = Math.round(base.b*255);
  // Light base fill (foils are lighter than their catalogue swatch)
  const lr = Math.min(255, br + 28), lg = Math.min(255, bg + 22), lb = Math.min(255, bb + 12);
  // Dark grain colour
  const dr = Math.max(0, br - 55), dg = Math.max(0, bg - 50), db = Math.max(0, bb - 48);
  // Very dark accent
  const vr = Math.max(0, br - 85), vg = Math.max(0, bg - 78), vb = Math.max(0, bb - 72);
  // Highlight between grain
  const hr = Math.min(255, br + 42), hg = Math.min(255, bg + 36), hb = Math.min(255, bb + 20);

  // Grain configs per foil type
  const configs = {
    fine:       { density:450, fineW:[0.3,0.8], medW:[0.8,1.8], darkStr:[0.12,0.35], bands:14, bandW:[2,5], cathedrals:2, catScale:0.6, wave:1.5, knots:1, rays:8, micro:5 },
    heavy:      { density:550, fineW:[0.4,1.2], medW:[1.2,2.8], darkStr:[0.15,0.45], bands:20, bandW:[2,6], cathedrals:3, catScale:0.8, wave:1.2, knots:2, rays:12, micro:7 },
    broad:      { density:300, fineW:[0.6,1.5], medW:[1.5,4.0], darkStr:[0.12,0.38], bands:12, bandW:[3,10], cathedrals:2, catScale:1.0, wave:3.5, knots:2, rays:6, micro:6 },
    golden:     { density:500, fineW:[0.3,1.0], medW:[1.0,2.5], darkStr:[0.10,0.32], bands:16, bandW:[2,6], cathedrals:3, catScale:0.7, wave:2.0, knots:1, rays:10, micro:5 },
    golden_rich:{ density:480, fineW:[0.4,1.2], medW:[1.2,3.0], darkStr:[0.12,0.38], bands:18, bandW:[2,8], cathedrals:3, catScale:0.9, wave:2.8, knots:2, rays:8, micro:6 },
  };
  var preset = configs[grainStyle] || configs.golden;
  // Apply per-colour overrides (from Settings sliders) over the preset
  var o = ov || {};
  var cfg = {
    density:    o.gDensity !== undefined ? o.gDensity : preset.density,
    fineW:      preset.fineW,
    medW:       preset.medW,
    darkStr:    [o.gDarkness !== undefined ? o.gDarkness * 0.35 : preset.darkStr[0],
                 o.gDarkness !== undefined ? o.gDarkness * 0.5 + 0.05 : preset.darkStr[1]],
    bands:      o.gBands !== undefined ? Math.round(o.gBands) : preset.bands,
    bandW:      preset.bandW,
    cathedrals: o.gCath !== undefined ? Math.round(o.gCath) : preset.cathedrals,
    catScale:   preset.catScale,
    wave:       o.gWave !== undefined ? o.gWave : preset.wave,
    knots:      o.gKnots !== undefined ? Math.round(o.gKnots) : preset.knots,
    rays:       preset.rays,
    micro:      preset.micro,
  };

  // Simple seeded pseudo-random for consistent texture
  let seed = (br * 31 + bg * 17 + bb * 7 + cfg.density) & 0xFFFF;
  function srand() { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0xFFFFFF) / 0xFFFFFF; }

  // ── Layer 0: Light base fill ──
  ctx.fillStyle = `rgb(${lr},${lg},${lb})`;
  ctx.fillRect(0, 0, W, H);

  // ── Layer 1: Broad colour zones (heartwood/sapwood variation) ──
  for (let i = 0; i < 5; i++) {
    const zx = srand() * W;
    const zw = 80 + srand() * 200;
    const darker = srand() > 0.4;
    const grad = ctx.createLinearGradient(zx - zw, 0, zx + zw, 0);
    if (darker) {
      grad.addColorStop(0, `rgba(${dr},${dg},${db},0)`);
      grad.addColorStop(0.5, `rgba(${dr},${dg},${db},0.08)`);
      grad.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    } else {
      grad.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
      grad.addColorStop(0.5, `rgba(${hr},${hg},${hb},0.10)`);
      grad.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }

  // ── Layer 2: Dense fine grain lines (the main visible vertical texture) ──
  for (let i = 0; i < cfg.density; i++) {
    let x = srand() * W;
    const isFine = srand() > 0.35;
    const w = isFine
      ? cfg.fineW[0] + srand() * (cfg.fineW[1] - cfg.fineW[0])
      : cfg.medW[0] + srand() * (cfg.medW[1] - cfg.medW[0]);
    const strength = cfg.darkStr[0] + srand() * (cfg.darkStr[1] - cfg.darkStr[0]);
    const isDark = srand() > 0.3;
    const alpha = isDark ? strength : strength * 0.3;
    const cr = isDark ? (srand() > 0.7 ? vr : dr) : hr;
    const cg2 = isDark ? (srand() > 0.7 ? vg : dg) : hg;
    const cb = isDark ? (srand() > 0.7 ? vb : db) : hb;
    ctx.strokeStyle = `rgba(${cr},${cg2},${cb},${alpha})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    const freq = 0.001 + srand() * 0.003;
    const amp = cfg.wave * (0.3 + srand() * 0.7);
    const phase = srand() * Math.PI * 2;
    for (let y = 0; y < H; y += 4) {
      x += Math.sin(y * freq + phase) * amp + (srand() - 0.5) * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ── Layer 3: Wide growth bands (annual ring shadows visible on flat-sawn timber) ──
  for (let i = 0; i < cfg.bands; i++) {
    let x = srand() * W;
    const bw = cfg.bandW[0] + srand() * (cfg.bandW[1] - cfg.bandW[0]);
    const isDark = srand() > 0.25;
    const alpha = isDark ? 0.04 + srand() * 0.08 : 0.02 + srand() * 0.05;
    ctx.strokeStyle = isDark
      ? `rgba(${dr},${dg},${db},${alpha})`
      : `rgba(${hr},${hg},${hb},${alpha})`;
    ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(x, 0);
    const bfreq = 0.0005 + srand() * 0.002;
    const bamp = cfg.wave * 1.5;
    const bphase = srand() * 6;
    for (let y = 0; y < H; y += 12) {
      x += Math.sin(y * bfreq + bphase) * bamp + (srand() - 0.5) * 0.8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ── Layer 4: Cathedral arch patterns (curved grain around growth centres) ──
  for (let i = 0; i < cfg.cathedrals; i++) {
    const cx = W * 0.15 + srand() * W * 0.7;
    const cy = H * 0.15 + srand() * H * 0.7;
    const scale = cfg.catScale;
    const numRings = 18 + Math.round(srand() * 8);
    for (let a = 0; a < numRings; a++) {
      const radius = (15 + a * 14) * scale;
      // Higher alpha for dark bases (low lr values) so arcs show through
      const baseAlpha = lr < 140 ? 0.06 : 0.03;
      const arcAlpha = baseAlpha + srand() * 0.06;
      // Alternate between dark and slightly lighter arc lines
      const arcDark = srand() > 0.3;
      ctx.strokeStyle = arcDark
        ? `rgba(${vr},${vg},${vb},${arcAlpha})`
        : `rgba(${dr},${dg},${db},${arcAlpha * 0.7})`;
      ctx.lineWidth = 0.4 + srand() * 1.8;
      ctx.beginPath();
      const start = -Math.PI * 0.12 + srand() * 0.08;
      const end = Math.PI * 1.12 + srand() * 0.08;
      const squish = 0.35 + srand() * 0.15;
      ctx.ellipse(cx, cy, radius * squish, radius, srand() * 0.1, start, end);
      ctx.stroke();
    }
  }

  // ── Layer 5: Medullary rays (faint horizontal streaks crossing the grain) ──
  for (let i = 0; i < cfg.rays; i++) {
    const ry = srand() * H;
    const rx = srand() * W;
    const rw = 30 + srand() * 80;
    ctx.strokeStyle = `rgba(${hr},${hg},${hb},${0.04 + srand() * 0.06})`;
    ctx.lineWidth = 0.5 + srand() * 1;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + rw, ry + (srand() - 0.5) * 6);
    ctx.stroke();
  }

  // ── Layer 6: Subtle knot areas (darker patches where grain curves around) ──
  for (let i = 0; i < cfg.knots; i++) {
    const kx = 40 + srand() * (W - 80);
    const ky = 80 + srand() * (H - 160);
    const kr = 8 + srand() * 14;
    const kgrad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 3.5);
    kgrad.addColorStop(0, `rgba(${vr},${vg},${vb},0.18)`);
    kgrad.addColorStop(0.4, `rgba(${dr},${dg},${db},0.08)`);
    kgrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kgrad; ctx.fillRect(kx - kr*4, ky - kr*4, kr*8, kr*8);
    // Grain curves around knot
    for (let ring = 0; ring < 8; ring++) {
      ctx.strokeStyle = `rgba(${dr},${dg},${db},${0.02 + ring*0.008})`;
      ctx.lineWidth = 0.4 + srand() * 0.6;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr + ring * 4, kr * 0.5 + ring * 3, srand() * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Layer 7: Pixel-level micro-noise (foil printing texture) ──
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (srand() - 0.5) * cfg.micro;
    d[i]   = Math.max(0, Math.min(255, d[i] + noise));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + noise));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  return new THREE.CanvasTexture(canvas);
}

// Generate a woodgrain preview data URL for the Settings panel
function makeWoodPreviewDataURL(colourDef, pw, ph) {
  var cvs = document.createElement('canvas');
  cvs.width = pw || 300; cvs.height = ph || 80;
  var ctx = cvs.getContext('2d');
  var base = new THREE.Color(colourDef.hex);
  var br = Math.round(base.r*255), bg2 = Math.round(base.g*255), bb = Math.round(base.b*255);
  var lr = Math.min(255, br+28), lg = Math.min(255, bg2+22), lb = Math.min(255, bb+12);
  var dr = Math.max(0, br-55), dg = Math.max(0, bg2-50), db = Math.max(0, bb-48);
  var vr2 = Math.max(0, br-85), vg2 = Math.max(0, bg2-78), vb2 = Math.max(0, bb-72);
  var hr2 = Math.min(255, br+42), hg2 = Math.min(255, bg2+36), hb2 = Math.min(255, bb+20);

  // Read per-colour overrides or use preset defaults
  var presets = {fine:{d:450,dk:0.35,w:1.5,b:14,c:2,k:1},heavy:{d:550,dk:0.5,w:1.2,b:20,c:3,k:2},broad:{d:300,dk:0.38,w:3.5,b:12,c:2,k:2},golden:{d:500,dk:0.32,w:2.0,b:16,c:3,k:1},golden_rich:{d:480,dk:0.38,w:2.8,b:18,c:3,k:2}};
  var pr = presets[colourDef.grain||'golden']||presets.golden;
  var density = colourDef.gDensity !== undefined ? colourDef.gDensity : pr.d;
  var darkness = colourDef.gDarkness !== undefined ? colourDef.gDarkness : pr.dk;
  var wave = colourDef.gWave !== undefined ? colourDef.gWave : pr.w;
  var bands = colourDef.gBands !== undefined ? Math.round(colourDef.gBands) : pr.b;
  var caths = colourDef.gCath !== undefined ? Math.round(colourDef.gCath) : pr.c;

  // Seeded random for consistency
  var seed = (br * 31 + bg2 * 17 + bb * 7 + density) & 0xFFFF;
  function sr() { seed = (seed * 16807) % 2147483647; return (seed & 0xFFFFFF) / 0xFFFFFF; }

  // Base fill
  ctx.fillStyle = 'rgb('+lr+','+lg+','+lb+')';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // Colour zones
  for (var i = 0; i < 4; i++) {
    var zx = sr()*cvs.width, zw = 20+sr()*80;
    var grad = ctx.createLinearGradient(zx-zw,0,zx+zw,0);
    grad.addColorStop(0,'rgba('+dr+','+dg+','+db+',0)');
    grad.addColorStop(0.5,'rgba('+dr+','+dg+','+db+','+(0.04+sr()*0.06)+')');
    grad.addColorStop(1,'rgba('+dr+','+dg+','+db+',0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cvs.width, cvs.height);
  }

  // Scale density to preview size
  var prevDensity = Math.round(density * cvs.width / 1024);
  for (var i = 0; i < prevDensity; i++) {
    var x = sr()*cvs.width;
    var isDark = sr() > 0.3;
    var alpha = isDark ? darkness * (0.3 + sr()*0.7) : darkness * 0.2 * sr();
    var cr2 = isDark ? (sr() > 0.7 ? vr2 : dr) : hr2;
    var cg3 = isDark ? (sr() > 0.7 ? vg2 : dg) : hg2;
    var cb2 = isDark ? (sr() > 0.7 ? vb2 : db) : hb2;
    ctx.strokeStyle = 'rgba('+cr2+','+cg3+','+cb2+','+alpha+')';
    ctx.lineWidth = 0.3 + sr()*1.4;
    ctx.beginPath(); ctx.moveTo(x, 0);
    var freq = 0.02 + sr()*0.06;
    var amp = wave * 0.3 * (0.3+sr());
    var phase = sr() * 6.28;
    for (var y = 0; y < cvs.height; y += 3) {
      x += Math.sin(y*freq+phase)*amp+(sr()-0.5)*0.2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Growth bands
  var prevBands = Math.round(bands * cvs.width / 1024 * 1.5);
  for (var i = 0; i < prevBands; i++) {
    var x = sr()*cvs.width;
    ctx.strokeStyle = 'rgba('+dr+','+dg+','+db+','+(0.03+sr()*0.06)+')';
    ctx.lineWidth = 1.5+sr()*3;
    ctx.beginPath(); ctx.moveTo(x, 0);
    for (var y = 0; y < cvs.height; y += 6) { x += (sr()-0.5)*wave*0.5; ctx.lineTo(x, y); }
    ctx.stroke();
  }

  // Cathedral arcs
  var baseLum = (lr+lg+lb)/3;
  for (var i = 0; i < caths; i++) {
    var cx = cvs.width*0.15 + sr()*cvs.width*0.7;
    var cy = cvs.height*0.15 + sr()*cvs.height*0.7;
    var nRings = 10 + Math.round(sr()*5);
    for (var a = 0; a < nRings; a++) {
      var radius = (3 + a * 3.5);
      var aAlpha = baseLum < 140 ? (0.05+sr()*0.06) : (0.03+sr()*0.05);
      ctx.strokeStyle = sr()>0.3 ? 'rgba('+vr2+','+vg2+','+vb2+','+aAlpha+')' : 'rgba('+dr+','+dg+','+db+','+(aAlpha*0.7)+')';
      ctx.lineWidth = 0.3 + sr()*1.0;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius*(0.35+sr()*0.15), radius, sr()*0.1, -0.1, Math.PI*1.1);
      ctx.stroke();
    }
  }

  return cvs.toDataURL();
}

// Glazing bead material
function makeBeadMat(colourDef) {
  if (!colourDef) colourDef = { hex: '#FDFCFA', cat: 'smooth', r: 0.20, m: 0.0, cc: 0.4, ccr: 0.1 };
  const rough = Math.max(0.15, (colourDef.r || 0.3) - 0.1);
  const cc = Math.min(1.0, (colourDef.cc || 0.3) + 0.15);
  const matOpts = {
    color: new THREE.Color(colourDef.hex), roughness: rough, metalness: colourDef.m || 0.0,
    clearcoat: cc, clearcoatRoughness: colourDef.ccr || 0.3, reflectivity: 0.4, side: THREE.DoubleSide,
  };
  if (colourDef.cat === 'wood') {
    matOpts.roughnessMap = makeRoughnessMap(rough, 'wood');
  }
  return new THREE.MeshPhysicalMaterial(matOpts);
}

// Subtle surface noise for profile meshes
function addSurfaceNoise(mesh, intensity) {
  if (!intensity) intensity = 0.012;
  const pos = mesh.geometry.getAttribute('position');
  if (!pos) return;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const n = 1.0 - intensity/2 + Math.random() * intensity;
    colors.push(n, n, n);
  }
  mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh.material = mesh.material.clone();
  mesh.material.vertexColors = true;
}
function makeGlass(spec) {
  if (!spec || typeof spec === 'string') spec = GLASS_OPTIONS.find(g => g.id === spec) || GLASS_OPTIONS[0];
  var isObscure = spec.cat === 'Obscure';
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.tint),
    transmission: isObscure ? 0.3 : (spec.opacity < 0.3 ? 0.88 : 0.35),
    transparent: true, opacity: 1.0, depthWrite: true,
    roughness: isObscure ? 0.82 : 0.12,
    metalness: 0.0, ior: 1.3, reflectivity: 0.1,
    thickness: spec.thickness * 1.2,
    envMapIntensity: isObscure ? 0.2 : 0.3,
    clearcoat: 0.0, clearcoatRoughness: 0.5,
    specularIntensity: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}
function makeSeal() { return new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#0f0f0f"), roughness: 0.85, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6 }); }
function makeChrome(hwCol) {
  var cols = { white:'#e8e8e8', silver:'#c8c8c8', black:'#2a2a2a' };
  var c = cols[hwCol] || cols.white;
  return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.02, metalness: 1.0, envMapIntensity: 2.5, clearcoat: 1.0, clearcoatRoughness: 0.01, reflectivity: 1.0, specularIntensity: 1.0 });
}
function makeWhiteABS(hwCol) {
  var cols = { white:{ c:'#dcdcdc', out:'#444444' }, silver:{ c:'#b0b0b0', out:'#333333' }, black:{ c:'#1a1a1a', out:'#555555' } };
  var def = cols[hwCol] || cols.white;
  return new THREE.MeshPhysicalMaterial({ color: def.c, roughness: 0.15, metalness: 0.0, clearcoat: 0.85, clearcoatRoughness: 0.12, reflectivity: 0.55, envMapIntensity: 0.8, specularIntensity: 0.6 });
}
function makeHardwareOutline(hwCol) {
  var cols = { white:'#444444', silver:'#222222', black:'#666666' };
  return new THREE.MeshStandardMaterial({ color: cols[hwCol] || cols.white, roughness: 0.9, metalness: 0.0 });
}

