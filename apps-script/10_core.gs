/* ===== module: core (generated; edit the source modules, not this wrapper) ===== */
const Core = (function () {
/**
 * Cogwell OS core backend.
 * SETUP
 * 1. script.google.com > New project > paste this file.
 * 2. Project Settings > Script properties > add OS_KEY = a long random password.
 * 3. Run setup() once and approve the prompts. It creates a Google Sheet called "Cogwell OS" (the link is in the log).
 * 4. Deploy > New deployment > Web app. Execute as: Me. Access: Anyone.
 * 5. Paste the Web app URL (ends in /exec) and the Sheet link into CONFIG at the top of index.html.
 * 6. In the editor edit the email in addOwner() and run it once. Sign in on the site with your emailed code, then invite everyone else from the Invites page.
 * 7. Optional: add Script property PLATFORM_URL (the platform Web app URL) and give both projects the same OS_KEY, so the Command Center can show platform leads.
 */
const P = OS.props('CORE');
const SCHEMA = {
  Leads: ['id', 'created', 'business', 'contact', 'phone', 'trade', 'city', 'channel', 'status', 'next_action', 'next_due', 'notes'],
  Calls: ['id', 'created', 'lead_id', 'business', 'outcome', 'next_step', 'channel', 'notes'],
  Deals: ['id', 'created', 'lead_id', 'business', 'channel', 'tier', 'setup_fee', 'monthly_fee', 'stage', 'stage_changed', 'affiliate_code'],
  Tasks: ['id', 'created', 'deal_id', 'business', 'title', 'owner', 'due', 'status'],
  Affiliates: ['id', 'created', 'name', 'business', 'type', 'code', 'status'],
  Payments: ['id', 'created', 'deal_id', 'business', 'type', 'amount', 'cleared'],
  Quotes: ['id', 'created', 'deal_id', 'business', 'tier', 'setup_fee', 'monthly_fee', 'status'],
  Users: ['email', 'role', 'business', 'code', 'status'],
  Events: ['ts', 'type', 'ref', 'detail']
};

function setup() {
  const id = P.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Cogwell OS');
  P.setProperty('SHEET_ID', ss.getId());
  Object.keys(SCHEMA).forEach(function (t) {
    const sh = ss.getSheetByName(t) || ss.insertSheet(t);
    sh.getRange(1, 1, 1, SCHEMA[t].length).setValues([SCHEMA[t]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const d = ss.getSheetByName('Sheet1');
  if (d) ss.deleteSheet(d);
  Logger.log('Sheet link: ' + ss.getUrl());
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}


function user_(email) {
  const v = sheet_('Users').getDataRange().getValues(); v.shift();
  for (const r of v) if (String(r[0]).toLowerCase() === String(email).toLowerCase().trim() && r[4] !== 'off') return { email: String(r[0]), role: String(r[1]), business: String(r[2]), code: String(r[3]) };
  return null;
}
/** Run once from the editor: makes the deploying Google account the owner login. */
function addOwner() { addUser(Session.getEffectiveUser().getEmail(), 'owner'); }
/** Run once from the editor to create your owner login. Roles: owner, team, client (set business), affiliate (set code). */
function addUser(email, role, business, code) {
  sheet_('Users').appendRow([email, role || 'owner', business || '', code || '', 'on']);
}
function setUserStatus_(email, status) {
  const sh = sheet_('Users'), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === String(email).toLowerCase() && v[i][1] !== 'owner') sh.getRange(i + 1, 5).setValue(status);
}
function doPost(e) {
  try {
    const r = JSON.parse(e.postData.contents), key = P.getProperty('OS_KEY'), C = CacheService.getScriptCache();
    if (r.action === 'login') {
      const u = user_(r.email);
      if (u) {
        const n = String(Math.floor(100000 + Math.random() * 900000));
        C.put('code:' + u.email.toLowerCase(), n, 600);
        MailApp.sendEmail(u.email, 'Your Cogwell OS code', 'Your sign-in code is ' + n + '. It expires in 10 minutes.');
      }
      return out_({ ok: true });
    }
    if (r.action === 'verify') {
      const em = String(r.email).toLowerCase().trim(), u = user_(em);
      const tries = Number(C.get('try:' + em) || 0);
      if (tries >= 5) return out_({ ok: false, error: 'Too many attempts. Request a new code in 10 minutes.' });
      if (!u || C.get('code:' + em) !== String(r.code).trim()) { C.put('try:' + em, String(tries + 1), 600); return out_({ ok: false, error: 'Wrong or expired code' }); }
      C.remove('try:' + em);
      C.remove('code:' + em);
      const t = Utilities.getUuid(); C.put('ses:' + t, em, 21600);
      return out_({ ok: true, data: { token: t, role: u.role, email: u.email } });
    }
    let u = null;
    if (r.token && C.get('ses:' + r.token)) u = user_(C.get('ses:' + r.token));
    if (!u) return out_({ ok: false, error: 'Not signed in' });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (r.action === 'state') return out_({ ok: true, role: u.role, data: state_(u) });
      if (u.role === 'owner') {
        if (r.action === 'users') return out_({ ok: true, data: rows_('Users') });
        if (r.action === 'invite') {
          const em = String(r.email || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || ['client', 'team', 'affiliate'].indexOf(r.role) < 0) return out_({ ok: false, error: 'Enter a valid email and role' });
          if (!user_(em)) addUser(em, r.role, r.business, r.code);
          else setUserStatus_(em, 'on');
          if (String(r.site).indexOf('https://') === 0) MailApp.sendEmail(em, 'You are invited to Cogwell', 'You have been invited to Cogwell.\n\nOpen ' + r.site + ', enter this email address and we will send you a sign-in code. No password needed.');
          return out_({ ok: true });
        }
        if (r.action === 'setuser') { setUserStatus_(r.email, r.status === 'off' ? 'off' : 'on'); return out_({ ok: true }); }
      }
      if (u.role !== 'owner' && u.role !== 'team') return out_({ ok: false, error: 'Not allowed' });
      if (r.action === 'platform') {
        try { return out_({ ok: true, data: OS.mod('platform').osSummary_() }); }
        catch (e) { return out_({ ok: true, data: null }); }
      }
      if (r.action === 'inbox') return out_({ ok: true, data: inbox_(r.q) });
      if (r.action === 'thread') return out_({ ok: true, data: thread_(r.id) });
      if (r.action === 'send') return out_({ ok: true, data: send_(r) });
      if (!SCHEMA[r.tab] || r.tab === 'Events' || r.tab === 'Users') return out_({ ok: false, error: 'Unknown tab' });
      if (r.action === 'add') return out_({ ok: true, data: add_(r.tab, r.row) });
      if (r.action === 'update') return out_({ ok: true, data: update_(r.tab, r.id, r.fields) });
      return out_({ ok: false, error: 'Unknown action' });
    } finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function sheet_(t) { return SpreadsheetApp.openById(P.getProperty('SHEET_ID')).getSheetByName(t); }

function rows_(t) {
  const v = sheet_(t).getDataRange().getValues(), h = v.shift();
  return v.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    h.forEach(function (k, i) { o[k] = r[i] instanceof Date ? r[i].toISOString() : String(r[i]); });
    return o;
  });
}
function state_(u) {
  const s = {};
  ['Leads', 'Calls', 'Deals', 'Tasks', 'Affiliates', 'Payments', 'Quotes'].forEach(function (t) { s[t] = rows_(t); });
  if (u.role === 'owner' || u.role === 'team') return s;
  const o = { Leads: [], Calls: [], Tasks: [], Quotes: [], Affiliates: [], Deals: [], Payments: [] };
  if (u.role === 'client') {
    ['Deals', 'Tasks', 'Payments', 'Quotes'].forEach(function (t) { o[t] = s[t].filter(function (x) { return x.business === u.business; }); });
  } else if (u.role === 'affiliate') {
    o.Affiliates = s.Affiliates.filter(function (a) { return a.code === u.code; });
    o.Deals = s.Deals.filter(function (d) { return d.affiliate_code === u.code; });
    const ids = o.Deals.map(function (d) { return d.id; });
    o.Payments = s.Payments.filter(function (p) { return ids.indexOf(p.deal_id) >= 0; });
    o.board = s.Affiliates.map(function (a) {
      const w = s.Deals.filter(function (d) { return d.affiliate_code === a.code && d.stage === 'Won'; }).map(function (d) { return d.id; });
      return { name: a.name, cash: s.Payments.filter(function (p) { return w.indexOf(p.deal_id) >= 0; }).reduce(function (x, p) { return x + Number(p.amount); }, 0) };
    }).sort(function (a, b) { return b.cash - a.cash; }).map(function (b) { return b.name; });
  }
  return o;
}

function inbox_(q) {
  return GmailApp.search(q || 'in:inbox', 0, 20).map(function (t) {
    const m = t.getMessages().pop();
    return { id: t.getId(), subject: t.getFirstMessageSubject(), from: m.getFrom(), snippet: m.getPlainBody().slice(0, 160), date: m.getDate().toISOString(), unread: t.isUnread() };
  });
}
function thread_(id) {
  return GmailApp.getThreadById(id).getMessages().map(function (m) { return { from: m.getFrom(), date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 2000) }; });
}
function send_(r) {
  if (r.id) GmailApp.getThreadById(r.id).reply(r.body);
  else GmailApp.sendEmail(r.to, r.subject, r.body);
  return { sent: true };
}

function add_(t, row) {
  const sh = sheet_(t), cols = SCHEMA[t];
  const rg = sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length);
  rg.setNumberFormat('@'); // keep phone numbers and dates as typed
  rg.setValues([cols.map(function (c) { return row[c] == null ? '' : String(row[c]); })]);
  log_('add:' + t, row.id, row.business || row.title || '');
  return row;
}

function update_(t, id, f) {
  const sh = sheet_(t), cols = SCHEMA[t], ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      Object.keys(f).forEach(function (k) {
        const c = cols.indexOf(k);
        if (c < 0) return;
        const cell = sh.getRange(i + 1, c + 1);
        cell.setNumberFormat('@');
        cell.setValue(String(f[k]));
      });
      log_('update:' + t, id, JSON.stringify(f));
      return { id: id };
    }
  }
  throw new Error('Row not found');
}

function log_(type, ref, detail) {
  sheet_('Events').appendRow([new Date().toISOString(), type, ref, String(detail).slice(0, 200)]);
}


return { addOwner, addUser, add_, doPost, inbox_, log_, out_, rows_, send_, setUserStatus_, setup, sheet_, state_, thread_, update_, user_ };
})();
