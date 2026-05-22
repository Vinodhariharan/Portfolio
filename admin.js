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
    .select('id, title, slug, is_published, created_at')
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
      <td class="px-5 py-4 text-right space-x-4">
        <button onclick="openEditor('${p.id}')" class="text-sm text-[#2563eb] hover:underline">Edit</button>
        <button onclick="openDeleteModal('${p.id}')" class="text-sm text-red-500 hover:underline">Delete</button>
      </td>
    </tr>
  `).join('');
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
    }
  } else {
    $('post-title-input').value   = '';
    $('post-slug-input').value    = '';
    $('slug-preview').textContent = '…';
    $('post-excerpt-input').value = '';
    $('post-content-input').value = '';
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

  const payload = { title, slug, excerpt, content, is_published: isPublished };

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

  $('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  $('confirm-delete-btn').addEventListener('click', confirmDelete);
  $('delete-modal').addEventListener('click', e => {
    if (e.target === $('delete-modal')) closeDeleteModal();
  });
});
