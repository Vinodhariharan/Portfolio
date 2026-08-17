export const config = { runtime: 'edge' };

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE              = 'https://vinodhariharan.vercel.app';

const STATIC_URLS = `
  <url>
    <loc>${SITE}/</loc>
    <lastmod>2026-06-20</lastmod>
    <priority>1.0</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>${SITE}/blog.html</loc>
    <lastmod>2026-06-20</lastmod>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>${SITE}/tech-rovers.html</loc>
    <lastmod>2026-06-20</lastmod>
    <priority>0.7</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>${SITE}/cam-viewer.html</loc>
    <lastmod>2026-06-20</lastmod>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>${SITE}/taskflow.html</loc>
    <lastmod>2026-06-25</lastmod>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>${SITE}/perfoverlay.html</loc>
    <lastmod>2026-08-16</lastmod>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>${SITE}/privacy.html</loc>
    <lastmod>2026-06-01</lastmod>
    <priority>0.3</priority>
    <changefreq>yearly</changefreq>
  </url>
  <url>
    <loc>${SITE}/terms.html</loc>
    <lastmod>2026-06-01</lastmod>
    <priority>0.3</priority>
    <changefreq>yearly</changefreq>
  </url>`;

function xmlResponse(body) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}

export default async function handler() {
  let postUrls = '';

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/posts?is_published=eq.true&select=slug,updated_at&order=created_at.desc`,
        {
          headers: {
            apikey:        SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Accept:        'application/json'
          }
        }
      );
      if (res.ok) {
        const posts = await res.json();
        if (Array.isArray(posts)) {
          postUrls = posts.map(p => `
  <url>
    <loc>${SITE}/post/${p.slug}</loc>
    <lastmod>${(p.updated_at || '').split('T')[0]}</lastmod>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>`).join('');
        }
      }
    } catch (_) {
      // fall through — serve static pages only
    }
  }

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${STATIC_URLS}${postUrls}
</urlset>`);
}
