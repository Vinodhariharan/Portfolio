// Daily cron job — syncs all-time GA4 page views into Supabase view_count.
// Runs at 02:00 UTC via Vercel Cron (vercel.json).
// Secured by CRON_SECRET env var (Vercel sends it automatically).

export const config = { runtime: 'edge' };

const PROPERTY_ID = process.env.GA_PROPERTY_ID;
const SA_EMAIL    = process.env.GA_SERVICE_ACCOUNT_EMAIL;
const SA_KEY      = (process.env.GA_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET       = process.env.CRON_SECRET;

const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REPORT_URL = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`;
const SCOPE      = 'https://www.googleapis.com/auth/analytics.readonly';

// ── JWT / token (same pattern as dashboard.js) ────────────────────────────────

function b64url(buf) {
  let s = typeof buf === 'string'
    ? btoa(buf)
    : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken() {
  const now    = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim  = { iss: SA_EMAIL, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(SA_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = signingInput + '.' + b64url(sig);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  if (!res.ok) throw new Error(`token_failed: ${res.status}`);
  return (await res.json()).access_token;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  // Verify Vercel cron secret
  const auth = req.headers.get('authorization') || '';
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!PROPERTY_ID || !SA_EMAIL || !SA_KEY || !SUPABASE_URL || !SUPABASE_SVC_KEY) {
    return new Response(JSON.stringify({ error: 'missing_config' }), { status: 500 });
  }

  try {
    const token = await getAccessToken();

    // All-time views per page path
    const gaRes = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics:    [{ name: 'screenPageViews' }],
        orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 500
      })
    });
    if (!gaRes.ok) throw new Error(`ga_failed: ${gaRes.status}`);
    const gaData = await gaRes.json();

    // Extract /post/<slug> rows
    const updates = [];
    for (const row of (gaData.rows || [])) {
      const path  = row.dimensionValues[0].value;
      const views = parseInt(row.metricValues[0].value || '0', 10);
      const match = path.match(/^\/post\/(.+)$/);
      if (match) updates.push({ slug: match[1], views });
    }

    // Write to Supabase in parallel, capture each result
    const results = await Promise.all(updates.map(async ({ slug, views }) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: {
          apikey:         SUPABASE_SVC_KEY,
          Authorization:  `Bearer ${SUPABASE_SVC_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=representation'
        },
        body: JSON.stringify({ view_count: views })
      });
      const body = await res.text();
      return { slug, views, status: res.status, body };
    }));

    const failed = results.filter(r => r.status < 200 || r.status >= 300);

    return new Response(JSON.stringify({ ok: failed.length === 0, synced: updates.length, results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
