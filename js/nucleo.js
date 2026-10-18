// Despensa · utilidades compartidas por los módulos (usa los globales de index.html: supa, currentUser, PR, prAmbito, showToast…)
var DS = { perfiles: null };

function dsAmb() { return String(prAmbito()); }

// Pide a Claude (vía /api/claude) una respuesta en JSON y la devuelve como objeto
async function iaJSON(prompt, maxTokens) {
  var r = await fetch('/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: maxTokens || 1500, messages: [{ role: 'user', content: prompt }] })
  });
  var d = await r.json();
  if (!r.ok) throw new Error(d.error && d.error.message ? d.error.message : 'HTTP ' + r.status);
  var raw = (d.content || []).map(function(c) { return c.text || ''; }).join('').replace(/```json|```/g, '').trim();
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

// Modal en el estilo de la app; devuelve el fondo para buscar elementos dentro
function dsModal(html, ancho) {
  var bg = document.createElement('div');
  bg.className = 'pr-modal-bg';
  bg.innerHTML = '<div class="pr-modal" style="max-width:' + (ancho || 560) + 'px">' + html + '</div>';
  bg.addEventListener('click', function(e) { if (e.target === bg || (e.target.closest && e.target.closest('[data-x]'))) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}
function dsCargando(txt) { return dsModal('<h3>' + txt + '</h3><div class="lbar" style="margin:18px 0"><div class="lbarf"></div></div><p class="sub">Esto toma unos segundos.</p>', 420); }

// Lunes a domingo de la semana (offset 0 = esta semana), en ISO
function dsSemana(offset) {
  var d = new Date(); d.setHours(12, 0, 0, 0);
  var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + 7 * (offset || 0));
  var out = []; for (var i = 0; i < 7; i++) { var x = new Date(d); x.setDate(d.getDate() + i); out.push(prISO(x)); }
  return out;
}

// Catálogo de recetas conocidas (recetario + planificador) con su proteína
function dsRecetas() {
  var m = {};
  (typeof ALL_RECIPES !== 'undefined' ? ALL_RECIPES : []).forEach(function(r) { m[r.n] = { n: r.n, proteina: r.proteina, claves: r.ingredientes_clave || [], img: r.img }; });
  (typeof PL !== 'undefined' ? PL : []).forEach(function(p) { if (!m[p.n]) m[p.n] = { n: p.n, proteina: null, claves: [], img: p.img }; });
  return Object.keys(m).sort().map(function(k) { return m[k]; });
}
function dsProteina(nombre) {
  var r = dsRecetas().find(function(x) { return x.n.toLowerCase() === String(nombre).toLowerCase(); });
  if (r && r.proteina) return r.proteina;
  var t = String(nombre).toLowerCase();
  if (/pollo|gallina|ají de gallina|aji de gallina/.test(t)) return 'pollo';
  if (/res|lomo|seco|carne|bistec|asado|olluquito/.test(t)) return 'res';
  if (/pescado|ceviche|sudado|chicharrón de pescado|bonito|jurel/.test(t)) return 'pescado';
  if (/cerdo|chancho|adobo/.test(t)) return 'cerdo';
  if (/marisco|langostino|choros|calamar/.test(t)) return 'mariscos';
  if (/menestra|lenteja|frejol|garbanzo|quinua|tortilla|verdura/.test(t)) return 'vegetal';
  return null;
}

// Perfiles de la familia (alergias, no come, lonchera)
async function dsPerfiles(forzar) {
  if (!currentUser) return [];
  if (DS.perfiles && !forzar) return DS.perfiles;
  var r = await supa.from('cs_perfiles').select('*').eq('ambito', dsAmb()).order('created_at');
  DS.perfiles = r.error ? [] : (r.data || []);
  return DS.perfiles;
}
function dsResumenFamilia() {
  return (DS.perfiles || []).map(function(p) {
    return p.nombre + (p.edad ? ' (' + p.edad + ' años)' : '') + (p.alergias ? ', alergia a ' + p.alergias : '') + (p.no_come ? ', no come ' + p.no_come : '') + (p.lonchera ? ', lleva lonchera' : '');
  }).join('; ');
}
function dsInventarioTexto() {
  return (PR.rows || []).map(function(r) { return r.nombre + ' (' + prNombreAp(r.ubicacion) + ', ' + prTotal(r) + ' envases, vence ' + (r.vence || '?') + ')'; }).join('; ');
}
// Advierte si una receta choca con alergias o "no come" de alguien
function dsAvisoFamilia(nombre, texto) {
  var t = (nombre + ' ' + (texto || '')).toLowerCase(), avisos = [];
  (DS.perfiles || []).forEach(function(p) {
    [['alergias', 'es alérgico/a a'], ['no_come', 'no come']].forEach(function(k) {
      String(p[k[0]] || '').split(/,|;| y /).map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean).forEach(function(w) {
        if (w.length > 2 && t.indexOf(w) >= 0) avisos.push(p.nombre + ' ' + k[1] + ' ' + w);
      });
    });
  });
  return avisos;
}

// Igual que iaJSON pero con una foto (base64 JPEG)
async function iaVision(b64, prompt, maxTokens) {
  var r = await fetch('/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: maxTokens || 2500, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: prompt }] }] })
  });
  var d = await r.json();
  if (!r.ok) throw new Error(d.error && d.error.message ? d.error.message : 'HTTP ' + r.status);
  var raw = (d.content || []).map(function(c) { return c.text || ''; }).join('').replace(/```json|```/g, '').trim();
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}
// Abre la cámara o la galería y devuelve el archivo elegido
function dsElegirFoto() {
  return new Promise(function(ok) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
    i.onchange = function() { ok(i.files && i.files[0]); }; i.click();
  });
}
// Carga un script de cdnjs/unpkg una sola vez
function dsScript(src, integrity) {
  return new Promise(function(ok, ko) { if (document.querySelector('script[src="' + src + '"]')) return ok(); var s = document.createElement('script'); s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; } s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
