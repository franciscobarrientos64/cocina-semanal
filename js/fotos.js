// Despensa · fotos reales de cada plato (img/recetas/mapa.json); se aplican al recetario, al planificador y a Inicio
(function() {
  var norm = function(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  fetch('/img/recetas/mapa.json').then(function(r) { return r.json(); }).then(function(m) {
    var mapa = {}; Object.keys(m).forEach(function(k) { mapa[norm(k)] = m[k]; });
    var poner = function(lista) { (lista || []).forEach(function(x) { var f = mapa[norm(x.n)]; if (f) x.img = f; }); };
    if (typeof PL !== 'undefined') poner(PL);
    if (typeof ALL_RECIPES !== 'undefined') poner(ALL_RECIPES);
    try { if (typeof renderFeat === 'function') renderFeat(); } catch (e) {}
    try { if (!document.getElementById('srecetas').classList.contains('hidden')) renderRecetasGrid(); } catch (e) {}
    try { if (!document.getElementById('splan').classList.contains('hidden') && typeof renderG === 'function') renderG(); } catch (e) {}
  }).catch(function() {});
})();
