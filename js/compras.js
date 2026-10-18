// Despensa · COMPRAS Y PLATA: precios reales, lista por sección, repartir entre tiendas, mercado, habituales con alertas,
// historial de precios, lista compartida en vivo, presupuesto, registro de compras, WhatsApp y costo por porción
var CMP = { dividir: false, ajustes: null, habituales: [] };
var CMP_SECCIONES = [['verduras', 'Verduras y frutas'], ['carnes', 'Carnes, aves y pescado'], ['lacteos', 'Lácteos y huevos'], ['abarrotes', 'Abarrotes'], ['especias', 'Especias y condimentos'], ['otros', 'Otros']];
var CMP_TIENDAS = ['wong', 'metro', 'plazavea', 'makro', 'vivanda'];

// Cantidad pedida ("1 kg", "500 g", "2 lt") → kg o litros
function cmpCantidad(txt) {
  var m = String(txt || '').toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|kilo|g|gr|lt|l|litro|ml|cc)\b/);
  if (!m) return null;
  var v = parseFloat(m[1]), u = m[2];
  return { cantidad: /^(kg|kilo|lt|l|litro)$/.test(u) ? v : v / 1000, unidad: /^(kg|kilo|g|gr)$/.test(u) ? 'kg' : 'l' };
}

// Reemplaza los precios estimados por los reales de las cinco tiendas (y guarda el historial)
async function cmpPreciosReales() {
  if (!cmpItems || !cmpItems.length) return;
  try {
    var ctrl = new AbortController(); setTimeout(function() { ctrl.abort(); }, 25000);
    var r = await fetch('/api/precios', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminos: cmpItems.map(function(it) { return it.busqueda_sugerida || it.nombre; }) }) });
    if (!r.ok) return;
    var d = await r.json(), hist = [], hoy = prHoy();
    (d.resultados || []).forEach(function(fila, i) {
      var it = cmpItems[i]; if (!it) return;
      var pide = cmpCantidad(it.cantidad);
      it.real = {};
      CMP_TIENDAS.forEach(function(k) {
        var p = fila[k]; if (!p) return;
        var precio = p.precio;
        if (pide && p.contenido && p.contenido.unidad === pide.unidad && p.por_unidad) precio = p.por_unidad * pide.cantidad;
        it['precio_estimado_' + k] = Math.round(precio * 10) / 10;
        it.real[k] = { nombre: p.nombre, precio: p.precio, url: p.url, por_unidad: p.por_unidad, unidad: p.contenido ? p.contenido.unidad : null, oferta: !!p.precio_lista };
        hist.push({ ambito: dsAmb(), termino: String(it.busqueda_sugerida || it.nombre).toLowerCase().slice(0, 80), tienda: k, nombre: p.nombre, precio: p.precio, por_unidad: p.por_unidad, unidad: p.contenido ? p.contenido.unidad : null, fecha: hoy });
      });
    });
    if (currentUser && hist.length) supa.from('cs_precios_hist').upsert(hist, { onConflict: 'ambito,termino,tienda,fecha', ignoreDuplicates: true }).then(function() {});
  } catch (e) { console.warn('precios reales', e); }
}

// Lista por sección del súper, con precio real, oferta, habitual y precio de mercado
function renderCmpLista() {
  var s = SP[cmpSuperActivo]; if (!s) return;
  var div = document.getElementById('cmp-lista'); if (!div) return;
  var hab = (CMP.habituales || []).map(function(h) { return h.termino; });
  var grupos = CMP_SECCIONES.map(function(sec) { return [sec, cmpItems.map(function(it, i) { return [it, i]; }).filter(function(x) { return (x[0].categoria || 'otros') === sec[0] || (sec[0] === 'otros' && !CMP_SECCIONES.some(function(z) { return z[0] === x[0].categoria; })); })]; }).filter(function(g) { return g[1].length; });
  div.innerHTML = grupos.map(function(g) {
    return '<div class="cath">' + g[0][1] + '</div>' + g[1].map(function(x) {
      var it = x[0], i = x[1], ck = checkedItems[it.nombre], real = it.real && it.real[cmpSuperActivo], t = String(it.busqueda_sugerida || it.nombre).toLowerCase();
      var precio = it['precio_estimado_' + cmpSuperActivo] || 0;
      return '<div class="cl-row' + (ck ? ' ck' : '') + '"><button class="cl-box" aria-label="Tachar" onclick="cmpTachar(' + i + ')">' + (ck ? '✓' : '') + '</button>'
        + '<div class="cl-n"><b>' + prEsc(it.nombre) + '</b><span>' + prEsc(it.cantidad || '') + (real ? ' · <a href="' + prEsc(real.url) + '" target="_blank" rel="noopener">' + prEsc(real.nombre) + '</a>' + (real.por_unidad ? ' · S/ ' + real.por_unidad.toFixed(2) + '/' + real.unidad : '') : '') + '</span>'
        + (it.aclaracion ? '<span class="cl-q">' + prEsc(it.aclaracion) + '</span>' : '') + '</div>'
        + '<div class="cl-p"><b>' + (real ? '' : '~') + 'S/ ' + precio.toFixed(2) + '</b>' + (real && real.oferta ? '<em class="n-lemon">oferta</em>' : real ? '<small>precio real</small>' : '<small>estimado</small>') + '</div>'
        + (currentUser ? '<button class="cl-star' + (hab.indexOf(t) >= 0 ? ' on' : '') + '" title="Lo compro siempre" aria-label="Habitual" onclick="cmpHabitual(' + i + ')"><span class="ms">star</span></button>' : '')
        + '<input class="cl-merc" inputmode="decimal" placeholder="Mercado" aria-label="Precio en el mercado" value="' + (it.precio_mercado || '') + '" onchange="cmpMercado(' + i + ',this.value)"/></div>';
    }).join('');
  }).join('');
}
function cmpTachar(i) {
  var it = cmpItems[i]; if (!it) return;
  checkedItems[it.nombre] = !checkedItems[it.nombre];
  saveListaActiva(); updateCompraProgress(); renderCmpLista();
}
function cmpMercado(i, v) {
  var n = parseFloat(String(v).replace(',', '.'));
  cmpItems[i].precio_mercado = n > 0 ? Math.round(n * 100) / 100 : null;
  saveListaActiva(); cmpExtras();
}

// Bloque bajo la comparativa: repartir entre tiendas, presupuesto, registrar compra, compartir
function cmpExtras() {
  var box = document.getElementById('cmp-extras');
  if (!box) { var sup = document.getElementById('cmp-supers'); if (!sup) return; box = document.createElement('div'); box.id = 'cmp-extras'; sup.parentNode.insertBefore(box, sup.nextSibling); }
  if (!cmpItems.length) { box.innerHTML = ''; return; }
  var tienda = cmpSuperActivo, total = cmpItems.reduce(function(a, it) { return a + (it['precio_estimado_' + tienda] || 0); }, 0) + (SP[tienda] ? SP[tienda].d : 0);
  // Repartir: cada producto donde está más barato (incluye mercado si pusiste precio)
  var rep = {}, totRep = 0;
  cmpItems.forEach(function(it) {
    var mejor = null;
    CMP_TIENDAS.forEach(function(k) { var p = it['precio_estimado_' + k]; if (p && (!mejor || p < mejor[1])) mejor = [k, p]; });
    if (it.precio_mercado && (!mejor || it.precio_mercado < mejor[1])) mejor = ['mercado', it.precio_mercado];
    if (!mejor) return;
    (rep[mejor[0]] = rep[mejor[0]] || []).push([it, mejor[1]]); totRep += mejor[1];
  });
  var nTiendas = Object.keys(rep).length, ahorroRep = total - totRep;
  var nombreT = function(k) { return k === 'mercado' ? 'Mercado' : (SP[k] ? SP[k].n : k); };
  var reales = cmpItems.filter(function(it) { return it.real && Object.keys(it.real).length; }).length;
  box.innerHTML = '<p class="n-sub cl-fuente">' + (reales ? reales + ' de ' + cmpItems.length + ' productos con precio real de la web de cada tienda; el resto es estimado.' : 'Precios estimados.') + '</p>'
    + (nTiendas > 1 && ahorroRep > 1 ? '<div class="cl-split"><div class="n-h"><h2>Repartir entre tiendas</h2><span>−S/ ' + ahorroRep.toFixed(2) + ' más</span></div>'
      + '<label class="cl-tog"><input type="checkbox" ' + (CMP.dividir ? 'checked' : '') + ' onchange="CMP.dividir=this.checked;cmpGuardarAjuste({dividir_tiendas:this.checked});cmpExtras()"/> Comprar cada cosa donde está más barata (' + nTiendas + ' lugares, S/ ' + totRep.toFixed(2) + ')</label>'
      + (CMP.dividir ? Object.keys(rep).map(function(k) { var sub = rep[k].reduce(function(a, x) { return a + x[1]; }, 0); return '<div class="cl-sp"><div class="n-row-foot"><b>' + nombreT(k) + '</b><span>S/ ' + sub.toFixed(2) + '</span></div><p class="n-sub">' + rep[k].map(function(x) { return prEsc(x[0].nombre); }).join(', ') + '</p></div>'; }).join('') : '')
      + '</div>' : '')
    + cmpPresupuestoHTML(CMP.dividir ? totRep : total)
    + '<div class="cl-acts"><button class="n-bt n-bt-p" onclick="cmpRegistrar(' + (CMP.dividir ? totRep : total).toFixed(2) + ')"><span class="ms">receipt_long</span>Ya compré: registrar gasto</button>'
    + '<button class="n-bt" onclick="cmpWhatsApp()"><span class="ms">chat</span>Mandar la lista por WhatsApp</button></div>';
}
function cmpPresupuestoHTML(estaCompra) {
  var a = CMP.ajustes, g = CMP.gastadoMes || 0;
  if (!currentUser) return '';
  if (!a || !a.presupuesto_mes) return '<p class="n-sub" style="margin:14px 0">¿Tienes un presupuesto de comida? <a class="n-link" onclick="cmpPresupuesto()">Definir presupuesto del mes</a></p>';
  var p = a.presupuesto_mes, pct = Math.min(100, g / p * 100), pct2 = Math.min(100, (g + estaCompra) / p * 100);
  return '<div class="cl-pres"><div class="n-h"><h2>Presupuesto del mes</h2><span><a class="n-link" onclick="cmpPresupuesto()">Cambiar</a></span></div>'
    + '<div class="cl-bar"><i style="width:' + pct + '%"></i><i class="sig' + (g + estaCompra > p ? ' mal' : '') + '" style="width:' + Math.max(0, pct2 - pct) + '%"></i></div>'
    + '<p class="n-sub">Llevas S/ ' + g.toFixed(2) + ' de S/ ' + p.toFixed(0) + '. Con esta compra: S/ ' + (g + estaCompra).toFixed(2) + (g + estaCompra > p ? ' (te pasas por S/ ' + (g + estaCompra - p).toFixed(2) + ')' : '') + '.' + (CMP.ahorroMes ? ' Ahorrado comparando este mes: <b>S/ ' + CMP.ahorroMes.toFixed(2) + '</b>.' : '') + '</p></div>';
}
async function cmpCargarPlata() {
  if (!currentUser) return;
  var amb = await listaAmbito();
  var ini = prISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  var r = await Promise.all([
    supa.from('cs_ajustes').select('*').eq('ambito', amb).maybeSingle(),
    supa.from('cs_gastos').select('monto,ahorro').eq('ambito', amb).gte('fecha', ini),
    supa.from('cs_habituales').select('*').eq('ambito', amb).order('created_at')
  ]);
  CMP.ajustes = r[0].data || null; CMP.dividir = !!(CMP.ajustes && CMP.ajustes.dividir_tiendas);
  CMP.gastadoMes = (r[1].data || []).reduce(function(a, x) { return a + (+x.monto || 0); }, 0);
  CMP.ahorroMes = (r[1].data || []).reduce(function(a, x) { return a + (+x.ahorro || 0); }, 0);
  CMP.habituales = r[2].data || [];
}
async function cmpGuardarAjuste(c) {
  if (!currentUser) return;
  c.ambito = await listaAmbito(); c.updated_at = new Date().toISOString();
  var r = await supa.from('cs_ajustes').upsert(c, { onConflict: 'ambito' }).select().single();
  if (!r.error) CMP.ajustes = r.data;
}
async function cmpPresupuesto() {
  var v = prompt('¿Cuánto quieres gastar en comida al mes? (S/)', CMP.ajustes && CMP.ajustes.presupuesto_mes || '');
  if (v == null) return;
  var n = parseFloat(String(v).replace(',', '.'));
  await cmpGuardarAjuste({ presupuesto_mes: n > 0 ? n : null });
  cmpExtras();
}
function cmpRegistrar(sugerido) {
  if (!currentUser) { showToast('Entra para llevar el control de tus gastos', true); return; }
  var caro = Math.max.apply(null, CMP_TIENDAS.map(function(k) { return cmpItems.reduce(function(a, it) { return a + (it['precio_estimado_' + k] || 0); }, 0) + (SP[k] ? SP[k].d : 0); }));
  var bg = dsModal('<h3>Registrar compra</h3><p class="sub">Para tu presupuesto y para medir cuánto ahorras comparando.</p><div class="grid">'
    + '<label>Dónde<select id="cr-t">' + CMP_TIENDAS.concat(['mercado', 'varias']).map(function(k) { return '<option value="' + k + '"' + (k === (CMP.dividir ? 'varias' : cmpSuperActivo) ? ' selected' : '') + '>' + (k === 'mercado' ? 'Mercado' : k === 'varias' ? 'Varias tiendas' : SP[k].n) + '</option>'; }).join('') + '</select></label>'
    + '<label>Total pagado (S/)<input id="cr-m" inputmode="decimal" value="' + sugerido + '"/></label></div>'
    + '<div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="cr-ok">Guardar</button></div>', 440);
  bg.querySelector('#cr-ok').onclick = async function() {
    var m = parseFloat(String(bg.querySelector('#cr-m').value).replace(',', '.'));
    if (!(m >= 0)) { showToast('Escribe el monto', true); return; }
    var r = await supa.from('cs_gastos').insert({ ambito: await listaAmbito(), tienda: bg.querySelector('#cr-t').value, monto: m, ahorro: Math.max(0, Math.round((caro - m) * 100) / 100), items: cmpItems.length, por: prQuien() });
    if (r.error) { showToast('No se pudo guardar', true); return; }
    bg.remove(); showToast('Compra registrada'); await cmpCargarPlata(); cmpExtras();
  };
}
function cmpWhatsApp() {
  var lineas = CMP_SECCIONES.map(function(sec) {
    var its = cmpItems.filter(function(it) { return (it.categoria || 'otros') === sec[0]; });
    return its.length ? '*' + sec[1] + '*\n' + its.map(function(it) { return '- ' + it.nombre + (it.cantidad ? ' (' + it.cantidad + ')' : ''); }).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  var t = 'Lista de compras' + (SP[cmpSuperActivo] && !CMP.dividir ? ' para ' + SP[cmpSuperActivo].n : '') + ':\n\n' + lineas + '\n\nHecha en Despensa.casa';
  window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
}

// Habituales: lo que siempre compras, con alerta cuando baja de precio
async function cmpHabitual(i) {
  var it = cmpItems[i], t = String(it.busqueda_sugerida || it.nombre).toLowerCase().slice(0, 80), amb = await listaAmbito();
  var ya = CMP.habituales.find(function(h) { return h.termino === t; });
  if (ya) { await supa.from('cs_habituales').delete().eq('id', ya.id); CMP.habituales = CMP.habituales.filter(function(h) { return h !== ya; }); showToast(it.nombre + ' ya no es habitual'); }
  else { var r = await supa.from('cs_habituales').insert({ ambito: amb, termino: t, nombre: it.nombre }).select().single(); if (!r.error) CMP.habituales.push(r.data); showToast('Te aviso cuando ' + it.nombre + ' baje de precio'); }
  renderCmpLista();
}
async function cmpRevisarHabituales() {
  var box = document.getElementById('cmp-habituales'); if (!box) return;
  if (!currentUser || !CMP.habituales.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="n-h"><h2>Lo que siempre compras</h2><span>buscando precios…</span></div>';
  var terms = CMP.habituales.map(function(h) { return h.termino; });
  var hoy = prHoy();
  var res = await Promise.all([
    fetch('/api/precios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terminos: terms }) }).then(function(r) { return r.json(); }).catch(function() { return {}; }),
    supa.from('cs_precios_hist').select('termino,tienda,precio,fecha').in('termino', terms).lt('fecha', hoy).order('fecha', { ascending: false }).limit(500)
  ]);
  var ant = {}; (res[1].data || []).forEach(function(h) { var k = h.termino + '|' + h.tienda; if (!ant[k]) ant[k] = []; if (ant[k].length < 6) ant[k].push(h); });
  var alertas = 0, hist = [];
  box.innerHTML = '<div class="n-h"><h2>Lo que siempre compras</h2><span>precio de hoy</span></div>' + CMP.habituales.map(function(h, i) {
    var fila = (res[0].resultados || [])[i] || {}, mejor = null, baja = null;
    CMP_TIENDAS.forEach(function(k) {
      var p = fila[k]; if (!p) return;
      hist.push({ ambito: dsAmb(), termino: h.termino, tienda: k, nombre: p.nombre, precio: p.precio, por_unidad: p.por_unidad, unidad: p.contenido ? p.contenido.unidad : null, fecha: hoy });
      if (!mejor || p.precio < mejor[1].precio) mejor = [k, p];
      var a = ant[h.termino + '|' + k];
      if (a && a[0] && p.precio < a[0].precio * 0.95) { var pct = Math.round((1 - p.precio / a[0].precio) * 100); if (!baja || pct > baja[1]) baja = [k, pct, a[0].precio, p.precio]; }
    });
    if (baja) alertas++;
    var serie = CMP_TIENDAS.map(function(k) { var a = ant[h.termino + '|' + k]; return a && a.length ? SP[k].n + ': ' + a.slice().reverse().map(function(x) { return 'S/' + (+x.precio).toFixed(2); }).join(' → ') : ''; }).filter(Boolean);
    return '<div class="n-row"><div class="n-row-top"><h3>' + prEsc(h.nombre) + '</h3>' + (mejor ? '<span class="cb-v">' + SP[mejor[0]].n + ' S/ ' + mejor[1].precio.toFixed(2) + '</span>' : '<span class="n-sub">sin precio hoy</span>') + '</div>'
      + (baja ? '<p><span class="n-lemon">Bajó ' + baja[1] + '% en ' + SP[baja[0]].n + '</span> <span class="n-sub">de S/ ' + (+baja[2]).toFixed(2) + ' a S/ ' + baja[3].toFixed(2) + '</span></p>' : '')
      + (serie.length ? '<details class="cl-hist"><summary>Historial de precios</summary><p class="n-sub">' + serie.map(prEsc).join('<br>') + '</p></details>' : '') + '</div>';
  }).join('');
  if (hist.length) supa.from('cs_precios_hist').upsert(hist, { onConflict: 'ambito,termino,tienda,fecha', ignoreDuplicates: true }).then(function() {});
  try { localStorage.setItem('cs_ofertas', JSON.stringify({ fecha: hoy, n: alertas })); } catch (e) {}
}

// Envoltorios: después de pintar la comparativa, mostrar los extras; al entrar a Precios, cargar plata y habituales
(function() {
  var orig = window.renderCmpSupers;
  if (orig) window.renderCmpSupers = function() { orig.apply(this, arguments); cmpExtras(); };
  var origShow = window.showSection;
  window.showSection = function(s) {
    origShow.apply(this, arguments);
    if (s === 'comparar' && currentUser) cmpCargarPlata().then(function() { cmpRevisarHabituales(); if (cmpItems.length) { cmpExtras(); renderCmpLista(); } });
  };
})();

// Lista compartida en vivo: mientras estás en Precios, trae los cambios de tu familia cada 15 s
setInterval(async function() {
  var sc = document.getElementById('scomparar');
  if (!currentUser || !sc || sc.classList.contains('hidden') || document.hidden || Date.now() - LISTA_TOCADA < 8000) return;
  try {
    var r = await supa.from('cs_lista_activa').select('updated_at,items,checked_items,supermercado').eq('user_id', await listaAmbito()).maybeSingle();
    if (r.data && r.data.updated_at && r.data.updated_at !== LISTA_VERSION) {
      LISTA_VERSION = r.data.updated_at;
      cmpItems = r.data.items || []; checkedItems = r.data.checked_items || {};
      if (r.data.supermercado) cmpSuperActivo = r.data.supermercado;
      document.getElementById('cmp-result').classList.toggle('hidden', !cmpItems.length);
      if (cmpItems.length) { renderCmpItems(); renderCmpSupers(); renderCmpLista(); updateCompraProgress(); }
    }
  } catch (e) {}
}, 15000);

// Costo por porción: costo de la tanda → costo por ml (se usa en el reporte de desperdicio)
function cmpCostoEnvase(r, ml) { return r && r.costo_ml ? Math.round(r.costo_ml * ml * 100) / 100 : null; }
