// Despensa · MIS RECETAS: importar desde un link (blog, YouTube, TikTok) o texto, guardarlas y usarlas como cualquier receta
var MR = { lista: [] };

// Carga las recetas propias y las suma al recetario, al planificador y al modo cocina
async function mrCargar() {
  if (!currentUser) return;
  var r = await supa.from('cs_recetas').select('*').eq('ambito', dsAmb()).order('created_at', { ascending: false });
  MR.lista = r.error ? [] : (r.data || []);
  MR.lista.forEach(mrRegistrar);
  if (typeof renderRecetasGrid === 'function' && !document.getElementById('srecetas').classList.contains('hidden')) renderRecetasGrid();
  mrPintar();
}
function mrRegistrar(x) {
  RECIPES[x.nombre] = { tiempo: x.tiempo || '—', dif: 'Casera', dificultad: 'Casera', porciones: x.porciones || 4, utensilios: [],
    pasos: (x.pasos || []).map(function(p, i) { return { titulo: p.titulo || 'Paso ' + (i + 1), ingredientes: p.ingredientes || (i === 0 ? (x.ingredientes || []).join(', ') : ''), metodo: p.metodo || p }; }) };
  if (!ALL_RECIPES.some(function(a) { return a.n === x.nombre; })) ALL_RECIPES.unshift({ n: x.nombre, e: '📖', proteina: x.proteina || dsProteina(x.nombre) || 'vegetal', momento: 'fondo', tiempo: x.tiempo || '—', dif: 'Casera', restricciones: [],
    ingredientes_clave: (x.ingredientes || []).slice(0, 6).map(function(i) { return String(i).toLowerCase(); }), img: x.img || '', desc: x.fuente_url ? 'Guardada desde ' + mrDominio(x.fuente_url) : 'Receta de la casa', mia: true });
}
function mrDominio(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'un link'; } }

function mrPintar() {
  var box = document.getElementById('mr-box'); if (!box) return;
  box.innerHTML = '<div class="n-h"><h2>Mis recetas <small>(' + MR.lista.length + ')</small></h2><span>guardadas</span></div>'
    + '<div class="aj-row"><input id="mr-url" placeholder="Pega el link de una receta, un video o un TikTok" inputmode="url"/><button class="n-bt n-bt-p n-bt-sm" onclick="mrImportar(document.getElementById(\'mr-url\').value)">Guardar</button></div>'
    + '<p class="n-sub">¿No tiene link? <a class="n-link" onclick="mrTexto()">Pega el texto de la receta</a> · <a class="n-link" onclick="mrAtajo()">Guardar desde Instagram o TikTok con un atajo</a></p>'
    + (MR.lista.length ? '<div class="mr-lista">' + MR.lista.map(function(x) { return '<div class="hg-mem"><span class="av sq"><span class="ms">menu_book</span></span><div><b onclick="openRecetaModal(\'' + prEsc(x.nombre).replace(/'/g, "\\'") + '\')" style="cursor:pointer">' + prEsc(x.nombre) + '</b><span class="n-sub">' + (x.fuente_url ? mrDominio(x.fuente_url) : 'de la casa') + (x.por ? ' · guardada por ' + prEsc(x.por) : '') + '</span></div><button class="aj-x" aria-label="Compartir" title="Compartir por WhatsApp" onclick="famCompartirReceta(\'' + x.id + '\')"><span class="ms">share</span></button><button class="aj-x" aria-label="Quitar" onclick="mrQuitar(\'' + x.id + '\')"><span class="ms">delete</span></button></div>'; }).join('') + '</div>' : '');
}

async function mrImportar(url) {
  url = String(url || '').trim();
  if (!currentUser) { showToast('Entra con tu cuenta para guardar recetas', true); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('Pega un link que empiece con https://', true); return; }
  var bg = dsCargando('Leyendo la receta…');
  try {
    var r = await fetch('/api/receta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }) });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'no se pudo abrir');
    var rec = d.receta;
    if (!rec || !rec.ingredientes || !rec.ingredientes.length) rec = await mrEstructurar((d.titulo || '') + '\n' + (d.texto || ''));
    if (!rec.img && d.img) rec.img = d.img;
    bg.remove();
    mrRevisar(rec, url);
  } catch (e) { bg.remove(); showToast('No pude leer ese link: ' + e.message + '. Prueba pegando el texto.', true); }
}
async function mrEstructurar(texto) {
  var p = await iaJSON('Este texto viene de una receta (página web, descripción de video o publicación). Extrae la receta en español neutro. Si no hay una receta clara, devuelve nombre vacío.\n\n' + String(texto).slice(0, 10000)
    + '\n\nResponde SOLO JSON: {"nombre":"","porciones":4,"tiempo":"45 min","ingredientes":["…"],"pasos":["…"]}', 2500);
  return p;
}
function mrTexto() {
  var bg = dsModal('<h3>Pegar una receta</h3><p class="sub">Pega el texto tal cual: la descripción de un reel, un mensaje o una foto pasada a texto.</p><textarea id="mr-t" class="sem-q" style="min-height:200px"></textarea><div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="mr-tok">Ordenar receta</button></div>', 560);
  bg.querySelector('#mr-tok').onclick = async function() {
    var t = bg.querySelector('#mr-t').value.trim(); if (!t) return;
    this.disabled = true; this.textContent = 'Ordenando…';
    try { var rec = await mrEstructurar(t); bg.remove(); mrRevisar(rec, null); } catch (e) { showToast('No pude ordenarla: ' + e.message, true); this.disabled = false; this.textContent = 'Ordenar receta'; }
  };
}
function mrRevisar(rec, url) {
  if (!rec || !rec.nombre) { showToast('No encontré una receta ahí. Prueba pegando el texto.', true); return; }
  var pasos = (rec.pasos || []).map(function(p) { return typeof p === 'string' ? p : (p.metodo || p.text || ''); });
  var bg = dsModal('<h3>Guardar receta</h3><div class="grid"><label class="full">Nombre<input id="mr-n" value="' + prEsc(rec.nombre) + '"/></label>'
    + '<label>Porciones<input id="mr-p" type="number" min="1" value="' + (rec.porciones || 4) + '"/></label><label>Tiempo<input id="mr-ti" value="' + prEsc(String(rec.tiempo || '').replace(/^PT(\d+)M$/, '$1 min').replace(/^PT(\d+)H(\d+)?M?$/, function(m, h, mm) { return h + ' h' + (mm ? ' ' + mm + ' min' : ''); })) + '"/></label>'
    + '<label class="full">Ingredientes (uno por línea)<textarea id="mr-i" rows="6">' + prEsc((rec.ingredientes || []).join('\n')) + '</textarea></label>'
    + '<label class="full">Pasos (uno por línea)<textarea id="mr-s" rows="7">' + prEsc(pasos.join('\n')) + '</textarea></label></div>'
    + '<div class="foot"><button class="pr-btn" data-x>Cancelar</button><button class="pr-btn pr-btn-main" id="mr-ok">Guardar en mis recetas</button></div>', 620);
  bg.querySelector('#mr-ok').onclick = async function() {
    var nombre = bg.querySelector('#mr-n').value.trim(); if (!nombre) { showToast('Falta el nombre', true); return; }
    var ings = bg.querySelector('#mr-i').value.split('\n').map(function(x) { return x.trim(); }).filter(Boolean);
    var ps = bg.querySelector('#mr-s').value.split('\n').map(function(x) { return x.trim(); }).filter(Boolean).map(function(m, i) { return { titulo: 'Paso ' + (i + 1), metodo: m, ingredientes: i === 0 ? ings.join(', ') : '' }; });
    var img = rec.img && /^https:\/\//.test(rec.img) ? rec.img : null;
    var r = await supa.from('cs_recetas').insert({ ambito: dsAmb(), nombre: nombre, porciones: parseInt(bg.querySelector('#mr-p').value, 10) || 4, tiempo: bg.querySelector('#mr-ti').value.trim() || null,
      proteina: dsProteina(nombre + ' ' + ings.join(' ')), ingredientes: ings, pasos: ps, fuente_url: url, img: img, por: prQuien() });
    if (r.error) { showToast('No se pudo guardar', true); return; }
    bg.remove(); showToast(nombre + ' guardada en tus recetas'); var u = document.getElementById('mr-url'); if (u) u.value = '';
    mrCargar();
  };
}
async function mrQuitar(id) { await supa.from('cs_recetas').delete().eq('id', id); MR.lista = MR.lista.filter(function(x) { return x.id !== id; }); mrPintar(); }

// Paso a paso del atajo para guardar recetas desde el botón Compartir
function mrAtajo() {
  dsModal('<h3>Guardar recetas con un toque</h3>'
    + '<div class="n-h" style="margin-top:12px"><h2>iPhone · app Atajos</h2></div><ol class="mr-ol">'
    + '<li>Abre la app <b>Atajos</b> y toca <b>+</b> para crear uno nuevo. Ponle de nombre <b>Guardar en Despensa</b>.</li>'
    + '<li>Toca el ícono de información (i) y activa <b>Mostrar en hoja de compartir</b>. En "Tipos" deja solo <b>URL</b> y <b>Texto</b>.</li>'
    + '<li>Agrega la acción <b>Codificar URL</b> (usa la "Entrada del atajo").</li>'
    + '<li>Agrega la acción <b>Texto</b> y escribe <code>https://despensa.casa/#receta=</code> seguido del resultado de "Codificar URL".</li>'
    + '<li>Agrega la acción <b>Abrir URL</b> con ese texto. Guarda.</li>'
    + '<li>Listo: en Instagram, TikTok, YouTube o una web toca <b>Compartir → Guardar en Despensa</b>. Se abre Despensa y la receta se lee sola.</li></ol>'
    + '<div class="n-h"><h2>Android</h2></div><ol class="mr-ol"><li>Instala Despensa en tu pantalla de inicio (menú del navegador → <b>Agregar a la pantalla principal</b>).</li><li>Luego, en cualquier app, toca <b>Compartir → Despensa</b>.</li></ol>'
    + '<p class="n-sub">Instagram no deja leer los reels desde afuera: si la receta está en la descripción, al compartir copia también el texto, o usa "Pega el texto de la receta".</p>'
    + '<div class="foot"><span></span><button class="pr-btn pr-btn-main" data-x>Entendido</button></div>', 560);
}

// Al cargar la página con #receta=… (desde el atajo o compartir), importar directo
function mrDesdeRuta(h) {
  var m = String(h || '').match(/^#?receta=([\s\S]+)/); if (!m) return false;
  var v = ''; try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; }
  history.replaceState(null, '', location.pathname);
  showSection('recetas');
  var url = (v.match(/https?:\/\/\S+/) || [])[0];
  var ir = function() { if (url) mrImportar(url); else if (v.trim()) mrEstructurar(v).then(function(r) { mrRevisar(r, null); }); };
  if (currentUser) setTimeout(ir, 400); else { prGuardarPendiente('ruta', 'receta=' + encodeURIComponent(v)); showToast('Entra con Google para guardar la receta'); }
  return true;
}
