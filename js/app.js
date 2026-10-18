// Despensa · PLATAFORMA: app instalable (PWA + compartir), asistente por voz o texto, exportar/importar CSV, modo tablet y planes
// 1) Service worker y atajos del ícono
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(function() {});
var APP_RUTAS = { inicio: 'home', semana: 'semana', precios: 'comparar', planes: 'planes', asistente: 'asistente' };
function appRuta(h) {
  h = String(h || '').replace(/^#/, '');
  if (h === 'tablet') { appTablet(true); return true; }
  if (h === 'asistente') { setTimeout(appAsistente, 500); return true; }
  if (APP_RUTAS[h]) { showSection(APP_RUTAS[h]); return true; }
  return false;
}
// 2) Lo que llega con "Compartir → Despensa" (Android): receta o lista de compras
function appCompartido() {
  var q = new URLSearchParams(location.search), url = q.get('share_url'), txt = [q.get('share_title'), q.get('share_text')].filter(Boolean).join('\n');
  if (!url && !txt) return false;
  history.replaceState(null, '', '/');
  var link = url || (txt.match(/https?:\/\/\S+/) || [])[0];
  var bg = dsModal('<h3>¿Qué me compartiste?</h3><p class="sub">' + prEsc((link || txt).slice(0, 140)) + '</p><div class="foot"><button class="pr-btn" id="ac-l">Es una lista de compras</button><button class="pr-btn pr-btn-main" id="ac-r">Es una receta</button></div>', 480);
  bg.querySelector('#ac-r').onclick = function() { bg.remove(); showSection('recetas'); if (link) mrImportar(link); else mrEstructurar(txt).then(function(r) { mrRevisar(r, null); }); };
  bg.querySelector('#ac-l').onclick = function() { bg.remove(); showSection('comparar'); document.getElementById('cmp-input').value = txt || link; compararLista(); };
  return true;
}
window.addEventListener('load', function() { setTimeout(function() { if (!appCompartido()) appRuta(location.hash); }, 350); });
window.addEventListener('hashchange', function() { appRuta(location.hash); });

// 3) Asistente: "¿qué hay en la refri?", "agrega 2 tapers de arroz", "¿qué cocino hoy?" (texto o voz)
var ASIS = { hist: [] };
function appAsistente() {
  if (!currentUser) { showToast('Entra con tu cuenta para usar el asistente', true); return; }
  var bg = dsModal('<h3>Asistente</h3><p class="sub">Pregunta o pide algo: "¿qué vence esta semana?", "saqué un taper de seco", "agrega leche a la lista".</p>'
    + '<div id="as-log" class="as-log"></div><div class="as-in"><button class="n-mini n-mini-l" id="as-mic" aria-label="Hablar"><span class="ms">mic</span></button><input id="as-q" placeholder="Escribe aquí" autocomplete="off"/><button class="n-mini" id="as-go">Enviar</button></div>', 560);
  var log = bg.querySelector('#as-log'), q = bg.querySelector('#as-q');
  var pintar = function() { log.innerHTML = ASIS.hist.map(function(m) { return '<div class="as-m ' + m.de + '">' + m.html + '</div>'; }).join(''); log.scrollTop = 1e6; };
  var enviar = async function(texto) {
    texto = String(texto || '').trim(); if (!texto) return;
    q.value = ''; ASIS.hist.push({ de: 'yo', html: prEsc(texto) }); ASIS.hist.push({ de: 'el', html: '…' }); pintar();
    try {
      await prCargar(); await dsPerfiles(); if (typeof alCargar === 'function') await alCargar();
      var hoyMenu = await supa.from('cs_menu').select('fecha,comida,receta').eq('ambito', dsAmb()).gte('fecha', prHoy()).lte('fecha', prMas(prHoy(), 6));
      var p = await iaJSON('Eres el asistente de Despensa.casa, la app de comida de una casa peruana. Responde en español neutro de "tú", corto y concreto.\n'
        + 'Hoy: ' + prHoy() + ' (' + PR_DAYS[new Date().getDay()][0] + ').\nEquipos: ' + PR.espacios.map(function(e) { return e.clave + '=' + e.casa + ' ' + e.nombre + ' (' + e.tipo + ')'; }).join('; ')
        + '\nInventario (id: nombre, dónde, envases 250/500/1000, vence): ' + PR.rows.map(function(r) { return r.id + ': ' + r.nombre + ', ' + r.ubicacion + ', ' + (r.n250 || 0) + '/' + (r.n500 || 0) + '/' + (r.n1000 || 0) + ', ' + (r.vence || '?'); }).join('; ')
        + '\nAlacena: ' + (AL.items || []).map(function(x) { return x.nombre + ' (' + x.estado + ')'; }).join(', ')
        + '\nMenú próximos días: ' + (hoyMenu.data || []).map(function(m) { return m.fecha + ' ' + m.comida + ': ' + m.receta; }).join('; ')
        + '\nFamilia: ' + (dsResumenFamilia() || 'sin datos')
        + '\nConversación previa: ' + ASIS.hist.filter(function(m) { return m.html !== '…'; }).slice(-6).map(function(m) { return (m.de === 'yo' ? 'Usuario: ' : 'Asistente: ') + m.html.replace(/<[^>]+>/g, ''); }).join(' | ')
        + '\nPedido: ' + texto
        + '\nSi el pedido implica cambiar algo, propón acciones (no las inventes si no corresponde). Tipos: "comio" {id, tamano: n250|n500|n1000}, "mover" {id, tamano, a: clave}, "agregar_tanda" {nombre, categoria: acompanamientos|salsas|proteinas|guisos|otros, a: clave, n250, n500, n1000}, "agregar_lista" {items: [texto]}, "agregar_semana" {fecha, comida: lonchera|almuerzo|cena, receta}, "tarea" {texto, fecha}.'
        + '\nResponde SOLO JSON: {"respuesta":"texto","acciones":[{"tipo":"","resumen":"frase corta", "...":"..."}]}', 1500);
      ASIS.hist.pop(); ASIS.hist.push({ de: 'el', html: prEsc(p.respuesta || 'Listo.') + ((p.acciones || []).length ? '<div class="as-acc">' + p.acciones.map(function(a, k) { return '<button class="n-mini" data-a="' + ASIS.hist.length + '-' + k + '">' + prEsc(a.resumen || a.tipo) + '</button>'; }).join('') + '</div>' : '') });
      ASIS['a' + (ASIS.hist.length - 1)] = p.acciones || [];
      pintar();
      if (window.speechSynthesis && ASIS.voz) { var u = new SpeechSynthesisUtterance(p.respuesta || ''); u.lang = 'es-PE'; speechSynthesis.speak(u); }
    } catch (e) { ASIS.hist.pop(); ASIS.hist.push({ de: 'el', html: 'No pude responder ahora (' + prEsc(e.message) + ').' }); pintar(); }
  };
  log.addEventListener('click', async function(e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var k = b.dataset.a.split('-'), a = (ASIS['a' + k[0]] || [])[+k[1]]; if (!a) return;
    b.disabled = true; await appAccion(a); b.textContent = '✓ ' + b.textContent;
  });
  bg.querySelector('#as-go').onclick = function() { enviar(q.value); };
  q.addEventListener('keydown', function(e) { if (e.key === 'Enter') enviar(q.value); });
  bg.querySelector('#as-mic').onclick = function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Tu navegador no deja dictar; escribe', true); return; }
    var r = new SR(); r.lang = 'es-PE'; r.interimResults = false; ASIS.voz = true;
    this.classList.add('on'); var btn = this;
    r.onresult = function(ev) { enviar(ev.results[0][0].transcript); }; r.onend = function() { btn.classList.remove('on'); }; r.start();
  };
  pintar(); setTimeout(function() { q.focus(); }, 50);
}
async function appAccion(a) {
  try {
    if (a.tipo === 'comio' && prRow(a.id)) await prMoverA(a.id, a.tamano || PR_SIZES.map(function(s) { return s[0]; }).find(function(k) { return prRow(a.id)[k] > 0; }), 'comio');
    else if (a.tipo === 'mover' && prRow(a.id) && prEsp(a.a)) await prMoverA(a.id, a.tamano || null, a.a);
    else if (a.tipo === 'agregar_tanda') {
      var o = { hogar_id: PR.hogar ? PR.hogar.id : null, ubicacion: prEsp(a.a) ? a.a : (PR_APAR[0] || ['refri'])[0], categoria: a.categoria || 'otros', nombre: a.nombre, hecho: prHoy(), n250: +a.n250 || 0, n500: +a.n500 || 0, n1000: +a.n1000 || 0, origen: 'asistente', hecho_por: prQuien() };
      o.vence = prMas(prHoy(), prVida(o.categoria, prFrio(o.ubicacion)));
      var ins = await supa.from('cs_preparados').insert(o).select().single(); if (!ins.error) prLog(ins.data, 'entra', null, o.ubicacion, o);
    } else if (a.tipo === 'agregar_lista') { var ta = document.getElementById('cmp-input'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + (a.items || []).join('\n'); }
    else if (a.tipo === 'agregar_semana') await supa.from('cs_menu').insert({ ambito: dsAmb(), fecha: a.fecha || prHoy(), comida: a.comida || 'almuerzo', receta: a.receta, por: prQuien() });
    else if (a.tipo === 'tarea') await supa.from('cs_tareas').insert({ ambito: dsAmb(), texto: a.texto, fecha: a.fecha || prHoy(), por: prQuien() });
    showToast('Hecho'); prCargar().then(function() { if (!document.getElementById('shome').classList.contains('hidden')) homeRender(); });
  } catch (e) { showToast('No se pudo: ' + e.message, true); }
}

// 4) Exportar e importar (CSV que abre en Excel o Google Sheets)
function appCSV(filas) {
  var cab = Object.keys(filas[0] || {});
  return '﻿' + [cab.join(';')].concat(filas.map(function(f) { return cab.map(function(k) { var v = f[k] == null ? '' : String(f[k]); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); })).join('\n');
}
function appBajar(nombre, texto) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function() { a.remove(); }, 500);
}
async function appExportar(que) {
  if (!currentUser) return;
  await prCargar();
  var hoy = prHoy();
  if (que === 'inventario') appBajar('despensa-inventario-' + hoy + '.csv', appCSV(PR.rows.map(function(r) { return { nombre: r.nombre, seccion: r.categoria, equipo: prNombreAp(r.ubicacion), casa: (prEsp(r.ubicacion) || {}).casa || '', hecho: r.hecho, vence: r.vence, envases_250: r.n250, envases_500: r.n500, envases_1l: r.n1000, hecho_por: r.hecho_por || '', nota: r.nota || '' }; })));
  if (que === 'alacena') { await alCargar(); appBajar('despensa-alacena-' + hoy + '.csv', appCSV(AL.items.map(function(x) { return { nombre: x.nombre, cantidad: x.cantidad, estado: x.estado, vence: x.vence_at, codigo: x.codigo }; }))); }
  if (que === 'gastos') { var g = await supa.from('cs_gastos').select('fecha,tienda,monto,ahorro,items,por').eq('ambito', dsAmb()).order('fecha'); appBajar('despensa-gastos-' + hoy + '.csv', appCSV(g.data || [])); }
  if (que === 'historial') { var h = await supa.from('cs_movimientos').select('created_at,accion,nombre,categoria,desde,hacia,n250,n500,n1000,costo,por').eq('ambito', dsAmb()).order('created_at'); appBajar('despensa-historial-' + hoy + '.csv', appCSV(h.data || [])); }
}
function appImportar() {
  var i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,text/csv';
  i.onchange = async function() {
    var f = i.files && i.files[0]; if (!f) return;
    var txt = (await f.text()).replace(/^﻿/, ''), sep = txt.split('\n')[0].indexOf(';') >= 0 ? ';' : ',';
    var lineas = txt.split(/\r?\n/).filter(Boolean), cab = lineas.shift().split(sep).map(function(x) { return x.trim().toLowerCase(); });
    var filas = lineas.map(function(l) { var v = l.split(sep), o = {}; cab.forEach(function(k, j) { o[k] = (v[j] || '').replace(/^"|"$/g, '').trim(); }); return o; })
      .map(function(o) { return { nombre: o.nombre, categoria: (PR_CATS.find(function(c) { return c[0] === o.seccion || c[1].toLowerCase() === String(o.seccion).toLowerCase(); }) || ['otros'])[0], hecho: o.hecho || null, vence: o.vence || null, n250: +o.envases_250 || 0, n500: +o.envases_500 || 0, n1000: +o.envases_1l || 0 }; })
      .filter(function(o) { return o.nombre && prTotal(o) > 0; });
    if (!filas.length) { showToast('No encontré filas válidas (usa el formato de Exportar inventario)', true); return; }
    showSection('stock'); setTimeout(function() { prRevisar((PR_APAR.find(function(a) { return prFrio(a[0]); }) || PR_APAR[0])[0], filas, false, 'Importado de ' + f.name + '. Revisa y elige el equipo.'); }, 400);
  };
  i.click();
}

// 5) Modo tablet: pantalla fija en la cocina con el tablero siempre al día
function appTablet(on) {
  document.body.classList.toggle('tablet', on);
  if (on) {
    showSection('stock');
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function() {}); } catch (e) {}
    clearInterval(window.__tab); window.__tab = setInterval(function() { if (!document.hidden) loadStock(); }, 60000);
    showToast('Modo tablet: se actualiza solo cada minuto');
  } else clearInterval(window.__tab);
}

// 6) Planes y Kit Despensa
function appPlanes() {
  var box = document.getElementById('planes-content'); if (!box) return;
  box.innerHTML = '<section class="n-hero" style="padding-left:0;padding-right:0"><h1><span>Planes</span> <b>Despensa</b></h1><p>Empieza gratis. Cuando quieras más, elige un plan; se cobra cada mes con Mercado Pago.</p></section>'
    + '<div id="pl-mia"></div>'
    + '<div class="pl-tabla">'
    + appPlan('plus', 'Familia Plus', 'S/ 19.90', 'al mes', ['Todo lo de Familia', 'Varias casas (playa, campo)', 'Asistente por voz y fotos con IA sin límite', 'Roles para quien ayuda en casa', 'Boletas y precios reales sin límite'], false)
    + appPlan('familia', 'Familia', 'S/ 9.90', 'al mes', ['1 casa con todos sus equipos', 'Avisos de vencimiento y descongelado', 'Mi semana, loncheras y modo cocina', 'Presupuesto, ahorro y desperdicio en soles', '<b>Regalo: 3 meses de Familia Plus</b>'], true)
    + appPlan(null, 'Gratis', 'S/ 0', 'siempre', ['1 casa con 1 refri y 1 congeladora', 'Inventario y hojas para imprimir', 'Comparar precios 3 veces al mes'], false)
    + '</div>'
    + '<p class="n-sub" style="margin:10px 0 28px">Precios en soles, incluyen IGV. Cancelas cuando quieras. Menos de 33 céntimos al día. Un taper de ají de gallina botado cuesta más que un mes de Despensa.</p>'
    + '<p class="n-sub" style="margin:-18px 0 28px"><a class="n-link" href="/terminos.html" target="_blank">Términos</a> · <a class="n-link" href="/libro-reclamaciones.html" target="_blank">Libro de Reclamaciones</a></p>'
    + '<div class="n-h"><h2>Kit Despensa</h2><span>S/ 59</span></div><div class="n-row"><p>Etiquetas NFC para cada puerta, hojas magnéticas para la refri y las congeladoras, y stickers de colores por día para las tapas.</p><button class="n-bt" onclick="appInteres(\'kit\')">Quiero el kit</button></div>';
  appMiSuscripcion();
}

// Suscripción con Mercado Pago: el plan efectivo lo calcula la base (cs_mi_plan); el regalo de Plus vive en plus_hasta
var APP_PLAN_NOMBRE = { gratis: 'Gratis', familia: 'Familia', plus: 'Familia Plus' };
var APP_ESTADO = { authorized: 'Activa', pending: 'Esperando el pago', paused: 'En pausa', cancelled: 'Cancelada' };
async function appMiSuscripcion() {
  var box = document.getElementById('pl-mia'); if (!box || !currentUser) return;
  var r = await supa.from('cs_suscripciones').select('*').maybeSingle();
  var p = await supa.rpc('cs_mi_plan');
  var efectivo = (!p.error && p.data) || 'gratis', s = r.data;
  document.querySelectorAll('[data-plan]').forEach(function(b) {
    var es = b.getAttribute('data-plan') === (s && s.estado === 'authorized' ? s.plan : 'gratis');
    if (es) { b.disabled = true; b.textContent = 'Tu plan'; }
  });
  if (!s) return;
  var f = function(d) { return d ? new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  var regalo = s.plan === 'familia' && s.plus_hasta && new Date(s.plus_hasta) > new Date();
  box.innerHTML = '<div class="n-h"><h2>Mi suscripción</h2><span>' + prEsc(APP_ESTADO[s.estado] || s.estado) + '</span></div>'
    + '<div class="n-row"><p><b>' + prEsc(APP_PLAN_NOMBRE[s.plan] || s.plan) + '</b>' + (s.desde ? ' desde el ' + f(s.desde) : '') + '. Hoy usas <b>' + prEsc(APP_PLAN_NOMBRE[efectivo]) + '</b>.</p>'
    + (regalo ? '<p>Tu regalo de Familia Plus dura hasta el <b>' + f(s.plus_hasta) + '</b>. Después sigues en Familia al mismo precio.</p>' : '')
    + (s.estado === 'pending' ? '<p class="n-sub">Si ya pagaste, Mercado Pago tarda unos minutos en confirmarlo.</p>' : '')
    + '<p class="n-sub">Para cambiar la tarjeta, pausar o cancelar entra a <a class="n-link" href="https://www.mercadopago.com.pe/subscriptions" target="_blank" rel="noopener">tus suscripciones en Mercado Pago</a>. Si cancelas, vuelves al plan Gratis y no pierdes nada de lo guardado.</p></div>';
}
async function appSuscribir(plan) {
  if (!currentUser) { pedirLogin('elegir tu plan'); return; }
  var listo = typeof dsCargando === 'function' ? dsCargando('Abriendo Mercado Pago…') : null;
  try {
    var r = await fetch('/api/mp-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: plan }) });
    var j = await r.json().catch(function() { return {}; });
    if (!r.ok || !j.url) throw new Error((j.error && j.error.message) || 'No se pudo abrir el pago');
    location.href = j.url;
  } catch (e) {
    showToast(e.message, true);
  } finally { if (listo && listo.remove) listo.remove(); }
}
function appPlan(id, nombre, precio, per, items, dest) {
  return '<div class="pl' + (dest ? ' dest' : '') + '">' + (dest ? '<span class="n-lemon">Recomendado</span>' : '') + '<h3>' + nombre + '</h3><p class="pl-p"><b>' + precio + '</b> ' + per + '</p><ul>' + items.map(function(i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'
    + (id ? '<button class="n-bt' + (dest ? ' n-bt-p' : '') + '" data-plan="' + id + '" onclick="appSuscribir(\'' + id + '\')">Elegir ' + nombre + '</button>' : '<button class="n-bt" data-plan="gratis" disabled>Incluido</button>') + '</div>';
}
async function appInteres(plan) {
  if (!currentUser) { prEntrar(); return; }
  var r = await supa.from('cs_interes').upsert({ plan: plan, email: currentUser.email }, { onConflict: 'user_id,plan' });
  showToast(r.error ? 'No se pudo guardar' : 'Anotado. Te avisamos cuando abramos los pagos; mientras tanto todo es gratis.');
}
