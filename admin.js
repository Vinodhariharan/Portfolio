// admin.js — requires supabaseClient from supabase-config.js

// ── State ─────────────────────────────────────────────────────────────────────
let editingPostId = null;
let deleteTargetId = null;

// ── UI helpers ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function showSection(name) {
  ['login-section', 'dashboard-section', 'editor-section'].forEach(hide);
  show(name);
}

function setError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearMsg(id) { $(id).classList.add('hidden'); }

// ── Slug ──────────────────────────────────────────────────────────────────────
function generateSlug(title) {
  return title.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showSection('dashboard-section');
    loadDashboard();
  } else {
    showSection('login-section');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  clearMsg('login-error');
  const { error } = await supabaseClient.auth.signInWithPassword({
    email:    $('login-email').value,
    password: $('login-password').value
  });
  if (error) { setError('login-error', error.message); return; }
  showSection('dashboard-section');
  loadDashboard();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  showSection('login-section');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  show('dashboard-loading');
  hide('posts-table-wrapper');
  hide('dashboard-empty');

  const { data: posts, error } = await supabaseClient
    .from('posts')
    .select('id, title, slug, is_published, is_featured, created_at, view_count')
    .order('created_at', { ascending: false });

  hide('dashboard-loading');
  if (error || !posts || posts.length === 0) { show('dashboard-empty'); return; }

  show('posts-table-wrapper');
  $('posts-table-body').innerHTML = posts.map(p => `
    <tr class="hover:bg-[#f5f5f5] dark:hover:bg-[#111111] transition-colors">
      <td class="px-5 py-4 font-medium text-[#0a0a0a] dark:text-[#fafafa]">${escapeHtml(p.title)}</td>
      <td class="px-5 py-4">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${p.is_published
          ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
          : 'border-[#e5e5e5] dark:border-[#222222] text-[#737373]'}">
          ${p.is_published ? 'Published' : 'Draft'}
        </span>
      </td>
      <td class="px-5 py-4 text-center">
        <button onclick="toggleFeatured('${p.id}', ${!!p.is_featured})"
                title="${p.is_featured ? 'Currently featured — click to unfeature' : 'Mark as featured'}"
                class="text-xl leading-none ${p.is_featured ? 'text-[#facc15]' : 'text-[#d4d4d4] dark:text-[#444] hover:text-[#facc15]'} transition-colors">
          ${p.is_featured ? '★' : '☆'}
        </button>
      </td>
      <td class="px-5 py-4 text-xs text-[#737373]">
        ${new Date(p.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}
      </td>
      <td class="px-5 py-4 text-right text-sm font-medium text-[#0a0a0a] dark:text-[#fafafa]">
        ${(p.view_count || 0).toLocaleString()}
      </td>
      <td class="px-5 py-4 text-right space-x-4">
        <button onclick="openEditor('${p.id}')" class="text-sm text-[#2563eb] hover:underline">Edit</button>
        <button onclick="openDeleteModal('${p.id}')" class="text-sm text-red-500 hover:underline">Delete</button>
      </td>
    </tr>
  `).join('');
}

// Toggle featured: unfeature any others first (partial unique index allows only one),
// then set the new one. Click on an already-featured post un-features it.
async function toggleFeatured(postId, currentlyFeatured) {
  if (currentlyFeatured) {
    await supabaseClient.from('posts').update({ is_featured: false }).eq('id', postId);
  } else {
    // Clear any other featured post first to satisfy the unique constraint.
    await supabaseClient.from('posts').update({ is_featured: false }).eq('is_featured', true);
    await supabaseClient.from('posts').update({ is_featured: true }).eq('id', postId);
  }
  loadDashboard();
}

// ── Stats / Analytics / Channel tab state ────────────────────────────────────
let statsLoaded     = false;
let analyticsLoaded = false;
let channelLoaded   = false;

function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('border-[#2563eb]', active);
    btn.classList.toggle('text-[#0a0a0a]', active);
    btn.classList.toggle('dark:text-[#fafafa]', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-[#737373]', !active);
  });
  $('tab-posts').classList.toggle('hidden',     tab !== 'posts');
  $('tab-stats').classList.toggle('hidden',     tab !== 'stats');
  $('tab-analytics').classList.toggle('hidden', tab !== 'analytics');
  $('tab-channel').classList.toggle('hidden',   tab !== 'channel');

  if (tab === 'stats' && !statsLoaded) {
    statsLoaded = true;
    loadStats();
  }
  if (tab === 'analytics' && !analyticsLoaded) {
    analyticsLoaded = true;
    loadAnalytics();
  }
  if (tab === 'channel' && !channelLoaded) {
    channelLoaded = true;
    loadChannelConfig();
  }
}

function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgoUTC(n) {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// Tiny inline-SVG sparkline for the last 30 days
function sparkline(daysMap) {
  const points = [];
  const today  = todayUTC();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    points.push(daysMap[ymd(d)] || 0);
  }
  const w = 120, h = 28, max = Math.max(1, ...points);
  const step = w / (points.length - 1);
  const path = points.map((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 2) - 1;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" class="block">
      <path d="${path}" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

async function loadStats() {
  show('stats-loading');
  hide('stats-empty');
  hide('stats-table-wrapper');

  // Pull posts and the daily breakdown view together
  const [postsResult, dailyResult] = await Promise.all([
    supabaseClient
      .from('posts')
      .select('id, title, slug, view_count')
      .order('view_count', { ascending: false }),
    supabaseClient
      .from('post_views_daily')
      .select('slug, viewed_date, views')
  ]);

  hide('stats-loading');

  const posts = postsResult.data || [];
  const daily = dailyResult.data || [];

  if (postsResult.error || posts.length === 0) {
    show('stats-empty');
    return;
  }

  // Index daily counts by slug → { 'YYYY-MM-DD': count }
  const bySlug = {};
  daily.forEach(row => {
    (bySlug[row.slug] ||= {})[row.viewed_date] = row.views;
  });

  const today    = ymd(todayUTC());
  const since7   = ymd(daysAgoUTC(6));   // inclusive of today => last 7 days
  const since30  = ymd(daysAgoUTC(29));

  let sumToday = 0, sumWeek = 0, sumMonth = 0, sumTotal = 0;

  const rows = posts.map(p => {
    const days = bySlug[p.slug] || {};
    let dayCount = 0, weekCount = 0, monthCount = 0;
    Object.entries(days).forEach(([date, count]) => {
      if (date === today)    dayCount   += count;
      if (date >= since7)    weekCount  += count;
      if (date >= since30)   monthCount += count;
    });
    sumToday += dayCount;
    sumWeek  += weekCount;
    sumMonth += monthCount;
    sumTotal += (p.view_count || 0);

    return `
      <tr class="hover:bg-[#f5f5f5] dark:hover:bg-[#111111] transition-colors">
        <td class="px-5 py-4 font-medium text-[#0a0a0a] dark:text-[#fafafa]">
          <a href="/post/${p.slug}" target="_blank" class="hover:text-[#2563eb] transition-colors">${escapeHtml(p.title)}</a>
        </td>
        <td class="px-5 py-4 text-right text-sm text-[#0a0a0a] dark:text-[#fafafa]">${dayCount.toLocaleString()}</td>
        <td class="px-5 py-4 text-right text-sm text-[#0a0a0a] dark:text-[#fafafa]">${weekCount.toLocaleString()}</td>
        <td class="px-5 py-4 text-right text-sm text-[#0a0a0a] dark:text-[#fafafa]">${monthCount.toLocaleString()}</td>
        <td class="px-5 py-4 text-right text-sm font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${(p.view_count || 0).toLocaleString()}</td>
        <td class="px-5 py-4">${sparkline(days)}</td>
      </tr>
    `;
  });

  $('stat-total').textContent = sumTotal.toLocaleString();
  $('stat-today').textContent = sumToday.toLocaleString();
  $('stat-week').textContent  = sumWeek.toLocaleString();
  $('stat-month').textContent = sumMonth.toLocaleString();

  $('stats-table-body').innerHTML = rows.join('');
  show('stats-table-wrapper');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Editor ────────────────────────────────────────────────────────────────────
async function openEditor(postId = null) {
  editingPostId = postId;
  clearMsg('editor-error');
  clearMsg('editor-success');
  $('editor-heading').textContent = postId ? 'Edit Post' : 'New Post';
  $('edit-post-id').value = postId || '';

  if (postId) {
    const { data: post } = await supabaseClient
      .from('posts').select('*').eq('id', postId).single();
    if (post) {
      $('post-title-input').value   = post.title;
      $('post-slug-input').value    = post.slug;
      $('slug-preview').textContent = post.slug;
      $('post-excerpt-input').value = post.excerpt || '';
      $('post-content-input').value = post.content;
      // Cover image
      $('cover-image-url').value = post.cover_image || '';
      if (post.cover_image) {
        $('cover-preview').src = post.cover_image;
        show('cover-preview-wrap');
      } else {
        hide('cover-preview-wrap');
      }
    }
  } else {
    $('post-title-input').value   = '';
    $('post-slug-input').value    = '';
    $('slug-preview').textContent = '…';
    $('post-excerpt-input').value = '';
    $('post-content-input').value = '';
    // Cover image reset
    $('cover-image-url').value = '';
    $('cover-preview').src     = '';
    hide('cover-preview-wrap');
  }
  showSection('editor-section');
}

async function savePost(isPublished) {
  clearMsg('editor-error');
  clearMsg('editor-success');

  const title   = $('post-title-input').value.trim();
  const slug    = $('post-slug-input').value.trim();
  const excerpt = $('post-excerpt-input').value.trim();
  const content = $('post-content-input').value.trim();

  if (!title)   { setError('editor-error', 'Title is required.');   return; }
  if (!slug)    { setError('editor-error', 'Slug is required.');    return; }
  if (!content) { setError('editor-error', 'Content is required.'); return; }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    setError('editor-error', 'Slug may only contain lowercase letters, numbers and hyphens.');
    return;
  }

  const cover_image = $('cover-image-url').value || null;
  const payload = { title, slug, excerpt, content, cover_image, is_published: isPublished };

  const { error } = editingPostId
    ? await supabaseClient.from('posts').update(payload).eq('id', editingPostId)
    : await supabaseClient.from('posts').insert([payload]);

  if (error) {
    setError('editor-error', error.code === '23505'
      ? 'A post with that slug already exists — choose a different slug.'
      : error.message);
    return;
  }

  show('editor-success');
  $('editor-success').textContent = isPublished ? '✓ Post published!' : '✓ Draft saved.';
  setTimeout(() => { showSection('dashboard-section'); loadDashboard(); }, 1200);
}

// ── Preview ───────────────────────────────────────────────────────────────────
function formatPreviewDate(d) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function estimateReadTimeFromText(content) {
  const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)) + ' min read';
}

function openPreview() {
  const title   = $('post-title-input').value.trim();
  const excerpt = $('post-excerpt-input').value.trim();
  const content = $('post-content-input').value.trim();
  const cover   = $('cover-image-url').value.trim();

  const titleEl    = $('preview-title');
  const excerptEl  = $('preview-excerpt');
  const dateEl     = $('preview-date');
  const readtimeEl = $('preview-readtime');
  const contentEl  = $('preview-content');
  const coverEl    = $('preview-cover');
  const emptyEl    = $('preview-empty');

  // Empty state — show only when there's truly nothing
  if (!title && !content) {
    titleEl.classList.add('hidden');
    excerptEl.classList.add('hidden');
    contentEl.innerHTML = '';
    coverEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    show('preview-modal');
    document.body.style.overflow = 'hidden';
    return;
  }
  emptyEl.classList.add('hidden');
  titleEl.classList.remove('hidden');

  // Populate
  titleEl.textContent  = title || 'Untitled post';
  dateEl.textContent   = formatPreviewDate(new Date());
  readtimeEl.textContent = estimateReadTimeFromText(content);

  if (excerpt) {
    excerptEl.textContent = excerpt;
    excerptEl.classList.remove('hidden');
  } else {
    excerptEl.classList.add('hidden');
  }

  if (cover) {
    coverEl.src = cover;
    coverEl.alt = title || '';
    coverEl.classList.remove('hidden');
  } else {
    coverEl.classList.add('hidden');
  }

  // Render markdown via marked (loaded from CDN in admin.html)
  contentEl.innerHTML = (typeof marked !== 'undefined' && content)
    ? marked.parse(content)
    : '<p class="text-[#737373]">(no content yet)</p>';

  // Reset scroll inside the modal in case it was open before
  const modal = $('preview-modal');
  show('preview-modal');
  modal.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  hide('preview-modal');
  document.body.style.overflow = '';
}

// ── Delete ────────────────────────────────────────────────────────────────────
function openDeleteModal(postId) {
  deleteTargetId = postId;
  show('delete-modal');
}
function closeDeleteModal() {
  deleteTargetId = null;
  hide('delete-modal');
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  await supabaseClient.from('posts').delete().eq('id', deleteTargetId);
  closeDeleteModal();
  loadDashboard();
}

// ── Cover image upload ────────────────────────────────────────────────────────
async function handleCoverUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const status = $('cover-upload-status');
  status.textContent = 'Uploading…';

  const filename = `covers/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { error } = await supabaseClient.storage
    .from('blog-images')
    .upload(filename, file, { cacheControl: '3600', upsert: false });

  if (error) { status.textContent = '✗ ' + error.message; return; }

  const { data: { publicUrl } } = supabaseClient.storage
    .from('blog-images')
    .getPublicUrl(filename);

  $('cover-image-url').value = publicUrl;
  $('cover-preview').src     = publicUrl;
  show('cover-preview-wrap');
  status.textContent = '✓ Cover set';
  setTimeout(() => { status.textContent = ''; }, 2000);
  e.target.value = '';
}

// ── Image upload ──────────────────────────────────────────────────────────────
async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const status = $('upload-status');
  status.textContent = 'Uploading…';

  const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { error } = await supabaseClient.storage
    .from('blog-images')
    .upload(filename, file, { cacheControl: '3600', upsert: false });

  if (error) { status.textContent = '✗ ' + error.message; return; }

  const { data: { publicUrl } } = supabaseClient.storage
    .from('blog-images')
    .getPublicUrl(filename);

  const textarea = $('post-content-input');
  const md = `\n![Image](${publicUrl})\n`;
  const pos = textarea.selectionStart;
  textarea.value = textarea.value.slice(0, pos) + md + textarea.value.slice(pos);

  status.textContent = '✓ Inserted';
  setTimeout(() => { status.textContent = ''; }, 2000);
  e.target.value = '';
}

// ── Analytics (GA4) ───────────────────────────────────────────────────────────
const COUNTRY_FLAGS = {
  IN:'🇮🇳', US:'🇺🇸', GB:'🇬🇧', CA:'🇨🇦', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', SG:'🇸🇬',
  JP:'🇯🇵', NL:'🇳🇱', BR:'🇧🇷', NG:'🇳🇬', PK:'🇵🇰', BD:'🇧🇩', LK:'🇱🇰', AE:'🇦🇪'
};
const COUNTRY_CODES = {
  India:'IN', 'United States':'US', 'United Kingdom':'GB', Canada:'CA', Australia:'AU',
  Germany:'DE', France:'FR', Singapore:'SG', Japan:'JP', Netherlands:'NL', Brazil:'BR',
  Nigeria:'NG', Pakistan:'PK', Bangladesh:'BD', 'Sri Lanka':'LK', 'United Arab Emirates':'AE'
};
function flagOf(country) {
  return COUNTRY_FLAGS[COUNTRY_CODES[country] || ''] || '🌐';
}
function fmtNumber(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}
function fmtDuration(secs) {
  if (!Number.isFinite(secs)) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}
function fmtPct(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  return Math.round(ratio * 100) + '%';
}
function fmtDelta(pct) {
  if (pct == null || !Number.isFinite(pct)) {
    return '<span class="text-[#737373]">no prior data</span>';
  }
  const up = pct >= 0;
  const arrow = up ? '▲' : '▼';
  const color = up ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  return `<span class="${color}">${arrow} ${Math.abs(pct).toFixed(1)}%</span> <span class="text-[#737373]">vs prior 30d</span>`;
}

// Tiny inline-SVG sparkline w/ tooltip area
function renderSparkline(points, opts = {}) {
  const w = opts.width || 700;
  const h = opts.height || 110;
  if (!points || points.length === 0) return '';
  const max = Math.max(1, ...points.map(p => p.views));
  const step = w / (points.length - 1 || 1);

  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - (p.views / max) * (h - 6) - 3;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;

  const dots = points.map((p, i) => {
    const x = i * step;
    const y = h - (p.views / max) * (h - 6) - 3;
    const date = `${p.date.slice(0,4)}-${p.date.slice(4,6)}-${p.date.slice(6,8)}`;
    return `<g transform="translate(${x},${y})">
              <circle r="8" fill="transparent">
                <title>${date}: ${p.views} views</title>
              </circle>
              <circle r="1.5" fill="#2563eb"/>
            </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" class="block">
      <defs>
        <linearGradient id="ga-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#2563eb" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#ga-grad)"/>
      <path d="${path}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

function renderBarRow(label, value, max, options = {}) {
  const pct = Math.max(2, (value / max) * 100);
  const color = options.color || '#2563eb';
  return `
    <div class="flex items-center gap-3 text-sm">
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-[#0a0a0a] dark:text-[#fafafa]">${escapeHtml(label)}</span>
          <span class="text-xs text-[#737373] shrink-0">${fmtNumber(value)}</span>
        </div>
        <div class="mt-1 h-1.5 rounded-full bg-[#f5f5f5] dark:bg-[#222] overflow-hidden">
          <div class="h-full rounded-full" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>
    </div>`;
}

function renderCities(cities) {
  if (cities.length === 0) {
    return `<p class="text-sm text-[#737373]">No city data yet.</p>`;
  }
  const top = cities.slice(0, 10);
  const max = Math.max(...top.map(c => c.views), 1);
  return top.map(c => {
    const label = `<span class="mr-2">${flagOf(c.country)}</span>${c.city} · <span class="text-[#737373] text-xs">${c.country || 'Unknown'}</span>`;
    const pct = Math.max(2, (c.views / max) * 100);
    return `
      <div class="text-sm">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="truncate text-[#0a0a0a] dark:text-[#fafafa]">${label}</span>
          <span class="text-xs text-[#737373] shrink-0">${fmtNumber(c.views)}</span>
        </div>
        <div class="h-1.5 rounded-full bg-[#f5f5f5] dark:bg-[#222] overflow-hidden">
          <div class="h-full rounded-full" style="width:${pct}%;background:#2563eb;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderSources(sources) {
  if (sources.length === 0) {
    return `<p class="text-sm text-[#737373]">No traffic source data yet.</p>`;
  }
  const max = Math.max(...sources.map(s => s.sessions), 1);
  const colorFor = (medium) => {
    const m = (medium || '').toLowerCase();
    if (m.includes('organic'))     return '#16a34a';
    if (m.includes('referral'))    return '#a855f7';
    if (m.includes('social'))      return '#ec4899';
    if (m.includes('email'))       return '#f59e0b';
    if (m === '(none)' || m === '') return '#737373';
    return '#2563eb';
  };
  return sources.map(s => {
    const label = `${s.source} <span class="text-[#737373] text-xs">/ ${s.medium || '(none)'}</span>`;
    return renderBarRow(label, s.sessions, max, { color: colorFor(s.medium) });
  }).join('');
}

function renderDevices(devices) {
  if (devices.length === 0) {
    return `<p class="text-sm text-[#737373]">No device data yet.</p>`;
  }
  const total = devices.reduce((a, d) => a + d.views, 0) || 1;
  const icon = { mobile: '📱', desktop: '💻', tablet: '📲' };
  return devices.map(d => {
    const pct = Math.round((d.views / total) * 100);
    const cat = (d.category || 'other').toLowerCase();
    return `
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm text-[#0a0a0a] dark:text-[#fafafa]">${icon[cat] || '🌐'} ${d.category}</span>
          <span class="text-sm font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${pct}%</span>
        </div>
        <div class="h-2 rounded-full bg-[#f5f5f5] dark:bg-[#222] overflow-hidden">
          <div class="h-full rounded-full bg-[#2563eb]" style="width:${pct}%;"></div>
        </div>
        <p class="text-[10px] text-[#737373] mt-1">${fmtNumber(d.views)} views · ${fmtNumber(d.users)} users</p>
      </div>`;
  }).join('');
}

// Small per-page sparkline (compact version of the trend chart).
function renderMiniSparkline(points, opts = {}) {
  const w = opts.width || 320;
  const h = opts.height || 56;
  const color = opts.color || '#2563eb';
  if (!points || points.length === 0) return '';
  const max = Math.max(1, ...points.map(p => p.views));
  const step = w / (points.length - 1 || 1);

  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - (p.views / max) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  const gid = 'spk-' + Math.random().toString(36).slice(2, 8);

  const dots = points.map((p, i) => {
    const x = i * step;
    const y = h - (p.views / max) * (h - 4) - 2;
    const date = `${p.date.slice(0,4)}-${p.date.slice(4,6)}-${p.date.slice(6,8)}`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="transparent"><title>${date}: ${p.views} views</title></circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" class="block">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

// Per-page detailed cards (one per top page) with a 30-day sparkline.
function renderPages(pages) {
  if (pages.length === 0) {
    return `<p class="text-sm text-[#737373]">No page data yet.</p>`;
  }

  // Determine peak day across all pages for the "best day" badge.
  const cards = pages.map((p, i) => {
    const avgEng = p.views > 0 ? (p.engDur / p.views) : 0;
    const total30d = (p.daily || []).reduce((a, d) => a + d.views, 0);
    const peakDay  = (p.daily || []).reduce(
      (best, d) => d.views > (best?.views || 0) ? d : best, null);
    const peakStr  = peakDay
      ? `${peakDay.date.slice(0,4)}-${peakDay.date.slice(4,6)}-${peakDay.date.slice(6,8)} · ${peakDay.views} views`
      : '—';

    const rankColors = ['#facc15','#a3a3a3','#d97706'];
    const rankColor  = rankColors[i] || '#737373';
    const rankBadge  = i < 3
      ? `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white" style="background:${rankColor}">${i+1}</span>`
      : `<span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold text-[#737373] bg-[#f5f5f5] dark:bg-[#222]">${i+1}</span>`;

    return `
      <div class="border-t border-[#e5e5e5] dark:border-[#222222] py-5 first:border-t-0 first:pt-0">
        <div class="flex items-start gap-3 mb-3">
          ${rankBadge}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-[#0a0a0a] dark:text-[#fafafa] truncate">${escapeHtml(p.title || '(no title)')}</p>
            <a href="${escapeAttr(p.path)}" target="_blank" rel="noopener" class="text-xs text-[#737373] font-mono hover:text-[#2563eb] transition-colors truncate block">${escapeHtml(p.path)} ↗</a>
          </div>
        </div>

        <!-- Metrics row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <p class="text-[10px] uppercase tracking-wider text-[#737373]">Views</p>
            <p class="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${fmtNumber(p.views)}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-[#737373]">Users</p>
            <p class="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${fmtNumber(p.users || 0)}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-[#737373]">Avg. engagement</p>
            <p class="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${fmtDuration(avgEng)}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-[#737373]">Engagement rate</p>
            <p class="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa]">${fmtPct(p.engRate)}</p>
          </div>
        </div>

        <!-- Per-page sparkline -->
        ${total30d > 0 ? `
          <div class="rounded-lg bg-[#f5f5f5]/40 dark:bg-[#0f0f0f]/40 px-3 py-2">
            <div class="flex items-center justify-between text-[10px] text-[#737373] mb-1">
              <span>Last 30 days</span>
              <span>Peak: ${peakStr}</span>
            </div>
            ${renderMiniSparkline(p.daily || [])}
          </div>
        ` : `
          <p class="text-xs text-[#737373] italic">No daily data in the last 30 days.</p>
        `}
      </div>`;
  }).join('');

  return `<div>${cards}</div>`;
}

// Escape for HTML attributes (href).
function escapeAttr(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

async function loadAnalytics(forceFresh = false) {
  show('analytics-loading');
  hide('analytics-error');
  hide('analytics-body');

  try {
    const url = '/api/analytics/dashboard' + (forceFresh ? `?t=${Date.now()}` : '');
    const res = await fetch(url, { cache: forceFresh ? 'no-store' : 'default' });
    const data = await res.json();

    hide('analytics-loading');
    if (!res.ok || data.error) {
      const el = $('analytics-error');
      el.innerHTML = `<p class="font-semibold mb-1">Couldn't load analytics</p>
        <p class="text-xs">${escapeHtml(data.message || data.hint || data.error || 'Unknown error')}</p>`;
      show('analytics-error');
      return;
    }

    // Top-line metrics
    $('ga-views').textContent  = fmtNumber(data.totals.views.value);
    $('ga-views-d').innerHTML  = fmtDelta(data.totals.views.change);
    $('ga-users').textContent  = fmtNumber(data.totals.users.value);
    $('ga-users-d').innerHTML  = fmtDelta(data.totals.users.change);
    $('ga-eng').textContent    = fmtPct(data.totals.engagement.value);
    $('ga-eng-d').innerHTML    = fmtDelta(data.totals.engagement.change);
    $('ga-dur').textContent    = fmtDuration(data.totals.avgDur.value);
    $('ga-dur-d').innerHTML    = fmtDelta(data.totals.avgDur.change);

    // Trend
    $('ga-trend').innerHTML    = renderSparkline(data.daily);

    // Cities, sources, devices, pages
    $('ga-cities').innerHTML   = renderCities(data.cities);
    $('ga-sources').innerHTML  = renderSources(data.sources);
    $('ga-devices').innerHTML  = renderDevices(data.devices);
    $('ga-pages').innerHTML    = renderPages(data.pages);

    // Timestamp
    const ts = new Date(data.fetchedAt);
    $('ga-fetchedAt').textContent = `Data fetched ${ts.toLocaleString()}`;

    show('analytics-body');
  } catch (err) {
    hide('analytics-loading');
    const el = $('analytics-error');
    el.innerHTML = `<p class="font-semibold mb-1">Network error</p><p class="text-xs">${escapeHtml(String(err))}</p>`;
    show('analytics-error');
  }
}

// ── Channel config ────────────────────────────────────────────────────────────
function updateThumbPreview(inputId, imgId) {
  const input = $(inputId);
  const img   = $(imgId);
  const id    = (input.value || '').trim();
  if (id && /^[a-zA-Z0-9_-]{6,}$/.test(id)) {
    img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    img.classList.remove('hidden');
  } else {
    img.src = '';
    img.classList.add('hidden');
  }
}

function setChannelStatus(msg, ok = true) {
  const el = $('channel-save-status');
  el.textContent = msg;
  el.classList.remove('text-green-600', 'text-red-500');
  el.classList.add(ok ? 'text-green-600' : 'text-red-500');
  el.style.opacity = '1';
  if (ok) setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

async function loadChannelConfig() {
  show('channel-loading');
  hide('channel-form');

  const { data, error } = await supabaseClient
    .from('channel_config')
    .select('featured_video_id, trailer_video_id, subscribers_override, videos_override, views_override')
    .eq('id', 1)
    .single();

  hide('channel-loading');
  show('channel-form');

  if (error) {
    setChannelStatus('Could not load config: ' + error.message, false);
    return;
  }
  $('channel-featured-id').value       = data?.featured_video_id    || '';
  $('channel-trailer-id').value        = data?.trailer_video_id     || '';
  $('channel-subs-override').value     = data?.subscribers_override || '';
  $('channel-videos-override').value   = data?.videos_override      ?? '';
  $('channel-views-override').value    = data?.views_override       ?? '';
  updateThumbPreview('channel-featured-id', 'channel-featured-thumb');
  updateThumbPreview('channel-trailer-id',  'channel-trailer-thumb');
}

async function saveChannelConfig() {
  const featured        = $('channel-featured-id').value.trim()     || null;
  const trailer         = $('channel-trailer-id').value.trim()      || null;
  const subsRaw         = $('channel-subs-override').value.trim();
  const videosRaw       = $('channel-videos-override').value.trim();
  const viewsRaw        = $('channel-views-override').value.trim();

  const subscribers     = subsRaw || null;
  const videosOverride  = videosRaw === '' ? null : parseInt(videosRaw, 10);
  const viewsOverride   = viewsRaw  === '' ? null : parseInt(viewsRaw, 10);

  if (videosOverride !== null && !Number.isFinite(videosOverride)) {
    setChannelStatus('Videos override must be a number', false);
    return;
  }
  if (viewsOverride !== null && !Number.isFinite(viewsOverride)) {
    setChannelStatus('Views override must be a number', false);
    return;
  }

  const { error } = await supabaseClient
    .from('channel_config')
    .update({
      featured_video_id:    featured,
      trailer_video_id:     trailer,
      subscribers_override: subscribers,
      videos_override:      videosOverride,
      views_override:       viewsOverride,
      updated_at:           new Date().toISOString()
    })
    .eq('id', 1);

  if (error) {
    setChannelStatus('Save failed: ' + error.message, false);
    return;
  }
  setChannelStatus('Saved ✓', true);
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkSession();

  $('login-form').addEventListener('submit', handleLogin);
  $('logout-btn').addEventListener('click', handleLogout);
  $('new-post-btn').addEventListener('click', () => openEditor(null));
  $('back-to-dashboard').addEventListener('click', () => { showSection('dashboard-section'); loadDashboard(); });

  $('save-draft-btn').addEventListener('click', () => savePost(false));
  $('save-publish-btn').addEventListener('click', () => savePost(true));

  // Auto-generate slug on new posts
  $('post-title-input').addEventListener('input', e => {
    if (editingPostId) return;
    const s = generateSlug(e.target.value);
    $('post-slug-input').value    = s;
    $('slug-preview').textContent = s || '…';
  });

  $('post-slug-input').addEventListener('input', e => {
    $('slug-preview').textContent = e.target.value || '…';
  });

  $('regen-slug-btn').addEventListener('click', () => {
    const s = generateSlug($('post-title-input').value);
    $('post-slug-input').value    = s;
    $('slug-preview').textContent = s || '…';
  });

  $('image-upload-input').addEventListener('change', handleImageUpload);

  $('cover-upload-input').addEventListener('change', handleCoverUpload);
  $('cover-remove-btn').addEventListener('click', () => {
    $('cover-image-url').value = '';
    $('cover-preview').src     = '';
    hide('cover-preview-wrap');
  });

  // Preview
  $('preview-btn')?.addEventListener('click', openPreview);
  $('close-preview-btn')?.addEventListener('click', closePreview);
  $('preview-modal')?.addEventListener('click', (e) => {
    // Close only when clicking the backdrop (not when scrolling content)
    if (e.target === $('preview-modal')) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('preview-modal').classList.contains('hidden')) closePreview();
  });

  $('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  $('confirm-delete-btn').addEventListener('click', confirmDelete);
  $('delete-modal').addEventListener('click', e => {
    if (e.target === $('delete-modal')) closeDeleteModal();
  });

  // Tab switching
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Analytics tab — refresh button
  $('analytics-refresh-btn')?.addEventListener('click', () => loadAnalytics(true));

  // Channel tab — save button + live thumbnail previews
  $('channel-save-btn')?.addEventListener('click', saveChannelConfig);
  $('channel-featured-id')?.addEventListener('input', () => updateThumbPreview('channel-featured-id', 'channel-featured-thumb'));
  $('channel-trailer-id') ?.addEventListener('input', () => updateThumbPreview('channel-trailer-id',  'channel-trailer-thumb'));
});
