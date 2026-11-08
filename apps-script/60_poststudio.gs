/* ===== module: poststudio (generated; edit the source modules, not this wrapper) ===== */
const PostStudio = (function () {
/**
 * Post Studio – Apps Script web app
 * Fills a Google Slides template (the image) and a Google Docs template (the caption sheet)
 * for each post you paste in, exports the slide as a PNG, and emails the images to your Gmail.
 *
 * Template placeholders (keep these in your templates, restyle everything else):
 *   {{POST}} {{POST_NUMBER}} {{ANGLE}} {{FRAMEWORK}} {{CTA_KEYWORD}} {{IMAGE_PROMPT}} {{BRAND}} {{DATE}}
 * In the Slides template, the main text box carries the alt-text title POST_BOX so its
 * font size can shrink for longer posts. Setup adds this for you.
 */

var P = PropertiesService.getScriptProperties();

// Slide size = 1080 x 1350 px (4:5) expressed in points (px x 0.75)
var SLIDE_W_PT = 810;
var SLIDE_H_PT = 1012.5;


/* ---------- configuration ---------- */

function getConfig() {
  var c = {
    slidesId: P.getProperty('SLIDES_ID') || '',
    docId: P.getProperty('DOC_ID') || '',
    folderId: P.getProperty('FOLDER_ID') || '',
    brand: P.getProperty('BRAND') || 'Your Business Name',
    email: Session.getEffectiveUser().getEmail()
  };
  c.slidesUrl = c.slidesId ? 'https://docs.google.com/presentation/d/' + c.slidesId + '/edit' : '';
  c.docUrl = c.docId ? 'https://docs.google.com/document/d/' + c.docId + '/edit' : '';
  c.folderUrl = c.folderId ? 'https://drive.google.com/drive/folders/' + c.folderId : '';
  return c;
}

function saveConfig(input) {
  if (input.slidesUrl !== undefined) {
    var s = extractId_(input.slidesUrl);
    if (s) P.setProperty('SLIDES_ID', s);
  }
  if (input.docUrl !== undefined) {
    var d = extractId_(input.docUrl);
    if (d) P.setProperty('DOC_ID', d);
  }
  if (input.brand) P.setProperty('BRAND', String(input.brand).slice(0, 60));
  return getConfig();
}

function extractId_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

/* ---------- template setup (run once from the web app, or from the editor) ---------- */

function setupTemplates() {
  var folder = ensureFolder_();
  if (!P.getProperty('SLIDES_ID')) P.setProperty('SLIDES_ID', createSlidesTemplate_(folder));
  if (!P.getProperty('DOC_ID')) P.setProperty('DOC_ID', createDocTemplate_(folder));
  return getConfig();
}

function ensureFolder_() {
  var id = P.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var f = DriveApp.createFolder('Post Studio');
  P.setProperty('FOLDER_ID', f.getId());
  return f;
}

function createSlidesTemplate_(folder) {
  var res = UrlFetchApp.fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      title: 'Post Studio – image template',
      pageSize: {
        width: { magnitude: SLIDE_W_PT, unit: 'PT' },
        height: { magnitude: SLIDE_H_PT, unit: 'PT' }
      }
    })
  });
  var id = JSON.parse(res.getContentText()).presentationId;
  var pres = SlidesApp.openById(id);
  var slide = pres.getSlides()[0];
  slide.getPageElements().forEach(function (e) { e.remove(); });
  slide.getBackground().setSolidFill('#0B3C49');

  // small angle label, top left
  addText_(slide, '{{ANGLE}}', 64, 84, 682, 44, 20, '#F2A33A', false, 'ANGLE_BOX', 'START');

  // accent bar
  var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 64, 140, 72, 6);
  bar.getFill().setSolidFill('#F2A33A');
  bar.getBorder().setTransparent();

  // main post text
  var box = addText_(slide, '{{POST}}', 64, 190, 682, 640, 40, '#FFFFFF', true, 'POST_BOX', 'START');
  box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);

  // footer
  addText_(slide, '{{BRAND}}', 64, 900, 480, 40, 20, '#F2A33A', true, 'BRAND_BOX', 'START');
  addText_(slide, 'Post {{POST_NUMBER}}', 546, 900, 200, 40, 18, '#9FB8C0', false, 'NUMBER_BOX', 'END');

  pres.saveAndClose();
  DriveApp.getFileById(id).moveTo(folder);
  return id;
}

function addText_(slide, text, x, y, w, h, size, color, bold, title, align) {
  var s = slide.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h);
  s.getText().setText(text);
  var st = s.getText().getTextStyle();
  st.setFontFamily('Montserrat').setFontSize(size).setForegroundColor(color).setBold(bold);
  s.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment[align]);
  s.setTitle(title);
  return s;
}

function createDocTemplate_(folder) {
  var doc = DocumentApp.create('Post Studio – caption sheet template');
  var body = doc.getBody();
  body.clear();
  body.appendParagraph('Post {{POST_NUMBER}}').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Angle: {{ANGLE}}');
  body.appendParagraph('Framework: {{FRAMEWORK}}');
  body.appendParagraph('Reply keyword: {{CTA_KEYWORD}}');
  body.appendParagraph('Created: {{DATE}}   |   {{BRAND}}');
  body.appendParagraph('Caption').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('{{POST}}');
  body.appendParagraph('Image prompt').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('{{IMAGE_PROMPT}}');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc.getId();
}

/* ---------- generate one post ---------- */

function processPost(post, opts) {
  opts = opts || {};
  var cfg = getConfig();
  if (!cfg.slidesId) throw new Error('No Slides template yet. Create the starter templates first.');
  var folder = ensureFolder_();
  var num = Number(post.n) || 0;
  var label = 'Post-' + ('000' + num).slice(-3);
  var text = String(post.text || '').trim();
  if (!text) throw new Error('Post ' + num + ' is empty.');

  var kw = (text.match(/Reply\s+[‘'"“]([^’'"”]+)[’'"”]/i) || [])[1] || '';
  var vars = {
    POST: text,
    POST_NUMBER: String(num),
    ANGLE: post.angle || '',
    FRAMEWORK: post.framework || '',
    CTA_KEYWORD: kw,
    IMAGE_PROMPT: post.prompt || '',
    BRAND: cfg.brand,
    DATE: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy')
  };

  // 1) Slides copy -> PNG
  var copy = DriveApp.getFileById(cfg.slidesId).makeCopy(label + ' (slide)', folder);
  var pres = SlidesApp.openById(copy.getId());
  Object.keys(vars).forEach(function (k) { pres.replaceAllText('{{' + k + '}}', vars[k]); });
  var slide = pres.getSlides()[0];
  var pageId = slide.getObjectId();
  var size = fontSizeFor_(text.length);
  slide.getPageElements().forEach(function (e) {
    if (e.getTitle() === 'POST_BOX') {
      e.asShape().getText().getTextStyle().setFontSize(size);
    }
  });
  pres.saveAndClose();
  Utilities.sleep(400);

  var thumbUrl = 'https://slides.googleapis.com/v1/presentations/' + copy.getId() + '/pages/' + pageId +
    '/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE';
  var meta = JSON.parse(UrlFetchApp.fetch(thumbUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getContentText());
  var png = UrlFetchApp.fetch(meta.contentUrl).getBlob().setName(label + '.png');
  var pngFile = folder.createFile(png);
  if (!opts.keepSlides) copy.setTrashed(true);

  // 2) Docs copy (caption sheet)
  var docUrl = '';
  if (opts.makeDocs && cfg.docId) {
    var dcopy = DriveApp.getFileById(cfg.docId).makeCopy(label + ' (caption)', folder);
    var d = DocumentApp.openById(dcopy.getId());
    var b = d.getBody();
    Object.keys(vars).forEach(function (k) {
      b.replaceText('\\{\\{' + k + '\\}\\}', vars[k]);
    });
    d.saveAndClose();
    docUrl = dcopy.getUrl();
  }

  return { n: num, text: text, angle: vars.ANGLE, pngId: pngFile.getId(), docUrl: docUrl };
}

function fontSizeFor_(len) {
  if (len <= 110) return 54;
  if (len <= 180) return 46;
  if (len <= 260) return 40;
  if (len <= 360) return 34;
  return 28;
}

/* ---------- email a batch of finished posts to yourself ---------- */

function emailChunk(items, label) {
  if (!items || !items.length) return { sent: 0 };
  var to = Session.getEffectiveUser().getEmail();
  var blobs = [];
  var inline = {};
  var html = '<div style="font-family:Arial,sans-serif;max-width:640px">';
  items.forEach(function (it, i) {
    var blob = DriveApp.getFileById(it.pngId).getBlob();
    blobs.push(blob);
    inline['img' + i] = blob;
    html += '<h3 style="margin:24px 0 6px">Post ' + it.n + (it.angle ? ' · ' + esc_(it.angle) : '') + '</h3>' +
      '<img src="cid:img' + i + '" style="width:100%;max-width:480px;border-radius:6px" alt="Post ' + it.n + '">' +
      '<p style="white-space:pre-wrap;margin:10px 0">' + esc_(it.text) + '</p>' +
      (it.docUrl ? '<p style="margin:0"><a href="' + it.docUrl + '">Open caption sheet</a></p>' : '') +
      '<hr style="border:none;border-top:1px solid #ddd;margin-top:20px">';
  });
  html += '</div>';
  MailApp.sendEmail({
    to: to,
    subject: 'Post Studio: ' + (label || (items.length + ' posts')),
    htmlBody: html,
    attachments: blobs,
    inlineImages: inline,
    name: 'Post Studio'
  });
  return { sent: items.length, to: to };
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


return { addText_, createDocTemplate_, createSlidesTemplate_, emailChunk, ensureFolder_, esc_, extractId_, fontSizeFor_, getConfig, processPost, saveConfig, setupTemplates };
})();
