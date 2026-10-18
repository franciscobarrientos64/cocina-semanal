// Crea la suscripción mensual en Mercado Pago y devuelve el link de pago (init_point).
import { exigirUsuario } from './_auth.js';
import { PLANES, mp } from './_mp.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await exigirUsuario(req, res, 'pago', 10);
  if (!u) return;
  const plan = String((req.body && req.body.plan) || '');
  if (!PLANES[plan]) return res.status(400).json({ error: { message: 'Plan desconocido' } });
  if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_WEBHOOK_SECRET || !process.env.MP_DB_TOKEN) {
    return res.status(503).json({ error: { message: 'Los pagos se activan en unos días; mientras tanto todo es gratis.' } });
  }
  try {
    const p = await mp('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: PLANES[plan].nombre,
        external_reference: u.id + ':' + plan,
        payer_email: u.email,
        back_url: 'https://despensa.casa/#planes',
        status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: PLANES[plan].monto, currency_id: 'PEN' },
      }),
    });
    return res.status(200).json({ url: p.init_point });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Mercado Pago no respondió; prueba en un momento.' } });
  }
}
