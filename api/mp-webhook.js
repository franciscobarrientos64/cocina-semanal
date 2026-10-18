// Avisos de Mercado Pago (suscripciones). Verifica la firma x-signature con MP_WEBHOOK_SECRET y
// luego consulta la suscripción a la API de MP: el cuerpo del aviso nunca se usa como verdad.
import crypto from 'node:crypto';
import { mp, aplicarPreapproval } from './_mp.js';

function firmaOk(req, dataId) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  const sig = String(req.headers['x-signature'] || ''), rid = String(req.headers['x-request-id'] || '');
  if (!secreto || !sig || !dataId) return false;
  const partes = Object.fromEntries(sig.split(',').map((x) => x.trim().split('=')).filter((x) => x.length === 2));
  if (!partes.ts || !partes.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(partes.ts) / (partes.ts.length > 11 ? 1000 : 1)) > 600) return false;
  const manifest = 'id:' + dataId + ';' + (rid ? 'request-id:' + rid + ';' : '') + 'ts:' + partes.ts + ';';
  const esperado = crypto.createHmac('sha256', secreto).update(manifest).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(String(partes.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const q = req.query || {}, body = req.body || {};
  const tipo = String(q.type || q.topic || body.type || '');
  let dataId = String(q['data.id'] || (body.data && body.data.id) || '');
  if (/^[a-z0-9]+$/i.test(dataId)) dataId = dataId.toLowerCase();
  if (!firmaOk(req, dataId)) return res.status(401).json({ ok: false });
  try {
    if (tipo === 'subscription_preapproval') {
      await aplicarPreapproval(dataId);
    } else if (tipo === 'subscription_authorized_payment') {
      const pago = await mp('/authorized_payments/' + encodeURIComponent(dataId));
      if (pago.preapproval_id) await aplicarPreapproval(pago.preapproval_id);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    // 500 hace que Mercado Pago reintente más tarde
    return res.status(500).json({ ok: false });
  }
}
