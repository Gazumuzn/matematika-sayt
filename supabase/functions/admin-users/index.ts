// Управление аккаунтами: только учитель создаёт учеников, сбрасывает пароли и удаляет аккаунты.
// Публичной регистрации нет (в настройках Auth она выключена).
// Первый аккаунт учителя создаётся один раз действием "bootstrap" с секретом BOOTSTRAP_TOKEN,
// который после этого удаляется.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const EMAIL_DOMAIN = 'matematika.example.com'; // вход по логину: login -> login@EMAIL_DOMAIN, писем не отправляем
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createAccount(name: string, login: string, password: string, role: 'teacher' | 'student') {
  const lg = String(login || '').toLowerCase().trim();
  if (!name || !String(name).trim()) return fail('Введите имя');
  if (!/^[a-z0-9._-]{3,40}$/.test(lg)) return fail('Логин: латиница, цифры, точка, дефис — от 3 символов');
  if (!password || String(password).length < 6) return fail('Пароль от 6 символов');
  const { data: exists } = await admin.from('profiles').select('id').eq('login', lg).maybeSingle();
  if (exists) return fail('Такой логин уже есть');
  const { data, error } = await admin.auth.admin.createUser({ email: `${lg}@${EMAIL_DOMAIN}`, password, email_confirm: true });
  if (error || !data.user) return fail('Не удалось создать аккаунт: ' + (error?.message || ''));
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, login: lg, name: String(name).trim().slice(0, 80), role });
  if (e2) { await admin.auth.admin.deleteUser(data.user.id); return fail('Не удалось создать профиль: ' + e2.message); }
  return json({ id: data.user.id, login: lg, name, role });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Только POST', 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail('Неверный запрос'); }

  if (body.action === 'bootstrap') {
    const token = Deno.env.get('BOOTSTRAP_TOKEN');
    if (!token || body.token !== token) return fail('Нет доступа', 403);
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher');
    if (count) return fail('Учитель уже создан', 409);
    return createAccount(body.name || 'Учитель', body.login || 'teacher', body.password, 'teacher');
  }

  // остальные действия — только учитель
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(jwt);
  if (!who?.user) return fail('Нужно войти', 401);
  const { data: me } = await admin.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
  if (me?.role !== 'teacher') return fail('Нет доступа', 403);

  const student = async (id: string) => {
    const { data } = await admin.from('profiles').select('id, role').eq('id', id).maybeSingle();
    return data?.role === 'student' ? data : null;
  };

  switch (body.action) {
    case 'create':
      return createAccount(body.name, body.login, body.password, 'student');
    case 'reset': {
      if (!(await student(body.id))) return fail('Нет такого ученика', 404);
      if (!body.password || String(body.password).length < 6) return fail('Пароль от 6 символов');
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
      return error ? fail(error.message) : json({ ok: true });
    }
    case 'delete': {
      if (!(await student(body.id))) return fail('Нет такого ученика', 404);
      // файлы работ ученика
      const { data: files } = await admin.storage.from('works').list(body.id, { limit: 1000 });
      if (files?.length) await admin.storage.from('works').remove(files.map(f => `${body.id}/${f.name}`));
      const { error } = await admin.auth.admin.deleteUser(body.id);
      return error ? fail(error.message) : json({ ok: true });
    }
    default:
      return fail('Неизвестное действие');
  }
});
