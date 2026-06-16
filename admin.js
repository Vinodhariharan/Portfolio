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
    .select('id, title, slug, is_published, created_at, view_count')
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

// ── Stats / Channel tab state ─────────────────────────────────────────────────
let statsLoaded   = false;
let channelLoaded = false;

function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('border-[#2563eb]', active);
    btn.classList.toggle('text-[#0a0a0a]', active);
    btn.classList.toggle('dark:text-[#fafafa]', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-[#737373]', !active);
  });
  $('tab-posts').classList.toggle('hidden',   tab !== 'posts');
  $('tab-stats').classList.toggle('hidden',   tab !== 'stats');
  $('tab-channel').classList.toggle('hidden', tab !== 'channel');

  if (tab === 'stats' && !statsLoaded) {
    statsLoaded = true;
    loadStats();
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
    .select('featured_video_id, trailer_video_id')
    .eq('id', 1)
    .single();

  hide('channel-loading');
  show('channel-form');

  if (error) {
    setChannelStatus('Could not load config: ' + error.message, false);
    return;
  }
  $('channel-featured-id').value = data?.featured_video_id || '';
  $('channel-trailer-id').value  = data?.trailer_video_id  || '';
  updateThumbPreview('channel-featured-id', 'channel-featured-thumb');
  updateThumbPreview('channel-trailer-id',  'channel-trailer-thumb');
}

async function saveChannelConfig() {
  const featured = $('channel-featured-id').value.trim() || null;
  const trailer  = $('channel-trailer-id').value.trim()  || null;

  const { error } = await supabaseClient
    .from('channel_config')
    .update({
      featured_video_id: featured,
      trailer_video_id:  trailer,
      updated_at:        new Date().toISOString()
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

  $('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  $('confirm-delete-btn').addEventListener('click', confirmDelete);
  $('delete-modal').addEventListener('click', e => {
    if (e.target === $('delete-modal')) closeDeleteModal();
  });

  // Tab switching
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Channel tab — save button + live thumbnail previews
  $('channel-save-btn')?.addEventListener('click', saveChannelConfig);
  $('channel-featured-id')?.addEventListener('input', () => updateThumbPreview('channel-featured-id', 'channel-featured-thumb'));
  $('channel-trailer-id') ?.addEventListener('input', () => updateThumbPreview('channel-trailer-id',  'channel-trailer-thumb'));
});
