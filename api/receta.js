// Importa una receta desde un link (blog, YouTube, TikTok). Lee el JSON-LD "Recipe" si existe; si no, devuelve el texto
// para que la IA la estructure. Protegido contra SSRF: solo http(s) públicos, sin IPs privadas, tamaño y tiempo limitados.
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { exigirUsuario } from './_auth.js';
export const config = { maxDuration: 20 };

const MAX_BYTES = 1_500_000;
function ipPrivada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  // IPv6: solo direcciones globales (2000::/3), sin 6to4 ni documentación
  const v = ip.toLowerCase();
  return !/^[23][0-9a-f]{3}:/.test(v) || v.startsWith('2002:') || v.startsWith('2001:db8') || v.startsWith('2001:0db8');
}
async function urlSegura(raw) {
  let u; try { u = new URL(String(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname;
  if (net.isIP(host) || /^localhost$|\.local$|\.internal$/i.test(host)) return null;
  try { const ips = await dns.lookup(host, { all: true }); if (!ips.length || ips.some((x) => ipPrivada(x.address))) return null; } catch { return null; }
  return u;
}
// Conecta solo a la IP que validamos: el lookup se hace una vez y se usa para el socket (sin ventana de DNS rebinding)
function lookupSeguro(host, opts, cb) {
  dns.lookup(host, { all: true }).then((ips) => {
    if (!ips.length || ips.some((x) => ipPrivada(x.address))) return cb(new Error('IP no permitida'));
    if (opts && opts.all) return cb(null, ips);
    cb(null, ips[0].address, ips[0].family);
  }, cb);
}
function traer(u, saltos = 0) {
  return new Promise((ok) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { lookup: lookupSeguro, timeout: 9000, headers: { 'user-agent': 'Mozilla/5.0 (Despensa.casa recetas)', accept: 'text/html,application/json' } }, async (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && saltos < 3) {
        r.resume();
        const sig = await urlSegura(new URL(r.headers.location, u).toString());
        return ok(sig ? await traer(sig, saltos + 1) : null);
      }
      if (r.statusCode !== 200) { r.resume(); return ok(null); }
      let total = 0; const chunks = [];
      r.on('data', (c) => { total += c.length; if (total > MAX_BYTES) { r.destroy(); return; } chunks.push(c); });
      r.on('close', () => ok(Buffer.concat(chunks).toString('utf8')));
      r.on('error', () => ok(null));
    });
    req.on('timeout', () => { req.destroy(); ok(null); });
    req.on('error', () => ok(null));
  });
}
function recetaJsonLd(html) {
  const bloques = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const buscar = (o) => {
    if (!o || typeof o !== 'object') return null;
    if (Array.isArray(o)) { for (const x of o) { const r = buscar(x); if (r) return r; } return null; }
    const t = o['@type']; if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    return buscar(o['@graph']);
  };
  for (const b of bloques) { try { const r = buscar(JSON.parse(b)); if (r) return r; } catch {} }
  return null;
}
const limpiar = (t) => String(t || '').replace(/<[^>]*>?/g, ' ').replace(/[<>]/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!(await exigirUsuario(req, res, 'receta', 40))) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const u = await urlSegura(body.url);
  if (!u) return res.status(400).json({ error: 'Ese link no se puede abrir' });
  // TikTok: el texto del video sale por oEmbed (público)
  if (/(^|\.)tiktok\.com$/i.test(u.hostname)) {
    const o = await traer(new URL('https://www.tiktok.com/oembed?url=' + encodeURIComponent(u.toString())));
    try { const j = JSON.parse(o || '{}'); return res.json({ fuente: 'tiktok', titulo: j.title || '', texto: j.title || '', img: j.thumbnail_url || null }); } catch { return res.status(422).json({ error: 'No pude leer el TikTok' }); }
  }
  const html = await traer(u);
  if (!html) return res.status(422).json({ error: 'No pude abrir la página' });
  const r = recetaJsonLd(html);
  if (r) {
    const pasos = (Array.isArray(r.recipeInstructions) ? r.recipeInstructions : [r.recipeInstructions]).flatMap((p) => p && p.itemListElement ? p.itemListElement : [p]).map((p) => limpiar(typeof p === 'string' ? p : p && (p.text || p.name))).filter(Boolean);
    const img = Array.isArray(r.image) ? (r.image[0] && (r.image[0].url || r.image[0])) : (r.image && (r.image.url || r.image));
    return res.json({ fuente: 'jsonld', receta: { nombre: limpiar(r.name), porciones: parseInt(String(r.recipeYield || '').match(/\d+/) || 0, 10) || null,
      tiempo: limpiar(r.totalTime || r.cookTime || ''), ingredientes: (r.recipeIngredient || []).map(limpiar).filter(Boolean), pasos, img: typeof img === 'string' ? img : null } });
  }
  const titulo = limpiar((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const desc = limpiar((html.match(/<meta[^>]+(?:name|property)="(?:og:)?description"[^>]+content="([^"]*)"/i) || [])[1]);
  const cuerpo = limpiar(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')).slice(0, 12000);
  const og = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i) || [])[1] || null;
  return res.json({ fuente: 'texto', titulo, texto: (desc ? desc + '\n' : '') + cuerpo, img: og });
}
