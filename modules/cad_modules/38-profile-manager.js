// ═══════════════════════════════════════════════════════════════════════════
// PROFILE MANAGER COMPONENTS — unified Settings UI for profile catalog.
// Replaces the legacy split between Products→Profile systems and
// Pricing→Profile costs. One grid of profiles, with DXF import per row.
// ═══════════════════════════════════════════════════════════════════════════

function DXFPreviewSVG({ hull, chambers, overrides, accent, fill, stroke }) {
  if (!hull) return null;
  const W = hull.bbox.xmax || 70;
  const H = hull.bbox.ymax || 70;
  const pad = Math.max(2, Math.min(W, H) * 0.05);
  const path = (pts) => {
    if (!pts || !pts.length) return '';
    let d = 'M' + pts[0][0].toFixed(2) + ',' + (H - pts[0][1]).toFixed(2);
    for (let i = 1; i < pts.length; i++) d += 'L' + pts[i][0].toFixed(2) + ',' + (H - pts[i][1]).toFixed(2);
    return d + 'Z';
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={(-pad) + ' ' + (-pad) + ' ' + (W + 2*pad) + ' ' + (H + 2*pad)} preserveAspectRatio="xMidYMid meet" style={{ width:'100%', height:'100%' }}>
      <path d={path(hull.vertices)} fill={fill} stroke={stroke} strokeWidth={Math.max(0.4, W/200)} strokeLinejoin="round"/>
      {chambers.map((c, i) => (
        <path key={i} d={path(c.vertices)}
          fill={overrides[i] === 'ignore' ? 'transparent' : (fill === '#1a1a22' ? '#0a0a10' : '#ffffff')}
          stroke={overrides[i] === 'ignore' ? stroke : accent}
          strokeWidth={Math.max(0.3, W/250)} strokeLinejoin="round"
          strokeDasharray={overrides[i] === 'ignore' ? '2,2' : ''}/>
      ))}
    </svg>
  );
}

function DXFImportModal({ T, dk, target, existing, onClose, onSave }) {
  const [stage, setStage] = useState('drop');
  const [parsed, setParsed] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [meta, setMeta] = useState({
    name: (existing && existing.name) || '',
    code: (existing && existing.code) || '',
    role: (existing && (existing.role || (existing.polygon && existing.polygon.role))) || 'frame',
    system: (existing && existing.system) || '',
    description: '',
    sightlineMm: 0,
    depthMm: 0,
    weldAllowanceMm: 3,
    mitreAngleDeg: 45,
    requiresSteelReinforcement: false,
    // colouredFaceSide marks which side of the rendered cross-section is the
    // exterior (colour-foiled) face. Used by the Production view's profile
    // bar plan to draw a red highlight on the correct edge. Default 'right'
    // matches the Aluplast convention where DXF polygons are drawn with the
    // glazing rebate on the LEFT (interior) and wide outboard face on the
    // RIGHT (exterior). Inward-opening systems (e.g. tilt&turn) usually
    // need this set to 'left'. Editable per-profile in Settings.
    colouredFaceSide: (existing && existing.polygon && existing.polygon.colouredFaceSide) || 'right',
    productTypes: (existing && existing.polygon && existing.polygon.usedByProductTypes) || [],
    perMetre: (existing && existing.perMetre) || 0,
    barLen: (existing && existing.barLen) || 6.0,
  });
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file) => {
    setError(null);
    if (!file) return;
    if (!/\.dxf$/i.test(file.name)) {
      setError('Please drop a .dxf file. Binary DWG is not supported in-browser — export from your CAD as DXF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const out = parseDxfPolylines(text);
        if (!out.polylines.length) { setError('No polylines found. Ensure the profile is exported as LWPOLYLINE or POLYLINE.'); return; }
        const classified = autoClassifyPolylines(out.polylines);
        if (!classified.hull) { setError('No closed polyline found. The outer hull must be a closed polygon.'); return; }
        const norm = normalizePolygons(classified.hull, classified.chambers);
        setParsed({ hull: norm.hull, chambers: norm.chambers, others: classified.others });
        setMeta((m) => Object.assign({}, m, { sightlineMm: Math.round(norm.hull.bbox.xmax * 100) / 100, depthMm: Math.round(norm.hull.bbox.ymax * 100) / 100 }));
        setOverrides({});
        setStage('preview');
      } catch (err) {
        setError('Failed to parse DXF: ' + (err && err.message ? err.message : err));
      }
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files[0]); };

  const finalizeSave = () => {
    if (!meta.name || !meta.system) { setError('Name and system are required.'); return; }
    if (!parsed) return;
    const hullVerts = parsed.hull.vertices;
    const chamberVerts = parsed.chambers.filter((_, i) => overrides[i] !== 'ignore').map((c) => c.vertices);
    onSave(Object.assign({}, meta, { hull: hullVerts, chambers: chamberVerts }));
  };

  const inp = { width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text };
  const inpMono = Object.assign({}, inp, { fontFamily:'monospace' });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background:T.bgPanel, borderRadius:8, width:'90%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', border:'1px solid '+T.border }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid '+T.border, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{existing ? 'Re-import DXF' : 'Import profile from DXF'}</div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.textMuted, fontSize:18, cursor:'pointer' }}>\u00d7</button>
        </div>

        <div style={{ flex:1, padding:20, overflowY:'auto' }}>
          {error && <div style={{ padding:'8px 12px', background:'#dc262622', color:'#dc2626', borderRadius:4, fontSize:11, marginBottom:12 }}>\u26a0 {error}</div>}

          {stage === 'drop' && (
            <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)}
              onClick={() => document.getElementById('dxf-file-input').click()}
              style={{ border:'2px dashed '+(dragActive ? T.accent : T.border), borderRadius:8, padding:60, textAlign:'center', background: dragActive ? T.bgHover : T.bgCard, cursor:'pointer' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>\u25a2</div>
              <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:6 }}>Drop a DXF file here</div>
              <div style={{ fontSize:11, color:T.textMuted, lineHeight:1.5 }}>
                Or click to browse. The parser auto-detects the outer hull and inner chambers.<br/>
                For Aluplast/Siegenia profiles, save-as DXF from your CAD (R12 or later — all formats work).<br/>
                Binary DWG isn't supported in-browser; convert via the free ODA File Converter if needed.
              </div>
              <input type="file" accept=".dxf" id="dxf-file-input" style={{ display:'none' }} onChange={(e) => handleFile(e.target.files[0])}/>
            </div>
          )}

          {stage === 'preview' && parsed && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:T.text, marginBottom:6 }}>Preview</div>
                <div style={{ width:'100%', aspectRatio:'1', background: dk ? '#0a0a10' : '#fafafa', borderRadius:6, padding:8, border:'1px solid '+T.borderLight }}>
                  <DXFPreviewSVG hull={parsed.hull} chambers={parsed.chambers} overrides={overrides} accent={T.accent} fill={dk ? '#1a1a22' : '#f5f3ee'} stroke={dk ? '#ccc' : '#222'}/>
                </div>
                <div style={{ marginTop:8, fontSize:10, color:T.textSub }}>
                  Hull: {parsed.hull.vertices.length} pts \u00b7 Chambers: {parsed.chambers.length} ({Object.values(overrides).filter((v) => v === 'ignore').length} ignored) \u00b7 BBox: {Math.round(parsed.hull.bbox.xmax)} \u00d7 {Math.round(parsed.hull.bbox.ymax)} mm
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, fontWeight:600, color:T.text, marginBottom:6 }}>Detected loops ({parsed.chambers.length})</div>
                <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>Toggle each loop. Ignored loops won't appear as voids in the extrusion.</div>
                <div style={{ maxHeight:300, overflowY:'auto' }}>
                  {parsed.chambers.map((c, i) => {
                    const ignored = overrides[i] === 'ignore';
                    return (
                      <div key={i} onClick={() => setOverrides((o) => Object.assign({}, o, { [i]: ignored ? 'chamber' : 'ignore' }))}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:6, marginBottom:4, background: ignored ? 'transparent' : T.bgHover, border:'1px solid '+(ignored ? T.border : T.accent + '44'), borderRadius:4, cursor:'pointer', opacity: ignored ? 0.5 : 1 }}>
                        <div style={{ width:14, height:14, borderRadius:2, background: ignored ? 'transparent' : T.accent, border:'1px solid '+T.border, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10 }}>{ignored ? '' : '\u2713'}</div>
                        <div style={{ flex:1, fontSize:10, color:T.text }}>Chamber {i + 1} \u00b7 {c.vertices.length} pts \u00b7 {Math.round((c.bbox.xmax - c.bbox.xmin) * 10) / 10} \u00d7 {Math.round((c.bbox.ymax - c.bbox.ymin) * 10) / 10} mm</div>
                      </div>
                    );
                  })}
                  {parsed.chambers.length === 0 && <div style={{ fontSize:10, color:T.textMuted, fontStyle:'italic' }}>No chambers detected.</div>}
                </div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <button onClick={() => setStage('drop')} style={{ padding:'6px 12px', fontSize:11, background:T.bgHover, color:T.text, border:'1px solid '+T.border, borderRadius:4, cursor:'pointer' }}>\u2190 Back</button>
                  <button onClick={() => setStage('meta')} style={{ flex:1, padding:'6px 12px', fontSize:11, background:T.accent, color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600 }}>Next: profile details \u2192</button>
                </div>
              </div>
            </div>
          )}

          {stage === 'meta' && (
            <div style={{ maxWidth:600 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Name *</div><input value={meta.name} onChange={(e) => setMeta((m) => Object.assign({}, m, { name: e.target.value }))} style={inp}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Aluplast code</div><input value={meta.code} onChange={(e) => setMeta((m) => Object.assign({}, m, { code: e.target.value }))} style={inpMono}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>System *</div><input value={meta.system} onChange={(e) => setMeta((m) => Object.assign({}, m, { system: e.target.value }))} list="dxf-systems" style={inp}/>
                  <datalist id="dxf-systems"><option>Aluplast Ideal 4000</option><option>Aluplast Ideal 4000 Casement</option><option>Aluplast HST 85</option><option>Aluplast Smart-Slide 70</option><option>Aluplast Vario-Slide 3T</option></datalist>
                </div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Role</div>
                  <select value={meta.role} onChange={(e) => setMeta((m) => Object.assign({}, m, { role: e.target.value }))} style={inp}>
                    {['frame','sash','mullion','transom','threshold','bead','interlock','facade','reinforcement','other'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Sightline (mm)</div><input type="number" step="0.1" value={meta.sightlineMm} onChange={(e) => setMeta((m) => Object.assign({}, m, { sightlineMm: +e.target.value }))} style={inpMono}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Depth (mm)</div><input type="number" step="0.1" value={meta.depthMm} onChange={(e) => setMeta((m) => Object.assign({}, m, { depthMm: +e.target.value }))} style={inpMono}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Mitre angle (\u00b0)</div><input type="number" value={meta.mitreAngleDeg} onChange={(e) => setMeta((m) => Object.assign({}, m, { mitreAngleDeg: +e.target.value }))} style={inpMono}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Weld allowance (mm)</div><input type="number" step="0.5" value={meta.weldAllowanceMm} onChange={(e) => setMeta((m) => Object.assign({}, m, { weldAllowanceMm: +e.target.value }))} style={inpMono}/></div>
                <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }} title="Which side of the cross-section is the colour-foiled exterior face. Inwards-opening windows usually have the coloured face on the LEFT of the polygon as drawn; outwards-opening on the RIGHT. Used to flag the exterior side in the Production cut list.">Coloured face side</div><select value={meta.colouredFaceSide} onChange={(e) => setMeta((m) => Object.assign({}, m, { colouredFaceSide: e.target.value }))} style={inp}><option value="right">Right (outwards-opening)</option><option value="left">Left (inwards-opening)</option></select></div>
                {!existing && <>
                  <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>$/metre (white)</div><input type="number" step="0.01" value={meta.perMetre} onChange={(e) => setMeta((m) => Object.assign({}, m, { perMetre: +e.target.value }))} style={inpMono}/></div>
                  <div><div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Bar length (m)</div><input type="number" step="0.05" value={meta.barLen} onChange={(e) => setMeta((m) => Object.assign({}, m, { barLen: +e.target.value }))} style={inpMono}/></div>
                </>}
              </div>
              <div style={{ marginTop:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:T.text, cursor:'pointer' }}>
                  <input type="checkbox" checked={meta.requiresSteelReinforcement} onChange={(e) => setMeta((m) => Object.assign({}, m, { requiresSteelReinforcement: e.target.checked }))}/>
                  Requires steel reinforcement
                </label>
              </div>
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, color:T.textSub, marginBottom:6 }}>
                  Compatible products{' '}
                  <span style={{ color:T.textMuted, fontWeight:400 }}>
                    — ticking these auto-binds this profile to each product's <b>{meta.role}</b> slot, so the 3D viewport renders from this DXF immediately. You can change bindings later under <i>Linked Products</i>.
                  </span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {(typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map((p) => {
                    const on = (meta.productTypes || []).indexOf(p.id) >= 0;
                    return (
                      <button key={p.id} type="button"
                        onClick={() => setMeta((m) => {
                          const cur = m.productTypes || [];
                          const next = on ? cur.filter((x) => x !== p.id) : cur.concat([p.id]);
                          return Object.assign({}, m, { productTypes: next });
                        })}
                        style={{
                          padding:'4px 10px', fontSize:10, borderRadius:4, cursor:'pointer',
                          background: on ? T.accent : T.bgHover,
                          color: on ? '#fff' : T.textSub,
                          border:'1px solid '+(on ? T.accent : T.border),
                        }}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop:20, display:'flex', gap:8 }}>
                <button onClick={() => setStage('preview')} style={{ padding:'8px 16px', fontSize:11, background:T.bgHover, color:T.text, border:'1px solid '+T.border, borderRadius:4, cursor:'pointer' }}>\u2190 Back</button>
                <button onClick={finalizeSave} style={{ flex:1, padding:'8px 16px', fontSize:11, background:T.accent, color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600 }}>{existing ? 'Update profile' : 'Save profile'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileOperationsEditor({ T, dk, polygon, polyKey, updPoly }) {
  const ops = polygon.operations || [];
  const cuts = polygon.cuts || { mitreAngle: polygon.mitreAngleDeg || 45, weldAllow: polygon.weldAllowanceMm || 3, kerfAllow: 3 };
  const setCuts = (patch) => updPoly(polyKey, 'cuts', Object.assign({}, cuts, patch));
  const addOp = () => updPoly(polyKey, 'operations', ops.concat([{ type: 'drainage', position: 50, dims: { dia: 8 } }]));
  const updOp = (i, patch) => updPoly(polyKey, 'operations', ops.map((o, j) => j === i ? Object.assign({}, o, patch) : o));
  const delOp = (i) => updPoly(polyKey, 'operations', ops.filter((_, j) => j !== i));
  const inpStyle = { width:'100%', padding:'4px 6px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, fontFamily:'monospace', background:T.bgInput, color:T.text };
  const F = (label, val, onChange) => (
    <div>
      <div style={{ fontSize:9, color:T.textSub, marginBottom:2 }}>{label}</div>
      <input type="number" step="1" value={val == null ? '' : val} onChange={(e) => onChange(+e.target.value)} style={inpStyle}/>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:600, color:T.text, marginBottom:8 }}>Cut allowances</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:20, maxWidth:400 }}>
        {F('Mitre angle (\u00b0)', cuts.mitreAngle, (v) => setCuts({ mitreAngle: v }))}
        {F('Weld allowance (mm)', cuts.weldAllow, (v) => setCuts({ weldAllow: v }))}
        {F('Kerf (mm)', cuts.kerfAllow, (v) => setCuts({ kerfAllow: v }))}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T.text }}>CNC operations ({ops.length})</div>
        <button onClick={addOp} style={{ padding:'4px 10px', fontSize:10, background:T.bgHover, color:T.text, border:'1px solid '+T.border, borderRadius:3, cursor:'pointer' }}>+ Add operation</button>
      </div>
      <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>Drainage holes, hardware pockets, espag slots — feeds the Fenstek machining sheet.</div>
      {ops.length === 0 && <div style={{ fontSize:10, color:T.textMuted, fontStyle:'italic', padding:20, textAlign:'center', border:'1px dashed '+T.border, borderRadius:4 }}>No operations defined yet.</div>}
      {ops.map((o, i) => (
        <div key={i} style={{ background:T.bgCard, padding:10, borderRadius:4, marginBottom:8, border:'1px solid '+T.borderLight }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 30px', gap:8, alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:9, color:T.textSub, marginBottom:2 }}>Type</div>
              <select value={o.type} onChange={(e) => updOp(i, { type: e.target.value })} style={{ width:'100%', padding:'4px 6px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, background:T.bgInput, color:T.text }}>
                <option value="drainage">Drainage hole</option>
                <option value="hardwarePocket">Hardware pocket</option>
                <option value="espagSlot">Espag slot</option>
                <option value="weep">Weep</option>
                <option value="endProfiling">End profiling</option>
                <option value="other">Other</option>
              </select>
            </div>
            {F('Position (mm from end)', o.position, (v) => updOp(i, { position: v }))}
            {F('Dia/size (mm)', (o.dims && o.dims.dia) || 0, (v) => updOp(i, { dims: Object.assign({}, o.dims || {}, { dia: v }) }))}
            <button onClick={() => delOp(i)} style={{ padding:'4px 6px', fontSize:11, background:'transparent', color:'#dc2626', border:'1px solid #dc262644', borderRadius:3, cursor:'pointer', height:24 }}>\u00d7</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// WIP38: Linked Products section for ProfileEditor. Lets the user explicitly
// pin this profile (by polyKey) as the active frame/sash/mullion for any
// product type, overriding the hardcoded profileKeysForType default.
//
// A product type is "default" for this profile if profileKeysForType returns
// this profile's key for that product+role — we surface that with a small
// \u2726 marker so the user can see what the system assumes without an
// explicit link. Toggling a checkbox writes (or clears) the explicit link.
function LinkedProductsSection({ T, profile, profileLinks, updLinks }) {
  // Linking is only meaningful when a polygon exists (the renderers consume
  // polyKey from profiles{}) and the profile has a defined role.
  if (!profile || !profile.polyKey || !profile.role) {
    return (
      <div style={{ marginTop: 16, padding: 12, background: T.bgHover, borderRadius: 4, fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
        Linking requires a polygon (DXF imported) and a role. Import a DXF first, then assign a role.
      </div>
    );
  }
  // Friendly labels grouped Windows / Doors. Order matches the brand sheet.
  const groups = [
    { title: 'Windows', items: [
      ['awning_window',     'Awning'],
      ['casement_window',   'Casement'],
      ['tilt_turn_window',  'Tilt & Turn'],
      ['fixed_window',      'Fixed'],
      ['sliding_window',    'Sliding'],
    ]},
    { title: 'Doors', items: [
      ['french_door',       'French'],
      ['hinged_door',       'Hinged'],
      ['bifold_door',       'Bifold'],
      ['lift_slide_door',   'Lift & Slide'],
      ['smart_slide_door',  'Smart Slide'],
      ['vario_slide_door',  'Vario Slide'],
      ['stacker_door',      'Stacker'],
    ]},
  ];
  const role = profile.role;
  const polyKey = profile.polyKey;
  // Is this profile the canonical (system) default for productType+role?
  const isDefault = (productType) => {
    try {
      if (typeof profileKeysForType !== 'function') return false;
      const keys = profileKeysForType(productType);
      return !!(keys && keys[role] === polyKey);
    } catch (e) { return false; }
  };
  // Is this profile the explicit user-linked override for productType+role?
  const isLinked = (productType) => {
    const slot = profileLinks[productType];
    return !!(slot && slot[role] === polyKey);
  };
  const toggle = (productType) => {
    if (isLinked(productType)) updLinks(productType, role, null);
    else                       updLinks(productType, role, polyKey);
  };
  const cb = (productType, label) => {
    const linked = isLinked(productType);
    const def    = isDefault(productType);
    return (
      <label key={productType} style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        padding: '4px 8px', borderRadius: 3,
        background: linked ? T.bgHover : 'transparent',
        border: '1px solid ' + (linked ? T.accent : T.border),
        fontSize: 11, color: T.text,
      }}>
        <input type="checkbox" checked={linked} onChange={() => toggle(productType)} style={{ margin: 0 }}/>
        <span>{label}</span>
        {def && <span title="System default for this product" style={{ fontSize: 9, color: T.accent, marginLeft: 'auto' }}>\u2726</span>}
      </label>
    );
  };
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid ' + T.borderLight }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Linked Products
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Apply this <b>{role}</b> profile to specific product types. Checking a box overrides the system default (\u2726) for that product. Unchecked = use the canonical mapping.
      </div>
      {groups.map((g) => (
        <div key={g.title} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textSub, marginBottom: 6, fontWeight: 500 }}>{g.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {g.items.map(([pt, label]) => cb(pt, label))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileEditor({ T, dk, profile, profileLinks, updCost, updPoly, updLinks, onDelete, onImport }) {
  const [tab, setTab] = useState('general');
  const m = profile;
  const inp = { width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text };
  const F = (label, val, onChange, opts) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>{label}</div>
      <input type={(opts && opts.type) || 'text'} step={opts && opts.step}
        value={val == null ? '' : val}
        onChange={(e) => onChange((opts && opts.type === 'number') ? +e.target.value : e.target.value)}
        style={Object.assign({}, inp, (opts && opts.mono) ? { fontFamily:'monospace' } : {})}/>
    </div>
  );
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:16 }}>
        <div style={{ width:120, height:120, background: dk ? '#0a0a10' : '#fafafa', borderRadius:6, padding:6, border:'1px solid '+T.borderLight, flexShrink:0 }}>
          {m.polygon && m.polygon.outerHullMm ? (
            <div style={{ width:'100%', height:'100%' }} dangerouslySetInnerHTML={{ __html: renderProfileSvg(m.polygon, { padPx: 8, fillCol: dk ? '#1a1a22' : '#f5f3ee', strokeCol: dk ? '#aaa' : '#333' }) }}/>
          ) : (
            <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:T.textMuted, textAlign:'center', lineHeight:1.4 }}>No DXF<br/>geometry</div>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text, lineHeight:1.2 }}>{m.name}</div>
          <div style={{ fontSize:11, color:T.textMuted, fontFamily:'monospace', marginTop:2 }}>{m.code || '—'} \u00b7 {m.system || '—'}</div>
          <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
            <span style={{ padding:'2px 8px', fontSize:9, background:T.bgHover, color:T.textSub, borderRadius:3, textTransform:'uppercase', letterSpacing:0.5 }}>{m.role}</span>
            {m.hasPolygon
              ? <span style={{ padding:'2px 8px', fontSize:9, background:'#22c55e22', color:'#22c55e', borderRadius:3 }}>\u2713 DXF loaded</span>
              : <span style={{ padding:'2px 8px', fontSize:9, background:'#f59e0b22', color:'#f59e0b', borderRadius:3 }}>\u26a0 No geometry</span>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
            <button onClick={onImport} style={{ padding:'5px 12px', fontSize:10, background:T.accent, color:'#fff', border:'none', borderRadius:3, cursor:'pointer', fontWeight:600 }}>{m.hasPolygon ? '\u21bb Re-import DXF' : '\u2191 Import DXF'}</button>
            <button onClick={onDelete} style={{ padding:'5px 12px', fontSize:10, background:'transparent', color:'#dc2626', border:'1px solid #dc262644', borderRadius:3, cursor:'pointer' }}>Delete</button>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:16, borderBottom:'2px solid '+T.border, marginBottom:16 }}>
        {['general', 'geometry', 'cost', 'operations'].map((t) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding:'8px 0', cursor:'pointer', fontSize:11, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.text : T.textMuted, borderBottom: tab === t ? '2px solid '+T.accent : '2px solid transparent', marginBottom:-2, textTransform:'uppercase', letterSpacing:0.5 }}>{t}</div>
        ))}
      </div>

      {tab === 'general' && m.costKey && <div>
        {F('Name', m.name, (v) => updCost(m.costKey, 'name', v))}
        {F('Code', m.code, (v) => updCost(m.costKey, 'code', v), { mono: true })}
        {F('System', m.system, (v) => updCost(m.costKey, 'system', v))}
        <LinkedProductsSection
          T={T}
          profile={m}
          profileLinks={profileLinks || {}}
          updLinks={updLinks}/>
      </div>}
      {tab === 'general' && !m.costKey && <div style={{ fontSize:11, color:T.textMuted }}>This profile has geometry but no cost entry yet — pricing won't apply. Click <b>+ New</b> on the toolbar to create a matching cost entry, then re-import to link by code.</div>}

      {tab === 'geometry' && <div>
        {m.hasPolygon ? <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:16, maxWidth:500 }}>
            <div><div style={{ fontSize:10, color:T.textSub }}>Sightline</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{m.polygon.sightlineMm || (m.polygon.bboxMm && m.polygon.bboxMm.w) || '—'} mm</div></div>
            <div><div style={{ fontSize:10, color:T.textSub }}>Depth</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{m.polygon.depthMm || (m.polygon.bboxMm && m.polygon.bboxMm.h) || '—'} mm</div></div>
            <div><div style={{ fontSize:10, color:T.textSub }}>Chambers</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{(m.polygon.chambersMm || []).length}</div></div>
            <div><div style={{ fontSize:10, color:T.textSub }}>Hull pts</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{(m.polygon.outerHullMm || []).length}</div></div>
            <div><div style={{ fontSize:10, color:T.textSub }}>Mitre</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{m.polygon.mitreAngleDeg || 45}\u00b0</div></div>
            <div><div style={{ fontSize:10, color:T.textSub }}>Weld allow</div><div style={{ fontSize:13, fontFamily:'monospace', color:T.text }}>{m.polygon.weldAllowanceMm || 3} mm</div></div>
          </div>
          {/* Coloured face side — editable. Determines which edge of the
              cross-section is highlighted in red on the Production cut list
              for coloured profiles. Inwards-opening systems (T&T, French
              door) put the rebate / interior on the right; outwards-opening
              casement / awning put it on the left. */}
          <div style={{ marginBottom:14, padding:'10px 12px', background:dk ? '#1a1a22' : '#fafafa', borderRadius:4, border:'1px solid '+T.borderLight, maxWidth:500 }}>
            <div style={{ fontSize:11, fontWeight:600, color:T.text, marginBottom:6 }}>Coloured face side</div>
            <div style={{ fontSize:10, color:T.textSub, marginBottom:8, lineHeight:1.4 }}>
              Which side of the cross-section is the colour-foiled exterior face. Used to
              flag the correct edge in red on the Production cut list when this profile
              is run in a coloured finish. May differ between inwards- and outwards-opening
              profiles in the same system.
            </div>
            <select
              value={m.polygon.colouredFaceSide || 'right'}
              onChange={(e) => updPoly(m.polyKey, 'colouredFaceSide', e.target.value)}
              style={{ padding:'6px 10px', fontSize:11, background:T.bgInput, color:T.text, border:'1px solid '+T.border, borderRadius:3, width:'100%', maxWidth:280 }}>
              <option value="right">Right (outwards-opening — casement / awning)</option>
              <option value="left">Left (inwards-opening — T&amp;T / French door)</option>
            </select>
          </div>
          <div style={{ width:'100%', maxWidth:400, height:300, background: dk ? '#0a0a10' : '#fafafa', borderRadius:6, padding:16, border:'1px solid '+T.borderLight }}>
            <div style={{ width:'100%', height:'100%' }} dangerouslySetInnerHTML={{ __html: renderProfileSvg(m.polygon, { padPx: 4, fillCol: dk ? '#1a1a22' : '#f5f3ee', strokeCol: dk ? '#ccc' : '#222', exteriorEdge: m.polygon.colouredFaceSide || 'right', strokeWidth: 0.8 }) }}/>
          </div>
        </> : <div style={{ fontSize:11, color:T.textMuted }}>No DXF imported. Click <b>Import DXF</b> above to load real geometry. Until then, 3D and 2D fall back to flat extrusion.</div>}
      </div>}

      {tab === 'cost' && m.costKey && <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:500 }}>
          {F('$/metre (white)',     m.perMetreWhite,     (v) => updCost(m.costKey, 'perMetreWhite', v),     { type: 'number', step: 0.01, mono: true })}
          {F('$/metre (colour)',    m.perMetreColour,    (v) => updCost(m.costKey, 'perMetreColour', v),    { type: 'number', step: 0.01, mono: true })}
          {F('$/metre (bilateral)', m.perMetreBilateral, (v) => updCost(m.costKey, 'perMetreBilateral', v), { type: 'number', step: 0.01, mono: true })}
          {F('Bar length (m)',      m.barLen,            (v) => updCost(m.costKey, 'barLen', v),            { type: 'number', step: 0.05, mono: true })}
        </div>
      </div>}
      {tab === 'cost' && !m.costKey && <div style={{ fontSize:11, color:T.textMuted }}>No cost entry. Use <b>+ New</b> on the toolbar to create one and link by code.</div>}

      {tab === 'operations' && (m.hasPolygon && m.polyKey
        ? <ProfileOperationsEditor T={T} dk={dk} polygon={m.polygon} polyKey={m.polyKey} updPoly={updPoly}/>
        : <div style={{ fontSize:11, color:T.textMuted }}>CNC operations require a polygon. Import the DXF first.</div>)}
    </div>
  );
}

function ProfileManager({ T, dk, appSettings, setAppSettings }) {
  const pc = appSettings.pricingConfig || {};
  const costs = pc.profileCosts || {};
  const polygons = pc.profiles || {};

  const [filter, setFilter] = useState({ system: 'all', role: 'all', hasPoly: 'all', q: '' });
  const [selKey, setSelKey] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState(null);

  const normalizeCode = (c) => (c || '').toString().replace(/[x\u00d7\s]/gi, '').toLowerCase();
  const guessRole = (name) => {
    const n = (name || '').toLowerCase();
    if (n.indexOf('frame') >= 0) return 'frame';
    if (n.indexOf('sash') >= 0) return 'sash';
    if (n.indexOf('mullion') >= 0) return n.indexOf('false') >= 0 ? 'floating_mullion' : 'mullion';
    if (n.indexOf('transom') >= 0) return 'transom';
    if (n.indexOf('threshold') >= 0) return 'threshold';
    if (n.indexOf('bead') >= 0) return 'bead';
    if (n.indexOf('interlock') >= 0) return 'interlock';
    if (n.indexOf('facade') >= 0) return 'facade';
    if (n.indexOf('reinf') >= 0 || n.indexOf('steel') >= 0) return 'reinforcement';
    return 'other';
  };

  // WIP36: geometry catalog and cost catalog share the same keys, so we
  // match by key directly. Code-based fallback kept for any legacy seed
  // entries (e.g. an old polygon keyed 'ideal4000_frame_140x07' that
  // doesn't yet match an i4_frame cost key — match by code as backup).
  const polysByCode = {};
  Object.keys(polygons).forEach((k) => {
    const p = polygons[k];
    if (p && p.code) polysByCode[normalizeCode(p.code)] = Object.assign({ polyKey: k }, p);
  });

  const merged = Object.keys(costs).map((key) => {
    const c = costs[key];
    // Primary match: same key in geometry catalog.
    let poly = polygons[key] ? Object.assign({ polyKey: key }, polygons[key]) : null;
    // Fallback: match by normalized code (for un-migrated polygons).
    if (!poly) {
      const codeNorm = normalizeCode(c.code);
      poly = polysByCode[codeNorm] || null;
    }
    return {
      costKey: key,
      polyKey: poly ? poly.polyKey : null,
      code: c.code,
      name: c.name,
      system: c.system,
      // Unified pricing fields (WIP36). Legacy entries with c.perMetre fall
      // through to perMetreWhite for display so old saved settings still work.
      perMetreWhite: (typeof c.perMetreWhite === 'number') ? c.perMetreWhite : c.perMetre,
      perMetreColour: (typeof c.perMetreColour === 'number') ? c.perMetreColour : null,
      perMetreBilateral: (typeof c.perMetreBilateral === 'number') ? c.perMetreBilateral : c.bilateralPerMetre,
      barLen: c.barLen,
      role: c.role || (poly ? poly.role : guessRole(c.name)),
      hasPolygon: !!poly,
      polygon: poly,
    };
  });
  // Any geometry entries that don't yet have a matching cost row — show
  // them as orphan cards so the user can create a cost row to link them.
  Object.keys(polygons).forEach((k) => {
    const p = polygons[k];
    if (!p) return;
    const matched = merged.some((m) => m.costKey === k || m.polyKey === k);
    if (!matched) merged.push({ costKey: null, polyKey: k, code: p.code, name: p.name || (p.role + ' (no cost set)'), system: p.system, perMetreWhite: 0, perMetreColour: null, perMetreBilateral: null, barLen: 6.0, role: p.role, hasPolygon: true, polygon: p });
  });

  const systems = Array.from(new Set(merged.map((m) => m.system).filter(Boolean))).sort();
  const roles = ['frame', 'sash', 'mullion', 'floating_mullion', 'transom', 'threshold', 'bead', 'interlock', 'facade', 'reinforcement', 'other'];

  const visible = merged.filter((m) => {
    if (filter.system !== 'all' && m.system !== filter.system) return false;
    if (filter.role !== 'all' && m.role !== filter.role) return false;
    if (filter.hasPoly === 'yes' && !m.hasPolygon) return false;
    if (filter.hasPoly === 'no' && m.hasPolygon) return false;
    const q = filter.q.toLowerCase();
    if (q && (((m.name || '') + ' ' + (m.code || '')).toLowerCase().indexOf(q) < 0)) return false;
    return true;
  });

  const sel = merged.find((m) => (m.costKey || m.polyKey) === selKey);

  const updCost = (key, field, val) => setAppSettings((s) => {
    const lpc = Object.assign({}, s.pricingConfig || {});
    const lc = Object.assign({}, lpc.profileCosts || {});
    lc[key] = Object.assign({}, lc[key] || {}, { [field]: val });
    return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profileCosts: lc }) });
  });

  const updPoly = (key, field, val) => setAppSettings((s) => {
    const lpc = Object.assign({}, s.pricingConfig || {});
    const lpr = Object.assign({}, lpc.profiles || {});
    lpr[key] = Object.assign({}, lpr[key] || {}, { [field]: val });
    return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profiles: lpr }) });
  });

  // WIP38: write/clear an explicit product→profile link for a given role.
  // polyKey=null clears the link (revert to system default for that product+role).
  // Cleans up empty product slots so the map stays minimal.
  const updLinks = (productType, role, polyKey) => setAppSettings((s) => {
    const lpc = Object.assign({}, s.pricingConfig || {});
    const llinks = Object.assign({}, lpc.profileLinks || {});
    const slot = Object.assign({}, llinks[productType] || {});
    if (polyKey) {
      slot[role] = polyKey;
    } else {
      delete slot[role];
    }
    if (Object.keys(slot).length === 0) {
      delete llinks[productType];
    } else {
      llinks[productType] = slot;
    }
    return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profileLinks: llinks }) });
  });

  const newProfileCostEntry = () => {
    const k = 'profile_' + Date.now().toString(36);
    setAppSettings((s) => {
      const lpc = Object.assign({}, s.pricingConfig || {});
      const lc = Object.assign({}, lpc.profileCosts || {});
      lc[k] = { code: '', name: 'New Profile', system: '', perMetre: 0, barLen: 6.0 };
      return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profileCosts: lc }) });
    });
    setSelKey(k);
  };

  const deleteProfile = (m) => {
    if (!window.confirm('Delete profile "' + m.name + '"? This removes its cost entry and polygon geometry.')) return;
    setAppSettings((s) => {
      const lpc = Object.assign({}, s.pricingConfig || {});
      const lc = Object.assign({}, lpc.profileCosts || {});
      const lpr = Object.assign({}, lpc.profiles || {});
      if (m.costKey) delete lc[m.costKey];
      if (m.polyKey) delete lpr[m.polyKey];
      return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profileCosts: lc, profiles: lpr }) });
    });
    setSelKey(null);
  };

  const handleImportSave = (data) => {
    const slug = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const baseKey = slug(data.system) + '_' + (data.role || 'profile') + '_' + slug(data.code || data.name || 'unnamed');
    const polyEntry = {
      code: data.code, name: data.name, system: data.system, role: data.role,
      description: data.description || '',
      usedByProductTypes: data.productTypes || [],
      bboxMm: { w: data.sightlineMm, h: data.depthMm },
      depthMm: data.depthMm, sightlineMm: data.sightlineMm,
      weldAllowanceMm: data.weldAllowanceMm || 3,
      mitreAngleDeg: data.mitreAngleDeg || 45,
      colouredFaceSide: data.colouredFaceSide || 'right',
      requiresSteelReinforcement: !!data.requiresSteelReinforcement,
      outerHullMm: data.hull, chambersMm: data.chambers,
    };
    setAppSettings((s) => {
      const lpc = Object.assign({}, s.pricingConfig || {});
      const lpr = Object.assign({}, lpc.profiles || {});
      const lc = Object.assign({}, lpc.profileCosts || {});
      const llinks = Object.assign({}, lpc.profileLinks || {});
      let resolvedKey = baseKey;
      if (importTarget === 'new') {
        let k = baseKey, n = 2;
        while (lpr[k]) { k = baseKey + '_' + n; n++; }
        resolvedKey = k;
        lpr[k] = polyEntry;
        // WIP36: unified cost shape — perMetreWhite / perMetreColour
        if (!lc[k]) lc[k] = { code: data.code, name: data.name, system: data.system, role: data.role, perMetreWhite: data.perMetre || 0, perMetreColour: null, barLen: data.barLen || 6.0 };
      } else if (importTarget) {
        const existingItem = merged.find((m) => (m.costKey || m.polyKey) === importTarget);
        // WIP36: when importing into an existing card, geometry key = cost key.
        // Keeps cost ↔ geometry aligned by a single source of truth.
        const existingPolyKey = (existingItem && existingItem.costKey) || (existingItem && existingItem.polyKey) || importTarget;
        resolvedKey = existingPolyKey;
        lpr[existingPolyKey] = Object.assign({}, lpr[existingPolyKey] || {}, polyEntry);
      }
      // Phase A: auto-bind this profile to every ticked product type for this
      // role, so the 3D viewport renders from the DXF immediately. Additive —
      // existing links to other profiles for unticked types are left alone.
      // The Linked Products UI in the editor remains the source of truth for
      // later changes.
      const linkRole = data.role || 'frame';
      (data.productTypes || []).forEach((pt) => {
        const slot = Object.assign({}, llinks[pt] || {});
        slot[linkRole] = resolvedKey;
        llinks[pt] = slot;
      });
      window.__lastImportedKey = resolvedKey;
      return Object.assign({}, s, { pricingConfig: Object.assign({}, lpc, { profileCosts: lc, profiles: lpr, profileLinks: llinks }) });
    });
    setImportOpen(false);
    setTimeout(() => setSelKey(window.__lastImportedKey || importTarget), 0);
  };

  const sel2 = sel ? Object.assign({}, sel) : null;
  const importExisting = importTarget && importTarget !== 'new' ? merged.find((m) => (m.costKey || m.polyKey) === importTarget) : null;

  const sty = {
    sel: { padding:'5px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, background:T.bgInput, color:T.text },
    btnSec: { padding:'6px 12px', background:T.bgHover, color:T.text, border:'1px solid '+T.border, borderRadius:4, fontSize:11, cursor:'pointer' },
    btnPri: { padding:'6px 12px', background:T.accent, color:'#fff', border:'none', borderRadius:4, fontSize:11, cursor:'pointer', fontWeight:600 },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid '+T.border, background:T.bgPanel, flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ fontSize:14, fontWeight:700, color:T.text, marginRight:8 }}>Profiles</div>
        <div style={{ fontSize:11, color:T.textMuted }}>{visible.length} of {merged.length}</div>
        <div style={{ flex:1, minWidth:20 }}/>
        <input type="text" placeholder="Search name or code..." value={filter.q} onChange={(e) => setFilter((f) => Object.assign({}, f, { q: e.target.value }))} style={Object.assign({}, sty.sel, { width:200 })}/>
        <select value={filter.system} onChange={(e) => setFilter((f) => Object.assign({}, f, { system: e.target.value }))} style={sty.sel}>
          <option value="all">All systems</option>
          {systems.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.role} onChange={(e) => setFilter((f) => Object.assign({}, f, { role: e.target.value }))} style={sty.sel}>
          <option value="all">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filter.hasPoly} onChange={(e) => setFilter((f) => Object.assign({}, f, { hasPoly: e.target.value }))} style={sty.sel}>
          <option value="all">Geometry: any</option>
          <option value="yes">Has polygon</option>
          <option value="no">Missing polygon</option>
        </select>
        <button onClick={newProfileCostEntry} style={sty.btnSec}>+ New</button>
        <button onClick={() => { setImportTarget('new'); setImportOpen(true); }} style={sty.btnPri}>\u2191 Import DXF</button>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:'0 0 52%', borderRight:'1px solid '+T.border, overflowY:'auto', background:T.bg }}>
          {visible.length === 0 && <div style={{ padding:40, textAlign:'center', color:T.textMuted, fontSize:11 }}>No profiles match these filters.</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8, padding:12 }}>
            {visible.map((m) => {
              const k = m.costKey || m.polyKey;
              const isSel = k === selKey;
              const _links = (appSettings.pricingConfig && appSettings.pricingConfig.profileLinks) || {};
              const _linkedTypes = m.polyKey && m.role ? Object.keys(_links).filter((pt) => _links[pt] && _links[pt][m.role] === m.polyKey) : [];
              return (
                <div key={k} onClick={() => setSelKey(k)} style={{ background: isSel ? T.bgHover : T.bgCard, border:'1px solid '+(isSel ? T.accent : T.borderLight), borderRadius:6, padding:8, cursor:'pointer', display:'flex', flexDirection:'column', gap:4, position:'relative' }}>
                  {_linkedTypes.length > 0 && <div title={'Linked to: ' + _linkedTypes.join(', ')} style={{ position:'absolute', top:6, right:6, padding:'1px 5px', fontSize:8, fontWeight:600, background:T.accent, color:'#fff', borderRadius:3, letterSpacing:0.3 }}>{_linkedTypes.length === 1 ? 'LINKED' : 'LINKED \u00d7' + _linkedTypes.length}</div>}
                  <div style={{ height:80, background: dk ? '#0a0a10' : '#fafafa', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:4 }}>
                    {m.polygon && m.polygon.outerHullMm ? (
                      <div style={{ width:'100%', height:'100%' }} dangerouslySetInnerHTML={{ __html: renderProfileSvg(m.polygon, { padPx: 6, fillCol: dk ? '#1a1a22' : '#f5f3ee', strokeCol: dk ? '#999' : '#444' }) }}/>
                    ) : (
                      <div style={{ fontSize:9, color:T.textMuted, fontStyle:'italic' }}>No geometry</div>
                    )}
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={m.name}>{m.name}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:9 }}>
                    <span style={{ fontFamily:'monospace', color:T.textMuted }}>{m.code || '—'}</span>
                    <span style={{ padding:'1px 5px', background:T.bgHover, color:T.textSub, borderRadius:3, textTransform:'uppercase', fontSize:8, letterSpacing:0.5 }}>{m.role}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:9, color:T.textSub }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{m.system || '—'}</span>
                    <span style={{ fontFamily:'monospace' }}>${(m.perMetre || 0).toFixed(2)}/m</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:20, background:T.bgPanel }}>
          {sel2 ? (
            <ProfileEditor
              T={T} dk={dk}
              profile={sel2}
              profileLinks={(appSettings.pricingConfig && appSettings.pricingConfig.profileLinks) || {}}
              updCost={updCost}
              updPoly={updPoly}
              updLinks={updLinks}
              onDelete={() => deleteProfile(sel2)}
              onImport={() => { setImportTarget(sel2.costKey || sel2.polyKey); setImportOpen(true); }}/>
          ) : (
            <div style={{ color:T.textMuted, fontSize:12, textAlign:'center', marginTop:60 }}>
              Select a profile to view details, or click <b>\u2191 Import DXF</b> to add a new one.
            </div>
          )}
        </div>
      </div>

      {importOpen && <DXFImportModal
        T={T} dk={dk}
        target={importTarget}
        existing={importExisting}
        onClose={() => setImportOpen(false)}
        onSave={handleImportSave}/>}
    </div>
  );
}


