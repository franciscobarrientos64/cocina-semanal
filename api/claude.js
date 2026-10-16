// Proxy a la API de Anthropic: la key vive en Vercel (ANTHROPIC_API_KEY), nunca en el navegador.
export const config = { maxDuration: 60 };

const MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 4000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Método no permitido' } });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: { message: 'Falta ANTHROPIC_API_KEY en Vercel' } });

  // Solo aceptamos llamadas desde la propia web
  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  if (origin && !origin.includes(host) && !origin.includes('localhost')) {
    return res.status(403).json({ error: { message: 'Origen no permitido' } });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!Array.isArray(body.messages)) return res.status(400).json({ error: { message: 'Faltan messages' } });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 1500, MAX_TOKENS),
      ...(body.system ? { system: body.system } : {}),
      messages: body.messages,
    }),
  });
  const data = await r.json();
  res.status(r.status).json(data);
}
