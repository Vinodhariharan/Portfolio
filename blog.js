// blog.js — requires supabaseClient (supabase-config.js) + marked (CDN)

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function estimateReadTime(content) {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200)) + ' min read';
}

// View tracking went live on this date — posts created earlier have
// incomplete counts.
const VIEW_TRACKING_START = '2026-06-15';

function isPreTracking(createdAt) {
  if (!createdAt) return false;
  return new Date(createdAt) < new Date(VIEW_TRACKING_START);
}

function viewBadge(count, size = 'sm', createdAt = null) {
  const n = count || 0;
  const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs';
  const partial  = isPreTracking(createdAt);

  // Card wraps everything in an <a>, so we can't nest a real <a> here.
  // Use a span + JS navigation, and stop the click from triggering the
  // parent card link. Outer wrapper has pb-2 so its hover area extends
  // down to the badge — no dead gap that loses :hover mid-move.
  const tooltip = partial ? `
    <span class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50">
      <span class="block w-56 px-3 py-2 rounded-lg bg-[#0a0a0a] dark:bg-[#222222] text-white text-[11px] leading-snug font-normal shadow-lg
                   after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                   after:border-4 after:border-transparent after:border-t-[#0a0a0a] dark:after:border-t-[#222222]">
        Views before tracking was added aren't included.
        <span role="link" tabindex="0" class="block mt-1 text-[#60a5fa] hover:underline cursor-pointer"
              onclick="event.preventDefault();event.stopPropagation();window.location.href='/privacy.html#view-tracking';">Learn more →</span>
      </span>
    </span>` : '';

  const infoIcon = partial ? `
    <svg class="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01"/>
    </svg>` : '';

  return `
    <span class="relative ${partial ? 'group' : ''} inline-flex items-center gap-1 ${textSize} text-[#737373]">
      <svg class="${iconSize}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>${n.toLocaleString()}</span>
      ${infoIcon ? `<span class="inline-flex" onclick="event.stopPropagation();">${infoIcon}</span>` : ''}
      ${tooltip}
    </span>`;
}

// ── Post card renderer ────────────────────────────────────────────────────────

function renderCard(post) {
  return `
    <a href="/post/${post.slug}"
       class="card post-card flex flex-col gap-3 cursor-pointer no-underline group">
      ${post.cover_image
        ? `<div class="w-full h-36 rounded-lg overflow-hidden bg-[#f5f5f5] dark:bg-[#111111] -mx-0">
             <img src="${post.cover_image}" alt="${post.title}" class="w-full h-full object-cover" loading="lazy" />
           </div>`
        : ''}
      <div class="flex items-center justify-between">
        <span class="text-xs text-[#737373]">${formatDate(post.created_at)}</span>
        <div class="flex items-center gap-2">
          ${viewBadge(post.view_count, 'sm', post.created_at)}
          <span class="text-[#e5e5e5] dark:text-[#333333]">·</span>
          <span class="text-xs text-[#737373]">${estimateReadTime(post.content)}</span>
        </div>
      </div>
      <div class="flex-1">
        <h3 class="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa] leading-snug mb-2 group-hover:text-[#2563eb] transition-colors">
          ${post.title}
        </h3>
        ${post.excerpt ? `<p class="text-sm text-[#737373] line-clamp-3 leading-relaxed">${post.excerpt}</p>` : ''}
      </div>
      <div class="flex items-center gap-1 text-xs font-medium text-[#2563eb] mt-1">
        Read more
        <svg class="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </div>
    </a>
  `;
}

// ── Featured post renderer ────────────────────────────────────────────────────

function renderFeatured(post) {
  return `
    <a href="/post/${post.slug}"
       class="card featured-card post-card flex flex-col md:flex-row gap-6 md:gap-8 cursor-pointer no-underline group">
      <div class="flex-1 flex flex-col justify-between gap-4">
        <div>
          <span class="inline-block text-[0.65rem] font-semibold tracking-widest uppercase text-[#2563eb] mb-3">Featured</span>
          <h2 class="text-2xl md:text-3xl font-bold text-[#0a0a0a] dark:text-[#fafafa] leading-snug mb-3 group-hover:text-[#2563eb] transition-colors">
            ${post.title}
          </h2>
          ${post.excerpt ? `<p class="text-[#737373] leading-relaxed line-clamp-3">${post.excerpt}</p>` : ''}
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 rounded-full overflow-hidden bg-[#e5e5e5] dark:bg-[#222222] shrink-0">
              <img src="/assets/new_profile.png" alt="Vinodhariharan Ravi" class="w-full h-full object-cover" />
            </div>
            <span class="text-sm text-[#737373]">${formatDate(post.created_at)}</span>
            <span class="text-sm text-[#737373]">·</span>
            <span class="text-sm text-[#737373]">${estimateReadTime(post.content)}</span>
            <span class="text-sm text-[#737373]">·</span>
            ${viewBadge(post.view_count, 'lg', post.created_at)}
          </div>
          <span class="flex items-center gap-1 text-sm font-medium text-[#2563eb]">
            Read
            <svg class="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </span>
        </div>
      </div>
      ${post.cover_image
        ? `<div class="w-full md:w-64 h-48 rounded-xl overflow-hidden shrink-0 bg-[#f5f5f5] dark:bg-[#111111]">
             <img src="${post.cover_image}" alt="${post.title}" class="w-full h-full object-cover" loading="lazy" />
           </div>`
        : ''}
    </a>
  `;
}

// ── SEO helpers ───────────────────────────────────────────────────────────────

function setMeta(nameOrProp, content, isCanonical = false) {
  if (isCanonical) {
    const el = document.querySelector('link[rel="canonical"]');
    if (el) el.href = content;
    return;
  }
  const el = document.querySelector(
    `meta[name="${nameOrProp}"], meta[property="${nameOrProp}"]`
  );
  if (el) el.setAttribute('content', content);
}

function injectBlogPostLD(post) {
  document.getElementById('blog-post-ld')?.remove();
  const s = document.createElement('script');
  s.id   = 'blog-post-ld';
  s.type = 'application/ld+json';
  s.text = JSON.stringify({
    '@context':     'https://schema.org',
    '@type':        'BlogPosting',
    'headline':     post.title,
    'description':  post.excerpt || '',
    'datePublished': post.created_at,
    'author': {
      '@type': 'Person',
      'name':  'Vinodhariharan Ravi',
      'url':   'https://vinodhariharan.vercel.app'
    },
    'url': `https://vinodhariharan.vercel.app/blog.html#${post.slug}`
  });
  document.head.appendChild(s);
}

// ── Reading progress bar ──────────────────────────────────────────────────────

let scrollHandler = null;

function attachProgressBar() {
  const bar = document.getElementById('reading-progress');
  if (!bar) return;

  scrollHandler = () => {
    const scrollTop    = window.scrollY;
    const docHeight    = document.documentElement.scrollHeight - window.innerHeight;
    const pct          = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    bar.style.width    = pct + '%';
  };

  window.addEventListener('scroll', scrollHandler, { passive: true });
}

function detachProgressBar() {
  const bar = document.getElementById('reading-progress');
  if (bar) bar.style.width = '0%';
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }
}

// ── Nav post title ────────────────────────────────────────────────────────────

function setNavTitle(title) {
  const el = document.getElementById('nav-post-title');
  if (!el) return;
  if (title) {
    el.textContent = title;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

// ── List view ─────────────────────────────────────────────────────────────────

async function loadPostList() {
  const featuredEl  = document.getElementById('featured-post');
  const postsSection = document.getElementById('posts-section');
  const grid        = document.getElementById('posts-grid');
  const empty       = document.getElementById('empty-state');
  const loading     = document.getElementById('loading-state');

  try {
    const { data: posts, error } = await supabaseClient
      .from('posts')
      .select('id, title, slug, excerpt, content, cover_image, created_at, view_count')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    loading.classList.add('hidden');
    if (error) throw error;

    if (!posts || posts.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    // First post → featured, rest → grid
    const [featured, ...rest] = posts;

    featuredEl.innerHTML = renderFeatured(featured);
    featuredEl.classList.remove('hidden');

    if (rest.length > 0) {
      grid.innerHTML = rest.map(renderCard).join('');
      postsSection.classList.remove('hidden');
    }

  } catch (err) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    console.error('loadPostList error:', err);
  }
}

// ── Single post view ──────────────────────────────────────────────────────────

async function loadSinglePost(slug) {
  const article    = document.getElementById('post-article');
  const notFound   = document.getElementById('post-not-found');
  const loading    = document.getElementById('post-loading');
  const readtimeBar = document.getElementById('post-readtime-bar');

  // Reset state
  article.classList.add('hidden');
  notFound.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    const { data: post, error } = await supabaseClient
      .from('posts')
      .select('title, slug, excerpt, content, cover_image, created_at, view_count')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();

    loading.classList.add('hidden');

    if (error || !post) {
      notFound.classList.remove('hidden');
      return;
    }

    // Populate fields
    document.title = `${post.title} | Vinodhariharan Ravi`;
    document.getElementById('post-title').textContent     = post.title;
    document.getElementById('post-date').textContent      = formatDate(post.created_at);
    document.getElementById('post-readtime').textContent  = estimateReadTime(post.content);

    const excerptEl = document.getElementById('post-excerpt');
    if (post.excerpt) {
      excerptEl.textContent = post.excerpt;
      excerptEl.classList.remove('hidden');
    } else {
      excerptEl.classList.add('hidden');
    }

    document.getElementById('post-content').innerHTML = marked.parse(post.content);

    if (readtimeBar) readtimeBar.textContent = estimateReadTime(post.content);

    article.classList.remove('hidden');

    // Update SEO meta dynamically
    document.title = `${post.title} | Blog — Vinodhariharan Ravi`;
    setMeta('description',         post.excerpt || post.title);
    setMeta('og:title',            post.title);
    setMeta('og:description',      post.excerpt || '');
    setMeta('og:url',              `https://vinodhariharan.vercel.app/blog.html#${post.slug}`);
    setMeta('og:type',             'article');
    setMeta('twitter:title',       post.title);
    setMeta('twitter:description', post.excerpt || '');
    setMeta('canonical',           `https://vinodhariharan.vercel.app/blog.html#${post.slug}`, true);
    injectBlogPostLD(post);

    // Update nav + progress bar
    setNavTitle(post.title);
    attachProgressBar();

    // Scroll to top of post view
    window.scrollTo({ top: 0 });

  } catch (err) {
    loading.classList.add('hidden');
    notFound.classList.remove('hidden');
    console.error('loadSinglePost error:', err);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

let listLoaded = false;

function route() {
  const listView = document.getElementById('blog-list-view');
  const postView = document.getElementById('blog-post-view');
  const hash     = window.location.hash;

  if (hash && hash.length > 1) {
    // ── Single post ──
    listView.classList.add('hidden');
    postView.classList.remove('hidden');
    document.title = 'Blog | Vinodhariharan Ravi';
    loadSinglePost(hash.slice(1));
  } else {
    // ── List ──
    postView.classList.add('hidden');
    listView.classList.remove('hidden');
    document.title = 'Blog | Vinodhariharan Ravi';

    // Clear progress + nav title
    detachProgressBar();
    setNavTitle(null);

    // Reset SEO to list-view defaults
    document.title = 'Blog | Vinodhariharan Ravi';
    setMeta('description',    'Blog by Vinodhariharan Ravi — thoughts on AI, full-stack engineering, and building things.');
    setMeta('og:type',        'website');
    setMeta('og:title',       'Blog — Vinodhariharan Ravi');
    setMeta('og:description', 'Thoughts on AI, full-stack engineering, and building things.');
    setMeta('og:url',         'https://vinodhariharan.vercel.app/blog.html');
    setMeta('twitter:title',       'Blog — Vinodhariharan Ravi');
    setMeta('twitter:description', 'Thoughts on AI, full-stack engineering, and building things.');
    setMeta('canonical',      'https://vinodhariharan.vercel.app/blog.html', true);
    document.getElementById('blog-post-ld')?.remove();

    // Only fetch once per page load
    if (!listLoaded) {
      listLoaded = true;
      loadPostList();
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  route();
});

window.addEventListener('hashchange', route);
