// Fetches Tech Rovers' latest videos from YouTube's channel RSS.
// Auto-resolves channel ID from the @-handle so no API key / env var is needed.
// Cached at the edge for 30 min.

export const config = { runtime: 'edge' };

const HANDLE   = '@tech_rovers';
const HANDLE_URL = `https://www.youtube.com/${HANDLE}`;
const ABOUT_URL  = `https://www.youtube.com/${HANDLE}/about`;

// Optional override — set YOUTUBE_CHANNEL_ID in Vercel env vars to skip
// the auto-resolution entirely.
const ENV_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let cachedChannelId = null;

const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Fetches the @-handle page HTML once and returns both the resolved channel ID
// and the raw HTML, so the caller can scrape stats from the same response.
async function fetchHandlePage() {
  const res = await fetch(HANDLE_URL, { headers: YT_HEADERS });
  const html = await res.text();
  return { html, channelId: extractChannelId(html) };
}

function extractChannelId(html) {
  let m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/);
  if (m) return m[1];
  m = html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/);
  if (m) return m[1];
  m = html.match(/"c4TabbedHeaderRenderer":\{"channelId":"(UC[\w-]+)"/);
  if (m) return m[1];
  m = html.match(/"externalId":"(UC[\w-]+)"/);
  if (m) return m[1];
  return null;
}

// Scrape subscribers + video count from the handle-page HTML.
function parseStatsFromHandle(html) {
  // Subscribers: "subscriberCountText":{"simpleText":"1.2K subscribers"} or via accessibility blob.
  let subscribers = null;
  let m = html.match(/"subscriberCountText":\s*\{[^}]*?"simpleText":"([^"]+)"/);
  if (m) {
    // Strip " subscribers" suffix; keep "1.2K", "1,234", etc.
    subscribers = m[1].replace(/\s*subscribers?\s*$/i, '').trim();
  } else {
    m = html.match(/"subscriberCountText":\s*\{[^}]*?"runs":\[\{"text":"([^"]+)"/);
    if (m) subscribers = m[1].trim();
  }

  // Video count: "videosCountText":{"runs":[{"text":"42"}]}
  let videosCount = null;
  m = html.match(/"videosCountText":\s*\{[^}]*?"runs":\[\{"text":"([\d,]+)"/);
  if (m) videosCount = parseInt(m[1].replace(/,/g, ''), 10);

  return { subscribers, videos: Number.isFinite(videosCount) ? videosCount : null };
}

// Fetch /about and extract total channel views.
async function fetchTotalViews() {
  try {
    const res = await fetch(ABOUT_URL, { headers: YT_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    // viewCountText": {"simpleText": "50,123 views"}
    let m = html.match(/"viewCountText":\s*\{[^}]*?"simpleText":"([^"]+)"/);
    if (!m) m = html.match(/"viewCount":\s*\{[^}]*?"simpleText":"([^"]+)"/);
    if (!m) m = html.match(/"viewCount":\s*"(\d+)"/); // newer about-modal format
    if (!m) return null;
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Fetch the single-row channel_config from Supabase REST.
async function fetchChannelConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return {};
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/channel_config?id=eq.1&select=featured_video_id,trailer_video_id,subscribers_override,videos_override,views_override`, {
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept:        'application/json'
      }
    });
    if (!res.ok) return {};
    const rows = await res.json();
    const row = rows?.[0] || {};
    return {
      featured_video_id:    row.featured_video_id    || null,
      trailer_video_id:     row.trailer_video_id     || null,
      subscribers_override: row.subscribers_override || null,
      videos_override:      row.videos_override      ?? null,
      views_override:       row.views_override       ?? null
    };
  } catch {
    return {};
  }
}

// Backwards-compat shim — used elsewhere in the file before refactor.
async function resolveChannelId() {
  if (ENV_CHANNEL_ID)   return ENV_CHANNEL_ID;
  if (cachedChannelId)  return cachedChannelId;
  const { channelId } = await fetchHandlePage();
  if (channelId) cachedChannelId = channelId;
  return channelId;
}

// Classify a video as Short vs long-form by probing the /shorts/<id> URL.
// YouTube redirects to /watch?v=<id> for non-Shorts.
async function isShort(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    // 200 = Shorts player served; 3xx = redirect to /watch (regular video)
    return res.status === 200;
  } catch {
    return false; // err on the side of "regular video"
  }
}

function parseFeed(xml) {
  const videos = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[1];
    const videoId   = (entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
    const title     = (entry.match(/<title>([\s\S]*?)<\/title>/)         || [])[1] || '';
    const link      = (entry.match(/<link[^>]*href="([^"]+)"/)            || [])[1] || '';
    const published = (entry.match(/<published>([^<]+)<\/published>/)     || [])[1] || '';
    const thumbnail = (entry.match(/<media:thumbnail[^>]*url="([^"]+)"/)  || [])[1] || '';
    const description = ((entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '').slice(0, 220);
    const views     = parseInt((entry.match(/<media:statistics[^>]*views="(\d+)"/) || [])[1] || '0', 10);
    if (videoId) {
      videos.push({
        videoId,
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
        link,
        published,
        thumbnail,
        description,
        views
      });
    }
  }
  return videos;
}

export default async function handler() {
  try {
    // Fetch handle page (for channelId + stats), /about (for total views), and
    // channel_config in parallel.
    const [handlePage, totalViews, config] = await Promise.all([
      fetchHandlePage(),
      fetchTotalViews(),
      fetchChannelConfig()
    ]);

    const channelId = ENV_CHANNEL_ID || handlePage.channelId;
    if (!channelId) {
      return new Response(JSON.stringify({ error: 'channel_not_found', handle: HANDLE }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (handlePage.channelId) cachedChannelId = handlePage.channelId;

    // Scrape sub/video count from the same HTML, then apply admin overrides.
    // Overrides win because YouTube's HTML changes frequently and the scraper
    // can return null or stale values.
    const handleStats = handlePage.html ? parseStatsFromHandle(handlePage.html) : { subscribers: null, videos: null };
    const stats = {
      subscribers: config.subscribers_override ?? handleStats.subscribers,
      videos:      config.videos_override      ?? handleStats.videos,
      views:       config.views_override       ?? totalViews
    };

    const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!rss.ok) {
      return new Response(JSON.stringify({ error: 'rss_fetch_failed', status: rss.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const xml = await rss.text();
    const videos = parseFeed(xml);

    // Classify each video as 'short' or 'long' in parallel.
    const flags = await Promise.all(videos.map(v => isShort(v.videoId)));
    videos.forEach((v, i) => {
      v.type      = flags[i] ? 'short' : 'long';
      v.shortLink = flags[i] ? `https://www.youtube.com/shorts/${v.videoId}` : v.link;
    });

    const shorts   = videos.filter(v => v.type === 'short');
    const longform = videos.filter(v => v.type === 'long');

    return new Response(JSON.stringify({
      channelId,
      handle: HANDLE,
      videos,
      shorts,
      longform,
      stats,
      config: {
        featured_video_id: config.featured_video_id || null,
        trailer_video_id:  config.trailer_video_id  || null
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unknown', message: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
