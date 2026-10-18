// Despensa · MODO COCINA (paso a paso grande, temporizadores, varias recetas a la vez), escalar porciones y perfiles de la familia
var CO = { recetas: [], act: 0, paso: {}, timers: [], lock: null };

function openCocina(nombres) {
  nombres = (nombres || []).filter(Boolean);
  if (!nombres.length) return;
  CO.recetas = nombres; CO.act = 0; CO.paso = {};
  var ov = document.getElementById('co-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'co-ov'; ov.className = 'co-ov'; document.body.appendChild(ov); }
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l) { CO.lock = l; }, function() {}); } catch (e) {}
  coPintar();
}
function coCerrar() {
  var ov = document.getElementById('co-ov'); if (ov) ov.hidden = true;
  document.body.style.overflow = '';
  if (CO.lock) { try { CO.lock.release(); } catch (e) {} CO.lock = null; }
}
function coPasos(n) { var r = getRecipe(n) || {}; return (r.pasos && r.pasos.length) ? r.pasos : [{ titulo: n, ingredientes: '', metodo: 'Esta receta todavía no tiene pasos guardados.' }]; }
function coTiempo(txt) { var m = String(txt || '').match(/(\d+)(?:\s*(?:a|-)\s*\d+)?\s*(min|minutos|hora|horas)\b/i); return m ? (+m[1]) * (/hora/i.test(m[2]) ? 60 : 1) : 0; }
function coPintar() {
  var ov = document.getElementById('co-ov'), n = CO.recetas[CO.act], pasos = coPasos(n), i = CO.paso[n] || 0, p = pasos[i], min = coTiempo(p.metodo);
  var avisos = typeof dsAvisoFamilia === 'function' ? dsAvisoFamilia(n, pasos.map(function(x) { return x.ingredientes; }).join(' ')) : [];
  ov.innerHTML = '<div class="co-top"><div class="co-tabs">' + CO.recetas.map(function(r, k) { return '<button class="' + (k === CO.act ? 'on' : '') + '" onclick="CO.act=' + k + ';coPintar()">' + prEsc(r) + '</button>'; }).join('')
      + '<button class="co-mas" onclick="coOtra()" aria-label="Agregar otra receta"><span class="ms">add</span></button></div>'
      + '<div class="co-timers" id="co-timers"></div><button class="co-x" onclick="coCerrar()" aria-label="Cerrar modo cocina"><span class="ms">close</span></button></div>'
    + '<div class="co-body"><p class="co-k">Paso ' + (i + 1) + ' de ' + pasos.length + '</p><h2>' + prEsc(p.titulo || '') + '</h2>'
    + (p.ingredientes ? '<p class="co-ing">' + prEsc(p.ingredientes) + '</p>' : '')
    + '<p class="co-met">' + prEsc(p.metodo || '') + '</p>'
    + (min ? '<button class="n-bt co-tm" onclick="coTimer(' + min + ',' + jsArg(n + ' · paso ' + (i + 1)) + ')"><span class="ms">timer</span>Temporizador ' + min + ' min</button>' : '')
    + (avisos.length ? '<p class="pr-note">Ojo: ' + avisos.map(prEsc).join(' · ') + '</p>' : '')
    + '</div><div class="co-foot"><button class="n-bt" ' + (i ? '' : 'disabled') + ' onclick="CO.paso[' + jsArg(n) + ']=' + (i - 1) + ';coPintar()"><span class="ms">arrow_back</span>Anterior</button>'
    + (i < pasos.length - 1 ? '<button class="n-bt n-bt-p" onclick="CO.paso[' + jsArg(n) + ']=' + (i + 1) + ';coPintar()">Siguiente<span class="ms">arrow_forward</span></button>'
       : '<button class="n-bt n-bt-p" onclick="coTermine(' + jsArg(n) + ')"><span class="ms">ac_unit</span>Terminé: guardar tanda</button>') + '</div>';
  coTimersPintar();
}
function coOtra() {
  var q = prompt('¿Qué otra receta vas a cocinar en paralelo?');
  if (!q) return;
  var r = dsRecetas().find(function(x) { return x.n.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
  CO.recetas.push(r ? r.n : q); CO.act = CO.recetas.length - 1; coPintar();
}
function coTimer(min, etiqueta) {
  CO.timers.push({ fin: Date.now() + min * 60000, et: etiqueta });
  if (!CO.tick) CO.tick = setInterval(coTimersPintar, 1000);
  coTimersPintar();
}
function coTimersPintar() {
  var box = document.getElementById('co-timers'); if (!box) return;
  var now = Date.now();
  CO.timers.forEach(function(t) { if (!t.sonó && t.fin <= now) { t.sonó = true; coSonar(); showToast('Listo: ' + t.et); } });
  CO.timers = CO.timers.filter(function(t) { return t.fin > now - 30000; });
  box.innerHTML = CO.timers.map(function(t) { var s = Math.max(0, Math.round((t.fin - now) / 1000)); return '<span class="co-t' + (s ? '' : ' fin') + '">' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</span>'; }).join('');
  if (!CO.timers.length && CO.tick) { clearInterval(CO.tick); CO.tick = null; }
}
function coSonar() {
  try { var a = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(function(t) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.25, a.currentTime + t); o.start(a.currentTime + t); o.stop(a.currentTime + t + .22); }); } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}
function coTermine(n) {
  coCerrar();
  if (!currentUser) { showToast('Entra para guardar la tanda en tu congeladora', true); return; }
  var prot = dsProteina(n), cat = /sopa|caldo|crema|aguadito/i.test(n) ? 'otros' : /arroz|quinua|pur[eé]|papa/i.test(n) ? 'acompanamientos' : /salsa|huanca[ií]na|ocopa|aderezo/i.test(n) ? 'salsas' : prot && /pollo|res|cerdo|pescado/.test(prot) && !/guiso|seco|aj[ií] de|estofado|olluquito/i.test(n) ? 'proteinas' : 'guisos';
  var cong = (PR_APAR.find(function(a) { return prFrio(a[0]); }) || PR_APAR[0] || ['congeladora'])[0];
  showSection('stock');
  setTimeout(function() { prRevisar(cong, [{ nombre: n, categoria: cat, hecho: prHoy(), vence: prMas(prHoy(), prVida(cat, true)) }], false); }, 400);
}

// Escalar porciones en el modal de receta: multiplica las cantidades del texto
function coEscalar(btn, delta) {
  var box = btn.closest('.esc'), base = +box.dataset.base, n = Math.max(1, (+box.dataset.n || base) + delta), k = n / base;
  box.dataset.n = n;
  box.querySelector('b').textContent = n;
  var ml = n * 300;
  box.querySelector('.esc-t').textContent = '≈ ' + Math.ceil(ml / 500) + ' tapers de 500 ml';
  box.closest('.pr-modal, div').parentNode.querySelectorAll('.ing[data-raw]').forEach(function(el) { el.textContent = coMultiplicar(el.dataset.raw, k); });
}
function coMultiplicar(txt, k) {
  if (k === 1) return txt;
  return String(txt).replace(/(\d+)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)/g, function(m, a, b, c) {
    var v = a ? (+a / +b) : parseFloat(String(c).replace(',', '.'));
    var r = Math.round(v * k * 4) / 4;
    var ent = Math.floor(r), fr = r - ent, f = fr === .25 ? '¼' : fr === .5 ? '½' : fr === .75 ? '¾' : '';
    return (ent || !f ? ent : '') + f;
  });
}

// Perfiles de la familia (en Ajustes)
async function perfilesRender() {
  var box = document.getElementById('aj-perfiles');
  if (!box || !currentUser) return;
  var ps = await dsPerfiles(true);
  box.innerHTML = '<div class="n-h"><h2>Quién come en casa</h2><span>gustos y alergias</span></div>'
    + ps.map(function(p) {
        return '<div class="pf-row"><input value="' + prEsc(p.nombre) + '" aria-label="Nombre" onchange="pfCampo(\'' + p.id + '\',\'nombre\',this.value)"/>'
          + '<input type="number" min="0" max="120" value="' + (p.edad || '') + '" placeholder="Edad" aria-label="Edad" onchange="pfCampo(\'' + p.id + '\',\'edad\',this.value)"/>'
          + '<input value="' + prEsc(p.alergias || '') + '" placeholder="Alergias (maní, mariscos)" aria-label="Alergias" onchange="pfCampo(\'' + p.id + '\',\'alergias\',this.value)"/>'
          + '<input value="' + prEsc(p.no_come || '') + '" placeholder="No come (cebolla, culantro)" aria-label="No come" onchange="pfCampo(\'' + p.id + '\',\'no_come\',this.value)"/>'
          + '<label class="pf-l"><input type="checkbox"' + (p.lonchera ? ' checked' : '') + ' onchange="pfCampo(\'' + p.id + '\',\'lonchera\',this.checked)"/>Lonchera</label>'
          + '<button class="aj-x" aria-label="Quitar" onclick="pfQuitar(\'' + p.id + '\')"><span class="ms">delete</span></button></div>';
      }).join('')
    + '<div class="aj-row"><input id="pf-nuevo" placeholder="Nombre (ej: Mateo)" maxlength="40"/><button class="n-bt n-bt-p n-bt-sm" onclick="pfAgregar()">Agregar</button></div>'
    + '<p class="n-sub">Las sugerencias de comidas y loncheras respetan esto, y cada receta te avisa si lleva algo que alguien no come.</p>';
}
async function pfAgregar() {
  var el = document.getElementById('pf-nuevo'), n = String(el && el.value || '').trim();
  if (!n) { showToast('Escribe el nombre', true); return; }
  var r = await supa.from('cs_perfiles').insert({ ambito: dsAmb(), nombre: n });
  if (r.error) { showToast('No se pudo agregar', true); return; }
  perfilesRender();
}
async function pfCampo(id, k, v) {
  var c = {}; c[k] = k === 'edad' ? (parseInt(v, 10) || null) : k === 'lonchera' ? !!v : (String(v).trim() || null);
  if (k === 'nombre' && !c.nombre) { perfilesRender(); return; }
  var r = await supa.from('cs_perfiles').update(c).eq('id', id);
  if (r.error) showToast('No se guardó', true); else { DS.perfiles = null; showToast('Guardado'); }
}
async function pfQuitar(id) { await supa.from('cs_perfiles').delete().eq('id', id); perfilesRender(); }
