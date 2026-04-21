/**
 * apps/web/api/vitals.ts
 *
 * Vercel Edge Function — réception des Web Vitals anonymisés.
 *
 * Endpoint : POST /api/vitals
 * Body     : { metrics: VitalMetric[], url: string, ts: number }
 *
 * Stockage : Supabase (table vitals_metrics).
 * Pas d'auth requise — données 100% anonymes.
 *
 * Deploy : automatique via Vercel (fichier dans /api/)
 */

export const config = {
  runtime: 'edge',
  regions: ['cdg1'], // Paris
};

interface VitalMetric {
  name: string;
  value: number;
  rating: string;
  delta: number;
  id: string;
}

interface VitalsPayload {
  metrics: VitalMetric[];
  url: string;
  ts: number;
}

const VALID_NAMES  = new Set(['LCP', 'CLS', 'FID', 'INP', 'TTFB', 'FCP']);
const VALID_RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export default async function handler(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Parse body
  let payload: VitalsPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Validation
  if (!Array.isArray(payload.metrics) || payload.metrics.length === 0) {
    return new Response('Bad Request', { status: 400 });
  }

  // Filtrer et valider chaque métrique
  const validMetrics = payload.metrics.filter((m) =>
    VALID_NAMES.has(m.name) &&
    VALID_RATINGS.has(m.rating) &&
    typeof m.value === 'number' &&
    Number.isFinite(m.value) &&
    m.value >= 0
  );

  if (validMetrics.length === 0) {
    return new Response('No valid metrics', { status: 422 });
  }

  // Stocker dans Supabase
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']; // Service role pour bypass RLS

  if (supabaseUrl && supabaseKey) {
    const urlPath = typeof payload.url === 'string'
      ? payload.url.slice(0, 200)
      : '/';

    const rows = validMetrics.map((m) => ({
      name:     m.name,
      value:    Math.round(m.value * 100) / 100,
      rating:   m.rating,
      url_path: urlPath,
    }));

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/vitals_metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(rows),
      });

      if (!res.ok) {
        console.error('[vitals] Supabase insert failed:', res.status);
      }
    } catch (err) {
      // Non-bloquant — ne pas faire échouer la réponse client
      console.error('[vitals] Fetch error:', err);
    }
  }

  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
