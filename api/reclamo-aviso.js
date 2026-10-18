// Aviso de reclamo nuevo a hola@despensa.casa. Lo llama el trigger de cs_reclamos con solo el código.
// La base confirma que el código existe, es reciente y no se avisó antes; el correo no lleva datos personales:
// el detalle se ve y se responde en Ajustes > Reclamos (solo la cuenta admin).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jmkvphayyhwzootlybde.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta3ZwaGF5eWh3em9vdGx5YmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODE3ODEsImV4cCI6MjA5MzU1Nzc4MX0.EP2vv5avU1FIXlZn4jFo3QkvqnxOdLOrICqNV8qAZxM';
const PARA = process.env.RECLAMOS_PARA || 'hola@despensa.casa';
const DE = process.env.RECLAMOS_DE || 'Despensa <avisos@despensa.casa>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const codigo = String((req.body && req.body.codigo) || '');
  if (!/^LR-\d{4}-\d{6}$/.test(codigo)) return res.status(400).json({ ok: false });

  const h = { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON, 'content-type': 'application/json' };
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/cs_reclamo_marcar_avisado', { method: 'POST', headers: h, body: JSON.stringify({ p_codigo: codigo }) });
  const filas = r.ok ? await r.json() : [];
  if (!filas.length) return res.status(404).json({ ok: false });
  const { tipo, vence } = filas[0];
  const clase = tipo === 'queja' ? 'Queja' : 'Reclamo';
  const fecha = vence ? vence.split('-').reverse().join('/') : '';

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, correo: false });
  const m = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: DE,
      to: [PARA],
      subject: `${clase} ${codigo} en el Libro de Reclamaciones`,
      text: `Llegó ${clase.toLowerCase()} ${codigo} en el Libro de Reclamaciones de Despensa.\n\nPlazo para responder: ${fecha} (15 días hábiles; revisa si hay feriados antes).\n\nVer el detalle y responder: https://despensa.casa/#reclamos`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#141414">
  <p style="font-weight:600;letter-spacing:.2em;margin:0 0 16px">DESPENSA<span style="font-weight:300;letter-spacing:.05em">.casa</span></p>
  <p>Llegó <b>${clase.toLowerCase()} ${codigo}</b> en el Libro de Reclamaciones.</p>
  <p>Plazo para responder: <b>${fecha}</b> (15 días hábiles; revisa si hay feriados antes).</p>
  <p style="margin:24px 0"><a href="https://despensa.casa/#reclamos" style="background:#141414;color:#FBF9F4;padding:12px 20px;text-decoration:none;letter-spacing:.12em;font-size:14px">VER Y RESPONDER</a></p>
</div>`,
    }),
  });
  return res.status(200).json({ ok: true, correo: m.ok });
}
