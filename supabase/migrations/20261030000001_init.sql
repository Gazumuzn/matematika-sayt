-- Тренажёр по математике: схема данных и правила доступа (Row Level Security).
-- Учитель — единственный пользователь с role = 'teacher'. Регистрации нет:
-- аккаунты создаёт функция admin-users (только по запросу учителя).

-- ---------- таблицы ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  login text not null unique,
  name text not null,
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz not null default now()
);

create table public.blocks (
  id text primary key,
  count int not null,
  chapter int not null
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  answers text not null default 'after' check (answers in ('after', 'always', 'never'))
);
insert into public.settings (id) values (1);

create table public.progress (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  block text not null references public.blocks,
  tasks int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, block)
);

create table public.activity (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  day date not null,
  n int not null default 1,
  primary key (user_id, day)
);

create table public.boards (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,80}$'),
  data jsonb not null default '{}',
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 140),
  note text not null default '' check (length(note) <= 4000),
  due date,
  items jsonb not null,            -- [{block, tasks:[1,2,3]}]
  assignees uuid[],                -- null = всем ученикам
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  hw_id uuid not null references public.homework on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  text text not null default '' check (length(text) <= 4000),
  files jsonb not null default '[]',        -- [{path, name, kind}]
  status text not null default 'submitted' check (status in ('submitted', 'checked', 'returned')),
  grade int check (grade between 1 and 5),
  comment text not null default '' check (length(comment) <= 4000),
  annotations jsonb not null default '[]',  -- [{of, path}]
  created_at timestamptz not null default now(),
  checked_at timestamptz
);
create index on public.submissions (hw_id);
create index on public.submissions (user_id);

-- ---------- вспомогательные функции ----------
create function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher');
$$;

create function public.hw_visible(h public.homework) returns boolean
language sql stable as $$
  select public.is_teacher() or h.assignees is null or auth.uid() = any (h.assignees);
$$;

-- Можно ли текущему пользователю видеть ответы блока
create function public.answers_allowed(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_teacher()
    or (select answers from settings where id = 1) = 'always'
    or ((select answers from settings where id = 1) = 'after' and (
      exists (select 1 from progress p join blocks k on k.id = p.block
              where p.user_id = auth.uid() and p.block = b and cardinality(p.tasks) >= k.count)
      or exists (select 1 from submissions s join homework h on h.id = s.hw_id
                 where s.user_id = auth.uid() and h.items @> jsonb_build_array(jsonb_build_object('block', b)))
    ))
  );
$$;

-- Сырые данные ученика для подсчёта опыта и наград (ученик — свои, учитель — любые)
create function public.student_raw(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if uid is distinct from auth.uid() and not is_teacher() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'progress', coalesce((select jsonb_object_agg(block, to_jsonb(tasks)) from progress where user_id = uid), '{}'),
    'days', coalesce((select jsonb_object_agg(day::text, n) from activity where user_id = uid), '{}'),
    'boards', (select count(*) from boards where user_id = uid and jsonb_array_length(coalesce(data->'strokes', '[]')) > 0),
    'subs', coalesce((select jsonb_agg(jsonb_build_object('status', s.status, 'grade', s.grade, 'at', s.created_at, 'due', h.due))
                      from submissions s join homework h on h.id = s.hw_id where s.user_id = uid), '[]')
  );
end $$;

-- Все ученики с сырыми данными — только для учителя
create function public.class_raw() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'login', login, 'created_at', created_at, 'raw', student_raw(id)) order by name)
                   from profiles where role = 'student'), '[]');
end $$;

-- Рейтинг класса: только имя и опыт (без чужих оценок и ответов)
create function public.leaderboard() returns table (id uuid, name text, xp bigint, solved bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name,
    coalesce(pr.solved, 0) * 10 + coalesce(sb.grade_sum, 0) * 15 + coalesce(sb.on_time, 0) * 20
      + coalesce(bd.n, 0) * 2 + coalesce(pr.full_blocks, 0) * 50 as xp,
    coalesce(pr.solved, 0) as solved
  from profiles p
  left join lateral (
    select sum(cardinality(g.tasks)) as solved, count(*) filter (where cardinality(g.tasks) >= k.count) as full_blocks
    from progress g join blocks k on k.id = g.block where g.user_id = p.id) pr on true
  left join lateral (
    select sum(s.grade) filter (where s.status = 'checked') as grade_sum,
           count(*) filter (where h.due is not null and s.created_at < ((h.due + 1)::timestamp at time zone 'Asia/Almaty')) as on_time
    from submissions s join homework h on h.id = s.hw_id where s.user_id = p.id) sb on true
  left join lateral (
    select count(*) as n from boards b where b.user_id = p.id and jsonb_array_length(coalesce(b.data->'strokes', '[]')) > 0) bd on true
  where p.role = 'student' and auth.uid() is not null
  order by xp desc;
$$;

-- Прогресс класса по одному блоку — для учителя
create function public.class_block(b text) returns table (id uuid, name text, solved int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'forbidden'; end if;
  return query select p.id, p.name, coalesce(cardinality(g.tasks), 0)
    from profiles p left join progress g on g.user_id = p.id and g.block = b
    where p.role = 'student' order by 3 desc, p.name;
end $$;

-- Ученик не может сам поставить себе оценку или статус
create function public.submissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then
    new.user_id := auth.uid(); new.status := 'submitted'; new.grade := null;
    new.comment := ''; new.annotations := '[]'; new.checked_at := null; new.created_at := now();
  end if;
  return new;
end $$;
create trigger submissions_guard before insert on public.submissions for each row execute function public.submissions_guard();

-- ---------- правила доступа ----------
alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.settings enable row level security;
alter table public.progress enable row level security;
alter table public.activity enable row level security;
alter table public.boards enable row level security;
alter table public.homework enable row level security;
alter table public.submissions enable row level security;

create policy "читают все вошедшие" on public.profiles for select to authenticated using (true);
create policy "учитель меняет своё имя" on public.profiles for update to authenticated
  using (id = auth.uid() and role = 'teacher') with check (id = auth.uid() and role = 'teacher');

create policy "читают все вошедшие" on public.blocks for select to authenticated using (true);

create policy "читают все вошедшие" on public.settings for select to authenticated using (true);
create policy "меняет учитель" on public.settings for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

create policy "свой или учитель" on public.progress for select to authenticated using (user_id = auth.uid() or public.is_teacher());
create policy "пишет только свой" on public.progress for insert to authenticated with check (user_id = auth.uid());
create policy "меняет только свой" on public.progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "свой или учитель" on public.activity for select to authenticated using (user_id = auth.uid() or public.is_teacher());
create policy "пишет только свой" on public.activity for insert to authenticated with check (user_id = auth.uid());
create policy "меняет только свой" on public.activity for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "своя или открытый разбор учителя" on public.boards for select to authenticated
  using (user_id = auth.uid() or (published and exists (select 1 from public.profiles t where t.id = boards.user_id and t.role = 'teacher')));
create policy "пишет только свою" on public.boards for insert to authenticated with check (user_id = auth.uid());
create policy "меняет только свою" on public.boards for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "учитель — все, ученик — свои" on public.homework for select to authenticated using (public.hw_visible(homework));
create policy "создаёт учитель" on public.homework for insert to authenticated with check (public.is_teacher());
create policy "меняет учитель" on public.homework for update to authenticated using (public.is_teacher());
create policy "удаляет учитель" on public.homework for delete to authenticated using (public.is_teacher());

create policy "свои или учитель" on public.submissions for select to authenticated using (user_id = auth.uid() or public.is_teacher());
create policy "ученик сдаёт своё задание" on public.submissions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.homework h where h.id = hw_id and public.hw_visible(h)));
create policy "проверяет учитель" on public.submissions for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "удаляет учитель" on public.submissions for delete to authenticated using (public.is_teacher());

-- анонимам — ничего; функции только для вошедших
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_teacher(), public.hw_visible(public.homework), public.answers_allowed(text), public.student_raw(uuid),
  public.class_raw(), public.leaderboard(), public.class_block(text) to authenticated;

-- ---------- закрытое хранилище файлов ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('book', 'book', false, 5242880, array['image/webp']),
  ('works', 'works', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

-- книга: задачи видят все вошедшие, ответы — по правилу answers_allowed
create policy "книга: задачи и разрешённые ответы" on storage.objects for select to authenticated
  using (bucket_id = 'book' and (name ~ 't\.webp$' or public.answers_allowed(substring(name from 'b[0-9]{3}'))));

-- работы: папка = id ученика; ученик видит и загружает только своё, учитель — всё
create policy "работы: читать своё или учитель" on storage.objects for select to authenticated
  using (bucket_id = 'works' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher()));
create policy "работы: загружать в свою папку или учитель" on storage.objects for insert to authenticated
  with check (bucket_id = 'works' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher()));
create policy "работы: удаляет учитель" on storage.objects for delete to authenticated
  using (bucket_id = 'works' and public.is_teacher());
