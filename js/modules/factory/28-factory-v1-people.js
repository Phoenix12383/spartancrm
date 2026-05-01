// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/28-factory-v1-people.js
// Factory CRM Base Class Diagram v1.5 §2 — People — internal staff only
//
// Three categories of people *interact* with Factory CRM, but only one is
// *managed* here: the internal staff who log in and operate the system.
// Customers are referenced as thin CustomerRef records; their full management
// is in Jobs CRM. External contacts (tradies, crane operators, hire equipment)
// are entirely out of Factory CRM scope (Jobs CRM install workflow).
//
// Phase 1 SCOPE:
//   - Permission enum is FACTORY-ONLY (no CREATE_QUOTE, no EDIT_CUSTOMER_RECORD,
//     no OVERRIDE_HARD_BLOCK — those are other modules).
//   - Role is a lightweight {name, permissions, validity} shape; the manual's
//     7-role enum (Phoenix, Director, PM, Station/QC/Dispatch/Receiving Operator)
//     is deferred to Phase 2 along with StateScope (VIC/ACT/SA/TAS).
//   - User.terminatedAt + UserStatus.TERMINATED are present, but per walkthrough
//     §8.3 some staff cannot be terminated — termination is one possible
//     response, not the only one. Audit (§6) and integrity watchers handle
//     the rest.
//   - CustomerRef carries only what Factory CRM needs: id, displayName, state,
//     deliveryAddress. Anything beyond lives in Jobs CRM.
//
// Globals exposed (additive, collision-checked):
//   FactoryUserStatus (enum)
//   FactoryPermission (enum)
//   FactoryUser (class)
//   FactoryRole (class)
//   FactorySession (class)
//   FactoryCustomerRef (class)
//   FactoryAddress (class)
//   FactoryDateRange (class)
//
// `Factory*` prefix because User/Role/Session are very generic and the broader
// CRM already uses lowercase `users`/`getCurrentUser()` shapes — these v1.5
// classes are factory-scoped data models, not a replacement for existing auth.
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

var FactoryUserStatus = Object.freeze({
  ACTIVE:     'ACTIVE',
  INACTIVE:   'INACTIVE',
  ON_LEAVE:   'ON_LEAVE',
  TERMINATED: 'TERMINATED',
});

// Factory-only permission set (scope-corrected from v1).
var FactoryPermission = Object.freeze({
  OPERATE_STATION:      'OPERATE_STATION',
  REVIEW_AND_SEND_JOBS: 'REVIEW_AND_SEND_JOBS',
  SIGN_OFF_QC:          'SIGN_OFF_QC',
  MANAGE_DISPATCH:      'MANAGE_DISPATCH',
  APPROVE_PROCUREMENT:  'APPROVE_PROCUREMENT',
  ADJUST_STOCK:         'ADJUST_STOCK',
  OVERRIDE_STATUS:      'OVERRIDE_STATUS',     // manual §13: operator records wrong status
  VIEW_AUDIT_LOG:       'VIEW_AUDIT_LOG',
  CONFIGURE_SETTINGS:   'CONFIGURE_SETTINGS',
  ASSIGN_TASK:          'ASSIGN_TASK',
});

// ── Value objects ────────────────────────────────────────────────────────────

class FactoryDateRange {
  constructor(opts) {
    opts = opts || {};
    this.from = opts.from || null;   // ISO date string or null = open
    this.to   = opts.to   || null;   // ISO date string or null = open
  }
  contains(when) {
    var t = (when instanceof Date) ? when.toISOString() : (when || new Date().toISOString());
    if (this.from && t < this.from) return false;
    if (this.to   && t > this.to)   return false;
    return true;
  }
}

// Address is reduced to a flat value object (vs v1's separate entity with
// AddressUse enum). Factory CRM only needs the delivery address per customer;
// multi-address fan-out is Jobs CRM's concern.
class FactoryAddress {
  constructor(opts) {
    opts = opts || {};
    this.line1    = opts.line1 || '';
    this.line2    = opts.line2 || '';
    this.suburb   = opts.suburb || '';
    this.state    = opts.state || '';
    this.postcode = opts.postcode || '';
  }
  toString() {
    return [this.line1, this.line2, this.suburb, this.state, this.postcode]
      .filter(Boolean).join(', ');
  }
}

// ── Role & Permission ────────────────────────────────────────────────────────

class FactoryRole {
  constructor(opts) {
    opts = opts || {};
    this.name        = opts.name || 'unnamed_role';
    this.permissions = new Set(Array.isArray(opts.permissions) ? opts.permissions : []);
    this.validity    = opts.validity instanceof FactoryDateRange
      ? opts.validity
      : new FactoryDateRange(opts.validity || {});
  }
  has(permission) { return this.permissions.has(permission); }
  isValidAt(when) { return this.validity.contains(when); }
}

// ── User & Session ───────────────────────────────────────────────────────────

class FactoryUser {
  constructor(opts) {
    opts = opts || {};
    this.userId       = opts.userId      || ('fu_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.displayName  = opts.displayName || '';
    this.pin          = opts.pin || null;                       // 4-6 digit PIN, never logged
    this.status       = opts.status || FactoryUserStatus.ACTIVE;
    this.hiredAt      = opts.hiredAt || new Date().toISOString();
    this.terminatedAt = opts.terminatedAt || null;
    this.roles        = Array.isArray(opts.roles) ? opts.roles.slice() : [];
  }

  // Validates a PIN attempt; returns a FactorySession on success, null on fail.
  // Doesn't log the PIN — only the success/fail outcome (audit infrastructure
  // in §6 captures the auth event).
  login(pin, opts) {
    opts = opts || {};
    if (this.status !== FactoryUserStatus.ACTIVE) return null;
    if (!this.pin || pin !== this.pin) return null;
    return new FactorySession({
      user: this,
      workstation: opts.workstation || null,
      deviceId: opts.deviceId || null,
    });
  }

  // Permission check via roles (validity-aware).
  hasPermission(permission, when) {
    var now = when || new Date().toISOString();
    return this.roles.some(function(r){
      return (r instanceof FactoryRole) && r.isValidAt(now) && r.has(permission);
    });
  }
}

class FactorySession {
  constructor(opts) {
    opts = opts || {};
    this.user        = opts.user || null;
    this.workstation = opts.workstation || null;
    this.startedAt   = opts.startedAt || new Date().toISOString();
    this.endedAt     = opts.endedAt   || null;
    this.deviceId    = opts.deviceId  || null;
  }
  end() {
    this.endedAt = new Date().toISOString();
    return this.endedAt;
  }
  isActive() { return !this.endedAt; }
}

// ── CustomerRef (thin reference, not the full Customer model) ───────────────

class FactoryCustomerRef {
  constructor(opts) {
    opts = opts || {};
    this.customerId      = opts.customerId  || null;
    this.displayName     = opts.displayName || '';
    this.state           = opts.state       || '';      // VIC | ACT | SA | TAS
    this.deliveryAddress = opts.deliveryAddress instanceof FactoryAddress
      ? opts.deliveryAddress
      : new FactoryAddress(opts.deliveryAddress || {});
  }
  // Production board label: "Smith — VIC1234O"
  productionLabel(klaesJobNumber) {
    var pieces = [this.displayName, klaesJobNumber || ''].filter(Boolean);
    return pieces.join(' — ');
  }
}
