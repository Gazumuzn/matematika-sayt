// Доска для решения задач: перо с нажимом (графический планшет), маркер, ластик, линия, окружность,
// отмена/повтор, фон-клетка, бесконечная прокрутка вниз, фон-картинка (для проверки работ).
// Координаты штрихов — логические (ширина листа W = 1400), поэтому решение выглядит одинаково на любом экране.

const W = 1400;
const PAGE = 1000;
const COLORS = ['#141414', '#1f3b8f', '#b3261e', '#b8862b', '#2f6b4f'];

export class Board {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.strokes = [];
    this.redoStack = [];
    this.tool = 'pen';
    this.color = opts.color || COLORS[0];
    this.size = 3;
    this.bg = opts.bg || 'grid';
    this.height = opts.height || PAGE * 2;
    this.readOnly = !!opts.readOnly;
    this.penOnly = false;
    this.bgImage = null;
    this.current = null;
    this.pointers = new Map();
    this.onChange = opts.onChange || (() => {});
    this.build();
    if (opts.data) this.load(opts.data);
    if (opts.image) this.setImage(opts.image);
    this.resize();
  }

  build() {
    this.host.classList.add('board');
    this.host.innerHTML = `
      ${this.readOnly ? '' : `<div class="board-tools" role="toolbar" aria-label="Инструменты доски">
        <div class="tool-group">
          <button data-tool="pen" title="Перо (P)" class="on">${ICON.pen}</button>
          <button data-tool="marker" title="Маркер (M)">${ICON.marker}</button>
          <button data-tool="line" title="Линия (L)">${ICON.line}</button>
          <button data-tool="circle" title="Окружность (O)">${ICON.circle}</button>
          <button data-tool="eraser" title="Ластик (E)">${ICON.eraser}</button>
        </div>
        <div class="tool-group colors">${COLORS.map((c, i) => `<button data-color="${c}" class="swatch${i ? '' : ' on'}" style="--c:${c}" title="Цвет"></button>`).join('')}</div>
        <div class="tool-group sizes">${[2, 3, 6].map(s => `<button data-size="${s}" class="${s === 3 ? 'on' : ''}" title="Толщина"><i style="--s:${s * 1.6}px"></i></button>`).join('')}</div>
        <div class="tool-group">
          <button data-act="undo" title="Отменить (Ctrl+Z)">${ICON.undo}</button>
          <button data-act="redo" title="Повторить (Ctrl+Y)">${ICON.redo}</button>
          <button data-act="bg" title="Фон: клетка / линейка / чистый">${ICON.grid}</button>
          <button data-act="penonly" title="Только перо: пальцы и ладонь прокручивают, не рисуют">${ICON.hand}</button>
          <button data-act="more" title="Добавить место снизу">${ICON.plus}</button>
          <button data-act="clear" title="Очистить доску">${ICON.trash}</button>
        </div>
        <div class="tool-status" aria-live="polite"></div>
      </div>`}
      <div class="board-scroll"><div class="board-sheet"><canvas class="ink"></canvas><canvas class="live"></canvas></div></div>`;
    this.scroll = this.host.querySelector('.board-scroll');
    this.sheet = this.host.querySelector('.board-sheet');
    this.ink = this.host.querySelector('canvas.ink');
    this.live = this.host.querySelector('canvas.live');
    this.status = this.host.querySelector('.tool-status');

    if (!this.readOnly) {
      this.host.querySelector('.board-tools').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tool) this.setTool(b.dataset.tool);
        if (b.dataset.color) { this.color = b.dataset.color; this.mark('[data-color]', b); if (this.tool === 'eraser') this.setTool('pen'); }
        if (b.dataset.size) { this.size = +b.dataset.size; this.mark('[data-size]', b); }
        const a = b.dataset.act;
        if (a === 'undo') this.undo();
        if (a === 'redo') this.redo();
        if (a === 'bg') { this.bg = { grid: 'lines', lines: 'plain', plain: 'grid' }[this.bg]; this.redraw(); this.changed(); this.say({ grid: 'Фон: клетка', lines: 'Фон: линейка', plain: 'Фон: чистый' }[this.bg]); }
        if (a === 'penonly') { this.penOnly = !this.penOnly; b.classList.toggle('on', this.penOnly); this.say(this.penOnly ? 'Рисует только перо' : 'Рисуют перо, мышь и палец'); }
        if (a === 'more') { this.height += PAGE; this.resize(); this.changed(); this.scroll.scrollTo({ top: this.scroll.scrollHeight, behavior: 'smooth' }); }
        if (a === 'clear' && this.strokes.length && confirm('Очистить всю доску?')) { this.push({ clear: true, prev: this.strokes }); this.strokes = []; this.redraw(); this.changed(); }
      });
      const s = this.live;
      s.addEventListener('pointerdown', e => this.down(e));
      s.addEventListener('pointermove', e => this.move(e));
      s.addEventListener('pointerup', e => this.up(e));
      s.addEventListener('pointercancel', e => this.up(e, true));
      s.addEventListener('contextmenu', e => e.preventDefault());
      this.keyHandler = e => {
        if (!this.host.isConnected) return document.removeEventListener('keydown', this.keyHandler);
        if (e.target.closest('input,textarea,select')) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
        else if ((e.ctrlKey || e.metaKey) && (k === 'y')) { e.preventDefault(); this.redo(); }
        else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          const t = { p: 'pen', m: 'marker', l: 'line', o: 'circle', e: 'eraser', з: 'pen', у: 'eraser' }[k];
          if (t) this.setTool(t);
        }
      };
      document.addEventListener('keydown', this.keyHandler);
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.scroll);
  }

  mark(sel, btn) { this.host.querySelectorAll(sel).forEach(x => x.classList.toggle('on', x === btn)); }
  setTool(t) { this.tool = t; this.mark('[data-tool]', this.host.querySelector(`[data-tool="${t}"]`)); this.live.dataset.tool = t; }
  say(t) { if (!this.status) return; this.status.textContent = t; clearTimeout(this.sayT); this.sayT = setTimeout(() => this.status.textContent = '', 1800); }

  get scale() { return this.cssW / W; }

  resize() {
    const cs = getComputedStyle(this.scroll);
    const w = Math.max(200, Math.floor(this.scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));    const imgH = this.bgImage ? this.bgImage.height * (W / this.bgImage.width) + 40 : 0;
    this.height = Math.max(this.height, imgH);
    this.cssW = w;
    const h = Math.round(this.height * this.scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [this.ink, this.live]) {
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    this.sheet.style.height = h + 'px';
    this.dpr = dpr;
    this.redraw();
  }

  ctx(c) { const x = c.getContext('2d'); x.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0); return x; }

  drawBackground(x, h, forExport) {
    x.fillStyle = '#fffdf8'; x.fillRect(0, 0, W, h);
    if (this.bgImage) {
      const ih = this.bgImage.height * (W / this.bgImage.width);
      x.drawImage(this.bgImage, 0, 0, W, ih);
    }
    if (this.bg === 'plain' || this.bgImage) return;
    x.save();
    x.strokeStyle = forExport ? 'rgba(60,90,140,.13)' : 'rgba(60,90,140,.16)';
    x.lineWidth = 1;
    const step = this.bg === 'grid' ? 40 : 56;
    x.beginPath();
    for (let y = step; y < h; y += step) { x.moveTo(0, y); x.lineTo(W, y); }
    if (this.bg === 'grid') for (let xx = step; xx < W; xx += step) { x.moveTo(xx, 0); x.lineTo(xx, h); }
    x.stroke();
    if (this.bg === 'lines') { x.strokeStyle = 'rgba(179,38,30,.25)'; x.beginPath(); x.moveTo(110, 0); x.lineTo(110, h); x.stroke(); }
    x.restore();
  }

  redraw() {
    if (!this.cssW) return;
    const x = this.ctx(this.ink);
    this.drawBackground(x, this.height);
    for (const s of this.strokes) drawStroke(x, s);
    this.ctx(this.live).clearRect(0, 0, W, this.height);
  }

  point(e) {
    const r = this.live.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    return [+((e.clientX - r.left) / this.scale).toFixed(1), +((e.clientY - r.top) / this.scale).toFixed(1), +p.toFixed(2)];
  }

  down(e) {
    if (e.pointerType === 'pen') this.sawPen = true;
    const touchScroll = e.pointerType === 'touch' && (this.penOnly || this.sawPen);
    const capture = () => { try { this.live.setPointerCapture(e.pointerId); } catch { } };
    if (touchScroll) { this.pan = { id: e.pointerId, y: e.clientY, top: this.scroll.scrollTop }; capture(); return; }
    // кнопка-ластик на пере (button 5 / buttons & 32) и правая кнопка стирают
    this.eraseMode = e.button === 2 || e.button === 5 || !!(e.buttons & 32);
    e.preventDefault();
    capture();
    const tool = this.eraseMode ? 'eraser' : this.tool;
    const p = this.point(e);
    if (tool === 'eraser') { this.current = { eraser: true, removed: [] }; this.eraseAt(p); return; }
    this.current = { t: tool, c: this.color, w: tool === 'marker' ? this.size * 6 : this.size, pts: [p] };
  }

  move(e) {
    if (this.pan && e.pointerId === this.pan.id) { this.scroll.scrollTop = this.pan.top - (e.clientY - this.pan.y); return; }
    if (!this.current) return;
    e.preventDefault();
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const evs = co.length ? co : [e];
    if (this.current.eraser) { for (const ev of evs) this.eraseAt(this.point(ev)); return; }
    const s = this.current;
    if (s.t === 'line' || s.t === 'circle') { s.pts[1] = this.point(e); }
    else for (const ev of evs) {
      const p = this.point(ev); const l = s.pts[s.pts.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.8) s.pts.push(p);
    }
    const x = this.ctx(this.live);
    x.clearRect(0, 0, W, this.height);
    drawStroke(x, s);
  }

  up(e, cancel) {
    if (this.pan && e.pointerId === this.pan.id) { this.pan = null; return; }
    const s = this.current; this.current = null;
    if (!s) return;
    this.ctx(this.live).clearRect(0, 0, W, this.height);
    if (s.eraser) {
      if (s.removed.length) { this.push({ erase: s.removed }); this.changed(); }
      return;
    }
    if (cancel && s.pts.length < 2) return;
    if (s.pts.length === 1) s.pts.push([s.pts[0][0] + 0.1, s.pts[0][1], s.pts[0][2]]);
    if ((s.t === 'line' || s.t === 'circle') && s.pts.length < 2) return;
    this.strokes.push(s);
    this.push({ add: s });
    drawStroke(this.ctx(this.ink), s);
    const bottom = Math.max(...s.pts.map(p => p[1]));
    if (bottom > this.height - 200) { this.height += PAGE; this.resize(); }
    this.changed();
  }

  eraseAt([x, y]) {
    const r = 14 / Math.max(this.scale, 0.4);
    let hit = false;
    this.strokes = this.strokes.filter(s => {
      if (!strokeHit(s, x, y, r)) return true;
      this.current.removed.push(s); hit = true; return false;
    });
    if (hit) this.redraw();
  }

  push(op) { (this.history = this.history || []).push(op); this.redoStack = []; }
  undo() {
    const op = (this.history || []).pop(); if (!op) return;
    if (op.add) this.strokes = this.strokes.filter(s => s !== op.add);
    if (op.erase) this.strokes.push(...op.erase);
    if (op.clear) this.strokes = op.prev;
    this.redoStack.push(op); this.redraw(); this.changed();
  }
  redo() {
    const op = this.redoStack.pop(); if (!op) return;
    if (op.add) this.strokes.push(op.add);
    if (op.erase) this.strokes = this.strokes.filter(s => !op.erase.includes(s));
    if (op.clear) this.strokes = [];
    (this.history = this.history || []).push(op); this.redraw(); this.changed();
  }

  changed() { this.onChange(this); }

  data() { return { strokes: this.strokes, height: this.height, bg: this.bg }; }
  load(d) {
    this.strokes = d.strokes || []; this.history = []; this.redoStack = [];
    if (d.height) this.height = Math.max(this.height, d.height);
    if (d.bg) this.bg = d.bg;
    this.resize();
  }
  isEmpty() { return !this.strokes.length; }

  setImage(src) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { this.bgImage = img; this.bg = 'plain'; this.resize(); res(); };
      img.onerror = () => res();
      img.src = src;
    });
  }

  // PNG: обрезаем пустой низ, ширина 1400 px
  toDataURL(type = 'image/png') {
    let bottom = this.bgImage ? this.bgImage.height * (W / this.bgImage.width) : 0;
    for (const s of this.strokes) for (const p of s.pts) bottom = Math.max(bottom, p[1] + (s.t === 'circle' ? Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) : 0));
    const h = Math.min(Math.max(400, Math.ceil(bottom + 60)), this.height);
    const c = document.createElement('canvas'); c.width = W; c.height = h;
    const x = c.getContext('2d');
    this.drawBackground(x, h, true);
    for (const s of this.strokes) drawStroke(x, s);
    return c.toDataURL(type, 0.9);
  }

  destroy() { this.ro.disconnect(); document.removeEventListener('keydown', this.keyHandler); }
}

function drawStroke(x, s) {
  const pts = s.pts; if (!pts || !pts.length) return;
  x.save();
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = s.c;
  if (s.t === 'marker') { x.globalAlpha = 0.32; x.lineWidth = s.w; x.lineCap = 'butt'; }
  if (s.t === 'line') {
    x.lineWidth = s.w * 1.1; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); x.lineTo(pts[1][0], pts[1][1]); x.stroke();
  } else if (s.t === 'circle') {
    const r = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    x.lineWidth = s.w * 1.1; x.beginPath(); x.arc(pts[0][0], pts[0][1], r, 0, Math.PI * 2); x.stroke();
    x.fillStyle = s.c; x.beginPath(); x.arc(pts[0][0], pts[0][1], 2.5, 0, Math.PI * 2); x.fill();
  } else if (s.t === 'marker') {
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    const l = pts[pts.length - 1]; x.lineTo(l[0], l[1]); x.stroke();
  } else {
    // перо: сегменты с переменной толщиной от нажима, сглаживание по серединам
    const wOf = p => s.w * (0.35 + p[2] * 1.3);
    if (pts.length < 3) {
      x.lineWidth = wOf(pts[0]); x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); x.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); x.stroke();
    } else {
      let px = pts[0][0], py = pts[0][1];
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        x.lineWidth = wOf(pts[i]);
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); x.stroke();
        px = mx; py = my;
      }
      const l = pts[pts.length - 1]; x.lineWidth = wOf(l); x.beginPath(); x.moveTo(px, py); x.lineTo(l[0], l[1]); x.stroke();
    }
  }
  x.restore();
}

function strokeHit(s, x, y, r) {
  const p = s.pts;
  if (s.t === 'circle') { const R = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]); return Math.abs(Math.hypot(x - p[0][0], y - p[0][1]) - R) < r + s.w; }
  for (let i = 0; i < p.length - 1; i++) if (segDist(x, y, p[i], p[i + 1]) < r + s.w / 2) return true;
  return p.length === 1 && Math.hypot(x - p[0][0], y - p[0][1]) < r;
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  pen: svg('M4 20l1.5-5L16 4.5a2.1 2.1 0 013 3L8.5 18 4 20zM14 6.5l3 3'),
  marker: svg('M5 19h6M9 15l-2 4M8 14l8-8 3 3-8 8H8v-3z'),
  line: svg('M5 19L19 5'),
  circle: svg('M12 4a8 8 0 100 16 8 8 0 000-16z'),
  eraser: svg('M8 19h11M5.5 14.5l7-7a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18H8.5l-3-3a.7.7 0 010-.5z'),
  undo: svg('M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3'),
  redo: svg('M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3'),
  grid: svg('M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16'),
  hand: svg('M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7a7 7 0 01-7 7h-.5A5.5 5.5 0 014 16l-1-2.5a1.5 1.5 0 012.6-1.4L8 15'),
  plus: svg('M12 5v14M5 12h14'),
  trash: svg('M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12'),
};
