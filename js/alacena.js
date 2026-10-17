// Despensa · ALACENA (despensa seca), foto de la refri, boleta del súper, código de barras y etiquetas para tapers
var AL = { items: [] };
var AL_ESTADOS = [['hay', 'Hay'], ['poco', 'Queda poco'], ['acabo', 'Se acabó']];

async function alCargar() {
  if (!currentUser) return [];
  var r = await supa.from('cs_stock').select('*').eq('ambito', dsAmb()).order('nombre');
  AL.items = r.error ? [] : (r.data || []);
  return AL.items;
}
async function alRender() {
  var box = document.getElementById('al-content'); if (!box) return;
  if (!currentUser) { box.innerHTML = ''; return; }
  await alCargar();
  var falta = AL.items.filter(function(x) { return x.estado !== 'hay'; });
  box.innerHTML = '<div class="n-h"><h2>Alacena <small>(' + AL.items.length + ')</small></h2><span>despensa seca</span></div>'
    + '<div class="al-acts"><button class="n-mini" onclick="alEscanear()"><span class="ms">barcode_scanner</span>Escanear código</button>'
    + '<button class="n-mini n-mini-l" onclick="alBoleta()"><span class="ms">receipt_long</span>Foto de la boleta</button>'
    + '<button class="n-mini n-mini-l" onclick="alNuevo()"><span class="ms">add</span>Agregar</button>'
    + (falta.length ? '<button class="n-mini n-mini-l" onclick="alALista()"><span class="ms">shopping_cart</span>' + falta.length + ' a la lista</button>' : '') + '</div>'
    + (AL.items.length ? AL.items.map(function(x) {
        var d = prDias(x.vence_at);
        return '<div class="al-row"><div class="al-n"><b>' + prEsc(x.nombre) + '</b><span>' + prEsc(x.cantidad || '') + (x.vence_at ? ' · ' + (d < 0 ? '<em class="n-err">vencido</em>' : 'vence ' + prFecha(x.vence_at)) : '') + '</span></div>'
          + '<div class="al-est">' + AL_ESTADOS.map(function(e) { return '<button class="' + (x.estado === e[0] ? 'on ' + e[0] : '') + '" onclick="alEstado(\'' + x.id + '\',\'' + e[0] + '\')">' + e[1] + '</button>'; }).join('') + '</div>'
          + '<button class="aj-x" aria-label="Quitar" onclick="alQuitar(\'' + x.id + '\')"><span class="ms">delete</span></button></div>';
      }).join('')
      : '<div class="n-empty">Anota arroz, aceite, latas y lo que guardas fuera del frío. Cuando algo se acabe, pasa solo a la lista de compras.</div>');
}
async function alGuardar(o) {
  o.ambito = dsAmb(); o.user_id = currentUser.id; o.hogar_id = PR.hogar ? PR.hogar.id : null; o.updated_at = new Date().toISOString();
  var r = await supa.from('cs_stock').insert(o);
  if (r.error) { showToast('No se pudo guardar', true); return false; }
  return true;
}
function alNuevo(pref) {
  pref = pref || {};
  var bg = dsModal('<h3>Agregar a la alacena</h3><div class="grid"><label class="full">Qué es<input id="al-n" value="' + prEsc(pref.nombre || '') + '"/></label>'
    + '<label>Cantidad<input id="al-c" value="' + prEsc(pref.cantidad || '') + '" placeholder="5 kg, 2 latas"/></label><label>Vence<input id="al-v" type="date" value="' + (pref.vence_at || '') + '"/></label></div>'
    + '<div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="al-ok">Guardar</button></div>', 440);
  bg.querySelector('#al-ok').onclick = async function() {
    var n = bg.querySelector('#al-n').value.trim(); if (!n) { showToast('Escribe qué es', true); return; }
    if (await alGuardar({ nombre: n, cantidad: bg.querySelector('#al-c').value.trim() || null, vence_at: bg.querySelector('#al-v').value || null, codigo: pref.codigo || null, estado: 'hay' })) { bg.remove(); alRender(); }
  };
}
async function alEstado(id, e) { await supa.from('cs_stock').update({ estado: e, updated_at: new Date().toISOString() }).eq('id', id); alRender(); }
async function alQuitar(id) { await supa.from('cs_stock').delete().eq('id', id); alRender(); }
// Lo que se acabó o queda poco → a la lista de compras de Precios
function alALista() {
  var falta = AL.items.filter(function(x) { return x.estado !== 'hay'; });
  showSection('comparar');
  var ta = document.getElementById('cmp-input');
  ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + falta.map(function(x) { return x.nombre; }).join('\n');
  showToast(falta.length + ' productos agregados a tu lista');
}

// Código de barras: cámara → código → Open Food Facts → alacena
async function alEscanear() {
  var bg = dsModal('<h3>Escanear código de barras</h3><p class="sub">Apunta al código del producto.</p><div id="al-cam" class="al-cam"></div><div class="grid" style="margin-top:12px"><label class="full">O escribe el número<input id="al-ean" inputmode="numeric"/></label></div>'
    + '<div class="foot"><button class="pr-btn" data-x>Cerrar</button><button class="pr-btn pr-btn-main" id="al-buscar">Buscar</button></div>', 480);
  var sc = null, listo = false;
  var cerrar = function() { if (sc) { try { sc.stop(); } catch (e) {} sc = null; } };
  bg.addEventListener('click', function(e) { if (e.target === bg || e.target.closest('[data-x]')) cerrar(); });
  var encontrado = async function(ean) {
    if (listo) return; listo = true; cerrar();
    var nombre = '', cantidad = '';
    try {
      var r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(ean) + '.json?fields=product_name,brands,quantity');
      var j = await r.json();
      if (j && j.product) { nombre = [j.product.product_name, j.product.brands].filter(Boolean).join(' · '); cantidad = j.product.quantity || ''; }
    } catch (e) {}
    bg.remove();
    if (!nombre) showToast('No conozco ese código; escribe el nombre');
    alNuevo({ nombre: nombre, cantidad: cantidad, codigo: ean });
  };
  bg.querySelector('#al-buscar').onclick = function() { var v = bg.querySelector('#al-ean').value.trim(); if (v) encontrado(v); };
  try {
    await dsScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
    sc = new Html5Qrcode('al-cam');
    await sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 120 } }, function(txt) { encontrado(txt); }, function() {});
  } catch (e) { var c = bg.querySelector('#al-cam'); if (c) c.innerHTML = '<p class="n-sub">No pude abrir la cámara aquí. Escribe el número de abajo.</p>'; }
}

// Boleta del súper: foto → gasto registrado + productos a la alacena
async function alBoleta() {
  if (!currentUser) { showToast('Entra con tu cuenta primero', true); return; }
  var f = await dsElegirFoto(); if (!f) return;
  var bg = dsCargando('Leyendo la boleta…');
  try {
    var b64 = await prReducir(f, 1800);
    var p = await iaVision(b64, 'Es una boleta o ticket de supermercado peruano. Extrae la tienda, la fecha, el total pagado y cada producto con su precio. Marca "alacena": true para abarrotes no perecibles (arroz, aceite, fideos, latas, azúcar, menestras, condimentos, limpieza) y false para frescos. '
      + 'Responde SOLO JSON: {"tienda":"wong|metro|plazavea|makro|vivanda|otra","fecha":"AAAA-MM-DD","total":0,"items":[{"nombre":"","cantidad":"","precio":0,"alacena":true}]}', 3000);
    bg.remove();
    var items = p.items || [];
    var m = dsModal('<h3>Boleta' + (p.tienda && SP[p.tienda] ? ' de ' + SP[p.tienda].n : '') + '</h3><p class="sub">Total S/ ' + (+p.total || 0).toFixed(2) + ' · ' + items.length + ' productos. Marca lo que va a la alacena.</p>'
      + '<div class="sem-lista">' + items.map(function(it, k) { return '<label class="al-bol"><input type="checkbox" data-k="' + k + '"' + (it.alacena ? ' checked' : '') + '/><span>' + prEsc(it.nombre) + '<small>' + prEsc(it.cantidad || '') + '</small></span><b>S/ ' + (+it.precio || 0).toFixed(2) + '</b></label>'; }).join('') + '</div>'
      + '<div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="al-bok">Guardar gasto y alacena</button></div>', 560);
    m.querySelector('#al-bok').onclick = async function() {
      this.disabled = true;
      var sel = [].slice.call(m.querySelectorAll('input[data-k]:checked')).map(function(i) { return items[+i.dataset.k]; });
      await supa.from('cs_gastos').insert({ ambito: dsAmb(), fecha: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || '') ? p.fecha : prHoy(), tienda: p.tienda || 'otra', monto: +p.total || items.reduce(function(a, x) { return a + (+x.precio || 0); }, 0), items: items.length, por: prQuien() });
      if (sel.length) await supa.from('cs_stock').insert(sel.map(function(x) { return { ambito: dsAmb(), user_id: currentUser.id, hogar_id: PR.hogar ? PR.hogar.id : null, nombre: x.nombre, cantidad: x.cantidad || null, estado: 'hay', updated_at: new Date().toISOString() }; }));
      m.remove(); showToast('Compra registrada' + (sel.length ? ' y ' + sel.length + ' productos en la alacena' : '')); alRender();
    };
  } catch (e) { bg.remove(); showToast('No pude leer la boleta: ' + e.message, true); }
}

// Foto de la refri abierta → la IA propone qué hay → se revisa y se agrega
async function alFotoRefri() {
  if (!currentUser) { showToast('Entra con tu cuenta primero', true); return; }
  var f = await dsElegirFoto(); if (!f) return;
  var bg = dsCargando('Mirando la foto…');
  try {
    var b64 = await prReducir(f, 1800);
    var p = await iaVision(b64, 'Es una foto del interior de una refrigeradora o congeladora de una casa peruana con comida preparada en tapers. Lista cada preparación que se vea, estimando cuántos envases hay de cada tamaño (250 ml, 500 ml o 1 L) y la sección. No inventes lo que no se ve. '
      + 'Hoy es ' + prHoy() + '. Responde SOLO JSON: {"es":"refri|congeladora","filas":[{"nombre":"","categoria":"acompanamientos|salsas|proteinas|guisos|otros","n250":0,"n500":0,"n1000":0}],"dudas":"texto corto o null"}', 2500);
    bg.remove();
    var destino = (PR_APAR.find(function(a) { return p.es === 'refri' ? !prFrio(a[0]) : prFrio(a[0]); }) || PR_APAR[0])[0];
    var filas = (p.filas || []).map(function(x) { return Object.assign({ hecho: prHoy(), vence: prMas(prHoy(), prVida(x.categoria, prFrio(destino))) }, x); });
    if (!filas.length) { showToast('No reconocí comida en la foto', true); return; }
    prRevisar(destino, filas, false, (p.dudas ? p.dudas + ' ' : '') + 'Revisa: esto se agrega a lo que ya tienes, no lo reemplaza.');
  } catch (e) { bg.remove(); showToast('No pude leer la foto: ' + e.message, true); }
}

// Etiquetas para tapers: una por envase, con QR que abre la tanda
function alEtiquetas(id) {
  var r = prRow(id); if (!r) return;
  var n = prTotal(r), day = r.vence ? PR_DAYS[new Date(r.vence + 'T12:00:00').getDay()] : null;
  var w = window.open('', '_blank');
  if (!w) { showToast('Permite las ventanas emergentes para imprimir', true); return; }
  var et = '';
  PR_SIZES.forEach(function(s) { for (var i = 0; i < (r[s[0]] || 0); i++) et += '<div class="et"><div class="t">' + prEsc(r.nombre) + '</div><div class="m">' + s[1] + (r.hecho ? ' · hecho ' + prFecha(r.hecho) : '') + '</div><div class="v"' + (day ? ' style="background:' + day[1] + ';color:' + (/e8c21c|e98a1f/i.test(day[1]) ? '#141414' : '#fff') + '"' : '') + '>Vence ' + (r.vence ? prFecha(r.vence) : '—') + '</div><div class="qr" data-u="https://despensa.casa/#t-' + r.id + '"></div></div>'; });
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas · ' + prEsc(r.nombre) + '</title><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600&display=swap" rel="stylesheet">'
    + '<style>@page{size:auto;margin:6mm}body{font-family:Lexend,Arial,sans-serif;margin:0;display:flex;flex-wrap:wrap;gap:3mm}.et{width:50mm;height:30mm;border:0.3mm solid #141414;box-sizing:border-box;padding:2mm;position:relative;overflow:hidden;break-inside:avoid}'
    + '.t{font-weight:600;font-size:9pt;line-height:1.1;max-width:32mm}.m{font-size:6.5pt;margin-top:1mm;color:#444}.v{position:absolute;left:2mm;bottom:2mm;font-size:7pt;font-weight:600;padding:1mm 1.5mm;background:#141414;color:#fff;letter-spacing:.06em;text-transform:uppercase}.qr{position:absolute;right:1.5mm;top:1.5mm;width:15mm;height:15mm}.qr img,.qr svg{width:100%;height:100%}.bar{width:100%;margin-bottom:4mm;font-size:10pt}@media print{.bar{display:none}}</style></head><body>'
    + '<div class="bar">' + n + ' etiquetas de 50 × 30 mm. Funcionan con impresoras de etiquetas (Niimbot, Brother QL) o en hoja A4 de stickers. <button onclick="print()">Imprimir</button></div>' + et
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"><\/script><script>document.querySelectorAll(".qr").forEach(function(e){var q=qrcode(0,"M");q.addData(e.dataset.u);q.make();e.innerHTML=q.createSvgTag({margin:0});});<\/script></body></html>');
  w.document.close();
}
