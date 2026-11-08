/**
 * COGWELL PLATFORM - shared runtime (loads first).
 * Every module (core, platform, invoicing, linkqueue, scoreboard, poststudio, packbuilder) talks to the
 * outside world only through this object: who is signed in, which spreadsheet is theirs, script properties.
 */
var OS = (function () {
  var ctx = null; // { email, role } of the signed-in person for the current call

  // A chainable do-nothing stand-in for SpreadsheetApp.getUi(): menus and alerts do not exist in a web app.
  var BS = { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO', YES: 'YES', NO: 'NO', CANCEL: 'CANCEL' };
  var noop = new Proxy(function () {}, {
    get: function (t, k) { return (k === 'ButtonSet' || k === 'Button') ? BS : noop; },
    apply: function () { return noop; }
  });

  // Two modules both used a property called SHEET_ID. Give each its own so they can live in one project.
  function props(ns) {
    var P = PropertiesService.getScriptProperties();
    var key = function (k) { return k === 'SHEET_ID' ? ns + '_SHEET_ID' : k; };
    return {
      getProperty: function (k) { return P.getProperty(key(k)); },
      setProperty: function (k, v) { return P.setProperty(key(k), v); },
      deleteProperty: function (k) { return P.deleteProperty(key(k)); },
      getProperties: function () { return P.getProperties(); }
    };
  }

  // The spreadsheet that belongs to a module (replaces "the sheet this script is attached to").
  function ss(mod) {
    var P = PropertiesService.getScriptProperties(), k = 'SS_' + String(mod).toUpperCase(), id = P.getProperty(k);
    if (id) return SpreadsheetApp.openById(id);
    var made = SpreadsheetApp.create('Cogwell OS - ' + mod);
    P.setProperty(k, made.getId());
    return made;
  }

  return {
    props: props,
    ss: ss,
    ui: function () { return noop; },
    set: function (c) { ctx = c || null; },
    email: function () { return ctx ? ctx.email : ''; },
    role: function () { return ctx ? ctx.role : ''; },
    need: function (roles) {
      if (!ctx) throw new Error('Not signed in');
      if (roles.indexOf(ctx.role) < 0) throw new Error('Not allowed for your role');
    },
    mod: function (n) { return mods_()[n]; }
  };
})();
