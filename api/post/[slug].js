import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript  from 'highlight.js/lib/languages/javascript';
import typescript  from 'highlight.js/lib/languages/typescript';
import python      from 'highlight.js/lib/languages/python';
import bash        from 'highlight.js/lib/languages/bash';
import json        from 'highlight.js/lib/languages/json';
import css         from 'highlight.js/lib/languages/css';
import xml         from 'highlight.js/lib/languages/xml';
import sql         from 'highlight.js/lib/languages/sql';
import yaml        from 'highlight.js/lib/languages/yaml';
import java        from 'highlight.js/lib/languages/java';
import cpp         from 'highlight.js/lib/languages/cpp';
import c           from 'highlight.js/lib/languages/c';
import go          from 'highlight.js/lib/languages/go';
import rust        from 'highlight.js/lib/languages/rust';
import dockerfile  from 'highlight.js/lib/languages/dockerfile';
import markdown    from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('markdown', markdown);

const esc     = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr = s => (s || '').replace(/"/g, '&quot;');

// Syntax-highlight fenced code blocks; unrecognised/unspecified languages
// fall back to plain (escaped) code rather than guessing via auto-detect,
// which can mislabel short snippets.
const renderer = new marked.Renderer();
renderer.code = (code, infostring) => {
  const lang = (infostring || '').trim().split(/\s+/)[0].toLowerCase();
  const known = lang && hljs.getLanguage(lang);
  const html = known
    ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    : esc(code);
  const langClass = known ? ` language-${lang}` : '';
  return `<pre><code class="hljs${langClass}">${html}</code></pre>`;
};

// Inline content images are below the fold within the article body, so lazy
// loading them is a clear win. (The post's own cover image, above the fold,
// stays eager — see its <img> tag further down.)
renderer.image = (href, title, text) => {
  const titleAttr = title ? ` title="${escAttr(title)}"` : '';
  return `<img src="${escAttr(href)}" alt="${escAttr(text)}"${titleAttr} loading="lazy" decoding="async"/>`;
};

marked.use({ renderer });

export const config = { runtime: 'edge' };

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE              = 'https://vinodhariharan.vercel.app';

export default async function handler(req) {
  const slug = new URL(req.url).pathname.replace(/^\/post\//, '');

  if (!slug) {
    return new Response('<h1>Not found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  }

  // Fetch post + related posts in parallel
  const sbHeaders = {
    apikey:        SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept:        'application/json'
  };
  const [postRes, relatedRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=*&limit=1`, { headers: sbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/posts?slug=neq.${encodeURIComponent(slug)}&is_published=eq.true&select=title,slug,excerpt,cover_image,tags,created_at,view_count&order=created_at.desc&limit=20`, { headers: sbHeaders })
  ]);

  const posts    = await postRes.json();
  const post     = posts?.[0];
  let relatedPosts = await relatedRes.json().catch(() => []);

  // Rank candidates by shared-tag count (ties broken by recency, since the
  // candidate list is already ordered newest-first), then take the top 3.
  // Posts with no tags/overlap naturally fall back to "most recent".
  if (Array.isArray(relatedPosts) && post) {
    const postTags = new Set(post.tags || []);
    relatedPosts = relatedPosts
      .map((rp, i) => ({ rp, shared: (rp.tags || []).filter(t => postTags.has(t)).length, i }))
      .sort((a, b) => b.shared - a.shared || a.i - b.i)
      .slice(0, 3)
      .map(({ rp }) => rp);
  }

  // Compute IP hash (raw IP never stored, only the SHA-256)
  let ipHash = '';
  try {
    const fwd = req.headers.get('x-forwarded-for') || '';
    const ip  = fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    ipHash = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { /* hash failures must never break the page */ }

  // Record view (fire-and-forget; deduped per IP per UTC day by the RPC)
  if (post && ipHash) {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/record_post_view`, {
      method: 'POST',
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ p_slug: slug, p_ip_hash: ipHash })
    }).catch(() => {});
  }

  if (!post) {
    return new Response(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Post not found | Vinodhariharan Ravi</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={darkMode:'class'};</script>
</head>
<body class="bg-white dark:bg-[#0a0a0a] text-[#0a0a0a] dark:text-[#fafafa] min-h-screen flex flex-col items-center justify-center gap-6">
  <h1 class="text-2xl font-bold">Post not found</h1>
  <a href="/blog.html" class="text-[#2563eb] hover:underline text-sm">← Back to all posts</a>
</body></html>`, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const rawContentHtml = marked.parse(post.content || '');

  // Build a table of contents: find <h2>/<h3>, slugify, inject id="…"
  const slugify = s => s.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const tocItems = [];
  const usedSlugs = new Set();
  const withIds = rawContentHtml.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_, level, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (!text) return _;
    let slug = slugify(text);
    if (!slug) slug = `section-${tocItems.length + 1}`;
    let unique = slug, i = 2;
    while (usedSlugs.has(unique)) unique = `${slug}-${i++}`;
    usedSlugs.add(unique);
    tocItems.push({ level: Number(level), text, slug: unique });
    return `<h${level} id="${unique}"${attrs || ''}>${inner}</h${level}>`;
  });

  const contentHtml = withIds;
  const ogImage     = post.cover_image || `${SITE}/assets/og-cover.png`;
  const date        = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const words    = (post.content || '').trim().split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(words / 200)) + ' min read';

  // View tracking went live on this date — earlier posts have incomplete counts.
  const VIEW_TRACKING_START = '2026-06-15';
  const partial = post.created_at && new Date(post.created_at) < new Date(VIEW_TRACKING_START);

  // esc()/escAttr() are defined at module scope, above.

  // Share URLs
  const postUrl       = `${SITE}/post/${post.slug}`;
  const shareUrlEnc   = encodeURIComponent(postUrl);
  const shareTitleEnc = encodeURIComponent(post.title);
  const linkedInUrl   = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrlEnc}`;
  const whatsappUrl   = `https://wa.me/?text=${shareTitleEnc}%20${shareUrlEnc}`;

  // Reusable share-button block (rendered in three places)
  const shareIcons = (variant) => {
    // variant: 'inline' (horizontal row) or 'stack' (vertical sticky sidebar)
    const wrap = variant === 'stack'
      ? 'flex flex-col items-center gap-3'
      : 'flex items-center gap-3 flex-wrap';
    const btn = 'inline-flex items-center justify-center w-9 h-9 rounded-full border border-[#e5e5e5] dark:border-[#222222] text-[#737373] hover:text-[#2563eb] hover:border-[#2563eb] transition-colors';
    return `
      <div class="${wrap}">
        ${variant === 'stack' ? `<p class="text-[0.6rem] font-semibold tracking-widest uppercase text-[#737373] mb-1">Share</p>` : ''}
        <a href="${linkedInUrl}" target="_blank" rel="noopener" aria-label="Share on LinkedIn" class="${btn}">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>
        </a>
        <a href="${whatsappUrl}" target="_blank" rel="noopener" aria-label="Share on WhatsApp" class="${btn}">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.555-5.338 11.89-11.893 11.89a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.673 5.5l.396.631-1.002 3.663 3.764-.989zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        </a>
        <button onclick="copyPostLink(this)" aria-label="Copy link" class="${btn}">
          <svg class="w-4 h-4 link-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          <svg class="w-4 h-4 check-icon hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        </button>
      </div>`;
  };

  // Related-posts card grid ("Read next" heading + "Back to all posts" link on the same row)
  const relatedHtml = (relatedPosts && relatedPosts.length > 0) ? `
    <section class="mt-16 pt-10 border-t border-[#e5e5e5] dark:border-[#222222]">
      <div class="flex items-center justify-between mb-6 gap-4">
        <h2 class="text-lg font-semibold text-[#0a0a0a] dark:text-[#fafafa]">Read next</h2>
        <a href="/blog.html" class="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#2563eb] transition-colors shrink-0">
          Back to all posts
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </a>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${relatedPosts.map(rp => {
          const rpDate = new Date(rp.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
          return `
            <a href="/post/${rp.slug}" class="group flex flex-col gap-3 no-underline">
              ${rp.cover_image
                ? `<div class="w-full h-28 rounded-lg overflow-hidden bg-[#f5f5f5] dark:bg-[#111111]">
                     <img src="${rp.cover_image}" alt="${escAttr(rp.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy"/>
                   </div>`
                : ''}
              <span class="text-xs text-[#737373]">${rpDate}</span>
              <h3 class="text-sm font-semibold text-[#0a0a0a] dark:text-[#fafafa] leading-snug group-hover:text-[#2563eb] transition-colors">${esc(rp.title)}</h3>
              ${rp.excerpt ? `<p class="text-xs text-[#737373] line-clamp-2 leading-relaxed">${esc(rp.excerpt)}</p>` : ''}
            </a>
          `;
        }).join('')}
      </div>
    </section>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escAttr(post.title)} | Blog — Vinodhariharan Ravi</title>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-6E52VLX2ZZ"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-6E52VLX2ZZ');</script>
  <!-- Dark mode: runs before first paint to avoid FOUC -->
  <script>
    (function(){
      var s = localStorage.getItem('darkMode');
      var p = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (s === 'enabled' || (s === null && p)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    })();
  </script>
  <!-- Styles -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={darkMode:'class'};</script>
  <link rel="stylesheet" href="/styles.css"/>
  <link rel="icon" href="/assets/favicon.png" type="image/png"/>
  <link href="https://fonts.cdnfonts.com/css/glacial-indifference-2" rel="stylesheet"/>
  <!-- SEO -->
  <meta name="description" content="${escAttr(post.excerpt || post.title)}"/>
  <link rel="canonical" href="${SITE}/post/${post.slug}"/>
  <meta property="og:type"         content="article"/>
  <meta property="og:url"          content="${SITE}/post/${post.slug}"/>
  <meta property="og:title"        content="${escAttr(post.title)}"/>
  <meta property="og:description"  content="${escAttr(post.excerpt || '')}"/>
  <meta property="og:image"        content="${ogImage}"/>
  <meta property="og:image:width"  content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${escAttr(post.title)}"/>
  <meta name="twitter:description" content="${escAttr(post.excerpt || '')}"/>
  <meta name="twitter:image"       content="${ogImage}"/>
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"BlogPosting",
    "headline":${JSON.stringify(post.title)},
    "description":${JSON.stringify(post.excerpt || '')},
    "datePublished":${JSON.stringify(post.created_at)},
    "image":${JSON.stringify(ogImage)},
    "keywords":${JSON.stringify((post.tags || []).join(', '))},
    "author":{"@type":"Person","name":"Vinodhariharan Ravi","url":"${SITE}"},
    "url":"${SITE}/post/${post.slug}"
  }
  </script>
  <style>
    #reading-progress{position:fixed;top:0;left:0;height:2px;width:0%;background:#2563eb;z-index:100;transition:width 0.1s linear}
    .prose-blog h2, .prose-blog h3 { scroll-margin-top: 6rem; }
    .toc-link.active { color: #2563eb; font-weight: 500; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <div id="reading-progress"></div>

  <!-- Nav -->
  <nav class="fixed top-0 w-full z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-[#e5e5e5] dark:border-[#222222] transition-colors duration-300">
    <div class="max-w-5xl mx-auto px-6 flex items-center justify-between h-16">
      <a href="/" style="font-family:'Glacial Indifference',sans-serif;" class="text-xl font-bold text-[#0a0a0a] dark:text-[#fafafa] tracking-tight">vh</a>
      <p class="hidden md:block text-sm text-[#737373] truncate max-w-xs mx-4 flex-1 text-center">${esc(post.title)}</p>
      <div class="flex items-center gap-6">
        <a href="/blog.html" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">← All posts</a>
        <a href="/tech-rovers.html" class="hidden md:inline text-sm text-[#737373] hover:text-[#2563eb] transition-colors">Tech Rovers</a>
        <button id="dmToggle" class="p-2 rounded-full text-[#737373] hover:text-[#0a0a0a] dark:hover:text-[#fafafa] transition-colors" aria-label="Toggle dark mode">
          <svg class="w-5 h-5 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <svg class="w-5 h-5 block dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
        </button>
      </div>
    </div>
  </nav>

  <main class="flex-grow pt-24 pb-24">
    <div class="max-w-6xl mx-auto px-6 flex gap-8 items-stretch">

      <!-- Left sticky share rail (desktop only) -->
      <aside class="hidden lg:block w-12 shrink-0">
        <div class="sticky top-24">
          ${shareIcons('stack')}
        </div>
      </aside>

      <!-- Post content -->
      <div class="flex-1 min-w-0 max-w-2xl">

        <!-- Back -->
        <a href="/blog.html" class="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#2563eb] transition-colors mb-10">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          All posts
        </a>

        <!-- Cover image: above the fold, so eager + high priority (likely LCP element).
             width/height (matching the 1200x630 og:image convention) let the browser
             reserve the right aspect ratio before the image loads, avoiding layout shift. -->
        ${post.cover_image
          ? `<img src="${escAttr(post.cover_image)}" alt="${escAttr(post.title)}" width="1200" height="630" loading="eager" fetchpriority="high" decoding="async" class="w-full rounded-xl mb-8 border border-[#e5e5e5] dark:border-[#222222] object-cover max-h-80"/>`
          : ''}

        <!-- Header -->
        <header class="mb-10 pb-8 border-b border-[#e5e5e5] dark:border-[#222222]">
          <h1 class="text-3xl md:text-4xl font-bold text-[#0a0a0a] dark:text-[#fafafa] leading-tight mb-5">${esc(post.title)}</h1>
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full overflow-hidden bg-[#e5e5e5] dark:bg-[#222222] shrink-0">
                <img src="/assets/new_profile.png" alt="Vinodhariharan Ravi" class="w-full h-full object-cover"/>
              </div>
              <span class="text-sm font-medium text-[#0a0a0a] dark:text-[#fafafa]">Vinodhariharan Ravi</span>
            </div>
            <span class="text-[#e5e5e5] dark:text-[#333333]">·</span>
            <span class="text-sm text-[#737373]">${date}</span>
            <span class="text-[#e5e5e5] dark:text-[#333333]">·</span>
            <span class="text-sm text-[#737373]">${readTime}</span>
            <span class="text-[#e5e5e5] dark:text-[#333333]">·</span>
            <span class="relative ${partial ? 'group' : ''} inline-flex items-center gap-1 text-sm text-[#737373]">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${(post.view_count || 0).toLocaleString()} ${(post.view_count === 1) ? 'view' : 'views'}
              ${partial ? `
                <svg class="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01"/>
                </svg>
                <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50">
                  <span class="block w-60 px-3 py-2 rounded-lg bg-[#0a0a0a] dark:bg-[#222222] text-white text-[11px] leading-snug font-normal shadow-lg
                               after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                               after:border-4 after:border-transparent after:border-t-[#0a0a0a] dark:after:border-t-[#222222]">
                    Views before tracking was added aren't included.
                    <a href="/privacy.html#view-tracking" class="block mt-1 text-[#60a5fa] hover:underline">Learn more →</a>
                  </span>
                </span>
              ` : ''}
            </span>
          </div>
          ${post.excerpt
            ? `<p class="mt-5 text-[#737373] text-base leading-relaxed">${esc(post.excerpt)}</p>`
            : ''}

          ${(post.tags && post.tags.length > 0) ? `
            <div class="mt-5 flex flex-wrap gap-1.5">
              ${post.tags.map(t => `<a href="/blog.html?tag=${encodeURIComponent(t)}" class="tag no-underline">${esc(t)}</a>`).join('')}
            </div>
          ` : ''}

          <!-- Share row under title -->
          <div class="mt-6 flex items-center gap-3 lg:hidden">
            ${shareIcons('inline')}
          </div>
        </header>

        <!-- Content -->
        <div class="prose-blog">${contentHtml}</div>

        <!-- Reactions -->
        <div class="mt-12 flex flex-col items-center gap-3 py-8 border-t border-[#e5e5e5] dark:border-[#222222]">
          <p class="text-xs text-[#737373]">Enjoyed this post?</p>
          <button id="reactBtn" data-slug="${post.slug}"
            class="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#e5e5e5] dark:border-[#222222]
                   hover:border-[#ef4444] hover:text-[#ef4444] transition-colors text-sm font-medium text-[#737373]
                   active:scale-95">
            <svg class="w-5 h-5 transition-transform group-hover:scale-110 group-active:scale-125" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span id="reactCount">${(post.reaction_count || 0).toLocaleString()}</span>
          </button>
          <p id="reactStatus" class="text-[11px] text-[#737373] opacity-0 transition-opacity">Thanks for reacting!</p>
        </div>

        <!-- Share row end-of-article -->
        <div class="mt-2 mb-12 flex flex-col items-center gap-2">
          <p class="text-xs text-[#737373]">Found this useful? Share it.</p>
          ${shareIcons('inline')}
        </div>

        <!-- Related posts (includes its own "Back to all posts" link above the heading) -->
        ${relatedHtml || `
          <footer class="mt-14 pt-8 border-t border-[#e5e5e5] dark:border-[#222222]">
            <a href="/blog.html" class="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Back to all posts
            </a>
          </footer>
        `}

      </div>

      <!-- Right-side sticky table of contents (desktop only) -->
      ${tocItems.length > 0 ? `
        <aside class="hidden lg:block w-56 shrink-0">
          <div class="sticky top-24">
            <p class="text-[0.65rem] font-semibold tracking-widest uppercase text-[#737373] mb-3">On this page</p>
            <nav class="flex flex-col gap-2 border-l border-[#e5e5e5] dark:border-[#222222] pl-3 max-h-[70vh] overflow-y-auto">
              ${tocItems.map(item => `
                <a href="#${item.slug}"
                   class="${item.level === 3 ? 'pl-3' : ''} text-xs leading-snug text-[#737373] hover:text-[#2563eb] transition-colors toc-link"
                   data-toc="${item.slug}">${esc(item.text)}</a>
              `).join('')}
            </nav>
          </div>
        </aside>
      ` : ''}

    </div>
  </main>

  <!-- Footer fade -->
  <div class="footer-fade"></div>

  <!-- Site footer -->
  <footer class="footer-bg transition-colors duration-300">
    <div class="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-10 border-t border-[#e5e5e5] dark:border-[#222222]">

      <!-- Brand -->
      <div>
        <a href="/" class="text-xl font-bold text-[#0a0a0a] dark:text-[#fafafa] tracking-tight" style="font-family:'Glacial Indifference',sans-serif;">vh</a>
        <p class="text-sm text-[#737373] mt-2 leading-relaxed">Full-Stack Engineer &amp; AI Developer building scalable systems and agentic AI.</p>
        <p class="text-xs text-[#737373] mt-5">© 2026 Vinodhariharan Ravi</p>
      </div>

      <!-- Pages -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-[#737373] mb-4">Pages</p>
        <nav class="flex flex-col gap-2.5">
          <a href="/" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">Home</a>
          <a href="/blog.html" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">Blog</a>
          <a href="/privacy.html" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">Privacy</a>
          <a href="/terms.html" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">Terms</a>
        </nav>
      </div>

      <!-- Apps -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-[#737373] mb-4">Apps</p>
        <div class="flex flex-col gap-2.5">
          <a href="/taskflow.html" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <img src="/assets/taskflow_icon_v2_1782377047512.png" alt="" class="w-4 h-4 rounded shrink-0" />
            TaskFlow
          </a>
          <a href="/cam-viewer.html" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <img src="/assets/cam-viewer-icon.png" alt="" class="w-4 h-4 rounded shrink-0" />
            Cam Video Viewer
          </a>
          <a href="/perfoverlay.html" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <img src="/assets/perfoverlay-icon.png" alt="" class="w-4 h-4 rounded shrink-0" />
            PerfOverlay
          </a>
          <a href="https://hexaconquest.vercel.app" target="_blank" rel="noopener" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            HexaConquest
          </a>
        </div>
      </div>

      <!-- Connect -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-[#737373] mb-4">Connect</p>
        <div class="flex flex-col gap-2.5">
          <a href="https://linkedin.com/in/vinodhariharan-ravi" target="_blank" rel="noopener" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </a>
          <a href="https://github.com/Vinodhariharan" target="_blank" rel="noopener" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
          <a href="https://www.youtube.com/@tech_rovers" target="_blank" rel="noopener" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            Tech Rovers
          </a>
          <a href="mailto:vinodhari.ravi@gmail.com" class="flex items-center gap-2.5 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            vinodhari.ravi@gmail.com
          </a>
        </div>
      </div>

    </div>
  </footer>

  <script>
    // Dark mode toggle (init is in <head> to avoid FOUC)
    document.getElementById('dmToggle').addEventListener('click', () => {
      const d = document.documentElement.classList.toggle('dark');
      localStorage.setItem('darkMode', d ? 'enabled' : 'disabled');
    });

    // Reading progress + GA4 scroll-depth / completion tracking
    (function(){
      const thresholds = [25, 50, 75, 90];
      const fired = new Set();
      const slug = ${JSON.stringify(post.slug)};

      window.addEventListener('scroll', () => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
        document.getElementById('reading-progress').style.width = Math.min(100, pct) + '%';

        thresholds.forEach(t => {
          if (pct >= t && !fired.has(t)) {
            fired.add(t);
            if (typeof gtag === 'function') {
              gtag('event', t === 90 ? 'blog_read_complete' : 'scroll_depth', {
                percent_scrolled: t,
                post_slug: slug,
                post_title: ${JSON.stringify(post.title)}
              });
            }
          }
        });
      }, { passive: true });
    })();

    // Copy-link button — fills clipboard, swaps icon to checkmark briefly
    function copyPostLink(btn) {
      const url = ${JSON.stringify(postUrl)};
      navigator.clipboard.writeText(url).then(() => {
        const link  = btn.querySelector('.link-icon');
        const check = btn.querySelector('.check-icon');
        if (link)  link.classList.add('hidden');
        if (check) check.classList.remove('hidden');
        btn.classList.add('text-[#22c55e]','border-[#22c55e]');
        setTimeout(() => {
          if (link)  link.classList.remove('hidden');
          if (check) check.classList.add('hidden');
          btn.classList.remove('text-[#22c55e]','border-[#22c55e]');
        }, 1600);
      });
    }
    window.copyPostLink = copyPostLink;

    // ❤️ Reactions — single tap per IP per UTC day (server-enforced).
    // We also remember in localStorage so the UI shows the reacted state.
    (function(){
      const btn      = document.getElementById('reactBtn');
      const countEl  = document.getElementById('reactCount');
      const statusEl = document.getElementById('reactStatus');
      if (!btn) return;

      const slug    = btn.dataset.slug;
      const ipHash  = ${JSON.stringify(ipHash)};
      const todayKey = 'reacted:' + slug + ':' + new Date().toISOString().slice(0,10);

      const setReacted = () => {
        btn.disabled = true;
        btn.classList.add('text-[#ef4444]','border-[#ef4444]','cursor-default');
        btn.classList.remove('hover:border-[#ef4444]','hover:text-[#ef4444]');
        statusEl.style.opacity = '1';
      };
      if (localStorage.getItem(todayKey)) setReacted();

      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        // optimistic UI bump
        const current = parseInt(countEl.textContent.replace(/[^0-9]/g,''), 10) || 0;
        countEl.textContent = (current + 1).toLocaleString();
        setReacted();
        localStorage.setItem(todayKey, '1');

        try {
          const res = await fetch(${JSON.stringify(SUPABASE_URL)} + '/rest/v1/rpc/react_to_post', {
            method: 'POST',
            headers: {
              apikey:        ${JSON.stringify(SUPABASE_ANON_KEY)},
              Authorization: 'Bearer ' + ${JSON.stringify(SUPABASE_ANON_KEY)},
              'Content-Type':'application/json'
            },
            body: JSON.stringify({ p_slug: slug, p_ip_hash: ipHash })
          });
          const newTotal = await res.json();
          if (typeof newTotal === 'number') countEl.textContent = newTotal.toLocaleString();
        } catch { /* silent — optimistic UI already updated */ }
      });
    })();

    // TOC scroll-spy — highlight the currently visible heading
    (function(){
      const links = document.querySelectorAll('.toc-link');
      if (links.length === 0) return;
      const map = new Map();
      links.forEach(a => {
        const id = a.dataset.toc;
        const target = document.getElementById(id);
        if (target) map.set(target, a);
      });
      if (map.size === 0) return;

      let lastActive = null;
      const setActive = el => {
        if (lastActive === el) return;
        if (lastActive) lastActive.classList.remove('active');
        if (el) el.classList.add('active');
        lastActive = el;
      };

      const observer = new IntersectionObserver(entries => {
        // Track which headings are currently in the viewport's upper half
        entries.forEach(e => { e.target.__visible = e.isIntersecting; });
        // Pick the topmost visible heading
        let top = null;
        map.forEach((_, heading) => {
          if (heading.__visible) {
            if (!top || heading.getBoundingClientRect().top < top.getBoundingClientRect().top) top = heading;
          }
        });
        setActive(top ? map.get(top) : null);
      }, { rootMargin: '-80px 0px -65% 0px' });

      map.forEach((_, heading) => observer.observe(heading));
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store'
    }
  });
}
