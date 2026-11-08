/**
 * COGWELL PLATFORM - the single entry point.
 *   GET  ?m=<page>&k=<ticket>   serves a module page (signed-in) or the sign-in page
 *   GET  ?m=invoice&d=<token>   public client invoice page
 *   GET  ?m=platform            client portal (has its own sign-in for client users)
 *   POST (JSON)                 OS shell API (core actions) and the website chat widget (platform actions)
 *   google.script.run.osApi     every module page calls its own server code through this one function
 */
const PAGES_ = {
  linkqueue:   { file: 'page_linkqueue',   title: 'WhatsApp queue',  mod: 'linkqueue',   roles: ['owner', 'team'] },
  scoreboard:  { file: 'page_scoreboard',  title: 'Scoreboard',      mod: 'scoreboard',  roles: ['owner', 'team'] },
  content:     { file: 'page_poststudio',  title: 'Post Studio',     mod: 'poststudio',  roles: ['owner', 'team'] },
  packbuilder: { file: 'page_packbuilder', title: 'Post Pack Builder', mod: 'packbuilder', roles: ['owner', 'team'] },
  invoices:    { file: 'page_invoicing',   title: 'Invoicing',       mod: 'invoicing',   roles: ['owner'] }
};

// What a page may call. Anything not listed here cannot be reached from a browser.
const API_ = {
  linkqueue: { roles: ['owner', 'team'], fns: ['getState', 'getAccountsOverview', 'getRecent', 'getResults', 'importLeads', 'markBooked', 'markReplied', 'markSent', 'saveSettings', 'saveTemplates', 'setStatus'] },
  scoreboard: { roles: ['owner', 'team'], fns: ['api_state', 'api_set', 'api_import'] },
  poststudio: { roles: ['owner', 'team'], fns: ['getConfig', 'saveConfig', 'setupTemplates', 'processPost', 'emailChunk'] },
  packbuilder: { roles: ['owner', 'team'], fns: ['importFromDialog', 'startBuild'] },
  invoicing: { roles: ['owner'], fns: ['adminBootstrap', 'adminSave', 'adminGenerate', 'adminEmail', 'adminSetStatus', 'adminDelete'], publicFns: ['getDraft', 'clientGenerate', 'clientPdf'] },
  platform: { roles: [], fns: [], publicFns: ['apiRun'] } // the portal enforces its own tenant sessions
};

// Actions handled by the OS shell backend. Everything else on POST belongs to the platform (chat widget, portal).
const CORE_ACTIONS_ = ['login', 'verify', 'state', 'users', 'invite', 'setuser', 'platform', 'inbox', 'thread', 'send', 'add', 'update'];

function mods_() {
  return { core: Core, platform: Platform, invoicing: Invoicing, linkqueue: LinkQueue, scoreboard: Scoreboard, poststudio: PostStudio, packbuilder: PackBuilder };
}

/* ---------- sessions (shared with the OS shell: same email-code login, same 6-hour session) ---------- */
function sessionUser_(token) {
  if (!token) return null;
  const email = CacheService.getScriptCache().get('ses:' + token);
  if (!email) return null;
  return Core.user_(email);
}
function osTicket(token) { // one-use, two-minute pass that carries a session into a page URL without exposing the session itself
  if (!sessionUser_(token)) throw new Error('Not signed in');
  const t = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tk:' + t, token, 120);
  return t;
}
function osLogin(email) {
  Core.doPost({ postData: { contents: JSON.stringify({ action: 'login', email: String(email || '') }) } });
  return true;
}
function osVerify(email, code) {
  const r = JSON.parse(Core.doPost({ postData: { contents: JSON.stringify({ action: 'verify', email: String(email || ''), code: String(code || '') }) } }).getContent());
  if (!r.ok) throw new Error(r.error || 'Could not sign in');
  return JSON.stringify({ token: r.data.token, role: r.data.role });
}

/* ---------- web entry ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {}, m = String(p.m || '');
  try {
    if (m === 'invoice') {
      const d = /^[A-Za-z0-9_-]{1,80}$/.test(p.d || '') ? p.d : '';
      return render_('page_invoice_client', 'Cogwell Invoice', '', { token: d });
    }
    if (m === 'platform') return render_('page_platform', 'Dashboard', '', {});
    const pg = PAGES_[m];
    if (pg) {
      const C = CacheService.getScriptCache(), token = p.k ? C.get('tk:' + p.k) : null;
      if (token) C.remove('tk:' + p.k);
      const u = sessionUser_(token);
      if (u && pg.roles.indexOf(u.role) >= 0) return render_(pg.file, pg.title, token, {});
      const t = HtmlService.createTemplateFromFile('login');
      t.mod = m; t.base = ScriptApp.getService().getUrl();
      return t.evaluate().setTitle('Sign in').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font:15px system-ui;padding:24px">Something went wrong: ' + String(err.message || err).replace(/[<>&]/g, '') + '</p>');
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'Cogwell Platform' })).setMimeType(ContentService.MimeType.JSON);
}

function render_(file, title, token, vars) {
  const t = HtmlService.createTemplateFromFile(file);
  Object.keys(vars).forEach(function (k) { t[k] = vars[k]; });
  const html = t.evaluate().getContent().replace('<!--OS_BOOT-->', '<script>window.OS_TOKEN=' + JSON.stringify(token || '') + ';</script>');
  return HtmlService.createHtmlOutput(html).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  let b = null;
  try { b = JSON.parse(e.postData.contents); } catch (x) { /* not JSON: platform will answer */ }
  if (b && b.action === 'ticket') {
    try { return json_({ ok: true, data: { ticket: osTicket(b.token) } }); } catch (err) { return json_({ ok: false, error: 'Not signed in' }); }
  }
  if (b && CORE_ACTIONS_.indexOf(b.action) >= 0) return Core.doPost(e);
  return Platform.doPost(e);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- the one function every page calls ---------- */
function osApi(token, mod, fn, argsJson) {
  try {
    const rule = API_[mod];
    if (!rule) throw new Error('Unknown module');
    const isPublic = (rule.publicFns || []).indexOf(fn) >= 0;
    if (!isPublic && rule.fns.indexOf(fn) < 0) throw new Error('Unknown function');
    let u = null;
    if (!isPublic) {
      u = sessionUser_(token);
      if (!u) throw new Error('Not signed in');
      if (rule.roles.indexOf(u.role) < 0) throw new Error('Not allowed for your role');
    }
    OS.set(u ? { email: u.email, role: u.role } : null);
    const f = mods_()[mod][fn];
    if (typeof f !== 'function') throw new Error('Unknown function');
    const res = f.apply(null, JSON.parse(argsJson || '[]'));
    return JSON.stringify({ v: res === undefined ? null : res });
  } catch (err) {
    return JSON.stringify({ err: String((err && err.message) || err) });
  } finally { OS.set(null); }
}

/* ---------- trigger entry points (Apps Script triggers need top-level names) ---------- */
function pf_slaCheck_() { Platform.slaCheck_(); }
function pf_emailIntake_() { Platform.emailIntake_(); }
function pf_weeklyReport_() { Platform.weeklyReport_(); }
function pf_backup_() { Platform.backup_(); }
function pf_followUps_() { Platform.followUps_(); }
function pf_repliesCheck_() { Platform.repliesCheck_(); }
function pf_retention_() { Platform.retention_(); }
function lq_runPull() { LinkQueue.runPull(); }
function lq_runEnrichAndScore() { LinkQueue.runEnrichAndScore(); }
function pb_continueBuild() { PackBuilder.continueBuild(); }
function sb_dailyEmails() { Scoreboard.dailyEmails(); }

/* ---------- run these from the Apps Script editor ---------- */
/** 1. Creates every sheet, links the OS owner (you), installs the platform and scoreboard triggers. */
function setupAll() {
  const log = [];
  const step = function (name, fn) { try { fn(); log.push('OK   ' + name); } catch (e) { log.push('FAIL ' + name + ': ' + (e && e.message || e)); } };
  step('core (OS sheet)', function () { Core.setup(); });
  step('core (owner login)', function () { Core.addOwner(); });
  step('platform (sheet + triggers)', function () { Platform.setup_(); Platform.installTriggers_(); });
  step('invoicing', function () { Invoicing.setup(); });
  step('scoreboard', function () { Scoreboard.setup(); });
  step('packbuilder', function () { PackBuilder.setup(); });
  step('linkqueue (queue tabs; run linkQueueEngine() later for the lead engine)', function () { LinkQueue.setup(); LinkQueue.seedTeam(); });
  log.push('', 'Sheets created:');
  ['CORE_SHEET_ID', 'PLATFORM_SHEET_ID'].forEach(function (k) { log.push('  ' + k + ' = ' + PropertiesService.getScriptProperties().getProperty(k)); });
  ['INVOICING', 'SCOREBOARD', 'PACKBUILDER', 'LINKQUEUE'].forEach(function (k) { log.push('  SS_' + k + ' = ' + PropertiesService.getScriptProperties().getProperty('SS_' + k)); });
  log.push('', 'Next: Deploy > New deployment > Web app (Execute as: Me, Access: Anyone), then paste the /exec URL into API_URL in index.html.');
  Logger.log(log.join('\n'));
  return log.join('\n');
}
/** Point a module at a spreadsheet you already have (keeps your existing data). Example: linkSheet('invoicing', '<sheet id>') */
function linkSheet(mod, sheetId) {
  if (['invoicing', 'scoreboard', 'packbuilder', 'linkqueue'].indexOf(mod) < 0) throw new Error('mod must be invoicing, scoreboard, packbuilder or linkqueue');
  SpreadsheetApp.openById(sheetId);
  PropertiesService.getScriptProperties().setProperty('SS_' + mod.toUpperCase(), sheetId);
  if (mod === 'linkqueue') PropertiesService.getScriptProperties().setProperty('MASTER_ID', sheetId);
  Logger.log('Linked ' + mod + ' to ' + sheetId);
}
/** Link an existing client-portal database (the "Platform DB" sheet). */
function linkPlatformSheet(sheetId) { SpreadsheetApp.openById(sheetId); PropertiesService.getScriptProperties().setProperty('PLATFORM_SHEET_ID', sheetId); }
/** Link an existing Cogwell OS database sheet. */
function linkCoreSheet(sheetId) { SpreadsheetApp.openById(sheetId); PropertiesService.getScriptProperties().setProperty('CORE_SHEET_ID', sheetId); }
/** Creates the first client tenant and emails the invite (edit the constants in the platform module first, or use the Admin tab later). */
function platformBootstrap() { Platform.bootstrap(); }
function linkQueueConfigure() { LinkQueue.configure(); }
function linkQueueEngine() { LinkQueue.setupAll(); }
function packBuilderCreateTemplates() { PackBuilder.createStarterTemplates(); }

/* ---------- the old Sheet-menu actions, now run from the editor ---------- */
function packBuilderImportInbox() { PackBuilder.importInboxAndBuild(); }
function packBuilderBuildNow() { PackBuilder.buildPackNow(); }
function packBuilderEmailSample() { PackBuilder.emailSamplePack(); }
function packBuilderRebuildLayouts() { PackBuilder.rebuildStarterLayouts(); }
function packBuilderRefreshDropdowns() { PackBuilder.refreshDropdowns(); }
function scoreboardSendNow() { Scoreboard.sendAll(); }
/** Sets the invoice logo: invoicingSetLogo('<Drive file id>'). */
function invoicingSetLogo(fileId) { PropertiesService.getScriptProperties().setProperty('LOGO_FILE_ID', String(fileId || '')); }
