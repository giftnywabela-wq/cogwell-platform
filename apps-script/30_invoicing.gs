/* ===== module: invoicing (generated; edit the source modules, not this wrapper) ===== */
const Invoicing = (function () {
/**
 * COGWELL INVOICING TOOL
 * Container-bound to a Google Sheet (Extensions > Apps Script).
 * Files: Code.gs, Admin.html, Client.html
 *
 * Flow:
 *  - Admin page (web app URL, passcode) -> build an invoice, create a prefilled client link,
 *    or generate straight away. Every invoice is logged in the "Invoices" sheet.
 *  - Client page (web app URL + ?d=TOKEN) -> client checks/edits billing details,
 *    clicks "Confirm & generate", invoice number is assigned, PDF is made, logged and emailed.
 */

const CFG = {
  BUSINESS: {
    name: 'Cogwell Solutions',
    phones: ['+27 77 402 7640', '+27 63 436 7856'],
    email: 'giftnywabela@gmail.com'
  },
  BANK: {
    accountName: 'Cogwell Solutions',
    bank: 'Capitec Bank',
    accountNumber: '2596786083',
    branchCode: '470010'
  },
  LAST_USED_NUMBER: 24,            // INV-0024 was the last invoice sent; next one will be INV-0025
  DEFAULT_DEPOSIT_PCT: 50,         // 0 or 100 = single payment
  DEFAULT_NOTES: ['The domain name price and hosting bill are separate and are not included in this invoice.'],
  WHEN: {
    deposit: 'Required to continue with the project',
    balance: 'On completion, before the site goes live',
    full: 'Payable in full on receipt of this invoice'
  },
  FOOTER: 'Cogwell Solutions  |  Thank you for your business',
  COLORS: { green: '#1b6bff', navy: '#1F3A5F', light: '#F5F6FA', totalBg: '#E8F5D0' },
  EMAIL_CLIENT_ON_GENERATE: true,  // email the PDF to the client when they generate it from their link
  FOLDER_NAME: 'Cogwell Invoices',
  INV_SHEET: 'Invoices',
  CAT_SHEET: 'Catalogue'
};

const INV_HEADERS = ['Token', 'InvoiceNo', 'Status', 'CreatedAt', 'GeneratedAt', 'SentAt', 'PaidAt',
  'ClientName', 'ClientPhone', 'ClientEmail', 'ClientAddress', 'Items', 'Notes', 'DepositPct',
  'Total', 'Deposit', 'Balance', 'PdfFileId', 'PdfUrl'];
const CAT_HEADERS = ['Key', 'Name', 'Category', 'Price', 'Recurring', 'Description', 'ScopeTitle', 'Scope', 'ScopeNote'];
const STATUSES = ['Draft', 'Generated', 'Sent', 'Deposit Paid', 'Paid'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ───────────── Menu & setup ───────────── */

function onOpen() {
  OS.ui().createMenu('Cogwell')
    .addItem('1. Run setup', 'setup')
    .addItem('2. Set admin passcode', 'setPasscode')
    .addItem('3. Set logo (Drive file ID)', 'setLogo')
    .addItem('Show web app link', 'showLink')
    .addToUi();
}

function setup() {
  const ss = OS.ss('invoicing');

  let inv = ss.getSheetByName(CFG.INV_SHEET) || ss.insertSheet(CFG.INV_SHEET);
  if (inv.getLastRow() === 0) {
    inv.appendRow(INV_HEADERS);
    inv.setFrozenRows(1);
    inv.getRange(1, 1, 1, INV_HEADERS.length).setFontWeight('bold').setBackground(CFG.COLORS.navy).setFontColor('#ffffff');
    inv.getRange(2, 1, inv.getMaxRows() - 1, 13).setNumberFormat('@'); // keep dates, phones, JSON as text
  }

  let cat = ss.getSheetByName(CFG.CAT_SHEET) || ss.insertSheet(CFG.CAT_SHEET);
  if (cat.getLastRow() === 0) {
    cat.appendRow(CAT_HEADERS);
    cat.setFrozenRows(1);
    cat.getRange(1, 1, 1, CAT_HEADERS.length).setFontWeight('bold').setBackground(CFG.COLORS.navy).setFontColor('#ffffff');
    const seed = catalogueSeed_();
    cat.getRange(2, 1, seed.length, CAT_HEADERS.length).setValues(seed);
    cat.getRange(2, 8, seed.length, 1).setWrap(true);
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LAST_NO')) props.setProperty('LAST_NO', String(CFG.LAST_USED_NUMBER));
  folder_();

  try { OS.ui().alert('Setup done. Next: Cogwell > Set admin passcode, then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).'); } catch (e) {}
}

function setPasscode() {
  const ui = OS.ui();
  const r = ui.prompt('Admin passcode', 'Choose a passcode for the admin page:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSCODE', r.getResponseText().trim());
  ui.alert('Passcode saved.');
}

function setLogo() {
  const ui = OS.ui();
  const r = ui.prompt('Logo', 'Paste the Google Drive file ID of your logo (PNG/JPG). Leave empty to use a text wordmark.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('LOGO_FILE_ID', r.getResponseText().trim());
  ui.alert('Saved.');
}

function showLink() {
  OS.ui().alert('Web app link:\n\n' + (ScriptApp.getService().getUrl() || 'Deploy as a web app first.'));
}

function catalogueSeed_() {
  const webScope = ['Up to 10 pages with a dedicated page per service', 'Mobile-responsive design', 'Quote request form with photo upload',
    'Click-to-call and WhatsApp buttons', 'Tools page with estimate calculator', 'Phone numbers and email leads captured to a Google Sheet',
    'Project gallery with before/after sliders', 'Embedded Google Map and service area section', 'Testimonials, certifications and licences section',
    'Google Analytics setup', 'SSL certificate, POPIA privacy policy and cookie notice'];
  const basic = ['1 automation workflow', 'Basic AI chatbot or automated response system', 'Lead capture', 'WhatsApp OR email automation',
    'Google Sheets/database connection', 'Testing and launch', '7 days post-launch support', 'Basic monthly monitoring and maintenance on the managed plan'];
  const standard = ['Up to 3 automation workflows', 'AI-powered chatbot', 'WhatsApp automation', 'Lead capture and management', 'Automatic follow-up messages',
    'Email automation', 'Basic appointment/booking automation', 'Basic reporting and monthly maintenance', 'Priority support on the managed plan'];
  const pro = ['Up to 7 automation workflows', 'Advanced AI chatbot/assistant', 'WhatsApp lead qualification', 'Automated customer follow-ups',
    'Booking system and CRM integration', 'AI-generated customer responses', 'Lead scoring and automated reminders',
    'Dashboard/reporting and monthly optimisation', 'Priority support, monitoring and maintenance'];
  const premium = ['Custom AI automation system', 'Unlimited* automation workflows', 'AI sales/customer-service agent', 'Lead qualification and scoring',
    'Automated sales follow-ups and CRM integration', 'Booking and appointment automation', 'Email/SMS/WhatsApp workflows',
    'AI document processing and AI-generated reports', 'Custom dashboard and business-specific AI knowledge base',
    'Analytics, continuous optimisation and priority support'];
  const managed = 'Hosting and automation management, monitoring, maintenance, support, AI/API usage allowances and optimisation. Billed monthly at ';
  const third = 'Prices exclude third-party platform charges (WhatsApp Business API, AI/API usage, CRM subscriptions), which may be billed separately.';
  return [
    ['web-pro', 'Professional Website Package', 'Website', 4999.99, false, 'Standard price R4,999.99. Delivery in 3 weeks.', 'Professional Package Scope', webScope.join('\n'), 'Central dashboard is not included in this package.'],
    ['web-care', 'Monthly Care Plan', 'Website', 700, true, 'Hosting management, backups, updates and small edits. Billed monthly at R700.', '', '', ''],
    ['web-gbp', 'Google Business Profile Setup and Optimisation', 'Website', 850, false, 'Once-off.', '', '', ''],
    ['auto-basic', 'Basic Automation Package (setup)', 'Automation', 1500, false, 'Once-off setup.', 'Basic Package Scope', basic.join('\n'), third],
    ['auto-basic-m', 'Basic Managed Service', 'Automation', 499, true, managed + 'R499.', '', '', ''],
    ['auto-standard', 'Standard Automation Package (setup)', 'Automation', 3500, false, 'Once-off setup.', 'Standard Package Scope', standard.join('\n'), third],
    ['auto-standard-m', 'Standard Managed Service', 'Automation', 999, true, managed + 'R999.', '', '', ''],
    ['auto-pro', 'Professional Automation Package (setup)', 'Automation', 7500, false, 'Once-off setup.', 'Professional Package Scope', pro.join('\n'), third],
    ['auto-pro-m', 'Professional Managed Service', 'Automation', 1999, true, managed + 'R1,999.', '', '', ''],
    ['auto-premium', 'Premium Automation Package (custom)', 'Automation', 0, false, 'Custom setup, quoted to fit the business. Enter the agreed price.', 'Premium Package Scope', premium.join('\n'), third + ' Unlimited workflows are subject to fair use.'],
    ['svc-crm', 'CRM Automation', 'Individual service', 3000, false, 'Starting price.', '', '', ''],
    ['svc-ai-agent', 'AI Customer Service Agent', 'Individual service', 5000, false, 'Starting price.', '', '', ''],
    ['svc-full', 'Full Business Automation', 'Individual service', 10000, false, 'Starting price.', '', '', '']
  ];
}

/* ───────────── Web app entry ───────────── */


/* ───────────── Admin API (passcode protected) ───────────── */

function auth_(pass) { OS.need(['owner']); } // the shared Cogwell sign-in replaces the old admin passcode

function adminBootstrap(pass) {
  auth_(pass);
  return Object.assign(state_(), {
    catalogue: getCatalogue_(),
    defaults: { depositPct: CFG.DEFAULT_DEPOSIT_PCT, notes: CFG.DEFAULT_NOTES }
  });
}

function adminSave(pass, p, generateNow) {
  auth_(pass);
  const items = cleanItems_(p.items);
  if (!items.length) throw new Error('Add at least one line item.');
  const name = str_(p.client && p.client.name, 120);
  if (!name) throw new Error('Client name is required.');
  const pct = Math.min(100, Math.max(0, Number(p.depositPct) || 0));
  const inv = {
    token: Utilities.getUuid().replace(/-/g, ''),
    status: 'Draft',
    created: now_(),
    client: {
      name: name,
      phone: str_(p.client.phone, 40),
      email: str_(p.client.email, 120),
      address: str_(p.client.address, 300)
    },
    items: items,
    notes: (p.notes || []).map(function (n) { return str_(n, 400); }).filter(String),
    depositPct: pct
  };
  Object.assign(inv, calc_(items, pct));
  save_(inv);
  if (generateNow) generate_(inv.token);
  return { token: inv.token, state: state_() };
}

function adminGenerate(pass, token) {
  auth_(pass);
  generate_(token);
  return state_();
}

function adminEmail(pass, token) {
  auth_(pass);
  const inv = generate_(token);
  emailInvoice_(inv);
  patch_(token, function (i) { markSent_(i); });
  return state_();
}

function adminSetStatus(pass, token, status) {
  auth_(pass);
  if (STATUSES.indexOf(status) < 1) throw new Error('Invalid status.');
  patch_(token, function (i) {
    if (!i.invoiceNo) throw new Error('Generate the invoice first.');
    i.status = status;
    if (status === 'Sent') { if (!i.sent) i.sent = now_(); }
    if (status === 'Paid' || status === 'Deposit Paid') { if (!i.sent) i.sent = now_(); i.paid = now_(); }
  });
  return state_();
}

function adminDelete(pass, token) {
  auth_(pass);
  const r = rows_().filter(function (x) { return x.Token === token; })[0];
  if (!r) throw new Error('Not found.');
  if (r.InvoiceNo) throw new Error('Only drafts (links not yet generated) can be deleted.');
  sheet_(CFG.INV_SHEET).deleteRow(r._row);
  return state_();
}

/* ───────────── Client API (token only) ───────────── */

function getDraft(token) {
  return view_(findInv_(token));
}

function clientGenerate(token, d) {
  let inv = findInv_(token);
  if (!inv.invoiceNo) {
    const name = str_(d && d.name, 120);
    if (!name) throw new Error('Please enter your name or business name.');
    const email = str_(d.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address does not look right.');
    inv.client = { name: name, phone: str_(d.phone, 40), email: email, address: str_(d.address, 300) };
    save_(inv);
    inv = generate_(token);
    try {
      if (CFG.EMAIL_CLIENT_ON_GENERATE && inv.client.email) {
        emailInvoice_(inv);
        inv = patch_(token, function (i) { markSent_(i); });
      }
      MailApp.sendEmail(CFG.BUSINESS.email, 'Invoice ' + inv.invoiceNo + ' generated by ' + inv.client.name,
        inv.client.name + ' confirmed their details and generated ' + inv.invoiceNo + ' (' + money_(inv.total) + ').\n' + inv.pdfUrl);
    } catch (x) { /* email problems must not block the client */ }
  }
  return view_(inv);
}

function clientPdf(token) {
  const inv = findInv_(token);
  if (!inv.invoiceNo) throw new Error('Invoice not generated yet.');
  let blob;
  try { blob = DriveApp.getFileById(inv.pdfFileId).getBlob(); } catch (e) { blob = pdf_(inv); }
  return { name: pdfName_(inv), b64: Utilities.base64Encode(blob.getBytes()) };
}

/* ───────────── Generation ───────────── */

function generate_(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = rows_().filter(function (x) { return x.Token === token; })[0];
    if (!r) throw new Error('Invoice not found.');
    const inv = toInv_(r);
    if (inv.invoiceNo) return inv;
    const props = PropertiesService.getScriptProperties();
    const next = Number(props.getProperty('LAST_NO') || CFG.LAST_USED_NUMBER) + 1;
    inv.invoiceNo = 'INV-' + ('0000' + next).slice(-4);
    inv.status = 'Generated';
    inv.generated = now_();
    const file = folder_().createFile(pdf_(inv));
    inv.pdfFileId = file.getId();
    inv.pdfUrl = file.getUrl();
    save_(inv);
    props.setProperty('LAST_NO', String(next));
    return inv;
  } finally {
    lock.releaseLock();
  }
}

function markSent_(inv) {
  if (!inv.sent) inv.sent = now_();
  if (inv.status === 'Generated') inv.status = 'Sent';
}

function emailInvoice_(inv) {
  if (!inv.client.email) throw new Error('This invoice has no client email.');
  let blob;
  try { blob = DriveApp.getFileById(inv.pdfFileId).getBlob(); } catch (e) { blob = pdf_(inv); }
  blob.setName(pdfName_(inv));
  const B = CFG.BUSINESS;
  const body = 'Hi ' + inv.client.name + ',\n\nPlease find invoice ' + inv.invoiceNo + ' attached (total ' + money_(inv.total) + ').\n' +
    'Banking details and the payment reference are on the invoice.\n\nKind regards,\n' + B.name + '\n' + B.phones[0] + '\n' + B.email;
  MailApp.sendEmail(inv.client.email, 'Invoice ' + inv.invoiceNo + ' from ' + B.name, body,
    { name: B.name, replyTo: B.email, attachments: [blob] });
}

function pdfName_(inv) { return inv.invoiceNo + ' - ' + inv.client.name.replace(/[\\/:*?"<>|]/g, '') + '.pdf'; }

function pdf_(inv) {
  return Utilities.newBlob(invoiceHtml_(inv), 'text/html', 'invoice.html').getAs('application/pdf').setName(pdfName_(inv));
}

/* ───────────── Invoice layout (mirrors INV-0024) ───────────── */

function invoiceHtml_(inv) {
  const c = CFG.COLORS, B = CFG.BUSINESS, K = CFG.BANK;
  const e = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); };
  const font = 'font-family:Arial,Helvetica,sans-serif;';

  let logo = '<span style="' + font + 'font-size:30px;font-weight:bold;color:' + c.green + ';letter-spacing:4px;">COGWELL</span>';
  const logoId = PropertiesService.getScriptProperties().getProperty('LOGO_FILE_ID');
  if (logoId) {
    try {
      const lb = DriveApp.getFileById(logoId).getBlob();
      logo = '<img src="data:' + lb.getContentType() + ';base64,' + Utilities.base64Encode(lb.getBytes()) + '" height="70">';
    } catch (x) {}
  }

  const label = function (t) { return '<div style="' + font + 'font-size:11px;font-weight:bold;color:' + c.green + ';text-transform:uppercase;margin-bottom:4px;">' + t + '</div>'; };
  const h2 = function (t) { return '<div style="' + font + 'font-size:16px;font-weight:bold;font-style:italic;color:' + c.navy + ';margin:18px 0 6px 0;">' + e(t) + '</div>'; };

  const itemRows = inv.items.map(function (it, i) {
    return '<tr style="background:' + (i % 2 ? c.light : '#ffffff') + ';">' +
      '<td style="' + font + 'padding:9px 10px;font-size:12px;"><b>' + e(it.name) + '</b>' + (it.desc ? '<br><span style="font-size:11px;">' + e(it.desc) + '</span>' : '') + '</td>' +
      '<td align="right" style="' + font + 'padding:9px 10px;font-size:12px;white-space:nowrap;">' + money_(it.amount) + '</td></tr>';
  }).join('');

  let scope = '';
  inv.items.forEach(function (it) {
    if (!it.scope || !it.scope.length) return;
    const half = Math.ceil(it.scope.length / 2);
    const ul = function (arr) { return '<ul style="' + font + 'font-size:11px;margin:0;padding-left:16px;">' + arr.map(function (s) { return '<li style="margin-bottom:3px;">' + e(s) + '</li>'; }).join('') + '</ul>'; };
    scope += h2(it.scopeTitle || (it.name + ' Scope')) +
      '<table width="100%" cellspacing="0" cellpadding="0"><tr><td valign="top" width="50%">' + ul(it.scope.slice(0, half)) + '</td><td valign="top" width="50%">' + ul(it.scope.slice(half)) + '</td></tr></table>' +
      (it.scopeNote ? '<div style="' + font + 'font-size:11px;font-style:italic;margin-top:4px;">' + e(it.scopeNote) + '</div>' : '');
  });

  const single = inv.depositPct <= 0 || inv.depositPct >= 100;
  const payRow = function (a, b, d, bg) {
    return '<tr style="background:' + bg + ';"><td style="' + font + 'padding:9px 10px;font-size:12px;font-weight:bold;">' + a + '</td><td style="' + font + 'padding:9px 10px;font-size:12px;">' + e(b) + '</td><td align="right" style="' + font + 'padding:9px 10px;font-size:12px;font-weight:bold;">' + money_(d) + '</td></tr>';
  };
  const payRows = single
    ? payRow('100% payment', inv.depositPct >= 100 ? CFG.WHEN.full : CFG.WHEN.balance, inv.total, '#ffffff')
    : payRow(inv.depositPct + '% deposit', CFG.WHEN.deposit, inv.deposit, '#ffffff') + payRow((100 - inv.depositPct) + '% balance', CFG.WHEN.balance, inv.balance, c.light);

  const bankRow = function (a, b, bg) {
    return '<tr style="background:' + bg + ';"><td width="40%" style="' + font + 'padding:8px 10px;font-size:12px;">' + a + '</td><td style="' + font + 'padding:8px 10px;font-size:12px;font-weight:bold;">' + e(b) + '</td></tr>';
  };

  const clientLines = [inv.client.phone, inv.client.email, inv.client.address].filter(String).map(e).join('<br>');
  const notes = (inv.notes || []).length ? h2('Notes') + '<ul style="' + font + 'font-size:11px;margin:0;padding-left:16px;">' + inv.notes.map(function (n) { return '<li>' + e(n) + '</li>'; }).join('') + '</ul>' : '';

  return '<html><body style="margin:0;padding:24px 30px;' + font + 'color:#111111;">' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border-bottom:3px solid ' + c.green + ';"><tr><td valign="middle" style="padding-bottom:12px;">' + logo + '</td>' +
    '<td align="right" valign="middle" style="' + font + 'font-size:34px;font-weight:bold;color:' + c.navy + ';padding-bottom:12px;">INVOICE</td></tr></table>' +

    '<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;"><tr>' +
    '<td valign="top" width="33%" style="' + font + 'font-size:12px;">' + label('From') + '<b>' + e(B.name) + '</b><br>' + B.phones.map(e).join('<br>') + '<br>' + e(B.email) + '</td>' +
    '<td valign="top" width="33%" style="' + font + 'font-size:12px;">' + label('Bill to') + '<b>' + e(inv.client.name) + '</b><br>' + clientLines + '</td>' +
    '<td valign="top" width="34%" style="' + font + 'font-size:12px;">' + label('Invoice details') + '<b>Invoice no:</b> ' + e(inv.invoiceNo) + '<br><b>Date:</b> ' + longDate_(inv.generated) + '<br><b>Currency:</b> South African Rand (ZAR)</td>' +
    '</tr></table>' +

    '<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;"><tr>' +
    '<td style="background:' + c.navy + ';color:#ffffff;' + font + 'font-size:11px;font-weight:bold;padding:9px 10px;">DESCRIPTION</td>' +
    '<td align="right" style="background:' + c.navy + ';color:#ffffff;' + font + 'font-size:11px;font-weight:bold;padding:9px 10px;">AMOUNT</td></tr>' +
    itemRows +
    '<tr style="background:' + c.totalBg + ';border-top:2px solid ' + c.green + ';"><td style="' + font + 'padding:9px 10px;font-size:12px;font-weight:bold;">TOTAL</td><td align="right" style="' + font + 'padding:9px 10px;font-size:12px;font-weight:bold;">' + money_(inv.total) + '</td></tr></table>' +

    scope +

    h2('Payment Schedule') +
    '<table width="100%" cellspacing="0" cellpadding="0"><tr>' +
    '<td style="background:' + c.green + ';color:' + c.navy + ';' + font + 'font-size:11px;font-weight:bold;padding:8px 10px;">PAYMENT</td>' +
    '<td style="background:' + c.green + ';color:' + c.navy + ';' + font + 'font-size:11px;font-weight:bold;padding:8px 10px;">WHEN</td>' +
    '<td align="right" style="background:' + c.green + ';color:' + c.navy + ';' + font + 'font-size:11px;font-weight:bold;padding:8px 10px;">AMOUNT</td></tr>' + payRows + '</table>' +

    notes +

    h2('Banking Details') +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ' + c.green + ';">' +
    bankRow('Account name', K.accountName, '#ffffff') + bankRow('Bank', K.bank, c.light) + bankRow('Account number', K.accountNumber, '#ffffff') +
    bankRow('Branch code', K.branchCode, c.light) + bankRow('Payment reference', inv.invoiceNo, '#ffffff') + '</table>' +

    '<div align="center" style="' + font + 'font-size:10px;color:#888888;margin-top:30px;">' + e(CFG.FOOTER) + '</div>' +
    '</body></html>';
}

/* ───────────── Data helpers ───────────── */

function sheet_(n) {
  const s = OS.ss('invoicing').getSheetByName(n);
  if (!s) throw new Error('Run Cogwell > Run setup first.');
  return s;
}

function folder_() {
  const it = DriveApp.getFoldersByName(CFG.FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.FOLDER_NAME);
}

function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

function longDate_(s) {
  const p = String(s || now_()).slice(0, 10).split('-').map(Number);
  return p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
}

function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

function money_(n) {
  const neg = n < 0;
  return (neg ? '-' : '') + 'R' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calc_(items, pct) {
  const cents = items.reduce(function (s, it) { return s + Math.round(Number(it.amount || 0) * 100); }, 0);
  const dep = (pct <= 0 || pct >= 100) ? (pct >= 100 ? cents : 0) : Math.round(cents * pct / 100);
  return { total: cents / 100, deposit: dep / 100, balance: (cents - dep) / 100 };
}

function cleanItems_(items) {
  return (items || []).map(function (it) {
    return {
      name: str_(it.name, 160),
      desc: str_(it.desc, 400),
      amount: Math.round(Number(it.amount || 0) * 100) / 100,
      scopeTitle: str_(it.scopeTitle, 120),
      scope: (it.scope || []).map(function (s) { return str_(s, 200); }).filter(String),
      scopeNote: str_(it.scopeNote, 400)
    };
  }).filter(function (it) { return it.name; });
}

function rows_() {
  const sh = sheet_(CFG.INV_SHEET), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, INV_HEADERS.length).getValues().map(function (v, i) {
    const o = { _row: i + 2 };
    INV_HEADERS.forEach(function (h, j) { o[h] = v[j]; });
    return o;
  });
}

function toInv_(r) {
  return {
    token: String(r.Token), invoiceNo: String(r.InvoiceNo || ''), status: String(r.Status),
    created: String(r.CreatedAt || ''), generated: String(r.GeneratedAt || ''), sent: String(r.SentAt || ''), paid: String(r.PaidAt || ''),
    client: { name: String(r.ClientName), phone: String(r.ClientPhone || ''), email: String(r.ClientEmail || ''), address: String(r.ClientAddress || '') },
    items: JSON.parse(r.Items || '[]'), notes: JSON.parse(r.Notes || '[]'),
    depositPct: Number(r.DepositPct), total: Number(r.Total), deposit: Number(r.Deposit), balance: Number(r.Balance),
    pdfFileId: String(r.PdfFileId || ''), pdfUrl: String(r.PdfUrl || '')
  };
}

function rowArr_(i) {
  return [i.token, i.invoiceNo || '', i.status, i.created || '', i.generated || '', i.sent || '', i.paid || '',
    i.client.name, i.client.phone, i.client.email, i.client.address, JSON.stringify(i.items), JSON.stringify(i.notes || []),
    i.depositPct, i.total, i.deposit, i.balance, i.pdfFileId || '', i.pdfUrl || ''];
}

function save_(inv) {
  const sh = sheet_(CFG.INV_SHEET);
  const r = rows_().filter(function (x) { return x.Token === inv.token; })[0];
  const arr = rowArr_(inv);
  if (r) sh.getRange(r._row, 1, 1, arr.length).setValues([arr]);
  else sh.appendRow(arr);
}

function findInv_(token) {
  const r = rows_().filter(function (x) { return x.Token === String(token); })[0];
  if (!r) throw new Error('This link is not valid.');
  return toInv_(r);
}

function patch_(token, fn) {
  const inv = findInv_(token);
  fn(inv);
  save_(inv);
  return inv;
}

function view_(inv) {
  return {
    invoiceNo: inv.invoiceNo, status: inv.status, client: inv.client,
    items: inv.items.map(function (i) { return { name: i.name, desc: i.desc, amount: i.amount }; }),
    total: inv.total, deposit: inv.deposit, balance: inv.balance, depositPct: inv.depositPct,
    date: inv.generated ? longDate_(inv.generated) : ''
  };
}

function getCatalogue_() {
  const sh = sheet_(CFG.CAT_SHEET), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, CAT_HEADERS.length).getValues().filter(function (r) { return r[1]; }).map(function (r) {
    return {
      key: String(r[0]), name: String(r[1]), category: String(r[2]), price: Number(r[3]) || 0,
      recurring: r[4] === true || String(r[4]).toUpperCase() === 'TRUE',
      desc: String(r[5] || ''), scopeTitle: String(r[6] || ''),
      scope: String(r[7] || '').split('\n').map(function (s) { return s.trim(); }).filter(String),
      scopeNote: String(r[8] || '')
    };
  });
}

function state_() {
  const list = rows_().map(toInv_).reverse(); // newest first
  return { invoices: list, stats: stats_(list), webAppUrl: ScriptApp.getService().getUrl() };
}

function stats_(list) {
  const month = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const gen = list.filter(function (i) { return i.invoiceNo; });
  const r2 = function (n) { return Math.round(n * 100) / 100; };
  const invoiced = gen.reduce(function (s, i) { return s + i.total; }, 0);
  const collected = gen.reduce(function (s, i) { return s + (i.status === 'Paid' ? i.total : i.status === 'Deposit Paid' ? i.deposit : 0); }, 0);
  return {
    generated: gen.length,
    sent: gen.filter(function (i) { return i.sent; }).length,
    thisMonth: gen.filter(function (i) { return i.generated.slice(0, 7) === month; }).length,
    pendingLinks: list.length - gen.length,
    invoiced: r2(invoiced), collected: r2(collected), outstanding: r2(invoiced - collected),
    lastNo: 'INV-' + ('0000' + (PropertiesService.getScriptProperties().getProperty('LAST_NO') || CFG.LAST_USED_NUMBER)).slice(-4)
  };
}


return { adminBootstrap, adminDelete, adminEmail, adminGenerate, adminSave, adminSetStatus, auth_, calc_, catalogueSeed_, cleanItems_, clientGenerate, clientPdf, emailInvoice_, findInv_, folder_, generate_, getCatalogue_, getDraft, invoiceHtml_, longDate_, markSent_, money_, now_, onOpen, patch_, pdfName_, pdf_, rowArr_, rows_, save_, setLogo, setPasscode, setup, sheet_, showLink, state_, stats_, str_, toInv_, view_ };
})();
