// ═══════════════════════════════════════════════════════════════════════════
// 3D STUDIO — render-only settings panel (Phase 1).
// WIP46: This module is COMPLETELY ISOLATED from production data paths.
// Pricing, BOM, cut lists, cross-sections, and CRM payloads NEVER read from
// appSettings.render3d. The 3D scene init and material factories are the
// only consumers.
//
// Phase 1 scope:
//   - Scene controls (exposure, lights, HDRI tint, BG, ground shadow) — LIVE
//   - Per-profile material UI — values stored, live apply lands in Phase 2
//
// Persistence: appSettings.render3d → flows through forceSaveAppSettings →
// Supabase like the rest. mergeAppSettings (recursive) ensures missing keys
// fall back to factory defaults so existing users don't lose any state.
//
// Defaults match the values currently hardcoded in 39-main-app.js scene init,
// so a fresh load with no overrides renders byte-identical to pre-WIP46.
// ═══════════════════════════════════════════════════════════════════════════

// Factory defaults — keep in sync with scene init in 39-main-app.js (search
// for "WIP46-anchor" comments). If you change a default here, audit those
// anchors so the fallback chain stays consistent.
function _render3dFactoryScene() {
  return {
    // Tonemapping (was: renderer.toneMappingExposure = 1.8)
    toneMappingExposure: 1.8,
    // Ambient lighting (was: HemisphereLight intensity 1.0, AmbientLight 0.3)
    hemisphereIntensity: 1.0,
    ambientIntensity: 0.3,
    // Directional fills (was: 0.35 / 0.35 / 0.2 / 0.2)
    keyFrontIntensity: 0.35,
    keyBackIntensity: 0.35,
    fillLeftIntensity: 0.2,
    fillRightIntensity: 0.2,
    // HDRI fill (was: '#d8d8d8' uniform)
    hdriTintHex: '#d8d8d8',
    // Backgrounds (was: '#1a1a24' dark, '#fafafa' light)
    bgLight: '#fafafa',
    bgDark: '#1a1a24',
    // Ground (was: 0.18 falloff in vertex-color shadow)
    groundShadowOpacity: 0.18,
    groundEnabled: true,
  };
}

function _render3dFactoryMaterialSlot() {
  return {
    enabled: false,                    // master per-profile off-switch
    roughness: null,                   // null = inherit from material factory
    metalness: null,
    clearcoat: null,
    clearcoatRoughness: null,
    envMapIntensity: null,
    sheen: null,
    overrideExtHex: null,              // null = follow frame colour
    overrideIntHex: null,
  };
}

// Returns a complete render3d defaults block for _defaultAppSettings.
// Called from 39-main-app.js so the existing _defaultAppSettings stays as
// one cohesive function.
function _render3dFactoryDefaults() {
  return {
    scene: _render3dFactoryScene(),
    profiles: {},                      // keyed by profile key (e.g. 'i4_frame')
    // Reserved for Phase 2:
    // shapes: {},                     // per-profile shape overrides
    // cameraPresets: [],
    // snapshot: { ... },
    // animation: { ... },
  };
}

// Hardcoded factory copy for "Reset to factory" buttons inside the studio.
// Available globally so 39-main-app.js can also call it for migration paths.
if (typeof window !== 'undefined') {
  window._render3dFactoryDefaults = _render3dFactoryDefaults;
  window._render3dFactoryScene    = _render3dFactoryScene;
  window._render3dFactoryMaterialSlot = _render3dFactoryMaterialSlot;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// Props:
//   - subPage: 'scene' | 'materials'
//   - appSettings, setAppSettings: standard pair
//   - T, dk: theme object + dark-mode flag (from main app)
// ═══════════════════════════════════════════════════════════════════════════
function Render3DStudio({ subPage, appSettings, setAppSettings, T, dk }) {
  // Defensive read — if render3d block is somehow absent (older save before
  // the merge ran), rebuild the defaults inline. mergeAppSettings should make
  // this impossible but the safety belt is cheap.
  var render3d = (appSettings && appSettings.render3d) || _render3dFactoryDefaults();
  var scene = render3d.scene || _render3dFactoryScene();
  var profilesMap = render3d.profiles || {};

  // ── Helpers ─────────────────────────────────────────────────────────────
  function patchScene(patch) {
    setAppSettings(function(prev) {
      var pr3 = prev.render3d || _render3dFactoryDefaults();
      var ps = pr3.scene || _render3dFactoryScene();
      return Object.assign({}, prev, {
        render3d: Object.assign({}, pr3, {
          scene: Object.assign({}, ps, patch),
        }),
      });
    });
  }

  function patchProfile(profileKey, patch) {
    setAppSettings(function(prev) {
      var pr3 = prev.render3d || _render3dFactoryDefaults();
      var profs = pr3.profiles || {};
      var existing = profs[profileKey] || _render3dFactoryMaterialSlot();
      return Object.assign({}, prev, {
        render3d: Object.assign({}, pr3, {
          profiles: Object.assign({}, profs, {
            [profileKey]: Object.assign({}, existing, patch),
          }),
        }),
      });
    });
  }

  function resetSceneToFactory() {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm('Reset all 3D scene settings to factory defaults?\n\nThis will not affect any per-profile material overrides.')) return;
    }
    setAppSettings(function(prev) {
      var pr3 = prev.render3d || _render3dFactoryDefaults();
      return Object.assign({}, prev, {
        render3d: Object.assign({}, pr3, { scene: _render3dFactoryScene() }),
      });
    });
  }

  function resetProfileToFactory(profileKey) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm('Clear 3D material overrides for this profile?')) return;
    }
    setAppSettings(function(prev) {
      var pr3 = prev.render3d || _render3dFactoryDefaults();
      var profs = Object.assign({}, pr3.profiles || {});
      delete profs[profileKey];
      return Object.assign({}, prev, {
        render3d: Object.assign({}, pr3, { profiles: profs }),
      });
    });
  }

  // ── UI primitives — reuse the visual language of the existing settings ──
  function Slider(props) {
    var min = props.min, max = props.max, step = props.step || 0.01;
    var value = props.value != null ? props.value : (props.defaultValue || 0);
    var label = props.label;
    var onChange = props.onChange;
    var helper = props.helper;
    var displayValue = (value == null) ? '—' : (typeof value === 'number' ? value.toFixed(props.decimals != null ? props.decimals : 2) : String(value));
    var isDefault = (props.factory != null && Math.abs(value - props.factory) < 1e-6);
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:11, color:T.textSub }}>{label}</span>
          <span style={{ fontSize:11, fontFamily:'monospace', color: isDefault ? T.textMuted : T.text, fontWeight: isDefault ? 400 : 600 }}>
            {displayValue}{isDefault ? ' (default)' : ''}
          </span>
        </div>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={function(e){ onChange(parseFloat(e.target.value)); }}
          style={{ width:'100%', accentColor: appSettings.accentColour || '#c41230' }}
        />
        {helper ? <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>{helper}</div> : null}
      </div>
    );
  }

  function ColourField(props) {
    var label = props.label, value = props.value, onChange = props.onChange;
    var allowNull = props.allowNull;
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>{label}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input
            type="color"
            value={value || '#ffffff'}
            onChange={function(e){ onChange(e.target.value); }}
            style={{ width:36, height:30, border:'1px solid '+T.border, borderRadius:4, cursor:'pointer', background:'transparent' }}
          />
          <input
            type="text"
            value={value || ''}
            placeholder={allowNull ? '(inherit)' : '#rrggbb'}
            onChange={function(e){ onChange(e.target.value || (allowNull ? null : '#ffffff')); }}
            style={{ flex:1, maxWidth:140, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}
          />
          {allowNull && value && (
            <button onClick={function(){ onChange(null); }}
              style={{ padding:'4px 10px', fontSize:10, background:'transparent', color:T.textSub, border:'1px solid '+T.border, borderRadius:3, cursor:'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  function Group(props) {
    return (
      <div style={{ background:T.bgPanel, borderRadius:8, padding:'16px 20px', border:'1px solid '+T.border, marginBottom:16, maxWidth:560 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:14, color:T.text }}>{props.title}</div>
        {props.children}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCENE SUBPAGE
  // ═══════════════════════════════════════════════════════════════════════
  if (subPage === 'scene') {
    var fs = _render3dFactoryScene();
    return (
      <div style={{ padding:24, overflowY:'auto' }}>
        <div style={{ marginBottom:16, maxWidth:560 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>3D Scene</div>
          <div style={{ fontSize:11, color:T.textMuted, lineHeight:1.5 }}>
            Lighting, exposure, and background for the 3D viewport. Changes are live —
            close and reopen Settings if you want to compare. None of these affect
            production data, pricing, or PDFs.
          </div>
        </div>

        <Group title="Tonemapping">
          <Slider
            label="Exposure"
            min={0.4} max={3.0} step={0.05}
            value={scene.toneMappingExposure} factory={fs.toneMappingExposure}
            onChange={function(v){ patchScene({ toneMappingExposure: v }); }}
            helper="Controls overall brightness after tone mapping. Default 1.8."
          />
        </Group>

        <Group title="Ambient lighting">
          <Slider
            label="Hemisphere intensity"
            min={0} max={2.5} step={0.05}
            value={scene.hemisphereIntensity} factory={fs.hemisphereIntensity}
            onChange={function(v){ patchScene({ hemisphereIntensity: v }); }}
            helper="Soft sky/ground fill. Higher = brighter overall."
          />
          <Slider
            label="Ambient intensity"
            min={0} max={1.5} step={0.05}
            value={scene.ambientIntensity} factory={fs.ambientIntensity}
            onChange={function(v){ patchScene({ ambientIntensity: v }); }}
            helper="Flat omnidirectional fill on top of the hemisphere."
          />
        </Group>

        <Group title="Directional fills">
          <Slider
            label="Front key"
            min={0} max={1.5} step={0.05}
            value={scene.keyFrontIntensity} factory={fs.keyFrontIntensity}
            onChange={function(v){ patchScene({ keyFrontIntensity: v }); }}
          />
          <Slider
            label="Back key"
            min={0} max={1.5} step={0.05}
            value={scene.keyBackIntensity} factory={fs.keyBackIntensity}
            onChange={function(v){ patchScene({ keyBackIntensity: v }); }}
          />
          <Slider
            label="Left fill"
            min={0} max={1.5} step={0.05}
            value={scene.fillLeftIntensity} factory={fs.fillLeftIntensity}
            onChange={function(v){ patchScene({ fillLeftIntensity: v }); }}
          />
          <Slider
            label="Right fill"
            min={0} max={1.5} step={0.05}
            value={scene.fillRightIntensity} factory={fs.fillRightIntensity}
            onChange={function(v){ patchScene({ fillRightIntensity: v }); }}
          />
        </Group>

        <Group title="HDRI environment">
          <ColourField
            label="HDRI tint"
            value={scene.hdriTintHex}
            onChange={function(v){ patchScene({ hdriTintHex: v }); }}
          />
          <div style={{ fontSize:10, color:T.textMuted, marginTop:-8, marginBottom:0 }}>
            Uniform fill colour for the studio environment map. Affects reflections
            on glass and metallic hardware. Default <code>#d8d8d8</code> — neutral grey.
          </div>
        </Group>

        <Group title="Background">
          <ColourField
            label="Light theme background"
            value={scene.bgLight}
            onChange={function(v){ patchScene({ bgLight: v }); }}
          />
          <ColourField
            label="Dark theme background"
            value={scene.bgDark}
            onChange={function(v){ patchScene({ bgDark: v }); }}
          />
        </Group>

        <Group title="Ground shadow">
          <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
            <div onClick={function(){ patchScene({ groundEnabled: !scene.groundEnabled }); }}
              style={{ width:34, height:18, borderRadius:9, background: scene.groundEnabled ? '#5b5fc7' : '#ccc', cursor:'pointer', padding:2, transition:'0.2s' }}>
              <div style={{ width:14, height:14, borderRadius:7, background:T.bgPanel, transform: scene.groundEnabled ? 'translateX(16px)' : '', transition:'0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
            </div>
            <span style={{ fontSize:12, color:T.text }}>{scene.groundEnabled ? 'On' : 'Off'}</span>
          </div>
          <Slider
            label="Shadow opacity"
            min={0} max={0.5} step={0.01}
            value={scene.groundShadowOpacity} factory={fs.groundShadowOpacity}
            onChange={function(v){ patchScene({ groundShadowOpacity: v }); }}
            helper="Soft circular shadow under the window. Set to 0 for no shadow."
          />
        </Group>

        <div style={{ maxWidth:560, marginTop:24, paddingTop:16, borderTop:'1px solid '+T.border }}>
          <button onClick={resetSceneToFactory}
            style={{ padding:'8px 16px', fontSize:12, fontWeight:600, background:'transparent', color:'#dc2626', border:'1px solid #dc2626', borderRadius:4, cursor:'pointer' }}>
            Reset all scene settings to factory
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MATERIALS SUBPAGE
  // ═══════════════════════════════════════════════════════════════════════
  if (subPage === 'materials') {
    // Pull the canonical profile catalog (factory + user overrides). Reuses
    // the exact resolver the 3D scene uses so what you see here is what gets
    // rendered.
    var allProfiles = (typeof _allProfileEntries === 'function') ? _allProfileEntries() : {};
    var profileKeys = Object.keys(allProfiles).sort(function(a, b) {
      var ea = allProfiles[a], eb = allProfiles[b];
      var ra = (ea && ea.role) || 'zzz', rb = (eb && eb.role) || 'zzz';
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a < b ? -1 : 1;
    });

    var selected = (typeof window !== 'undefined' && window.__r3dSelKey) || profileKeys[0] || null;
    // Listen for selection via a tiny local component since we can't add
    // useState inside a non-hook block. Use a lightweight self-rendered
    // selection mechanism with React state, hosted in a sub-component.
    return (
      <Render3DMaterialsPane
        T={T} dk={dk}
        appSettings={appSettings}
        profileKeys={profileKeys}
        allProfiles={allProfiles}
        profilesMap={profilesMap}
        patchProfile={patchProfile}
        resetProfileToFactory={resetProfileToFactory}
        Slider={Slider}
        ColourField={ColourField}
        Group={Group}
      />
    );
  }

  // Fallback if subPage is unrecognised
  return (
    <div style={{ padding:40, textAlign:'center', color:T.textMuted }}>
      Select a 3D Studio section from the sidebar.
    </div>
  );
}

// Materials sub-pane factored out so we can use hooks (useState for selection).
function Render3DMaterialsPane(props) {
  var T = props.T, dk = props.dk;
  var profileKeys = props.profileKeys;
  var allProfiles = props.allProfiles;
  var profilesMap = props.profilesMap;
  var patchProfile = props.patchProfile;
  var resetProfileToFactory = props.resetProfileToFactory;
  var Slider = props.Slider, ColourField = props.ColourField, Group = props.Group;

  var initialIdx = 0;
  var stored = (typeof window !== 'undefined' && window.__r3dSelKey) || null;
  if (stored && profileKeys.indexOf(stored) >= 0) initialIdx = profileKeys.indexOf(stored);
  var idxState = React.useState(initialIdx);
  var idx = idxState[0], setIdx = idxState[1];

  if (profileKeys.length === 0) {
    return (
      <div style={{ padding:40, color:T.textMuted, fontSize:13 }}>
        No profiles found. Import or define profiles under <strong>Products → Profiles</strong> first.
      </div>
    );
  }

  var selectedKey = profileKeys[idx];
  var entry = allProfiles[selectedKey] || {};
  var slot = profilesMap[selectedKey] || _render3dFactoryMaterialSlot();
  if (typeof window !== 'undefined') window.__r3dSelKey = selectedKey;

  function updateSlot(patch) { patchProfile(selectedKey, patch); }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Phase 2 banner */}
      <div style={{ padding:'10px 16px', background: dk ? 'rgba(251,191,36,0.10)' : '#fffbeb', borderBottom:'1px solid '+(dk ? 'rgba(251,191,36,0.25)' : '#fde68a'), fontSize:11, color: dk ? '#fde68a' : '#78350f' }}>
        <strong>Phase 1:</strong> Material settings save here and are queued for 3D apply in Phase 2.
        Scene controls (under <em>3D Studio → Scene</em>) update the viewport live now.
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* LEFT — profile list, mirrors ProfileManager visually */}
        <div style={{ width:260, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
          {profileKeys.map(function(k, i) {
            var e = allProfiles[k] || {};
            var hasOverride = !!profilesMap[k] && profilesMap[k].enabled;
            return (
              <div key={k} onClick={function(){ setIdx(i); }} style={{
                padding:'10px 12px', cursor:'pointer', fontSize:12,
                background: i===idx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent',
                borderBottom:'1px solid '+T.borderLight,
                color:T.text,
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                  <div style={{ fontWeight: i===idx?700:400, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {e.name || k}
                  </div>
                  {hasOverride && (
                    <span style={{ fontSize:8, color:'#7c3aed', background:'#ede9fe', padding:'1px 4px', borderRadius:2, fontWeight:700 }}>3D</span>
                  )}
                </div>
                <div style={{ fontSize:9, color:T.textMuted, marginTop:2, fontFamily:'monospace' }}>
                  {e.role || '—'} · {e.code || k}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT — material editor */}
        <div style={{ flex:1, padding:24, overflowY:'auto' }}>
          <div style={{ marginBottom:16, maxWidth:560 }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.text }}>{entry.name || selectedKey}</div>
            <div style={{ fontSize:11, color:T.textMuted, marginTop:2, fontFamily:'monospace' }}>
              {(entry.role || '—') + ' · ' + (entry.code || selectedKey) + (entry.system ? ' · ' + entry.system : '')}
            </div>
          </div>

          {/* Master toggle */}
          <Group title="3D override">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <div onClick={function(){ updateSlot({ enabled: !slot.enabled }); }}
                style={{ width:34, height:18, borderRadius:9, background: slot.enabled ? '#5b5fc7' : '#ccc', cursor:'pointer', padding:2, transition:'0.2s' }}>
                <div style={{ width:14, height:14, borderRadius:7, background:T.bgPanel, transform: slot.enabled ? 'translateX(16px)' : '', transition:'0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
              </div>
              <span style={{ fontSize:12, color:T.text }}>{slot.enabled ? 'On' : 'Off'}</span>
              <span style={{ fontSize:11, color:T.textMuted, marginLeft:6 }}>
                {slot.enabled ? 'Overrides apply when Phase 2 ships' : 'Profile uses factory material'}
              </span>
            </div>
          </Group>

          <Group title="PBR material">
            <Slider
              label="Roughness"
              min={0} max={1} step={0.01}
              value={slot.roughness != null ? slot.roughness : 0.4}
              onChange={function(v){ updateSlot({ roughness: v }); }}
              helper="0 = mirror smooth, 1 = fully matte. uPVC ≈ 0.35–0.45, gloss ≈ 0.15."
            />
            <Slider
              label="Metalness"
              min={0} max={1} step={0.01}
              value={slot.metalness != null ? slot.metalness : 0.1}
              onChange={function(v){ updateSlot({ metalness: v }); }}
              helper="Window frames are non-metals → keep low. Hardware ≈ 0.8–1.0."
            />
            <Slider
              label="Clearcoat"
              min={0} max={1} step={0.01}
              value={slot.clearcoat != null ? slot.clearcoat : 0.3}
              onChange={function(v){ updateSlot({ clearcoat: v }); }}
              helper="Adds a thin glossy lacquer layer on top. Boosts perceived quality."
            />
            <Slider
              label="Clearcoat roughness"
              min={0} max={1} step={0.01}
              value={slot.clearcoatRoughness != null ? slot.clearcoatRoughness : 0.4}
              onChange={function(v){ updateSlot({ clearcoatRoughness: v }); }}
            />
            <Slider
              label="Env map intensity"
              min={0} max={2} step={0.05}
              value={slot.envMapIntensity != null ? slot.envMapIntensity : 0.45}
              onChange={function(v){ updateSlot({ envMapIntensity: v }); }}
              helper="How much the HDRI environment reflects in the surface."
            />
            <Slider
              label="Sheen"
              min={0} max={1} step={0.01}
              value={slot.sheen != null ? slot.sheen : 0}
              onChange={function(v){ updateSlot({ sheen: v }); }}
              helper="Velvet-like soft glow at grazing angles. Subtle."
            />
          </Group>

          <Group title="Colour overrides">
            <ColourField
              label="External colour override"
              value={slot.overrideExtHex}
              onChange={function(v){ updateSlot({ overrideExtHex: v }); }}
              allowNull={true}
            />
            <ColourField
              label="Internal colour override"
              value={slot.overrideIntHex}
              onChange={function(v){ updateSlot({ overrideIntHex: v }); }}
              allowNull={true}
            />
            <div style={{ fontSize:10, color:T.textMuted, marginTop:0 }}>
              Useful for gaskets, weatherseals, glazing beads — anywhere you want a fixed colour
              regardless of the chosen frame colour. Leave blank to inherit the frame colour.
            </div>
          </Group>

          <div style={{ maxWidth:560, marginTop:24, paddingTop:16, borderTop:'1px solid '+T.border }}>
            <button onClick={function(){ resetProfileToFactory(selectedKey); }}
              style={{ padding:'8px 16px', fontSize:12, fontWeight:600, background:'transparent', color:'#dc2626', border:'1px solid #dc2626', borderRadius:4, cursor:'pointer' }}>
              Clear overrides for this profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
