// Fetches Tech Rovers' latest videos from YouTube's channel RSS.
// Auto-resolves channel ID from the @-handle so no API key / env var is needed.
// Cached at the edge for 30 min.

export const config = { runtime: 'edge' };

const HANDLE   = '@tech_rovers';
const HANDLE_URL = `https://www.youtube.com/${HANDLE}`;

let cachedChannelId = null;

async function resolveChannelId() {
  if (cachedChannelId) return cachedChannelId;
  const res = await fetch(HANDLE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' }
  });
  const html = await res.text();
  const m = html.match(/"channelId":"(UC[\w-]+)"/) ||
            html.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]+)"/) ||
            html.match(/"externalId":"(UC[\w-]+)"/);
  if (m) cachedChannelId = m[1];
  return cachedChannelId;
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
    const channelId = await resolveChannelId();
    if (!channelId) {
      return new Response(JSON.stringify({ error: 'channel_not_found', handle: HANDLE }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rss = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!rss.ok) {
      return new Response(JSON.stringify({ error: 'rss_fetch_failed', status: rss.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const xml = await rss.text();
    const videos = parseFeed(xml);

    return new Response(JSON.stringify({ channelId, handle: HANDLE, videos }), {
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
