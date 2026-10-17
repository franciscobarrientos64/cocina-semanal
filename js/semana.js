// Despensa · MI SEMANA: calendario de comidas, "¿qué cocino?", loncheras, cocina en tanda y lista de compras
var SEM = { off: 0, items: [] };
var SEM_COMIDAS = [['lonchera', 'Lonchera'], ['almuerzo', 'Almuerzo'], ['cena', 'Cena']];
var SEM_PROT = [['pollo', 'Pollo'], ['res', 'Res'], ['pescado', 'Pescado'], ['cerdo', 'Cerdo'], ['mariscos', 'Mariscos'], ['vegetal', 'Vegetal']];

async function semRender() {
  var box = document.getElementById('sem-content');
  if (!box) return;
  if (!currentUser) {
    box.innerHTML = semHero('') + '<div class="n-empty">Entra con tu cuenta para planificar la semana con lo que ya tienes cocinado.<button class="n-bt n-bt-p n-bt-sm" onclick="prEntrar()">Entrar con Google</button></div>'
      + '<div class="n-row-foot" style="padding:16px 0"><span class="n-sub">¿Solo quieres la lista de compras?</span><a class="n-link" onclick="showSection(\'plan\')">Armar lista sin cuenta →</a></div>';
    return;
  }
  await prCargar(); await dsPerfiles();
  var dias = dsSemana(SEM.off);
  var r = await supa.from('cs_menu').select('*').eq('ambito', dsAmb()).gte('fecha', dias[0]).lte('fecha', dias[6]).order('created_at');
  SEM.items = r.error ? [] : (r.data || []);
  var conLonchera = (DS.perfiles || []).some(function(p) { return p.lonchera; });
  var comidas = SEM_COMIDAS.filter(function(c) { return c[0] !== 'lonchera' || conLonchera || SEM.items.some(function(i) { return i.comida === 'lonchera'; }); });
  var f = function(iso) { var p = iso.split('-'); return +p[2] + '/' + +p[1]; };
  box.innerHTML = semHero(f(dias[0]) + ' – ' + f(dias[6]))
    + '<div class="sem-acts">'
    + '<button class="n-mini" onclick="semQueCocino()"><span class="ms">auto_awesome</span>¿Qué cocino?</button>'
    + (conLonchera ? '<button class="n-mini n-mini-l" onclick="semLoncheras()"><span class="ms">lunch_dining</span>Loncheras</button>' : '')
    + '<button class="n-mini n-mini-l" onclick="semTanda()"><span class="ms">skillet</span>Cocinar en tanda</button>'
    + '<button class="n-mini n-mini-l" onclick="semLista()"><span class="ms">shopping_cart</span>Lista de compras</button></div>'
    + semBalance()
    + dias.map(function(iso) {
        var d = new Date(iso + 'T12:00:00'), day = PR_DAYS[d.getDay()], hoy = iso === prHoy(), claro = /e8c21c|e98a1f/i.test(day[1]);
        return '<section class="sem-dia' + (hoy ? ' hoy' : '') + (iso < prHoy() ? ' pasado' : '') + '"><div class="sem-dh"><span class="n-tape" style="background:' + day[1] + ';color:' + (claro ? '#141414' : '#fff') + '">' + day[0].slice(0, 3) + ' ' + d.getDate() + '</span>' + (hoy ? '<span class="n-h-k">hoy</span>' : '') + '</div>'
          + comidas.map(function(c) {
              var its = SEM.items.filter(function(i) { return i.fecha === iso && i.comida === c[0]; });
              return '<div class="sem-slot"><span class="sem-k">' + c[1] + '</span><div class="sem-its">'
                + its.map(function(i) {
                    var tanda = i.preparado_id && prRow(i.preparado_id);
                    return '<span class="sem-it' + (i.preparado_id ? ' tanda' : '') + '" title="' + (i.preparado_id ? 'Ya cocinado' : 'Por cocinar') + '">' + (i.preparado_id ? '<span class="ms">' + (tanda && prFrio(tanda.ubicacion) ? 'ac_unit' : 'kitchen') + '</span>' : '')
                      + '<span class="sem-n" onclick="semAbrir(\'' + i.id + '\')">' + prEsc(i.receta) + '</span><button aria-label="Quitar" onclick="semQuitar(\'' + i.id + '\')">×</button></span>';
                  }).join('')
                + '<button class="sem-add" aria-label="Agregar" onclick="semAgregar(\'' + iso + '\',\'' + c[0] + '\')">+</button></div></div>';
            }).join('') + '</section>';
      }).join('');
}
function semHero(rango) {
  return '<section class="n-hero" style="padding-left:0;padding-right:0"><h1><span>Mi</span> <b>semana</b></h1>'
    + (rango ? '<div class="sem-nav"><button class="n-mini n-mini-l" aria-label="Semana anterior" onclick="SEM.off--;semRender()">‹</button><span>' + rango + '</span><button class="n-mini n-mini-l" aria-label="Semana siguiente" onclick="SEM.off++;semRender()">›</button>' + (SEM.off ? '<a class="n-link" onclick="SEM.off=0;semRender()">Hoy</a>' : '') + '</div>' : '')
    + '</section>';
}
// Balance simple de proteínas en la semana (sin contar calorías)
function semBalance() {
  var c = {};
  SEM.items.filter(function(i) { return i.comida !== 'lonchera'; }).forEach(function(i) { var p = dsProteina(i.receta); if (p) c[p] = (c[p] || 0) + 1; });
  if (!Object.keys(c).length) return '';
  var faltan = [];
  if (!c.pescado) faltan.push('pescado');
  if (!c.vegetal) faltan.push('un día sin carne (menestras, verduras)');
  return '<div class="sem-bal"><div class="n-h"><h2>Balance de la semana</h2><span>proteínas</span></div><div class="sem-bal-c">'
    + SEM_PROT.filter(function(p) { return c[p[0]]; }).map(function(p) { return '<span class="n-size">' + p[1] + ' ×' + c[p[0]] + '</span>'; }).join('')
    + '</div>' + (faltan.length ? '<p class="n-sub">Esta semana falta ' + faltan.join(' y ') + '.</p>' : '<p class="n-sub">Semana variada.</p>') + '</div>';
}

// Agregar algo a un día: algo ya cocinado (refri o congeladora), una receta o texto libre
function semAgregar(fecha, comida) {
  var tandas = (PR.rows || []).slice().sort(function(a, b) { return (a.vence || '9') < (b.vence || '9') ? -1 : 1; });
  var recs = dsRecetas();
  var bg = dsModal('<h3>' + SEM_COMIDAS.find(function(c) { return c[0] === comida; })[1] + ' · ' + PR_DAYS[new Date(fecha + 'T12:00:00').getDay()][0] + '</h3>'
    + '<input id="sem-q" class="sem-q" placeholder="Busca o escribe un plato" autocomplete="off"/>'
    + '<div id="sem-lista" class="sem-lista"></div><div class="foot"><span></span><button class="pr-btn" data-x>Cerrar</button></div>', 520);
  var pintar = function() {
    var q = bg.querySelector('#sem-q').value.trim().toLowerCase();
    var t = tandas.filter(function(r) { return !q || r.nombre.toLowerCase().indexOf(q) >= 0; });
    var rr = recs.filter(function(r) { return !q || r.n.toLowerCase().indexOf(q) >= 0; }).slice(0, q ? 30 : 12);
    bg.querySelector('#sem-lista').innerHTML = (q && !rr.some(function(r) { return r.n.toLowerCase() === q; }) ? '<button class="sem-op" data-txt="' + prEsc(bg.querySelector('#sem-q').value.trim()) + '"><span class="ms">add</span>Agregar "' + prEsc(bg.querySelector('#sem-q').value.trim()) + '"</button>' : '')
      + (t.length ? '<p class="sem-gr">Ya cocinado</p>' + t.map(function(r) { return '<button class="sem-op" data-tanda="' + r.id + '"><span class="ms">' + (prFrio(r.ubicacion) ? 'ac_unit' : 'kitchen') + '</span><span>' + prEsc(r.nombre) + '<small>' + prEsc(prNombreAp(r.ubicacion)) + ' · ' + prTotal(r) + ' envases' + (r.vence ? ' · vence ' + prFecha(r.vence) : '') + '</small></span></button>'; }).join('') : '')
      + '<p class="sem-gr">Recetas</p>' + rr.map(function(r) { return '<button class="sem-op" data-txt="' + prEsc(r.n) + '"><span class="ms">menu_book</span><span>' + prEsc(r.n) + '</span></button>'; }).join('');
  };
  pintar();
  bg.querySelector('#sem-q').addEventListener('input', pintar);
  bg.querySelector('#sem-q').addEventListener('keydown', function(e) { if (e.key === 'Enter' && this.value.trim()) semGuardar(fecha, comida, this.value.trim(), null, bg); });
  bg.querySelector('#sem-lista').addEventListener('click', function(e) {
    var b = e.target.closest('.sem-op'); if (!b) return;
    if (b.dataset.tanda) { var r = prRow(b.dataset.tanda); semGuardar(fecha, comida, r.nombre, r, bg); }
    else semGuardar(fecha, comida, b.dataset.txt, null, bg);
  });
  setTimeout(function() { bg.querySelector('#sem-q').focus(); }, 50);
}
async function semGuardar(fecha, comida, receta, tanda, bg) {
  var ins = await supa.from('cs_menu').insert({ ambito: dsAmb(), fecha: fecha, comida: comida, receta: receta, preparado_id: tanda ? tanda.id : null, por: prQuien() });
  if (ins.error) { showToast('No se pudo agregar', true); return; }
  // Si está congelado y es para un día futuro, queda marcado para descongelar ese día
  if (tanda && prFrio(tanda.ubicacion) && fecha >= prHoy() && (!tanda.descongelar_para || tanda.descongelar_para > fecha)) {
    await supa.from('cs_preparados').update({ descongelar_para: fecha }).eq('id', tanda.id);
    showToast(receta + ': te aviso para descongelarlo');
  } else showToast(receta + ' agregado');
  if (bg) bg.remove();
  semRender();
}
async function semQuitar(id) { await supa.from('cs_menu').delete().eq('id', id); semRender(); }
function semAbrir(id) {
  var i = SEM.items.find(function(x) { return x.id === id; });
  if (!i) return;
  if (i.preparado_id) { showSection('stock'); return; }
  if (typeof openRecetaModal === 'function') openRecetaModal(i.receta);
}

// ¿Qué cocino? — sugerencias con lo que hay y lo que vence primero
async function semQueCocino() {
  var bg = dsCargando('Pensando qué cocinar…');
  try {
    var p = await iaJSON('Eres un cocinero de casa peruano y práctico. Con lo que hay en la casa, sugiere 4 opciones para las próximas comidas, priorizando lo que vence primero y lo ya cocinado.\n'
      + 'Inventario de comida preparada: ' + (dsInventarioTexto() || 'vacío') + '.\n'
      + 'Familia: ' + (dsResumenFamilia() || 'sin datos') + '. Respeta alergias y lo que no comen.\n'
      + 'Recetas que conocemos: ' + dsRecetas().map(function(r) { return r.n; }).join(', ') + '.\n'
      + 'Hoy es ' + PR_DAYS[new Date().getDay()][0] + '. Responde SOLO JSON: {"sugerencias":[{"plato":"","por_que":"una línea","usa":["…"],"ya_cocinado":true}]}', 1200);
    bg.remove();
    var s = p.sugerencias || [];
    var m = dsModal('<h3>¿Qué cocino?</h3><p class="sub">Con lo que tienes y lo que vence primero.</p>'
      + s.map(function(x, k) { return '<div class="n-row"><div class="n-row-top"><h3>' + prEsc(x.plato) + '</h3><button class="n-mini" data-k="' + k + '">A hoy</button></div><p class="n-sub">' + prEsc(x.por_que || '') + '</p>' + (x.usa && x.usa.length ? '<div class="n-tags">' + x.usa.map(function(u) { return '<span class="n-size">' + prEsc(u) + '</span>'; }).join('') + '</div>' : '') + '</div>'; }).join('')
      + '<div class="foot"><span></span><button class="pr-btn" data-x>Cerrar</button></div>', 560);
    m.addEventListener('click', function(e) {
      var b = e.target.closest('[data-k]'); if (!b) return;
      var x = s[+b.dataset.k], tanda = (PR.rows || []).find(function(r) { return r.nombre.toLowerCase() === String(x.plato).toLowerCase(); });
      semGuardar(prHoy(), new Date().getHours() < 16 ? 'almuerzo' : 'cena', x.plato, tanda || null, m);
    });
  } catch (e) { bg.remove(); showToast('No pude sugerir ahora: ' + e.message, true); }
}

// Loncheras de lunes a viernes para quienes llevan
async function semLoncheras() {
  var quienes = (DS.perfiles || []).filter(function(p) { return p.lonchera; });
  var dias = dsSemana(SEM.off).slice(0, 5).filter(function(d) { return d >= prHoy(); });
  if (!dias.length) { showToast('Esta semana ya pasó; ve a la siguiente', true); return; }
  var bg = dsCargando('Armando loncheras…');
  try {
    var p = await iaJSON('Arma loncheras escolares peruanas, sencillas y variadas, para estos días: ' + dias.join(', ') + '.\n'
      + 'Para: ' + quienes.map(function(q) { return q.nombre + (q.edad ? ' (' + q.edad + ' años)' : '') + (q.alergias ? ', alergia a ' + q.alergias : '') + (q.no_come ? ', no come ' + q.no_come : ''); }).join('; ') + '.\n'
      + 'Usa primero lo que hay: ' + (dsInventarioTexto() || 'nada preparado') + '. Una lonchera por día: algo principal, una fruta y una bebida.\n'
      + 'Responde SOLO JSON: {"dias":[{"fecha":"AAAA-MM-DD","lonchera":"texto corto"}]}', 1200);
    bg.remove();
    var ds = (p.dias || []).filter(function(d) { return dias.indexOf(d.fecha) >= 0; });
    var m = dsModal('<h3>Loncheras</h3><p class="sub">Para ' + quienes.map(function(q) { return prEsc(q.nombre); }).join(', ') + '.</p>'
      + ds.map(function(d) { return '<div class="n-row"><div class="n-tags">' + prCinta(d.fecha) + '</div><p>' + prEsc(d.lonchera) + '</p></div>'; }).join('')
      + '<div class="foot"><button class="pr-btn" data-x>Cerrar</button><button class="pr-btn pr-btn-main" id="sem-l-ok">Agregar a la semana</button></div>', 560);
    m.querySelector('#sem-l-ok').onclick = async function() {
      this.disabled = true;
      await supa.from('cs_menu').insert(ds.map(function(d) { return { ambito: dsAmb(), fecha: d.fecha, comida: 'lonchera', receta: d.lonchera, por: prQuien() }; }));
      m.remove(); showToast('Loncheras agregadas'); semRender();
    };
  } catch (e) { bg.remove(); showToast('No pude armar las loncheras: ' + e.message, true); }
}

// Día de cocina en tanda: orden de trabajo, tiempos y tapers
async function semTanda() {
  var recetas = [];
  SEM.items.forEach(function(i) { if (!i.preparado_id && i.comida !== 'lonchera' && recetas.indexOf(i.receta) < 0) recetas.push(i.receta); });
  if (!recetas.length && typeof sel !== 'undefined') recetas = sel.slice();
  if (!recetas.length) { showToast('Agrega a la semana los platos que vas a cocinar', true); return; }
  var bg = dsCargando('Armando tu día de cocina…');
  try {
    var p = await iaJSON('Soy una persona que cocina en tanda el fin de semana para congelar en tapers de 250 ml, 500 ml y 1 L. Voy a cocinar: ' + recetas.join(', ') + ' para ' + ((DS.perfiles || []).length || pers || 4) + ' personas.\n'
      + 'Dame el orden de trabajo para hacerlo todo en una sola sesión en una cocina de casa (aprovechando tiempos muertos: mientras algo hierve, picar lo siguiente), y cuántos tapers de cada tamaño necesito y cuánto rinde cada receta.\n'
      + 'Responde SOLO JSON: {"tiempo_total_min":0,"pasos":[{"min":0,"receta":"","tarea":""}],"tapers":{"n250":0,"n500":0,"n1000":0},"rinde":[{"receta":"","porciones":0,"tapers":"ej. 4 × 500 ml"}]}', 2500);
    bg.remove();
    SEM.tanda = recetas;
    var t = p.tapers || {};
    dsModal('<h3>Cocinar en tanda</h3><p class="sub">' + recetas.map(prEsc).join(' · ') + ' — unas ' + Math.round((p.tiempo_total_min || 0) / 60 * 10) / 10 + ' horas</p>'
      + '<div class="n-tags" style="margin:6px 0 14px"><span class="n-lemon">Tapers</span><span class="n-size">250 ml ×' + (t.n250 || 0) + '</span><span class="n-size">500 ml ×' + (t.n500 || 0) + '</span><span class="n-size">1 L ×' + (t.n1000 || 0) + '</span></div>'
      + '<ol class="sem-ord">' + (p.pasos || []).map(function(s) { return '<li><b>' + (s.min != null ? 'min ' + s.min : '') + '</b><span>' + prEsc(s.tarea) + (s.receta ? ' <small>· ' + prEsc(s.receta) + '</small>' : '') + '</span></li>'; }).join('') + '</ol>'
      + ((p.rinde || []).length ? '<div class="n-h" style="margin-top:14px"><h2>Rinde</h2></div>' + p.rinde.map(function(r) { return '<div class="n-row-foot" style="padding:8px 0;border-bottom:1px solid var(--bo)"><span>' + prEsc(r.receta) + '</span><span class="n-sub">' + (r.porciones || '') + ' porciones · ' + prEsc(r.tapers || '') + '</span></div>'; }).join('') : '')
      + '<div class="foot"><button class="pr-btn" data-x>Cerrar</button><button class="pr-btn pr-btn-main" onclick="this.closest(\'.pr-modal-bg\').remove();openCocina(SEM.tanda)">Modo cocina</button></div>', 620);
  } catch (e) { bg.remove(); showToast('No pude armar el plan: ' + e.message, true); }
}

// Lleva los platos por cocinar de la semana al planificador (lista de compras y precios)
async function semLista() {
  var recetas = [];
  SEM.items.forEach(function(i) { if (!i.preparado_id && i.comida !== 'lonchera' && recetas.indexOf(i.receta) < 0) recetas.push(i.receta); });
  if (!recetas.length) { showToast('Agrega a la semana los platos que vas a cocinar', true); return; }
  sel = recetas;
  var n = (DS.perfiles || []).length; if (n) pers = n;
  showSection('plan'); goS(2);
  showToast(recetas.length + ' platos de tu semana listos para la lista');
}
