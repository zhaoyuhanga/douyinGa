/**
 * Canvas 绘制小工具：所有界面共用，避免每个场景重复写圆角/图标。
 */
const { COLORS } = require('./config');

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function hexA(hex, alpha) {
  if (!hex) return 'rgba(255,255,255,' + alpha + ')';
  if (hex.indexOf('rgba') === 0 || hex.indexOf('rgb') === 0) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function font(size, weight) {
  return (
    (weight || 600) +
    ' ' +
    Math.round(size * 10) / 10 +
    'px "PingFang SC","Heiti SC","Microsoft YaHei",sans-serif'
  );
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, color) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRound(ctx, x, y, w, h, r, color, width) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 1;
  ctx.stroke();
}

function text(ctx, str, x, y, size, color, align, weight) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color || COLORS.text;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function measure(ctx, str, size, weight) {
  ctx.font = font(size, weight);
  return ctx.measureText(str).width;
}

function coinIcon(ctx, cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd35c';
  ctx.fill();
  ctx.strokeStyle = '#a96d14';
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.34);
  ctx.lineTo(cx, cy + r * 0.34);
  ctx.strokeStyle = '#a96d14';
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.stroke();
  ctx.restore();
}

function heartIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.78);
  ctx.bezierCurveTo(-s * 1.25, -s * 0.05, -s * 0.7, -s * 0.95, 0, -s * 0.38);
  ctx.bezierCurveTo(s * 0.7, -s * 0.95, s * 1.25, -s * 0.05, 0, s * 0.78);
  ctx.closePath();
  ctx.fillStyle = color || COLORS.red;
  ctx.fill();
  ctx.restore();
}

function playIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy - s * 0.62);
  ctx.lineTo(cx + s * 0.7, cy);
  ctx.lineTo(cx - s * 0.38, cy + s * 0.62);
  ctx.closePath();
  ctx.fillStyle = color || '#101b22';
  ctx.fill();
  ctx.restore();
}

function pauseIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color || COLORS.text;
  fillRound(ctx, cx - s * 0.55, cy - s * 0.65, s * 0.34, s * 1.3, s * 0.14, color);
  fillRound(ctx, cx + s * 0.2, cy - s * 0.65, s * 0.34, s * 1.3, s * 0.14, color);
  ctx.restore();
}

function chevron(ctx, x, y, angle, size, color, width) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-size, -size * 0.65);
  ctx.lineTo(0, 0);
  ctx.lineTo(-size, size * 0.65);
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function adBadge(ctx, x, y, scale) {
  const s = scale || 1;
  const w = 22 * s;
  const h = 12 * s;
  fillRound(ctx, x, y - h / 2, w, h, 3 * s, 'rgba(255,209,102,0.16)');
  strokeRound(ctx, x, y - h / 2, w, h, 3 * s, 'rgba(255,209,102,0.55)', 1);
  text(ctx, 'AD', x + w / 2, y + 0.2, 8 * s, COLORS.gold, 'center', 800);
}

function shieldLogo(ctx, cx, cy, r) {
  ctx.save();
  // 外发光
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.9);
  glow.addColorStop(0, 'rgba(111,238,207,0.24)');
  glow.addColorStop(1, 'rgba(111,238,207,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.82, cy - r * 0.62);
  ctx.lineTo(cx + r * 0.72, cy + r * 0.28);
  ctx.quadraticCurveTo(cx + r * 0.55, cy + r * 0.86, cx, cy + r * 1.08);
  ctx.quadraticCurveTo(cx - r * 0.55, cy + r * 0.86, cx - r * 0.72, cy + r * 0.28);
  ctx.lineTo(cx - r * 0.82, cy - r * 0.62);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#a5ffe7');
  g.addColorStop(0.55, '#41c5a7');
  g.addColorStop(1, '#176f64');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,255,247,0.8)';
  ctx.lineWidth = Math.max(1.5, r * 0.055);
  ctx.stroke();

  // 内盾
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.72);
  ctx.lineTo(cx + r * 0.58, cy - r * 0.44);
  ctx.lineTo(cx + r * 0.5, cy + r * 0.18);
  ctx.quadraticCurveTo(cx + r * 0.4, cy + r * 0.6, cx, cy + r * 0.8);
  ctx.quadraticCurveTo(cx - r * 0.4, cy + r * 0.6, cx - r * 0.5, cy + r * 0.18);
  ctx.lineTo(cx - r * 0.58, cy - r * 0.44);
  ctx.closePath();
  ctx.fillStyle = 'rgba(5,37,44,0.75)';
  ctx.fill();

  // 塔
  ctx.fillStyle = '#d6fff3';
  const tw = r * 0.18;
  ctx.fillRect(cx - r * 0.34, cy - r * 0.1, tw, r * 0.52);
  ctx.fillRect(cx + r * 0.16, cy - r * 0.1, tw, r * 0.52);
  ctx.fillRect(cx - r * 0.08, cy - r * 0.48, r * 0.16, r * 0.9);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.54, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function towerGlyph(ctx, type, cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  if (type === 'arrow') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#194e3b';
    ctx.fill();
    ctx.strokeStyle = '#69e29a';
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.45, cy - r * 0.45);
    ctx.strokeStyle = '#d9ffeb';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.45, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.12, cy - r * 0.42);
    ctx.moveTo(cx + r * 0.45, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.42, cy - r * 0.12);
    ctx.stroke();
  } else if (type === 'frost') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#153a4d';
    ctx.fill();
    ctx.strokeStyle = '#74d2ff';
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.4, cy);
    ctx.lineTo(cx, cy + r * 0.55);
    ctx.lineTo(cx - r * 0.4, cy);
    ctx.closePath();
    ctx.fillStyle = '#a8eaff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#4a2d16';
    ctx.fill();
    ctx.strokeStyle = '#ffbd5e';
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.55);
    fillRound(ctx, -r * 0.25, -r * 0.16, r * 0.85, r * 0.32, r * 0.12, '#ffd166');
    ctx.beginPath();
    ctx.arc(-r * 0.2, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#a86323';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

module.exports = {
  clamp,
  hexA,
  font,
  roundRectPath,
  fillRound,
  strokeRound,
  text,
  measure,
  coinIcon,
  heartIcon,
  playIcon,
  pauseIcon,
  chevron,
  adBadge,
  shieldLogo,
  towerGlyph,
};
