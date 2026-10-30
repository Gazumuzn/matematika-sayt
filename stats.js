// Опыт, уровни и награды. Формула опыта совпадает с функцией leaderboard() в базе.
export const LEVELS = [
  [0, 'Фалес'], [150, 'Пифагор'], [400, 'Евклид'], [800, 'Архимед'], [1400, 'Аль-Хорезми'],
  [2200, 'Декарт'], [3200, 'Ферма'], [4500, 'Ньютон'], [6000, 'Эйлер'], [8000, 'Гаусс'],
  [10500, 'Лобачевский'], [13500, 'Риман'], [17000, 'Колмогоров'],
];

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => localDay();

function streak(days) {
  let n = 0; const d = new Date();
  if (!days[localDay(d)]) d.setDate(d.getDate() - 1);
  while (days[localDay(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function bestStreak(days) {
  let best = 0, run = 0, prev = null;
  for (const d of Object.keys(days).sort()) {
    run = prev && (new Date(d) - new Date(prev)) === 864e5 ? run + 1 : 1; best = Math.max(best, run); prev = d;
  }
  return best;
}
// срок сдачи — конец дня по времени Казахстана (UTC+5), как в базе
const dueEnd = due => new Date(due + 'T23:59:59.999+05:00').getTime();

export function computeStats(raw, book) {
  const solvedMap = raw.progress || {}, days = raw.days || {}, subs = raw.subs || [];
  const blocks = {}; book.chapters.forEach((c, ci) => c.sections.forEach(s => s.blocks.forEach(b => { blocks[b.id] = { count: b.count || 20, chapter: ci }; })));
  const solved = Object.values(solvedMap).reduce((a, l) => a + l.length, 0);
  const checked = subs.filter(s => s.status === 'checked');
  const fives = checked.filter(s => s.grade === 5).length;
  const onTime = subs.filter(s => s.due && new Date(s.at).getTime() < dueEnd(s.due)).length;
  let fullBlocks = 0; const chapters = book.chapters.map(() => [0, 0]);
  for (const [id, b] of Object.entries(blocks)) {
    const n = (solvedMap[id] || []).length;
    if (n >= b.count) fullBlocks++;
    chapters[b.chapter][0] += Math.min(n, b.count); chapters[b.chapter][1] += b.count;
  }
  const geo = Object.entries(solvedMap).filter(([k]) => blocks[k] && blocks[k].chapter >= 7 && blocks[k].chapter <= 9).reduce((a, [, l]) => a + l.length, 0);
  const boards = raw.boards || 0;
  const best = bestStreak(days);
  const xp = solved * 10 + checked.reduce((a, s) => a + (s.grade || 0), 0) * 15 + onTime * 20 + boards * 2 + fullBlocks * 50;
  let li = 0; LEVELS.forEach(([t], i) => { if (xp >= t) li = i; });
  const next = LEVELS[li + 1];
  const chaptersDone = chapters.filter(([a, b]) => b && a / b >= 0.8).length;
  const badges = [
    ['first', 'Первый шаг', 'Решить первую задачу', solved >= 1],
    ['ten', 'Десятка', 'Решить 10 задач', solved >= 10],
    ['hundred', 'Сотня', 'Решить 100 задач', solved >= 100],
    ['five-hundred', 'Пятьсот', 'Решить 500 задач', solved >= 500],
    ['thousand', 'Тысяча', 'Решить 1000 задач', solved >= 1000],
    ['block', 'Блок закрыт', 'Решить все задачи одного блока', fullBlocks >= 1],
    ['blocks10', 'Десять блоков', 'Закрыть 10 блоков', fullBlocks >= 10],
    ['chapter', 'Глава покорена', 'Решить 80% задач главы', chaptersDone >= 1],
    ['geometer', 'Геометр', '50 задач по геометрии', geo >= 50],
    ['submit', 'Первая сдача', 'Сдать первое домашнее задание', subs.length >= 1],
    ['punctual', 'Пунктуальность', '5 домашних заданий в срок', onTime >= 5],
    ['excellent', 'Отличник', 'Получить пять пятёрок', fives >= 5],
    ['streak3', 'Три дня подряд', 'Заниматься 3 дня подряд', best >= 3],
    ['streak7', 'Неделя', 'Заниматься 7 дней подряд', best >= 7],
    ['streak30', 'Месяц', 'Заниматься 30 дней подряд', best >= 30],
    ['artist', 'Каллиграф', 'Сохранить 10 решений на доске', boards >= 10],
  ].map(([key, title, desc, got]) => ({ key, title, desc, got }));
  return {
    xp, level: li + 1, levelName: LEVELS[li][1], levelFrom: LEVELS[li][0], levelTo: next ? next[0] : null,
    nextName: next ? next[1] : null, solved, fullBlocks, streak: streak(days), bestStreak: best,
    fives, onTime, submissions: subs.length, badges, chapters,
    avgGrade: checked.length ? +(checked.reduce((a, s) => a + s.grade, 0) / checked.length).toFixed(2) : null,
  };
}
export function levelOf(xp) {
  let li = 0; LEVELS.forEach(([t], i) => { if (xp >= t) li = i; });
  return { level: li + 1, levelName: LEVELS[li][1] };
}
