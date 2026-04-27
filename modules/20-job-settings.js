// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 20-job-settings.js
// Extracted from original index.html lines 13914-14202
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// JOB CRM SETTINGS — Separate from Sales CRM settings
// ══════════════════════════════════════════════════════════════════════════════
var jobSettTab = 'installers';
var jsNewField = {label:'',type:'text',options:[],required:false,newOpt:''};
var jsAddingField = false;
var jsEditFieldId = null;
var editingVehicleId = null;

function renderJobSettings() {
  var TABS = [
    ['installers','Installers & Crew'],
    ['vehicles','Vehicles'],
    ['capacity','Capacity'],
    ['targets','Weekly Targets'],
    ['jobfields','Job Custom Fields'],
    ['jobnumbers','Job Numbers & Entities'],
    ['checkmeasure','Check Measure'],
    ['statuses','Job Statuses'],
  ];
  var content = '';

  // ── INSTALLERS ────────────────────────────────────────────────────────────
  if (jobSettTab === 'installers') {
    var instList = getInstallers();
    var instColours = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#f97316','#6366f1','#14b8a6'];
    var ROLES = {lead_installer:'Lead Installer',installer:'Installer',apprentice:'Apprentice',contractor:'Contractor',labourer:'Labourer'};
    var editInst = editingInstallerId ? instList.find(function(i){return i.id===editingInstallerId;}) : null;
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');

    // ── Add/Edit form ────────────────────────────────────────────────────────
    if ((editingInstallerId === '_new' || editInst) && isAdmin) {
      var v = editInst || {firstName:'',lastName:'',phone:'',email:'',street:'',suburb:'',state:'VIC',postcode:'',role:'installer',hourlyRate:45,overtimeRate:67.50,employmentType:'employee',abn:'',emergencyName:'',emergencyPhone:'',licenseNumber:'',startDate:new Date().toISOString().slice(0,10),branch:'VIC',colour:instColours[instList.length%instColours.length],maxHoursPerDay:8,loginEmail:'',loginPin:'',notes:'',tools:[],licenses:[]};
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<h4 style="font-size:15px;font-weight:700;margin:0">'+(editInst?'Edit Installer':'New Installer')+'</h4>'
        +'<button onclick="editingInstallerId=null;renderPage()" class="btn-g" style="font-size:12px">Cancel</button></div>';
      content += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
        // Personal details
        +'<div class="card" style="padding:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:12px">Personal Details</div>'
        +'<div style="display:grid;gap:10px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">First Name *</label><input class="inp" id="inst_fn" value="'+(v.firstName||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Last Name *</label><input class="inp" id="inst_ln" value="'+(v.lastName||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Phone</label><input class="inp" id="inst_ph" value="'+(v.phone||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Email</label><input class="inp" id="inst_em" value="'+(v.email||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Street Address</label><input class="inp" id="inst_st" placeholder="Start typing address…" value="'+(v.street||'')+'" style="font-size:13px;padding:8px" autocomplete="off"></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Suburb</label><input class="inp" id="inst_sub" value="'+(v.suburb||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">State</label><select class="sel" id="inst_state" style="font-size:13px;padding:8px">'+['VIC','ACT','SA','TAS','NSW','QLD'].map(function(s){return '<option value="'+s+'"'+(v.state===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Postcode</label><input class="inp" id="inst_pc" value="'+(v.postcode||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Emergency Contact</label><input class="inp" id="inst_ecn" value="'+(v.emergencyName||'')+'" placeholder="Name" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Emergency Phone</label><input class="inp" id="inst_ecp" value="'+(v.emergencyPhone||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'</div></div>'
        // Employment & rates
        +'<div class="card" style="padding:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:12px">Employment & Rates</div>'
        +'<div style="display:grid;gap:10px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Role</label><select class="sel" id="inst_role" style="font-size:13px;padding:8px">'+Object.entries(ROLES).map(function(e){return '<option value="'+e[0]+'"'+(v.role===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Employment Type</label><select class="sel" id="inst_etype" style="font-size:13px;padding:8px"><option value="employee"'+(v.employmentType==='employee'?' selected':'')+'>Employee</option><option value="contractor"'+(v.employmentType==='contractor'?' selected':'')+'>Contractor</option></select></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#c41230">Hourly Rate ($) *</label><input type="number" class="inp" id="inst_rate" value="'+(v.hourlyRate||45)+'" step="0.50" style="font-size:14px;padding:8px;font-weight:700"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Overtime Rate ($)</label><input type="number" class="inp" id="inst_otrate" value="'+(v.overtimeRate||67.50)+'" step="0.50" style="font-size:14px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Hrs/Day</label><input type="number" class="inp" id="inst_maxh" value="'+(v.maxHoursPerDay||8)+'" style="font-size:14px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Branch</label><select class="sel" id="inst_branch" style="font-size:13px;padding:8px">'+['VIC','ACT','SA','TAS'].map(function(b){return '<option value="'+b+'"'+(v.branch===b?' selected':'')+'>'+b+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Start Date</label><input type="date" class="inp" id="inst_start" value="'+(v.startDate||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">ABN (contractors)</label><input class="inp" id="inst_abn" value="'+(v.abn||'')+'" placeholder="XX XXX XXX XXX" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">License Number</label><input class="inp" id="inst_lic" value="'+(v.licenseNumber||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">App Login Email</label><input class="inp" id="inst_login" value="'+(v.loginEmail||'')+'" placeholder="For tablet/mobile app" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Tablet PIN (4 digit)</label><input class="inp" id="inst_pin" value="'+(v.loginPin||'')+'" maxlength="4" placeholder="0000" style="font-size:13px;padding:8px;letter-spacing:4px;text-align:center"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Colour</label><div style="display:flex;gap:4px;margin-top:4px">'+instColours.map(function(c){return '<div onclick="document.getElementById(\'inst_col\').value=\''+c+'\';this.parentNode.querySelectorAll(\'div\').forEach(function(d){d.style.border=\'2px solid transparent\'});this.style.border=\'2px solid #111\'" style="width:26px;height:26px;border-radius:50%;background:'+c+';cursor:pointer;border:2px solid '+(v.colour===c?'#111':'transparent')+'"></div>';}).join('')+'<input type="hidden" id="inst_col" value="'+(v.colour||instColours[0])+'"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Notes</label><textarea class="inp" id="inst_notes" rows="2" style="font-size:12px;resize:vertical">'+(v.notes||'')+'</textarea></div>'
        +'</div></div></div>';

      // ── Tools & Equipment ───────────────────────────────────────────────────
      var tools = v.tools || [];
      content += '<div class="card" style="padding:16px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af">\ud83d\udee0\ufe0f Tools & Equipment <span style="font-weight:400">('+tools.length+')</span></div>'
        +'<button onclick="var n=prompt(\'Tool name:\');if(!n)return;var sn=prompt(\'Serial number:\',\'\');var cat=prompt(\'Category (power_tool/hand_tool/safety/measuring/vehicle/other):\',\'power_tool\');'
        +'var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;var t=inst.tools||[];t.push({id:\'t\'+Date.now(),name:n,serialNumber:sn||\'\',category:cat||\'other\',dateIssued:new Date().toISOString().slice(0,10),condition:\'good\',notes:\'\'});updateInstaller(\''+editingInstallerId+'\',{tools:t});renderPage();" class="btn-w" style="font-size:11px;padding:4px 10px">+ Add Tool</button></div>';
      if (tools.length === 0) {
        content += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No tools registered</div>';
      } else {
        content += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Tool</th><th class="th" style="font-size:10px">Serial Number</th><th class="th" style="font-size:10px">Category</th><th class="th" style="font-size:10px">Issued</th><th class="th" style="font-size:10px">Condition</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
        tools.forEach(function(t){
          var catLabels = {power_tool:'Power Tool',hand_tool:'Hand Tool',safety:'Safety',measuring:'Measuring',vehicle:'Vehicle',other:'Other'};
          var condCol = t.condition==='good'?'#22c55e':t.condition==='fair'?'#f59e0b':'#ef4444';
          content += '<tr><td class="td" style="font-weight:600">'+t.name+'</td>'
            +'<td class="td" style="font-family:monospace;font-size:11px;color:#374151;background:#f9fafb;letter-spacing:.5px">'+(t.serialNumber||'\u2014')+'</td>'
            +'<td class="td"><span class="bdg" style="font-size:9px">'+(catLabels[t.category]||t.category)+'</span></td>'
            +'<td class="td">'+(t.dateIssued||'')+'</td>'
            +'<td class="td"><span style="color:'+condCol+';font-weight:600;font-size:10px">\u25cf '+(t.condition||'good')+'</span></td>'
            +'<td class="td"><button onclick="var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.tools=(inst.tools||[]).filter(function(x){return x.id!==\''+t.id+'\'});updateInstaller(\''+editingInstallerId+'\',{tools:inst.tools});renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:10px">\u2715</button></td></tr>';
        });
        content += '</tbody></table>';
      }
      content += '</div>';

      // ── Licenses & Certifications ─────────────────────────────────────────
      var lics = v.licenses || [];
      content += '<div class="card" style="padding:16px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af">\ud83c\udfa3 Licenses & Certifications <span style="font-weight:400">('+lics.length+')</span></div>'
        +'<button onclick="var n=prompt(\'License / Certificate name:\');if(!n)return;var num=prompt(\'License number:\',\'\');var exp=prompt(\'Expiry date (YYYY-MM-DD):\',\'\');'
        +'var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;var l=inst.licenses||[];l.push({id:\'lic\'+Date.now(),name:n,number:num||\'\',issueDate:new Date().toISOString().slice(0,10),expiryDate:exp||\'\',attachmentData:\'\',attachmentName:\'\',notes:\'\'});updateInstaller(\''+editingInstallerId+'\',{licenses:l});renderPage();" class="btn-w" style="font-size:11px;padding:4px 10px">+ Add License</button></div>';
      if (lics.length === 0) {
        content += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No licenses registered</div>';
      } else {
        lics.forEach(function(lic){
          var expired = lic.expiryDate && lic.expiryDate < new Date().toISOString().slice(0,10);
          var expSoon = !expired && lic.expiryDate && lic.expiryDate < new Date(Date.now()+90*86400000).toISOString().slice(0,10);
          content += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:8px;margin-bottom:6px;border-left:3px solid '+(expired?'#ef4444':expSoon?'#f59e0b':'#22c55e')+'">'
            +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">'+lic.name+(lic.number?' <span style="font-family:monospace;font-size:11px;color:#6b7280">#'+lic.number+'</span>':'')+'</div>'
            +'<div style="font-size:11px;color:#6b7280;margin-top:2px">Issued: '+(lic.issueDate||'\u2014')+' \u00b7 Expires: '+(lic.expiryDate||'N/A')
            +(expired?' <span style="color:#ef4444;font-weight:700">\u2014 EXPIRED</span>':'')
            +(expSoon?' <span style="color:#f59e0b;font-weight:600">\u2014 Expiring soon</span>':'')
            +'</div>'
            +(lic.attachmentData?'<div style="margin-top:4px"><a href="'+lic.attachmentData+'" target="_blank" download="'+(lic.attachmentName||'license')+'" style="font-size:11px;color:#3b82f6;text-decoration:none">\ud83d\udcce '+(lic.attachmentName||'View attachment')+'</a></div>':'')
            +'</div>'
            +'<div style="display:flex;gap:4px;flex-shrink:0">'
            +'<label style="font-size:10px;padding:3px 8px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;color:#3b82f6;white-space:nowrap">\ud83d\udcce Attach<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="display:none" onchange="var file=this.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.licenses=(inst.licenses||[]).map(function(l){return l.id===\''+lic.id+'\'?Object.assign({},l,{attachmentData:e.target.result,attachmentName:file.name}):l;});updateInstaller(\''+editingInstallerId+'\',{licenses:inst.licenses});renderPage();};reader.readAsDataURL(file);"></label>'
            +'<button onclick="var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.licenses=(inst.licenses||[]).filter(function(x){return x.id!==\''+lic.id+'\'});updateInstaller(\''+editingInstallerId+'\',{licenses:inst.licenses});renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">\u2715</button></div></div>';
        });
      }
      content += '</div>';

      // Save button
      content += '<div style="display:flex;gap:8px;margin-top:14px">'
        +'<button onclick="var fn=document.getElementById(\'inst_fn\').value.trim();var ln=document.getElementById(\'inst_ln\').value.trim();if(!fn){addToast(\'First name required\',\'error\');return;}'
        +'var d={firstName:fn,lastName:ln,name:fn+\' \'+ln,phone:document.getElementById(\'inst_ph\').value,email:document.getElementById(\'inst_em\').value,street:document.getElementById(\'inst_st\').value,suburb:document.getElementById(\'inst_sub\').value,state:document.getElementById(\'inst_state\').value,postcode:document.getElementById(\'inst_pc\').value,role:document.getElementById(\'inst_role\').value,hourlyRate:parseFloat(document.getElementById(\'inst_rate\').value)||45,overtimeRate:parseFloat(document.getElementById(\'inst_otrate\').value)||67.50,maxHoursPerDay:parseInt(document.getElementById(\'inst_maxh\').value)||8,employmentType:document.getElementById(\'inst_etype\').value,branch:document.getElementById(\'inst_branch\').value,startDate:document.getElementById(\'inst_start\').value,abn:document.getElementById(\'inst_abn\').value,licenseNumber:document.getElementById(\'inst_lic\').value,loginEmail:document.getElementById(\'inst_login\').value,loginPin:document.getElementById(\'inst_pin\').value,colour:document.getElementById(\'inst_col\').value,emergencyName:document.getElementById(\'inst_ecn\').value,emergencyPhone:document.getElementById(\'inst_ecp\').value,notes:document.getElementById(\'inst_notes\').value};'
        +'if(editingInstallerId&&editingInstallerId!==\'_new\'){updateInstaller(editingInstallerId,d);addToast(fn+\' updated\',\'success\');}else{var l=getInstallers();d.id=\'inst_\'+Date.now();d.active=true;d.tools=[];d.licenses=[];l.push(d);saveInstallers(l);addToast(fn+\' \'+ln+\' added\',\'success\');}editingInstallerId=null;renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px">'+(editInst?'Update Installer':'Add Installer')+'</button>'
        +'<button onclick="editingInstallerId=null;renderPage()" class="btn-w" style="font-size:13px">Cancel</button></div>';
    } else {
      // ── List view ──────────────────────────────────────────────────────────
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-size:13px;color:#6b7280">'+instList.length+' installer'+(instList.length!==1?'s':'')+'</div>'
        +(isAdmin?'<button class="btn-r" style="font-size:12px" onclick="editingInstallerId=\'_new\';renderPage()">'+Icon({n:'plus',size:14})+' New Installer</button>':'<span style="font-size:11px;color:#9ca3af;padding:6px 10px;background:#f9fafb;border-radius:6px">Only admins can add/edit installers</span>')
        +'</div>';
      content += '<div style="display:flex;flex-direction:column;gap:8px">';
      instList.forEach(function(inst) {
        var roleLabel = ROLES[inst.role] || inst.role || 'Installer';
        var toolCount = (inst.tools||[]).length;
        var licCount = (inst.licenses||[]).length;
        var expiredLics = (inst.licenses||[]).filter(function(l){return l.expiryDate && l.expiryDate < new Date().toISOString().slice(0,10);}).length;
        content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px;'+(isAdmin?'cursor:pointer':'cursor:default')+'" '+(isAdmin?'onclick="editingInstallerId=\''+inst.id+'\';renderPage()" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'"':'')+'>'
          +'<div style="width:42px;height:42px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
          +'<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">'+(inst.name||inst.firstName+' '+inst.lastName)+'</div>'
          +'<div style="font-size:12px;color:#6b7280;margin-top:1px">'+roleLabel+' \u00b7 '+(inst.phone||'No phone')+' \u00b7 '+inst.branch+'</div>'
          +'<div style="display:flex;gap:6px;margin-top:3px">'
          +(toolCount>0?'<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:4px">\ud83d\udee0 '+toolCount+' tools</span>':'')
          +(licCount>0?'<span style="font-size:10px;background:'+(expiredLics>0?'#fee2e2':'#f0fdf4')+';color:'+(expiredLics>0?'#b91c1c':'#15803d')+';padding:1px 6px;border-radius:4px">\ud83c\udfa3 '+licCount+' license'+(licCount!==1?'s':'')+(expiredLics>0?' ('+expiredLics+' expired)':'')+'</span>':'')
          +'</div></div>'
          +'<div style="text-align:right;flex-shrink:0">'
          +'<div style="font-size:15px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">$'+(inst.hourlyRate||45).toFixed(2)+'/h</div>'
          +'<div style="font-size:10px;color:#6b7280">OT $'+(inst.overtimeRate||67.50).toFixed(2)+'/h</div></div>'
          +'<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'
          +(inst.active?Badge('Active','green'):Badge('Inactive','gray'))
          +(isAdmin?'<span style="font-size:11px;color:#6b7280">'+Icon({n:'right',size:14})+'</span>':'')
          +'</div></div>';
      });
      if (instList.length === 0) content += '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No installers added yet.'+(isAdmin?' Click "New Installer" to add your first crew member.':' Ask an admin to add installers.')+'</div>';
      content += '</div>';
    }


  // ── VEHICLES ──────────────────────────────────────────────────────────────
  } else if (jobSettTab === 'vehicles') {
    var vehList = getVehicles();
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');
    var VSIZES = {small:'Small Van',medium:'Medium Van',large:'Large Van',xl:'Truck / XL'};
    var VTYPES = {van:'Van',ute:'Ute',truck:'Truck',trailer:'Trailer'};
    var editVeh = editingVehicleId ? vehList.find(function(v){return v.id===editingVehicleId;}) : null;

    if ((editingVehicleId === '_new' || editVeh) && isAdmin) {
      var vv = editVeh || {name:'',rego:'',type:'van',size:'medium',maxFrames:8,maxWeightKg:600,assignedTo:'',notes:'',active:true};
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<h4 style="font-size:15px;font-weight:700;margin:0">'+(editVeh?'Edit Vehicle':'New Vehicle')+'</h4>'
        +'<button onclick="editingVehicleId=null;renderPage()" class="btn-g" style="font-size:12px">Cancel</button></div>';
      content += '<div class="card" style="padding:16px;max-width:600px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Vehicle Name *</label><input class="inp" id="veh_name" value="'+(vv.name||'')+'" placeholder="e.g. Van 1, Transit" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Registration</label><input class="inp" id="veh_rego" value="'+(vv.rego||'')+'" placeholder="ABC 123" style="font-size:13px;padding:8px;text-transform:uppercase"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Type</label><select class="sel" id="veh_type" style="font-size:13px;padding:8px">'+Object.entries(VTYPES).map(function(e){return '<option value="'+e[0]+'"'+(vv.type===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Size</label><select class="sel" id="veh_size" style="font-size:13px;padding:8px">'+Object.entries(VSIZES).map(function(e){return '<option value="'+e[0]+'"'+(vv.size===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Frames Capacity</label><input type="number" class="inp" id="veh_frames" value="'+(vv.maxFrames||8)+'" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Weight (kg)</label><input type="number" class="inp" id="veh_weight" value="'+(vv.maxWeightKg||600)+'" style="font-size:13px;padding:8px"></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Assigned Installer (optional)</label>'
        +'<select class="sel" id="veh_inst" style="font-size:13px;padding:8px"><option value="">Unassigned (Pool)</option>'
        +getInstallers().filter(function(i){return i.active;}).map(function(i){return '<option value="'+i.id+'"'+(vv.assignedTo===i.id?' selected':'')+'>'+i.name+'</option>';}).join('')
        +'</select></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Notes</label><textarea class="inp" id="veh_notes" rows="2" style="font-size:12px;resize:vertical">'+(vv.notes||'')+'</textarea></div>'
        +'</div></div>';
      content += '<div style="display:flex;gap:8px;margin-top:14px">'
        +'<button onclick="var name=document.getElementById(\'veh_name\').value.trim();if(!name){addToast(\'Vehicle name required\',\'error\');return;}'
        +'var d={name:name,rego:document.getElementById(\'veh_rego\').value.trim().toUpperCase(),type:document.getElementById(\'veh_type\').value,size:document.getElementById(\'veh_size\').value,maxFrames:parseInt(document.getElementById(\'veh_frames\').value)||8,maxWeightKg:parseInt(document.getElementById(\'veh_weight\').value)||600,assignedTo:document.getElementById(\'veh_inst\').value,notes:document.getElementById(\'veh_notes\').value};'
        +'if(editingVehicleId&&editingVehicleId!==\'_new\'){updateVehicle(editingVehicleId,d);addToast(name+\' updated\',\'success\');}else{addVehicle(d);addToast(name+\' added\',\'success\');}editingVehicleId=null;renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px">'+(editVeh?'Update Vehicle':'Add Vehicle')+'</button>'
        +'<button onclick="editingVehicleId=null;renderPage()" class="btn-w" style="font-size:13px">Cancel</button></div>';
    } else {
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-size:13px;color:#6b7280">'+vehList.length+' vehicle'+(vehList.length!==1?'s':'')+'</div>'
        +(isAdmin?'<button class="btn-r" style="font-size:12px" onclick="editingVehicleId=\'_new\';renderPage()">+ New Vehicle</button>':'<span style="font-size:11px;color:#9ca3af;padding:6px 10px;background:#f9fafb;border-radius:6px">Only admins can add vehicles</span>')
        +'</div>';
      if (vehList.length === 0) {
        content += '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No vehicles added yet.'+(isAdmin?' Click "New Vehicle" to add your first vehicle.':' Ask an admin to add vehicles.')+'</div>';
      } else {
        content += '<div style="display:flex;flex-direction:column;gap:8px">';
        vehList.forEach(function(v){
          var sizeLabel = VSIZES[v.size] || v.size;
          var typeLabel = VTYPES[v.type] || v.type;
          var assignedInst = v.assignedTo ? getInstallers().find(function(i){return i.id===v.assignedTo;}) : null;
          var sizeCol = {small:'#22c55e',medium:'#3b82f6',large:'#f59e0b',xl:'#ef4444'}[v.size] || '#9ca3af';
          content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px;'+(isAdmin?'cursor:pointer':'cursor:default')+'" '+(isAdmin?'onclick="editingVehicleId=\''+v.id+'\';renderPage()" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'"':'')+'>'
            +'<div style="width:42px;height:42px;border-radius:10px;background:'+sizeCol+';color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">🚐</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:14px;font-weight:600">'+v.name+(v.rego?' <span style="font-size:11px;font-family:monospace;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px">'+v.rego+'</span>':'')+'</div>'
            +'<div style="font-size:12px;color:#6b7280;margin-top:2px">'+typeLabel+' · '+sizeLabel+' · '+v.maxFrames+' frames max · '+v.maxWeightKg+'kg</div>'
            +(assignedInst?'<div style="font-size:11px;color:#3b82f6;margin-top:2px">Assigned to '+assignedInst.name+'</div>':'<div style="font-size:11px;color:#9ca3af;margin-top:2px">Pool vehicle</div>')
            +'</div>'
            +'<div style="display:flex;gap:6px;align-items:center">'
            +(v.active?'<span style="font-size:10px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-weight:600">Active</span>':'<span style="font-size:10px;background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:4px;font-weight:600">Inactive</span>')
            +(isAdmin?'<button onclick="event.stopPropagation();updateVehicle(\''+v.id+'\',{active:'+(!v.active)+'});addToast(\''+(v.active?'Deactivated':'Activated')+'\',\'success\')" class="btn-g" style="font-size:11px;padding:4px 8px">'+(v.active?'Deactivate':'Activate')+'</button>':'')
            +(isAdmin?'<button onclick="event.stopPropagation();if(confirm(\'Remove '+v.name+'?\')){removeVehicle(\''+v.id+'\')}" class="btn-g" style="font-size:11px;padding:4px 8px;color:#ef4444">✕</button>':'')
            +'</div></div>';
        });
        content += '</div>';
      }
    }

  // ── CAPACITY ──────────────────────────────────────────────────────────────
  } else if (jobSettTab === 'capacity') {
    var installers = getInstallers().filter(function(i){return i.active;});
    var branches = ['VIC','ACT','SA','TAS'];
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Daily capacity is calculated from each installer\'s max hours per day. The buffer % reserves time for travel, setup, and unexpected delays.</div>';

    branches.forEach(function(b){
      var branchInstallers = installers.filter(function(i){return i.branch===b;});
      if (branchInstallers.length === 0) return;
      var totalHours = branchInstallers.reduce(function(sum,i){return sum+(i.maxHoursPerDay||8);},0);
      var bufferKey = 'capacity_buffer_'+b;
      var buffer = parseInt(localStorage.getItem(bufferKey)||'20');
      var effectiveHours = Math.round(totalHours * (1 - buffer/100));

      content += '<div class="card" style="padding:16px;margin-bottom:12px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
        +'<div style="font-size:14px;font-weight:700">'+b+' Branch</div>'
        +'<span style="font-size:11px;color:#6b7280">'+branchInstallers.length+' active installer'+(branchInstallers.length!==1?'s':'')+'</span></div>'

        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">'
        +'<div style="padding:12px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">TOTAL HOURS/DAY</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">'+totalHours+'h</div></div>'
        +'<div style="padding:12px;background:#fff5f6;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">BUFFER</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230">'+buffer+'%</div></div>'
        +'<div style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">EFFECTIVE/DAY</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#15803d">'+effectiveHours+'h</div></div>'
        +'</div>'

        +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
        +'<label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap">Capacity Buffer %</label>'
        +'<input type="range" min="0" max="50" value="'+buffer+'" style="flex:1" oninput="this.nextElementSibling.textContent=this.value+\'%\';localStorage.setItem(\''+bufferKey+'\',this.value);renderPage()">'
        +'<span style="font-size:13px;font-weight:700;width:40px;text-align:right">'+buffer+'%</span></div>'

        +'<div style="border-top:1px solid #f0f0f0;padding-top:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">Installers</div>'
        +'<div style="display:flex;flex-direction:column;gap:6px">';

      branchInstallers.forEach(function(inst){
        var pct = Math.round((inst.maxHoursPerDay||8) / totalHours * 100);
        content += '<div style="display:flex;align-items:center;gap:10px">'
          +'<div style="width:32px;height:32px;border-radius:50%;background:'+(inst.colour||'#3b82f6')+';color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-weight:600">'+(inst.name||'')+'</span><span style="font-size:11px;color:#6b7280">'+(inst.maxHoursPerDay||8)+'h · '+pct+'% of team</span></div>'
          +'<div style="height:6px;background:#e5e7eb;border-radius:3px"><div style="height:6px;background:'+(inst.colour||'#3b82f6')+';border-radius:3px;width:'+pct+'%"></div></div>'
          +'</div></div>';
      });

      content += '</div></div></div>';
    });

    if (installers.length === 0) {
      content = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No active installers found. Add installers first to configure capacity.</div>';
    }

  // ── WEEKLY TARGETS ────────────────────────────────────────────────────────
  } else if (jobSettTab === 'targets') {
    var t = getState().weeklyTargets || {};
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Set weekly installation revenue targets per branch. These drive the KPI bars on the Install Schedule and Smart Planner.</div>';
    content += '<div style="display:flex;flex-direction:column;gap:12px;max-width:400px">';
    ['VIC','ACT','SA','TAS'].forEach(function(b){
      content += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f9fafb;border-radius:10px">'
        +'<span style="font-size:14px;font-weight:700;width:40px">'+b+'</span>'
        +'<div style="flex:1"><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">Weekly Target ($)</label>'
        +'<input type="number" class="inp" value="'+(t[b]||0)+'" style="font-size:14px;padding:8px" onblur="var t=Object.assign({},getState().weeklyTargets||{});t[\''+b+'\']=parseInt(this.value)||0;setState({weeklyTargets:t})"></div>'
        +'<div style="font-size:12px;color:#9ca3af;text-align:right"><div>$'+Math.round((t[b]||0)/5).toLocaleString()+'/day</div><div>$'+Math.round((t[b]||0)*52).toLocaleString()+'/yr</div></div></div>';
    });
    content += '</div>';

  // ── JOB CUSTOM FIELDS ─────────────────────────────────────────────────────
  } else if (jobSettTab === 'jobfields') {
    var fields = getState().jobFields || [];
    var sorted = fields.slice().sort(function(a,b){return a.ord-b.ord;});
    content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div style="font-size:13px;color:#6b7280">'+fields.length+' custom field'+(fields.length!==1?'s':'')+'</div>'
      +'<button class="btn-r" style="font-size:12px" onclick="jsAddingField=true;jsEditFieldId=null;jsNewField={label:\'\',type:\'text\',options:[],required:false,newOpt:\'\'};renderPage()">'+Icon({n:'plus',size:14})+' Add Field</button></div>';

    // Field list with drag handles
    content += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">';
    sorted.forEach(function(f,i){
      content += '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:'+(jsEditFieldId===f.id?'#fff5f6':'#f9fafb')+';border-radius:10px;'+(jsEditFieldId===f.id?'border:1.5px solid #fca5a5':'border:1px solid transparent')+'">'
        +'<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">'
        +(i>0?'<button onclick="cfMoveField(\'jobs\',\''+f.id+'\',\'up\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color=\'#374151\'" onmouseout="this.style.color=\'#9ca3af\'">\u25b2</button>':'<div style="height:14px"></div>')
        +(i<sorted.length-1?'<button onclick="cfMoveField(\'jobs\',\''+f.id+'\',\'down\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color=\'#374151\'" onmouseout="this.style.color=\'#9ca3af\'">\u25bc</button>':'<div style="height:14px"></div>')
        +'</div>'
        +'<span style="font-size:13px;font-weight:500;flex:1">'+f.label+(f.required?'<span style="color:#c41230;margin-left:2px">*</span>':'')+'</span>'
        +'<span class="bdg" style="background:#f0f0f0;color:#555;font-size:10px">'+(CF_TYPE_LABELS[f.type]||f.type)+'</span>'
        +'<button onclick="cfToggleRequired(\'jobs\',\''+f.id+'\')" style="font-size:10px;padding:2px 8px;border-radius:16px;border:1px solid;cursor:pointer;font-family:inherit;'+(f.required?'background:#fee2e2;border-color:#fca5a5;color:#b91c1c':'background:#f9fafb;border-color:#e5e7eb;color:#9ca3af')+'">'+(f.required?'Required':'Optional')+'</button>'
        +'<button onclick="jsEditFieldId=\''+f.id+'\';jsAddingField=false;jsNewField={label:\''+f.label.replace(/'/g,"\\'")+'\',type:\''+f.type+'\',options:'+JSON.stringify(f.options||[])+',required:'+!!f.required+',newOpt:\'\'};renderPage()" class="btn-g" style="padding:4px 8px">'+Icon({n:'edit',size:12})+'</button>'
        +'<button onclick="cfDeleteField(\'jobs\',\''+f.id+'\')" class="btn-g" style="padding:4px 8px;color:#ef4444">'+Icon({n:'trash',size:12})+'</button>'
        +'</div>';
    });
    content += '</div>';

    // Add/Edit form
    if (jsAddingField || jsEditFieldId) {
      content += '<div style="padding:16px;background:#fff5f6;border-radius:12px;border:1.5px solid #fca5a5;margin-bottom:12px">'
        +'<div style="font-size:13px;font-weight:700;margin-bottom:12px">'+(jsEditFieldId?'Edit Field':'Add New Job Field')+'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">'
        +'<div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Label *</label>'
        +'<input class="inp" id="jsFieldLabel" value="'+jsNewField.label+'" placeholder="Field name" style="font-size:13px"></div>'
        +'<div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>'
        +'<select class="sel" id="jsFieldType" style="font-size:13px" onchange="jsNewField.type=this.value;renderPage()">'
        +Object.entries(CF_TYPE_LABELS).map(function(e){return '<option value="'+e[0]+'"'+(jsNewField.type===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')
        +'</select></div></div>';
      if (jsNewField.type==='dropdown'||jsNewField.type==='multiselect') {
        content += '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Options</label>'
          +'<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">'
          +jsNewField.options.map(function(o,i){return '<div style="display:flex;gap:6px;align-items:center"><span style="font-size:13px;flex:1;padding:4px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px">'+o+'</span><button onclick="jsNewField.options=jsNewField.options.filter(function(_,j){return j!=='+i+'});renderPage()" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px">\u00d7</button></div>';}).join('')
          +'</div>'
          +'<div style="display:flex;gap:6px"><input class="inp" id="jsNewOpt" placeholder="Add option" style="font-size:12px;flex:1" onkeypress="if(event.key===\'Enter\'){var v=this.value.trim();if(v){jsNewField.options.push(v);renderPage();}}"><button onclick="var v=document.getElementById(\'jsNewOpt\').value.trim();if(v){jsNewField.options.push(v);renderPage();}" class="btn-w" style="font-size:11px;padding:4px 10px">Add</button></div></div>';
      }
      content += '<div style="display:flex;gap:8px">'
        +'<button onclick="var label=document.getElementById(\'jsFieldLabel\').value.trim();var type=document.getElementById(\'jsFieldType\').value;if(!label){addToast(\'Label required\',\'error\');return;}var s=getState();var list=s.jobFields||[];if(jsEditFieldId){setState({jobFields:list.map(function(f){return f.id===jsEditFieldId?Object.assign({},f,{label:label,type:type,options:jsNewField.options,required:jsNewField.required}):f;})});addToast(\'Field updated\',\'success\');}else{setState({jobFields:list.concat([{id:\'jf\'+Date.now(),label:label,type:type,options:jsNewField.options,required:jsNewField.required,ord:list.length+1}])});addToast(\'Field added\',\'success\');}jsAddingField=false;jsEditFieldId=null;jsNewField={label:\'\',type:\'text\',options:[],required:false,newOpt:\'\'};renderPage();" class="btn-r" style="font-size:12px">Save</button>'
        +'<button onclick="jsAddingField=false;jsEditFieldId=null;renderPage()" class="btn-w" style="font-size:12px">Cancel</button></div></div>';
    }

  // ── JOB NUMBERS & LEGAL ENTITIES ──────────────────────────────────────────
  } else if (jobSettTab === 'jobnumbers') {
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Configure job number prefixes and legal entity names per branch.</div>';
    content += '<div style="display:flex;flex-direction:column;gap:12px;max-width:600px">';
    ['VIC','ACT','SA','TAS'].forEach(function(b){
      content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px">'
        +'<span style="font-size:15px;font-weight:800;width:45px;color:#c41230">'+b+'</span>'
        +'<div style="flex:1;display:grid;gap:8px">'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Job Number Prefix</label><div style="font-size:14px;font-weight:600;margin-top:2px">'+b+'-</div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Legal Entity</label><div style="font-size:13px;margin-top:2px">'+(JOB_LEGAL_ENTITIES[b]||'\u2014')+'</div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">ABN</label><div style="font-size:13px;margin-top:2px">'+(SPARTAN_ABNS[b]||'\u2014')+'</div></div>'
        +'</div></div>';
    });
    content += '</div>';
    content += '<div style="margin-top:16px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;color:#475569">Job numbers auto-increment per branch (e.g., VIC-4001, VIC-4002\u2026). The counter is managed locally per branch.</div>';

  // ── CHECK MEASURE SETTINGS ────────────────────────────────────────────────
  } else if (jobSettTab === 'checkmeasure') {
    content = '<div style="max-width:600px">';
    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Window Configurations</h4>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">'
      +JOB_WINDOW_CONFIGS.map(function(c){return '<span class="bdg" style="font-size:12px;padding:4px 12px">'+c+'</span>';}).join('')
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Trim Codes Dictionary</h4>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">'
      +CM_TRIM_CODES.map(function(c){return '<span class="bdg" style="font-size:12px;padding:4px 12px">'+c+'</span>';}).join('')
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Default Progress Claim Percentages</h4>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Deposit</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">5%</div></div>'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Check Measure</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230">45%</div></div>'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Final Balance</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">50%</div></div>'
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Final Sign-Off Clauses</h4>'
      +'<div style="display:flex;flex-direction:column;gap:6px">';
    FINAL_SIGNOFF_CLAUSES.forEach(function(cl,i){
      content += '<div style="display:flex;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:8px">'
        +'<span style="font-size:12px;font-weight:700;color:#c41230;width:20px;flex-shrink:0">'+(i+1)+'</span>'
        +'<div><div style="font-size:12px;font-weight:600;margin-bottom:2px">'+cl.label+'</div>'
        +'<div style="font-size:11px;color:#6b7280">'+cl.text+'</div></div></div>';
    });
    content += '</div></div>';

  // ── JOB STATUSES ──────────────────────────────────────────────────────────
  } else if (jobSettTab === 'statuses') {
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">The 25-status workflow for job progression. Statuses are enforced by gate logic \u2014 jobs cannot skip required steps.</div>';
    var groups = {};
    JOB_STATUSES.forEach(function(s){ if(!groups[s.group]) groups[s.group]=[]; groups[s.group].push(s); });
    JOB_STATUS_GROUPS.forEach(function(g){
      var grpStatuses = groups[g.key] || [];
      if (grpStatuses.length === 0) return;
      content += '<div style="margin-bottom:16px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:'+g.col+';margin-bottom:8px">'+g.label+'</div>'
        +'<div style="display:flex;flex-direction:column;gap:4px">';
      grpStatuses.forEach(function(s){
        content += '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:#f9fafb;border-radius:8px;border-left:3px solid '+s.col+'">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+s.col+';flex-shrink:0"></div>'
          +'<span style="font-size:13px;font-weight:500;flex:1">'+s.label+'</span>'
          +'<span class="bdg" style="font-size:10px;background:'+s.col+'15;color:'+s.col+'">'+s.group+'</span></div>';
      });
      content += '</div></div>';
    });
  }

  return '<div>'
    +'<div style="margin-bottom:20px"><h1 style="font-size:24px;font-weight:800;margin:0;font-family:Syne,sans-serif">Job CRM Settings</h1>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Configuration for the Job CRM module \u2014 separate from Sales CRM settings</p></div>'
    +'<div style="display:flex;gap:20px">'
    +'<div style="width:200px;flex-shrink:0"><div class="card" style="padding:6px">'
    +TABS.map(function(t){return '<button onclick="jobSettTab=\''+t[0]+'\';renderPage()" style="width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:none;font-size:13px;font-weight:'+(jobSettTab===t[0]?'600':'400')+';cursor:pointer;font-family:inherit;background:'+(jobSettTab===t[0]?'#fff5f6':'transparent')+';color:'+(jobSettTab===t[0]?'#c41230':'#374151')+';transition:all .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\''+(jobSettTab===t[0]?'#fff5f6':'transparent')+'\'">'+t[1]+'</button>';}).join('')
    +'</div></div>'
    +'<div style="flex:1;min-width:0"><div class="card" style="overflow:hidden">'
    +'<div style="padding:16px 20px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;margin:0">'+(TABS.find(function(t){return t[0]===jobSettTab;})||['',''])[1]+'</h3></div>'
    +'<div style="padding:20px">'+content+'</div>'
    +'</div></div></div></div>';
}

