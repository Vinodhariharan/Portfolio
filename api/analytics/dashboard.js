// Analytics dashboard — pulls 6 reports from GA4 Data API in parallel.
// Auth: service-account JWT → OAuth2 access token → runReport.
// Cached at the edge for 30 min. Tokens cached in-memory per Edge worker
// for their 1-hour TTL so repeat calls within a warm worker reuse them.

export const config = { runtime: 'edge' };

const PROPERTY_ID = process.env.GA_PROPERTY_ID;
const SA_EMAIL    = process.env.GA_SERVICE_ACCOUNT_EMAIL;
const SA_KEY      = (process.env.GA_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');

const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REPORT_URL = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`;
const SCOPE      = 'https://www.googleapis.com/auth/analytics.readonly';

let cachedToken     = null;
let cachedTokenExp  = 0;

// ── JWT signing (RS256) via Web Crypto API ────────────────────────────────────

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

async function signJwt() {
  const now    = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim  = {
    iss:   SA_EMAIL,
    scope: SCOPE,
    aud:   TOKEN_URL,
    iat:   now,
    exp:   now + 3600
  };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(SA_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + '.' + b64url(sig);
}

async function getAccessToken() {
  if (cachedToken && cachedTokenExp > Date.now() + 30_000) return cachedToken;

  const jwt = await signJwt();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:  jwt
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_exchange_failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  cachedToken    = json.access_token;
  cachedTokenExp = Date.now() + (json.expires_in * 1000);
  return cachedToken;
}

// ── runReport helper ─────────────────────────────────────────────────────────

async function runReport(token, requestBody) {
  const res = await fetch(REPORT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`report_failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Report definitions (one call each) ───────────────────────────────────────

const reports = {
  // 1. Top-line metrics for last 30 days vs the 30 days before.
  totals: {
    dateRanges: [
      { startDate: '30daysAgo', endDate: 'today',     name: 'current' },
      { startDate: '60daysAgo', endDate: '31daysAgo', name: 'previous' }
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' }
    ]
  },

  // 2. Daily views over the last 30 days for the trend sparkline.
  daily: {
    dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics:    [{ name: 'screenPageViews' }],
    orderBys:   [{ dimension: { dimensionName: 'date' } }]
  },

  // 3. Top cities (with country) by views.
  cities: {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'city' }, { name: 'country' }],
    metrics:    [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit:      15
  },

  // 4. Acquisition: source + medium.
  sources: {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics:    [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    limit:      10
  },

  // 5. Device split.
  devices: {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics:    [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }]
  },

  // 6. Top pages by views, with engagement metrics.
  pages: {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics:    [
      { name: 'screenPageViews' },
      { name: 'userEngagementDuration' },
      { name: 'engagementRate' },
      { name: 'totalUsers' }
    ],
    orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit:      15
  },

  // 7. Per-page daily views for the sparklines under each post card.
  //    Limit set high; for a personal blog we'll typically see <500 rows.
  pagesDaily: {
    dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'date' }],
    metrics:    [{ name: 'screenPageViews' }],
    limit:      5000
  }
};

// ── Row parsers (turn GA's nested rows into flat objects) ────────────────────

function parseTotals(report) {
  // Two date ranges → two rows. We match by the "name" we set above.
  const ranges = (report.rows || []).reduce((acc, r) => {
    const range = r.dimensionValues?.[0]?.value || '';
    acc[range] = r.metricValues.map(v => parseFloat(v.value || '0'));
    return acc;
  }, {});
  const fmt = arr => arr || [0, 0, 0, 0];
  const [cv, cu, ce, cd] = fmt(ranges['current']);
  const [pv, pu, pe, pd] = fmt(ranges['previous']);
  const pct = (curr, prev) => (prev === 0 ? null : ((curr - prev) / prev) * 100);
  return {
    views:     { value: cv, prev: pv, change: pct(cv, pv) },
    users:     { value: cu, prev: pu, change: pct(cu, pu) },
    engagement:{ value: ce, prev: pe, change: pct(ce, pe) }, // 0–1 ratio
    avgDur:    { value: cd, prev: pd, change: pct(cd, pd) }  // seconds
  };
}

function parseDaily(report) {
  return (report.rows || []).map(r => ({
    date:  r.dimensionValues[0].value, // YYYYMMDD
    views: parseInt(r.metricValues[0].value || '0', 10)
  }));
}

function parseCities(report) {
  return (report.rows || []).map(r => ({
    city:    r.dimensionValues[0].value,
    country: r.dimensionValues[1].value,
    views:   parseInt(r.metricValues[0].value || '0', 10),
    users:   parseInt(r.metricValues[1].value || '0', 10)
  })).filter(c => c.city && c.city !== '(not set)');
}

function parseSources(report) {
  return (report.rows || []).map(r => ({
    source:   r.dimensionValues[0].value,
    medium:   r.dimensionValues[1].value,
    sessions: parseInt(r.metricValues[0].value || '0', 10),
    users:    parseInt(r.metricValues[1].value || '0', 10)
  }));
}

function parseDevices(report) {
  return (report.rows || []).map(r => ({
    category: r.dimensionValues[0].value,
    views:    parseInt(r.metricValues[0].value || '0', 10),
    users:    parseInt(r.metricValues[1].value || '0', 10)
  }));
}

function parsePages(report) {
  return (report.rows || []).map(r => ({
    path:      r.dimensionValues[0].value,
    title:     r.dimensionValues[1].value,
    views:     parseInt(r.metricValues[0].value || '0', 10),
    engDur:    parseFloat(r.metricValues[1].value || '0'), // seconds (total)
    engRate:   parseFloat(r.metricValues[2].value || '0'), // 0–1
    users:     parseInt(r.metricValues[3]?.value || '0', 10)
  }));
}

// Build a YYYYMMDD list for the last 30 days, oldest → newest.
function last30Days() {
  const days = [];
  const t = new Date();
  // GA dates are in UTC; align to UTC to avoid off-by-one on the boundary.
  const utcToday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(utcToday);
    d.setUTCDate(d.getUTCDate() - i);
    const y = d.getUTCFullYear();
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    days.push(`${y}${m}${dd}`);
  }
  return days;
}

// Group pagesDaily rows by pagePath → date → views, then build a 30-day series
// for each page in `pages`, filling missing days with 0.
function mergePagesWithDaily(pages, dailyReport) {
  const byPath = {};
  for (const r of (dailyReport.rows || [])) {
    const path = r.dimensionValues[0].value;
    const date = r.dimensionValues[1].value;
    const views = parseInt(r.metricValues[0].value || '0', 10);
    if (!byPath[path]) byPath[path] = {};
    byPath[path][date] = views;
  }
  const dates = last30Days();
  return pages.map(p => ({
    ...p,
    daily: dates.map(d => ({ date: d, views: byPath[p.path]?.[d] || 0 }))
  }));
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler() {
  if (!PROPERTY_ID || !SA_EMAIL || !SA_KEY) {
    return new Response(JSON.stringify({
      error: 'missing_config',
      hint:  'Need GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_EMAIL, GA_SERVICE_ACCOUNT_KEY env vars on Vercel.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const token = await getAccessToken();

    const [totalsR, dailyR, citiesR, sourcesR, devicesR, pagesR, pagesDailyR] = await Promise.all([
      runReport(token, reports.totals),
      runReport(token, reports.daily),
      runReport(token, reports.cities),
      runReport(token, reports.sources),
      runReport(token, reports.devices),
      runReport(token, reports.pages),
      runReport(token, reports.pagesDaily)
    ]);

    const pagesWithDaily = mergePagesWithDaily(parsePages(pagesR), pagesDailyR);

    return new Response(JSON.stringify({
      totals:    parseTotals(totalsR),
      daily:     parseDaily(dailyR),
      cities:    parseCities(citiesR),
      sources:   parseSources(sourcesR),
      devices:   parseDevices(devicesR),
      pages:     pagesWithDaily,
      fetchedAt: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        // 30 min edge cache, 1 hr stale-while-revalidate
        'Cache-Control': 'private, s-maxage=1800, stale-while-revalidate=3600'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'failed', message: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
