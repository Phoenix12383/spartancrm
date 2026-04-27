// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 02-mock-data.js
// Extracted from original index.html lines 522-805
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL MOCK DATA — seed inbox/sent/drafts
// ══════════════════════════════════════════════════════════════════════════════
const EMAIL_TEMPLATES = [
  {
    id:'et1', name:'Quote Follow-Up', category:'Sales',
    subject:'Following up on your quote — {{dealTitle|fullName}}',
    body:`Hi {{firstName}},

I wanted to follow up on the quote we sent through for your {{dealTitle|suburb|address}} project.

We understand it's a big decision, and we'd love the opportunity to answer any questions you might have about our uPVC double glazing solutions.

Our installation team is available for {{suburb}} in the coming weeks, and we can often accommodate flexible scheduling.

Would you have 10 minutes for a quick call this week?

Kind regards,
{{ownerName}}
Spartan Double Glazing
1300 912 161`,
    tags:['follow-up','quote'], opens:14, clicks:6, sent:23,
  },
  {
    id:'et2', name:'Measure Confirmation', category:'Scheduling',
    subject:'Your measure appointment is confirmed — {{appointmentDate}}',
    body:`Hi {{firstName}},

Great news — your measure appointment is confirmed for {{appointmentDate}} at {{appointmentTime}}.

Our team will arrive at {{address|suburb}}. Please ensure clear access to all windows and doors to be measured.

What to expect:
• The measure takes approximately 45–60 minutes
• We'll discuss frame options, glass types, and colour choices
• You'll receive your detailed quote within 48 hours

If you need to reschedule, please call us on 1300 912 161 or reply to this email.

See you soon!

{{ownerName}}
Spartan Double Glazing`,
    tags:['appointment','measure'], opens:31, clicks:12, sent:48,
  },
  {
    id:'et3', name:'Installation Reminder', category:'Scheduling',
    subject:'Installation reminder — {{appointmentDate}} at {{address|suburb}}',
    body:`Hi {{firstName}},

This is a friendly reminder that your Spartan Double Glazing installation is scheduled for:

📅 Date: {{appointmentDate}}
⏰ Time: {{appointmentTime}}
📍 Address: {{address|suburb}}

Please ensure:
✓ Clear access to all installation areas from 7:00am
✓ Any fragile items near windows are moved
✓ Pets are secured during installation

Our team will contact you 30 minutes before arrival.

Questions? Call 1300 912 161.

{{ownerName}}
Spartan Double Glazing`,
    tags:['installation','reminder'], opens:28, clicks:8, sent:35,
  },
  {
    id:'et4', name:'Thank You — Installation Complete', category:'Post-Sale',
    subject:'Thank you for choosing Spartan Double Glazing ⭐',
    body:`Hi {{firstName}},

We hope you're already enjoying the difference your new double glazing makes!

Your installation is now complete. Here's a quick summary:
• All windows and doors have been installed and tested
• Warranty documentation is attached to this email
• Our 10-year product warranty is now active

We'd love to hear your feedback. If you have a moment, please leave us a Google review — it means the world to our team.

If you experience any issues in the first 30 days, please contact us immediately at support@spartandg.com.au

Thank you for choosing Spartan Double Glazing!

{{ownerName}}
Spartan Double Glazing
1300 912 161`,
    tags:['post-sale','thank-you'], opens:19, clicks:14, sent:29,
  },
  {
    id:'et5', name:'Overdue Invoice Reminder', category:'Finance',
    subject:'Invoice reminder — payment due {{invoiceDueDate}}',
    body:`Hi {{firstName}},

This is a friendly reminder that invoice #{{invoiceNumber}} for {{invoiceAmount}} is due on {{invoiceDueDate}}.

Payment details:
BSB: 033-001
Account: 123456789
Reference: {{invoiceNumber}}

If you've already made payment, please disregard this email.

If you have any queries, don't hesitate to contact our accounts team at accounts@spartandg.com.au

Thank you,
Spartan Double Glazing Accounts`,
    tags:['finance','invoice'], opens:8, clicks:3, sent:12,
  },
  {
    id:'et6', name:'Referral Request', category:'Marketing',
    subject:'Know someone who could benefit from double glazing?',
    body:`Hi {{firstName}},

We hope you're loving your new double glazing from Spartan!

If you know anyone — friends, family, or neighbours — who might benefit from our uPVC double glazing solutions, we'd love it if you could refer them to us.

For every successful referral, we'll send you a $200 gift card as a thank you.

Simply have them mention your name when they contact us, or reply to this email with their details and we'll take care of the rest.

Thanks again for being a valued Spartan customer!

{{ownerName}}
Spartan Double Glazing`,
    tags:['referral','marketing'], opens:11, clicks:7, sent:18,
  },
  {
    id:'et7', name:'Check Measure Booking Confirmation', category:'Jobs',
    subject:'Your check measure is confirmed — {{appointmentDate}}',
    body:`Hi {{firstName}},

Great news — your on-site check measure has been booked for {{appointmentDate}} at {{appointmentTime}}.

Our installer will visit {{address|suburb}} to take precise measurements of all windows and doors included in your order.

What to expect:
• The measure takes approximately 60–90 minutes
• Please ensure clear access to all windows and doors
• Our installer will discuss any site-specific considerations

If you need to reschedule, please call us on 1300 912 161 or reply to this email.

Kind regards,
{{ownerName}}
Spartan Double Glazing
1300 912 161`,
    tags:['jobs','check-measure'], opens:0, clicks:0, sent:0,
  },
  {
    id:'et8', name:'Progress Invoice 45%', category:'Jobs',
    subject:'45% Progress Claim — {{jobNumber}} — Check Measure Complete',
    body:`Hi {{firstName}},

Thank you — the on-site check measure for your project ({{jobNumber}} — {{dealTitle|fullName}}) has been completed successfully.

As per your agreement, please find attached your 45% progress claim invoice for {{invoiceAmount}} (inc. GST), due by {{invoiceDueDate}}.

Payment can be made via direct deposit:
Bank: Spartan Double Glazing Pty Ltd
BSB: 063-000
Account: 1234 5678
Reference: {{jobNumber}}

Once payment is received, we'll proceed to the Final Design Sign-Off stage where you'll confirm all specifications before we place your order.

If you have any questions, please don't hesitate to get in touch.

Kind regards,
{{ownerName}}
Spartan Double Glazing
1300 912 161`,
    tags:['jobs','invoice','progress-claim'], opens:0, clicks:0, sent:0,
  },
  {
    id:'et9', name:'Installation Confirmation', category:'Jobs',
    subject:'Installation confirmed — {{appointmentDate}} at {{address|suburb}}',
    body:`Hi {{firstName}},

We're pleased to confirm your installation date:

Date: {{appointmentDate}}
Time: {{appointmentTime}}
Address: {{address|suburb}}
Job Reference: {{jobNumber}}

Our installation team will arrive with all materials ready to go. Please ensure:
• Clear access to all window and door openings
• Furniture moved away from work areas where possible
• Someone over 18 is available on site for the duration

The installation typically takes one full day, depending on the scope of work.

If you need to make any changes, please contact us as soon as possible on 1300 912 161.

We look forward to transforming your home!

Kind regards,
{{ownerName}}
Spartan Double Glazing
1300 912 161`,
    tags:['jobs','installation'], opens:0, clicks:0, sent:0,
  },
];

const EMAIL_SENT_SEED = [];

const EMAIL_INBOX_SEED = [];


// ── FIX 3: CUSTOM FIELDS SEED DATA ───────────────────────────────────────────
const DEFAULT_DEAL_FIELDS=[
  {id:'df1',label:'Property Type',type:'dropdown',options:['House','Unit','Townhouse','Commercial','New Build'],required:false,ord:1},
  {id:'df2',label:'Lead Source Detail',type:'text',options:[],required:false,ord:2},
  {id:'df3',label:'Quote Number',type:'text',options:[],required:false,ord:3},
  {id:'df4',label:'Survey Date',type:'date',options:[],required:false,ord:4},
  {id:'df5',label:'Deposit Paid',type:'checkbox',options:[],required:false,ord:5},
  {id:'df6',label:'Deposit Amount',type:'monetary',options:[],required:false,ord:6},
  {id:'df7',label:'Special Conditions',type:'textarea',options:[],required:false,ord:7},
];

const DEFAULT_LEAD_FIELDS=[
  {id:'lf1',label:'Property Type',type:'dropdown',options:['House','Unit','Townhouse','Commercial','New Build'],required:false,ord:1},
  {id:'lf2',label:'Timeframe',type:'dropdown',options:['ASAP','1-3 months','3-6 months','6-12 months','Just researching'],required:false,ord:2},
  {id:'lf3',label:'Number of Windows',type:'number',options:[],required:false,ord:3},
  {id:'lf4',label:'Number of Doors',type:'number',options:[],required:false,ord:4},
  {id:'lf5',label:'How Did You Hear About Us?',type:'dropdown',options:['Google','Facebook','Instagram','Referral','Signage','Other'],required:false,ord:5},
];
const DEFAULT_CONTACT_FIELDS=[
  {id:'ctf1',label:'Company',type:'text',options:[],required:false,ord:1},
  {id:'ctf2',label:'Job Title',type:'text',options:[],required:false,ord:2},
  {id:'ctf3',label:'Address',type:'text',options:[],required:false,ord:3},
  {id:'ctf4',label:'Postcode',type:'text',options:[],required:false,ord:4},
  {id:'ctf5',label:'Preferred Contact Method',type:'dropdown',options:['Phone','Email','SMS','Any'],required:false,ord:5},
  {id:'ctf6',label:'Do Not Contact',type:'checkbox',options:[],required:false,ord:6},
];
const DEFAULT_JOB_FIELDS=[
  {id:'jf1',label:'Frame Colour',type:'dropdown',options:['White','Black','Monument','Paperbark','Surfmist','Jasper','Ironstone','Basalt','Woodland Grey','Manor Red','Custom'],required:false,ord:1},
  {id:'jf2',label:'Internal Colour',type:'dropdown',options:['White','Timber Look','Match External','Custom'],required:false,ord:2},
  {id:'jf3',label:'Glass Type',type:'dropdown',options:['Clear','Low-E','Tinted','Obscure','Laminate','Double Glazed','Triple Glazed'],required:false,ord:3},
  {id:'jf4',label:'Number of Windows',type:'number',options:[],required:false,ord:4},
  {id:'jf5',label:'Number of Doors',type:'number',options:[],required:false,ord:5},
  {id:'jf6',label:'Property Type',type:'dropdown',options:['House','Unit','Townhouse','Commercial','New Build','Heritage'],required:false,ord:6},
  {id:'jf7',label:'Storey Level',type:'dropdown',options:['Single Storey','Double Storey','Multi-Storey','Ground Floor Only','Upper Only'],required:false,ord:7},
  {id:'jf8',label:'Scaffolding Required',type:'checkbox',options:[],required:false,ord:8},
  {id:'jf9',label:'Special Instructions',type:'textarea',options:[],required:false,ord:9},
];

const CF_TYPE_LABELS={text:'Text',textarea:'Long Text',number:'Number',monetary:'Currency',date:'Date',checkbox:'Checkbox',dropdown:'Dropdown',multiselect:'Multi-Select',phone:'Phone',email:'Email',url:'URL'};

// ── FIX 4: CUSTOM STATUS SEED DATA ───────────────────────────────────────────
const DEFAULT_DEAL_STATUSES=[
  {id:'ds1', label:'New Enquiry',          col:'#3b82f6', isWon:false,isLost:false,isDefault:true},
  {id:'ds2', label:'Follow Up Required',   col:'#f97316', isWon:false,isLost:false},
  {id:'ds3', label:'Quote Sent',           col:'#eab308', isWon:false,isLost:false},
  {id:'ds4', label:'Quote Follow Up',      col:'#f59e0b', isWon:false,isLost:false},
  {id:'ds5', label:'Deposit Paid',         col:'#22c55e', isWon:false,isLost:false},
  {id:'ds6', label:'Scheduled',            col:'#14b8a6', isWon:false,isLost:false},
  {id:'ds7', label:'In Production',        col:'#a855f7', isWon:false,isLost:false},
  {id:'ds8', label:'Ready to Install',     col:'#6366f1', isWon:false,isLost:false},
  {id:'ds9', label:'Completed',            col:'#15803d', isWon:true, isLost:false},
  {id:'ds10',label:'Invoiced',             col:'#06b6d4', isWon:false,isLost:false},
  {id:'ds11',label:'Paid',                 col:'#16a34a', isWon:true, isLost:false},
  {id:'ds12',label:'Not Proceeding',       col:'#ef4444', isWon:false,isLost:true},
  {id:'ds13',label:'On Hold',              col:'#9ca3af', isWon:false,isLost:false},
];
const DEFAULT_LEAD_STATUSES=[
  {id:'ls1',label:'New',        col:'#3b82f6',isDefault:true},
  {id:'ls2',label:'Contacted',  col:'#f59e0b'},
  {id:'ls3',label:'Qualified',  col:'#22c55e'},
  {id:'ls4',label:'Unqualified',col:'#9ca3af'},
  {id:'ls5',label:'Archived',   col:'#6b7280'},
];
const DEFAULT_CONTACT_STATUSES=[
  {id:'cs1',label:'Active',    col:'#22c55e',isDefault:true},
  {id:'cs2',label:'Inactive',  col:'#9ca3af'},
  {id:'cs3',label:'Prospect',  col:'#3b82f6'},
  {id:'cs4',label:'VIP',       col:'#a855f7'},
];

// ── Activity types ──────────────────────────────────────────────────────────
// Single source of truth for activity kinds. Consumed by:
//   • 08-sales-crm.js — picker arrays (schedule modal, activity-tab form)
//   • 09-reports.js   — "Activities by type/owner/month/week" report branches
//   • 03-jobs-workflow.js — check-measure completion writes type:'checkMeasure'
//
// Fields:
//   id        — stored on activity records; NEVER rename (breaking for old rows)
//   label     — user-facing display name
//   icon      — emoji for pickers
//   category  — groups types for split reports: sales | operations | admin
//   col       — used for chart bars/segments and timeline badges
//   inPicker  — show in the user-facing type selector
//   system    — emitted by code only; excluded from activity reports
const ACTIVITY_TYPES = [
  {id:'call',         label:'Call',          icon:'\ud83d\udcde', category:'sales',      col:'#3b82f6', inPicker:true},
  {id:'email',        label:'Email',         icon:'\u2709\ufe0f', category:'sales',      col:'#7c3aed', inPicker:true},
  {id:'meeting',      label:'Meeting',       icon:'\ud83d\udcc5', category:'sales',      col:'#0ea5e9', inPicker:true},
  {id:'measure',      label:'Measure',       icon:'\ud83d\udccf', category:'operations', col:'#f59e0b', inPicker:true},
  {id:'checkMeasure', label:'Check Measure', icon:'\u2705',       category:'operations', col:'#c41230', inPicker:true},
  {id:'quote',        label:'Quote',         icon:'\ud83d\udcb0', category:'sales',      col:'#059669', inPicker:true},
  {id:'install',      label:'Install',       icon:'\ud83d\udd27', category:'operations', col:'#dc2626', inPicker:true},
  {id:'task',         label:'Task',          icon:'\u2611\ufe0f', category:'admin',      col:'#6b7280', inPicker:true},
  {id:'followUp',     label:'Follow-up',     icon:'\ud83d\udd01', category:'sales',      col:'#f97316', inPicker:true},
  // Retained for backwards compatibility with rows already stored as 'deadline'.
  {id:'deadline',     label:'Deadline',      icon:'\u23f0',       category:'admin',      col:'#eab308', inPicker:true},
  // System types — hidden from picker, excluded from activity reports.
  {id:'note',         label:'Note',          icon:'\ud83d\udcdd', category:'admin',      col:'#9ca3af', inPicker:false, system:true},
  {id:'edit',         label:'Edit',          icon:'\u270f\ufe0f', category:'admin',      col:'#9ca3af', inPicker:false, system:true},
  {id:'stage',        label:'Stage change',  icon:'\ud83d\udd04', category:'admin',      col:'#9ca3af', inPicker:false, system:true},
  {id:'created',      label:'Created',       icon:'\u2728',       category:'admin',      col:'#9ca3af', inPicker:false, system:true},
];

function getPickableActivityTypes() {
  return ACTIVITY_TYPES.filter(function(t){ return t.inPicker; });
}
function getActivityType(id) {
  return ACTIVITY_TYPES.find(function(t){ return t.id === id; }) || null;
}
function isSystemActivityType(id) {
  var t = getActivityType(id);
  return !!(t && t.system);
}

