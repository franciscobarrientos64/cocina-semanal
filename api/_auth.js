// Autenticación compartida de las funciones /api: exige sesión de Despensa (Supabase), origen propio y cuota diaria.
// La URL y la anon key de Supabase son públicas (están en el navegador); la seguridad la da el token del usuario.
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jmkvphayyhwzootlybde.supabase.co';
export const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta3ZwaGF5eWh3em9vdGx5YmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODE3ODEsImV4cCI6MjA5MzU1Nzc4MX0.EP2vv5avU1FIXlZn4jFo3QkvqnxOdLOrICqNV8qAZxM';
const ORIGENES = ['https://despensa.casa', 'https://www.despensa.casa', 'https://cocina-semanal.vercel.app'];

export function origenOk(req) {
  const o = req.headers.origin || '';
  if (ORIGENES.includes(o)) return true;
  return /^http:\/\/localhost(:\d+)?$/.test(o) && process.env.VERCEL_ENV !== 'production';
}

// Devuelve el usuario si el token es válido y consume una unidad de su cuota diaria de ese tipo
export async function exigirUsuario(req, res, tipo, maxDia) {
  if (!origenOk(req)) { res.status(403).json({ error: { message: 'Origen no permitido' } }); return null; }
  const auth = req.headers.authorization || '';
  if (!/^Bearer\s+\S+/.test(auth)) { res.status(401).json({ error: { message: 'Entra con tu cuenta para usar esto' } }); return null; }
  const h = { apikey: SUPABASE_ANON, Authorization: auth, 'content-type': 'application/json' };
  const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) { res.status(401).json({ error: { message: 'Tu sesión venció; vuelve a entrar' } }); return null; }
  const c = await fetch(SUPABASE_URL + '/rest/v1/rpc/cs_consumir_cuota', { method: 'POST', headers: h, body: JSON.stringify({ p_tipo: tipo, p_max: maxDia }) });
  if (!c.ok) { res.status(429).json({ error: { message: 'Llegaste al límite de hoy; prueba mañana' } }); return null; }
  return u.json();
}
