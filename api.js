// Слой данных: те же «адреса», что были у сервера (/api/...), но работа идёт напрямую с Supabase.
// Права проверяет сама база (Row Level Security), поэтому обойти их из браузера нельзя.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN } from './config.js';
import { computeStats, levelOf, today } from './stats.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

let BOOK = null, BLOCKS = {};
export function setBook(book) {
  BOOK = book;
  book.chapters.forEach((c, ci) => c.sections.forEach(s => s.blocks.forEach(b => { BLOCKS[b.id] = { ...b, ci }; })));
}

class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
const err = (msg, status = 400) => { throw new ApiError(msg, status); };
const check = ({ data, error }, msg) => { if (error) err(msg || humanize(error), error.status || 400); return data; };
function humanize(e) {
  const m = String(e?.message || e || '');
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток. Подождите несколько минут.';
  if (/JWT|not authenticated|session/i.test(m)) return 'Нужно войти заново';
  if (/forbidden|permission|row-level security|violates/i.test(m)) return 'Нет доступа';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером. Проверьте интернет.';
  return m || 'Ошибка';
}

let ME = null;
const pub = p => p && ({ id: p.id, login: p.login, name: p.name, role: p.role, createdAt: Date.parse(p.created_at) });
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; return null; }
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  ME = data || null;
  if (!ME) await sb.auth.signOut();
  return ME;
}
const needMe = () => ME || err('Нужно войти', 401);
const needTeacher = () => (needMe().role === 'teacher' ? ME : err('Нет доступа', 403));

async function adminCall(body) {
  const { data, error } = await sb.functions.invoke('admin-users', { body });
  if (error) {
    let msg = 'Ошибка';
    try { msg = (await error.context.json()).error || msg; } catch { msg = humanize(error); }
    err(msg);
  }
  return data;
}

// ---------- файлы ----------
const urlCache = new Map();
async function signed(bucket, paths) {
  const now = Date.now(), out = {}, need = [];
  for (const p of paths) { const c = urlCache.get(bucket + p); if (c && c.exp > now) out[p] = c.url; else need.push(p); }
  if (need.length) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need, 3600);
    for (const r of data || []) if (r.signedUrl && !r.error) { out[r.path] = r.signedUrl; urlCache.set(bucket + r.path, { url: r.signedUrl, exp: now + 50 * 60e3 }); }
  }
  return out;
}
export const fileUrl = async path => (await signed('works', [path]))[path];
// Подставляет адреса закрытых картинок: data-book="img/b001t.webp", data-file="<uid>/<file>"
export async function hydrate(root = document) {
  const books = [...root.querySelectorAll('[data-book]')], files = [...root.querySelectorAll('[data-file]')];
  const [bu, fu] = await Promise.all([
    books.length ? signed('book', [...new Set(books.map(e => e.dataset.book))]) : {},
    files.length ? signed('works', [...new Set(files.map(e => e.dataset.file))]) : {},
  ]);
  for (const e of books) { e.dataset.tried = 1; const u = bu[e.dataset.book]; if (u) e.src = u; }
  for (const e of files) { e.dataset.tried = 1; const u = fu[e.dataset.file]; if (!u) continue; if (e.tagName === 'A') e.href = u; else e.src = u; }
}
async function upload(uid, dataUrl, name) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) err('Можно загружать изображения и PDF');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[m[1]];
  if (!ext) err('Можно загружать изображения и PDF');
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  check(await sb.storage.from('works').upload(path, new Blob([bytes], { type: m[1] }), { contentType: m[1] }), `Не удалось загрузить «${name}»`);
  return path;
}

// ---------- вспомогательное ----------
function parseTasks(str, max) {
  const set = new Set();
  String(str || '').split(/[,;\s]+/).forEach(part => {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) return;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= 200; i++) if (!max || i <= max) set.add(i);
  });
  return [...set].sort((x, y) => x - y);
}
const hwOut = h => ({
  id: h.id, title: h.title, note: h.note, due: h.due, createdAt: Date.parse(h.created_at),
  assignees: h.assignees || 'all',
  items: h.items.map(it => ({ ...it, title: BLOCKS[it.block]?.title, n: BLOCKS[it.block]?.n })),
});
const subOut = s => ({
  id: s.id, hwId: s.hw_id, uid: s.user_id, text: s.text, status: s.status, grade: s.grade, comment: s.comment,
  at: Date.parse(s.created_at), checkedAt: s.checked_at && Date.parse(s.checked_at),
  files: (s.files || []).map(f => ({ file: f.path, name: f.name, kind: f.kind })),
  annotations: (s.annotations || []).map(a => ({ of: a.of, file: a.path })),
});
async function students() {
  return check(await sb.from('profiles').select('id, name, login, created_at').eq('role', 'student').order('name'));
}
async function hwList() {
  const me = needMe();
  const hws = check(await sb.from('homework').select('*').order('created_at', { ascending: false }));
  if (me.role === 'teacher') {
    const [st, subs] = await Promise.all([students(), sb.from('submissions').select('id, hw_id, user_id, status, created_at').then(r => check(r))]);
    return hws.map(h => {
      const assigned = h.assignees ? h.assignees.filter(id => st.some(s => s.id === id)) : st.map(s => s.id);
      const latest = assigned.map(uid => subs.filter(s => s.hw_id === h.id && s.user_id === uid).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]).filter(Boolean);
      return { ...hwOut(h), assignedCount: assigned.length, submitted: latest.length, toCheck: latest.filter(s => s.status === 'submitted').length };
    });
  }
  const subs = check(await sb.from('submissions').select('id, hw_id, status, grade, created_at').eq('user_id', me.id).order('created_at', { ascending: false }));
  return hws.map(h => {
    const my = subs.find(s => s.hw_id === h.id);
    return { ...hwOut(h), assignees: undefined, my: my ? { id: my.id, status: my.status, grade: my.grade, at: Date.parse(my.created_at) } : null };
  });
}
async function rawStats(uid) {
  return computeStats(check(await sb.rpc('student_raw', { uid })), BOOK);
}
async function bumpActivity(uid) {
  const day = today();
  const { data } = await sb.from('activity').select('n').eq('user_id', uid).eq('day', day).maybeSingle();
  await sb.from('activity').upsert({ user_id: uid, day, n: (data?.n || 0) + 1 });
}

// ---------- маршруты ----------
const routes = [
  ['GET', '/api/state', async () => {
    await loadMe();
    const settings = ME ? check(await sb.from('settings').select('answers').eq('id', 1).maybeSingle()) : null;
    return { me: pub(ME), settings: settings || { answers: 'after' } };
  }],
  ['POST', '/api/login', async ({ body }) => {
    const login = String(body.login || '').toLowerCase().trim();
    if (!/^[a-z0-9._-]{1,40}$/.test(login) || !body.password) err('Неверный логин или пароль', 401);
    const { error } = await sb.auth.signInWithPassword({ email: `${login}@${EMAIL_DOMAIN}`, password: String(body.password) });
    if (error) err(error.status === 429 ? 'Слишком много попыток. Подождите несколько минут.' : 'Неверный логин или пароль', 401);
    await loadMe();
    if (!ME) err('Аккаунт не найден', 401);
    return { me: pub(ME) };
  }],
  ['POST', '/api/logout', async () => { await sb.auth.signOut(); ME = null; return { ok: true }; }],
  ['POST', '/api/password', async ({ body }) => {
    const me = needMe();
    const { error } = await sb.auth.signInWithPassword({ email: `${me.login}@${EMAIL_DOMAIN}`, password: String(body.old || '') });
    if (error) err('Старый пароль неверный');
    if (!body.password || body.password.length < 6) err('Пароль от 6 символов');
    check(await sb.auth.updateUser({ password: body.password }));
    return { ok: true };
  }],
  ['POST', '/api/profile', async ({ body }) => {
    const me = needTeacher(); const name = String(body.name || '').trim().slice(0, 80);
    if (!name) err('Введите имя');
    check(await sb.from('profiles').update({ name }).eq('id', me.id));
    ME = { ...ME, name }; return { me: pub(ME) };
  }],
  ['POST', '/api/settings', async ({ body }) => {
    needTeacher();
    check(await sb.from('settings').update({ answers: body.answers }).eq('id', 1));
    return { answers: body.answers };
  }],

  ['GET', '/api/students', async () => {
    needTeacher();
    const list = check(await sb.rpc('class_raw'));
    return list.map(s => {
      const st = computeStats(s.raw, BOOK);
      return { id: s.id, login: s.login, name: s.name, role: 'student', createdAt: Date.parse(s.created_at), xp: st.xp, level: st.level,
        levelName: st.levelName, solved: st.solved, streak: st.streak, avgGrade: st.avgGrade, badges: st.badges.filter(b => b.got).length,
        lastDay: Object.keys(s.raw.days || {}).sort().pop() || null };
    });
  }],
  ['POST', '/api/students', async ({ body }) => { needTeacher(); return adminCall({ action: 'create', ...body }); }],
  ['POST', '/api/students/:id/password', async ({ p, body }) => { needTeacher(); return adminCall({ action: 'reset', id: p.id, password: body.password }); }],
  ['DELETE', '/api/students/:id', async ({ p }) => { needTeacher(); return adminCall({ action: 'delete', id: p.id }); }],

  ['GET', '/api/profile/:uid', async ({ p }) => {
    const me = needMe(); const uid = p.uid === 'me' ? me.id : p.uid;
    const prof = uid === me.id ? me : check(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
    if (!prof) err('Нет пользователя', 404);
    const raw = check(await sb.rpc('student_raw', { uid }));
    return { user: pub(prof), stats: computeStats(raw, BOOK), solved: raw.progress || {}, days: raw.days || {} };
  }],
  ['POST', '/api/progress', async ({ body }) => {
    const me = needMe(); const b = BLOCKS[body.block];
    if (!b || !Number.isInteger(body.task) || body.task < 1 || body.task > (b.count || 20) + 40) err('Неверная задача');
    const { data: row } = await sb.from('progress').select('tasks').eq('user_id', me.id).eq('block', body.block).maybeSingle();
    const set = new Set(row?.tasks || []);
    const was = set.has(body.task);
    if (body.solved) set.add(body.task); else set.delete(body.task);
    const tasks = [...set].sort((a, c) => a - c);
    check(await sb.from('progress').upsert({ user_id: me.id, block: body.block, tasks, updated_at: new Date().toISOString() }));
    if (body.solved && !was) await bumpActivity(me.id);
    return { solved: tasks, stats: await rawStats(me.id) };
  }],
  ['GET', '/api/class/block/:bid', async ({ p }) => { needTeacher(); return check(await sb.rpc('class_block', { b: p.bid })); }],
  ['GET', '/api/leaderboard', async () => {
    needMe();
    return check(await sb.rpc('leaderboard')).map(r => ({ id: r.id, name: r.name, xp: Number(r.xp), solved: Number(r.solved), levelName: levelOf(Number(r.xp)).levelName }));
  }],
  ['GET', '/api/answers/:bid', async ({ p }) => { needMe(); return { allowed: !!check(await sb.rpc('answers_allowed', { b: p.bid })) }; }],

  ['GET', '/api/homework', async () => hwList()],
  ['GET', '/api/homework/:id', async ({ p }) => {
    const me = needMe();
    const h = (await hwList()).find(x => x.id === p.id) || err('Нет задания', 404);
    let q = sb.from('submissions').select('*').eq('hw_id', p.id).order('created_at', { ascending: false });
    if (me.role !== 'teacher') q = q.eq('user_id', me.id);
    const subs = check(await q);
    const names = Object.fromEntries((await students()).map(s => [s.id, s.name]));
    return { hw: h, submissions: subs.map(s => ({ ...subOut(s), name: names[s.user_id] })) };
  }],
  ['POST', '/api/homework', async ({ body }) => {
    needTeacher();
    const items = (body.items || []).filter(it => BLOCKS[it.block]).map(it => ({ block: it.block, tasks: parseTasks(it.tasks, BLOCKS[it.block].count || 200) }));
    if (!body.title || !items.length) err('Нужны название и хотя бы один блок');
    const row = check(await sb.from('homework').insert({
      title: String(body.title).slice(0, 140), note: String(body.note || '').slice(0, 4000),
      due: /^\d{4}-\d{2}-\d{2}$/.test(body.due || '') ? body.due : null, items,
      assignees: Array.isArray(body.assignees) ? body.assignees : null,
    }).select().single());
    return hwOut(row);
  }],
  ['DELETE', '/api/homework/:id', async ({ p }) => {
    needTeacher();
    const subs = check(await sb.from('submissions').select('files, annotations').eq('hw_id', p.id));
    const paths = subs.flatMap(s => [...(s.files || []).map(f => f.path), ...(s.annotations || []).map(a => a.path)]);
    if (paths.length) await sb.storage.from('works').remove(paths);
    check(await sb.from('homework').delete().eq('id', p.id));
    return { ok: true };
  }],

  ['POST', '/api/submissions', async ({ body }) => {
    const me = needMe();
    if (!body.text && !(body.files || []).length) err('Прикрепите фото, файл или решение с доски');
    const files = [];
    for (const f of (body.files || []).slice(0, 20)) files.push({ path: await upload(me.id, f.dataUrl, f.name), name: String(f.name || 'файл').slice(0, 120), kind: f.kind === 'board' ? 'board' : 'upload' });
    const row = check(await sb.from('submissions').insert({ hw_id: body.hwId, text: String(body.text || '').slice(0, 4000), files }).select().single(),
      'Не удалось сдать работу');
    await bumpActivity(me.id);
    return subOut(row);
  }],
  ['GET', '/api/submissions', async () => {
    needMe();
    const [subs, hws, st] = await Promise.all([sb.from('submissions').select('*').order('created_at', { ascending: false }).then(r => check(r)),
      sb.from('homework').select('id, title').then(r => check(r)), students()]);
    const titles = Object.fromEntries(hws.map(h => [h.id, h.title])), names = Object.fromEntries(st.map(s => [s.id, s.name]));
    return subs.map(s => ({ ...subOut(s), name: names[s.user_id], hwTitle: titles[s.hw_id] }));
  }],
  ['GET', '/api/submissions/:id', async ({ p }) => {
    needMe();
    const s = check(await sb.from('submissions').select('*').eq('id', p.id).maybeSingle()) || err('Нет работы', 404);
    const hw = (await hwList()).find(h => h.id === s.hw_id);
    const prof = check(await sb.from('profiles').select('name').eq('id', s.user_id).maybeSingle());
    return { ...subOut(s), name: prof?.name, hw };
  }],
  ['POST', '/api/submissions/:id/review', async ({ p, body }) => {
    needTeacher();
    const s = check(await sb.from('submissions').select('user_id, annotations').eq('id', p.id).maybeSingle()) || err('Нет работы', 404);
    if (body.grade != null && ![1, 2, 3, 4, 5].includes(body.grade)) err('Оценка 1–5');
    let ann = s.annotations || [];
    for (const a of body.annotations || []) {
      if (!a.dataUrl) continue;
      const path = await upload(s.user_id, a.dataUrl, 'пометки');
      const old = ann.find(x => x.of === a.of);
      if (old) await sb.storage.from('works').remove([old.path]);
      ann = ann.filter(x => x.of !== a.of).concat({ of: a.of, path });
    }
    const row = check(await sb.from('submissions').update({
      grade: body.grade ?? null, comment: String(body.comment || '').slice(0, 4000),
      status: body.status === 'returned' ? 'returned' : 'checked', checked_at: new Date().toISOString(), annotations: ann,
    }).eq('id', p.id).select().single());
    return subOut(row);
  }],

  ['GET', '/api/boards', async () => {
    const me = needMe();
    const rows = check(await sb.from('boards').select('key, updated_at').eq('user_id', me.id).order('updated_at', { ascending: false }));
    return rows.map(r => ({ key: r.key, at: Date.parse(r.updated_at), title: BLOCKS[r.key]?.title || null, n: BLOCKS[r.key]?.n }));
  }],
  ['GET', '/api/boards/:key', async ({ p }) => {
    const me = needMe();
    const rows = check(await sb.from('boards').select('user_id, data, published, updated_at').eq('key', p.key));
    const mine = rows.find(r => r.user_id === me.id);
    const teacher = me.role !== 'teacher' ? rows.find(r => r.user_id !== me.id && r.published) : null;
    return { mine: mine ? { ...mine.data, at: Date.parse(mine.updated_at) } : null, teacher: teacher ? teacher.data : null, published: !!mine?.published };
  }],
  ['PUT', '/api/boards/:key', async ({ p, body }) => {
    const me = needMe();
    const { data: old } = await sb.from('boards').select('data').eq('user_id', me.id).eq('key', p.key).maybeSingle();
    check(await sb.from('boards').upsert({ user_id: me.id, key: p.key, data: { strokes: body.strokes || [], height: body.height || null, bg: body.bg || 'grid' }, updated_at: new Date().toISOString() }));
    if (!(old?.data?.strokes || []).length && (body.strokes || []).length) await bumpActivity(me.id);
    return { ok: true };
  }],
  ['POST', '/api/boards/:key/publish', async ({ p, body }) => {
    const me = needTeacher();
    check(await sb.from('boards').update({ published: !!body.publish }).eq('user_id', me.id).eq('key', p.key));
    return { published: !!body.publish };
  }],
].map(([method, pattern, fn]) => ({ method, fn, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') }));

export async function api(method, url, body) {
  const path = url.split('?')[0];
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return r.fn({ p: m.groups || {}, body: body || {} });
  }
  err('Неизвестный запрос ' + method + ' ' + url, 404);
}
