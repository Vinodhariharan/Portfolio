import { marked } from 'marked';

export const config = { runtime: 'edge' };

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE              = 'https://vinodhariharan.vercel.app';

export default async function handler(req) {
  const slug = new URL(req.url).pathname.replace(/^\/post\//, '');

  if (!slug) {
    return new Response('<h1>Not found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  }

  // Fetch post from Supabase REST API
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`,
    {
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept:        'application/json'
      }
    }
  );

  const posts = await res.json();
  const post  = posts?.[0];

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

  // Inject mid-article ad after 3rd </p>
  const adHtml = `
    <div style="margin:2rem 0;">
      <a href="https://www.youtube.com/@tech_rovers" target="_blank" rel="noopener" style="display:block;border-radius:0.75rem;overflow:hidden;">
        <img src="/assets/Subscribe_ad.png" alt="Subscribe to Tech Rovers on YouTube" style="display:block;width:100%;height:90px;object-fit:cover;object-position:center;"/>
      </a>
    </div>`;
  let pCount = 0;
  const contentHtml = rawContentHtml.replace(/<\/p>/gi, m => {
    pCount++;
    return pCount === 3 ? m + adHtml : m;
  });
  const ogImage     = post.cover_image || `${SITE}/assets/og-cover.png`;
  const date        = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const words    = (post.content || '').trim().split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(words / 200)) + ' min read';

  // Escape helpers
  const esc    = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escAttr = s => (s || '').replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escAttr(post.title)} | Blog — Vinodhariharan Ravi</title>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-6E52VLX2ZZ"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-6E52VLX2ZZ');</script>
  <!-- Styles -->
  <script>tailwind.config={darkMode:'class'};</script>
  <script src="https://cdn.tailwindcss.com"></script>
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
    "author":{"@type":"Person","name":"Vinodhariharan Ravi","url":"${SITE}"},
    "url":"${SITE}/post/${post.slug}"
  }
  </script>
  <style>
    #reading-progress{position:fixed;top:0;left:0;height:2px;width:0%;background:#2563eb;z-index:100;transition:width 0.1s linear}
  </style>
</head>
<body class="bg-[#ffffff] dark:bg-[#0a0a0a] text-[#0a0a0a] dark:text-[#fafafa] transition-colors duration-300 min-h-screen flex flex-col">
  <div id="reading-progress"></div>

  <!-- Nav -->
  <nav class="fixed top-0 w-full z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-[#e5e5e5] dark:border-[#222222] transition-colors duration-300">
    <div class="max-w-5xl mx-auto px-6 flex items-center justify-between h-16">
      <a href="/" style="font-family:'Glacial Indifference',sans-serif;" class="text-xl font-bold text-[#0a0a0a] dark:text-[#fafafa] tracking-tight">vh</a>
      <p class="hidden md:block text-sm text-[#737373] truncate max-w-xs mx-4 flex-1 text-center">${esc(post.title)}</p>
      <div class="flex items-center gap-6">
        <a href="/blog.html" class="text-sm text-[#737373] hover:text-[#2563eb] transition-colors">← All posts</a>
        <button id="dmToggle" class="p-2 rounded-full text-[#737373] hover:text-[#0a0a0a] dark:hover:text-[#fafafa] transition-colors" aria-label="Toggle dark mode">
          <svg class="w-5 h-5 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <svg class="w-5 h-5 block dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
        </button>
      </div>
    </div>
  </nav>

  <main class="flex-grow pt-24 pb-24">
    <div class="max-w-5xl mx-auto px-6 flex gap-10 items-start">

      <!-- Post content -->
      <div class="flex-1 min-w-0 max-w-2xl">

        <!-- Back -->
        <a href="/blog.html" class="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#2563eb] transition-colors mb-10">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          All posts
        </a>

        <!-- Cover image -->
        ${post.cover_image
          ? `<img src="${post.cover_image}" alt="${escAttr(post.title)}" class="w-full rounded-xl mb-8 border border-[#e5e5e5] dark:border-[#222222] object-cover max-h-80"/>`
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
          </div>
          ${post.excerpt
            ? `<p class="mt-5 text-[#737373] text-base leading-relaxed">${esc(post.excerpt)}</p>`
            : ''}
        </header>

        <!-- Content -->
        <div class="prose-blog">${contentHtml}</div>

        <!-- Post footer -->
        <footer class="mt-14 pt-8 border-t border-[#e5e5e5] dark:border-[#222222]">
          <a href="/blog.html" class="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-[#2563eb] transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Back to all posts
          </a>
        </footer>

      </div>

      <!-- Right-side ad (desktop only, scrolls with page) -->
      <aside class="hidden lg:flex flex-col items-center gap-1 w-40 shrink-0 pt-16">
        <p style="font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#c4c4c4;margin-bottom:0.5rem;">Advertisement</p>
        <div style="border:1px dashed #e5e5e5;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;width:160px;height:300px;background:#fafafa;">
          <span style="font-size:0.75rem;color:#d4d4d4;writing-mode:vertical-rl;">160 &times; 300</span>
        </div>
      </aside>

    </div>
  </main>

  <!-- Site footer -->
  <footer class="footer-bg border-t border-[#e5e5e5] dark:border-[#222222] py-10 bg-[#ffffff] dark:bg-[#0a0a0a] transition-colors duration-300">
    <div class="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <p class="text-sm text-[#737373]">© 2026 Vinodhariharan Ravi</p>
      <div class="flex items-center gap-5 text-sm text-[#737373]">
        <a href="/privacy.html" class="hover:text-[#2563eb] transition-colors">Privacy</a>
        <a href="/terms.html"   class="hover:text-[#2563eb] transition-colors">Terms</a>
      </div>
    </div>
  </footer>

  <script>
    // Dark mode
    (function(){
      const saved = localStorage.getItem('darkMode');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      if (saved === 'enabled' || (saved === null && prefersDark)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    })();

    document.getElementById('dmToggle').addEventListener('click', () => {
      const d = document.documentElement.classList.toggle('dark');
      localStorage.setItem('darkMode', d ? 'enabled' : 'disabled');
    });

    // Reading progress
    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
      document.getElementById('reading-progress').style.width = Math.min(100, pct) + '%';
    }, { passive: true });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
    }
  });
}
