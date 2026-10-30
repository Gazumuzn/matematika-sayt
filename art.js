// Графика в духе постера «Pure Math»: построения циркулем, спираль, медали.

export function posterArt() {
  const cx = 280, cy = 250, R = 170;
  const tri = [0, 1, 2].map(k => { const a = -Math.PI / 2 + k * 2 * Math.PI / 3; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  // золотая спираль из четвертей окружностей
  let spiral = ''; let x = 360, y = 250, s = 120, dir = 0;
  for (let i = 0; i < 7; i++) {
    const r = s; const pts = [[x, y - r, x + r, y], [x + r, y, x, y + r], [x, y + r, x - r, y], [x - r, y, x, y - r]][dir % 4];
    spiral += `M${pts[0]} ${pts[1]} A${r} ${r} 0 0 1 ${pts[2]} ${pts[3]} `;
    const nx = [[x, y], [x, y], [x, y], [x, y]][0];
    s = s / 1.618;
    if (dir % 4 === 0) { y = y + (r - s); } else if (dir % 4 === 1) { x = x - (r - s); } else if (dir % 4 === 2) { y = y - (r - s); } else { x = x + (r - s); }
    void nx; dir++;
  }
  let sine = ''; for (let i = 0; i <= 120; i++) { const t = i / 120; sine += (i ? 'L' : 'M') + (40 + t * 480).toFixed(1) + ' ' + (470 - Math.sin(t * Math.PI * 4) * 22).toFixed(1); }
  const ticks = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; const r1 = R + 18, r2 = R + (i % 6 ? 26 : 36); return `M${cx + r1 * Math.cos(a)} ${cy + r1 * Math.sin(a)}L${cx + r2 * Math.cos(a)} ${cy + r2 * Math.sin(a)}`; }).join('');
  return `<svg class="art" viewBox="0 0 560 500" fill="none" stroke="#141414" stroke-linecap="round" aria-hidden="true">
    <defs><clipPath id="half"><rect x="${cx}" y="0" width="300" height="500"/></clipPath></defs>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="#0d0d0f" clip-path="url(#half)" stroke="none"/>
    ${Array.from({ length: 70 }, (_, i) => { const a = (i * 137.5) % 360 * Math.PI / 180; const r = Math.sqrt((i * 97) % 100 / 100) * (R - 6); const px = cx + Math.abs(r * Math.cos(a)), py = cy + r * Math.sin(a); return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(i % 7 ? .7 : 1.4)}" fill="#efe9dc" stroke="none" clip-path="url(#half)"/>`; }).join('')}
    <circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${cy}" r="${R + 18}" stroke-width=".6"/>
    <path d="${ticks}" stroke-width=".8"/>
    <circle cx="${cx}" cy="${cy}" r="${R / 2}" stroke-width=".7" stroke-dasharray="3 4"/>
    <path d="M${tri[0]}L${tri[1]}L${tri[2]}Z" stroke-width="1.1"/>
    <path d="M${tri[0]}L${(tri[1][0] + tri[2][0]) / 2} ${(tri[1][1] + tri[2][1]) / 2}M${tri[1]}L${(tri[0][0] + tri[2][0]) / 2} ${(tri[0][1] + tri[2][1]) / 2}M${tri[2]}L${(tri[0][0] + tri[1][0]) / 2} ${(tri[0][1] + tri[1][1]) / 2}" stroke-width=".5" stroke="#7a766d"/>
    <g clip-path="url(#half)" stroke="#efe9dc"><path d="M${tri[0]}L${tri[1]}L${tri[2]}Z" stroke-width="1.1"/><circle cx="${cx}" cy="${cy}" r="${R / 2}" stroke-width=".7" stroke-dasharray="3 4"/><path d="${spiral}" stroke-width="1"/></g>
    <path d="${spiral}" stroke-width="1" clip-path="inset(0 0 0 0)" opacity=".0"/>
    <path d="M20 ${cy}H540M${cx} 40V470" stroke-width=".5" stroke="#7a766d"/>
    <path d="M${cx - 120} 40 A 240 240 0 0 0 ${cx - 120} 460" stroke-width=".5" stroke="#7a766d" stroke-dasharray="2 5"/>
    <path d="${sine}" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="#141414"/>
    ${tri.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#f4f0e7" stroke-width="1.2"/>`).join('')}
    <text x="${tri[0][0] + 10}" y="${tri[0][1] - 8}" font-family="Cormorant Garamond" font-style="italic" font-size="20" fill="#141414" stroke="none">A</text>
    <text x="${tri[1][0] + 8}" y="${tri[1][1] + 20}" font-family="Cormorant Garamond" font-style="italic" font-size="20" fill="#efe9dc" stroke="none">B</text>
    <text x="${tri[2][0] - 22}" y="${tri[2][1] + 20}" font-family="Cormorant Garamond" font-style="italic" font-size="20" fill="#141414" stroke="none">C</text>
    <text x="482" y="66" font-family="Cormorant Garamond" font-size="44" fill="#141414" stroke="none">∞</text>
  </svg>`;
}

export function stars(n = 140) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (i * 7919) % 1000 / 10, y = (i * 104729) % 1000 / 10, r = i % 13 === 0 ? 1.4 : i % 3 ? .5 : .9;
    s += `<circle cx="${x}%" cy="${y}%" r="${r}" fill="#efe9dc" opacity="${(0.25 + (i % 5) / 7).toFixed(2)}"/>`;
  }
  return `<svg class="stars" width="100%" height="100%" aria-hidden="true">${s}
    <circle cx="82%" cy="16%" r="46" fill="none" stroke="#efe9dc" stroke-opacity=".25"/>
    <ellipse cx="82%" cy="16%" rx="78" ry="14" fill="none" stroke="#efe9dc" stroke-opacity=".35" transform="rotate(-18)" transform-origin="82% 16%"/>
    <circle cx="12%" cy="86%" r="120" fill="none" stroke="#efe9dc" stroke-opacity=".12"/>
    <circle cx="12%" cy="86%" r="80" fill="none" stroke="#efe9dc" stroke-opacity=".12" stroke-dasharray="2 6"/></svg>`;
}

export function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 40 40" fill="none" stroke="#141414" aria-hidden="true">
    <circle cx="20" cy="20" r="18.5" stroke-width="1.2"/><path d="M20 1.5a18.5 18.5 0 010 37z" fill="#141414"/>
    <path d="M20 5L33 28H7z" stroke-width="1.1"/><path d="M20 5L33 28H20z" stroke="#f4f0e7" stroke-width="1.1"/>
    <circle cx="20" cy="20.5" r="7.5" stroke-width=".8"/><path d="M20 13a7.5 7.5 0 010 15" stroke="#f4f0e7" stroke-width=".8"/></svg>`;
}

export function ring(done, total, size = 54) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, f = total ? Math.min(1, done / total) : 0;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-label="${done} из ${total}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e2dccd" stroke-width="3"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${f >= 1 ? '#a8833a' : '#141414'}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#141414">${f >= 1 ? '✓' : Math.round(f * 100) + '%'}</text></svg>`;
}

// медаль уровня: римская цифра в лавровом круге
export function medal(level, dark = true) {
  const fg = dark ? '#efe9dc' : '#141414';
  const leaves = Array.from({ length: 18 }, (_, i) => {
    const side = i < 9 ? -1 : 1, k = i % 9, a = Math.PI / 2 + side * (0.35 + k * 0.27);
    const x = 56 + 44 * Math.cos(a), y = 56 + 44 * Math.sin(a), rot = a * 180 / Math.PI + (side > 0 ? 60 : -60);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="2.6" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#a8833a"/>`;
  }).join('');
  return `<svg class="medal" viewBox="0 0 112 112" aria-label="Уровень ${level}">
    <circle cx="56" cy="56" r="36" fill="none" stroke="${fg}" stroke-width="1.2"/>
    <circle cx="56" cy="56" r="31" fill="none" stroke="#a8833a" stroke-width=".8" stroke-dasharray="1.5 3"/>
    ${leaves}
    <text x="56" y="58" text-anchor="middle" dominant-baseline="middle" font-family="Cormorant Garamond" font-weight="600" font-size="${roman(level).length > 3 ? 20 : 28}" fill="${fg}">${roman(level)}</text></svg>`;
}

const BADGE_GLYPH = {
  first: '<path d="M40 22v36M32 30l8-8"/>',
  ten: '<text x="40" y="48" text-anchor="middle" font-size="26">10</text>',
  hundred: '<text x="40" y="48" text-anchor="middle" font-size="22">100</text>',
  'five-hundred': '<text x="40" y="48" text-anchor="middle" font-size="22">D</text>',
  thousand: '<text x="40" y="48" text-anchor="middle" font-size="22">M</text>',
  block: '<rect x="27" y="27" width="26" height="26"/><path d="M32 40l6 6 10-12"/>',
  blocks10: '<rect x="24" y="24" width="14" height="14"/><rect x="42" y="24" width="14" height="14"/><rect x="24" y="42" width="14" height="14"/><rect x="42" y="42" width="14" height="14"/>',
  chapter: '<path d="M26 26h12a4 4 0 014 4v26a3 3 0 00-3-3H26zM54 26H42v30a3 3 0 013-3h9z"/>',
  geometer: '<path d="M40 22L58 54H22z"/><circle cx="40" cy="43" r="9"/>',
  submit: '<path d="M26 44l14-18 14 18M40 26v30"/>',
  punctual: '<circle cx="40" cy="40" r="16"/><path d="M40 30v10l7 5"/>',
  excellent: '<text x="40" y="51" text-anchor="middle" font-size="32">5</text>',
  streak3: '<path d="M40 22c6 8 12 12 12 20a12 12 0 01-24 0c0-5 3-8 5-11 1 4 3 6 5 6-2-6 0-11 2-15z"/>',
  streak7: '<path d="M40 22c6 8 12 12 12 20a12 12 0 01-24 0c0-5 3-8 5-11 1 4 3 6 5 6-2-6 0-11 2-15z"/><text x="40" y="50" text-anchor="middle" font-size="12">7</text>',
  streak30: '<path d="M40 22c6 8 12 12 12 20a12 12 0 01-24 0c0-5 3-8 5-11 1 4 3 6 5 6-2-6 0-11 2-15z"/><text x="40" y="50" text-anchor="middle" font-size="11">30</text>',
  artist: '<path d="M26 54l3-10 17-17a3 3 0 015 5L34 49z"/><path d="M44 29l5 5"/>',
};
export function badgeIcon(key, got) {
  const c = got ? '#a8833a' : '#7a766d';
  return `<svg viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="36" fill="${got ? '#0d0d0f' : '#ece6d9'}" stroke="${c}" stroke-width="1.5"/>
    <circle cx="40" cy="40" r="30" fill="none" stroke="${c}" stroke-width=".7" stroke-dasharray="1.5 3"/>
    <g fill="none" stroke="${got ? '#efe9dc' : '#7a766d'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" font-family="Cormorant Garamond" font-weight="600">
      ${(BADGE_GLYPH[key] || '').replace(/<text /g, `<text fill="${got ? '#efe9dc' : '#7a766d'}" stroke="none" `)}</g></svg>`;
}

const GLYPHS = [
  '<path d="M10 120 Q60 10 140 70"/><circle cx="75" cy="75" r="50"/>',
  '<path d="M20 120 L60 30 L70 60 L80 20"/><path d="M50 30h90"/>',
  '<path d="M10 130 C40 128 60 100 75 70 S110 12 140 10"/><path d="M10 10v130h130"/>',
  '<path d="M0 75 Q20 15 40 75 T80 75 T120 75 T160 75"/><circle cx="75" cy="75" r="55"/>',
  '<circle cx="20" cy="120" r="4"/><circle cx="50" cy="95" r="6"/><circle cx="80" cy="70" r="8"/><circle cx="115" cy="40" r="11"/>',
  '<path d="M20 130 L130 20"/><path d="M20 20 L130 130"/><rect x="40" y="40" width="70" height="70"/>',
  '<path d="M10 140 Q75 -60 140 140"/><path d="M75 10v140"/>',
  '<path d="M75 15 L140 130 H10 Z"/><circle cx="75" cy="91" r="38"/>',
  '<path d="M40 50 L110 30 L130 100 L60 120 Z"/><path d="M40 50 L60 120 M110 30 L130 100"/><path d="M40 50 L75 10 L110 30 M75 10 L130 100"/>',
  '<path d="M10 75h130M75 10v130"/><path d="M75 75 L130 30"/><path d="M75 75 L120 110"/>',
  '<rect x="20" y="20" width="110" height="110"/><path d="M20 75h110M75 20v110"/><circle cx="47" cy="47" r="8"/>',
];
export function chapterGlyph(i) {
  return `<svg class="glyph" viewBox="0 0 150 150" fill="none" stroke="#141414" stroke-width="2">${GLYPHS[i % GLYPHS.length]}</svg>`;
}

export function spinner() {
  return `<div class="loading"><svg viewBox="0 0 60 60" fill="none" stroke="#141414"><circle cx="30" cy="30" r="26" stroke-width="1"/><path d="M30 4 L52.5 43 L7.5 43 Z" stroke-width="1"/><circle cx="30" cy="4" r="3" fill="#141414"/></svg></div>`;
}

export function roman(n) {
  const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s;
}
