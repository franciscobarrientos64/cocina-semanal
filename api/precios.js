// Precios reales: consulta el catálogo público (VTEX) de cada supermercado y devuelve el mejor resultado por producto.
// Las cinco tiendas usan VTEX y exponen /api/catalog_system/pub/products/search (Makro y Vivanda comparten plataforma con Plaza Vea).
export const config = { maxDuration: 30 };

const TIENDAS = {
  wong: 'https://www.wong.pe',
  metro: 'https://www.metro.pe',
  plazavea: 'https://www.plazavea.com.pe',
  makro: 'https://www.makro.plazavea.com.pe',
  vivanda: 'https://vivanda.vtexcommercestable.com.br',
};
const LINK = { vivanda: 'https://www.vivanda.com.pe' };
const quitarTildes = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Puntaje: cuántas palabras del término aparecen en el nombre del producto
// Penaliza procesados, combos y snacks que no se pidieron ("pechuga de pollo" no debe dar nuggets)
const PROCESADOS = /nugget|dedito|apanad|hamburguesa|chorizo|salchich|snack|galleta|chocolate|tableta|helado|jugo|bebida|refresco|sopa instant|bocadito|empanizad/;
function puntaje(nombre, termino) {
  const n = quitarTildes(nombre), t = quitarTildes(termino);
  let p = t.split(/\s+/).filter((w) => w.length > 2).reduce((a, w) => a + (n.includes(w) ? 1 : 0), 0);
  const m = n.match(PROCESADOS); if (m && !t.includes(m[0])) p -= 2;
  if (n.includes('+') && !t.includes('+')) p -= 1;
  if (/\bx\s*kg\b|granel/.test(n) && !/\d/.test(t)) p += 0.5;
  return p;
}
const MAX_ITEMS = 40;

// "Lata 405g", "Botella 900ml", "Bolsa 5kg", "Pack x6 ... 400g" → cantidad en kg o litros
function contenido(nombre) {
  const t = String(nombre).toLowerCase().replace(',', '.');
  const pack = t.match(/(?:pack|paquete)\s*x?\s*(\d+)\b/) || t.match(/\bx\s*(\d+)\s*(?:un|und|unid)?\b(?!\s*(?:g|kg|ml|l)\b)/) || t.match(/\b(\d+)\s*(?:un|und|unid|unidades)\b/);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|g|gr|grs|l|lt|litro|litros|ml|cc)\b/);
  if (!m) return /\bx\s*kg\b|\bkg\b$/.test(t) ? { cantidad: 1, unidad: 'kg' } : null;
  let v = parseFloat(m[1]); const u = m[2];
  let base = /^(kg|kilo)$/.test(u) ? v : /^(g|gr|grs)$/.test(u) ? v / 1000 : /^(l|lt|litro|litros)$/.test(u) ? v : v / 1000;
  const unidad = /^(kg|kilo|g|gr|grs)$/.test(u) ? 'kg' : 'l';
  if (pack && +pack[1] > 1 && +pack[1] < 50) base *= +pack[1];
  return { cantidad: base, unidad };
}

async function buscar(tienda, termino) {
  const url = `${TIENDAS[tienda]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=9`;
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Despensa.casa comparador)' } });
    if (!r.ok) return null;
    const data = await r.json();
    let mejor = null, mejorP = -1;
    for (const p of data || []) {
      const it = (p.items || [])[0]; const of = it && it.sellers && it.sellers[0] && it.sellers[0].commertialOffer;
      if (!of || !of.Price || of.AvailableQuantity === 0) continue;
      const pts = puntaje(p.productName, termino);
      if (pts <= mejorP) continue;
      mejorP = pts;
      const c = contenido(p.productName);
      mejor = {
        nombre: p.productName, precio: of.Price, precio_lista: of.ListPrice > of.Price ? of.ListPrice : null,
        url: `${LINK[tienda] || TIENDAS[tienda]}/${p.linkText}/p`, img: it.images && it.images[0] ? it.images[0].imageUrl : null,
        contenido: c, por_unidad: c && c.cantidad ? Math.round((of.Price / c.cantidad) * 100) / 100 : null,
      };
    }
    if (mejor && mejorP > 0) return mejor;
    return null;
  } catch { return null; } finally { clearTimeout(to); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  if (origin && !origin.includes(host) && !origin.includes('localhost') && !origin.includes('despensa.casa')) return res.status(403).json({ error: 'Origen no permitido' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const terminos = (Array.isArray(body.terminos) ? body.terminos : []).slice(0, MAX_ITEMS).map((t) => String(t || '').slice(0, 80)).filter(Boolean);
  if (!terminos.length) return res.status(400).json({ error: 'Faltan productos' });
  const out = await Promise.all(terminos.map(async (t) => {
    const fila = {};
    await Promise.all(Object.keys(TIENDAS).map(async (k) => { fila[k] = await buscar(k, t); }));
    return fila;
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ resultados: out, tiendas: Object.keys(TIENDAS) });
}
