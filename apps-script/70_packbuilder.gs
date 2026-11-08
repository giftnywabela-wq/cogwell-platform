/* ===== module: packbuilder (generated; edit the source modules, not this wrapper) ===== */
const PackBuilder = (function () {
/**
 * POST PACK BUILDER
 * Core posts in -> repurposed for LinkedIn, Instagram and Facebook -> one zip out.
 * Modeled on the Quote Tool: Settings / Templates / Placeholders tabs, template files with {{tags}},
 * a sample pack email, and fail-soft behaviour (one bad post never blocks the batch).
 *
 * Files: Code.gs (this file), Import.gs, Render.gs, Pack.gs, Seed.gs, Import.html, appsscript.json
 */

// ---------- Constants ----------
const TAB = { POSTS: 'Posts', FORMATS: 'Formats', TEMPLATES: 'Templates', PLACEHOLDERS: 'Placeholders', SETTINGS: 'Settings', LOG: 'Log' };
const TIME_BUDGET_MS = 4.5 * 60 * 1000;           // Apps Script stops a run at about 6 minutes
const KINDS = ['carousel', 'card', 'card_square'];
const KIND_LABEL = { carousel: 'Carousel', card: 'Card', card_square: 'Square Card' };
const STYLES = ['Bold', 'Classic', 'Clean'];
const PLATFORM_KEYS = ['linkedin', 'instagram', 'facebook'];

const POST_HEADERS = ['Batch', 'No', 'Status', 'ID', 'Hook', 'Points', 'Body', 'CTA', 'Series', 'Quote', 'Attribution',
  'Hashtags', 'Image', 'ImageFileId', 'Platforms', 'Formats', 'Template', 'Pillar', 'Framework', 'Notes', 'Rendered At'];
const STATUSES = ['Queued', 'Hold', 'Rendered', 'Partial', 'Error'];
const LOG_HEADERS = ['Time', 'Batch', 'Post', 'Format', 'Status', 'Files', 'Warnings', 'Error'];

const SETTINGS_DEFAULTS = [
  ['BrandName', 'Your Brand', 'Shown where {{brand_name}} is used'],
  ['Handle', '@yourhandle', 'Printed on every slide and card ({{handle}})'],
  ['LogoFileId', '', 'Upload a logo to Drive, paste its link or ID. Put {{logo}} in the template where it should appear'],
  ['BrandColorPrimary', '#0F1B2D', 'Used when STARTER templates are created (re-create them to apply changes)'],
  ['BrandColorAccent', '#F5A524', 'Accent color for starter templates'],
  ['BrandColorBackground', '#FFFFFF', 'Light background used by the Classic and Clean starters'],
  ['BrandColorText', '#1B2430', 'Text color used by the Clean starter'],
  ['FontHeading', 'Montserrat', 'Any Google Slides font. Classic uses Georgia'],
  ['FontBody', 'Roboto', 'Any Google Slides font'],
  ['DefaultCTA', 'Follow for more.', 'Used when a post has no CTA'],
  ['DefaultHashtags', '', 'Space or comma separated. Used when a post has no hashtags'],
  ['FooterLine', '', 'Optional small print ({{footer_line}})'],
  ['DeliveryEmail', '', 'Where the zip is sent. Blank = the account running the script'],
  ['ZipLayout', 'by_platform', 'by_platform = folders linkedin/instagram/facebook. by_post = one folder per core post'],
  ['IncludePNGForLinkedIn', 'FALSE', 'TRUE = also put PNG slides next to the LinkedIn carousel PDF'],
  ['BatchPrefix', 'BATCH', 'Batch ID prefix, for example BATCH-0001'],
  ['MaxZipMB', '20', 'Large batches are split into several zips of about this size'],
  ['MaxHookChars', '110', 'Import check'],
  ['MaxPointChars', '170', 'Import check (each point / slide text)'],
  ['MaxCTAChars', '90', 'Import check'],
  ['MaxSeriesChars', '30', 'Import check'],
  ['InboxFolderId', '', 'Optional Drive folder: drop files here, then use the menu "Import from Drive Inbox and build"'],
  ['OutputFolderId', '', 'Filled in automatically on first run (Drive folder for packs and templates)']
];

// Starter values from public platform guides. Re-check them from time to time; edit freely in the Formats tab.
const FORMAT_HEADERS = ['FormatKey', 'Enabled', 'Platform', 'Kind', 'ActiveTemplate', 'MaxSlides', 'CaptionMax',
  'HashtagDefault', 'HashtagMax', 'LinkLine', 'What you get'];
const FORMAT_DEFAULTS = [
  ['linkedin_text', 'TRUE', 'LinkedIn', 'none', '', 0, 3000, 3, 5, '', 'Post copy (.txt)'],
  ['linkedin_carousel', 'TRUE', 'LinkedIn', 'carousel', '', 10, 3000, 3, 5, '', 'Carousel PDF + caption (.txt)'],
  ['instagram_carousel', 'TRUE', 'Instagram', 'carousel', '', 10, 2200, 8, 30, 'Link in bio.', 'Numbered PNG slides + caption (.txt)'],
  ['instagram_single', 'TRUE', 'Instagram', 'card', '', 1, 2200, 8, 30, 'Link in bio.', 'Quote card PNG + caption (.txt)'],
  ['facebook_post', 'TRUE', 'Facebook', 'card_square', '', 1, 63206, 2, 5, '', 'Post copy (.txt) + square card PNG'],
  ['facebook_multi', 'FALSE', 'Facebook', 'carousel', '', 10, 63206, 2, 5, '', 'Slides as PNGs + post copy (.txt)']
];

// How each format is written into the pack. copy: 'main' = <stem>.txt, 'caption' = <stem>_caption.txt
const FORMAT_DEFS = {
  linkedin_text:      { folder: 'linkedin',  label: 'text',     copy: 'main' },
  linkedin_carousel:  { folder: 'linkedin',  label: 'carousel', pdf: true, pngOptional: true, png: 'slides', copy: 'caption' },
  instagram_carousel: { folder: 'instagram', label: 'carousel', png: 'slides', copy: 'caption' },
  instagram_single:   { folder: 'instagram', label: 'card',     png: 'single', copy: 'caption' },
  facebook_post:      { folder: 'facebook',  label: 'post',     png: 'single', copy: 'main' },
  facebook_multi:     { folder: 'facebook',  label: 'multi',    png: 'slides', copy: 'main' }
};

const PLACEHOLDER_ROWS = [
  ['{{brand_name}}', 'BrandName from Settings'],
  ['{{handle}}', 'Handle from Settings'],
  ['{{logo}}', 'Your logo image (LogoFileId). Put it alone in its own text box; the box is replaced by the image. No logo = box removed'],
  ['{{series}}', 'Series label, for example Missed Call Monday'],
  ['{{hook}}', 'The hook (cover headline)'],
  ['{{slide_text}}', 'One point. A slide containing this tag is CLONED once per point'],
  ['{{slide_number}}', 'Position of the point: 01, 02, ...'],
  ['{{slide_total}}', 'Number of points'],
  ['{{cta}}', 'Call to action (falls back to DefaultCTA). A slide with only this tag is dropped if there is no CTA'],
  ['{{quote}}', 'Quote for cards (defaults to the hook)'],
  ['{{attribution}}', 'Who said it, for cards'],
  ['{{image}}', 'Optional picture from an uploaded zip (box is replaced by the image, or removed)'],
  ['{{post_id}}', 'For example BATCH-0007-03'],
  ['{{date}}', 'Date the pack was built'],
  ['{{footer_line}}', 'FooterLine from Settings']
];

// ---------- Menu ----------
function onOpen() {
  OS.ui().createMenu('Post Pack Builder')
    .addItem('1. Set up sheets and folders', 'setup')
    .addItem('2. Create starter templates', 'createStarterTemplates')
    .addSeparator()
    .addItem('Import posts (paste or upload)...', 'showImportDialog')
    .addItem('Import from Drive Inbox and build', 'importInboxAndBuild')
    .addItem('Build pack now (all Queued posts)', 'buildPackNow')
    .addSeparator()
    .addItem('Email me a sample pack', 'emailSamplePack')
    .addItem('Rebuild layouts in starter templates', 'rebuildStarterLayouts')
    .addItem('Refresh dropdowns', 'refreshDropdowns')
    .addToUi();
}

function setup() {
  ensureAll_();
  toast_('Sheets and folders are ready. Next: Post Pack Builder > Create starter templates.');
}

// ---------- Sheet scaffolding ----------
function ensureAll_() {
  const ss = OS.ss('packbuilder');
  ensureSheet_(ss, TAB.POSTS, POST_HEADERS);
  ensureSheet_(ss, TAB.FORMATS, FORMAT_HEADERS);
  ensureSheet_(ss, TAB.TEMPLATES, ['Name', 'Link or ID', 'Kind', 'Style', 'Open', 'Notes']);
  ensureSheet_(ss, TAB.PLACEHOLDERS, ['Tag', 'What it becomes']);
  ensureSheet_(ss, TAB.SETTINGS, ['Setting', 'Value', 'Notes']);
  ensureSheet_(ss, TAB.LOG, LOG_HEADERS);

  // Settings: add any missing keys, never overwrite values
  const sSh = ss.getSheetByName(TAB.SETTINGS);
  const have = existingKeys_(sSh);
  const add = SETTINGS_DEFAULTS.filter(function (r) { return have.indexOf(r[0]) === -1; });
  if (add.length) sSh.getRange(sSh.getLastRow() + 1, 1, add.length, 3).setValues(add);

  // Formats: add missing format rows
  const fSh = ss.getSheetByName(TAB.FORMATS);
  const haveF = existingKeys_(fSh);
  const addF = FORMAT_DEFAULTS.filter(function (r) { return haveF.indexOf(r[0]) === -1; });
  if (addF.length) fSh.getRange(fSh.getLastRow() + 1, 1, addF.length, FORMAT_HEADERS.length).setValues(addF);

  // Placeholders
  const pSh = ss.getSheetByName(TAB.PLACEHOLDERS);
  if (pSh.getLastRow() < 2) pSh.getRange(2, 1, PLACEHOLDER_ROWS.length, 2).setValues(PLACEHOLDER_ROWS);

  // Output folder
  const S = settings_();
  let folder = null;
  if (S.OutputFolderId) { try { folder = DriveApp.getFolderById(extractId_(S.OutputFolderId)); } catch (e) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder('Post Pack Builder');
    setSetting_('OutputFolderId', folder.getId());
  }

  // Dropdowns
  const pSheet = ss.getSheetByName(TAB.POSTS);
  const stCol = POST_HEADERS.indexOf('Status') + 1;
  pSheet.getRange(2, stCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  fSh.getRange(2, 2, 50, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).setAllowInvalid(false).build());
  const tSh = ss.getSheetByName(TAB.TEMPLATES);
  tSh.getRange(2, 3, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(KINDS, true).setAllowInvalid(false).build());
  refreshDropdowns_();
  return folder;
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    const sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getName().indexOf('Sheet') === 0) {
      sh = sheets[0]; sh.setName(name);
    } else {
      sh = ss.insertSheet(name);
    }
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    if (name === TAB.SETTINGS) { sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 520); }
    if (name === TAB.POSTS) { sh.setColumnWidth(5, 280); sh.setColumnWidth(6, 320); }
    if (name === TAB.TEMPLATES) { sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 360); }
    if (name === TAB.PLACEHOLDERS) { sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 620); }
  }
  return sh;
}

function existingKeys_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
}

function sheet_(name) {
  const sh = OS.ss('packbuilder').getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" is missing. Run Post Pack Builder > Set up sheets and folders.');
  return sh;
}

// ---------- Settings / formats / templates ----------
function settings_() {
  const sh = OS.ss('packbuilder').getSheetByName(TAB.SETTINGS), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = String(r[1] == null ? '' : r[1]).trim();
  });
  return out;
}

function settingsAll_() {
  const out = {};
  SETTINGS_DEFAULTS.forEach(function (r) { out[r[0]] = r[1]; });
  const mine = settings_();
  Object.keys(mine).forEach(function (k) { if (mine[k] !== '' || out[k] === undefined) out[k] = mine[k]; });
  return out;
}

function setSetting_(key, value) {
  const sh = sheet_(TAB.SETTINGS);
  const keys = existingKeys_(sh), idx = keys.indexOf(key);
  if (idx === -1) sh.appendRow([key, value, '']); else sh.getRange(idx + 2, 2).setValue(value);
}

function formats_() {
  const sh = sheet_(TAB.FORMATS), out = {};
  if (sh.getLastRow() < 2) return out;
  const head = sh.getRange(1, 1, 1, FORMAT_HEADERS.length).getValues()[0];
  sh.getRange(2, 1, sh.getLastRow() - 1, FORMAT_HEADERS.length).getValues().forEach(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    if (!o.FormatKey || !FORMAT_DEFS[String(o.FormatKey).trim()]) return;
    o.Enabled = String(o.Enabled).toUpperCase() === 'TRUE';
    ['MaxSlides', 'CaptionMax', 'HashtagDefault', 'HashtagMax'].forEach(function (k) { o[k] = Number(o[k]) || 0; });
    o.Kind = String(o.Kind).trim().toLowerCase();
    o.LinkLine = String(o.LinkLine || '').trim();
    o.ActiveTemplate = String(o.ActiveTemplate || '').trim();
    out[String(o.FormatKey).trim()] = o;
  });
  return out;
}

function templates_() {
  const sh = sheet_(TAB.TEMPLATES);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) {
      return { name: String(r[0]).trim(), id: extractId_(r[1]), kind: String(r[2]).trim().toLowerCase(), style: String(r[3]).trim() };
    });
}

function refreshDropdown() { refreshDropdowns_(); }
function refreshDropdowns() { refreshDropdowns_(); toast_('Dropdowns refreshed.'); }

function refreshDropdowns_() {
  const fSh = OS.ss('packbuilder').getSheetByName(TAB.FORMATS);
  const tSh = OS.ss('packbuilder').getSheetByName(TAB.TEMPLATES);
  if (!fSh || !tSh || fSh.getLastRow() < 2) return;
  const tmpls = tSh.getLastRow() < 2 ? [] : tSh.getRange(2, 1, tSh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { name: String(r[0]).trim(), kind: String(r[2]).trim().toLowerCase() }; });
  const col = FORMAT_HEADERS.indexOf('ActiveTemplate') + 1, kcol = FORMAT_HEADERS.indexOf('Kind') + 1;
  const n = fSh.getLastRow() - 1;
  const kinds = fSh.getRange(2, kcol, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    const names = tmpls.filter(function (t) { return t.kind === String(kinds[i][0]).trim().toLowerCase(); }).map(function (t) { return t.name; });
    const cell = fSh.getRange(i + 2, col);
    if (names.length) cell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true).build());
    else cell.clearDataValidations();
  }
}

// ---------- Utilities ----------
function extractId_(v) { const m = String(v).match(/[-\w]{25,}/); return m ? m[0] : String(v); }
function safe_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function pad2_(n) { n = Number(n) || 0; return n < 10 ? '0' + n : String(n); }
function slug_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'post'; }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function toast_(msg) {
  try { OS.ss('packbuilder').toast(msg, 'Post Pack Builder', 10); } catch (e) { /* trigger context */ }
  console.log(msg);
}

function appendLog_(rows) {
  if (!rows || !rows.length) return;
  const sh = sheet_(TAB.LOG);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows.map(function (r) {
    return r.map(function (v) { return safe_(String(v == null ? '' : v).slice(0, 2000)); });
  }));
}


/**
 * IMPORT: paste text, upload files (.txt .md .json .csv), upload a zip (text files + images), or use a Drive Inbox.
 * Everything ends up as rows in the Posts tab with a batch ID.
 */

const FIELD_KEYS = ['hook', 'series', 'cta', 'points', 'body', 'quote', 'attribution', 'hashtags', 'image',
  'platforms', 'formats', 'pillar', 'framework', 'template'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const TEXT_EXT = ['txt', 'md', 'json', 'csv'];


// Called by Import.html
function importFromDialog(payload) {
  ensureAll_();
  payload = payload || {};
  const S = settingsAll_(), F = formats_();
  const raws = [], notes = [], assets = {};
  if (payload.text && String(payload.text).trim()) parsedInto_(raws, notes, payload.text, 'Pasted text');
  (payload.files || []).forEach(function (f) {
    const blob = Utilities.newBlob(Utilities.base64Decode(f.b64), f.mime || 'application/octet-stream', f.name);
    ingestBlob_(blob, raws, notes, assets, S);
  });
  return commitImport_(raws, notes, assets, S, F);
}

// Called by Import.html after a successful import
function startBuild() { return buildAllQueued_(); }

function importInboxAndBuild() {
  ensureAll_();
  const S = settingsAll_(), F = formats_();
  if (!S.InboxFolderId) { alert_('Set InboxFolderId in the Settings tab (a Drive folder), drop your files in it, then run this again.'); return; }
  const inbox = DriveApp.getFolderById(extractId_(S.InboxFolderId));
  const raws = [], notes = [], assets = {}, handled = [];
  const it = inbox.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    try {
      if (f.getMimeType() === 'application/vnd.google-apps.document') {
        parsedInto_(raws, notes, DocumentApp.openById(f.getId()).getBody().getText(), f.getName());
      } else {
        ingestBlob_(f.getBlob().setName(f.getName()), raws, notes, assets, S);
      }
      handled.push(f);
    } catch (e) { notes.push(f.getName() + ': ' + (e.message || e)); }
  }
  if (!handled.length) { alert_('The Inbox folder is empty.'); return; }
  let summary;
  try { summary = commitImport_(raws, notes, assets, S, F); }
  catch (e) { alert_(String(e.message || e)); return; }
  const pf = inbox.getFoldersByName('Processed');
  const processed = pf.hasNext() ? pf.next() : inbox.createFolder('Processed');
  handled.forEach(function (f) { try { f.moveTo(processed); } catch (e) { /* ignore */ } });
  const msg = buildAllQueued_();
  alert_('Imported ' + summary.queued + ' post(s) into ' + summary.batchId + '.\n\n' + msg);
}

function buildPackNow() {
  ensureAll_();
  alert_(buildAllQueued_());
}

// ---------- Parsing ----------
function parsedInto_(raws, notes, text, source) {
  const found = parseText_(text, source);
  if (!found.length) notes.push(source + ': no posts found');
  found.forEach(function (r) { r._source = source; raws.push(r); });
}

function ingestBlob_(blob, raws, notes, assets, S) {
  const full = blob.getName() || '';
  const base = full.split('/').pop();
  if (!base || base.charAt(0) === '.' || full.indexOf('__MACOSX') > -1) return;
  const ext = ((base.match(/\.([A-Za-z0-9]+)$/) || [])[1] || '').toLowerCase();
  if (ext === 'zip') {
    Utilities.unzip(blob).forEach(function (inner) { ingestBlob_(inner, raws, notes, assets, S); });
  } else if (TEXT_EXT.indexOf(ext) > -1) {
    try { parsedInto_(raws, notes, blob.getDataAsString('UTF-8'), base); }
    catch (e) { notes.push(String(e.message || e)); }
  } else if (IMAGE_EXT.indexOf(ext) > -1) {
    saveAsset_(blob, base, assets, S);
  } else {
    notes.push('Skipped "' + base + '" (unsupported file type)');
  }
}

function parseText_(text, source) {
  const t = String(text).replace(/^\uFEFF/, '').trim();
  if (!t) return [];
  if (t.charAt(0) === '[' || t.charAt(0) === '{') {
    try { return parseJson_(t); } catch (e) { throw new Error(source + ': JSON could not be read (' + (e.message || e) + ')'); }
  }
  const first = t.split('\n')[0].toLowerCase();
  if (first.indexOf(',') > -1 && /(^|,)\s*"?hook"?\s*(,|$)/.test(first)) return parseCsvPosts_(t);
  return parsePlain_(t);
}

function parseJson_(t) {
  const obj = JSON.parse(t);
  const arr = Array.isArray(obj) ? obj : (obj.posts || obj.core_posts || [obj]);
  return arr.map(function (o) {
    const r = {};
    Object.keys(o || {}).forEach(function (k) { r[String(k).toLowerCase().trim()] = o[k]; });
    return r;
  });
}

function parseCsvPosts_(t) {
  const rows = Utilities.parseCsv(t);
  const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
  return rows.slice(1).filter(function (r) { return r.join('').trim(); }).map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

// Plain-text layout:  POST / Hook: ... / Points: / - one / - two / CTA: ... / --- between posts
function parsePlain_(t) {
  const blocks = t.replace(/\r/g, '').split(/^\s*-{3,}\s*$/m);
  const out = [];
  blocks.forEach(function (block) {
    if (!block.trim()) return;
    const post = {};
    let cur = null;
    block.split('\n').forEach(function (line) {
      const trimmed = line.trim();
      if (/^POST\b\s*\d*\s*$/i.test(trimmed)) return;
      const m = line.match(/^\s*([A-Za-z ]+?)\s*:\s*(.*)$/);
      if (m && FIELD_KEYS.indexOf(m[1].toLowerCase().trim()) > -1) {
        cur = m[1].toLowerCase().trim();
        if (cur === 'points') { post.points = []; if (m[2].trim()) post.points.push(m[2].trim()); }
        else post[cur] = m[2];
        return;
      }
      if (!cur || !trimmed) { if (cur === 'body' && post.body !== undefined) post.body += '\n'; return; }
      if (cur === 'points') {
        const pm = trimmed.match(/^(?:[-\u2022*]|\d+[.)])\s*(.+)$/);
        post.points.push(pm ? pm[1].trim() : trimmed);
      } else if (cur === 'body') {
        post.body += '\n' + trimmed;
      } else {
        post[cur] = (post[cur] ? post[cur] + ' ' : '') + trimmed;
      }
    });
    if (Object.keys(post).length) out.push(post);
  });
  return out;
}

function normalize_(raw) {
  const g = function (k) { return raw[k] === undefined || raw[k] === null ? '' : raw[k]; };
  const words = function (v) {
    const a = Array.isArray(v) ? v : String(v).split(/[\s,]+/);
    return a.map(function (x) { return str_(x); }).filter(Boolean);
  };
  let points = g('points');
  if (!Array.isArray(points)) points = String(points).split(/\n|\s\|\s/);
  points = points.map(function (p) { return str_(p).replace(/^(?:[-\u2022*]|\d+[.)])\s+/, ''); }).filter(Boolean);
  return {
    hook: str_(g('hook')), series: str_(g('series')), cta: str_(g('cta')), body: str_(g('body')).replace(/\n{3,}/g, '\n\n'),
    quote: str_(g('quote')), attribution: str_(g('attribution')), points: points,
    hashtags: words(g('hashtags')),
    platforms: words(g('platforms')).map(function (x) { return x.toLowerCase(); }),
    formats: words(g('formats')).map(function (x) { return x.toLowerCase(); }),
    image: str_(g('image')), imageFileId: '', template: str_(g('template')),
    pillar: str_(g('pillar')), framework: str_(g('framework'))
  };
}

function validate_(core, S) {
  const errors = [], warnings = [];
  const max = function (k) { return Number(S[k]) || 0; };
  if (!core.hook) errors.push('Hook is empty');
  else if (max('MaxHookChars') && core.hook.length > max('MaxHookChars')) errors.push('Hook is ' + core.hook.length + ' characters (max ' + max('MaxHookChars') + ')');
  core.points.forEach(function (p, i) {
    if (max('MaxPointChars') && p.length > max('MaxPointChars')) errors.push('Point ' + (i + 1) + ' is ' + p.length + ' characters (max ' + max('MaxPointChars') + ')');
  });
  if (max('MaxCTAChars') && core.cta.length > max('MaxCTAChars')) errors.push('CTA is ' + core.cta.length + ' characters (max ' + max('MaxCTAChars') + ')');
  if (max('MaxSeriesChars') && core.series.length > max('MaxSeriesChars')) errors.push('Series is ' + core.series.length + ' characters (max ' + max('MaxSeriesChars') + ')');
  core.platforms.forEach(function (p) { if (PLATFORM_KEYS.indexOf(p) === -1) errors.push('Unknown platform "' + p + '"'); });
  core.formats.forEach(function (f) { if (!FORMAT_DEFS[f]) errors.push('Unknown format "' + f + '"'); });
  const CAROUSELS = ['linkedin_carousel', 'instagram_carousel', 'facebook_multi'], TEXTS = ['linkedin_text', 'facebook_post'];
  const wants = function (list) { return !core.formats.length || core.formats.some(function (f) { return list.indexOf(f) > -1; }); };
  if (core.hook && core.points.length < 3 && wants(CAROUSELS)) warnings.push('Fewer than 3 points: carousel formats will be skipped');
  if (core.hook && !core.points.length && !core.body && wants(TEXTS)) warnings.push('No points or body: text posts will contain only the hook and CTA');
  if (core.image && !core.imageFileId) warnings.push('Image "' + core.image + '" was not found');
  return { errors: errors, warnings: warnings };
}

// ---------- Commit ----------
function commitImport_(raws, notes, assets, S, F) {
  if (!raws.length) throw new Error('No posts found. ' + notes.join(' '));
  const batchId = nextBatchId_(S);
  const rows = [], problems = [];
  let queued = 0, errored = 0, warned = 0;
  raws.forEach(function (raw, i) {
    const no = i + 1, id = batchId + '-' + pad2_(no);
    const core = normalize_(raw);
    if (core.image) core.imageFileId = findAsset_(core.image, assets, S);
    const v = validate_(core, S);
    const status = v.errors.length ? 'Error' : 'Queued';
    if (status === 'Queued') queued++; else errored++;
    if (v.warnings.length) warned++;
    const msgs = v.errors.concat(v.warnings);
    if (msgs.length) problems.push('#' + no + ' ' + (core.hook ? core.hook.slice(0, 40) : '(no hook)') + ': ' + msgs.join('; '));
    rows.push([batchId, no, status, id, safe_(core.hook), safe_(core.points.join('\n')), safe_(core.body), safe_(core.cta), safe_(core.series),
      safe_(core.quote), safe_(core.attribution), core.hashtags.join(' '), safe_(core.image), core.imageFileId,
      core.platforms.join(', '), core.formats.join(', '), safe_(core.template), safe_(core.pillar), safe_(core.framework),
      safe_(msgs.join(' | ')), '']);
  });
  const sh = sheet_(TAB.POSTS);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, POST_HEADERS.length).setValues(rows);
  return { batchId: batchId, found: raws.length, queued: queued, errored: errored, warned: warned,
    problems: problems.slice(0, 20), notes: notes.slice(0, 10) };
}

function nextBatchId_(S) {
  const lock = LockService.getUserLock(); lock.waitLock(10000);   // separate from the build lock so imports work during a build
  try {
    const p = PropertiesService.getScriptProperties(), n = Number(p.getProperty('batch_seq') || 0) + 1;
    p.setProperty('batch_seq', String(n));
    return (S.BatchPrefix || 'BATCH') + '-' + ('000' + n).slice(-4);
  } finally { lock.releaseLock(); }
}

// ---------- Image assets (from uploaded zips) ----------
function assetsFolder_(S) {
  const root = DriveApp.getFolderById(extractId_(S.OutputFolderId || settings_().OutputFolderId));
  const it = root.getFoldersByName('_assets');
  return it.hasNext() ? it.next() : root.createFolder('_assets');
}

function saveAsset_(blob, base, assets, S) {
  const folder = assetsFolder_(S);
  const old = folder.getFilesByName(base);
  while (old.hasNext()) old.next().setTrashed(true);
  const f = folder.createFile(blob.setName(base));
  assets[base.toLowerCase()] = f.getId();
}

function findAsset_(name, assets, S) {
  const key = String(name).split('/').pop().toLowerCase();
  if (assets[key]) return assets[key];
  try {
    const it = assetsFolder_(S).getFilesByName(String(name).split('/').pop());
    if (it.hasNext()) return it.next().getId();
  } catch (e) { /* ignore */ }
  return '';
}

function alert_(msg) {
  try { OS.ui().alert('Post Pack Builder', String(msg), OS.ui().ButtonSet.OK); }
  catch (e) { console.log(msg); }
}


/**
 * PACK: building batches, chunked processing, report, zip, email, sample pack.
 */

const MAIL_LIMIT_BYTES = 24 * 1024 * 1024;   // Gmail attachments are limited to about 25 MB

function makeCtx_(batchId, opts) {
  opts = opts || {};
  const S = settingsAll_();
  if (!templates_().length) createStarterTemplates_();
  const out = DriveApp.getFolderById(extractId_(S.OutputFolderId));
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  return {
    S: S, F: formats_(), T: templates_(), out: out, batchId: batchId, sample: !!opts.sample,
    root: opts.sample ? out.createFolder('SAMPLE_' + stamp) : subfolder_(out, batchId),
    work: subfolder_(out, '_work'), fcache: {}
  };
}

function rowToCore_(r, col) {
  const g = function (h) { return r[col[h]]; };
  const words = function (v) { return String(v || '').split(/[\s,]+/).map(str_).filter(Boolean); };
  return {
    batch: str_(g('Batch')), no: Number(g('No')) || 0, id: str_(g('ID')), hook: str_(g('Hook')),
    points: String(g('Points') || '').split('\n').map(str_).filter(Boolean), body: str_(g('Body')),
    cta: str_(g('CTA')), series: str_(g('Series')), quote: str_(g('Quote')), attribution: str_(g('Attribution')),
    hashtags: words(g('Hashtags')), image: str_(g('Image')), imageFileId: str_(g('ImageFileId')),
    platforms: words(g('Platforms')).map(function (x) { return x.toLowerCase(); }),
    formats: words(g('Formats')).map(function (x) { return x.toLowerCase(); }),
    template: str_(g('Template')), pillar: str_(g('Pillar')), framework: str_(g('Framework'))
  };
}

function postsData_() {
  const sh = sheet_(TAB.POSTS);
  const vals = sh.getLastRow() < 2 ? [POST_HEADERS] : sh.getDataRange().getValues();
  const col = {};
  vals[0].forEach(function (h, i) { col[h] = i; });
  return { sh: sh, vals: vals, col: col };
}

function queuedBatches_() {
  const d = postsData_(), seen = [];
  for (let r = 1; r < d.vals.length; r++) {
    if (String(d.vals[r][d.col.Status]).trim() === 'Queued') {
      const b = String(d.vals[r][d.col.Batch]).trim();
      if (b && seen.indexOf(b) === -1) seen.push(b);
    }
  }
  return seen;
}

// ---------- Build ----------
function buildAllQueued_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 'A build is already running. Wait for it to finish (you will get an email).';
  const start = Date.now(), msgs = [];
  try {
    ensureAll_();
    const batches = queuedBatches_();
    if (!batches.length) { removeContinueTriggers_(); return 'No Queued posts to build.'; }
    for (let i = 0; i < batches.length; i++) {
      const r = processBatch_(batches[i], start);
      msgs.push(r.message);
      if (r.timeUp) { scheduleContinue_(); return msgs.join('\n\n'); }
    }
    removeContinueTriggers_();
    return msgs.join('\n\n');
  } catch (e) {
    console.error(e);
    return 'Build stopped: ' + errMsg_(e);
  } finally {
    lock.releaseLock();
  }
}

function continueBuild() {
  removeContinueTriggers_();
  buildAllQueued_();
}

function scheduleContinue_() {
  removeContinueTriggers_();
  ScriptApp.newTrigger('pb_continueBuild').timeBased().after(60 * 1000).create();
}

function removeContinueTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pb_continueBuild') ScriptApp.deleteTrigger(t);
  });
}

function processBatch_(batchId, start) {
  const ctx = makeCtx_(batchId);
  const d = postsData_();
  const todo = [];
  for (let r = 1; r < d.vals.length; r++) {
    if (String(d.vals[r][d.col.Batch]).trim() === batchId && String(d.vals[r][d.col.Status]).trim() === 'Queued') todo.push(r);
  }
  let done = 0;
  for (let i = 0; i < todo.length; i++) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      return { timeUp: true, message: batchId + ': ' + done + ' post(s) built so far. The rest continues automatically in about a minute.' };
    }
    const r = todo[i];
    const core = rowToCore_(d.vals[r], d.col);
    let results;
    try { results = renderPost_(core, ctx); }
    catch (e) { results = [{ format: '(post)', status: 'Error', files: [], warnings: [], error: errMsg_(e) }]; }
    writePostResult_(d.sh, r + 1, d.col, results);
    appendLog_(results.map(function (x) {
      return [new Date(), batchId, core.id, x.format, x.status, x.files.join('; '), x.warnings.join('; '), x.error];
    }));
    done++;
  }
  return { timeUp: false, message: finalizeBatch_(ctx, batchId) };
}

function writePostResult_(sh, rowNum, col, results) {
  const ok = results.filter(function (x) { return x.status === 'OK'; }).length;
  const bad = results.filter(function (x) { return x.status === 'Error'; }).length;
  let status = 'Rendered';
  if (!results.length) status = 'Error';
  else if (bad === results.length) status = 'Error';
  else if (ok !== results.length) status = 'Partial';
  const notes = results.length ? results.map(function (x) {
    const m = [].concat(x.error ? ['ERROR ' + x.error] : [], x.warnings);
    return m.length ? x.format + ': ' + m.join('; ') : '';
  }).filter(Boolean).join(' | ') : 'No formats were requested or enabled for this post.';
  sh.getRange(rowNum, col.Status + 1).setValue(status);
  sh.getRange(rowNum, col.Notes + 1).setValue(safe_(notes.slice(0, 1500)));
  sh.getRange(rowNum, col['Rendered At'] + 1).setValue(new Date());
}

// ---------- Report, zip, email ----------
function csv_(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { return '"' + String(safe_(String(v == null ? '' : v))).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
}

function batchReportRows_(batchId) {
  const d = postsData_(), logSh = sheet_(TAB.LOG);
  const latest = {};
  if (logSh.getLastRow() > 1) {
    logSh.getRange(2, 1, logSh.getLastRow() - 1, LOG_HEADERS.length).getValues().forEach(function (r) {
      if (String(r[1]) === batchId) latest[r[2] + '|' + r[3]] = r;
    });
  }
  const rows = [['Post', 'Hook', 'Post status', 'Format', 'Format status', 'Files', 'Warnings', 'Error']];
  for (let i = 1; i < d.vals.length; i++) {
    const v = d.vals[i];
    if (String(v[d.col.Batch]).trim() !== batchId) continue;
    const id = String(v[d.col.ID]), st = String(v[d.col.Status]), hook = String(v[d.col.Hook]);
    const mine = Object.keys(latest).filter(function (k) { return k.indexOf(id + '|') === 0; });
    if (!mine.length) rows.push([id, hook, st, '', '', '', '', String(v[d.col.Notes])]);
    mine.forEach(function (k) { const r = latest[k]; rows.push([id, hook, st, r[3], r[4], r[5], r[6], r[7]]); });
  }
  return rows;
}

function readmeText_(batchId, rows, S) {
  const posts = {}; rows.slice(1).forEach(function (r) { posts[r[0]] = r[2]; });
  const ids = Object.keys(posts);
  const ok = ids.filter(function (k) { return posts[k] === 'Rendered'; }).length;
  return [
    'POST PACK ' + batchId,
    'Built ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy HH:mm') + ' for ' + (S.BrandName || ''),
    '',
    ids.length + ' core post(s): ' + ok + ' fully rendered, ' + (ids.length - ok) + ' with problems (see REPORT.csv).',
    '',
    'Layout: ' + (S.ZipLayout === 'by_post' ? 'one folder per core post' : 'folders linkedin / instagram / facebook'),
    '  *_caption.txt  = caption to paste next to the images / PDF',
    '  *_text.txt, *_post.txt = the full post copy',
    '  *.pdf          = LinkedIn carousel (upload as a Document post)',
    '  slide_01.png...= Instagram / Facebook slides, in order',
    '  *_card.png, *_post.png = single image posts',
    '',
    'Check every caption and image before posting. Hashtag counts and limits come from the Formats tab.'
  ].join('\n');
}

function listFiles_(folder, prefix, out) {
  const fs = folder.getFiles();
  while (fs.hasNext()) { const f = fs.next(); out.push({ file: f, path: prefix + f.getName(), size: f.getSize() }); }
  const ds = folder.getFolders();
  while (ds.hasNext()) { const d = ds.next(); listFiles_(d, prefix + d.getName() + '/', out); }
}

function finalizeBatch_(ctx, batchId) {
  const S = ctx.S, rows = batchReportRows_(batchId);
  saveFile_(ctx, [], 'REPORT.csv', Utilities.newBlob(csv_(rows), 'text/csv', 'REPORT.csv'));
  saveFile_(ctx, [], 'README.txt', Utilities.newBlob(readmeText_(batchId, rows, S), 'text/plain', 'README.txt'));

  const files = []; listFiles_(ctx.root, '', files);
  const limit = (Number(S.MaxZipMB) || 20) * 1024 * 1024;
  const groups = []; let cur = [], size = 0;
  files.forEach(function (f) {
    if (cur.length && size + f.size > limit) { groups.push(cur); cur = []; size = 0; }
    cur.push(f); size += f.size;
  });
  if (cur.length) groups.push(cur);

  const zips = []; let total = 0;
  groups.forEach(function (g, i) {
    const name = batchId + (groups.length > 1 ? '_part' + (i + 1) + 'of' + groups.length : '') + '.zip';
    const z = Utilities.zip(g.map(function (f) { return f.file.getBlob().setName(f.path); }), name);
    const old = ctx.out.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);
    const saved = ctx.out.createFile(z);
    total += saved.getSize();
    zips.push(saved);
  });

  const stats = emailPack_(batchId, rows, zips, total, ctx);
  return batchId + ': ' + stats.ok + ' of ' + stats.posts + ' post(s) fully rendered. Zip ' + (stats.attached ? 'emailed to ' : 'saved in Drive; link emailed to ') + stats.to + '.';
}

function emailPack_(batchId, rows, zips, total, ctx) {
  const S = ctx.S;
  const to = S.DeliveryEmail || Session.getEffectiveUser().getEmail();
  const posts = {}; rows.slice(1).forEach(function (r) { posts[r[0]] = r[2]; });
  const ids = Object.keys(posts);
  const ok = ids.filter(function (k) { return posts[k] === 'Rendered'; }).length;
  const issues = rows.slice(1).filter(function (r) { return r[4] !== 'OK' || r[6] || r[7]; }).slice(0, 15)
    .map(function (r) { return r[0] + (r[3] ? ' ' + r[3] : '') + ': ' + [r[7] ? 'ERROR ' + r[7] : '', r[6]].filter(Boolean).join(' / '); });
  const attach = total <= MAIL_LIMIT_BYTES;
  const links = zips.map(function (z) { return z.getName() + ': ' + z.getUrl(); });
  const body = [
    'Your post pack ' + batchId + ' is ready.',
    '', ok + ' of ' + ids.length + ' core post(s) fully rendered.',
    attach ? 'The zip is attached.' : 'The pack is too large to attach, so use the Drive links below.',
    '', 'Drive:', links.join('\n'), 'Folder: ' + ctx.root.getUrl(),
    issues.length ? '\nThings to check:\n- ' + issues.join('\n- ') : '\nNo problems reported.',
    '\nREPORT.csv inside the zip lists every file and warning.'
  ].join('\n');
  MailApp.sendEmail({
    to: to, subject: 'Post pack ' + batchId + ': ' + ok + ' of ' + ids.length + ' ready', body: body,
    attachments: attach ? zips.map(function (z) { return z.getBlob(); }) : []
  });
  return { ok: ok, posts: ids.length, attached: attach, to: to };
}

// ---------- Sample pack ----------
function sampleCores_() {
  const base = {
    batch: 'SAMPLE', image: '', imageFileId: '', template: '', pillar: 'Sample', framework: 'PAS', formats: [], platforms: [],
    body: '', quote: '', attribution: 'Sample owner, sample forum'
  };
  return [
    Object.assign({}, base, { no: 1, id: 'SAMPLE-01', series: 'Sample Series',
      hook: 'I lose a job every time I miss a call on the truck.',
      points: ['On the truck or in the attic, the phone rings and you cannot answer.', 'After hours, the caller tries the next company on the list.',
        'A voicemail that is returned late is often a lost job.', 'Busy season means more calls and fewer hands to answer them.', 'One missed call can be worth a whole day of work.'],
      cta: 'Save this for your next team meeting. Follow for more.', hashtags: ['#smallbusiness', '#tradesbusiness', '#customerservice'] }),
    Object.assign({}, base, { no: 2, id: 'SAMPLE-02', series: 'Sample Series',
      hook: 'A booking system that only works when you are at your desk is not a system.',
      points: ['Write down every way a customer can reach you.', 'Mark which of them you can answer during a job.', 'Fix the biggest gap first.'],
      cta: 'Which gap is yours? Tell us in the comments.', hashtags: [] })
  ];
}

function emailSamplePack() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { alert_('A build is running. Try again when it has finished.'); return; }
  try {
    ensureAll_();
    toast_('Building the sample pack. This takes about a minute...');
    const ctx = makeCtx_('SAMPLE', { sample: true });
    const rows = [['Post', 'Hook', 'Post status', 'Format', 'Format status', 'Files', 'Warnings', 'Error']];
    sampleCores_().forEach(function (core) {
      let results;
      try { results = renderPost_(core, ctx); } catch (e) { results = [{ format: '(post)', status: 'Error', files: [], warnings: [], error: errMsg_(e) }]; }
      results.forEach(function (x) { rows.push([core.id, core.hook, '', x.format, x.status, x.files.join('; '), x.warnings.join('; '), x.error]); });
    });
    saveFile_(ctx, [], 'REPORT.csv', Utilities.newBlob(csv_(rows), 'text/csv', 'REPORT.csv'));
    saveFile_(ctx, [], 'README.txt', Utilities.newBlob('SAMPLE PACK\nOne sample core post of each kind, rendered through your active templates.\nIf something looks wrong, edit the template and run this again.', 'text/plain', 'README.txt'));
    const files = []; listFiles_(ctx.root, '', files);
    const zip = Utilities.zip(files.map(function (f) { return f.file.getBlob().setName(f.path); }), 'SAMPLE_PACK.zip');
    const to = ctx.S.DeliveryEmail || Session.getEffectiveUser().getEmail();
    const problems = rows.slice(1).filter(function (r) { return r[4] !== 'OK' || r[6] || r[7]; })
      .map(function (r) { return r[0] + ' ' + r[3] + ': ' + [r[7] ? 'ERROR ' + r[7] : '', r[6]].filter(Boolean).join(' / '); });
    const small = zip.getBytes().length <= MAIL_LIMIT_BYTES;
    MailApp.sendEmail({
      to: to, subject: 'Post Pack Builder: sample pack',
      body: 'Your sample pack is attached' + (small ? '' : ' (too large, see Drive: ' + ctx.root.getUrl() + ')') + '.\n\n' +
        (problems.length ? 'Things to check:\n- ' + problems.join('\n- ') : 'No problems reported.') +
        '\n\nA typo in a {{tag}} shows up as raw text in the images. Fix the template and run this again.',
      attachments: small ? [zip] : []
    });
    if (small) ctx.root.setTrashed(true);
    toast_('Sample pack sent to ' + to + '.');
    alert_('Sample pack sent to ' + to + '.');
  } catch (e) {
    alert_('Sample pack failed: ' + errMsg_(e));
  } finally {
    lock.releaseLock();
  }
}


/**
 * RENDER: starter templates, tag filling, caption builders, per-post rendering.
 * Templates are Google Slides decks. Slide roles are detected from the tags they contain:
 *   {{slide_text}}  -> the repeatable content slide (cloned once per point)
 *   {{hook}}        -> cover   |   {{cta}} alone -> closing slide   |   {{quote}} -> card
 */

// ---------- Starter templates ----------
function createStarterTemplates() {
  ensureAll_();
  alert_(createStarterTemplates_().message);
}

function createStarterTemplates_() {
  const S = settingsAll_();
  const folder = subfolder_(DriveApp.getFolderById(extractId_(S.OutputFolderId)), 'Templates');
  const sh = sheet_(TAB.TEMPLATES);
  const have = templates_().map(function (t) { return t.name.toLowerCase(); });
  const start = Date.now();
  let made = 0, remaining = 0, unsized = 0;
  STYLES.forEach(function (style) {
    KINDS.forEach(function (kind) {
      const name = style + ' - ' + KIND_LABEL[kind];
      if (have.indexOf(name.toLowerCase()) !== -1) return;
      if (Date.now() - start > TIME_BUDGET_MS) { remaining++; return; }
      const d = createDeck_(name, kind, folder);
      const pres = SlidesApp.openById(d.id);
      layoutDeck_(pres, kind, style, S);
      pres.saveAndClose();
      const row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, 4).setValues([[name, d.id, kind, style]]);
      sh.getRange(row, 5).setFormula('=IF(B' + row + '="","",HYPERLINK("https://docs.google.com/presentation/d/"&REGEXEXTRACT(B' + row + ',"[-\\w]{25,}")&"/edit","Open"))');
      sh.getRange(row, 6).setValue(d.sized ? 'Starter template. Edit freely, keep the {{tags}}.'
        : 'Starter template, but created at 16:9. Set File > Page setup > Custom (8 x 10 in, or 8 x 8 for Square) and run "Rebuild layouts". ' + (d.error || ''));
      made++;
      if (!d.sized) unsized++;
    });
  });
  refreshDropdowns_();
  setDefaultActiveTemplates_();
  let msg = 'Created ' + made + ' starter template(s)' + (remaining ? '; ' + remaining + ' left, run this menu item again.' : '.');
  if (unsized) msg += '\n\nNote: ' + unsized + ' deck(s) could not be created at the right page size (is the Drive advanced service enabled?). See the Notes column in the Templates tab.';
  else if (made) msg += '\n\nNext: Post Pack Builder > Email me a sample pack, to see them filled in.';
  return { made: made, remaining: remaining, message: msg };
}

function createDeck_(name, kind, folder) {
  const seed = kind === 'card_square' ? SEED_SQUARE_B64 : SEED_PORTRAIT_B64;
  try {
    if (typeof Drive === 'undefined') throw new Error('Drive advanced service not enabled');
    const blob = Utilities.newBlob(Utilities.base64Decode(seed),
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', name + '.pptx');
    const f = Drive.Files.create({ name: name, mimeType: 'application/vnd.google-apps.presentation', parents: [folder.getId()] }, blob);
    return { id: f.id, sized: true };
  } catch (e) {
    const pres = SlidesApp.create(name);
    DriveApp.getFileById(pres.getId()).moveTo(folder);
    return { id: pres.getId(), sized: false, error: String(e.message || e) };
  }
}

function setDefaultActiveTemplates_() {
  const fSh = sheet_(TAB.FORMATS), tm = templates_();
  const col = FORMAT_HEADERS.indexOf('ActiveTemplate') + 1;
  const F = formats_();
  const keys = fSh.getRange(2, 1, Math.max(fSh.getLastRow() - 1, 1), 1).getValues();
  keys.forEach(function (r, i) {
    const k = String(r[0]).trim(), f = F[k];
    if (!f || f.ActiveTemplate || f.Kind === 'none') return;
    const pick = tm.filter(function (t) { return t.kind === f.Kind && t.style === 'Bold'; })[0] ||
      tm.filter(function (t) { return t.kind === f.Kind; })[0];
    if (pick) fSh.getRange(i + 2, col).setValue(pick.name);
  });
}

function rebuildStarterLayouts() {
  ensureAll_();
  const S = settingsAll_();
  let n = 0;
  templates_().forEach(function (t) {
    if (STYLES.indexOf(t.style) === -1 || KINDS.indexOf(t.kind) === -1) return;
    const pres = SlidesApp.openById(t.id);
    layoutDeck_(pres, t.kind, t.style, S);
    pres.saveAndClose();
    n++;
  });
  alert_('Redrew ' + n + ' starter template(s) using the current page size and the colors/fonts in Settings.');
}

function subfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---------- Starter layouts ----------
function hexOk_(h, d) { return /^#[0-9a-f]{6}$/i.test(String(h || '').trim()) ? String(h).trim() : d; }
function lum_(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function onColor_(hex) { return lum_(hex) < 0.55 ? '#FFFFFF' : '#111111'; }

function palette_(style, S) {
  const p = hexOk_(S.BrandColorPrimary, '#0F1B2D'), a = hexOk_(S.BrandColorAccent, '#F5A524');
  const bg = hexOk_(S.BrandColorBackground, '#FFFFFF'), tx = hexOk_(S.BrandColorText, '#1B2430');
  const head = S.FontHeading || 'Montserrat', body = S.FontBody || 'Roboto';
  if (style === 'Bold') {
    return { bg: p, fg: onColor_(p), muted: lum_(p) < 0.55 ? '#B8C4D6' : '#5D6877', accent: a, label: a, num: a, deco: 'bar',
      head: head, body: body, ctaBg: a, ctaFg: onColor_(a), ctaAccent: onColor_(a), ctaHandle: onColor_(a) };
  }
  if (style === 'Classic') {
    return { bg: bg, fg: p, muted: '#5D6877', accent: p, label: p, num: p, deco: 'rule',
      head: 'Georgia', body: 'Georgia', ctaBg: p, ctaFg: onColor_(p), ctaAccent: a, ctaHandle: a };
  }
  return { bg: bg, fg: tx, muted: '#6B7380', accent: a, label: '#6B7380', num: tx, deco: 'dot',
    head: head, body: body, ctaBg: bg, ctaFg: tx, ctaAccent: a, ctaHandle: tx };
}

function bg_(slide, color) { slide.getBackground().setSolidFill(color); }

function rect_(slide, l, t, w, h, color) {
  const r = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, l, t, w, h);
  r.getFill().setSolidFill(color); r.getBorder().setTransparent(); return r;
}

function txt_(slide, str, l, t, w, h, size, color, font, o) {
  o = o || {};
  const b = slide.insertTextBox(str, l, t, w, h);
  b.getText().getTextStyle().setFontFamily(font).setFontSize(size).setForegroundColor(color).setBold(!!o.bold);
  b.getText().getParagraphStyle().setParagraphAlignment(o.align || SlidesApp.ParagraphAlignment.START);
  b.setContentAlignment(o.valign || SlidesApp.ContentAlignment.TOP);
  return b;
}

function deco_(slide, pal, W, m, color) {
  if (pal.deco === 'bar') rect_(slide, m, m, W * 0.14, 8, color);
  else if (pal.deco === 'rule') rect_(slide, m, m + 8, W - 2 * m, 2, color);
  else {
    const d = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, m, m, 16, 16);
    d.getFill().setSolidFill(color); d.getBorder().setTransparent();
  }
}

function footer_(slide, pal, W, H, m, fg) {
  txt_(slide, '{{handle}}', m, H - m - 26, W * 0.5, 26, 15, fg, pal.body);
  txt_(slide, '{{logo}}', W - m - 90, H - m - 40, 90, 40, 12, fg, pal.body, { align: SlidesApp.ParagraphAlignment.END });
}

function layoutDeck_(pres, kind, style, S) {
  const need = kind === 'carousel' ? 3 : 1;
  const slides = pres.getSlides();
  slides.slice(1).forEach(function (s) { s.remove(); });
  const base = slides[0];
  base.getPageElements().forEach(function (e) { e.remove(); });
  const list = [base];
  for (let i = 1; i < need; i++) list.push(list[list.length - 1].duplicate());

  const W = pres.getPageWidth(), H = pres.getPageHeight(), m = W * 0.09, inner = W - 2 * m;
  const pal = palette_(style, S), V = SlidesApp.ContentAlignment.MIDDLE;
  const k = Math.min(1, H / 720);

  if (kind === 'carousel') {
    const cover = list[0];
    bg_(cover, pal.bg); deco_(cover, pal, W, m, pal.accent);
    txt_(cover, '{{series}}', m, m + 28, inner * 0.7, 26, 16, pal.label, pal.body, { bold: true });
    txt_(cover, '{{hook}}', m, H * 0.22, inner, H * 0.5, 46 * k, pal.fg, pal.head, { bold: true, valign: V });
    txt_(cover, 'Swipe \u2192', W - m - 160, H - m - 78, 160, 26, 16, pal.label, pal.body, { bold: true, align: SlidesApp.ParagraphAlignment.END });
    footer_(cover, pal, W, H, m, pal.muted);

    const c = list[1];
    bg_(c, pal.bg); deco_(c, pal, W, m, pal.accent);
    txt_(c, '{{slide_number}}', m, m + 26, W * 0.4, 64, 52, pal.num, pal.head, { bold: true });
    txt_(c, '{{slide_text}}', m, H * 0.30, inner, H * 0.48, 32 * k, pal.fg, pal.body);
    footer_(c, pal, W, H, m, pal.muted);

    const e = list[2];
    bg_(e, pal.ctaBg); deco_(e, pal, W, m, pal.ctaAccent);
    txt_(e, '{{cta}}', m, H * 0.26, inner, H * 0.34, 38 * k, pal.ctaFg, pal.head, { bold: true, valign: V });
    rect_(e, m, H * 0.64, W * 0.14, 8, pal.ctaAccent);
    txt_(e, '{{handle}}', m, H * 0.68, inner, 40, 26, pal.ctaHandle, pal.head, { bold: true });
    txt_(e, '{{logo}}', W - m - 90, H - m - 40, 90, 40, 12, pal.ctaFg, pal.body, { align: SlidesApp.ParagraphAlignment.END });
  } else {
    const s = list[0];
    bg_(s, pal.bg); deco_(s, pal, W, m, pal.accent);
    txt_(s, '{{series}}', m, m + 28, inner * 0.7, 26, 16, pal.label, pal.body, { bold: true });
    txt_(s, '\u201C', m, m + 44, W * 0.3, 140 * k, 120 * k, pal.accent, pal.head, { bold: true });
    txt_(s, '{{quote}}', m, H * 0.30, inner, H * 0.38, 40 * k, pal.fg, pal.head, { bold: true, valign: V });
    txt_(s, '{{attribution}}', m, H * 0.70, inner, 36, 18, pal.muted, pal.body);
    footer_(s, pal, W, H, m, pal.muted);
  }
}

// ---------- Filling a template ----------
const SCALE_BANDS = { hook: [60, 90], slide_text: [90, 130], cta: [50, 75], quote: [70, 110], attribution: [40, 55] };

function scale_(tag, len) {
  const b = SCALE_BANDS[tag];
  if (!b) return 1;
  return len <= b[0] ? 1 : (len <= b[1] ? 0.85 : 0.72);
}

function slideTags_(slide) {
  const out = [];
  slide.getShapes().forEach(function (sh) {
    try { (sh.getText().asString().match(/\{\{(\w+)\}\}/g) || []).forEach(function (t) { out.push(t.slice(2, -2)); }); } catch (e) { /* no text */ }
  });
  return out;
}

function logoBlob_(ctx) {
  if (ctx.logoLoaded) return ctx.logo;
  ctx.logoLoaded = true; ctx.logo = null;
  if (ctx.S.LogoFileId) {
    try { ctx.logo = DriveApp.getFileById(extractId_(ctx.S.LogoFileId)).getBlob(); }
    catch (e) { ctx.logoWarning = 'Logo file could not be opened; rendered without it.'; }
  }
  return ctx.logo;
}

function fillDeck_(pres, core, ctx) {
  const S = ctx.S, n = core.points.length, warnings = [];
  const base = {
    brand_name: S.BrandName, handle: S.Handle, series: core.series, hook: core.hook,
    cta: core.cta || S.DefaultCTA || '', quote: core.quote || core.hook, attribution: core.attribution,
    post_id: core.id, date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy'),
    footer_line: S.FooterLine, slide_total: String(n)
  };
  const media = { logo: logoBlob_(ctx), image: null };
  if (ctx.logoWarning) warnings.push(ctx.logoWarning);
  if (core.imageFileId) {
    try { media.image = DriveApp.getFileById(core.imageFileId).getBlob(); } catch (e) { warnings.push('Post image could not be opened.'); }
  }

  const jobs = [];
  let usedContent = false;
  pres.getSlides().forEach(function (slide) {
    const tags = slideTags_(slide);
    if (tags.indexOf('slide_text') > -1) {
      if (usedContent) { slide.remove(); warnings.push('Template has more than one {{slide_text}} slide; extras were removed.'); return; }
      usedContent = true;
      if (n === 0) { slide.remove(); return; }
      const clones = [slide];
      for (let i = 1; i < n; i++) clones.push(clones[clones.length - 1].duplicate());
      clones.forEach(function (s, i) { jobs.push({ slide: s, extra: { slide_text: core.points[i], slide_number: pad2_(i + 1) } }); });
    } else {
      if (tags.indexOf('cta') > -1 && !base.cta && tags.indexOf('hook') === -1 && tags.indexOf('quote') === -1) { slide.remove(); return; }
      jobs.push({ slide: slide, extra: {} });
    }
  });

  const left = {};
  jobs.forEach(function (j) {
    const vals = {};
    Object.keys(base).forEach(function (k) { vals[k] = base[k]; });
    Object.keys(j.extra).forEach(function (k) { vals[k] = j.extra[k]; });
    j.slide.getShapes().forEach(function (shape) { fillShape_(shape, vals, media, left); });
  });
  const stray = Object.keys(left);
  if (stray.length) warnings.push('Template still shows unknown tag(s) ' + stray.join(' ') + ' (typo in the template?)');
  return warnings;
}

function fillShape_(shape, vals, media, left) {
  let tr, raw;
  try { tr = shape.getText(); raw = tr.asString(); } catch (e) { return; }
  if (raw.indexOf('{{') === -1) return;
  const whole = raw.trim().match(/^\{\{(\w+)\}\}$/);
  if (whole && (whole[1] === 'logo' || whole[1] === 'image')) {
    const blob = media[whole[1]];
    if (blob) { try { shape.replaceWithImage(blob); } catch (e) { shape.remove(); } } else { shape.remove(); }
    return;
  }
  const size = tr.getTextStyle().getFontSize();
  (raw.match(/\{\{(\w+)\}\}/g) || []).forEach(function (tag) {
    const k = tag.slice(2, -2);
    if (Object.prototype.hasOwnProperty.call(vals, k)) tr.replaceAllText(tag, String(vals[k] == null ? '' : vals[k]));
  });
  if (whole && size && vals[whole[1]]) {
    const f = scale_(whole[1], String(vals[whole[1]]).length);
    if (f < 1) tr.getTextStyle().setFontSize(Math.round(size * f));
  }
  (tr.asString().match(/\{\{(\w+)\}\}/g) || []).forEach(function (t) { left[t] = true; });
}

function exportPngs_(presId) {
  if (typeof Slides === 'undefined') throw new Error('Slides advanced service is not enabled (see SETUP.md)');
  const pages = Slides.Presentations.get(presId).slides || [];
  return pages.map(function (p, i) {
    const th = Slides.Presentations.Pages.getThumbnail(presId, p.objectId,
      { 'thumbnailProperties.mimeType': 'PNG', 'thumbnailProperties.thumbnailSize': 'LARGE' });
    return UrlFetchApp.fetch(th.contentUrl).getBlob().setName('slide_' + pad2_(i + 1) + '.png');
  });
}

// ---------- Copy (captions) ----------
function hashtags_(core, fmt, S, warnings) {
  const own = core.hashtags && core.hashtags.length;
  let list = own ? core.hashtags : String(S.DefaultHashtags || '').split(/[\s,]+/).filter(Boolean);
  list = list.map(function (t) { return '#' + String(t).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''); })
    .filter(function (t) { return t.length > 1; });
  const limit = own ? fmt.HashtagMax : Math.min(fmt.HashtagDefault, fmt.HashtagMax || fmt.HashtagDefault);
  if (!fmt.HashtagMax && !fmt.HashtagDefault) return [];
  if (limit && list.length > limit) {
    if (own) warnings.push('Hashtags cut from ' + list.length + ' to ' + limit);
    list = list.slice(0, limit);
  }
  return list;
}

function buildCopy_(core, fkey, fmt, S) {
  const warnings = [];
  const cta = core.cta || S.DefaultCTA || '';
  const parts = [core.hook];
  if (fkey === 'linkedin_text') {
    if (core.body) parts.push(core.body); else if (core.points.length) parts.push(core.points.join('\n\n'));
    if (cta) parts.push(cta);
  } else if (fkey.indexOf('facebook') === 0) {
    if (core.body) parts.push(core.body);
    else if (core.points.length) parts.push(core.points.map(function (p) { return '\u2022 ' + p; }).join('\n'));
    if (cta) parts.push(cta);
    if (fmt.LinkLine) parts.push(fmt.LinkLine);
  } else {
    if (cta) parts.push(cta);
    if (fmt.LinkLine) parts.push(fmt.LinkLine);
  }
  const tags = hashtags_(core, fmt, S, warnings);
  if (tags.length) parts.push(tags.join(' '));
  const text = parts.join('\n\n');
  if (fmt.CaptionMax && text.length > fmt.CaptionMax) warnings.push('Copy is ' + text.length + ' characters (limit ' + fmt.CaptionMax + ')');
  if (fkey.indexOf('instagram') === 0 && core.hook.length > 125) warnings.push('Hook is over 125 characters and may be cut off in the feed');
  return { text: text, warnings: warnings };
}

// ---------- Rendering a post ----------
function errMsg_(e) { return String((e && e.message) || e); }

function outDir_(ctx, core, def) {
  return ctx.S.ZipLayout === 'by_post' ? [pad2_(core.no) + '_' + slug_(core.hook)] : [def.folder];
}
function outStem_(ctx, core, def) {
  return ctx.S.ZipLayout === 'by_post' ? def.folder + '_' + def.label : pad2_(core.no) + '_' + slug_(core.hook) + '_' + def.label;
}

function folderFor_(ctx, segs) {
  const key = segs.join('/');
  if (ctx.fcache[key]) return ctx.fcache[key];
  let f = ctx.root;
  segs.forEach(function (s) { const it = f.getFoldersByName(s); f = it.hasNext() ? it.next() : f.createFolder(s); });
  ctx.fcache[key] = f;
  return f;
}

function saveFile_(ctx, segs, name, blob) {
  const f = folderFor_(ctx, segs);
  const old = f.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  f.createFile(blob.setName(name));
  return segs.concat([name]).join('/');
}

// Remove files from an earlier render of the same post number so re-runs do not leave stale files.
function purgePost_(ctx, core) {
  const prefix = pad2_(core.no) + '_';
  const kids = ctx.root.getFolders();
  while (kids.hasNext()) {
    const f = kids.next();
    if (f.getName().indexOf(prefix) === 0) { f.setTrashed(true); continue; }
    const files = f.getFiles();
    while (files.hasNext()) { const x = files.next(); if (x.getName().indexOf(prefix) === 0) x.setTrashed(true); }
    const subs = f.getFolders();
    while (subs.hasNext()) { const s = subs.next(); if (s.getName().indexOf(prefix) === 0) s.setTrashed(true); }
  }
  ctx.fcache = {};
}

function requestedFormats_(core, ctx) {
  if (core.formats && core.formats.length) return Object.keys(FORMAT_DEFS).filter(function (k) { return core.formats.indexOf(k) > -1 && ctx.F[k]; });
  const plats = core.platforms && core.platforms.length ? core.platforms : PLATFORM_KEYS;
  return Object.keys(FORMAT_DEFS).filter(function (k) {
    return ctx.F[k] && ctx.F[k].Enabled && plats.indexOf(String(ctx.F[k].Platform).toLowerCase()) > -1;
  });
}

function resolveTemplate_(core, fmt, ctx) {
  if (core.template) {
    const t = ctx.T.filter(function (x) { return x.name.toLowerCase() === core.template.toLowerCase() && x.kind === fmt.Kind; })[0];
    if (t) return t;
  }
  if (!fmt.ActiveTemplate) {
    const any = ctx.T.filter(function (x) { return x.kind === fmt.Kind; })[0];
    if (!any) throw new Error('No template of kind "' + fmt.Kind + '" exists. Run Create starter templates.');
    return any;
  }
  const t = ctx.T.filter(function (x) { return x.name.toLowerCase() === fmt.ActiveTemplate.toLowerCase(); })[0];
  if (!t) throw new Error('Template "' + fmt.ActiveTemplate + '" is not in the Templates tab.');
  if (t.kind !== fmt.Kind) throw new Error('Template "' + t.name + '" is kind "' + t.kind + '" but this format needs "' + fmt.Kind + '".');
  return t;
}

function visual_(core, tmpl, ctx, cache, need) {
  let e = cache[tmpl.id];
  if (!e) {
    const copy = DriveApp.getFileById(tmpl.id).makeCopy('work_' + core.id + '_' + slug_(tmpl.name), ctx.work);
    e = cache[tmpl.id] = { copyId: copy.getId(), warnings: [], pdf: null, pngs: null };
    const pres = SlidesApp.openById(copy.getId());
    e.warnings = fillDeck_(pres, core, ctx);
    pres.saveAndClose();
  }
  if (need.pdf && !e.pdf) e.pdf = DriveApp.getFileById(e.copyId).getAs(MimeType.PDF);
  if (need.png && !e.pngs) e.pngs = exportPngs_(e.copyId);
  return e;
}

function renderFormat_(core, fkey, ctx, cache) {
  const fmt = ctx.F[fkey], def = FORMAT_DEFS[fkey], S = ctx.S;
  const res = { format: fkey, status: 'OK', files: [], warnings: [], error: '' };
  const dir = outDir_(ctx, core, def), stem = outStem_(ctx, core, def);
  let copyOk = true, visOk = true;

  try {
    const cap = buildCopy_(core, fkey, fmt, S);
    res.warnings = res.warnings.concat(cap.warnings);
    const name = stem + (def.copy === 'caption' ? '_caption' : '') + '.txt';
    res.files.push(saveFile_(ctx, dir, name, Utilities.newBlob(cap.text, 'text/plain', name)));
  } catch (e) { copyOk = false; res.error = 'Copy: ' + errMsg_(e); }

  if (fmt.Kind !== 'none') {
    try {
      if (fmt.Kind === 'carousel') {
        const n = core.points.length;
        if (n < 3) throw new Error('A carousel needs at least 3 points (this post has ' + n + ').');
        if (fmt.MaxSlides && n + 2 > fmt.MaxSlides) throw new Error(n + ' points + cover + CTA exceed the ' + fmt.MaxSlides + '-slide limit.');
      }
      const tmpl = resolveTemplate_(core, fmt, ctx);
      const needPdf = !!def.pdf;
      const needPng = def.png ? (def.pngOptional ? String(S.IncludePNGForLinkedIn).toUpperCase() === 'TRUE' : true) : false;
      const e = visual_(core, tmpl, ctx, cache, { pdf: needPdf, png: needPng });
      res.warnings = res.warnings.concat(e.warnings);
      if (needPdf) res.files.push(saveFile_(ctx, dir, stem + '.pdf', e.pdf));
      if (needPng) {
        if (def.png === 'single') res.files.push(saveFile_(ctx, dir, stem + '.png', e.pngs[0]));
        else e.pngs.forEach(function (b) { res.files.push(saveFile_(ctx, dir.concat([stem]), b.getName(), b)); });
      }
    } catch (e2) { visOk = false; res.error += (res.error ? ' | ' : '') + errMsg_(e2); }
  }
  res.status = copyOk && visOk ? 'OK' : (copyOk || visOk ? 'Partial' : 'Error');
  if (res.status === 'Partial' && !res.files.length) res.status = 'Error';
  return res;
}

function renderPost_(core, ctx) {
  purgePost_(ctx, core);
  const results = [], cache = {};
  try {
    requestedFormats_(core, ctx).forEach(function (fkey) { results.push(renderFormat_(core, fkey, ctx, cache)); });
  } finally {
    Object.keys(cache).forEach(function (k) { try { DriveApp.getFileById(cache[k].copyId).setTrashed(true); } catch (e) { /* ignore */ } });
  }
  return results;
}


/**
 * Seed.gs: two tiny blank .pptx files (one blank slide each) used only to create Google Slides decks
 * at the right page size. Slides cannot be resized by script, so new decks are born from these.
 * 4:5 portrait = 8 x 10 in, 1:1 square = 8 x 8 in. Do not edit.
 */
const SEED_PORTRAIT_B64 = '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';
const SEED_SQUARE_B64 = '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';


return { alert_, appendLog_, assetsFolder_, batchReportRows_, bg_, buildAllQueued_, buildCopy_, buildPackNow, commitImport_, continueBuild, createDeck_, createStarterTemplates, createStarterTemplates_, csv_, deco_, emailPack_, emailSamplePack, ensureAll_, ensureSheet_, errMsg_, existingKeys_, exportPngs_, extractId_, fillDeck_, fillShape_, finalizeBatch_, findAsset_, folderFor_, footer_, formats_, hashtags_, hexOk_, importFromDialog, importInboxAndBuild, ingestBlob_, layoutDeck_, listFiles_, logoBlob_, lum_, makeCtx_, nextBatchId_, normalize_, onColor_, onOpen, outDir_, outStem_, pad2_, palette_, parseCsvPosts_, parseJson_, parsePlain_, parseText_, parsedInto_, postsData_, processBatch_, purgePost_, queuedBatches_, readmeText_, rebuildStarterLayouts, rect_, refreshDropdown, refreshDropdowns, refreshDropdowns_, removeContinueTriggers_, renderFormat_, renderPost_, requestedFormats_, resolveTemplate_, rowToCore_, safe_, sampleCores_, saveAsset_, saveFile_, scale_, scheduleContinue_, setDefaultActiveTemplates_, setSetting_, settingsAll_, settings_, setup, sheet_, slideTags_, slug_, startBuild, str_, subfolder_, templates_, toast_, txt_, validate_, visual_, writePostResult_ };
})();
