export const config = { runtime: 'edge' };

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE              = 'https://vinodhariharan.vercel.app';

export default async function handler() {
  let posts = [];

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
    posts = await res.json();
  } catch (_) {
    // fall through — serve static pages only
  }

  const postUrls = (Array.isArray(posts) ? posts : []).map(p => `
  <url>
    <loc>${SITE}/post/${p.slug}</loc>
    <lastmod>${(p.updated_at || '').split('T')[0]}</lastmod>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <priority>1.0</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>${SITE}/blog.html</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>${SITE}/privacy.html</loc>
    <priority>0.3</priority>
    <changefreq>yearly</changefreq>
  </url>
  <url>
    <loc>${SITE}/terms.html</loc>
    <priority>0.3</priority>
    <changefreq>yearly</changefreq>
  </url>${postUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
