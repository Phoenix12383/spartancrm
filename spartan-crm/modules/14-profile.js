// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 14-profile.js
// Extracted from original index.html lines 10708-10866
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE PAGE & DROPDOWN
// ══════════════════════════════════════════════════════════════════════════════
let profileDropOpen = false;

function toggleProfileDrop() {
  profileDropOpen = !profileDropOpen;
  var el = document.getElementById('profileDrop');
  if(el) el.style.display = profileDropOpen ? 'block' : 'none';
}

function renderProfilePage() {
  var cu = getCurrentUser() || {id:'',name:'Admin',email:'',role:'admin',branch:'All',phone:'',initials:'AD'};
  var isAdmin = cu.role === 'admin';
  var allUsers = getUsers();
  var myUser = allUsers.find(function(u){return u.id===cu.id;}) || cu;

  return `
  <div style="max-width:720px">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div style="width:64px;height:64px;background:#c41230;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;font-family:Syne,sans-serif;flex-shrink:0">${myUser.googlePic?'<img src="'+myUser.googlePic+'" referrerpolicy="no-referrer" style="width:64px;height:64px;border-radius:50%">':myUser.initials}</div>
      <div>
        <h1 style="font-size:22px;font-weight:800;margin:0;font-family:Syne,sans-serif">${myUser.name}</h1>
        <p style="font-size:13px;color:#6b7280;margin:2px 0 0">${myUser.email} &middot; ${myUser.role.replace('_',' ')} &middot; ${myUser.branch}</p>
      </div>
    </div>

    <!-- Personal Details -->
    <div class="card" style="padding:0;margin-bottom:18px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">Personal Details</h3>
        <button onclick="profileSaveDetails()" class="btn-r" style="font-size:12px;padding:6px 16px">Save Changes</button>
      </div>
      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Full Name</label>
          <input class="inp" id="prof_name" value="${myUser.name}" style="font-size:14px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="prof_email" value="${myUser.email}" style="font-size:14px" ${isAdmin?'':'disabled'}>
          ${isAdmin?'':'<div style="font-size:11px;color:#9ca3af;margin-top:2px">Only admins can change email</div>'}
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Phone</label>
          <input class="inp" id="prof_phone" value="${myUser.phone||''}" placeholder="+61 4xx xxx xxx" style="font-size:14px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Branch</label>
          ${isAdmin?
            '<select class="sel" id="prof_branch" style="font-size:14px"><option value="All" '+(myUser.branch==='All'?'selected':'')+'>All</option><option value="VIC" '+(myUser.branch==='VIC'?'selected':'')+'>VIC</option><option value="ACT" '+(myUser.branch==='ACT'?'selected':'')+'>ACT</option><option value="SA" '+(myUser.branch==='SA'?'selected':'')+'>SA</option></select>'
            :'<input class="inp" value="'+myUser.branch+'" disabled style="font-size:14px"><div style="font-size:11px;color:#9ca3af;margin-top:2px">Branch assigned by admin</div>'}
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card" style="padding:0;margin-bottom:18px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0">
        <h3 style="font-size:15px;font-weight:700;margin:0">Change Password</h3>
      </div>
      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Current Password</label>
          <input class="inp" id="prof_curpw" type="password" placeholder="Current password" style="font-size:14px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">New Password</label>
          <input class="inp" id="prof_newpw" type="password" placeholder="New password" style="font-size:14px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Confirm New Password</label>
          <input class="inp" id="prof_cfmpw" type="password" placeholder="Confirm" style="font-size:14px">
        </div>
      </div>
      <div style="padding:0 20px 16px;display:flex;justify-content:flex-end">
        <button onclick="profileChangePassword()" class="btn-w" style="font-size:12px">Update Password</button>
      </div>
    </div>

    <!-- Account Info -->
    <div class="card" style="padding:0;margin-bottom:18px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0">
        <h3 style="font-size:15px;font-weight:700;margin:0">Account</h3>
      </div>
      <div style="padding:20px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
          <div>
            <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Role</div>
            <div style="font-size:14px;font-weight:600;color:#374151">${myUser.role.replace('_',' ').replace(/\\b\\w/g,function(c){return c.toUpperCase();})}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">User ID</div>
            <div style="font-size:14px;font-weight:600;color:#374151;font-family:monospace">${myUser.id}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Status</div>
            <div style="font-size:14px;font-weight:600;color:#15803d">Active</div>
          </div>
        </div>
        ${isAdmin?`<div style="padding-top:12px;border-top:1px solid #f0f0f0;display:flex;gap:10px"><button onclick="settTab='users';setState({page:'settings'})" class="btn-r" style="font-size:12px;gap:6px">${Icon({n:'settings',size:13})} Manage All Users</button><span style="font-size:12px;color:#9ca3af;padding-top:6px">Add, deactivate, or change access for team members</span></div>`:'<div style="font-size:12px;color:#9ca3af">Contact your admin to change your role or access level.</div>'}
      </div>
    </div>

    <!-- Gmail Connection -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0">
        <h3 style="font-size:15px;font-weight:700;margin:0">Gmail Connection</h3>
      </div>
      <div style="padding:20px">
        ${getState().gmailConnected?
          '<div style="display:flex;align-items:center;gap:12px"><div style="width:36px;height:36px;background:#EA4335;border-radius:50%;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">G</div><div style="flex:1"><div style="font-size:13px;font-weight:600;color:#15803d">Connected</div><div style="font-size:12px;color:#6b7280">'+(getState().gmailUser?getState().gmailUser.email:'')+'</div></div><button onclick="gmailDisconnect()" class="btn-w" style="font-size:12px;color:#b91c1c;border-color:#fca5a5">Disconnect</button></div>'
          :'<div style="display:flex;align-items:center;gap:12px"><div style="width:36px;height:36px;background:#f3f4f6;border-radius:50%;color:#9ca3af;font-size:16px;display:flex;align-items:center;justify-content:center">G</div><div style="flex:1"><div style="font-size:13px;font-weight:600;color:#374151">Not connected</div><div style="font-size:12px;color:#9ca3af">Connect Gmail to send emails from within the CRM</div></div><button onclick="gmailConnect()" class="btn-r" style="font-size:12px">Connect Gmail</button></div>'}
      </div>
    </div>
  </div>`;
}

function profileSaveDetails() {
  var cu = getCurrentUser();
  if (!cu) return;
  var name = document.getElementById('prof_name').value.trim();
  var phone = document.getElementById('prof_phone').value.trim();
  var branchEl = document.getElementById('prof_branch');
  var emailEl = document.getElementById('prof_email');
  if (!name) { addToast('Name is required','error'); return; }
  var users = getUsers();
  var u = users.find(function(x){return x.id===cu.id;});
  if (!u) return;
  u.name = name;
  u.phone = phone;
  u.initials = name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  if (branchEl) u.branch = branchEl.value;
  if (emailEl && cu.role==='admin') u.email = emailEl.value.trim();
  saveUsers(users);
  addToast('Profile updated','success');
  renderPage();
}

function profileChangePassword() {
  var cu = getCurrentUser();
  if (!cu) return;
  var curPw = document.getElementById('prof_curpw').value;
  var newPw = document.getElementById('prof_newpw').value;
  var cfmPw = document.getElementById('prof_cfmpw').value;
  var users = getUsers();
  var u = users.find(function(x){return x.id===cu.id;});
  if (!u) return;
  if (u.pw !== curPw) { addToast('Current password is incorrect','error'); return; }
  if (!newPw || newPw.length < 4) { addToast('New password must be at least 4 characters','error'); return; }
  if (newPw !== cfmPw) { addToast('New passwords do not match','error'); return; }
  u.pw = newPw;
  saveUsers(users);
  addToast('Password changed successfully','success');
  document.getElementById('prof_curpw').value = '';
  document.getElementById('prof_newpw').value = '';
  document.getElementById('prof_cfmpw').value = '';
}

