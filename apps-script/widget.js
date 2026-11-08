/* Chat widget. Host on any static site (e.g. GitHub Pages) and include with:
 * <script src="widget.js" data-endpoint="https://script.google.com/macros/s/.../exec" data-tenant="T123"></script> */
(function () {
  var s = document.currentScript, ep = s.dataset.endpoint, tenant = s.dataset.tenant;
  var sid = sessionStorage.getItem('cw') || (sessionStorage.setItem('cw', Math.random().toString(36).slice(2)), sessionStorage.getItem('cw'));
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;width:300px;max-width:calc(100vw - 32px);font:14px system-ui,sans-serif;background:#fff;color:#0f2347;border:1px solid #d9e3f5;border-radius:20px;box-shadow:0 4px 18px rgba(0,0,0,.18);z-index:99999';
  box.innerHTML = '<div id="cwl" style="height:220px;overflow:auto;padding:10px"></div><div style="display:flex;border-top:1px solid #d9e3f5"><input id="cwi" placeholder="Type a message" style="flex:1;border:0;padding:10px;font:inherit"><button id="cwb" style="border:0;background:#0f2347;color:#f7f9ff;padding:0 18px;border-radius:9999px;margin:6px;cursor:pointer">Send</button></div><div style="font-size:11px;padding:4px 10px;color:#5d6b88">AI assistant. Your details are used to contact you about your enquiry.</div>';
  document.body.appendChild(box);
  var log = box.querySelector('#cwl'), inp = box.querySelector('#cwi');
  function add(who, t) { var d = document.createElement('div'); d.style.cssText = 'margin:6px 0;padding:8px 12px;border-radius:14px;max-width:85%;' + (who === 'me' ? 'margin-left:auto;background:#6ea8ff;color:#0f2347;' : 'background:#eef3fc;'); d.style.textAlign = who === 'me' ? 'right' : 'left'; d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  function send() {
    var m = inp.value.trim(); if (!m) return; engaged = true; inp.value = ''; add('me', m);
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'chat', tenant: tenant, session: sid, message: m }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (r.ok && r.data.reply === null) return; add('bot', r.ok ? r.data.reply : 'Sorry, something went wrong. Please try again.'); })
      .catch(function () { add('bot', 'Connection problem. Please try again.'); });
  }
  box.querySelector('#cwb').onclick = send;
  inp.onkeydown = function (e) { if (e.key === 'Enter') send(); };
  add('bot', 'Hi! How can we help?');
  var engaged = false, since = 0, ns = Number(s.dataset.nudge || 0); // data-nudge="20" shows a prompt after 20 seconds
  if (ns) setTimeout(function () { if (!engaged) add('bot', s.dataset.nudgeText || 'Need a quote? Ask me anything.'); }, ns * 1000);
  ['Get a quote', 'Emergency repair', 'Book a visit'].forEach(function (q) { var b = document.createElement('button'); b.textContent = q; b.style.cssText = 'margin:2px;padding:5px 12px;border:1px solid #d9e3f5;background:#eef3fc;color:#0f2347;border-radius:9999px;cursor:pointer'; b.onclick = function () { inp.value = q; send(); }; log.appendChild(b); });
  setInterval(function () {
    if (!engaged) return;
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'poll', session: sid, since: since }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (r.ok) r.data.forEach(function (m) { since = Math.max(since, m.ts); add('bot', m.text); }); })
      .catch(function () {});
  }, 8000);
})();
