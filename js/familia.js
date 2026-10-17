// Despensa · FAMILIA Y COMUNIDAD: roles, tareas, modo ayuda en casa (con inglés), viaje a otra casa, notas y fotos por tanda,
// regalar excedentes, recetas compartidas entre hogares y reto cero desperdicio
var FAM = { rol: 'miembro', tareas: [], lang: 'es' };
var FAM_ROLES = [['miembro', 'Todo'], ['cocina', 'Cocina'], ['compras', 'Compras'], ['ayuda', 'Ayuda en casa'], ['lectura', 'Solo mirar']];
var I18N = { en: { 'Hoy se come': 'Eat today', 'Vence pronto': 'Use soon', 'Descongela hoy': 'Thaw today', 'Se comió': 'Eaten', 'Ya lo pasé': 'Done, moved', 'Tareas': 'Tasks', 'Nada para hoy': 'Nothing planned for today', 'Hecho': 'Done',
  'Almuerzo': 'Lunch', 'Cena': 'Dinner', 'Lonchera': 'Lunchbox', 'Está en': 'It is in', 'Para comerlo el': 'To eat on', 'Calentar': 'Reheat' } };
function t(s) { return FAM.lang !== 'es' && I18N[FAM.lang] && I18N[FAM.lang][s] || s; }

// Rol de quien está usando la app (lo define quien creó el hogar)
async function famCargarRol() {
  if (!currentUser || !PR.hogar) { FAM.rol = 'miembro'; return; }
  var r = await supa.from('cs_hogar_miembros').select('rol').eq('hogar_id', PR.hogar.id).eq('user_id', currentUser.id).maybeSingle();
  FAM.rol = (r.data && r.data.rol) || 'miembro';
  try { FAM.lang = localStorage.getItem('cs_lang') || 'es'; } catch (e) {}
  document.body.classList.toggle('modo-ayuda', FAM.rol === 'ayuda');
  document.body.classList.toggle('solo-mirar', FAM.rol === 'lectura');
}
function famPuede(accion) {
  if (FAM.rol === 'lectura') return false;
  if (FAM.rol === 'ayuda') return accion === 'comer' || accion === 'mover' || accion === 'tarea';
  return true;
}
async function famRol(id, rol) {
  var r = await supa.rpc('cs_cambiar_rol', { p_miembro: id, p_rol: rol });
  if (r.error) showToast('Solo quien creó el hogar cambia los roles', true); else showToast('Rol actualizado');
}

// Tareas de la casa
async function famTareas() {
  if (!currentUser) return [];
  var r = await supa.from('cs_tareas').select('*').eq('ambito', dsAmb()).eq('hecho', false).order('fecha', { nullsFirst: false });
  FAM.tareas = r.error ? [] : (r.data || []);
  return FAM.tareas;
}
function famTareasHTML(soloHoy) {
  var hoy = prHoy(), ts = FAM.tareas.filter(function(x) { return !soloHoy || !x.fecha || x.fecha <= hoy; });
  return '<div class="n-h"><h2>' + t('Tareas') + (ts.length ? ' <small>(' + ts.length + ')</small>' : '') + '</h2>' + (famPuede('editar') ? '<span><a class="n-link" onclick="famNuevaTarea()">Agregar</a></span>' : '') + '</div>'
    + (ts.length ? ts.map(function(x) { return '<div class="fam-t"><button class="cl-box" aria-label="' + t('Hecho') + '" onclick="famHecha(\'' + x.id + '\')"></button><div><b>' + prEsc(x.texto) + '</b><span class="n-sub">' + (x.para ? prEsc(x.para) : 'Cualquiera') + (x.fecha ? ' · ' + (x.fecha === hoy ? 'hoy' : prFecha(x.fecha)) : '') + '</span></div></div>'; }).join('')
      : '<p class="n-sub" style="padding:10px 0">Sin tareas pendientes.</p>');
}
function famNuevaTarea() {
  var nombres = ['Cualquiera'].concat((DS.perfiles || []).map(function(p) { return p.nombre; }));
  var bg = dsModal('<h3>Nueva tarea</h3><div class="grid"><label class="full">Qué hay que hacer<input id="ft-t" placeholder="Descongelar el pollo, comprar pan…"/></label>'
    + '<label>Para<select id="ft-p">' + nombres.map(function(n) { return '<option>' + prEsc(n) + '</option>'; }).join('') + '</select></label><label>Cuándo<input id="ft-f" type="date" value="' + prHoy() + '"/></label></div>'
    + '<div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="ft-ok">Guardar</button></div>', 440);
  bg.querySelector('#ft-ok').onclick = async function() {
    var tx = bg.querySelector('#ft-t').value.trim(); if (!tx) return;
    var p = bg.querySelector('#ft-p').value;
    await supa.from('cs_tareas').insert({ ambito: dsAmb(), texto: tx, para: p === 'Cualquiera' ? null : p, fecha: bg.querySelector('#ft-f').value || null, por: prQuien() });
    bg.remove(); await famTareas(); homeRender();
  };
}
async function famHecha(id) { await supa.from('cs_tareas').update({ hecho: true }).eq('id', id); await famTareas(); homeRender(); }

// Lo que se come hoy según Mi semana (para el modo ayuda y para Inicio)
async function famHoyHTML() {
  if (!currentUser) return '';
  var r = await supa.from('cs_menu').select('*').eq('ambito', dsAmb()).eq('fecha', prHoy());
  var its = r.data || []; if (!its.length && FAM.rol !== 'ayuda') return '';
  return '<div class="n-h"><h2>' + t('Hoy se come') + '</h2><span>' + PR_DAYS[new Date().getDay()][0].toLowerCase() + '</span></div>'
    + (its.length ? SEM_COMIDAS.map(function(c) { var x = its.filter(function(i) { return i.comida === c[0]; }); return x.length ? '<div class="sem-slot"><span class="sem-k">' + t(c[1]) + '</span><div class="sem-its">' + x.map(function(i) { var tanda = i.preparado_id && prRow(i.preparado_id); return '<span class="sem-it' + (tanda ? ' tanda' : '') + '"><span class="sem-n">' + prEsc(i.receta) + (tanda ? ' · ' + prEsc(prNombreAp(tanda.ubicacion)) : '') + '</span></span>'; }).join('') + '</div></div>' : ''; }).join('')
      : '<p class="n-sub" style="padding:10px 0">' + t('Nada para hoy') + '</p>');
}

// Viaje a otra casa: qué llevar de aquí y qué comprar allá
async function famViaje(destino) {
  var dias = prompt('¿Cuántos días van a estar en ' + destino + '?', '3'); if (!dias) return;
  var gente = prompt('¿Cuántas personas?', String((DS.perfiles || []).length || 4)); if (!gente) return;
  var bg = dsCargando('Armando la lista para ' + destino + '…');
  try {
    var aqui = PR.rows.filter(function(r) { return PR_APAR.some(function(a) { return a[0] === r.ubicacion; }); });
    var p = await iaJSON('Vamos a ' + destino + ' por ' + dias + ' días, ' + gente + ' personas. Tenemos esta comida ya preparada en la casa de donde salimos: ' + (aqui.map(function(r) { return r.nombre + ' (' + prTotal(r) + ' envases, id ' + r.id + ')'; }).join('; ') || 'nada')
      + '. Propón qué llevar (máximo lo necesario, priorizando lo que vence antes) y qué comprar allá para completar las comidas. Familia: ' + (dsResumenFamilia() || 'sin datos')
      + '. Responde SOLO JSON: {"llevar":[{"id":"","nombre":"","envases":1}],"comprar":["…"],"nota":""}', 1800);
    bg.remove();
    var llevar = (p.llevar || []).filter(function(x) { return prRow(x.id); });
    var m = dsModal('<h3>Viaje a ' + prEsc(destino) + '</h3><p class="sub">' + dias + ' días · ' + gente + ' personas' + (p.nota ? ' · ' + prEsc(p.nota) : '') + '</p>'
      + '<div class="n-h"><h2>Llevar de aquí</h2></div>' + (llevar.length ? llevar.map(function(x, k) { return '<label class="al-bol"><input type="checkbox" checked data-k="' + k + '"/><span>' + prEsc(prRow(x.id).nombre) + '<small>' + x.envases + ' envase' + (x.envases > 1 ? 's' : '') + '</small></span><b></b></label>'; }).join('') : '<p class="n-sub">Nada que llevar.</p>')
      + '<div class="n-h" style="margin-top:14px"><h2>Comprar allá</h2></div><p>' + (p.comprar || []).map(prEsc).join(', ') + '</p>'
      + '<div class="foot"><button class="pr-btn" data-x>Cerrar</button><button class="pr-btn pr-btn-main" id="fv-ok">Mover lo marcado a ' + prEsc(destino) + '</button></div>', 560);
    m.querySelector('#fv-ok').onclick = async function() {
      this.disabled = true;
      var esp = PR.espacios.filter(function(e) { return e.casa === destino; });
      for (var cb of m.querySelectorAll('input[data-k]:checked')) {
        var x = llevar[+cb.dataset.k], r = prRow(x.id); if (!r) continue;
        var dest = (esp.find(function(e) { return prFrio(r.ubicacion) ? e.tipo !== 'refri' : e.tipo === 'refri'; }) || esp[0]); if (!dest) continue;
        for (var i = 0; i < Math.min(x.envases || 1, prTotal(r)); i++) { var rr = prRow(x.id); if (!rr) break; var campo = PR_SIZES.map(function(s) { return s[0]; }).find(function(k) { return rr[k] > 0; }); await prMoverA(x.id, campo, dest.clave); }
      }
      m.remove();
      var lista = (p.comprar || []).join('\n');
      if (lista) { showSection('comparar'); var ta = document.getElementById('cmp-input'); ta.value = lista; showToast('Movido. Lista para comprar allá lista en Precios'); } else showToast('Listo, movido a ' + destino);
    };
  } catch (e) { bg.remove(); showToast('No pude armar el viaje: ' + e.message, true); }
}

// Notas y foto por tanda
async function famFoto(id) {
  var r = prRow(id); if (!r) return;
  var f = await dsElegirFoto(); if (!f) return;
  try {
    var b64 = await prReducir(f, 1200), bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var path = dsAmb() + '/' + id + '.jpg';
    var up = await supa.storage.from('cs-fotos').upload(path, new Blob([arr], { type: 'image/jpeg' }), { upsert: true, contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    await supa.from('cs_preparados').update({ foto: path }).eq('id', id);
    r.foto = path; showToast('Foto guardada');
  } catch (e) { showToast('No se pudo subir la foto', true); }
}
async function famVerFoto(path, el) {
  var s = await supa.storage.from('cs-fotos').createSignedUrl(path, 600);
  if (s.data && el) el.innerHTML = '<img src="' + s.data.signedUrl + '" alt="Foto de la tanda" style="width:100%;max-height:260px;object-fit:cover;margin-top:10px"/>';
}

// Regalar lo que sobra antes de que venza
function famRegalar(id) {
  var r = prRow(id); if (!r) return;
  var txt = 'Tengo ' + prTotal(r) + ' envase' + (prTotal(r) > 1 ? 's' : '') + ' de ' + r.nombre + (r.vence ? ' (vence el ' + prFecha(r.vence) + ')' : '') + ' para regalar. ¿Alguien lo quiere?';
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  setTimeout(async function() {
    if (!confirm('¿Ya lo regalaste? Lo saco del inventario.')) return;
    prLog(r, 'regala', r.ubicacion, null, r); await prBorrarFila(r); showToast(r.nombre + ' regalado');
  }, 1500);
}

// Compartir una receta propia con otra familia
async function famCompartirReceta(id) {
  var x = MR.lista.find(function(r) { return r.id === id; }); if (!x) return;
  await supa.from('cs_recetas').update({ compartida: true }).eq('id', id);
  var link = 'https://despensa.casa/#r-' + id;
  window.open('https://wa.me/?text=' + encodeURIComponent('Te paso la receta de "' + x.nombre + '" en Despensa.casa: ' + link), '_blank', 'noopener');
}
async function famAbrirCompartida(id) {
  var r = await supa.rpc('cs_receta_compartida', { p_id: id });
  var x = r.data && r.data[0];
  if (!x) { showToast('Esa receta ya no está compartida', true); return; }
  showSection('recetas');
  var pasos = (x.pasos || []).map(function(p) { return p.metodo || p; });
  var bg = dsModal('<h3>' + prEsc(x.nombre) + '</h3><p class="sub">Compartida' + (x.por ? ' por ' + prEsc(x.por) : '') + (x.tiempo ? ' · ' + prEsc(x.tiempo) : '') + (x.porciones ? ' · ' + x.porciones + ' porciones' : '') + '</p>'
    + '<div class="n-h"><h2>Ingredientes</h2></div><ul class="mr-ol">' + (x.ingredientes || []).map(function(i) { return '<li>' + prEsc(i) + '</li>'; }).join('') + '</ul>'
    + '<div class="n-h"><h2>Preparación</h2></div><ol class="mr-ol">' + pasos.map(function(p) { return '<li>' + prEsc(p) + '</li>'; }).join('') + '</ol>'
    + '<div class="foot"><button class="pr-btn" data-x>Cerrar</button><button class="pr-btn pr-btn-main" id="fc-ok">' + (currentUser ? 'Guardar en mis recetas' : 'Entra para guardarla') + '</button></div>', 600);
  bg.querySelector('#fc-ok').onclick = function() {
    if (!currentUser) { prGuardarPendiente('ruta', 'r-' + id); prEntrar(); return; }
    bg.remove(); mrRevisar({ nombre: x.nombre, porciones: x.porciones, tiempo: x.tiempo, ingredientes: x.ingredientes, pasos: pasos, img: x.img }, x.fuente_url);
  };
}

// Reto cero desperdicio: racha sin botar y meta del mes
async function famReto() {
  if (!currentUser) return '';
  var r = await supa.from('cs_movimientos').select('created_at').eq('ambito', dsAmb()).eq('accion', 'boto').order('created_at', { ascending: false }).limit(1);
  var ult = r.data && r.data[0] ? new Date(r.data[0].created_at) : null;
  var dias = ult ? Math.floor((Date.now() - ult.getTime()) / 864e5) : null;
  return '<div class="fam-reto"><span class="ms">eco</span><div><b>' + (dias == null ? 'Todavía no has botado nada' : dias === 0 ? 'Hoy se botó algo' : dias + ' día' + (dias > 1 ? 's' : '') + ' sin botar comida') + '</b><span class="n-sub">Reto cero desperdicio: la meta es no botar más de 2 envases al mes.</span></div></div>';
}
