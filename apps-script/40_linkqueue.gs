/* ===== module: linkqueue (generated; edit the source modules, not this wrapper) ===== */
const LinkQueue = (function () {
/**
 * LINK QUEUE (web app) - the messaging side of the tool.
 * Runs in Account A only. Reads the Leads tab of the master Sheet and shows
 * one ready-to-send WhatsApp message at a time. You press send yourself.
 *
 * Lead sourcing lives in Engine.gs and feeds this same Leads tab.
 */
 
const GAPS = [3, 4, 5]; // days to wait after touch 1, 2, 3
const LH = ['id','business','owner','trade','city','phone_raw','phone','notes','status','touch','last_sent','next_touch','created','account_id','claimed_by','claimed_at'];
const pad = r => r.concat(Array(LH.length - r.length).fill(''));
const ACC_HEAD = ['id','label','phone','rep_email','daily_cap','start_date','status'];
const CLAIM_MIN = 30; // minutes a lead stays reserved for the rep who was shown it
const SENDS_HEAD = ['time','lead_id','touch','variant','message','edited','replied','booked','account','rep'];
const ss = () => master();
 
 
function syncHead(s, head) {
  head.forEach((h, i) => { if (s.getRange(1, i + 1).getValue() !== h) s.getRange(1, i + 1).setValue(h); });
}

/** Run once from the editor (setupAll does it): makes the person running it the first admin. */
function seedTeam() {
  const t = sh('Team');
  if (t.getLastRow() < 2) t.appendRow([Session.getEffectiveUser().getEmail().toLowerCase(), 'Admin', 'admin']);
}

function who() {
  const email = String(OS.email() || '').toLowerCase();
  const t = rows('Team').find(r => String(r.email).trim().toLowerCase() === email);
  if (OS.role() === 'owner' && email) return { email, name: String((t && t.name) || email), admin: true };
  if (!email || !t) throw new Error('Your account (' + (email || 'unknown') + ') is not on the Team tab. Ask the admin to add it.');
  return { email, name: String(t.name || email), admin: String(t.role).toLowerCase() === 'admin' };
}
function needAdmin() { const u = who(); if (!u.admin) throw new Error('Admin only.'); return u; }

function accountsFor(u) {
  return rows('Accounts').filter(a => a.id && a.status === 'active' &&
    (!String(a.rep_email).trim() || String(a.rep_email).toLowerCase().split(/[\s,;]+/).indexOf(u.email) >= 0));
}

/** Warm-up ramp: 15/day in week 1, 25/day in week 2, then the account's own cap. */
function capFor(a) {
  const full = Number(a.daily_cap) || 30;
  if (!a.start_date) return full;
  const days = Math.floor((Date.now() - new Date(a.start_date).getTime()) / 864e5);
  return Math.min(full, days < 7 ? 15 : days < 14 ? 25 : full);
}

function sh(name, head, textCols) {
  let s = ss().getSheetByName(name);
  if (!s) {
    s = ss().insertSheet(name);
    if (head) s.appendRow(head);
    if (textCols) s.getRange(textCols).setNumberFormat('@'); // keeps phone numbers as text
  }
  return s;
}
 
function setup() {
  const leadsSh = sh('Leads', LH, 'F:G');
  syncHead(leadsSh, LH);
  syncHead(sh('Sends', SENDS_HEAD), SENDS_HEAD);
  const acc = sh('Accounts', ACC_HEAD, 'C:C');
  if (acc.getLastRow() < 2) [1, 2, 3].forEach(n => acc.appendRow(['WA-' + n, 'WhatsApp ' + n, '', '', 35, new Date(), 'active']));
  sh('Team', ['email','name','role']);
  sh('Suppression', ['phone','reason','date'], 'A:A');
  const t = sh('Templates', ['touch','variant','body']);
  if (t.getLastRow() < 2) {
    [[1,'A',"Hi {owner}, it's {me}. I help {trade} businesses in {city} stop losing jobs to missed calls and no-shows. Would it be useful if I showed you how in 5 minutes? Reply STOP and I won't message again."],
     [1,'B',"Hi {owner}, {me} here. When you're on a job and a call comes in for {business}, what happens to it? I built something that catches those. Happy to show you. Reply STOP and I won't message again."],
     [2,'A',"Hi {owner}, following up on my message. Still keen to show you how {business} can stop missing leads. Worth a quick chat?"],
     [3,'A',"Hi {owner}, I can send a 2-minute video of how it works for {trade} businesses. Want it?"],
     [4,'A',"Hi {owner}, last message from me. If missed calls or no-shows ever cost {business} jobs, message me anytime."]
    ].forEach(r => t.appendRow(r));
  }
  const s = sh('Settings', ['key','value']);
  if (s.getLastRow() < 2) { s.appendRow(['cap', 15]); s.appendRow(['me', '']); }
}
 
/** South African mobile numbers only (06x, 07x, 08x). Returns 27XXXXXXXXX or ''. */
function norm(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '27' + d.slice(1);
  if (d.length === 9) d = '27' + d;
  return /^27[678]\d{8}$/.test(d) ? d : '';
}
 
function rows(name) {
  const v = sh(name).getDataRange().getValues(), h = v.shift();
  return v.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
 
function getState() {
  return withLock(() => {
    setup();
    const u = who(), tz = Session.getScriptTimeZone(), now = new Date();
    const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const sup = new Set(rows('Suppression').map(r => String(r.phone)));
    const allLeads = rows('Leads'), rowOf = {};
    allLeads.forEach((l, i) => rowOf[l.id] = i + 2);
    const leads = allLeads.filter(l => l.phone && !sup.has(String(l.phone)));
    const used = {};
    rows('Sends').forEach(r => { if (r.time && Utilities.formatDate(new Date(r.time), tz, 'yyyy-MM-dd') === today) used[r.account] = (used[r.account] || 0) + 1; });
    const mine = accountsFor(u).map(a => ({ id: a.id, label: a.label || a.id, phone: String(a.phone || ''), cap: capFor(a), used: used[a.id] || 0 }));
    const left = {}; mine.forEach(a => left[a.id] = Math.max(a.cap - a.used, 0) + (a.cap > a.used ? 2 : 0)); // +2 spares for skips
    const stale = now.getTime() - CLAIM_MIN * 60000;
    const free = l => !l.claimed_by || l.claimed_by === u.email || !l.claimed_at || new Date(l.claimed_at).getTime() < stale;
    const due = leads.filter(l => l.status === 'active' && l.next_touch && new Date(l.next_touch) <= now && left[l.account_id] > 0 && free(l))
                     .sort((a, b) => new Date(a.next_touch) - new Date(b.next_touch));
    const fresh = leads.filter(l => l.status === 'new' && free(l));
    const queue = [], leadsSh = sh('Leads');
    const take = (l, acc) => {
      left[acc]--; queue.push(Object.assign({}, l, { account_id: acc }));
      leadsSh.getRange(rowOf[l.id], 14, 1, 3).setValues([[acc, u.email, now]]);
    };
    due.forEach(l => { if (left[l.account_id] > 0) take(l, l.account_id); });
    fresh.forEach(l => {
      const best = mine.filter(a => left[a.id] > 0).sort((x, y) => left[y.id] - left[x.id])[0]; // most room first spreads load
      if (best) take(l, l.account_id && left[l.account_id] > 0 ? l.account_id : best.id);
    });
    const settings = Object.fromEntries(rows('Settings').map(r => [r.key, r.value]));
    const totalCap = mine.reduce((a, x) => a + x.cap, 0), totalUsed = mine.reduce((a, x) => a + x.used, 0);
    const pick = l => ({ id: l.id, business: l.business, owner: l.owner, trade: l.trade, city: l.city, phone: String(l.phone), notes: l.notes, touch: Number(l.touch) || 0, account_id: l.account_id });
    const stats = allLeads.reduce((a, l) => (a[l.status] = (a[l.status] || 0) + 1, a), {});
    return { queue: queue.map(pick), dueCount: due.length, freshCount: fresh.length, accounts: mine, user: { name: u.name, admin: u.admin },
             templates: rows('Templates').map(t => ({ touch: Number(t.touch), variant: t.variant, body: t.body })),
             settings: Object.assign({}, settings, { cap: totalCap, me: u.name }), sentToday: totalUsed, stats };
  });
}

/** Admin view: every account's usage today and reply rate over 7 days (low replies = ban risk). */
function getAccountsOverview() {
  needAdmin();
  const tz = Session.getScriptTimeZone(), fmt = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd'), today = fmt(new Date()), week = Date.now() - 7 * 864e5;
  const sends = rows('Sends');
  return rows('Accounts').filter(a => a.id).map(a => {
    const m = sends.filter(s => s.account === a.id && s.time), w = m.filter(s => new Date(s.time).getTime() >= week);
    return { label: a.label || a.id, phone: String(a.phone || ''), status: a.status, rep: String(a.rep_email || 'whole team'), cap: capFor(a),
             used: m.filter(s => fmt(new Date(s.time)) === today).length, sent7: w.length, replies7: w.filter(s => s.replied === 'yes').length };
  });
}

function withLock(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
 
function findRow(s, id) {
  if (s.getLastRow() < 2) return 0;
  const ids = s.getRange(2, 1, s.getLastRow() - 1, 1).getValues().flat();
  const i = ids.indexOf(id);
  return i < 0 ? 0 : i + 2;
}
 
function markSent(id, variant, message, edited) {
  return withLock(() => {
    const s = sh('Leads'), r = findRow(s, id); if (!r) return false;
    const u = who(), now = new Date(), touch = (Number(s.getRange(r, 10).getValue()) || 0) + 1, account = s.getRange(r, 14).getValue();
    const done = touch > GAPS.length;
    s.getRange(r, 9, 1, 4).setValues([[done ? 'exhausted' : 'active', touch, now, done ? '' : new Date(now.getTime() + GAPS[touch - 1] * 864e5)]]);
    s.getRange(r, 15, 1, 2).setValues([['', '']]); // release the reservation
    sh('Sends').appendRow([now, id, touch, variant, message, edited ? 'yes' : 'no', '', '', account, u.email]);
    return true;
  });
}
 
function setStatus(id, status) {
  return withLock(() => {
    who();
    const s = sh('Leads'), r = findRow(s, id); if (!r) return false;
    s.getRange(r, 9).setValue(status);
    if (status === 'bad_number' || status === 'dnc') sh('Suppression').appendRow([String(s.getRange(r, 7).getValue()), status, new Date()]);
    return true;
  });
}
 
function importLeads(list) {
  return withLock(() => {
    needAdmin();
    const s = sh('Leads');
    const have = new Set(rows('Leads').map(l => String(l.phone)).concat(rows('Suppression').map(r => String(r.phone))));
    const out = []; let dup = 0, bad = 0;
    list.forEach(x => {
      const p = norm(x.phone);
      if (!p) { bad++; return; }
      if (have.has(p)) { dup++; return; }
      have.add(p);
      out.push(pad([Utilities.getUuid().slice(0, 8), x.business || '', x.owner || '', x.trade || '', x.city || '', x.phone, p, x.notes || '', 'new', 0, '', '', new Date()]));
    });
    if (out.length) {
      const start = s.getLastRow() + 1;
      s.getRange(start, 6, out.length, 2).setNumberFormat('@');
      s.getRange(start, 1, out.length, LH.length).setValues(out);
    }
    return { added: out.length, dup, bad };
  });
}
 
function saveTemplates(list) {
  needAdmin();
  const t = sh('Templates'); t.clearContents(); t.appendRow(['touch','variant','body']);
  list.forEach(x => t.appendRow([x.touch, x.variant, x.body]));
  return true;
}
 
function saveSettings(o) {
  needAdmin();
  const s = sh('Settings'); s.clearContents(); s.appendRow(['key','value']);
  ['mode', 'offset'].forEach(k => { if (o[k] !== undefined) s.appendRow([k, o[k]]); }); // cap and name now come from the Accounts and Team tabs
  return true;
}
 
function getResults() {
  needAdmin();
  const m = {};
  rows('Sends').forEach(r => {
    const k = r.touch + '|' + r.variant;
    m[k] = m[k] || { touch: Number(r.touch), variant: String(r.variant), sent: 0, replies: 0, booked: 0 };
    m[k].sent++;
    if (r.replied === 'yes') m[k].replies++;
    if (r.booked === 'yes') m[k].booked++;
  });
  return Object.values(m).sort((a, b) => a.touch - b.touch || a.variant.localeCompare(b.variant));
}
 
/** Most recent contacted leads that are still open, for logging replies, bookings and STOP requests. */
function getRecent() {
  const u = who(), L = {}; rows('Leads').forEach(l => L[l.id] = l);
  const closed = ['dnc','bad_number','booked','not_interested'];
  const seen = new Set(), out = [];
  rows('Sends').reverse().forEach(r => {
    const l = L[r.lead_id];
    if (!l || seen.has(r.lead_id) || (!u.admin && r.rep !== u.email)) return; seen.add(r.lead_id);
    if (closed.indexOf(l.status) < 0 && out.length < 30) out.push({ id: r.lead_id, business: l.business, touch: r.touch, variant: String(r.variant), replied: l.status === 'replied' });
  });
  return out;
}
 
function lastSendRow(id) {
  const s = sh('Sends'), v = s.getDataRange().getValues();
  for (let i = v.length - 1; i > 0; i--) if (v[i][1] === id) return i + 1;
  return 0;
}
 
function markReplied(id) {
  return withLock(() => {
    who();
    const sr = lastSendRow(id); if (sr) sh('Sends').getRange(sr, 7).setValue('yes');
    const l = sh('Leads'), r = findRow(l, id);
    if (r && ['active', 'exhausted', 'new'].indexOf(l.getRange(r, 9).getValue()) >= 0) l.getRange(r, 9).setValue('replied');
    return true;
  });
}
 
function markBooked(id) {
  return withLock(() => {
    who();
    const sr = lastSendRow(id);
    if (sr) { sh('Sends').getRange(sr, 7).setValue('yes'); sh('Sends').getRange(sr, 8).setValue('yes'); }
    const l = sh('Leads'), r = findRow(l, id);
    if (r) l.getRange(r, 9).setValue('booked');
    return true;
  });
}
 

/**
 * LEAD ENGINE - automatic lead sourcing that feeds the Leads tab.
 *
 * Account A (owns the master Sheet and the web app):
 *   pull + enrich + score + promote qualified leads into the queue.
 * Account B (optional second account, shares the same Sheet as Editor):
 *   pull only. Its results land in the Raw tab and Account A scores and promotes them.
 *
 * Every account has its own Places API key and hard call caps, counted in code.
 */
 
// ====================== EDIT THESE ======================
 
// [Google search word, label stored on the lead]
const TRADES = [
  ['plumber', 'plumbing'],
  ['electrician', 'electrical'],
  ['painter', 'painting'],
  ['pest control', 'pest control'],
  ['aircon installation', 'aircon'],
  ['roofing contractor', 'roofing']
];
 
const SUBURBS = {
  'Johannesburg': ['Randburg','Sandton','Fourways','Bryanston','Roodepoort','Midrand','Edenvale','Bedfordview','Boksburg','Benoni','Germiston','Alberton','Kempton Park','Northcliff','Melville','Rosebank','Linden','Florida','Krugersdorp','Lonehill','Douglasdale','Kyalami','Weltevreden Park','Honeydew','Parktown'],
  'Pretoria': ['Centurion','Brooklyn','Menlyn','Waterkloof','Hatfield','Silverton','Moreleta Park','Montana','Wonderboom','Garsfontein','Faerie Glen','Lynnwood','Erasmuskloof','Akasia','Irene','Pretoria North'],
  'Cape Town': ['Bellville','Durbanville','Claremont','Constantia','Table View','Milnerton','Sea Point','Century City','Parow','Goodwood','Kuils River','Brackenfell','Somerset West','Strand','Hout Bay','Tokai','Muizenberg','Fish Hoek','Observatory','Blouberg'],
  'Durban': ['Umhlanga','Durban North','Westville','Pinetown','Berea','Morningside','Musgrave','Umbilo','Amanzimtoti','Hillcrest','Kloof','Ballito','Chatsworth','Phoenix']
};
 
// ====================== CONSTANTS ======================
 
const TZ = 'Africa/Johannesburg';
const RAW_COLS = ['place_id','name','trade','suburb','city','phone_raw','phone_e164','rating','reviews','website','maps_url','source_account','added_at','site_checked','has_booking','has_whatsapp','score','state','hook'];
const QUERY_COLS = ['query_id','trade','suburb','city','query_text','assigned_to','status','pages_done','results','new_leads','last_run','last_error'];
 
// Only these fields are requested. Do not add more: extra fields can push a call into a pricier tier.
const FIELD_MASK = 'places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.businessStatus,nextPageToken';
 
// ====================== PER-ACCOUNT CONFIG ======================
 
/** Edit the values, run once in EACH account, then blank the API key out of the code. */
function configure() {
  const SETTINGS = {
    ACCOUNT_LABEL: 'A',            // 'A' in the first account, 'B' in the second
    API_KEY: 'PASTE_PLACES_API_KEY',
    MASTER_ID: '',                 // leave blank in A (setupAll fills it). Paste the Sheet ID in B.
    MONTHLY_CAP: '900',            // hard stop per account per month
    DAILY_CAP: '40'                // spreads usage across the month
  };
  const p = PropertiesService.getScriptProperties();
  Object.keys(SETTINGS).forEach(function (k) { if (SETTINGS[k]) p.setProperty(k, SETTINGS[k]); });
  Logger.log('Saved. Now blank out API_KEY in the code.');
}
 
function getProp(k, d) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null ? d : v;
}
/** The master Sheet. In Account A it is the Sheet the script is attached to; in B it is opened by ID. */
function master() {
  const id = getProp('MASTER_ID');
  return id ? SpreadsheetApp.openById(id) : OS.ss('linkqueue');
}
function monthKey() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }
function dayKey() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function colIndex(header) { const o = {}; header.forEach(function (h, i) { o[h] = i; }); return o; }
 
// ====================== CALL CAP (hard stop) ======================
 
function callsUsed() { return Number(getProp('calls_' + monthKey(), 0)); }
function callsToday() { return Number(getProp('calls_day_' + dayKey(), 0)); }
function canCall() {
  return callsUsed() < Number(getProp('MONTHLY_CAP', 900)) &&
         callsToday() < Number(getProp('DAILY_CAP', 40));
}
function countCall() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('calls_' + monthKey(), String(callsUsed() + 1));
  p.setProperty('calls_day_' + dayKey(), String(callsToday() + 1));
}
 
// ====================== ONE-TIME SETUP (run in Account A, from the Sheet's own script editor) ======================
 
/** STANDALONE PROJECT ONLY: paste your Sheet's ID (the long text in its URL between /d/ and /edit), run this once, then run setupAll. */
function connectSheet() {
  const SHEET_ID = '1_64oQZwHgR2FvIEljuWNhGA7IlKTieAZ0G9o3cvr8bM';
  SpreadsheetApp.openById(SHEET_ID); // throws if the ID is wrong or you lack access
  PropertiesService.getScriptProperties().setProperty('MASTER_ID', SHEET_ID);
  Logger.log('Connected. Now run setupAll.');
}
 
function setupAll() {
  const id = getProp('MASTER_ID');
  const active = id ? SpreadsheetApp.openById(id) : OS.ss('linkqueue');
  if (!active) throw new Error('No Sheet connected. Run connectSheet first (paste your Sheet ID in it), or open the Sheet and use Extensions > Apps Script.');
  PropertiesService.getScriptProperties().setProperty('MASTER_ID', active.getId());
 
  setup(); // queue tabs: Leads, Sends, Suppression, Templates, Settings, Accounts, Team
  seedTeam(); // you become the first admin
 
  const raw = sh('Raw', RAW_COLS, 'F:G');
  raw.setFrozenRows(1);
 
  if (!ss().getSheetByName('Queries')) {
    const q = ss().insertSheet('Queries');
    q.getRange(1, 1, 1, QUERY_COLS.length).setValues([QUERY_COLS]).setFontWeight('bold');
    q.setFrozenRows(1);
    const rowsOut = buildQueries();
    q.getRange(2, 1, rowsOut.length, QUERY_COLS.length).setValues(rowsOut);
  }
  if (!ss().getSheetByName('Config')) {
    const c = ss().insertSheet('Config');
    c.getRange(1, 1, 4, 2).setValues([
      ['key', 'value'],
      ['min_score', 6],
      ['max_pages', 2],
      ['note', 'min_score: lower it for more leads, raise it for fewer, better ones. max_pages: 1 page = 20 results per search.']
    ]);
    c.getRange(1, 1, 1, 2).setFontWeight('bold');
    c.setColumnWidth(2, 500);
  }
  if (!ss().getSheetByName('Usage')) {
    const u = ss().insertSheet('Usage');
    u.getRange('A:A').setNumberFormat('@');
    u.getRange(1, 1, 1, 5).setValues([['month', 'account', 'calls_used', 'cap', 'updated']]).setFontWeight('bold');
  }
  if (!ss().getSheetByName('Dashboard')) buildDashboard();
 
  const d = ss().getSheetByName('Sheet1') || ss().getSheetByName('Sheet 1');
  if (d && d.getLastRow() === 0 && ss().getSheets().length > 1) ss().deleteSheet(d);
 
  Logger.log('Setup done. MASTER_ID (paste into Account B): ' + active.getId());
}
 
function buildQueries() {
  const all = [];
  Object.keys(SUBURBS).forEach(function (city) {
    SUBURBS[city].forEach(function (sub) {
      TRADES.forEach(function (t) { all.push([t[0], t[1], sub, city]); });
    });
  });
  // Shuffle so every city and trade progresses together if a cap is hit mid-month.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
  }
  return all.map(function (a, i) {
    return [i + 1, a[1], a[2], a[3], a[0] + ' ' + a[2] + ' ' + a[3],
            i % 2 === 0 ? 'A' : 'B', 'pending', 0, 0, 0, '', ''];
  });
}
 
function buildDashboard() {
  const d = ss().insertSheet('Dashboard');
  d.getRange('A1:B11').setValues([
    ['SOURCING', ''],
    ['Candidates found (Raw)', '=COUNTA(Raw!A2:A)'],
    ['Waiting to be checked', '=COUNTIF(Raw!R:R,"new")'],
    ['Rejected by score', '=COUNTIF(Raw!R:R,"rejected")'],
    ['Promoted to the queue', '=COUNTIF(Raw!R:R,"promoted")'],
    ['Leads added this month', '=COUNTIF(Leads!M2:M,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))'],
    ['Searches still pending', '=COUNTIF(Queries!G:G,"pending")'],
    ['API calls this month (A + B)', '=SUMIFS(Usage!C:C,Usage!A:A,TEXT(TODAY(),"yyyy-mm"))'],
    ['OUTREACH', ''],
    ['Ready to message (new)', '=COUNTIF(Leads!I:I,"new")'],
    ['In follow-up sequence', '=COUNTIF(Leads!I:I,"active")']
  ]);
  d.getRange('A12:B15').setValues([
    ['Replied', '=COUNTIF(Leads!I:I,"replied")'],
    ['Booked', '=COUNTIF(Leads!I:I,"booked")'],
    ['Do not contact', '=COUNTIF(Leads!I:I,"dnc")'],
    ['Bad numbers', '=COUNTIF(Leads!I:I,"bad_number")']
  ]);
  d.getRange('A1').setFontWeight('bold');
  d.getRange('A9').setFontWeight('bold');
  d.setColumnWidth(1, 260);
}
 
// ====================== TRIGGERS (run once in EACH account) ======================
 
function installTriggers() {
  const label = getProp('ACCOUNT_LABEL', 'A');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'lq_runPull' || f === 'lq_runEnrichAndScore') ScriptApp.deleteTrigger(t);
  });
  // Staggered so the two accounts rarely write to the Raw tab at the same moment.
  ScriptApp.newTrigger('lq_runPull').timeBased().everyDays(1).atHour(label === 'A' ? 5 : 6).create();
  if (label === 'A') ScriptApp.newTrigger('lq_runEnrichAndScore').timeBased().everyHours(4).create();
}
 
// ====================== PULL (both accounts) ======================
 
function runPull() {
  const label = getProp('ACCOUNT_LABEL', 'A');
  resetMyQueriesIfNewMonth(label);
  const book = master();
  const qs = book.getSheetByName('Queries');
  const data = qs.getDataRange().getValues();
  const qi = colIndex(data[0]);
  const raw = book.getSheetByName('Raw');
  const existing = loadExisting(book);
  const maxPages = Number(getCfg('max_pages', 2));
  const start = Date.now();
  let fatal = false;
 
  for (let r = 1; r < data.length && !fatal; r++) {
    const row = data[r];
    if (row[qi.assigned_to] !== label || row[qi.status] !== 'pending') continue;
    if (!canCall() || Date.now() - start > 150000) break;
 
    let token = null, page = 0, results = 0, added = 0, err = '';
    const newRows = [];
 
    while (page < maxPages && canCall()) {
      const res = searchPlaces(row[qi.query_text], token);
      if (res.error) { err = res.error; fatal = true; break; }
      page++;
      (res.places || []).forEach(function (p) {
        results++;
        const rec = buildRaw(p, row, qi, label, existing);
        if (rec) { newRows.push(rec); added++; }
      });
      token = res.nextPageToken;
      if (!token) break;
    }
 
    if (newRows.length) {
      raw.getRange(raw.getLastRow() + 1, 1, newRows.length, RAW_COLS.length).setValues(newRows);
    }
    const status = err || page === 0 ? 'pending' : 'done';
    qs.getRange(r + 1, qi.status + 1, 1, 6).setValues([[status, page, results, added, new Date(), err]]);
  }
  logUsage(book);
}
 
function searchPlaces(q, pageToken) {
  countCall(); // count BEFORE the call so a crash can never under-count
  const body = { textQuery: q, regionCode: 'ZA', languageCode: 'en', pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;
  const resp = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Goog-Api-Key': getProp('API_KEY'), 'X-Goog-FieldMask': FIELD_MASK },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  let json = {};
  try { json = JSON.parse(resp.getContentText() || '{}'); } catch (e) {}
  if (resp.getResponseCode() !== 200) {
    return { error: resp.getResponseCode() + ': ' + ((json.error && json.error.message) || 'unknown error') };
  }
  return json;
}
 
function loadExisting(book) {
  const ids = {}, phones = {};
  const raw = book.getSheetByName('Raw'), leads = book.getSheetByName('Leads');
  let n = raw.getLastRow();
  if (n >= 2) {
    raw.getRange(2, 1, n - 1, RAW_COLS.length).getValues().forEach(function (v) {
      if (v[0]) ids[v[0]] = 1;
      if (v[6]) phones[String(v[6])] = 1;
    });
  }
  n = leads.getLastRow();
  if (n >= 2) {
    leads.getRange(2, 7, n - 1, 1).getValues().forEach(function (v) { if (v[0]) phones[String(v[0])] = 1; });
  }
  return { ids: ids, phones: phones };
}
 
function isMobile(e164) { return /^27(6\d|7\d|8[1-5])\d{7}$/.test(e164); }
 
function buildRaw(p, qrow, qi, label, existing) {
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return null;
  if (!p.id || existing.ids[p.id]) return null;
  const phone = norm(p.internationalPhoneNumber || p.nationalPhoneNumber);
  if (!phone || !isMobile(phone) || existing.phones[phone]) return null; // WhatsApp needs a mobile
  existing.ids[p.id] = 1;
  existing.phones[phone] = 1;
  const obj = {
    place_id: p.id,
    name: ((p.displayName && p.displayName.text) || '').slice(0, 80),
    trade: qrow[qi.trade], suburb: qrow[qi.suburb], city: qrow[qi.city],
    phone_raw: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
    phone_e164: phone,
    rating: p.rating || '', reviews: p.userRatingCount || 0,
    website: p.websiteUri || '', maps_url: p.googleMapsUri || '',
    source_account: label, added_at: new Date(),
    site_checked: '', has_booking: '', has_whatsapp: '', score: '', state: 'new', hook: ''
  };
  return RAW_COLS.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
}
 
// ====================== ENRICH + SCORE + PROMOTE (Account A) ======================
 
function runEnrichAndScore() {
  enrichLeads();
  scoreAndPromote();
}
 
function quickState(url) {
  if (!url) return { state: 'no_site', booking: 'no', whatsapp: 'no' };
  if (/facebook\.com|instagram\.com|linktr\.ee|wa\.me|business\.site|google\.com/i.test(url)) {
    return { state: 'social_only', booking: 'no', whatsapp: 'no' };
  }
  return null;
}
 
function analyseHtml(resp) {
  try {
    if (resp.getResponseCode() >= 400) return { state: 'unreachable', booking: 'unknown', whatsapp: 'unknown' };
    const html = resp.getContentText().toLowerCase().slice(0, 300000);
    const booking = /(book (now|online|an? appointment)|calendly|simplybook|setmore|acuity|youcanbook|appointlet|schedule (a|an|online)|\/booking)/.test(html);
    const wa = /(wa\.me|api\.whatsapp\.com|whatsapp)/.test(html);
    return { state: 'ok', booking: booking ? 'yes' : 'no', whatsapp: wa ? 'yes' : 'no' };
  } catch (e) {
    return { state: 'unreachable', booking: 'unknown', whatsapp: 'unknown' };
  }
}
 
function fetchSafe(reqs) {
  try { return UrlFetchApp.fetchAll(reqs); }
  catch (e) {
    return reqs.map(function (rq) { try { return UrlFetchApp.fetch(rq.url, rq); } catch (e2) { return null; } });
  }
}
 
function enrichLeads() {
  const raw = ss().getSheetByName('Raw');
  const n = raw.getLastRow();
  if (n < 2) return 0;
  const data = raw.getRange(2, 1, n - 1, RAW_COLS.length).getValues();
  const ix = colIndex(RAW_COLS);
  const todo = [];
  data.forEach(function (r, i) { if (r[ix.state] === 'new' && r[ix.site_checked] === '') todo.push(i); });
  const start = Date.now();
  let done = 0;
 
  for (let b = 0; b < todo.length && Date.now() - start < 120000; b += 25) {
    const reqs = [], map = [];
    todo.slice(b, b + 25).forEach(function (i) {
      const url = String(data[i][ix.website] || '').trim();
      const quick = quickState(url);
      if (quick) { setSite(data[i], ix, quick); done++; }
      else {
        reqs.push({ url: url, muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
        map.push(i);
      }
    });
    if (reqs.length) {
      const resps = fetchSafe(reqs);
      resps.forEach(function (resp, k) {
        setSite(data[map[k]], ix, resp ? analyseHtml(resp) : { state: 'unreachable', booking: 'unknown', whatsapp: 'unknown' });
        done++;
      });
    }
  }
  if (done) {
    raw.getRange(2, ix.site_checked + 1, data.length, 3).setValues(
      data.map(function (r) { return [r[ix.site_checked], r[ix.has_booking], r[ix.has_whatsapp]]; }));
  }
  return done;
}
 
function setSite(row, ix, res) { row[ix.site_checked] = res.state; row[ix.has_booking] = res.booking; row[ix.has_whatsapp] = res.whatsapp; }
 
function scoreLead(row, ix) {
  let s = 2; // every stored lead has a mobile number
  const reviews = Number(row[ix.reviews]) || 0;
  if (reviews >= 15 && reviews <= 150) s += 3;
  else if ((reviews >= 8 && reviews < 15) || (reviews > 150 && reviews <= 300)) s += 1;
  if (Number(row[ix.rating]) >= 3.8) s += 1;
  const state = row[ix.site_checked], booking = row[ix.has_booking];
  if (state === 'no_site' || state === 'social_only') s += 3;
  else if (booking === 'no') s += 3;
  else if (booking === 'unknown') s += 2;
  else if (booking === 'yes') s -= 4;
  if (row[ix.has_whatsapp] === 'yes') s -= 2;
  return s;
}
 
function hookFor(row, ix) {
  const state = row[ix.site_checked];
  if (state === 'no_site' || state === 'social_only') return "Customers can't book online, only call.";
  if (row[ix.has_booking] === 'no') return 'Website has no way to book online.';
  return 'May be missing after-hours enquiries.';
}
 
function scoreAndPromote() {
  const raw = ss().getSheetByName('Raw');
  const n = raw.getLastRow();
  if (n < 2) return 0;
  const data = raw.getRange(2, 1, n - 1, RAW_COLS.length).getValues();
  const ix = colIndex(RAW_COLS);
  const minScore = Number(getCfg('min_score', 6));
  const cands = [];
 
  data.forEach(function (r, i) {
    if (r[ix.state] !== 'new' || r[ix.site_checked] === '') return;
    const score = scoreLead(r, ix);
    r[ix.score] = score;
    r[ix.hook] = hookFor(r, ix);
    if (score >= minScore) cands.push(i); else r[ix.state] = 'rejected';
  });
 
  cands.sort(function (a, b) { return data[b][ix.score] - data[a][ix.score]; }); // best leads reach the queue first
 
  let promoted = 0;
  withLock(function () {
    const have = {};
    rows('Leads').forEach(function (l) { have[String(l.phone)] = 1; });
    rows('Suppression').forEach(function (s) { have[String(s.phone)] = 1; });
    const out = [], idxs = [];
    cands.forEach(function (i) {
      const r = data[i], phone = String(r[ix.phone_e164]);
      if (have[phone]) { r[ix.state] = 'rejected'; return; }
      have[phone] = 1;
      const note = r[ix.hook] + ' (' + r[ix.reviews] + ' reviews' + (r[ix.rating] ? ', ' + r[ix.rating] + ' stars' : '') + ')';
      out.push(pad([Utilities.getUuid().slice(0, 8), r[ix.name], '', r[ix.trade], r[ix.suburb], r[ix.phone_raw], phone, note, 'new', 0, '', '', new Date()]));
      idxs.push(i);
    });
    if (out.length) {
      const leads = sh('Leads');
      const startRow = leads.getLastRow() + 1;
      leads.getRange(startRow, 6, out.length, 2).setNumberFormat('@');
      leads.getRange(startRow, 1, out.length, LH.length).setValues(out);
      idxs.forEach(function (i) { data[i][ix.state] = 'promoted'; });
      promoted = out.length;
    }
  });
 
  raw.getRange(2, ix.score + 1, data.length, 3).setValues(
    data.map(function (r) { return [r[ix.score], r[ix.state], r[ix.hook]]; }));
  logUsage(ss());
  return promoted;
}
 
// ====================== USAGE + MAINTENANCE ======================
 
function logUsage(book) {
  const u = book.getSheetByName('Usage');
  const label = getProp('ACCOUNT_LABEL', 'A'), month = monthKey();
  const n = u.getLastRow();
  const vals = n >= 2 ? u.getRange(2, 1, n - 1, 2).getValues() : [];
  let rowNum = 0;
  vals.forEach(function (v, i) { if (String(v[0]) === month && v[1] === label) rowNum = i + 2; });
  const out = [month, label, callsUsed(), Number(getProp('MONTHLY_CAP', 900)), new Date()];
  if (rowNum) u.getRange(rowNum, 1, 1, 5).setValues([out]);
  else u.getRange(n + 1, 1, 1, 5).setValues([out]);
  // tidy old daily counters
  const p = PropertiesService.getScriptProperties(), props = p.getProperties();
  Object.keys(props).forEach(function (k) { if (k.indexOf('calls_day_') === 0 && k !== 'calls_day_' + dayKey()) p.deleteProperty(k); });
}
 
function getCfg(key, def) {
  const c = ss().getSheetByName('Config').getDataRange().getValues();
  for (let i = 1; i < c.length; i++) if (c[i][0] === key && c[i][1] !== '') return c[i][1];
  return def;
}
 
/** Runs automatically at the first pull of each month: re-opens this account's finished searches.
 *  Most results will be repeats (blocked by the duplicate check), but new businesses do appear over time. */
function resetMyQueriesIfNewMonth(label) {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('reset_month') === monthKey()) return;
  const qs = ss().getSheetByName('Queries');
  const n = qs.getLastRow();
  if (n >= 2) {
    const rng = qs.getRange(2, 1, n - 1, QUERY_COLS.length), v = rng.getValues();
    const si = QUERY_COLS.indexOf('status'), ai = QUERY_COLS.indexOf('assigned_to');
    v.forEach(function (r) { if (r[ai] === label && r[si] === 'done') r[si] = 'pending'; });
    rng.setValues(v);
  }
  p.setProperty('reset_month', monthKey());
}
 

return { accountsFor, analyseHtml, buildDashboard, buildQueries, buildRaw, callsToday, callsUsed, canCall, capFor, colIndex, configure, connectSheet, countCall, dayKey, enrichLeads, fetchSafe, findRow, getAccountsOverview, getCfg, getProp, getRecent, getResults, getState, hookFor, importLeads, installTriggers, isMobile, lastSendRow, loadExisting, logUsage, markBooked, markReplied, markSent, master, monthKey, needAdmin, norm, quickState, resetMyQueriesIfNewMonth, rows, runEnrichAndScore, runPull, saveSettings, saveTemplates, scoreAndPromote, scoreLead, searchPlaces, seedTeam, setSite, setStatus, setup, setupAll, sh, syncHead, who, withLock };
})();
