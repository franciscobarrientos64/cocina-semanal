// Despensa · idioma: si eliges inglés (Ajustes → Idioma), traduce la interfaz en vivo con js/i18n-en.json.
// Frases exactas primero; luego frases largas dentro de textos armados (las palabras cortas solo si el texto es exacto).
(function() {
  var lang = 'es';
  try { lang = localStorage.getItem('cs_lang') || 'es'; } catch (e) {}
  if (lang !== 'en') return;
  document.documentElement.lang = 'en';
  var DIC = null, RE = null, orig = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  var esc = function(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  function trad(s) {
    if (!s || !/[a-záéíóúñ¿¡]/i.test(s)) return s;
    var t = s.trim(); if (!t) return s;
    if (DIC[t]) return s.replace(t, DIC[t]);
    return RE ? s.replace(RE, function(m) { return DIC[m] || m; }) : s;
  }
  function nodo(n) {
    if (n.nodeType === 3) {
      var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(p.nodeName) || p.closest && p.closest('[data-no-trad], .ms')) return;
      var v = n.nodeValue, base = orig.get(n);
      if (base === undefined || (v !== base.t)) { var tr = trad(v); if (tr !== v) { orig.set(n, { t: tr }); n.nodeValue = tr; } }
      return;
    }
    if (n.nodeType !== 1) return;
    ATTRS.forEach(function(a) { var v = n.getAttribute && n.getAttribute(a); if (v) { var tr = trad(v); if (tr !== v) n.setAttribute(a, tr); } });
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) n.value = trad(n.value);
    for (var c = n.firstChild; c; c = c.nextSibling) nodo(c);
  }
  var pendiente = false;
  var obs = new MutationObserver(function(ms) {
    if (!DIC) return;
    obs.disconnect();
    ms.forEach(function(m) { if (m.type === 'characterData') nodo(m.target); else m.addedNodes.forEach(nodo); if (m.type === 'attributes') nodo(m.target); });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  });
  fetch('/js/i18n-en.json').then(function(r) { return r.json(); }).then(function(d) {
    DIC = d;
    var largas = Object.keys(d).filter(function(k) { return k.length >= 6 && /\s|[a-záéíóúñ]{6,}/i.test(k); }).sort(function(a, b) { return b.length - a.length; });
    RE = new RegExp('(?<![\\p{L}\\p{N}])(?:' + largas.map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'gu');
    if (window.I18N) I18N.en = Object.assign({}, I18N.en, d);
    if (window.FAM) FAM.lang = 'en';
    document.title = trad(document.title);
    nodo(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }).catch(function() {});
})();
