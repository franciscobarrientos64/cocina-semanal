// ── Libro de Reclamaciones: bandeja del titular (Ajustes > Reclamos) ─────────
// Solo la ve la cuenta admin (cs_es_admin en la base). El correo de aviso llega a hola@despensa.casa
// con el código y el link #reclamos; aquí está el detalle, el plazo y la respuesta.
var RC = { lista: [], admin: null };

async function rcAdmin(box) {
  if (!currentUser || !box) return;
  if (RC.admin === null) { var a = await supa.rpc('cs_es_admin'); RC.admin = !a.error && a.data === true; }
  if (!RC.admin) return;
  var r = await supa.from('cs_reclamos').select('*').order('creado', { ascending: false }).limit(100);
  if (r.error) return;
  RC.lista = r.data || [];
  var sec = document.getElementById('rc-sec') || document.createElement('section');
  sec.id = 'rc-sec';
  var pend = RC.lista.filter(function(x) { return !x.respondido; }).length;
  sec.innerHTML = '<div class="n-h"><h2>Reclamos</h2><span>' + (pend ? pend + ' por responder' : 'al día') + '</span></div>'
    + (RC.lista.length ? RC.lista.map(rcFila).join('') : '<div class="n-empty">Sin reclamos registrados.</div>')
    + '<p class="n-sub">Plazo legal: 15 días hábiles desde que llega. Responde desde hola@despensa.casa y guarda aquí la respuesta como constancia.</p>';
  box.insertBefore(sec, box.firstChild);
  if (RC.ir) { RC.ir = false; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function rcFila(x) {
  var hoy = new Date().toISOString().slice(0, 10), tarde = !x.respondido && x.vence && x.vence < hoy;
  var estado = x.respondido ? 'Respondido ' + String(x.respondido).slice(0, 10) : (x.vence ? 'Vence ' + x.vence.split('-').reverse().join('/') : '');
  return '<div class="n-row" style="cursor:pointer" onclick="rcVer(' + jsArg(x.id) + ')"><div><b>' + prEsc(x.codigo) + '</b> · ' + (x.tipo === 'queja' ? 'Queja' : 'Reclamo') + ' · ' + prEsc(x.nombre)
    + '<div class="n-sub"' + (tarde ? ' style="color:#BA1A1A"' : '') + '>' + prEsc(estado) + (tarde ? ' · fuera de plazo' : '') + '</div></div></div>';
}

function rcVer(id) {
  var x = RC.lista.find(function(r) { return r.id === id; });
  if (!x) return;
  var dato = function(k, v) { return v ? '<p><b>' + k + ':</b> ' + prEsc(String(v)) + '</p>' : ''; };
  var asunto = 'Respuesta a su ' + (x.tipo === 'queja' ? 'queja' : 'reclamo') + ' ' + x.codigo + ' · Despensa.casa';
  var bg = dsModal('<h3>' + prEsc(x.codigo) + ' · ' + (x.tipo === 'queja' ? 'Queja' : 'Reclamo') + '</h3>'
    + '<p class="sub">Registrado ' + prEsc(new Date(x.creado).toLocaleString('es-PE')) + (x.vence ? ' · responder hasta el ' + prEsc(x.vence.split('-').reverse().join('/')) : '') + '</p>'
    + dato('Nombre', x.nombre) + dato('Documento', x.documento) + dato('Domicilio', x.domicilio) + dato('Teléfono', x.telefono) + dato('Correo', x.email)
    + (x.menor ? dato('Apoderado', x.apoderado) : '') + dato('Producto o servicio', x.bien) + dato('Monto', x.monto) + dato('Descripción', x.descripcion)
    + dato('Detalle', x.detalle) + dato('Pedido', x.pedido)
    + '<label class="n-sub" for="rc-resp">Respuesta</label><textarea id="rc-resp" rows="6" style="width:100%">' + prEsc(x.respuesta || '') + '</textarea>'
    + '<div class="foot"><button class="pr-btn" id="rc-mail">Responder por correo</button><button class="pr-btn pr-btn-main" id="rc-ok">' + (x.respondido ? 'Actualizar' : 'Guardar como respondido') + '</button></div>', 620);
  bg.querySelector('#rc-mail').onclick = function() {
    var t = bg.querySelector('#rc-resp').value;
    location.href = 'mailto:' + encodeURIComponent(x.email || '') + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(t);
  };
  bg.querySelector('#rc-ok').onclick = async function() {
    var t = bg.querySelector('#rc-resp').value.trim();
    if (!t) { showToast('Escribe la respuesta primero', true); return; }
    var r = await supa.from('cs_reclamos').update({ respuesta: t, respondido: x.respondido || new Date().toISOString() }).eq('id', x.id);
    if (r.error) { showToast('No se pudo guardar: ' + r.error.message, true); return; }
    bg.remove(); showToast('Respuesta guardada'); ajRender();
  };
}

function rcRuta(h) {
  if (String(h || '').replace(/^#/, '') !== 'reclamos') return false;
  RC.ir = true; showSection('ajustes'); return true;
}
window.addEventListener('hashchange', function() { rcRuta(location.hash); });
window.addEventListener('load', function() { setTimeout(function() { rcRuta(location.hash); }, 400); });
