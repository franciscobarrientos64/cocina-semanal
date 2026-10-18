// Mercado Pago: planes, consulta a la API y registro en la base. Lo comparten mp-checkout y mp-webhook.
import { SUPABASE_URL, SUPABASE_ANON } from './_auth.js';

export const PLANES = {
  familia: { monto: 9.9, nombre: 'Despensa Familia' },
  plus: { monto: 19.9, nombre: 'Despensa Familia Plus' },
};

export async function mp(path, opts = {}) {
  const r = await fetch('https://api.mercadopago.com' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Mercado Pago respondió ' + r.status + ': ' + String(j.message || '').slice(0, 160)); e.status = r.status; throw e; }
  return j;
}

// Lee la suscripción en Mercado Pago (nunca del cuerpo del aviso) y la guarda en cs_suscripciones
export async function aplicarPreapproval(id) {
  const p = await mp('/preapproval/' + encodeURIComponent(id));
  const [user, plan] = String(p.external_reference || '').split(':');
  if (!/^[0-9a-f-]{36}$/.test(user) || !PLANES[plan]) throw new Error('Referencia desconocida');
  const monto = Number(p.auto_recurring && p.auto_recurring.transaction_amount);
  if (p.auto_recurring && (p.auto_recurring.currency_id !== 'PEN' || Math.abs(monto - PLANES[plan].monto) > 0.001)) throw new Error('Monto o moneda no coinciden con el plan');
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/cs_mp_aplicar', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: process.env.MP_DB_TOKEN, p_user: user, p_plan: plan, p_estado: p.status, p_preapproval: p.id, p_desde: p.date_created || null }),
  });
  if (!r.ok) throw new Error('No se pudo guardar la suscripción (' + r.status + ')');
  return { user, plan, estado: p.status };
}
