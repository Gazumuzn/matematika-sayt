import { Board } from './board.js';
import { posterArt, stars, brandMark, ring, medal, badgeIcon, chapterGlyph, spinner, roman } from './art.js';
import { api as backend, setBook, hydrate, fileUrl } from './api.js';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');

async function api(method, url, body) {
  try { return await backend(method, url, body); }
  catch (e) { if (e.status === 401 && S.me && url !== '/api/password') { S.me = null; render(); } throw e; }
}
// закрытые картинки (книга, работы) получают временные ссылки, как только появляются на странице
const fill = () => hydrate(document).catch(() => {});
let fillT;
new MutationObserver(() => {
  if (!document.querySelector('img[data-book]:not([data-tried]), [data-file]:not([data-tried])')) return;
  clearTimeout(fillT); fillT = setTimeout(fill, 30);
}).observe(document.body, { childList: true, subtree: true });
function toast(msg, kind = '') {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'toast ' + kind; t.textContent = msg; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), kind === 'reward' ? 4200 : 2600);
}
function modal(html, onMount) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  onMount && onMount(bg, close);
  return close;
}
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
const fmtDateTime = ts => ts ? new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); };
const initials = n => String(n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const svgI = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const I = {
  pen: svgI('M4 20l1.5-5L16 4.5a2.1 2.1 0 013 3L8.5 18 4 20z'), back: svgI('M15 18l-6-6 6-6'), next: svgI('M9 18l6-6-6-6'),
  eye: svgI('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z'), plus: svgI('M12 5v14M5 12h14'),
  upload: svgI('M12 16V4M7 9l5-5 5 5M4 20h16'), check: svgI('M5 12l5 5 9-11'), book: svgI('M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5'),
  zin: svgI('M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6M11 8v6'), zout: svgI('M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6'),
};

// ---------- state ----------
const S = { me: null, settings: {}, book: null, blocks: {}, needsSetup: false, stats: null, solved: {}, toCheck: 0, attach: {} };
const isT = () => S.me?.role === 'teacher';

async function boot() {
  app.innerHTML = spinner();
  const book = await fetch('./book.json').then(r => r.json());
  setBook(book);
  const st = await api('GET', '/api/state');
  S.book = book;
  book.chapters.forEach((c, ci) => c.sections.forEach((s, si) => s.blocks.forEach(b => { S.blocks[b.id] = { ...b, ci, si }; })));
  S.allBlocks = Object.values(S.blocks);
  Object.assign(S, { me: st.me, settings: st.settings });
  if (S.me) await refreshMe();
  window.addEventListener('hashchange', render);
  render();
}
async function refreshMe() {
  if (!S.me) return;
  const p = await api('GET', '/api/profile/me');
  S.stats = p.stats; S.solved = p.solved;
  if (!lastBadges) { lastBadges = p.stats.badges.filter(b => b.got).map(b => b.key); lastLevel = p.stats.level; }
  if (isT()) S.toCheck = (await api('GET', '/api/submissions')).filter(s => s.status === 'submitted').length;
  else S.hwPending = (await api('GET', '/api/homework')).filter(h => !h.my || h.my.status === 'returned').length;
}

// ---------- router ----------
let cleanup = [];
function render() {
  cleanup.forEach(f => f()); cleanup = [];
  document.body.style.overflow = '';
  if (!S.me) return renderAuth();
  const hash = location.hash.replace(/^#\/?/, '');
  const [pathPart, qs] = hash.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  const r = parts[0] || '';
  const views = {
    '': home, book: () => bookView(), chapter: () => chapterView(+parts[1], q), block: () => blockView(parts[1]),
    solve: () => solveView(parts[1], q), hw: () => parts[1] === 'new' ? hwNew(q) : parts[1] ? hwDetail(parts[1]) : hwList(),
    review: () => reviewView(parts[1]), students: studentsView, student: () => awardsView(parts[1]),
    awards: () => awardsView('me'), settings: settingsView, boards: boardsView,
  };
  const view = views[r] || home;
  if (r !== 'solve') shell(r);
  window.scrollTo(0, 0);
  Promise.resolve(view()).catch(e => { $('main') && ($('main').innerHTML = `<div class="empty">${esc(e.message)}</div>`); });
}
const NI = {
  home: 'M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z', book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M8 7h7',
  clip: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12l3 3 5-6', users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 4a4 4 0 010 7M22 21a7 7 0 00-4-6.3',
  pen: 'M4 20l1.5-5L16 4.5a2.1 2.1 0 013 3L8.5 18 4 20zM14 6.5l3 3', award: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 14L7 22l5-3 5 3-1.5-8',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4', out: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
};
const nicon = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${NI[k]}"/></svg>`;
function navLinks() {
  return isT()
    ? [['', 'Главная', 'home'], ['book', 'Учебник', 'book'], ['hw', 'Задания', 'clip', S.toCheck], ['students', 'Ученики', 'users'], ['boards', 'Доска', 'pen'], ['settings', 'Настройки', 'gear']]
    : [['', 'Главная', 'home'], ['book', 'Учебник', 'book'], ['hw', 'Задания', 'clip', S.hwPending], ['awards', 'Награды', 'award'], ['boards', 'Доска', 'pen'], ['settings', 'Профиль', 'gear']];
}
function shell(active) {
  const links = navLinks();
  const map = { chapter: 'book', block: 'book', review: 'hw', student: 'students' };
  const cur = map[active] ?? active;
  const a = ([h, t, ic, n], cls = '') => `<a href="#/${h}" class="${cls} ${cur === h ? 'on' : ''}" ${cur === h ? 'aria-current="page"' : ''}>${nicon(ic)}<span>${t}</span>${n ? `<b class="badge">${n}</b>` : ''}</a>`;
  const st = S.stats;
  app.innerHTML = `<div class="layout">
    <aside class="sidebar">
      <a class="brand" href="#/">${brandMark()}<div><div class="brand-name">Тренажёр</div><div class="brand-sub">язык реальности</div></div></a>
      <button class="search-btn" id="searchBtn">${nicon('search')}<span>Поиск по книге</span><kbd>Ctrl K</kbd></button>
      <nav class="side-nav" aria-label="Разделы">${links.map(l => a(l)).join('')}</nav>
      <div class="side-foot">
        ${!isT() && st ? `<a class="side-level" href="#/awards"><span class="eyebrow">Уровень ${roman(st.level)}</span><b>${esc(st.levelName)}</b>
          <div class="progress gold"><i style="width:${st.levelTo ? (st.xp - st.levelFrom) / (st.levelTo - st.levelFrom) * 100 : 100}%"></i></div><small>${st.xp} XP</small></a>` : ''}
        <div class="side-user"><div class="avatar">${esc(initials(S.me.name))}</div><div class="who"><b>${esc(S.me.name)}</b><small>${isT() ? 'Учитель' : 'Ученик'}</small></div>
          <button class="icon-btn" id="logout" title="Выйти" aria-label="Выйти">${nicon('out')}</button></div>
      </div>
    </aside>
    <header class="mtop"><a class="brand" href="#/">${brandMark()}<div class="brand-name">Тренажёр</div></a>
      <button class="icon-btn" id="searchBtn2" aria-label="Поиск">${nicon('search')}</button>
      <a class="avatar" href="#/settings" aria-label="Профиль">${esc(initials(S.me.name))}</a></header>
    <main id="main">${spinner()}</main>
    <nav class="tabbar" aria-label="Разделы">${links.filter(l => l[0] !== 'settings').map(l => a(l, 'tab')).join('')}</nav>
  </div>`;
  $('#logout').onclick = async () => { await api('POST', '/api/logout'); S.me = null; location.hash = '#/'; render(); };
  $('#searchBtn').onclick = $('#searchBtn2').onclick = openSearch;
}

// ---------- search (Ctrl+K) ----------
function searchIndex() {
  if (S.index) return S.index;
  const items = [];
  S.book.chapters.forEach((c, ci) => {
    items.push({ kind: 'Глава', label: `Глава ${c.num}. ${c.title}`, sub: `${c.sections.reduce((a, s) => a + s.blocks.length, 0)} блоков`, href: `#/chapter/${ci}` });
    c.sections.forEach((s, si) => {
      if (s.title) items.push({ kind: '§', label: `§${s.num}. ${s.title}`, sub: `Глава ${c.num} · с. ${s.page}`, href: `#/chapter/${ci}?s=${si}` });
      s.blocks.forEach(b => items.push({ kind: 'Блок', label: `Блок ${b.n}. ${b.title}`, sub: `Глава ${c.num}${s.title ? ' · §' + s.num + ' ' + s.title : ''} · с. ${b.pages.join(', ')}`, href: `#/block/${b.id}`, pages: b.pages }));
    });
  });
  items.forEach(i => i.text = (i.label + ' ' + i.sub).toLowerCase().replace(/ё/g, 'е'));
  return S.index = items;
}
function openSearch() {
  if ($('.palette')) return;
  const close = modal(`<div class="palette"><label class="pal-in">${nicon('search')}<input type="text" id="q" placeholder="Тема, блок или номер страницы…" autocomplete="off" aria-label="Поиск"><kbd>Esc</kbd></label>
    <div class="pal-list" id="pl" role="listbox"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span></div></div>`, bg => {
    bg.classList.add('top'); bg.querySelector('.modal').classList.add('pal-modal');
    const q = bg.querySelector('#q'), pl = bg.querySelector('#pl');
    let res = [], sel = 0;
    const draw = () => {
      const s = q.value.trim().toLowerCase().replace(/ё/g, 'е');
      const idx = searchIndex();
      if (!s) res = idx.filter(i => i.kind === 'Глава');
      else if (/^\d{1,3}$/.test(s)) res = idx.filter(i => i.pages?.includes(+s)).map(i => ({ ...i, kind: 'с. ' + s }));
      else { const words = s.split(/\s+/); res = idx.filter(i => words.every(w => i.text.includes(w))).slice(0, 40); }
      sel = 0;
      pl.innerHTML = res.length ? res.map((r, i) => `<a class="pal-item ${i === sel ? 'sel' : ''}" href="${r.href}" role="option"><span class="k">${esc(r.kind)}</span><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></a>`).join('')
        : `<div class="empty" style="padding:24px">Ничего не найдено</div>`;
    };
    const move = d => { const its = $$('.pal-item', pl); if (!its.length) return; its[sel]?.classList.remove('sel'); sel = (sel + d + its.length) % its.length; its[sel].classList.add('sel'); its[sel].scrollIntoView({ block: 'nearest' }); };
    q.oninput = draw;
    q.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && res[sel]) { location.hash = res[sel].href; close(); }
      else if (e.key === 'Escape') close();
    };
    pl.onclick = e => { if (e.target.closest('a')) close(); };
    draw(); q.focus();
  });
}
document.addEventListener('keydown', e => {
  if (!S.me) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' || (e.key === '/' && !e.target.closest('input,textarea,select'))) {
    if ($('.solve')) return;
    e.preventDefault(); openSearch();
  }
  if (e.key === 'Escape') $('.modal-bg')?.remove();
});
const main = () => $('#main');

// ---------- auth ----------
function renderAuth() {
  app.innerHTML = `<div class="auth">
    <section class="poster">
      <div class="tag">Математика · подготовка к ЕНТ</div>
      <div class="title"><span>ЧИСТАЯ</span><span>МАТЕМАТИКА</span></div>
      <div class="motto">Открывай · Доказывай · Понимай</div>
      ${posterArt()}
      <div class="quote">«Тренажёр по математике» И. П. и С. Т. Рустюмовых —<br>более четырёх тысяч задач с ответами</div>
      <span class="formula" style="left:4%;top:46%">e<sup>iπ</sup> + 1 = 0</span>
      <span class="formula" style="right:4%;top:46%">Σ 1⁄n² = π²⁄6</span>
      <span class="formula" style="left:4%;bottom:24%">a² + b² = c²</span>
      <span class="formula" style="right:4%;bottom:24%">φ = (1 + √5) ⁄ 2</span>
    </section>
    <section class="auth-panel">${stars()}
      <form class="auth-card" id="auth">
        <div class="eyebrow">Вход</div>
        <h2>С возвращением</h2>
        <p>Войдите, чтобы продолжить решать задачи.</p>
        <label class="field"><span>Логин</span><input type="text" name="login" required autocomplete="username" autocapitalize="none"></label>
        <label class="field"><span>Пароль</span><input type="password" name="password" required autocomplete="current-password"></label>
        <div class="error" id="err"></div>
        <button class="btn" type="submit">Войти</button>
        <div class="hint">Регистрации нет. Логин и пароль выдаёт учитель.</div>
      </form>
    </section></div>`;
  $('#auth').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('POST', '/api/login', f);
      S.me = r.me; await refreshMe(); location.hash = '#/'; render();
    } catch (err) { $('#err').textContent = err.message; }
  };
}

// ---------- home ----------
async function home() {
  if (isT()) return teacherHome();
  const [hw, lb, boards] = await Promise.all([api('GET', '/api/homework'), api('GET', '/api/leaderboard'), api('GET', '/api/boards')]);
  const st = S.stats;
  const pending = hw.filter(h => !h.my || h.my.status === 'returned');
  const pct = st.levelTo ? Math.round((st.xp - st.levelFrom) / (st.levelTo - st.levelFrom) * 100) : 100;
  // начатые, но не законченные блоки: сначала с доской (по дате), затем просто отмеченные
  const started = Object.keys(S.solved).filter(k => S.blocks[k] && S.solved[k].length && S.solved[k].length < S.blocks[k].count);
  const recent = [...boards.filter(b => S.blocks[b.key]), ...started.map(key => ({ key }))]
    .filter((b, i, arr) => arr.findIndex(x => x.key === b.key) === i && (S.solved[b.key] || []).length < S.blocks[b.key].count).slice(0, 3);
  main().innerHTML = `
    <div class="page-head"><div><span class="eyebrow">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <h1>Здравствуйте, ${esc(S.me.name.split(' ')[0])}</h1></div>
      <a class="btn" href="#/book">${I.book} Открыть учебник</a></div>
    <div class="hello">
      <div class="card dark level-card">${medal(st.level)}
        <div><div class="eyebrow">Уровень ${roman(st.level)}</div><div class="level-name">${esc(st.levelName)}</div>
          <div class="muted">${st.nextName ? `Следующий — ${esc(st.nextName)}` : 'Высший уровень достигнут'}</div>
          <div class="xp-row"><span>${st.xp} XP</span><span>${st.levelTo ? st.levelTo + ' XP' : ''}</span></div>
          <div class="progress gold"><i style="width:${pct}%"></i></div></div></div>
      <div class="grid g2">
        <div class="card stat"><b>${st.solved}</b><span>задач решено</span></div>
        <div class="card stat"><b>${st.streak}</b><span>${st.streak === 1 ? 'день' : 'дней'} подряд</span></div>
        <div class="card stat"><b>${st.badges.filter(b => b.got).length}<small class="muted" style="font-size:20px"> / ${st.badges.length}</small></b><span>наград</span></div>
        <div class="card stat"><b>${st.avgGrade ?? '—'}</b><span>средняя оценка</span></div>
      </div>
    </div>
    <div class="split">
      <div class="grid">
        <div class="card"><div class="card-title"><h3>Домашние задания</h3><a class="link" href="#/hw">все</a></div>
          ${pending.length ? pending.slice(0, 5).map(hwRow).join('') : `<div class="empty">Все задания сданы. Отличная работа!</div>`}</div>
        ${recent.length ? `<div class="card"><div class="card-title"><h3>Продолжить</h3></div>
          ${recent.map(b => { const bl = S.blocks[b.key]; return `<a class="hw-row" href="#/block/${bl.id}"><div><div class="hw-title">Блок ${bl.n}. ${esc(bl.title)}</div><div class="hw-meta">Глава ${S.book.chapters[bl.ci].num} · решено ${(S.solved[bl.id] || []).length} из ${bl.count}${b.at ? ' · ' + fmtDateTime(b.at) : ''}</div></div>${ring((S.solved[bl.id] || []).length, bl.count, 44)}</a>`; }).join('')}</div>` : ''}
      </div>
      <div class="grid">
        <div class="card"><div class="card-title"><h3>Рейтинг класса</h3></div>${leaderboard(lb)}</div>
        <div class="card"><div class="card-title"><h3>Последние награды</h3><a class="link" href="#/awards">все</a></div>
          <div class="badges" style="grid-template-columns:repeat(3,1fr);gap:8px">${st.badges.filter(b => b.got).slice(-3).map(b => `<div style="text-align:center">${badgeIcon(b.key, true).replace('<svg', '<svg style="width:64px;height:64px"')}<div style="font:500 14px var(--serif)">${esc(b.title)}</div></div>`).join('') || '<div class="muted" style="grid-column:1/-1">Решите первую задачу — и получите первую награду.</div>'}</div></div>
      </div>
    </div>`;
}
function hwRow(h) {
  const due = h.due ? new Date(h.due + 'T23:59:59') : null; const late = due && due < new Date();
  const st = h.my?.status;
  const pill = !h.my ? (late ? '<span class="pill bad">просрочено</span>' : '<span class="pill warn">не сдано</span>')
    : st === 'checked' ? `<span class="pill ok">оценка ${h.my.grade ?? '✓'}</span>` : st === 'returned' ? '<span class="pill bad">на доработку</span>' : '<span class="pill">на проверке</span>';
  return `<a class="hw-row" href="#/hw/${h.id}"><div><div class="hw-title">${esc(h.title)}</div>
    <div class="hw-meta">${h.items.map(i => `Блок ${i.n}`).join(', ')}${h.due ? ` · до ${fmtDate(due)}` : ''}</div></div>${pill}</a>`;
}
function leaderboard(lb) {
  if (!lb.length) return '<div class="muted">Пока нет учеников.</div>';
  return lb.slice(0, 8).map((r, i) => `<div class="lb-row ${r.id === S.me.id ? 'me' : ''} ${i === 0 ? 'top1' : ''}"><span class="n">${roman(i + 1)}</span>
    <span>${esc(r.name)} <span class="muted" style="font-size:12px">· ${esc(r.levelName)}</span></span><span>${r.xp} XP</span></div>`).join('');
}

async function teacherHome() {
  const [students, subs, hw] = await Promise.all([api('GET', '/api/students'), api('GET', '/api/submissions'), api('GET', '/api/homework')]);
  const waiting = subs.filter(s => s.status === 'submitted');
  S.toCheck = waiting.length;
  const lb = students.slice().sort((a, b) => b.xp - a.xp);
  main().innerHTML = `
    <div class="page-head"><div><span class="eyebrow">Кабинет учителя · ${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>Здравствуйте, ${esc(S.me.name.split(' ')[0])}</h1></div></div>
    <div class="grid g4" style="margin-bottom:20px">
      <div class="card stat"><b>${students.length}</b><span>учеников</span></div>
      <div class="card stat"><b>${hw.length}</b><span>заданий выдано</span></div>
      <div class="card stat"><b style="color:${waiting.length ? 'var(--red)' : 'inherit'}">${waiting.length}</b><span>ждут проверки</span></div>
      <div class="card stat"><b>${students.reduce((a, s) => a + s.solved, 0)}</b><span>задач решено классом</span></div>
    </div>
    <div class="quick">
      <a href="#/book">${nicon('book')}<b>Учебник</b><span>187 блоков</span></a>
      <a href="#/hw/new">${nicon('clip')}<b>Задать на дом</b><span>блоки и номера задач</span></a>
      <a href="#/students">${nicon('users')}<b>Ученики</b><span>добавить, сбросить пароль</span></a>
      <a href="#/solve/free">${nicon('pen')}<b>Доска</b><span>писать пером планшета</span></a>
    </div>
    <div class="split">
      <div class="grid">
        <div class="card"><div class="card-title"><h3>Ждут проверки</h3>${waiting.length ? `<span class="pill bad">${waiting.length}</span>` : ''}</div>
          ${waiting.length ? waiting.map(s => `<a class="hw-row" href="#/review/${s.id}"><div><div class="hw-title">${esc(s.name)}</div>
            <div class="hw-meta">${esc(s.hwTitle || '')} · ${fmtDateTime(s.at)} · ${plural(s.files.length, 'файл', 'файла', 'файлов')}</div></div><span class="btn small">Проверить</span></a>`).join('')
            : `<div class="empty">Всё проверено ✓</div>`}</div>
        <div class="card"><div class="card-title"><h3>Задания</h3><a class="link" href="#/hw">все</a></div>
          ${hw.length ? hw.slice(0, 5).map(h => `<a class="hw-row" href="#/hw/${h.id}"><div style="min-width:0"><div class="hw-title">${esc(h.title)}</div>
            <div class="hw-meta">${h.due ? 'до ' + fmtDate(new Date(h.due)) + ' · ' : ''}сдали ${h.submitted} из ${h.assignedCount}</div>
            <i class="mini" style="margin-top:8px"><i style="width:${h.assignedCount ? h.submitted / h.assignedCount * 100 : 0}%"></i></i></div>
            ${h.toCheck ? `<span class="pill bad">${h.toCheck} проверить</span>` : ''}</a>`).join('') : `<div class="empty">Заданий пока нет</div>`}</div>
      </div>
      <div class="card"><div class="card-title"><h3>Рейтинг класса</h3></div>${leaderboard(lb)}</div>
    </div>`;
}

// ---------- book ----------
function chapterProgress(ci) {
  let d = 0, t = 0;
  for (const s of S.book.chapters[ci].sections) for (const b of s.blocks) { d += Math.min((S.solved[b.id] || []).length, b.count); t += b.count; }
  return [d, t];
}
function bookView() {
  const total = S.allBlocks.reduce((a, b) => a + b.count, 0);
  main().innerHTML = `
    <div class="page-head"><div><span class="eyebrow">Рустюмова И. П., Рустюмова С. Т.</span><h1>Тренажёр по математике</h1>
      <div class="muted" style="margin-top:8px">${S.book.chapters.length} глав · ${S.allBlocks.length} блоков · около ${total} задач</div></div></div>
    <div class="chapters">${S.book.chapters.map((c, i) => {
      const [d, t] = chapterProgress(i); const nb = c.sections.reduce((a, s) => a + s.blocks.length, 0);
      return `<a class="card chapter-card" href="#/chapter/${i}">${chapterGlyph(i)}
        <div class="eyebrow">Глава</div><div class="num">${c.num}</div><div class="ttl">${esc(c.title)}</div>
        <div class="foot"><span>${plural(nb, 'блок', 'блока', 'блоков')} · ${t} задач ${isT() ? '' : `· решено ${d}`}</span>${isT() ? '' : `<div class="progress"><i style="width:${t ? d / t * 100 : 0}%"></i></div>`}</div></a>`;
    }).join('')}</div>`;
}
function blockBadge(b) {
  return isT() ? `<div class="count-badge"><b>${b.count}</b><span>задач</span></div>` : ring((S.solved[b.id] || []).length, b.count);
}
function chapterView(ci, q) {
  const c = S.book.chapters[ci]; if (!c) return bookView();
  const multi = c.sections.length > 1;
  const secDone = s => s.blocks.reduce((a, b) => a + Math.min((S.solved[b.id] || []).length, b.count), 0);
  const secTotal = s => s.blocks.reduce((a, b) => a + b.count, 0);
  main().innerHTML = `
    <div class="crumbs"><a href="#/book">Учебник</a> / Глава ${c.num}</div>
    <div class="page-head"><div><span class="eyebrow">Глава ${c.num}</span><h1>${esc(c.title)}</h1></div>
      <div style="display:flex;gap:8px">${ci > 0 ? `<a class="btn ghost small" href="#/chapter/${ci - 1}" title="${esc(S.book.chapters[ci - 1].title)}">${I.back} Глава ${S.book.chapters[ci - 1].num}</a>` : ''}${ci < S.book.chapters.length - 1 ? `<a class="btn ghost small" href="#/chapter/${ci + 1}" title="${esc(S.book.chapters[ci + 1].title)}">Глава ${S.book.chapters[ci + 1].num} ${I.next}</a>` : ''}</div></div>
    <div class="${multi ? 'chapter-layout' : ''}">
      ${multi ? `<nav class="toc" aria-label="Параграфы">${c.sections.map((s, si) => `<a href="#" data-sec="${si}"><span class="n">§${s.num}</span><span class="t">${esc(s.title)}
        ${isT() ? `<small>${s.blocks.length} бл. · ${secTotal(s)} задач</small>` : `<i class="mini"><i style="width:${secTotal(s) ? secDone(s) / secTotal(s) * 100 : 0}%"></i></i>`}</span></a>`).join('')}</nav>` : ''}
      <div>${c.sections.map((s, si) => `<section class="section" id="sec-${si}">
        <div class="section-head">${multi || s.title ? `<span class="sec">§${s.num}</span><h2>${esc(s.title || c.title)}</h2>` : ''}<span class="muted" style="margin-left:auto;font-size:12px;white-space:nowrap">с. ${s.page}</span></div>
        <div class="blocks">${s.blocks.map(b => `<a class="card block-card" href="#/block/${b.id}">${blockBadge(b)}
          <div><div class="eyebrow" style="letter-spacing:.2em">Блок ${b.n}</div><div class="t">${esc(b.title)}</div><div class="m">${plural(b.count, 'задача', 'задачи', 'задач')} · с. ${b.pages[0]}</div></div></a>`).join('')}</div>
      </section>`).join('')}</div>
    </div>`;
  const toc = $$('.toc a');
  toc.forEach(a => a.onclick = e => { e.preventDefault(); $('#sec-' + a.dataset.sec).scrollIntoView({ behavior: 'smooth' }); });
  if (toc.length) {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) toc.forEach(a => a.classList.toggle('on', 'sec-' + a.dataset.sec === en.target.id)); }), { rootMargin: '-20% 0px -70% 0px' });
    $$('.section').forEach(s => io.observe(s)); cleanup.push(() => io.disconnect());
  }
  const s0 = q?.get('s'); if (s0) requestAnimationFrame(() => $('#sec-' + s0)?.scrollIntoView());
}

async function blockView(id) {
  const b = S.blocks[id]; if (!b) return bookView();
  const c = S.book.chapters[b.ci], s = c.sections[b.si];
  const idx = S.allBlocks.indexOf(b), prev = S.allBlocks[idx - 1], next = S.allBlocks[idx + 1];
  const [ans, brd, hw, cls] = await Promise.all([api('GET', '/api/answers/' + id), api('GET', '/api/boards/' + id), isT() ? [] : api('GET', '/api/homework'), isT() ? api('GET', '/api/class/block/' + id) : []]);
  const hwTasks = new Set(hw.filter(h => !h.my || h.my.status === 'returned').flatMap(h => h.items.filter(i => i.block === id).flatMap(i => i.tasks)));
  const count = b.count || 20;
  let zoom = 100;
  main().innerHTML = `
    <div class="crumbs"><a href="#/book">Учебник</a> / <a href="#/chapter/${b.ci}">Глава ${c.num}</a> / §${s.num} ${esc(s.title || '')}</div>
    <div class="page-head"><div><span class="eyebrow">Глава ${c.num} · Блок ${b.n}</span><h2>${esc(b.title)}</h2>
      <div class="muted" style="margin-top:6px">${b.pages.length > 1 ? `Страницы ${b.pages[0]}–${b.pages[b.pages.length - 1]}` : `Страница ${b.pages[0]}`} · ${plural(count, 'задача', 'задачи', 'задач')}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" href="#/solve/${id}">${I.pen} Решать на доске</a>
        ${isT() ? `<a class="btn ghost" href="#/hw/new?block=${id}">${I.plus} Задать на дом</a>` : ''}
        ${!isT() && brd.teacher ? `<button class="btn gold" id="teacherBoard">${I.eye} Разбор учителя</button>` : ''}
      </div></div>
    <div class="block-layout">
      <div>
        <div class="sheet" id="tasksSheet"><img data-book="${b.tasks.src}" width="${b.tasks.w}" height="${b.tasks.h}" alt="Задачи блока ${b.n}: ${esc(b.title)}"></div>
        <div class="sheet" id="ansSheet" hidden></div>
        <div class="pager">${prev ? `<a class="pager-card" href="#/block/${prev.id}"><small>${I.back} Предыдущий · ←</small><b>Блок ${prev.n}. ${esc(prev.title)}</b></a>` : '<span></span>'}
          ${next ? `<a class="pager-card right" href="#/block/${next.id}"><small>Следующий · → ${I.next}</small><b>Блок ${next.n}. ${esc(next.title)}</b></a>` : ''}</div>
      </div>
      <aside class="side">
        ${isT() ? `<div class="card"><div class="card-title"><h3>Класс</h3><span class="muted">${count} задач</span></div>
          ${cls.length ? cls.map(s => `<a class="class-row" href="#/student/${s.id}"><span>${esc(s.name)}</span><span class="muted">${Math.min(s.solved, count)}/${count}</span>
            <i class="mini"><i style="width:${Math.min(100, s.solved / count * 100)}%"></i></i></a>`).join('') : '<div class="muted">Пока нет учеников.</div>'}</div>`
        : `<div class="card">
          <div class="card-title"><h3>Отметьте решённые</h3><span class="muted" id="cnt"></span></div>
          <div class="progress" style="margin-bottom:14px"><i id="bar"></i></div>
          <div class="tasks-grid">${Array.from({ length: count }, (_, i) => `<button class="task-chip${hwTasks.has(i + 1) ? ' hw' : ''}" data-t="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('')}</div>
          <div class="legend"><span><i style="background:var(--ink)"></i>решено</span>${hwTasks.size ? '<span><i style="box-shadow:inset 0 -3px 0 var(--gold)"></i>в домашнем задании</span>' : ''}</div>
        </div>`}
        <div class="card"><div class="card-title"><h3>Ответы</h3></div>
          ${b.answers ? (ans.allowed ? `<button class="btn ghost" id="showAns" style="width:100%">${I.eye} Показать ответы</button>`
            : `<div class="answers-locked">${S.settings.answers === 'never' ? 'Учитель закрыл ответы.' : 'Ответы откроются, когда вы отметите все задачи блока или сдадите домашнее задание с ним.'}</div>`) : '<div class="muted">Для этого блока ответов нет.</div>'}
        </div>
        ${isT() ? `<div class="card"><div class="card-title"><h3>Разбор для учеников</h3></div>
          <p class="muted" style="margin-top:0;font-size:14px">Решите задачи на доске и откройте решение ученикам.</p>
          <label class="check"><input type="checkbox" id="pub" ${brd.published ? 'checked' : ''} ${brd.mine?.strokes?.length ? '' : 'disabled'}> Показывать мой разбор</label>
          ${brd.mine?.strokes?.length ? '' : '<div class="muted" style="font-size:12px;margin-top:6px">Доска пока пустая.</div>'}</div>` : ''}
        <div class="card"><div class="zoom-ctl"><span class="eyebrow" style="flex:1">Масштаб</span>
          <button class="btn ghost small" id="zout" aria-label="Уменьшить">${I.zout}</button><button class="btn ghost small" id="zin" aria-label="Увеличить">${I.zin}</button></div></div>
      </aside>
    </div>`;
  const paint = () => {
    if (isT()) return;
    const done = new Set(S.solved[id] || []);
    $$('.task-chip').forEach(ch => { const d = done.has(+ch.dataset.t); ch.classList.toggle('done', d); ch.setAttribute('aria-pressed', d); });
    const n = [...done].filter(t => t <= count).length;
    $('#cnt').textContent = `${n} / ${count}`; $('#bar').style.width = n / count * 100 + '%';
  };
  paint();
  const onKey = e => {
    if (e.target.closest('input,textarea,select') || $('.modal-bg') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft' && prev) location.hash = '#/block/' + prev.id;
    if (e.key === 'ArrowRight' && next) location.hash = '#/block/' + next.id;
  };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  if (!isT()) $$('.task-chip').forEach(ch => ch.onclick = async () => {
    const t = +ch.dataset.t, solved = !ch.classList.contains('done');
    ch.classList.toggle('done', solved);
    try { const r = await api('POST', '/api/progress', { block: id, task: t, solved }); S.solved[id] = r.solved; celebrate(r.stats); paint(); if (solved && r.solved.length >= count && !ans.allowed && S.settings.answers === 'after') toast('Блок решён! Ответы открыты.'), setTimeout(render, 900); }
    catch (e) { toast(e.message); paint(); }
  });
  const setZoom = z => { zoom = Math.max(60, Math.min(200, z)); $$('.sheet').forEach(sh => sh.style.width = zoom === 100 ? '' : zoom + '%'); };
  $('#zin').onclick = () => setZoom(zoom + 20); $('#zout').onclick = () => setZoom(zoom - 20);
  $('#showAns')?.addEventListener('click', e => {
    const sh = $('#ansSheet'); const show = sh.hidden;
    if (show && !sh.innerHTML) sh.innerHTML = `<div class="eyebrow" style="margin-bottom:10px">Ответы · блок ${b.n}</div><img data-book="${b.answers.src}" width="${b.answers.w}" height="${b.answers.h}" alt="Ответы блока ${b.n}">`, fill();
    sh.hidden = !show; e.currentTarget.innerHTML = `${I.eye} ${show ? 'Скрыть ответы' : 'Показать ответы'}`;
    if (show) sh.scrollIntoView({ behavior: 'smooth' });
  });
  $('#pub')?.addEventListener('change', async e => { await api('POST', `/api/boards/${id}/publish`, { publish: e.target.checked }); toast(e.target.checked ? 'Разбор открыт ученикам' : 'Разбор скрыт'); });
  $('#teacherBoard')?.addEventListener('click', () => {
    const close = modal(`<h3>Разбор учителя · блок ${b.n}</h3><div id="tb" style="height:70vh"></div><div class="actions"><button class="btn" data-close>Закрыть</button></div>`, bg => {
      bg.querySelector('.modal').style.maxWidth = '1100px';
      new Board(bg.querySelector('#tb'), { readOnly: true, data: brd.teacher });
      bg.querySelector('#tb').classList.add('readonly');
    });
    cleanup.push(close);
  });
}

let lastBadges = null, lastLevel = null;
function celebrate(st) {
  const got = st.badges.filter(b => b.got).map(b => b.key);
  if (lastBadges) { const nw = st.badges.find(b => b.got && !lastBadges.includes(b.key)); if (nw) toast(`Новая награда: «${nw.title}»`, 'reward'); }
  if (lastLevel && st.level > lastLevel) toast(`Новый уровень: ${st.levelName}!`, 'reward');
  lastBadges = got; lastLevel = st.level; S.stats = st;
}

// ---------- solve: task + board ----------
async function solveView(key, q) {
  const b = S.blocks[key];
  const hwId = q.get('hw');
  const boardKey = b ? key : (key || 'free');
  const saved = await api('GET', '/api/boards/' + boardKey);
  document.body.style.overflow = 'hidden';
  app.innerHTML = `<div class="solve">
    <div class="solve-bar">
      <a class="btn ghost small" href="${hwId ? '#/hw/' + hwId : b ? '#/block/' + key : '#/boards'}">${I.back} Назад</a>
      <div class="ttl">${b ? `Блок ${b.n}. ${esc(b.title)}` : 'Свободная доска'}</div>
      ${b ? `<div class="tabs" style="gap:6px"><button class="btn small" id="tabBoard">Доска</button><button class="btn ghost small" id="tabTask">Задачи</button></div>
        <button class="btn ghost small" id="toggleTask" title="Показать/скрыть задачи">Задачи ⇆</button>` : ''}
      <span class="saved" id="saved">${saved.mine ? 'Сохранено' : ''}</span>
      ${hwId && !isT() ? `<button class="btn gold small" id="attach">${I.upload} Прикрепить к ДЗ</button>` : ''}
      <button class="btn small" id="png" title="Скачать решение картинкой">PNG</button>
    </div>
    <div class="solve-body${b ? '' : ' no-task'}" id="sb">
      <div class="solve-task">${b ? `<img data-book="${b.tasks.src}" alt="Задачи блока ${b.n}">` : ''}</div>
      <div class="divider" id="div" role="separator" aria-label="Изменить ширину"></div>
      <div class="solve-board" id="boardHost"></div>
    </div></div>`;
  const sb = $('#sb');
  try { const w = localStorage.getItem('split'); if (w) sb.style.setProperty('--left', w); } catch { }
  const localKey = `board:${S.me.id}:${boardKey}`;
  const local = (() => { try { return JSON.parse(localStorage.getItem(localKey) || 'null'); } catch { return null; } })();
  const data = local && (!saved.mine || local.at > saved.mine.at) ? local : saved.mine;
  const persist = debounce(async bd => {
    const d = bd.data();
    try { localStorage.setItem(localKey, JSON.stringify({ ...d, at: Date.now() })); } catch { }
    try { await api('PUT', '/api/boards/' + boardKey, d); $('#saved') && ($('#saved').textContent = 'Сохранено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })); }
    catch { $('#saved') && ($('#saved').textContent = 'Нет связи — сохранено на устройстве'); }
  }, 1200);
  const board = new Board($('#boardHost'), { data, onChange: bd => { $('#saved').textContent = 'Изменения…'; persist(bd); } });
  cleanup.push(() => board.destroy());
  // divider drag
  const div = $('#div');
  div.onpointerdown = e => {
    div.setPointerCapture(e.pointerId);
    div.onpointermove = ev => { const pct = Math.max(15, Math.min(70, ev.clientX / window.innerWidth * 100)); sb.style.setProperty('--left', pct + '%'); };
    div.onpointerup = () => { div.onpointermove = null; try { localStorage.setItem('split', sb.style.getPropertyValue('--left')); } catch { } };
  };
  $('#toggleTask')?.addEventListener('click', () => sb.classList.toggle('no-task'));
  $('#tabTask')?.addEventListener('click', () => { sb.classList.add('show-task'); $('#tabTask').classList.remove('ghost'); $('#tabBoard').classList.add('ghost'); });
  $('#tabBoard')?.addEventListener('click', () => { sb.classList.remove('show-task'); $('#tabBoard').classList.remove('ghost'); $('#tabTask').classList.add('ghost'); });
  $('#png').onclick = () => { const a = document.createElement('a'); a.href = board.toDataURL(); a.download = `решение-${b ? 'блок-' + b.n : 'доска'}.png`; a.click(); };
  $('#attach')?.addEventListener('click', () => {
    if (board.isEmpty()) return toast('Доска пустая');
    (S.attach[hwId] = S.attach[hwId] || []).push({ name: `Доска · ${b ? 'блок ' + b.n : 'решение'}`, dataUrl: board.toDataURL('image/jpeg'), kind: 'board' });
    toast('Решение прикреплено к заданию'); location.hash = '#/hw/' + hwId;
  });
}

async function boardsView() {
  const list = await api('GET', '/api/boards');
  main().innerHTML = `<div class="page-head"><div><span class="eyebrow">Мои решения</span><h1>Доска</h1></div>
    <a class="btn" href="#/solve/free">${I.pen} Свободная доска</a></div>
    <p class="muted" style="max-width:640px">Доска понимает графический планшет: толщина линии зависит от нажима пера, кнопка-ластик на пере стирает. Включите «только перо», чтобы ладонь и пальцы не рисовали. Всё сохраняется автоматически.</p>
    <div class="card">${list.length ? list.map(x => { const bl = S.blocks[x.key]; return `<a class="hw-row" href="#/solve/${x.key}"><div><div class="hw-title">${bl ? `Блок ${bl.n}. ${esc(bl.title)}` : 'Свободная доска'}</div><div class="hw-meta">${bl ? `Глава ${S.book.chapters[bl.ci].num} · ` : ''}изменено ${fmtDateTime(x.at)}</div></div><span class="btn ghost small">Открыть</span></a>`; }).join('') : '<div class="empty">Здесь появятся ваши решения на доске.</div>'}</div>`;
}

// ---------- homework ----------
async function hwList() {
  const list = await api('GET', '/api/homework');
  main().innerHTML = `<div class="page-head"><div><span class="eyebrow">${isT() ? 'Выдано классу' : 'Мои задания'}</span><h1>Домашние задания</h1></div>
    ${isT() ? `<a class="btn" href="#/hw/new">${I.plus} Новое задание</a>` : ''}</div>
    <div class="card">${list.length ? (isT() ? list.map(h => `<a class="hw-row" href="#/hw/${h.id}"><div><div class="hw-title">${esc(h.title)}</div>
      <div class="hw-meta">${h.items.map(i => `Блок ${i.n}`).join(', ')}${h.due ? ` · до ${fmtDate(new Date(h.due))}` : ''} · сдали ${h.submitted} из ${h.assignedCount}</div></div>
      ${h.toCheck ? `<span class="pill bad">проверить: ${h.toCheck}</span>` : `<span class="pill ${h.submitted === h.assignedCount && h.assignedCount ? 'ok' : ''}">${h.submitted}/${h.assignedCount}</span>`}</a>`).join('')
      : list.map(hwRow).join('')) : `<div class="empty">${isT() ? 'Заданий пока нет. Создайте первое!' : 'Учитель ещё не задал домашних заданий.'}</div>`}</div>`;
}

function blockOptions(sel) {
  return S.book.chapters.map(c => c.sections.map(s => `<optgroup label="Гл. ${c.num}${s.title ? ' · §' + s.num + ' ' + esc(s.title.slice(0, 50)) : ' · ' + esc(c.title)}">
    ${s.blocks.map(b => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>Блок ${b.n}. ${esc(b.title.slice(0, 70))} (${b.count})</option>`).join('')}</optgroup>`).join('')).join('');
}
async function hwNew(q) {
  const students = await api('GET', '/api/students');
  const first = q.get('block');
  const b0 = first && S.blocks[first];
  main().innerHTML = `<div class="crumbs"><a href="#/hw">Домашние задания</a> / Новое</div>
    <div class="page-head"><div><span class="eyebrow">Новое задание</span><h1>Задать на дом</h1></div></div>
    <form class="split" id="f">
      <div class="card">
        <label class="field"><span>Название</span><input type="text" name="title" required value="${b0 ? esc('Блок ' + b0.n + ': ' + b0.title.replace(/:$/, '')) : ''}" placeholder="Например: Квадратные уравнения"></label>
        <div class="eyebrow" style="margin:8px 0 10px">Задачи</div>
        <div id="items"></div>
        <button type="button" class="btn ghost small" id="addItem">${I.plus} Ещё блок</button>
        <label class="field" style="margin-top:18px"><span>Комментарий для учеников</span><textarea name="note" placeholder="Что важно, как оформить решение…"></textarea></label>
      </div>
      <div class="card">
        <label class="field"><span>Срок сдачи</span><input type="date" name="due" value="${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}"></label>
        <div class="eyebrow" style="margin:6px 0 10px">Кому</div>
        <label class="check" style="margin-bottom:10px"><input type="radio" name="who" value="all" checked> Всем ученикам (${students.length})</label><br>
        <label class="check" style="margin-bottom:10px"><input type="radio" name="who" value="some"> Выбрать учеников</label>
        <div class="student-picks" id="picks" hidden>${students.map(s => `<label><input type="checkbox" value="${s.id}"> ${esc(s.name)}</label>`).join('') || '<span class="muted">Нет учеников</span>'}</div>
        <div class="error" id="err" style="margin-top:12px"></div>
        <button class="btn" type="submit" style="width:100%;margin-top:6px">Выдать задание</button>
      </div></form>`;
  const addItem = (block, tasks = '') => {
    const row = document.createElement('div'); row.className = 'item-row';
    row.innerHTML = `<select aria-label="Блок" class="bsel" style="grid-column:span 2">${blockOptions(block)}</select>
      <input type="text" class="tasks" placeholder="1-10, 15" value="${esc(tasks)}" aria-label="Номера задач"><button type="button" class="btn ghost small" aria-label="Убрать">✕</button>`;
    row.querySelector('button').onclick = () => row.remove();
    const sel = row.querySelector('select'), inp = row.querySelector('.tasks');
    sel.onchange = () => { if (!inp.value) inp.placeholder = `1-${S.blocks[sel.value].count}`; };
    sel.onchange();
    $('#items').append(row);
  };
  addItem(first || S.allBlocks[0].id, b0 ? `1-${Math.min(10, b0.count)}` : '');
  $('#addItem').onclick = () => addItem(S.allBlocks[0].id);
  $$('input[name=who]').forEach(r => r.onchange = () => $('#picks').hidden = r.value !== 'some' || !r.checked);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const items = $$('.item-row').map(r => ({ block: r.querySelector('select').value, tasks: r.querySelector('.tasks').value || `1-${S.blocks[r.querySelector('select').value].count}` }));
    const assignees = f.get('who') === 'some' ? $$('#picks input:checked').map(i => i.value) : 'all';
    if (Array.isArray(assignees) && !assignees.length) return $('#err').textContent = 'Выберите хотя бы одного ученика';
    try { const h = await api('POST', '/api/homework', { title: f.get('title'), note: f.get('note'), due: f.get('due'), items, assignees }); toast('Задание выдано'); location.hash = '#/hw/' + h.id; }
    catch (err) { $('#err').textContent = err.message; }
  };
}

async function hwDetail(id) {
  const { hw, submissions } = await api('GET', '/api/homework/' + id);
  const items = `<div class="hw-items">${hw.items.map(it => `<a class="hw-item" href="#/block/${it.block}"><div><div class="t">Блок ${it.n}. ${esc(it.title)}</div>
    <div class="m">Глава ${S.book.chapters[S.blocks[it.block].ci].num} · задачи: ${compactTasks(it.tasks)}</div></div>
    ${isT() ? '' : `<span class="btn small" data-solve="${it.block}">${I.pen} Решать</span>`}</a>`).join('')}</div>`;
  const head = `<div class="crumbs"><a href="#/hw">Домашние задания</a> / ${esc(hw.title)}</div>
    <div class="page-head"><div><span class="eyebrow">${hw.due ? 'Сдать до ' + fmtDate(new Date(hw.due)) : 'Без срока'}</span><h1>${esc(hw.title)}</h1></div>
    ${isT() ? `<button class="btn danger small" id="del">Удалить задание</button>` : ''}</div>`;
  if (isT()) {
    const students = await api('GET', '/api/students');
    const assigned = hw.assignees === 'all' ? students : students.filter(s => hw.assignees.includes(s.id));
    main().innerHTML = head + `<div class="split"><div class="card"><div class="card-title"><h3>Работы учеников</h3><span class="muted">${hw.submitted} из ${hw.assignedCount}</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Ученик</th><th>Статус</th><th>Сдано</th><th>Оценка</th><th></th></tr></thead><tbody>
      ${assigned.map(st => { const s = submissions.find(x => x.uid === st.id);
        return `<tr><td>${esc(st.name)}</td><td>${!s ? '<span class="pill">не сдано</span>' : s.status === 'submitted' ? '<span class="pill bad">ждёт проверки</span>' : s.status === 'returned' ? '<span class="pill warn">на доработке</span>' : '<span class="pill ok">проверено</span>'}</td>
        <td>${s ? fmtDateTime(s.at) : '—'}</td><td class="grade" style="font-size:24px">${s?.grade ?? ''}</td><td>${s ? `<a class="btn small ${s.status === 'submitted' ? '' : 'ghost'}" href="#/review/${s.id}">${s.status === 'submitted' ? 'Проверить' : 'Открыть'}</a>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Нет учеников</td></tr>'}
      </tbody></table></div></div>
      <div class="grid"><div class="card"><h3>Задачи</h3>${items}</div>${hw.note ? `<div class="card"><h3>Комментарий</h3><p style="white-space:pre-wrap;margin:0">${esc(hw.note)}</p></div>` : ''}</div></div>`;
    $('#del').onclick = async () => { if (!confirm('Удалить задание и все сданные работы?')) return; await api('DELETE', '/api/homework/' + id); toast('Удалено'); location.hash = '#/hw'; };
    return;
  }
  const last = submissions[0];
  const canSubmit = !last || last.status === 'returned';
  main().innerHTML = head + `<div class="split">
    <div class="grid">
      <div class="card"><h3 style="margin-bottom:14px">Задачи</h3>${items}${hw.note ? `<div class="review-box" style="margin-top:18px"><div class="eyebrow">Учитель пишет</div><p style="white-space:pre-wrap;margin:6px 0 0;font:italic 18px/1.4 var(--serif)">${esc(hw.note)}</p></div>` : ''}</div>
      ${submissions.map(subCard).join('')}
    </div>
    <div class="card" id="sendCard">${canSubmit ? `<h3>${last ? 'Сдать исправленную работу' : 'Сдать работу'}</h3>
      <p class="muted" style="margin-top:4px;font-size:14px">Сфотографируйте решение в тетради или прикрепите решение с доски.</p>
      <div class="dropzone" id="dz" tabindex="0" role="button"><b>Загрузить фото или PDF</b><span class="muted">перетащите файлы сюда или нажмите</span></div>
      <input type="file" id="file" accept="image/*,application/pdf" multiple hidden>
      <div class="thumbs" id="thumbs"></div>
      <label class="field" style="margin-top:16px"><span>Комментарий</span><textarea id="text" placeholder="Ответы, вопросы учителю…"></textarea></label>
      <div class="error" id="err"></div>
      <button class="btn" id="send" style="width:100%">${I.upload} Отправить на проверку</button>`
      : `<h3>Работа ${last.status === 'checked' ? 'проверена' : 'отправлена'}</h3><p class="muted">${last.status === 'checked' ? 'Оценка и комментарий — слева.' : 'Учитель проверит её и поставит оценку.'}</p>`}</div>
  </div>`;
  $$('[data-solve]').forEach(x => x.onclick = e => { e.preventDefault(); location.hash = `#/solve/${x.dataset.solve}?hw=${id}`; });
  if (!canSubmit) return;
  const files = S.attach[id] = S.attach[id] || [];
  const drawThumbs = () => {
    $('#thumbs').innerHTML = files.map((f, i) => `<div class="thumb ${f.dataUrl.startsWith('data:application/pdf') ? 'pdf' : ''}">${f.dataUrl.startsWith('data:application/pdf') ? 'PDF' : `<img src="${f.dataUrl}" alt="">`}
      <button class="x" data-i="${i}" aria-label="Убрать">✕</button><div class="cap">${esc(f.name)}</div></div>`).join('');
    $$('#thumbs .x').forEach(x => x.onclick = () => { files.splice(+x.dataset.i, 1); drawThumbs(); });
  };
  drawThumbs();
  const addFiles = async list => {
    for (const f of list) {
      try { files.push({ name: f.name, dataUrl: await prepareFile(f), kind: 'upload' }); } catch (e) { toast(e.message); }
    }
    drawThumbs();
  };
  const dz = $('#dz');
  dz.onclick = () => $('#file').click(); dz.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && $('#file').click();
  $('#file').onchange = e => addFiles([...e.target.files]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
  $('#send').onclick = async () => {
    const btn = $('#send'); btn.disabled = true; btn.textContent = 'Отправка…';
    try {
      await api('POST', '/api/submissions', { hwId: id, text: $('#text').value, files });
      delete S.attach[id]; await refreshMe(); celebrate(S.stats); toast('Работа отправлена учителю'); render();
    } catch (e) { $('#err').textContent = e.message; btn.disabled = false; btn.innerHTML = `${I.upload} Отправить на проверку`; }
  };
}
function compactTasks(t) {
  const out = []; let i = 0;
  while (i < t.length) { let j = i; while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++; out.push(j > i ? `${t[i]}–${t[j]}` : `${t[i]}`); i = j + 1; }
  return out.join(', ');
}
function subCard(s) {
  const ann = Object.fromEntries((s.annotations || []).map(a => [a.of, a.file]));
  return `<div class="card"><div class="card-title"><h3>Работа от ${fmtDateTime(s.at)}</h3>
    ${s.status === 'checked' ? `<span class="grade">${s.grade ?? '✓'}</span>` : s.status === 'returned' ? '<span class="pill bad">на доработку</span>' : '<span class="pill">на проверке</span>'}</div>
    ${s.comment ? `<div class="review-box" style="margin-bottom:14px"><div class="eyebrow">Комментарий учителя</div><p style="white-space:pre-wrap;margin:6px 0 0;font:italic 18px/1.4 var(--serif)">${esc(s.comment)}</p></div>` : ''}
    ${s.text ? `<p style="white-space:pre-wrap">${esc(s.text)}</p>` : ''}
    <div class="gallery">${s.files.map(f => fileFigure(f, ann[f.file])).join('')}</div></div>`;
}
function fileFigure(f, annotated, actions = '') {
  const isPdf = f.file.endsWith('.pdf');
  return `<figure>${isPdf ? `<div style="padding:30px;text-align:center"><a class="btn ghost" data-file="${esc(f.file)}" target="_blank" rel="noopener">Открыть PDF</a></div>` : `<a data-file="${esc(annotated || f.file)}" target="_blank" rel="noopener"><img data-file="${esc(annotated || f.file)}" alt="${esc(f.name)}"></a>`}
    <figcaption><span>${esc(f.name)}${annotated ? ' · <b>с пометками учителя</b>' : ''}</span>${actions}</figcaption></figure>`;
}
async function prepareFile(f) {
  if (f.type === 'application/pdf') {
    if (f.size > 15e6) throw new Error('PDF больше 15 МБ');
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  }
  if (!f.type.startsWith('image/')) throw new Error('Можно загружать фото и PDF');
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) throw new Error('Не удалось открыть фото ' + f.name);
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

// ---------- review (teacher) ----------
async function reviewView(sid) {
  const s = await api('GET', '/api/submissions/' + sid);
  const pendingAnn = {};
  let grade = s.grade;
  const draw = () => {
    const ann = Object.fromEntries((s.annotations || []).map(a => [a.of, a.file]));
    main().innerHTML = `<div class="crumbs"><a href="#/hw">Домашние задания</a> / <a href="#/hw/${s.hwId}">${esc(s.hw?.title || '')}</a> / ${esc(s.name)}</div>
      <div class="page-head"><div><span class="eyebrow">Проверка работы · ${fmtDateTime(s.at)}</span><h1>${esc(s.name)}</h1></div></div>
      <div class="split"><div class="card">
        ${s.text ? `<div class="review-box" style="margin-bottom:16px"><div class="eyebrow">Комментарий ученика</div><p style="white-space:pre-wrap;margin:6px 0 0">${esc(s.text)}</p></div>` : ''}
        <div class="gallery">${s.files.map((f, i) => pendingAnn[f.file]
          ? `<figure><img src="${pendingAnn[f.file]}" alt=""><figcaption><span>${esc(f.name)} · <b>пометки (не сохранены)</b></span><button class="btn small" data-ann="${i}">${I.pen} Править</button></figcaption></figure>`
          : fileFigure(f, ann[f.file], f.file.endsWith('.pdf') ? '' : `<button class="btn small" data-ann="${i}">${I.pen} Проверить пером</button>`)).join('')}</div></div>
      <div class="card" style="position:sticky;top:90px">
        <h3>Оценка</h3>
        <div class="grade-btns" style="margin:12px 0 18px">${[1, 2, 3, 4, 5].map(g => `<button data-g="${g}" class="${grade === g ? 'on' : ''}">${g}</button>`).join('')}</div>
        <label class="field"><span>Комментарий ученику</span><textarea id="cm">${esc(s.comment || '')}</textarea></label>
        <div style="display:grid;gap:8px"><button class="btn" id="ok">${I.check} Зачесть работу</button><button class="btn ghost" id="ret">Вернуть на доработку</button></div>
        <div class="muted" style="font-size:12px;margin-top:12px">Нажмите «Проверить пером», чтобы писать прямо поверх фото работы — подчеркнуть ошибку, написать подсказку.</div>
      </div></div>`;
    $$('[data-g]').forEach(b => b.onclick = () => { grade = +b.dataset.g; $$('[data-g]').forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-ann]').forEach(b => b.onclick = () => annotate(s.files[+b.dataset.ann]));
    $('#ok').onclick = () => submit('checked');
    $('#ret').onclick = () => submit('returned');
  };
  const annotate = f => {
    const ann = (s.annotations || []).find(a => a.of === f.file);
    const close = modal(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0;flex:1">Пометки поверх работы</h3>
      <button class="btn ghost small" data-close>Отмена</button><button class="btn small" id="annSave">${I.check} Готово</button></div><div id="ab" style="height:78vh"></div>`, bg => {
      const m = bg.querySelector('.modal'); m.style.maxWidth = '1200px'; m.style.padding = '16px';
      const bd = new Board(bg.querySelector('#ab'), { color: '#b3261e' });
      bd.color = '#b3261e'; bg.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x.dataset.color === '#b3261e'));
      (pendingAnn[f.file] ? Promise.resolve(pendingAnn[f.file]) : fileUrl(ann?.file || f.file)).then(u => u && bd.setImage(u));
      bg.querySelector('#annSave').onclick = () => { if (!bd.isEmpty()) pendingAnn[f.file] = bd.toDataURL('image/jpeg'); bd.destroy(); close(); draw(); };
    });
    cleanup.push(close);
  };
  const submit = async status => {
    if (status === 'checked' && !grade) return toast('Поставьте оценку');
    try {
      await api('POST', `/api/submissions/${sid}/review`, { grade, comment: $('#cm').value, status, annotations: Object.entries(pendingAnn).map(([of, dataUrl]) => ({ of, dataUrl })) });
      await refreshMe(); toast(status === 'checked' ? 'Работа проверена' : 'Работа возвращена на доработку'); location.hash = '#/hw/' + s.hwId;
    } catch (e) { toast(e.message); }
  };
  draw();
}

// ---------- students (teacher) ----------
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i' };
const translit = s => s.toLowerCase().split('').map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint32Array(8)); return [...r].map(x => a[x % a.length]).join(''); };
function showCreds(name, login, password) {
  modal(`<h3>Данные для входа</h3><p>Передайте ученику <b>${esc(name)}</b>:</p>
    <div class="creds">Сайт: ${esc(location.origin + location.pathname)}<br>Логин: ${esc(login)}<br>Пароль: ${esc(password)}</div>
    <p class="muted" style="font-size:13px">Пароль больше нигде не показывается — сохраните его сейчас.</p>
    <div class="actions"><button class="btn ghost" id="copy">Копировать</button><button class="btn" data-close>Готово</button></div>`, bg => {
    bg.querySelector('#copy').onclick = () => navigator.clipboard.writeText(`Сайт: ${location.origin + location.pathname}\nЛогин: ${login}\nПароль: ${password}`).then(() => toast('Скопировано'));
  });
}
async function studentsView() {
  const list = await api('GET', '/api/students');
  main().innerHTML = `<div class="page-head"><div><span class="eyebrow">Класс</span><h1>Ученики</h1></div></div>
    <div class="split"><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Ученик</th><th>Уровень</th><th>XP</th><th>Решено</th><th>Серия</th><th>Ср. оценка</th><th>Был(а)</th><th></th></tr></thead><tbody>
      ${list.length ? list.sort((a, b) => b.xp - a.xp).map(s => `<tr><td><a href="#/student/${s.id}" style="font:500 18px var(--serif)">${esc(s.name)}</a><div class="muted" style="font-size:12px">${esc(s.login)}</div></td>
        <td>${esc(s.levelName)}</td><td>${s.xp}</td><td>${s.solved}</td><td>${s.streak}</td><td>${s.avgGrade ?? '—'}</td><td>${s.lastDay ? fmtDate(new Date(s.lastDay)) : '—'}</td>
        <td style="white-space:nowrap"><button class="btn ghost small" data-pw="${s.id}">Пароль</button> <button class="btn danger small" data-del="${s.id}" aria-label="Удалить">✕</button></td></tr>`).join('')
        : '<tr><td colspan="8"><div class="empty">Добавьте первого ученика</div></td></tr>'}</tbody></table></div></div>
    <form class="card" id="add"><h3>Новый ученик</h3>
      <label class="field" style="margin-top:12px"><span>Имя и фамилия</span><input type="text" name="name" required></label>
      <label class="field"><span>Логин</span><input type="text" name="login" required pattern="[a-z0-9._\\-]{3,40}" autocapitalize="none"></label>
      <label class="field"><span>Пароль</span><input type="text" name="password" required minlength="6"></label>
      <div class="error" id="err"></div><button class="btn" style="width:100%">${I.plus} Добавить ученика</button></form></div>`;
  const f = $('#add');
  f.password.value = genPass();
  f.name.oninput = () => { if (!f.login.dataset.touched) f.login.value = translit(f.name.value); };
  f.login.oninput = () => f.login.dataset.touched = 1;
  f.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f));
    try { await api('POST', '/api/students', d); showCreds(d.name, d.login, d.password); studentsView(); }
    catch (err) { $('#err').textContent = err.message; }
  };
  $$('[data-pw]').forEach(b => b.onclick = async () => {
    const s = list.find(x => x.id === b.dataset.pw); const pw = genPass();
    if (!confirm(`Сбросить пароль ученику ${s.name}?`)) return;
    await api('POST', `/api/students/${s.id}/password`, { password: pw }); showCreds(s.name, s.login, pw);
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const s = list.find(x => x.id === b.dataset.del);
    if (!confirm(`Удалить ученика ${s.name}? Его прогресс и сданные работы тоже удалятся.`)) return;
    await api('DELETE', '/api/students/' + s.id); toast('Удалён'); studentsView();
  });
}

// ---------- awards / profile ----------
const LEVELS = [[0, 'Фалес', 'VI в. до н. э.'], [150, 'Пифагор', 'VI в. до н. э.'], [400, 'Евклид', 'III в. до н. э.'], [800, 'Архимед', 'III в. до н. э.'], [1400, 'Аль-Хорезми', 'IX в.'], [2200, 'Декарт', 'XVII в.'], [3200, 'Ферма', 'XVII в.'], [4500, 'Ньютон', 'XVII в.'], [6000, 'Эйлер', 'XVIII в.'], [8000, 'Гаусс', 'XIX в.'], [10500, 'Лобачевский', 'XIX в.'], [13500, 'Риман', 'XIX в.'], [17000, 'Колмогоров', 'XX в.']];
async function awardsView(uid) {
  const p = await api('GET', '/api/profile/' + uid);
  const st = p.stats; const mine = uid === 'me';
  if (mine) celebrate(st);
  const days = []; const d = new Date(); d.setDate(d.getDate() - 7 * 17 - d.getDay());
  for (let i = 0; i < 7 * 18; i++) { const k = d.toISOString().slice(0, 10); const n = p.days[k] || 0; days.push(`<i class="${n >= 10 ? 'l3' : n >= 4 ? 'l2' : n ? 'l1' : ''}" title="${k}: ${n}"></i>`); d.setDate(d.getDate() + 1); }
  main().innerHTML = `${mine ? '' : `<div class="crumbs"><a href="#/students">Ученики</a> / ${esc(p.user.name)}</div>`}
    <div class="page-head"><div><span class="eyebrow">${mine ? 'Мои достижения' : 'Профиль ученика'}</span><h1>${mine ? 'Награды' : esc(p.user.name)}</h1></div></div>
    <div class="hello"><div class="card dark level-card">${medal(st.level)}<div><div class="eyebrow">Уровень ${roman(st.level)}</div><div class="level-name">${esc(st.levelName)}</div>
      <div class="xp-row"><span>${st.xp} XP</span><span>${st.levelTo ? 'до «' + esc(st.nextName) + '» — ' + (st.levelTo - st.xp) + ' XP' : ''}</span></div>
      <div class="progress gold"><i style="width:${st.levelTo ? (st.xp - st.levelFrom) / (st.levelTo - st.levelFrom) * 100 : 100}%"></i></div>
      <div class="muted" style="font-size:12px;margin-top:12px">XP: 10 за задачу · 15×оценка за проверенную работу · 20 за сдачу в срок · 50 за закрытый блок · 2 за решение на доске</div></div></div>
      <div class="grid g2"><div class="card stat"><b>${st.solved}</b><span>задач</span></div><div class="card stat"><b>${st.fullBlocks}</b><span>блоков закрыто</span></div>
        <div class="card stat"><b>${st.bestStreak}</b><span>лучшая серия, дней</span></div><div class="card stat"><b>${st.fives}</b><span>пятёрок</span></div></div></div>
    <h2 style="margin:34px 0 16px">Награды <span class="muted" style="font-size:20px">${st.badges.filter(b => b.got).length} из ${st.badges.length}</span></h2>
    <div class="badges">${st.badges.map(b => `<div class="badge-card ${b.got ? '' : 'locked'}">${badgeIcon(b.key, b.got)}<div class="bt">${esc(b.title)}</div><div class="bd">${esc(b.desc)}</div></div>`).join('')}</div>
    <div class="split" style="margin-top:34px">
      <div class="grid"><div class="card"><h3 style="margin-bottom:14px">Прогресс по главам</h3>
        ${S.book.chapters.map((c, i) => { const [a, t] = st.chapters[i]; return `<div style="display:grid;grid-template-columns:44px 1fr 70px;gap:12px;align-items:center;margin:10px 0"><span class="roman">${c.num}</span><div><div style="font-size:13px;margin-bottom:5px">${esc(c.title)}</div><div class="progress"><i style="width:${t ? a / t * 100 : 0}%"></i></div></div><span class="muted" style="text-align:right;font-size:12px">${a}/${t}</span></div>`; }).join('')}</div>
        <div class="card"><h3 style="margin-bottom:14px">Активность</h3><div class="heat" style="grid-template-rows:repeat(7,14px);grid-auto-flow:column;grid-template-columns:none">${days.join('')}</div></div></div>
      <div class="card"><h3 style="margin-bottom:8px">Путь математика</h3><p class="muted" style="margin-top:0;font-size:14px">Каждый уровень назван в честь великого математика.</p>
        <div class="ladder">${LEVELS.map(([xp, n, era], i) => `<div class="ladder-row ${i + 1 === st.level ? 'cur' : ''}"><span class="r">${roman(i + 1)}</span><span><span class="nm">${n}</span> <span class="muted" style="font-size:12px">${era}</span></span><span class="muted" style="font-size:12px">${xp} XP${i + 1 <= st.level ? ' ✓' : ''}</span></div>`).join('')}</div></div>
    </div>`;
}

// ---------- settings ----------
function settingsView() {
  main().innerHTML = `<div class="page-head"><div><span class="eyebrow">${isT() ? 'Учитель' : 'Ученик'} · ${esc(S.me.login)}</span><h1>${isT() ? 'Настройки' : 'Профиль'}</h1></div></div>
    <div class="grid g2">
      ${isT() ? `<div class="card"><h3>Ответы в учебнике</h3><p class="muted" style="font-size:14px">Когда ученики видят ответы к блокам.</p>
        ${[['after', 'После решения', 'когда ученик отметил все задачи блока или сдал ДЗ с ним'], ['always', 'Всегда', 'ответы открыты сразу'], ['never', 'Никогда', 'ответы видит только учитель']].map(([v, t, d]) => `<label class="check" style="display:flex;margin:12px 0;align-items:flex-start"><input type="radio" name="ans" value="${v}" ${S.settings.answers === v ? 'checked' : ''}><span><b>${t}</b><br><span class="muted" style="font-size:13px">${d}</span></span></label>`).join('')}</div>` : ''}
      ${isT() ? `<form class="card" id="nm"><h3>Ваше имя</h3><p class="muted" style="font-size:14px">Так вас видят ученики.</p>
        <label class="field"><span>Имя и отчество</span><input type="text" name="name" required value="${esc(S.me.name)}"></label>
        <button class="btn">Сохранить</button></form>` : ''}
      <form class="card" id="pw"><h3>Сменить пароль</h3>
        <label class="field" style="margin-top:12px"><span>Текущий пароль</span><input type="password" name="old" required autocomplete="current-password"></label>
        <label class="field"><span>Новый пароль</span><input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <div class="error" id="err"></div><button class="btn">Сохранить</button></form>
    </div>`;
  $$('input[name=ans]').forEach(r => r.onchange = async () => { S.settings = await api('POST', '/api/settings', { answers: r.value }); toast('Сохранено'); });
  $('#nm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { S.me = (await api('POST', '/api/profile', { name: e.target.name.value })).me; toast('Имя сохранено'); render(); }
    catch (err) { toast(err.message); }
  });
  $('#pw').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/api/password', Object.fromEntries(new FormData(e.target))); e.target.reset(); toast('Пароль изменён'); }
    catch (err) { $('#err').textContent = err.message; }
  };
}

boot().catch(e => { app.innerHTML = `<div class="empty">Не удалось загрузить сайт: ${esc(e.message)}</div>`; });
