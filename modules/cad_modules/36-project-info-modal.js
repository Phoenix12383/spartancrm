// ═══════════════════════════════════════════════════════════════════════════
// PROJECT INFO MODAL — customer + site address editor (spec §4.5)
// ═══════════════════════════════════════════════════════════════════════════
// Opens from the project-name header in the main app chrome. Lets the user
// edit the customer block (name, phone, email) and the install-site address.
// When CAD is linked to a CRM entity, a checkbox lets the user push site-
// address changes back to the source CRM row via updateEntityAddress().
//
// Props:
//   projectInfo   — current projectInfo state object from SpartanCADPreview
//   projectName   — current projectName string
//   crmLink       — current crmLink (or null in standalone)
//   isReadOnly    — disables all inputs + Save button when true
//   onSave(next, { propagateAddress }) — called with updated values on save
//   onClose()     — close modal without saving
function ProjectInfoModal(props) {
  var initial = props.projectInfo || {};
  var crmLink = props.crmLink;
  var hasEntity = !!(crmLink && crmLink.type && crmLink.id);
  var isReadOnly = !!props.isReadOnly;

  var [customerName, setCustomerName] = React.useState(initial.customerName || '');
  var [phone, setPhone] = React.useState(initial.phone || '');
  var [email, setEmail] = React.useState(initial.email || '');
  var [address1, setAddress1] = React.useState(initial.address1 || '');
  var [address2, setAddress2] = React.useState(initial.address2 || '');
  var [suburb, setSuburb] = React.useState(initial.suburb || '');
  var [stateAbbr, setStateAbbr] = React.useState(initial.state || '');
  var [postcode, setPostcode] = React.useState(initial.postcode || '');
  var [projName, setProjName] = React.useState(props.projectName || '');
  var [propertyType, setPropertyType] = React.useState(initial.propertyType || 'brick_veneer');
  var [installationType, setInstallationType] = React.useState(initial.installationType || 'retrofit');
  var [propagateAddress, setPropagateAddress] = React.useState(false);
  var [busy, setBusy] = React.useState(false);
  var [err, setErr] = React.useState(null);

  // Detect whether any address field has changed from the loaded values —
  // the back-prop checkbox only makes sense in that case.
  var addrChanged = (
    address1 !== (initial.address1 || '') ||
    address2 !== (initial.address2 || '') ||
    suburb   !== (initial.suburb   || '') ||
    stateAbbr!== (initial.state    || '') ||
    postcode !== (initial.postcode || '')
  );

  var field = {
    display:'block', marginBottom:10, fontSize:11, fontWeight:600, color:'#333',
  };
  var inp = {
    width:'100%', padding:'7px 9px', border:'1px solid #d1d5db', borderRadius:4,
    marginTop:3, fontSize:12, fontFamily:'inherit', boxSizing:'border-box',
    background: isReadOnly ? '#f5f5f5' : 'white',
  };

  async function handleSave() {
    if (isReadOnly) return;
    if (!customerName.trim()) { setErr('Customer name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      var next = {
        customerName: customerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address1: address1.trim(),
        address2: address2.trim(),
        suburb: suburb.trim(),
        state: stateAbbr.trim(),
        postcode: postcode.trim(),
        propertyType: propertyType,
        installationType: installationType,
      };
      await Promise.resolve(props.onSave(next, {
        projectName: projName.trim(),
        propagateAddress: propagateAddress && addrChanged && hasEntity,
      }));
      // onSave is responsible for closing the modal on success.
    } catch (e) {
      setErr((e && e.message) || String(e));
      setBusy(false);
    }
  }

  return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1050,
                       display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
    <div style={{ background:'white', borderRadius:8, width:'100%', maxWidth:520,
                  maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 40px rgba(0,0,0,0.3)' }}>
      {/* Header */}
      <div style={{ padding:'14px 18px', borderBottom:'1px solid #eee',
                    display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:14, fontWeight:700 }}>
          Project & Customer Details
          {isReadOnly && <span style={{ marginLeft:8, fontSize:10, fontWeight:600,
                                         background:'#fef3c7', color:'#78350f',
                                         padding:'2px 6px', borderRadius:3 }}>READ-ONLY</span>}
        </div>
        <button onClick={props.onClose}
                style={{ background:'transparent', border:'none', fontSize:18, cursor:'pointer', color:'#999' }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ padding:18 }}>
        <label style={field}>Project name
          <input value={projName} onChange={function(e){ setProjName(e.target.value); }}
                 readOnly={isReadOnly} style={inp}/>
        </label>
        <div style={{ borderTop:'1px solid #eee', margin:'14px 0 10px', paddingTop:14,
                      fontSize:11, fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:0.5 }}>
          Customer
        </div>
        <label style={field}>Name
          <input value={customerName} onChange={function(e){ setCustomerName(e.target.value); }}
                 readOnly={isReadOnly} style={inp}/>
        </label>
        <div style={{ display:'flex', gap:10 }}>
          <label style={Object.assign({}, field, { flex:1 })}>Phone
            <input value={phone} onChange={function(e){ setPhone(e.target.value); }}
                   readOnly={isReadOnly} style={inp}/>
          </label>
          <label style={Object.assign({}, field, { flex:1.3 })}>Email
            <input type="email" value={email} onChange={function(e){ setEmail(e.target.value); }}
                   readOnly={isReadOnly} style={inp}/>
          </label>
        </div>

        <div style={{ borderTop:'1px solid #eee', margin:'14px 0 10px', paddingTop:14,
                      fontSize:11, fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:0.5 }}>
          Installation site address
        </div>
        <label style={field}>Address line 1
          <input value={address1} onChange={function(e){ setAddress1(e.target.value); }}
                 readOnly={isReadOnly} style={inp} placeholder="e.g. 12 Smith Street"/>
        </label>
        <label style={field}>Address line 2 <span style={{ fontWeight:400, color:'#999' }}>(optional)</span>
          <input value={address2} onChange={function(e){ setAddress2(e.target.value); }}
                 readOnly={isReadOnly} style={inp} placeholder="Unit, floor, etc."/>
        </label>
        <div style={{ display:'flex', gap:10 }}>
          <label style={Object.assign({}, field, { flex:2 })}>Suburb
            <input value={suburb} onChange={function(e){ setSuburb(e.target.value); }}
                   readOnly={isReadOnly} style={inp}/>
          </label>
          <label style={Object.assign({}, field, { flex:1 })}>State
            <input value={stateAbbr} onChange={function(e){ setStateAbbr(e.target.value.toUpperCase()); }}
                   readOnly={isReadOnly} maxLength={3} style={inp} placeholder="VIC"/>
          </label>
          <label style={Object.assign({}, field, { flex:1 })}>Postcode
            <input value={postcode} onChange={function(e){ setPostcode(e.target.value); }}
                   readOnly={isReadOnly} maxLength={4} style={inp}/>
          </label>
        </div>

        <div style={{ borderTop:'1px solid #eee', margin:'14px 0 10px', paddingTop:14,
                      fontSize:11, fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:0.5 }}>
          Installation
        </div>
        <label style={field}>Property type
          <select value={propertyType}
                  onChange={function(e){ setPropertyType(e.target.value); }}
                  disabled={isReadOnly} style={inp}>
            {(typeof PROPERTY_TYPES !== 'undefined' ? PROPERTY_TYPES : []).map(function(p){
              return <option key={p.id} value={p.id}>{p.label}</option>;
            })}
          </select>
          <span style={{ fontWeight:400, color:'#999', fontSize:10, display:'block', marginTop:3 }}>
            Default for new windows on this project. Override per-window from the 3D view if a section of the house differs.
          </span>
        </label>

        <label style={field}>Installation type
          <select value={installationType}
                  onChange={function(e){ setInstallationType(e.target.value); }}
                  disabled={isReadOnly} style={inp}>
            {(typeof INSTALLATION_TYPES !== 'undefined' ? INSTALLATION_TYPES : []).map(function(p){
              return <option key={p.id} value={p.id}>{p.label}</option>;
            })}
          </select>
          <span style={{ fontWeight:400, color:'#999', fontSize:10, display:'block', marginTop:3 }}>
            Default for new windows. Retrofit = existing residence (demo old window); Supply Only = no install priced; New Construction = no demo required (faster install).
          </span>
        </label>

        {/* Back-propagation checkbox — only when linked to a CRM entity and
            the address actually changed. Clarifies what will be written to
            which row so the user isn't surprised by a silent side-effect. */}
        {hasEntity && addrChanged && !isReadOnly && (
          <div style={{ marginTop:10, padding:10, background:'#f0f9ff',
                         border:'1px solid #bae6fd', borderRadius:4 }}>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', fontSize:12, color:'#075985' }}>
              <input type="checkbox" checked={propagateAddress}
                     onChange={function(e){ setPropagateAddress(e.target.checked); }}
                     style={{ marginTop:2 }}/>
              <span>
                <strong>Also update the {crmLink.type} record in the CRM</strong><br/>
                <span style={{ color:'#0369a1', fontSize:11 }}>
                  Writes this address to {crmLink.type} #{crmLink.id} so future communications use it.
                </span>
              </span>
            </label>
          </div>
        )}

        {err && <div style={{ marginTop:10, padding:8, background:'#fef2f2',
                               border:'1px solid #fecaca', borderRadius:4,
                               color:'#991b1b', fontSize:11 }}>{err}</div>}
      </div>

      {/* Footer */}
      <div style={{ padding:'12px 18px', borderTop:'1px solid #eee',
                    display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={props.onClose} disabled={busy}
                style={{ padding:'7px 14px', border:'1px solid #d1d5db', background:'white',
                         borderRadius:4, fontSize:12, cursor:'pointer' }}>
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={busy || !customerName.trim()}
                  style={{ padding:'7px 14px', border:'none',
                           background: (busy || !customerName.trim()) ? '#888' : '#1a1a1a',
                           color:'white', borderRadius:4, fontSize:12, fontWeight:600,
                           cursor: (busy || !customerName.trim()) ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  </div>;
}

