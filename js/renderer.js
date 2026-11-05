/**
 * 所有 Canvas 渲染。挂在 Game.prototype 上，核心逻辑保持可读。
 */
const {
  MAP,
  COLORS,
  TOWERS,
  TOWER_ORDER,
  GAME,
  WAVES,
} = require('./config');
const D = require('./draw');

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function attach(Game) {
  const proto = Game.prototype;

  // ==================================================================
  // 主渲染
  // ==================================================================
  proto.render = function () {
    const ctx = this.ctx;
    this.buttons = [];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    if (this.scene === 'home') {
      this.drawHome();
    } else if (this.scene === 'playing') {
      this.drawGame();
    }

    if (this.scene === 'home' && this.helpOpen) {
      this.drawHelpModal();
    } else if (this.scene === 'playing' && this.modal === 'pause') {
      this.drawPauseModal();
    } else if (this.scene === 'playing' && this.modal === 'result') {
      this.drawResultModal();
    }

    this.drawToast();

    const mock = this.ads.getMockState();
    if (mock) this.drawMockAd(mock);
  };

  proto.drawBackground = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#4cc9b6';
    ctx.lineWidth = 1;
    const step = 34;
    for (let x = -H; x < W + H; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.045;
    for (let y = 40; y < H; y += 58) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(W * 0.5, H * 0.2, 10, W * 0.5, H * 0.2, W * 0.9);
    glow.addColorStop(0, 'rgba(50, 190, 168, 0.12)');
    glow.addColorStop(1, 'rgba(50, 190, 168, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  };

  // ==================================================================
  // 首页
  // ==================================================================
  proto.drawHome = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const safeTop = this.safeTop;
    this.drawBackground();
    this.drawHomeAmbient();

    const logoY = safeTop + 78;
    D.shieldLogo(ctx, W / 2, logoY, Math.min(45, W * 0.118));

    const titleSize = Math.min(40, W * 0.105);
    const titleY = logoY + 88;
    ctx.save();
    ctx.font = D.font(titleSize, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tg = ctx.createLinearGradient(0, titleY - titleSize * 0.7, 0, titleY + titleSize * 0.6);
    tg.addColorStop(0, '#fff7d6');
    tg.addColorStop(0.5, '#ffd166');
    tg.addColorStop(1, '#ef9f39');
    ctx.fillStyle = tg;
    ctx.shadowColor = 'rgba(255, 190, 80, 0.35)';
    ctx.shadowBlur = 22;
    ctx.fillText('最后一道防线', W / 2, titleY);
    ctx.restore();

    D.text(
      ctx,
      '建塔改路 · 守住最后底线',
      W / 2,
      titleY + 32,
      Math.min(14, W * 0.038),
      'rgba(210, 242, 235, 0.7)',
      'center',
      500
    );

    const statsY = Math.max(titleY + 62, H * 0.36);
    const cardW = W - 56;
    const cardH = 58;
    const cardX = (W - cardW) / 2;
    D.fillRound(ctx, cardX, statsY, cardW, cardH, 14, 'rgba(8, 31, 39, 0.72)');
    D.strokeRound(ctx, cardX, statsY, cardW, cardH, 14, 'rgba(125, 235, 214, 0.18)', 1);

    const half = cardW / 2;
    D.text(ctx, '最佳防线', cardX + half / 2, statsY + 19, 10, COLORS.textDim, 'center', 500);
    D.text(
      ctx,
      this.profile.bestWave > 0 ? '第 ' + this.profile.bestWave + ' 波' : '尚未开局',
      cardX + half / 2,
      statsY + 39,
      15,
      COLORS.gold,
      'center',
      700
    );
    ctx.fillStyle = 'rgba(125,235,214,0.12)';
    ctx.fillRect(cardX + half - 0.5, statsY + 14, 1, cardH - 28);
    D.text(ctx, '累计击败', cardX + half + half / 2, statsY + 19, 10, COLORS.textDim, 'center', 500);
    D.text(
      ctx,
      this.profile.totalKills > 0 ? String(this.profile.totalKills) : '0',
      cardX + half + half / 2,
      statsY + 39,
      15,
      COLORS.text,
      'center',
      700
    );

    const btnW = Math.min(300, W - 56);
    const btnH = 56;
    const startY = Math.max(statsY + cardH + 76, H * 0.55);
    const btnX = (W - btnW) / 2;
    const pressed = this.pressedButton === 'home_start';
    const yOff = pressed ? 2 : 0;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 198, 80, 0.5)';
    ctx.shadowBlur = 26;
    const bg = ctx.createLinearGradient(0, startY, 0, startY + btnH);
    bg.addColorStop(0, '#ffe8a8');
    bg.addColorStop(0.45, '#ffd166');
    bg.addColorStop(1, '#e9a12f');
    D.fillRound(ctx, btnX, startY + yOff, btnW, btnH, 18, bg);
    ctx.restore();
    D.strokeRound(ctx, btnX, startY + yOff, btnW, btnH, 18, 'rgba(255, 251, 228, 0.8)', 1.5);

    const label = '开始防守';
    const labelSize = 21;
    const labelW = D.measure(ctx, label, labelSize, 800);
    const iconX = W / 2 - labelW / 2 - 18;
    D.playIcon(ctx, iconX, startY + yOff + btnH / 2, 9, '#24311a');
    D.text(ctx, label, W / 2 + 8, startY + yOff + btnH / 2, labelSize, '#24311a', 'center', 800);
    this.addButton('home_start', btnX, startY, btnW, btnH, () => this.startRun());

    const helpW = 184;
    const helpH = 42;
    const helpY = startY + btnH + 16;
    const helpX = (W - helpW) / 2;
    D.fillRound(ctx, helpX, helpY, helpW, helpH, 14, 'rgba(10, 39, 47, 0.78)');
    D.strokeRound(ctx, helpX, helpY, helpW, helpH, 14, 'rgba(125, 235, 214, 0.34)', 1);
    D.text(ctx, '玩法说明', W / 2, helpY + helpH / 2, 13, COLORS.mint, 'center', 600);
    this.addButton('home_help', helpX, helpY, helpW, helpH, () => this.showHelp());

    const footerY = Math.max(
      helpY + helpH + 20,
      H - this.safeBottom - (this.ads.hasBanner() ? 86 : 18)
    );

    const featureY = helpY + helpH + 30;
    if (footerY - featureY > 88) {
      const lineY = featureY + 12;
      ctx.fillStyle = 'rgba(125, 235, 214, 0.12)';
      ctx.fillRect(W / 2 - 78, lineY - 7, 46, 1);
      ctx.fillRect(W / 2 + 32, lineY - 7, 46, 1);
      D.text(
        ctx,
        '3 种防御塔  ·  4 种怪物  ·  15 波防线',
        W / 2,
        lineY,
        9.5,
        'rgba(141, 181, 177, 0.62)',
        'center',
        500
      );
      D.text(
        ctx,
        '点选防御塔 → 点击草地 → 怪物立刻改路',
        W / 2,
        lineY + 23,
        9.5,
        'rgba(125, 235, 214, 0.55)',
        'center',
        500
      );
    }

    D.text(
      ctx,
      'v1.0 · 抖音小游戏',
      W / 2,
      Math.min(footerY, H - this.safeBottom - 10),
      9.5,
      'rgba(141, 181, 177, 0.55)',
      'center',
      500
    );

    if (!this.profile.runs) {
      D.text(
        ctx,
        '单局大约 6–10 分钟 · 最佳纪录自动保存',
        W / 2,
        statsY - 16,
        9.5,
        'rgba(141, 181, 177, 0.5)',
        'center',
        500
      );
    }
  };

  proto.drawHomeAmbient = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const t = this.time;
    const p0 = { x: W * 0.82, y: this.safeTop + 26 };
    const p1 = { x: W * 0.96, y: H * 0.36 };
    const p2 = { x: W * 0.18, y: H * 0.42 };
    const p3 = { x: W * 0.34, y: H * 0.72 };

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = 'rgba(90, 220, 196, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = cubicPoint(p0, p1, p2, p3, i / 40);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const k = (t * 0.045 + i / 3) % 1;
      const p = cubicPoint(p0, p1, p2, p3, k);
      const r = 2.4 + i * 0.6;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
      g.addColorStop(0, 'rgba(160, 255, 232, 0.75)');
      g.addColorStop(1, 'rgba(160, 255, 232, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8fff5';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    D.towerGlyph(ctx, 'arrow', W * 0.13, H * 0.49, 22, 0.18);
    D.towerGlyph(ctx, 'cannon', W * 0.87, H * 0.41, 20, 0.15);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = COLORS.mint;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(W * 0.13, H * 0.49, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W * 0.87, H * 0.41, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 9; i++) {
      const x = ((i * 83 + 40) % W) + Math.sin(t * 0.6 + i) * 5;
      const y = ((i * 137 + 90) % (H * 0.8)) + Math.cos(t * 0.4 + i) * 4;
      ctx.fillStyle = 'rgba(138, 246, 222, ' + (0.04 + (i % 3) * 0.02) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ==================================================================
  // 玩法说明
  // ==================================================================
  proto.drawHelpModal = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.fillStyle = 'rgba(2, 10, 14, 0.76)';
    ctx.fillRect(0, 0, W, H);
    this.addButton('help_block', 0, 0, W, H, () => {});

    const cardW = W - 34;
    const cardH = Math.min(448, H - this.safeTop - this.safeBottom - 50);
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;

    D.fillRound(ctx, cardX, cardY, cardW, cardH, 22, 'rgba(8, 30, 38, 0.98)');
    D.strokeRound(ctx, cardX, cardY, cardW, cardH, 22, 'rgba(125,235,214,0.28)', 1.2);

    D.text(ctx, '怎么玩', cardX + 24, cardY + 34, 22, COLORS.text, 'left', 800);
    D.text(
      ctx,
      '塔不是单纯输出，塔身会改变怪物路线',
      cardX + 24,
      cardY + 60,
      10.5,
      COLORS.textDim,
      'left',
      500
    );

    const rows = [
      ['顶侧刷怪', '怪物从顶部两个裂隙出现，目标是抵达最下方防线。'],
      ['建塔改路', '点下方防御塔，再点草地建造。塔会占位，怪物实时绕行。'],
      ['守住底线', '漏怪扣生命；不能把通往底部的路完全封死。'],
      ['广告补给', '金币补给与复活由激励视频提供；未看完不发奖励。'],
    ];
    const compact = cardH < 430;
    let y = cardY + (compact ? 76 : 86);
    const rowGap = compact ? 64 : 75;
    for (let i = 0; i < rows.length; i++) {
      ctx.beginPath();
      ctx.arc(cardX + 37, y + 12, 13, 0, Math.PI * 2);
      ctx.fillStyle = i === 3 ? 'rgba(255,209,102,0.12)' : 'rgba(125,235,214,0.12)';
      ctx.fill();
      ctx.strokeStyle = i === 3 ? 'rgba(255,209,102,0.42)' : 'rgba(125,235,214,0.36)';
      ctx.lineWidth = 1;
      ctx.stroke();
      D.text(
        ctx,
        String(i + 1),
        cardX + 37,
        y + 12,
        12,
        i === 3 ? COLORS.gold : COLORS.mint,
        'center',
        800
      );
      D.text(ctx, rows[i][0], cardX + 60, y + 2, 13.5, COLORS.text, 'left', 700);
      this.wrapText(rows[i][1], cardX + 60, y + 23, cardW - 84, 10.2, COLORS.textDim, 2, 15);
      y += rowGap;
    }

    if (!compact && this.ads.isMockRewarded()) {
      D.text(
        ctx,
        '开发预览环境：激励视频以模拟广告演示',
        W / 2,
        cardY + cardH - 68,
        8.5,
        'rgba(141,181,177,0.68)',
        'center',
        500
      );
    }

    const closeW = cardW - 48;
    const closeH = 44;
    const closeX = cardX + 24;
    const closeY = cardY + cardH - 50;
    D.fillRound(ctx, closeX, closeY, closeW, closeH, 13, 'rgba(125,235,214,0.12)');
    D.strokeRound(ctx, closeX, closeY, closeW, closeH, 13, 'rgba(125,235,214,0.45)', 1);
    D.text(ctx, '知道了', cardX + cardW / 2, closeY + closeH / 2, 14, COLORS.mint, 'center', 700);
    this.addButton('help_close', closeX, closeY, closeW, closeH, () => this.closeHelp());
  };

  proto.wrapText = function (str, x, y, maxW, size, color, maxLines, lineH) {
    const ctx = this.ctx;
    ctx.font = D.font(size, 500);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const chars = String(str).split('');
    let line = '';
    let lineIndex = 0;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + lineIndex * lineH);
        line = chars[i];
        lineIndex += 1;
        if (lineIndex >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line && lineIndex < maxLines) {
      ctx.fillText(line, x, y + lineIndex * lineH);
    }
  };

  // ==================================================================
  // 游戏场景
  // ==================================================================
  proto.drawGame = function () {
    const ctx = this.ctx;
    this.drawBackground();

    ctx.save();
    if (this.shake > 0.4 && !this.modal) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawBoard();
    this.drawTowers();
    this.drawEnemies();
    this.drawProjectiles();
    this.drawParticles();
    this.drawFloatingTexts();
    ctx.restore();

    this.drawHUD();
    this.drawWaveBar();
    this.drawDock();

    if (this.flash > 0.01) {
      ctx.fillStyle = 'rgba(255, 64, 84, ' + this.flash * 0.5 + ')';
      ctx.fillRect(0, 0, this.W, this.H);
    }
  };

  proto.drawBoard = function () {
    const ctx = this.ctx;
    const L = this.layout;
    const cell = L.cell;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    D.fillRound(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10, '#071a21');
    ctx.restore();

    ctx.save();
    D.roundRectPath(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10);
    ctx.clip();

    ctx.fillStyle = '#0a252d';
    ctx.fillRect(L.boardX, L.boardY, L.boardW, L.boardH);

    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        const x = L.boardX + c * cell;
        const y = L.boardY + r * cell;
        if (r === 0) this.drawTopCell(x, y, c, r);
        else if (r === MAP.rows - 1) this.drawBaseCell(x, y, c, r);
        else this.drawGrassCell(x, y, c, r);
        if (MAP.terrain[r].charAt(c) === '#') this.drawRock(x, y, c, r);
      }
    }

    // 出生裂隙
    for (let i = 0; i < MAP.spawns.length; i++) {
      const s = MAP.spawns[i];
      this.drawSpawnGate(s.c, s.r, i);
    }
    this.drawExitGate();

    // 网格
    ctx.strokeStyle = 'rgba(150, 255, 231, 0.055)';
    ctx.lineWidth = 1;
    for (let c = 1; c < MAP.cols; c++) {
      const x = L.boardX + c * cell;
      ctx.beginPath();
      ctx.moveTo(x, L.boardY + cell);
      ctx.lineTo(x, L.boardY + L.boardH - cell);
      ctx.stroke();
    }
    for (let r = 2; r < MAP.rows - 1; r++) {
      const y = L.boardY + r * cell;
      ctx.beginPath();
      ctx.moveTo(L.boardX, y);
      ctx.lineTo(L.boardX + L.boardW, y);
      ctx.stroke();
    }

    if (this.buildType) this.drawBuildHighlights();

    if (!this.run || !this.run.waveActive || this.buildType) {
      this.drawFlowPaths();
    }

    ctx.restore();

    D.strokeRound(
      ctx,
      L.boardX,
      L.boardY,
      L.boardW,
      L.boardH,
      10,
      'rgba(125, 235, 214, 0.32)',
      1.4
    );

    if (this.dragCell && this.buildType) {
      ctx.save();
      D.roundRectPath(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10);
      ctx.clip();
      this.drawGhost(this.dragCell.c, this.dragCell.r);
      ctx.restore();
    }
  };

  proto.drawGrassCell = function (x, y, c, r) {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const even = (c + r) % 2 === 0;
    ctx.fillStyle = even ? '#143f39' : '#113832';
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle =
      even ? 'rgba(119, 238, 203, 0.035)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(x, y, cell, cell * 0.28);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

    const hash = (c * 13 + r * 29) % 9;
    if (hash < 3) {
      ctx.strokeStyle = 'rgba(111, 217, 169, 0.14)';
      ctx.lineWidth = 1;
      const bx = x + cell * 0.24 + hash * cell * 0.13;
      const by = y + cell * 0.68;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - cell * 0.05, by - cell * 0.16);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + cell * 0.06, by - cell * 0.13);
      ctx.stroke();
    }
  };

  proto.drawTopCell = function (x, y, c, r) {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    ctx.fillStyle = '#081722';
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = 'rgba(86, 60, 120, 0.12)';
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y + cell * 0.8, cell, cell * 0.2);

    // 洞顶石笋
    ctx.fillStyle = '#0d2631';
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.12, y + cell * 0.82);
    ctx.lineTo(x + cell * 0.3, y + cell * 0.38);
    ctx.lineTo(x + cell * 0.38, y + cell * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.62, y + cell * 0.82);
    ctx.lineTo(x + cell * 0.78, y + cell * 0.45);
    ctx.lineTo(x + cell * 0.9, y + cell * 0.82);
    ctx.closePath();
    ctx.fill();
  };

  proto.drawBaseCell = function (x, y, c, r) {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    ctx.fillStyle = '#08232f';
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = 'rgba(4, 18, 25, 0.55)';
    ctx.fillRect(x, y, cell, cell * 0.25);
    ctx.strokeStyle = 'rgba(71, 153, 164, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = 'rgba(70, 142, 154, 0.2)';
    const bw = cell * 0.16;
    ctx.fillRect(x + cell * 0.16, y + cell * 0.38, bw, cell * 0.34);
    ctx.fillRect(x + cell * 0.5, y + cell * 0.38, bw, cell * 0.34);
    ctx.fillRect(x + cell * 0.78, y + cell * 0.38, bw, cell * 0.34);
  };

  proto.drawRock = function (x, y, c, r) {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const cx = x + cell * 0.5;
    const cy = y + cell * 0.56;
    const R = cell * 0.32;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.65, R * 0.95, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - R, cy + R * 0.45);
    ctx.lineTo(cx - R * 0.82, cy - R * 0.28);
    ctx.lineTo(cx - R * 0.28, cy - R * 0.78);
    ctx.lineTo(cx + R * 0.55, cy - R * 0.62);
    ctx.lineTo(cx + R * 0.92, cy + R * 0.1);
    ctx.lineTo(cx + R * 0.55, cy + R * 0.58);
    ctx.lineTo(cx - R * 0.35, cy + R * 0.66);
    ctx.closePath();
    ctx.fillStyle = '#1a3339';
    ctx.fill();
    ctx.strokeStyle = '#2c5055';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - R * 0.28, cy - R * 0.72);
    ctx.lineTo(cx + R * 0.1, cy - R * 0.08);
    ctx.lineTo(cx + R * 0.52, cy - R * 0.55);
    ctx.strokeStyle = 'rgba(135, 220, 206, 0.22)';
    ctx.stroke();

    const pulse = 0.55 + Math.sin(this.time * 2 + c + r) * 0.2;
    ctx.fillStyle = 'rgba(105, 255, 218, ' + pulse + ')';
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.05, cy - R * 0.4);
    ctx.lineTo(cx + R * 0.35, cy - R * 0.05);
    ctx.lineTo(cx + R * 0.04, cy + R * 0.3);
    ctx.lineTo(cx - R * 0.22, cy - R * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  proto.drawSpawnGate = function (c, r, index) {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const p = this.cellCenter(c, r);
    const pulse = 0.5 + Math.sin(this.time * 2.4 + index * 1.7) * 0.5;

    ctx.save();
    // 向上的紫色光柱，让出生裂隙在深色岩壁上清晰可见。
    const beam = ctx.createLinearGradient(p.x, p.y - cell * 0.8, p.x, p.y + cell * 0.2);
    beam.addColorStop(0, 'rgba(204, 128, 255, 0)');
    beam.addColorStop(0.72, 'rgba(204, 128, 255, ' + (0.18 + pulse * 0.12) + ')');
    beam.addColorStop(1, 'rgba(233, 191, 255, ' + (0.36 + pulse * 0.18) + ')');
    ctx.fillStyle = beam;
    ctx.fillRect(p.x - cell * 0.17, p.y - cell * 0.8, cell * 0.34, cell);

    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cell * 0.8);
    glow.addColorStop(0, 'rgba(205, 126, 255, ' + (0.48 + pulse * 0.2) + ')');
    glow.addColorStop(1, 'rgba(196, 112, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, cell * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0a0411';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + cell * 0.04, cell * 0.34, cell * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(222, 163, 255, ' + (0.8 + pulse * 0.2) + ')';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + cell * 0.04, cell * 0.27, cell * 0.18, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 232, 255, ' + (0.3 + pulse * 0.3) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 向下的箭头：这里就是怪物入口。
    D.chevron(ctx, p.x, p.y + cell * 0.26, Math.PI / 2, cell * 0.1, 'rgba(234, 195, 255, 0.9)', 1.8);

    // 两根门柱
    ctx.fillStyle = '#20303c';
    D.fillRound(ctx, p.x - cell * 0.39, p.y - cell * 0.16, cell * 0.13, cell * 0.44, 3, '#1a2c38');
    D.fillRound(ctx, p.x + cell * 0.26, p.y - cell * 0.16, cell * 0.13, cell * 0.44, 3, '#1a2c38');
    ctx.fillStyle = 'rgba(198, 126, 255, 0.45)';
    ctx.fillRect(p.x - cell * 0.38, p.y - cell * 0.17, cell * 0.11, cell * 0.04);
    ctx.fillRect(p.x + cell * 0.27, p.y - cell * 0.17, cell * 0.11, cell * 0.04);

    ctx.strokeStyle = 'rgba(216, 164, 255, ' + (0.3 + pulse * 0.35) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, cell * (0.24 + pulse * 0.05), 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();
  };

  proto.drawExitGate = function () {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const p = this.cellCenter(MAP.exit.c, MAP.exit.r);
    const pulse = 0.5 + Math.sin(this.time * 2.1) * 0.5;

    ctx.save();
    const glow = ctx.createRadialGradient(p.x, p.y + cell * 0.1, 0, p.x, p.y + cell * 0.1, cell * 0.85);
    glow.addColorStop(0, 'rgba(90, 238, 210, ' + (0.24 + pulse * 0.14) + ')');
    glow.addColorStop(1, 'rgba(90, 238, 210, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - cell, p.y - cell * 0.8, cell * 2, cell * 1.8);

    ctx.strokeStyle = 'rgba(125, 235, 214, ' + (0.45 + pulse * 0.3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - cell * 0.34, p.y - cell * 0.22);
    ctx.lineTo(p.x - cell * 0.34, p.y + cell * 0.3);
    ctx.lineTo(p.x + cell * 0.34, p.y + cell * 0.3);
    ctx.lineTo(p.x + cell * 0.34, p.y - cell * 0.22);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p.x, p.y - cell * 0.4);
    ctx.lineTo(p.x + cell * 0.2, p.y - cell * 0.24);
    ctx.lineTo(p.x + cell * 0.16, p.y + cell * 0.05);
    ctx.quadraticCurveTo(p.x + cell * 0.1, p.y + cell * 0.22, p.x, p.y + cell * 0.3);
    ctx.quadraticCurveTo(p.x - cell * 0.1, p.y + cell * 0.22, p.x - cell * 0.16, p.y + cell * 0.05);
    ctx.lineTo(p.x - cell * 0.2, p.y - cell * 0.24);
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 235, 214, ' + (0.16 + pulse * 0.12) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 255, 240, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(160, 255, 235, 0.8)';
    ctx.fillRect(p.x - cell * 0.5, p.y + cell * 0.39, cell, 2);
    ctx.restore();
  };

  proto.drawFlowPaths = function () {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const alpha = this.run && this.run.waveActive ? 0.16 : 0.34;
    if (!this.flowPaths || !this.flowPaths.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < this.flowPaths.length; i++) {
      const path = this.flowPaths[i];
      if (!path || !path.length) continue;
      const start = MAP.spawns[i];
      const pts = [this.cellCenter(start.c, start.r)];
      for (let j = 0; j < path.length; j++) {
        pts.push(this.cellCenter(path[j].c, path[j].r));
      }
      ctx.beginPath();
      for (let j = 0; j < pts.length; j++) {
        if (j === 0) ctx.moveTo(pts[j].x, pts[j].y);
        else ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.strokeStyle = 'rgba(3, 18, 22, ' + alpha * 0.9 + ')';
      ctx.lineWidth = Math.max(4, cell * 0.13);
      ctx.stroke();
      ctx.setLineDash([cell * 0.1, cell * 0.18]);
      ctx.strokeStyle = 'rgba(125, 235, 214, ' + alpha + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);

      for (let j = 2; j < pts.length - 1; j += 3) {
        const a = pts[j - 1];
        const b = pts[j + 1];
        D.chevron(
          ctx,
          pts[j].x,
          pts[j].y,
          Math.atan2(b.y - a.y, b.x - a.x),
          cell * 0.11,
          'rgba(154, 255, 233, ' + (alpha + 0.13) + ')',
          1.3
        );
      }
    }
    ctx.restore();
  };

  proto.drawBuildHighlights = function () {
    const ctx = this.ctx;
    const cell = this.layout.cell;
    const L = this.layout;
    if (!this.run) return;
    const affordable = this.run.coins >= (TOWERS[this.buildType] || {}).cost;
    for (let r = 1; r < MAP.rows - 1; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (MAP.terrain[r].charAt(c) !== '.') continue;
        if (this.towerAt(c, r) || this.cellHasEnemy(c, r)) continue;
        const x = L.boardX + c * cell;
        const y = L.boardY + r * cell;
        ctx.fillStyle = affordable
          ? 'rgba(125, 235, 214, 0.055)'
          : 'rgba(255, 107, 115, 0.035)';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = affordable
          ? 'rgba(125, 235, 214, 0.14)'
          : 'rgba(255, 107, 115, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      }
    }
  };

  proto.drawGhost = function (c, r) {
    const ctx = this.ctx;
    const L = this.layout;
    const def = TOWERS[this.buildType];
    if (!def || !this.run) return;
    const center = this.cellCenter(c, r);
    const reason = this.cellReason(c, r);
    const affordable = this.run.coins >= def.cost;
    const pathOk = !reason && this.pathStillOpenWithBlock(c, r);
    const valid = !reason && affordable && pathOk;
    const color = valid ? def.color : COLORS.red;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, def.range, 0, Math.PI * 2);
    ctx.fillStyle = D.hexA(color, 0.07);
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = D.hexA(color, 0.55);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.62;
    this.drawTower(
      {
        type: this.buildType,
        x: center.x,
        y: center.y,
        level: 1,
        angle: -Math.PI / 2,
        flash: 0,
        pulse: 0,
      },
      true
    );
    ctx.globalAlpha = 1;

    if (!valid) {
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2.2;
      const s = L.cell * 0.18;
      ctx.beginPath();
      ctx.moveTo(center.x - s, center.y - s);
      ctx.lineTo(center.x + s, center.y + s);
      ctx.moveTo(center.x + s, center.y - s);
      ctx.lineTo(center.x - s, center.y + s);
      ctx.stroke();
    } else {
      D.text(
        ctx,
        '-' + def.cost,
        center.x,
        center.y + L.cell * 0.34,
        9,
        COLORS.gold,
        'center',
        700
      );
    }
    ctx.restore();
  };

  // ==================================================================
  // 防御塔
  // ==================================================================
  proto.drawTowers = function () {
    if (!this.towers || !this.towers.length) return;
    const ctx = this.ctx;
    const L = this.layout;

    if (this.selectedTower) {
      const t = this.selectedTower;
      const stats = this.towerStats(t);
      ctx.save();
      D.roundRectPath(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
      ctx.fillStyle = D.hexA(TOWERS[t.type].color, 0.07);
      ctx.fill();
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = D.hexA(TOWERS[t.type].color, 0.55);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    const sorted = this.towers.slice().sort((a, b) => (a.r - b.r) || (a.c - b.c));
    for (let i = 0; i < sorted.length; i++) {
      this.drawTower(sorted[i], false);
    }
  };

  proto.drawTower = function (t, ghost) {
    const ctx = this.ctx;
    const L = this.layout;
    const def = TOWERS[t.type];
    const base = L.cell * 0.34;
    const x = t.x;
    const y = t.y;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, base * 0.72, base * 0.95, base * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // 底座
    ctx.beginPath();
    ctx.arc(0, 0, base, 0, Math.PI * 2);
    ctx.fillStyle = '#0c2229';
    ctx.fill();
    ctx.strokeStyle = def.dark;
    ctx.lineWidth = Math.max(1.5, base * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, base * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#173a3e';
    ctx.fill();

    const selected = this.selectedTower && this.selectedTower.id === t.id;
    if (selected && !ghost) {
      ctx.beginPath();
      ctx.arc(0, 0, base * 1.18, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 220, 130, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 炮塔主体
    ctx.save();
    ctx.rotate(t.angle || 0);
    if (t.type === 'arrow') {
      ctx.strokeStyle = def.color;
      ctx.lineWidth = Math.max(1.4, base * 0.16);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-base * 0.22, -base * 0.52);
      ctx.quadraticCurveTo(base * 0.36, 0, -base * 0.22, base * 0.52);
      ctx.stroke();
      ctx.strokeStyle = '#e1fff2';
      ctx.lineWidth = Math.max(1.2, base * 0.12);
      ctx.beginPath();
      ctx.moveTo(-base * 0.22, 0);
      ctx.lineTo(base * 0.72, 0);
      ctx.stroke();
      ctx.fillStyle = '#e1fff2';
      ctx.beginPath();
      ctx.moveTo(base * 0.78, 0);
      ctx.lineTo(base * 0.52, -base * 0.16);
      ctx.lineTo(base * 0.52, base * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
    } else if (t.type === 'frost') {
      const spin = this.time * 0.8;
      ctx.strokeStyle = 'rgba(168, 234, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, base * 0.64, base * 0.28, spin, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -base * 0.62);
      ctx.lineTo(base * 0.38, 0);
      ctx.lineTo(0, base * 0.62);
      ctx.lineTo(-base * 0.38, 0);
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, -base * 0.6, 0, base * 0.6);
      fg.addColorStop(0, '#d5fbff');
      fg.addColorStop(1, '#4fb7e8');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(-base * 0.08, -base * 0.2, base * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else {
      D.fillRound(
        ctx,
        -base * 0.28,
        -base * 0.2,
        base * 1.04,
        base * 0.4,
        base * 0.12,
        '#7d4b1d'
      );
      D.fillRound(
        ctx,
        -base * 0.2,
        -base * 0.14,
        base * 0.78,
        base * 0.28,
        base * 0.1,
        def.color
      );
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#2b3d3e';
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(base * 0.72, 0, base * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#3b2a1b';
      ctx.fill();
    }
    ctx.restore();

    if (t.flash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + t.flash * 0.18 + ')';
      ctx.fill();
    }

    if (t.type === 'frost' && t.pulse > 0 && !ghost) {
      const stats = this.towerStats(t);
      ctx.beginPath();
      ctx.arc(0, 0, stats.range * (1.08 - t.pulse * 0.62), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 231, 255, ' + (t.pulse * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 等级点
    if (!ghost) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-base * 0.45 + i * base * 0.45, base * 0.85, base * 0.075, 0, Math.PI * 2);
        ctx.fillStyle = i < t.level ? COLORS.gold : 'rgba(255,255,255,0.16)';
        ctx.fill();
      }
    }

    ctx.restore();
  };

  // ==================================================================
  // 怪物 / 弹道 / 特效
  // ==================================================================
  proto.drawEnemies = function () {
    if (!this.enemies || !this.enemies.length) return;
    const sorted = this.enemies.slice().sort((a, b) => a.pos.y - b.pos.y);
    for (let i = 0; i < sorted.length; i++) {
      if (!sorted[i].dead) this.drawEnemy(sorted[i]);
    }
  };

  proto.drawEnemy = function (e) {
    const ctx = this.ctx;
    const def = e.def;
    const radius = e.radius;
    const spawnScale = e.spawnT < 0.16 ? 0.35 + (e.spawnT / 0.16) * 0.65 : 1;
    const bob = Math.sin(this.time * 8 + e.bobSeed) * 1.3;
    const x = e.pos.x;
    const y = e.pos.y + bob;
    const bodyColor = def.color;
    const dark = def.color2;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(spawnScale, spawnScale);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.92, radius * 0.88, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.type === 'boss') {
      const aura = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (1.35 + aura * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 78, 130, ' + (0.07 + aura * 0.05) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 110, 150, ' + (0.35 + aura * 0.25) + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // 身体
    ctx.beginPath();
    if (e.type === 'tank') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const rx = radius * (i % 2 === 0 ? 1 : 0.92);
        if (i === 0) ctx.moveTo(Math.cos(a) * rx, Math.sin(a) * radius * 0.9);
        else ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * radius * 0.9);
      }
      ctx.closePath();
    } else {
      ctx.ellipse(0, 0, radius, radius * (e.type === 'runner' ? 0.78 : 0.9), 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, radius * 0.3, radius * 0.68, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = D.hexA(dark, 0.55);
    ctx.fill();

    // 角
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.72, -radius * 0.5);
    ctx.lineTo(-radius * 0.38, -radius * 1.18);
    ctx.lineTo(-radius * 0.18, -radius * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(radius * 0.72, -radius * 0.5);
    ctx.lineTo(radius * 0.38, -radius * 1.18);
    ctx.lineTo(radius * 0.18, -radius * 0.55);
    ctx.closePath();
    ctx.fill();

    if (e.type === 'boss') {
      ctx.fillStyle = '#ffd166';
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.55;
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * radius * 0.4, -radius * 0.95);
        ctx.lineTo(Math.sin(a) * radius * 0.5, -radius * 1.5);
        ctx.lineTo(Math.sin(a + 0.16) * radius * 0.5, -radius * 0.98);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 眼睛
    const lookX = Math.cos(e.dir) * radius * 0.12;
    const lookY = Math.sin(e.dir) * radius * 0.1;
    ctx.fillStyle = '#fff8e7';
    ctx.beginPath();
    ctx.arc(-radius * 0.3, -radius * 0.08, radius * 0.22, 0, Math.PI * 2);
    ctx.arc(radius * 0.34, -radius * 0.08, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17252b';
    ctx.beginPath();
    ctx.arc(-radius * 0.3 + lookX, -radius * 0.08 + lookY, radius * 0.1, 0, Math.PI * 2);
    ctx.arc(radius * 0.34 + lookX, -radius * 0.08 + lookY, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();

    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(0.7, e.flash);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.95, radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (e.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(146, 227, 255, 0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (e.hp < e.maxHp || e.type === 'boss') {
      const w = radius * (e.type === 'boss' ? 2.9 : 2.2);
      const h = e.type === 'boss' ? 4.5 : 3;
      const by = e.pos.y - radius * (e.type === 'boss' ? 1.9 : 1.55);
      D.fillRound(ctx, x - w / 2, by, w, h, h / 2, 'rgba(3, 15, 19, 0.75)');
      const ratio = Math.max(0, e.hp / e.maxHp);
      const color = ratio > 0.55 ? '#62e5a4' : ratio > 0.25 ? '#ffd166' : '#ff6b73';
      D.fillRound(ctx, x - w / 2, by, w * ratio, h, h / 2, color);
    }
  };

  proto.drawProjectiles = function () {
    const ctx = this.ctx;
    if (!this.projectiles || !this.projectiles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.dead) continue;
      const ang = p.angle || 0;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      if (p.kind === 'arrow') {
        ctx.strokeStyle = 'rgba(180, 255, 218, 0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - cos * 12, p.y - sin * 12);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = '#e4fff2';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        g.addColorStop(0, 'rgba(255, 213, 130, 0.95)');
        g.addColorStop(1, 'rgba(255, 145, 46, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 180, 80, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - cos * 16, p.y - sin * 16);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  proto.drawParticles = function () {
    const ctx = this.ctx;
    if (!this.particles || !this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  proto.drawFloatingTexts = function () {
    const ctx = this.ctx;
    if (!this.floatingTexts || !this.floatingTexts.length) return;
    ctx.save();
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const f = this.floatingTexts[i];
      const a = Math.max(0, Math.min(1, f.life / f.maxLife));
      ctx.globalAlpha = a;
      ctx.font = D.font(f.size, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  };

  // ==================================================================
  // HUD / 波次栏 / 底栏
  // ==================================================================
  proto.drawHUD = function () {
    const ctx = this.ctx;
    const L = this.layout;
    const run = this.run;
    if (!run) return;

    const topH = L.headerY + L.headerH + 8;
    const bg = ctx.createLinearGradient(0, 0, 0, topH);
    bg.addColorStop(0, 'rgba(3, 12, 18, 0.72)');
    bg.addColorStop(1, 'rgba(3, 12, 18, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.W, topH);

    if (L.headerY - 16 > this.safeTop + 2) {
      ctx.beginPath();
      ctx.arc(L.margin + 4, L.headerY - 14, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
      ctx.fill();
      D.text(
        ctx,
        '最后一道防线',
        L.margin + 12,
        L.headerY - 14,
        9.5,
        'rgba(141, 181, 177, 0.62)',
        'left',
        600
      );
    }

    const y = L.headerY + 8;
    const h = 38;
    const pauseW = 36;
    const pauseX = this.W - L.margin - pauseW;
    const coinW = 84;
    const coinX = pauseX - 6 - coinW;
    const livesW = 76;
    const livesX = L.margin;
    const waveX = livesX + livesW + 7;
    const waveW = coinX - 7 - waveX;

    D.fillRound(ctx, livesX, y, livesW, h, 11, 'rgba(7, 28, 35, 0.86)');
    D.strokeRound(ctx, livesX, y, livesW, h, 11, 'rgba(255, 107, 115, 0.25)', 1);
    const low = run.lives <= 3;
    const pulse = low ? 1 + Math.sin(this.time * 7) * 0.08 : 1;
    ctx.save();
    ctx.translate(livesX + 18, y + h / 2);
    ctx.scale(pulse, pulse);
    D.heartIcon(ctx, 0, 0, 7.5, low ? '#ff5566' : '#ff7d86');
    ctx.restore();
    D.text(ctx, String(run.lives), livesX + 31, y + h / 2 + 0.5, 15, COLORS.text, 'left', 800);
    D.text(ctx, '生命', livesX + 53, y + h / 2 + 1, 8, COLORS.textDim, 'left', 500);

    D.fillRound(ctx, waveX, y, waveW, h, 11, 'rgba(7, 28, 35, 0.86)');
    D.strokeRound(ctx, waveX, y, waveW, h, 11, 'rgba(125, 235, 214, 0.18)', 1);
    const shownWave = run.waveActive
      ? run.waveIndex
      : Math.min(run.waveIndex + 1, WAVES.length);
    D.text(
      ctx,
      '第 ' + shownWave + ' / ' + WAVES.length + ' 波',
      waveX + waveW / 2,
      y + 12,
      11,
      COLORS.text,
      'center',
      700
    );
    const alive = run.waveActive ? run.spawnQueue.length + this.aliveEnemies() : 0;
    const sub = run.waveActive
      ? '剩余 ' + alive + ' 只'
      : run.waveIndex === 0
        ? '准备阶段'
        : run.wavesCleared >= WAVES.length
          ? '全部清除'
          : '准备阶段';
    D.text(
      ctx,
      sub,
      waveX + waveW / 2,
      y + 27,
      8.5,
      run.waveActive ? COLORS.mint : COLORS.textDim,
      'center',
      500
    );

    D.fillRound(ctx, coinX, y, coinW, h, 11, 'rgba(7, 28, 35, 0.86)');
    D.strokeRound(ctx, coinX, y, coinW, h, 11, 'rgba(255, 209, 102, 0.25)', 1);
    ctx.save();
    ctx.translate(coinX + 17, y + h / 2);
    const scale = 1 + this.coinPulse * 0.16;
    ctx.scale(scale, scale);
    D.coinIcon(ctx, 0, 0, 8);
    ctx.restore();
    D.text(
      ctx,
      String(run.coins),
      coinX + 32,
      y + h / 2 + 0.5,
      14,
      COLORS.gold,
      'left',
      800
    );

    D.fillRound(ctx, pauseX, y, pauseW, h, 11, 'rgba(7, 28, 35, 0.86)');
    D.strokeRound(ctx, pauseX, y, pauseW, h, 11, 'rgba(125, 235, 214, 0.2)', 1);
    D.pauseIcon(ctx, pauseX + pauseW / 2, y + h / 2, 7, 'rgba(225, 255, 248, 0.85)');
    this.addButton('pause', pauseX, y, pauseW, h, () => this.pauseGame('button'));
  };

  proto.aliveEnemies = function () {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dead) n++;
    }
    return n;
  };

  proto.drawWaveBar = function () {
    const ctx = this.ctx;
    const L = this.layout;
    const run = this.run;
    if (!run) return;
    const x = L.margin;
    const y = L.waveY;
    const w = this.W - L.margin * 2;
    const h = L.waveH;
    const supplyW = 88;
    const gap = 8;

    if (run.waveActive) {
      const speedW = 48;
      const infoW = w - supplyW - speedW - gap * 2;
      D.fillRound(ctx, x, y, infoW, h, 11, 'rgba(8, 33, 40, 0.9)');
      D.strokeRound(ctx, x, y, infoW, h, 11, 'rgba(125,235,214,0.16)', 1);
      D.text(ctx, '第 ' + run.waveIndex + ' 波 · 进行中', x + 13, y + 14, 11, COLORS.text, 'left', 700);
      D.text(
        ctx,
        '剩余 ' + (run.spawnQueue.length + this.aliveEnemies()) + ' 只',
        x + 13,
        y + 29,
        9,
        COLORS.mint,
        'left',
        500
      );
      const remaining = run.spawnQueue.length + this.aliveEnemies();
      const clearedRatio =
        run.waveTotal > 0 ? 1 - Math.min(1, remaining / run.waveTotal) : 0;
      const barW = infoW - 26;
      D.fillRound(ctx, x + 13, y + h - 5, barW, 2, 1, 'rgba(255,255,255,0.08)');
      D.fillRound(
        ctx,
        x + 13,
        y + h - 5,
        Math.max(2, barW * clearedRatio),
        2,
        1,
        COLORS.mint
      );

      const speedX = x + infoW + gap;
      const speedColor = this.speed === 2 ? COLORS.gold : COLORS.mint;
      D.fillRound(ctx, speedX, y, speedW, h, 11, 'rgba(8, 33, 40, 0.9)');
      D.strokeRound(ctx, speedX, y, speedW, h, 11, D.hexA(speedColor, 0.3), 1);
      D.text(ctx, this.speed + '×', speedX + speedW / 2, y + h / 2, 13, speedColor, 'center', 800);
      this.addButton('speed', speedX, y, speedW, h, () => {
        this.speed = this.speed === 1 ? 2 : 1;
        this.log('speed_toggle', { speed: this.speed });
      });

      this.drawSupplyButton(x + w - supplyW, y, supplyW, h);
    } else {
      const startW = w - supplyW - gap;
      const disabled = run.finishDelay > 0 || run.waveIndex >= WAVES.length;
      const label = disabled
        ? run.finishDelay > 0
          ? '防线守住了'
          : '全部波次完成'
        : '开始第 ' + (run.waveIndex + 1) + ' 波';
      const g = ctx.createLinearGradient(x, y, x + startW, y + h);
      if (disabled) {
        g.addColorStop(0, 'rgba(95, 130, 128, 0.35)');
        g.addColorStop(1, 'rgba(60, 88, 89, 0.35)');
      } else {
        g.addColorStop(0, 'rgba(125, 235, 214, 0.2)');
        g.addColorStop(1, 'rgba(54, 160, 143, 0.16)');
      }
      D.fillRound(ctx, x, y, startW, h, 11, g);
      D.strokeRound(
        ctx,
        x,
        y,
        startW,
        h,
        11,
        disabled ? 'rgba(180, 200, 200, 0.18)' : 'rgba(125, 235, 214, 0.52)',
        1
      );
      if (!disabled) {
        D.playIcon(ctx, x + 20, y + h / 2, 7, COLORS.mint);
      }
      D.text(
        ctx,
        label,
        x + startW / 2 + (disabled ? 0 : 7),
        y + h / 2,
        13,
        disabled ? COLORS.textDim : COLORS.text,
        'center',
        700
      );
      if (!disabled) {
        this.addButton('start_wave', x, y, startW, h, () => this.startWave());
      }
      this.drawSupplyButton(x + w - supplyW, y, supplyW, h);
    }
  };

  proto.drawSupplyButton = function (x, y, w, h) {
    const ctx = this.ctx;
    const run = this.run;
    if (!run) return;
    const used = run.supplyUsed;
    const max = GAME.supplyLimit;
    const disabled = used >= max || this.adBusy;
    const color = disabled ? COLORS.textDim : COLORS.gold;

    D.fillRound(ctx, x, y, w, h, 11, 'rgba(39, 30, 13, 0.76)');
    D.strokeRound(ctx, x, y, w, h, 11, D.hexA(color, disabled ? 0.18 : 0.45), 1);

    ctx.beginPath();
    ctx.arc(x + 18, y + h / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = D.hexA(color, 0.14);
    ctx.fill();
    D.playIcon(ctx, x + 18, y + h / 2, 5.5, color);

    D.text(ctx, this.adBusy ? '连接中' : '补给', x + 32, y + 14, 11, color, 'left', 700);
    D.text(
      ctx,
      disabled && used >= max ? '已领完' : this.adBusy ? '请稍候' : '看视频',
      x + 32,
      y + 28,
      7.8,
      disabled && used >= max ? COLORS.textDim : 'rgba(255, 224, 164, 0.65)',
      'left',
      500
    );
    D.adBadge(ctx, x + w - 26, y + 11, 0.82);
    D.text(ctx, used + '/' + max, x + w - 14, y + 29, 8, 'rgba(255,255,255,0.45)', 'center', 600);
    if (!disabled) {
      this.addButton('supply', x, y, w, h, () => this.requestSupply());
    }
  };

  // ==================================================================
  // 防御塔底栏
  // ==================================================================
  proto.drawDock = function () {
    if (!this.run) return;
    if (this.selectedTower) {
      this.drawTowerPanel();
    } else {
      this.drawTowerCards();
    }
  };

  proto.drawTowerCards = function () {
    const ctx = this.ctx;
    const L = this.layout;
    const gap = 7;
    const totalW = this.W - L.margin * 2;
    const cardW = (totalW - gap * 2) / 3;
    for (let i = 0; i < TOWER_ORDER.length; i++) {
      const type = TOWER_ORDER[i];
      const x = L.margin + i * (cardW + gap);
      this.drawTowerCard(type, x, L.dockY, cardW, L.dockH);
    }
  };

  proto.drawTowerCard = function (type, x, y, w, h) {
    const ctx = this.ctx;
    const def = TOWERS[type];
    const selected = this.buildType === type;
    const affordable = this.run && this.run.coins >= def.cost;
    const pressed = this.pressedButton === 'card_' + type;
    const yOff = pressed ? 2 : 0;

    D.fillRound(
      ctx,
      x,
      y + yOff,
      w,
      h,
      13,
      selected ? 'rgba(25, 76, 69, 0.96)' : 'rgba(8, 34, 41, 0.94)'
    );
    D.strokeRound(
      ctx,
      x,
      y + yOff,
      w,
      h,
      13,
      selected ? def.color : 'rgba(125, 235, 214, 0.16)',
      selected ? 1.8 : 1
    );

    D.towerGlyph(ctx, type, x + 24, y + yOff + 29, 15, affordable ? 1 : 0.45);
    D.text(ctx, def.name, x + 45, y + yOff + 21, 13.5, affordable ? COLORS.text : COLORS.textDim, 'left', 700);

    ctx.fillStyle = D.hexA(def.color, affordable ? 0.14 : 0.06);
    const tagW = D.measure(ctx, def.tag, 8, 600) + 10;
    D.fillRound(ctx, x + 45, y + yOff + 31, tagW, 14, 4, D.hexA(def.color, 0.13));
    D.text(ctx, def.tag, x + 45 + tagW / 2, y + yOff + 38, 8, D.hexA(def.color, affordable ? 0.95 : 0.4), 'center', 600);

    D.coinIcon(ctx, x + 17, y + yOff + h - 17, 6.5, affordable ? 1 : 0.45);
    D.text(
      ctx,
      String(def.cost),
      x + 28,
      y + yOff + h - 16,
      12,
      affordable ? COLORS.gold : 'rgba(255, 209, 102, 0.4)',
      'left',
      800
    );
    D.text(
      ctx,
      selected ? '已选择' : '点选建造',
      x + w - 10,
      y + yOff + h - 16,
      8,
      selected ? def.color : 'rgba(141, 181, 177, 0.55)',
      'right',
      500
    );

    this.addButton('card_' + type, x, y, w, h, () => {
      if (this.buildType === type) {
        this.buildType = null;
        this.dragCell = null;
      } else {
        this.buildType = type;
        this.selectedTower = null;
        this.dragCell = null;
      }
      this.haptic('light');
      this.log('build_select', { type: this.buildType });
    });
  };

  proto.drawTowerPanel = function () {
    const ctx = this.ctx;
    const L = this.layout;
    const t = this.selectedTower;
    if (!t) return;
    const def = TOWERS[t.type];
    const x = L.margin;
    const y = L.dockY;
    const w = this.W - L.margin * 2;
    const h = L.dockH;
    const stats = this.towerStats(t);
    const upCost = this.upgradeCost(t);
    const refund = this.sellValue(t);

    D.fillRound(ctx, x, y, w, h, 13, 'rgba(8, 34, 41, 0.96)');
    D.strokeRound(ctx, x, y, w, h, 13, D.hexA(def.color, 0.38), 1.2);

    D.towerGlyph(ctx, t.type, x + 30, y + 38, 18, 1);
    D.text(ctx, def.name + '  Lv.' + t.level, x + 56, y + 22, 14, COLORS.text, 'left', 800);
    ctx.fillStyle = D.hexA(def.color, 0.14);
    D.fillRound(ctx, x + 56, y + 32, 42, 14, 4, D.hexA(def.color, 0.12));
    D.text(ctx, t.level >= 3 ? '满级' : '可升级', x + 77, y + 39, 8, def.color, 'center', 600);
    D.text(
      ctx,
      '伤害 ' + Math.round(stats.damage) + '   射程 ' + Math.round(stats.range) + '   间隔 ' + stats.cooldown.toFixed(2) + 's',
      x + 56,
      y + 54,
      8.8,
      COLORS.textDim,
      'left',
      500
    );
    D.text(ctx, '点空白处关闭面板', x + 56, y + 70, 7.8, 'rgba(141,181,177,0.5)', 'left', 500);

    const btnW = 88;
    const btnX = x + w - btnW - 9;
    const upY = y + 10;
    const upH = 32;
    const upDisabled = t.level >= 3;
    D.fillRound(
      ctx,
      btnX,
      upY,
      btnW,
      upH,
      9,
      upDisabled ? 'rgba(80, 95, 94, 0.35)' : 'rgba(255, 209, 102, 0.16)'
    );
    D.strokeRound(
      ctx,
      btnX,
      upY,
      btnW,
      upH,
      9,
      upDisabled ? 'rgba(160, 180, 178, 0.2)' : 'rgba(255, 209, 102, 0.5)',
      1
    );
    D.text(
      ctx,
      upDisabled ? '已满级' : '升级 ' + upCost,
      btnX + btnW / 2,
      upY + upH / 2,
      10.5,
      upDisabled ? COLORS.textDim : COLORS.gold,
      'center',
      700
    );
    this.addButton('upgrade', btnX, upY, btnW, upH, () => this.upgradeSelected());

    const sellY = y + 48;
    const sellH = 30;
    D.fillRound(ctx, btnX, sellY, btnW, sellH, 9, 'rgba(255, 107, 115, 0.1)');
    D.strokeRound(ctx, btnX, sellY, btnW, sellH, 9, 'rgba(255, 107, 115, 0.35)', 1);
    D.text(
      ctx,
      '出售 +' + refund,
      btnX + btnW / 2,
      sellY + sellH / 2,
      10,
      '#ff9ba1',
      'center',
      700
    );
    this.addButton('sell', btnX, sellY, btnW, sellH, () => this.sellSelected());
    this.addButton('close_panel', x, y, w - 100, h, () => {
      this.selectedTower = null;
    });
  };

  // ==================================================================
  // 暂停 / 结算
  // ==================================================================
  proto.drawPauseModal = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const run = this.run;
    ctx.fillStyle = 'rgba(2, 10, 14, 0.78)';
    ctx.fillRect(0, 0, W, H);
    this.addButton('pause_block', 0, 0, W, H, () => {});

    const cardW = W - 52;
    const cardH = 330;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2 - 10;
    D.fillRound(ctx, cardX, cardY, cardW, cardH, 22, 'rgba(8, 30, 38, 0.98)');
    D.strokeRound(ctx, cardX, cardY, cardW, cardH, 22, 'rgba(125,235,214,0.3)', 1.2);

    ctx.beginPath();
    ctx.arc(cardX + cardW / 2, cardY + 52, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,235,214,0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,235,214,0.3)';
    ctx.stroke();
    D.pauseIcon(ctx, cardX + cardW / 2, cardY + 52, 11, COLORS.mint);

    D.text(ctx, '暂停', W / 2, cardY + 98, 24, COLORS.text, 'center', 800);
    D.text(
      ctx,
      run
        ? (run.waveIndex > 0 ? '第 ' + run.waveIndex + ' 波' : '准备阶段') +
          ' · 金币 ' + run.coins + ' · 生命 ' + run.lives
        : '',
      W / 2,
      cardY + 126,
      10.5,
      COLORS.textDim,
      'center',
      500
    );

    const btnW = cardW - 48;
    const btnX = cardX + 24;
    const btnH = 46;
    let by = cardY + 152;
    D.fillRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(125,235,214,0.18)');
    D.strokeRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(125,235,214,0.55)', 1);
    D.text(ctx, '继续防守', W / 2, by + btnH / 2, 14, COLORS.mint, 'center', 700);
    this.addButton('resume', btnX, by, btnW, btnH, () => this.resumeGame());

    by += btnH + 10;
    D.fillRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(255, 209, 102, 0.08)');
    D.strokeRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(255, 209, 102, 0.28)', 1);
    D.text(ctx, '重新开始', W / 2, by + btnH / 2, 13, COLORS.gold, 'center', 700);
    this.addButton('pause_restart', btnX, by, btnW, btnH, () => this.startRun());

    by += btnH + 12;
    D.text(ctx, '返回首页', W / 2, by + 10, 11, COLORS.textDim, 'center', 500);
    this.addButton('pause_home', btnX, by - 8, btnW, 36, () => {
      this.returnHome();
    });
  };

  proto.drawResultModal = function () {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const result = this.result;
    if (!result) return;
    const win = result.win;
    const canRevive = !win && result.revives < 1;
    ctx.fillStyle = 'rgba(2, 10, 14, 0.82)';
    ctx.fillRect(0, 0, W, H);
    this.addButton('result_block', 0, 0, W, H, () => {});

    const cardW = W - 34;
    const cardH = canRevive ? 398 : 356;
    const shift = this.ads.hasBanner() ? -28 : 0;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2 + shift;
    D.fillRound(ctx, cardX, cardY, cardW, cardH, 24, 'rgba(8, 30, 38, 0.99)');
    D.strokeRound(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      24,
      win ? 'rgba(125,235,214,0.45)' : 'rgba(255,107,115,0.4)',
      1.4
    );

    const iconY = cardY + 52;
    if (win) {
      D.shieldLogo(ctx, W / 2, iconY, 28);
    } else {
      ctx.beginPath();
      ctx.arc(W / 2, iconY, 27, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 107, 115, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 107, 115, 0.35)';
      ctx.stroke();
      D.heartIcon(ctx, W / 2, iconY + 2, 11, '#ff6b73');
      ctx.strokeStyle = 'rgba(255, 107, 115, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 23, iconY + 23);
      ctx.lineTo(W / 2 + 23, iconY - 23);
      ctx.stroke();
    }

    D.text(ctx, win ? '防线守住了' : '防线失守', W / 2, cardY + 104, 24, win ? COLORS.mint : '#ff8a90', 'center', 800);
    D.text(
      ctx,
      win
        ? '所有波次已清除，最后一道防线仍然屹立'
        : result.wave > 0
          ? '怪物抵达了底部 · 第 ' + result.wave + ' 波'
          : '怪物抵达了底部防线',
      W / 2,
      cardY + 132,
      10,
      COLORS.textDim,
      'center',
      500
    );

    const statY = cardY + 154;
    const colW = cardW / 3;
    const stats = [
      ['抵达波次', result.wave > 0 ? '第 ' + result.wave + ' 波' : '准备阶段'],
      ['击败怪物', String(result.kills)],
      ['获得金币', String(result.coinsEarned)],
    ];
    for (let i = 0; i < stats.length; i++) {
      const cx = cardX + colW * i + colW / 2;
      D.text(ctx, stats[i][1], cx, statY + 13, 17, i === 2 ? COLORS.gold : COLORS.text, 'center', 800);
      D.text(ctx, stats[i][0], cx, statY + 32, 8.5, COLORS.textDim, 'center', 500);
      if (i < 2) {
        ctx.fillStyle = 'rgba(125, 235, 214, 0.1)';
        ctx.fillRect(cardX + colW * (i + 1) - 0.5, statY, 1, 38);
      }
    }

    const record =
      '最佳纪录 第 ' + this.profile.bestWave + ' 波 · 累计击败 ' + this.profile.totalKills;
    D.text(ctx, record, W / 2, cardY + 206, 8.5, 'rgba(141,181,177,0.65)', 'center', 500);

    const btnW = cardW - 52;
    const btnX = cardX + 26;
    const btnH = 46;
    let by = cardY + 222;
    if (canRevive) {
      D.fillRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(255, 209, 102, 0.18)');
      D.strokeRound(ctx, btnX, by, btnW, btnH, 13, 'rgba(255, 209, 102, 0.58)', 1.2);
      D.playIcon(ctx, btnX + 24, by + btnH / 2, 7, COLORS.gold);
      D.text(
        ctx,
        this.adBusy ? '广告播放中…' : '看视频复活',
        W / 2 + 11,
        by + btnH / 2,
        14,
        COLORS.gold,
        'center',
        800
      );
      D.adBadge(ctx, btnX + btnW - 36, by + 12, 0.9);
      if (!this.adBusy && !this.restarting) {
        this.addButton('revive', btnX, by, btnW, btnH, () => this.requestRevive());
      }
      by += btnH + 9;
    }

    D.fillRound(
      ctx,
      btnX,
      by,
      btnW,
      btnH,
      13,
      win || !canRevive ? 'rgba(125, 235, 214, 0.16)' : 'rgba(255, 255, 255, 0.04)'
    );
    D.strokeRound(
      ctx,
      btnX,
      by,
      btnW,
      btnH,
      13,
      win || !canRevive ? 'rgba(125,235,214,0.55)' : 'rgba(125,235,214,0.2)',
      1
    );
    D.text(
      ctx,
      this.restarting ? '正在准备…' : '再来一局',
      W / 2,
      by + btnH / 2,
      13.5,
      win || !canRevive ? COLORS.mint : COLORS.textDim,
      'center',
      700
    );
    if (!this.restarting && !this.adBusy) {
      this.addButton('restart', btnX, by, btnW, btnH, () => this.restartRun());
    }

    by += btnH + 8;
    D.text(ctx, '返回首页', W / 2, by + 15, 10.5, COLORS.textDim, 'center', 500);
    if (!this.restarting && !this.adBusy) {
      this.addButton('result_home', btnX, by - 2, btnW, 32, () => this.returnHome());
    }
  };

  // ==================================================================
  // 模拟广告 / Toast
  // ==================================================================
  proto.drawMockAd = function (mock) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.fillStyle = 'rgba(2, 8, 12, 0.93)';
    ctx.fillRect(0, 0, W, H);

    const cardW = Math.min(330, W - 38);
    const cardH = 356;
    const x = (W - cardW) / 2;
    const y = (H - cardH) / 2;
    D.fillRound(ctx, x, y, cardW, cardH, 22, 'rgba(10, 30, 39, 0.99)');
    D.strokeRound(ctx, x, y, cardW, cardH, 22, 'rgba(255, 209, 102, 0.35)', 1.2);

    D.adBadge(ctx, x + 20, y + 24, 1);
    D.text(ctx, '模拟激励视频', x + 50, y + 24, 11, COLORS.gold, 'left', 700);
    D.text(ctx, 'DEV PREVIEW', x + cardW - 20, y + 24, 8, 'rgba(141,181,177,0.5)', 'right', 600);

    const placement = mock.placement;
    const title = placement === 'supply' ? '金币补给' : placement === 'revive' ? '防线复活' : '广告奖励';
    D.text(ctx, title, W / 2, y + 68, 24, COLORS.text, 'center', 800);
    D.text(
      ctx,
      placement === 'revive' ? '复活后恢复 5 点生命' : '看完获得 ' + GAME.supplyReward + ' 金币',
      W / 2,
      y + 96,
      10.5,
      COLORS.textDim,
      'center',
      500
    );

    const ringY = y + 178;
    const ringR = 54;
    ctx.beginPath();
    ctx.arc(W / 2, ringY, ringR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      W / 2,
      ringY,
      ringR,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, mock.progress)
    );
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    D.playIcon(ctx, W / 2 - 2, ringY - 2, 14, COLORS.gold);
    D.text(ctx, String(mock.remaining), W / 2, ringY + 30, 11, COLORS.gold, 'center', 700);

    const barW = cardW - 72;
    D.fillRound(ctx, x + 36, y + 258, barW, 6, 3, 'rgba(255,255,255,0.08)');
    D.fillRound(
      ctx,
      x + 36,
      y + 258,
      Math.max(3, barW * Math.min(1, mock.progress)),
      6,
      3,
      COLORS.gold
    );
    D.text(
      ctx,
      '广告播放中 · 结束后自动发放',
      W / 2,
      y + 280,
      9.5,
      COLORS.textDim,
      'center',
      500
    );
    D.text(
      ctx,
      '仅开发预览：不会产生真实广告收益',
      W / 2,
      y + cardH - 38,
      8.5,
      'rgba(141,181,177,0.55)',
      'center',
      500
    );
    D.text(
      ctx,
      '正式环境请配置真实激励视频广告位 ID',
      W / 2,
      y + cardH - 22,
      8,
      'rgba(255,209,102,0.5)',
      'center',
      500
    );
  };

  proto.drawToast = function () {
    const toast = this.toast;
    if (!toast) return;
    const remain = toast.until - this.time;
    if (remain <= 0) {
      this.toast = null;
      return;
    }
    const ctx = this.ctx;
    const W = this.W;
    let alpha = 1;
    if (remain < 0.3) alpha = remain / 0.3;
    if (toast.until - this.time > 1.8) alpha = Math.min(1, (toast.until - this.time) / 1.8);
    alpha = Math.max(0, Math.min(1, alpha));

    let size = 11.5;
    let w = D.measure(ctx, toast.text, size, 600) + 30;
    if (w > W - 32) {
      size = 10;
      w = D.measure(ctx, toast.text, size, 600) + 26;
    }
    w = Math.min(w, W - 26);
    const y =
      this.scene === 'playing'
        ? this.layout.boardY + 20
        : Math.max(this.safeTop + 20, this.H * 0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    D.fillRound(ctx, (W - w) / 2, y - 15, w, 30, 15, 'rgba(4, 19, 25, 0.92)');
    D.strokeRound(ctx, (W - w) / 2, y - 15, w, 30, 15, D.hexA(toast.color, 0.45), 1);
    D.text(ctx, toast.text, W / 2, y, size, toast.color, 'center', 700);
    ctx.restore();
  };
}

module.exports = { attach };
