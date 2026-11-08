/* ===== module: scoreboard (generated; edit the source modules, not this wrapper) ===== */
const Scoreboard = (function () {
// Team Scoreboard - bound to a Google Sheet (Extensions > Apps Script)
const TZ = Session.getScriptTimeZone();
const DEPTS = ['Product', 'Sales', 'Cold Outbound & Marketing'];
const COLS = {
  Users: ['email', 'name', 'dept', 'role', 'active'],          // role: admin | member
  Tasks: ['id', 'date', 'dept', 'assignee', 'title', 'target', 'unit'],
  Progress: ['date', 'email', 'taskId', 'done']
};

function onOpen() {
  OS.ui().createMenu('Scoreboard')
    .addItem('1. Set up sheets + daily email', 'setup')
    .addItem('Send emails now', 'sendAll').addToUi();
}

function setup() {
  const ss = OS.ss('scoreboard');
  Object.keys(COLS).forEach(n => {
    const s = ss.getSheetByName(n) || ss.insertSheet(n);
    if (!s.getLastRow()) {
      s.getRange(1, 1, 1, COLS[n].length).setValues([COLS[n]]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  });
  ss.getSheetByName('Tasks').getRange('B:B').setNumberFormat('@');
  ss.getSheetByName('Progress').getRange('A:A').setNumberFormat('@');
  const u = ss.getSheetByName('Users');
  if (u.getLastRow() < 2) u.appendRow([Session.getEffectiveUser().getEmail(), 'Admin', DEPTS[0], 'admin', 'yes']);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sb_dailyEmails').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sb_dailyEmails').timeBased().atHour(7).everyDays(1).create();
  OS.ui().alert('Done. Add your team on the Users sheet (dept must be one of: ' + DEPTS.join(', ') + '). Then Deploy > New deployment > Web app.');
}


// ---------- data helpers ----------
function rows(n) {
  const v = OS.ss('scoreboard').getSheetByName(n).getDataRange().getValues(), h = v.shift();
  return v.filter(r => r[0] !== '').map(r => Object.fromEntries(h.map((k, i) =>
    [k, r[i] instanceof Date ? Utilities.formatDate(r[i], TZ, 'yyyy-MM-dd') : r[i]])));
}
const isActive = u => String(u.active).toLowerCase() !== 'no' && u.active !== false;
const dayStr = d => Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd');

function who() {
  const email = String(OS.email() || '').toLowerCase();
  const u = rows('Users').find(x => String(x.email).toLowerCase() === email && isActive(x));
  if (!u) throw new Error('NOT_REGISTERED:' + email);
  return Object.assign({}, u, { email, role: String(u.role).toLowerCase() });
}

// ---------- core: one person's days, gate and stats ----------
function compute(me, T, P) {
  const dm = {};
  P.filter(p => String(p.email).toLowerCase() === me.email).forEach(p => dm[p.taskId] = Number(p.done) || 0);
  const tasks = T.filter(t => (t.dept === 'ALL' || t.dept === me.dept) &&
    (!t.assignee || String(t.assignee).toLowerCase() === me.email))
    .map(t => ({ id: t.id, date: t.date, title: t.title, unit: t.unit, target: Number(t.target) || 1, done: dm[t.id] || 0 }));
  const by = {};
  tasks.forEach(t => (by[t.date] = by[t.date] || []).push(t));
  const days = Object.keys(by).sort().map(d => ({ date: d, tasks: by[d], complete: by[d].every(t => t.done >= t.target) }));
  const today = dayStr();
  const open = days.find(d => !d.complete);
  const activeDate = open ? open.date : (days.length ? days[days.length - 1].date : '');
  const past = days.filter(d => d.date <= today);
  const pt = past.flatMap(d => d.tasks);
  const pct = pt.length ? Math.round(100 * pt.reduce((a, t) => a + Math.min(t.done / t.target, 1), 0) / pt.length) : 0;
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].complete) streak++; else if (past[i].date !== today) break;
  }
  return {
    tasks, days, today, activeDate, pct, streak,
    behind: days.filter(d => d.date < today && !d.complete).length,
    ahead: days.filter(d => d.date > today && d.complete).length
  };
}

// ---------- web app API ----------
function api_state() {
  const me = who(), T = rows('Tasks'), P = rows('Progress');
  const board = rows('Users').filter(isActive).map(u => {
    u.email = String(u.email).toLowerCase();
    const s = compute(u, T, P), td = s.days.find(d => d.date === s.today);
    return { name: u.name, dept: u.dept, pct: s.pct, behind: s.behind, ahead: s.ahead, streak: s.streak,
      tDone: td ? td.tasks.filter(t => t.done >= t.target).length : 0, tTotal: td ? td.tasks.length : 0, me: u.email === me.email };
  });
  const s = compute(me, T, P);
  return { me: { name: me.name, dept: me.dept, role: me.role }, today: s.today, days: s.days, board, depts: DEPTS };
}

function api_set(taskId, done) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const me = who(), s = compute(me, rows('Tasks'), rows('Progress'));
    const t = s.tasks.find(x => x.id === taskId);
    if (!t) throw new Error('That task is not on your list.');
    if (t.date > s.activeDate) throw new Error('Finish ' + s.activeDate + ' before starting later days.');
    done = Math.max(0, Number(done) || 0);
    const sh = OS.ss('scoreboard').getSheetByName('Progress'), v = sh.getDataRange().getValues();
    const i = v.findIndex((r, k) => k > 0 && String(r[1]).toLowerCase() === me.email && r[2] === taskId);
    if (i > 0) sh.getRange(i + 1, 4).setValue(done); else sh.appendRow([t.date, me.email, taskId, done]);
    return true;
  } finally { lock.releaseLock(); }
}

// Plan format (paste from a Sheet/Excel or CSV):  Day | Department | Person (email, optional) | Task | Target | Unit
// Day 1 = start date; weekends are skipped. Department can be Product, Sales, Marketing/Cold Outbound, or ALL.
function api_import(text, start, replace, commit) {
  const me = who(); if (me.role !== 'admin') throw new Error('Admins only.');
  const d0 = new Date(start + 'T12:00:00'); while (d0.getDay() % 6 === 0) d0.setDate(d0.getDate() + 1);
  const out = [], errors = [], byDept = {};
  text.split(/\r?\n/).filter(l => l.trim()).forEach((l, n) => {
    const c = l.split(l.includes('\t') ? '\t' : ',').map(x => x.trim());
    if (/^day$/i.test(c[0])) return;
    const day = parseInt(c[0], 10), q = (c[1] || '').toLowerCase();
    const dept = q === 'all' ? 'ALL' : DEPTS.find(d => d.toLowerCase().includes(q) && q);
    if (!day || day < 1 || !dept || !c[3]) { errors.push('Line ' + (n + 1) + ': ' + l.slice(0, 60)); return; }
    const d = new Date(d0); let k = day - 1; while (k > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) k--; }
    const date = dayStr(d), person = (c[2] || '').toLowerCase();
    const id = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, [date, dept, person, c[3]].join('|'))).slice(0, 12);
    out.push([id, date, dept, person, c[3], Number(c[4]) || 1, c[5] || '']);
    byDept[dept] = (byDept[dept] || 0) + 1;
  });
  if (commit && out.length) {
    const sh = OS.ss('scoreboard').getSheetByName('Tasks');
    if (replace && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clearContent();
    const have = new Set(rows('Tasks').map(t => t.id));
    const add = out.filter(r => !have.has(r[0]));
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 7).setValues(add);
  }
  return { count: out.length, byDept, errors: errors.slice(0, 8), last: out.length ? out[out.length - 1][1] : '' };
}

// ---------- daily email ----------
function dailyEmails() { if (new Date().getDay() % 6) sendAll(); }

function sendAll() {
  const T = rows('Tasks'), P = rows('Progress'), url = ScriptApp.getService().getUrl() + '?m=scoreboard';
  rows('Users').filter(isActive).forEach(u => {
    u.email = String(u.email).toLowerCase();
    const s = compute(u, T, P); if (!s.days.length) return;
    const open = s.days.find(d => !d.complete), late = s.days.filter(d => d.date < s.today && !d.complete);
    const li = t => '<li>' + esc(t.title) + ': ' + Math.max(t.target - t.done, 0) + ' ' + esc(t.unit || 'left') + ' to go (target ' + t.target + ')</li>';
    const last5 = s.days.filter(d => d.date < s.today).slice(-5);
    const rate = last5.length ? last5.filter(d => d.complete).length + ' of your last ' + last5.length + ' days were fully done.' : '';
    let plan;
    if (late.length) {
      const left = {};
      late.flatMap(d => d.tasks).filter(t => t.done < t.target).forEach(t => left[t.title] = (left[t.title] || 0) + t.target - t.done);
      plan = '<b>Catch-up plan.</b> You are ' + late.length + ' day(s) behind, and the board keeps later days locked until ' + late[0].date +
        ' is done. Clear that day first, then spread the backlog over 3 days: add about ' +
        Object.keys(left).map(k => Math.ceil(left[k] / 3) + ' extra of "' + esc(k) + '"').join(', ') + ' to each day.';
    } else if (!open || open.date > s.today) {
      const nx = open ? open.tasks.map(t => esc(t.title) + ' (' + t.target + ')').join(', ') : '';
      plan = '<b>You are ahead.</b> ' + (nx ? 'Pull forward ' + nx + ' so tomorrow starts light.' : 'Your whole plan is complete. Help a teammate who is behind.');
    } else {
      plan = '<b>On track.</b> Work the list top to bottom, finish before mid-afternoon to leave a buffer, and once it is done tomorrow unlocks if you want to get ahead.';
    }
    const html = '<div style="font:15px Arial;max-width:520px"><p>Morning ' + esc(u.name) + ',</p>' +
      '<p><b>Your list' + (open && open.date < s.today ? ' (carried over from ' + open.date + ')' : ' for today') + ':</b></p><ul>' +
      (open ? open.tasks.map(li).join('') : '<li>Nothing planned.</li>') + '</ul><p>' + plan + '</p><p>' + rate + ' Score so far: ' + s.pct + '%.</p>' +
      '<p><a href="' + url + '">Open the scoreboard</a></p></div>';
    MailApp.sendEmail({ to: u.email, subject: 'Today: ' + (open ? open.tasks.length : 0) + ' tasks' + (late.length ? ' (' + late.length + ' day behind)' : ''), htmlBody: html });
  });
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));


return { api_import, api_set, api_state, compute, dailyEmails, onOpen, rows, sendAll, setup, who };
})();
