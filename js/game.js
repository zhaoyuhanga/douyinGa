/**
 * 最后一道防线 - 抖音小游戏塔防
 * 核心流程：顶侧刷怪 -> 玩家在草地建塔封路 -> 怪物实时绕行 -> 抵达底部扣生命。
 */
const {
  MAP,
  COLORS,
  TOWERS,
  TOWER_ORDER,
  TOWER_LEVELS,
  ENEMIES,
  WAVES,
  GAME,
} = require('./config');
const { findPath, pathKey } = require('./pathfinding');
const { AdService } = require('./ads');
const AD_CONFIG = require('./ad-config');
const storage = require('./storage');
const renderer = require('./renderer');

const PROFILE_KEY = 'profile_v1';

function nowMs() {
  return Date.now();
}

function getRaf() {
  if (typeof requestAnimationFrame === 'function') {
    return function (cb) {
      requestAnimationFrame(cb);
    };
  }
  return function (cb) {
    setTimeout(function () {
      cb(Date.now());
    }, 16);
  };
}

class Game {
  constructor() {
    this.sys = tt.getSystemInfoSync();
    this.W = Math.max(280, this.sys.windowWidth || 375);
    this.H = Math.max(480, this.sys.windowHeight || 667);
    this.dpr = Math.min(this.sys.pixelRatio || 2, 2.5);
    this.safeTop = this.getSafeTop();
    this.safeBottom = this.getSafeBottom();
    this.menuRect = this.getMenuRect();

    this.canvas = tt.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.imageSmoothingEnabled = true;

    this.ads = new AdService(AD_CONFIG);
    this.profile = Object.assign(
      { bestWave: 0, totalKills: 0, runs: 0, wins: 0 },
      storage.get(PROFILE_KEY, {})
    );

    this.scene = 'home';
    this.modal = null;
    this.helpOpen = false;
    this.run = null;
    this.result = null;
    this.towers = [];
    this.towerMap = {};
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.flowPaths = [];
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.speed = 1;
    this.toast = null;
    this.buttons = [];
    this.pressedButton = null;
    this.coinPulse = 0;
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.paused = false;
    this.adBusy = false;
    this.restarting = false;
    this.navToken = 0;
    this.runToken = 0;
    this._lastTs = 0;
    this._lastTap = 0;
    this._enemyId = 0;
    this._towerId = 0;

    this.layout = this.computeLayout();
    this._bgGrad = null;
    this.buildBackgroundGradient();

    this.bindEvents();
    this.installAutomation();
    this.log('boot', {
      width: Math.round(this.W),
      height: Math.round(this.H),
      dpr: this.dpr,
      safeTop: this.safeTop,
      safeBottom: this.safeBottom,
    });
    this.ads.showBanner(this.getBannerLayout());

    this._tick = this.tick.bind(this);
    this._lastTs = nowMs();
    getRaf()(this._tick);
  }

  getSafeTop() {
    const area = this.sys.safeArea;
    const status = this.sys.statusBarHeight || 0;
    if (area && typeof area.top === 'number' && area.top > 0) {
      return Math.max(6, area.top, status);
    }
    return Math.max(10, status || 20);
  }

  getSafeBottom() {
    const area = this.sys.safeArea;
    if (
      area &&
      typeof area.bottom === 'number' &&
      area.bottom > 0 &&
      area.bottom <= this.H
    ) {
      return Math.max(0, this.H - area.bottom);
    }
    return 0;
  }

  getMenuRect() {
    try {
      if (typeof tt.getMenuButtonBoundingClientRect === 'function') {
        const r = tt.getMenuButtonBoundingClientRect();
        if (r && r.width > 0 && r.bottom > 0) return r;
      }
    } catch (e) {
      // 部分基础库不支持胶囊位置，回退到 safeArea。
    }
    return null;
  }

  computeLayout() {
    const W = this.W;
    const H = this.H;
    const margin = Math.max(8, Math.round(W * 0.024));
    // 抖音右上角有系统胶囊菜单，HUD 必须整体避开它。
    const menuBottom = this.menuRect && this.menuRect.bottom > 0 ? this.menuRect.bottom : 0;
    const headerY = Math.max(this.safeTop + 4, menuBottom > 0 ? menuBottom + 4 : 0);
    const headerH = 54;
    const dockH = 88;
    const waveH = 42;
    const gap = 8;
    const dockBottom = H - this.safeBottom - 8;
    const dockY = dockBottom - dockH;
    const waveY = dockY - gap - waveH;
    const boardTopMin = headerY + headerH + gap;
    const boardBottomMax = waveY - gap;
    const availableH = Math.max(120, boardBottomMax - boardTopMin);

    let cell = Math.min((W - margin * 2) / MAP.cols, 46);
    if (cell * MAP.rows > availableH) cell = availableH / MAP.rows;
    cell = Math.max(18, cell);

    const boardW = cell * MAP.cols;
    const boardH = cell * MAP.rows;
    const boardX = (W - boardW) / 2;
    const boardY =
      boardTopMin + Math.max(0, (availableH - boardH) / 2);

    return {
      W,
      H,
      margin,
      headerY,
      headerH,
      boardX,
      boardY,
      boardW,
      boardH,
      cell,
      waveY,
      waveH,
      dockY,
      dockH,
      dockBottom,
      safeBottom: this.safeBottom,
      safeTop: this.safeTop,
    };
  }

  buildBackgroundGradient() {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#071722');
    g.addColorStop(0.48, '#0a252d');
    g.addColorStop(1, '#051018');
    this._bgGrad = g;
  }

  handleResize() {
    try {
      this.sys = tt.getSystemInfoSync();
      this.W = Math.max(280, this.sys.windowWidth || this.W);
      this.H = Math.max(480, this.sys.windowHeight || this.H);
      this.dpr = Math.min(this.sys.pixelRatio || 2, 2.5);
      this.safeTop = this.getSafeTop();
      this.safeBottom = this.getSafeBottom();
      this.menuRect = this.getMenuRect();
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.ctx.imageSmoothingEnabled = true;
      this.layout = this.computeLayout();
      this.buildBackgroundGradient();
      if (this.run) {
        this.towers.forEach((t) => {
          const p = this.cellCenter(t.c, t.r);
          t.x = p.x;
          t.y = p.y;
        });
        this.enemies.forEach((e) => {
          if (e.dead) return;
          const p = this.cellCenter(e.cell.c, e.cell.r);
          e.pos.x = p.x;
          e.pos.y = p.y;
        });
      }
      this.log('resize', { width: Math.round(this.W), height: Math.round(this.H) });
    } catch (e) {
      this.log('resize_error', { error: e && e.message });
    }
  }

  bindEvents() {
    if (typeof tt.onTouchStart === 'function') {
      tt.onTouchStart((e) => this.onTouchStart(e));
      tt.onTouchMove((e) => this.onTouchMove(e));
      tt.onTouchEnd((e) => this.onTouchEnd(e));
      if (typeof tt.onTouchCancel === 'function') {
        tt.onTouchCancel(() => {
          this.dragCell = null;
          this.pressedButton = null;
        });
      }
    }
    if (typeof tt.onHide === 'function') {
      tt.onHide(() => {
        if (this.scene === 'playing' && !this.modal && !this.adBusy && this.run) {
          this.pauseGame('hide');
        }
      });
    }
    if (typeof tt.onWindowResize === 'function') {
      tt.onWindowResize(() => this.handleResize());
    }
  }

  // ------------------------------------------------------------------
  // 入口与场景
  // ------------------------------------------------------------------
  startRun() {
    this.navToken += 1;
    this.runToken = this.navToken;
    this.scene = 'playing';
    this.modal = null;
    this.helpOpen = false;
    this.paused = false;
    this.restarting = false;
    this.adBusy = false;
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.result = null;
    this.speed = 1;
    this.shake = 0;
    this.flash = 0;
    this.toast = null;
    this.towers = [];
    this.towerMap = {};
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this._enemyId = 0;
    this._towerId = 0;
    this.ads.hideBanner();

    this.run = {
      coins: GAME.startingCoins,
      lives: GAME.maxLives,
      maxLives: GAME.maxLives,
      waveIndex: 0,
      wavesCleared: 0,
      waveActive: false,
      waveTime: 0,
      waveLeaks: 0,
      waveTotal: 0,
      currentWave: null,
      spawnQueue: [],
      finishDelay: 0,
      kills: 0,
      leaks: 0,
      coinsEarned: 0,
      supplyUsed: 0,
      revives: 0,
      over: false,
      startedAt: nowMs(),
    };
    this.updateFlowPaths();
    this.log('run_start', { coins: this.run.coins, lives: this.run.lives });
    this.showToast('在草地建塔封路，怪物会自动绕行', COLORS.mint, 3.2);
  }

  returnHome() {
    this.navToken += 1;
    this.runToken = this.navToken;
    this.scene = 'home';
    this.modal = null;
    this.helpOpen = false;
    this.run = null;
    this.result = null;
    this.restarting = false;
    this.adBusy = false;
    this.paused = false;
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.ads.hideBanner();
    this.ads.showBanner(this.getBannerLayout());
    this.log('return_home', {});
  }

  showHelp() {
    this.helpOpen = true;
    this.ads.hideBanner();
    this.log('help_open', {});
  }

  closeHelp() {
    this.helpOpen = false;
    if (this.scene === 'home') this.ads.showBanner(this.getBannerLayout());
    this.log('help_close', {});
  }

  pauseGame(reason) {
    if (this.scene !== 'playing' || !this.run || this.run.over) return;
    if (this.modal) return;
    this.modal = 'pause';
    this.paused = true;
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.ads.hideBanner();
    this.log('pause', { reason: reason || 'button' });
  }

  resumeGame() {
    if (this.modal !== 'pause') return;
    this.modal = null;
    this.paused = false;
    this.log('resume', {});
  }

  finishRun(win) {
    if (!this.run || this.run.over) return;
    this.run.over = true;
    this.modal = 'result';
    this.paused = true;
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.toast = null;

    const result = {
      win: !!win,
      wave: this.run.waveIndex,
      wavesCleared: this.run.wavesCleared,
      kills: this.run.kills,
      leaks: this.run.leaks,
      coinsEarned: this.run.coinsEarned,
      revives: this.run.revives,
      supplyUsed: this.run.supplyUsed,
      duration: Math.max(1, Math.round((nowMs() - this.run.startedAt) / 1000)),
    };
    this.result = result;

    this.profile.runs += 1;
    if (win) this.profile.wins += 1;
    this.profile.bestWave = Math.max(this.profile.bestWave, result.wave);
    this.profile.totalKills += result.kills;
    storage.set(PROFILE_KEY, this.profile);

    this.ads.showBanner(this.getBannerLayout());
    this.log('run_end', {
      win: !!win,
      wave: result.wave,
      kills: result.kills,
      coins: result.coinsEarned,
      revives: result.revives,
    });
  }

  // ------------------------------------------------------------------
  // 输入
  // ------------------------------------------------------------------
  getPoint(e) {
    if (!e) return null;
    const list =
      e.touches && e.touches.length
        ? e.touches
        : e.changedTouches && e.changedTouches.length
          ? e.changedTouches
          : null;
    if (!list) return null;
    const t = list[0];
    const x = typeof t.clientX === 'number' ? t.clientX : t.x;
    const y = typeof t.clientY === 'number' ? t.clientY : t.y;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return { x, y };
  }

  onTouchStart(e) {
    if (this.adBusy || this.restarting) return;
    if (this.ads.getMockState()) return;
    const p = this.getPoint(e);
    if (!p) return;
    const t = nowMs();
    if (t - this._lastTap < 90) return;
    this._lastTap = t;

    const btn = this.hitButton(p.x, p.y);
    if (btn) {
      this.pressedButton = btn.id;
      if (typeof btn.action === 'function') {
        try {
          btn.action();
        } catch (err) {
          this.log('button_error', { id: btn.id, error: err && err.message });
        }
      }
      return;
    }
    if (this.scene === 'playing' && !this.modal && this.run && !this.run.over) {
      this.onBoardDown(p.x, p.y);
    }
  }

  onTouchMove(e) {
    if (!this.buildType || !this.run || this.modal || this.adBusy) return;
    const p = this.getPoint(e);
    if (!p) return;
    const cell = this.pointToCell(p.x, p.y);
    this.dragCell = cell;
  }

  onTouchEnd() {
    const cell = this.dragCell;
    const type = this.buildType;
    this.pressedButton = null;
    this.dragCell = null;
    if (!cell || !type || !this.run || this.modal || this.run.over) return;
    const res = this.placeTower(type, cell.c, cell.r, { fromUI: true });
    if (!res.ok) this.toastPlaceFailure(res.reason, type);
  }

  onBoardDown(x, y) {
    const cell = this.pointToCell(x, y);
    if (!cell) return;
    const existing = this.towerAt(cell.c, cell.r);
    if (existing) {
      this.selectedTower = existing;
      this.buildType = null;
      this.dragCell = null;
      this.log('tower_select', { c: cell.c, r: cell.r, level: existing.level });
      return;
    }
    if (this.buildType) {
      this.selectedTower = null;
      this.dragCell = cell;
      return;
    }
    this.selectedTower = null;
    this.dragCell = null;
  }

  pointToCell(x, y) {
    const L = this.layout;
    if (
      x < L.boardX ||
      y < L.boardY ||
      x >= L.boardX + L.boardW ||
      y >= L.boardY + L.boardH
    ) {
      return null;
    }
    const c = Math.floor((x - L.boardX) / L.cell);
    const r = Math.floor((y - L.boardY) / L.cell);
    if (c < 0 || c >= MAP.cols || r < 0 || r >= MAP.rows) return null;
    return { c, r };
  }

  hitButton(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  }

  addButton(id, x, y, w, h, action, opts) {
    this.buttons.push({
      id,
      x,
      y,
      w,
      h,
      action,
      disabled: !!(opts && opts.disabled),
    });
  }

  cellCenter(c, r) {
    const L = this.layout;
    return {
      x: L.boardX + (c + 0.5) * L.cell,
      y: L.boardY + (r + 0.5) * L.cell,
    };
  }

  towerAt(c, r) {
    return this.towerMap[r * MAP.cols + c] || null;
  }

  // ------------------------------------------------------------------
  // 寻路与建塔
  // ------------------------------------------------------------------
  isBlocked(c, r) {
    if (c < 0 || c >= MAP.cols || r < 0 || r >= MAP.rows) return true;
    // 顶行是岩壁，只有出生裂隙可以通行；底行是防线，只有基地门可以进入。
    if (r === 0) {
      for (let i = 0; i < MAP.spawns.length; i++) {
        if (MAP.spawns[i].c === c) return false;
      }
      return true;
    }
    if (r === MAP.rows - 1) return c !== MAP.exit.c;
    if (MAP.terrain[r].charAt(c) === '#') return true;
    return !!this.towerMap[r * MAP.cols + c];
  }

  computePathFrom(cell) {
    return findPath(
      MAP.cols,
      MAP.rows,
      (c, r) => this.isBlocked(c, r),
      { c: cell.c, r: cell.r },
      MAP.exit
    );
  }

  updateFlowPaths() {
    this.flowPaths = MAP.spawns.map((s) => {
      return (
        findPath(
          MAP.cols,
          MAP.rows,
          (c, r) => this.isBlocked(c, r),
          { c: s.c, r: s.r },
          MAP.exit
        ) || []
      );
    });
  }

  pathSignature() {
    return this.flowPaths.map((p) => pathKey(p)).join('|');
  }

  cellHasEnemy(c, r) {
    const center = this.cellCenter(c, r);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (e.cell.c === c && e.cell.r === r) return true;
      if (e.path && e.path.length) {
        const n = e.path[0];
        if (n.c === c && n.r === r) return true;
      }
      if (
        Math.abs(e.pos.x - center.x) < this.layout.cell * 0.42 &&
        Math.abs(e.pos.y - center.y) < this.layout.cell * 0.42
      ) {
        return true;
      }
    }
    return false;
  }

  cellReason(c, r) {
    if (c < 0 || c >= MAP.cols || r < 0 || r >= MAP.rows) return 'border';
    if (r === 0 || r === MAP.rows - 1) return 'border';
    if (MAP.terrain[r].charAt(c) !== '.') return 'terrain';
    if (this.towerAt(c, r)) return 'occupied';
    if (this.cellHasEnemy(c, r)) return 'enemy';
    return '';
  }

  isCellBuildable(c, r) {
    return !this.cellReason(c, r);
  }

  pathStillOpenWithBlock(c, r) {
    const blockKey = r * MAP.cols + c;
    const blocked = (cc, rr) => {
      if (rr * MAP.cols + cc === blockKey) return true;
      return this.isBlocked(cc, rr);
    };
    for (let i = 0; i < MAP.spawns.length; i++) {
      const s = MAP.spawns[i];
      if (!findPath(MAP.cols, MAP.rows, blocked, s, MAP.exit)) return false;
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      let start = { c: e.cell.c, r: e.cell.r };
      if (e.path && e.path.length) {
        const n = e.path[0];
        if (n.c === c && n.r === r) return false;
        const np = this.cellCenter(n.c, n.r);
        const d = Math.hypot(e.pos.x - np.x, e.pos.y - np.y);
        if (d < this.layout.cell * 0.5) start = { c: n.c, r: n.r };
      }
      if (start.c === c && start.r === r) return false;
      if (!findPath(MAP.cols, MAP.rows, blocked, start, MAP.exit)) return false;
    }
    return true;
  }

  placeTower(type, c, r, opts) {
    opts = opts || {};
    if (!this.run || this.run.over) return { ok: false, reason: 'state' };
    const def = TOWERS[type];
    if (!def) return { ok: false, reason: 'type' };
    c = Math.round(c);
    r = Math.round(r);
    const reason = this.cellReason(c, r);
    if (reason) return { ok: false, reason };
    if (!opts.free && this.run.coins < def.cost) {
      return { ok: false, reason: 'coins' };
    }
    if (!this.pathStillOpenWithBlock(c, r)) {
      return { ok: false, reason: 'block' };
    }

    const signatureBefore = this.pathSignature();
    const cost = opts.free ? 0 : def.cost;
    if (!opts.free) this.run.coins -= cost;

    const center = this.cellCenter(c, r);
    const tower = {
      id: ++this._towerId,
      type,
      c,
      r,
      x: center.x,
      y: center.y,
      level: 1,
      cd: 0.1,
      angle: -Math.PI / 2,
      flash: 0,
      pulse: 0,
      invested: def.cost,
    };
    this.towers.push(tower);
    this.towerMap[r * MAP.cols + c] = tower;
    this.updateFlowPaths();
    this.recomputeEnemyPaths();

    const rerouted = signatureBefore !== this.pathSignature();
    this.spawnBuildParticles(center.x, center.y, def.color);
    this.coinPulse = Math.max(this.coinPulse, 0.5);
    this.haptic('light');
    if (opts.fromUI) {
      if (rerouted) {
        this.showToast('路线已改写 · 怪物正在绕行', COLORS.mint, 2.0);
      } else {
        this.showToast(def.name + '已就位', def.color, 1.4);
      }
    }
    this.log('tower_place', {
      type,
      c,
      r,
      cost,
      rerouted,
      paths: this.flowPaths.map((p) => (p ? p.length : -1)),
      coins: this.run.coins,
    });
    return { ok: true, tower, rerouted };
  }

  toastPlaceFailure(reason, type) {
    const def = TOWERS[type];
    if (reason === 'coins') {
      this.showToast('金币不足，还差 ' + Math.max(0, def.cost - this.run.coins), COLORS.gold, 1.8);
    } else if (reason === 'block') {
      this.showToast('不能封死通往底部的路', COLORS.red, 1.9);
    } else if (reason === 'enemy') {
      this.showToast('怪物正在经过这里', COLORS.red, 1.6);
    } else if (reason === 'occupied') {
      this.showToast('这里已经有防御塔了', COLORS.textDim, 1.6);
    } else if (reason === 'terrain' || reason === 'border') {
      this.showToast('这里不能建塔', COLORS.textDim, 1.6);
    } else {
      this.showToast('暂时无法建塔', COLORS.textDim, 1.6);
    }
  }

  recomputeEnemyPaths() {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      let start = { c: e.cell.c, r: e.cell.r };
      if (e.path && e.path.length) {
        const n = e.path[0];
        const np = this.cellCenter(n.c, n.r);
        const d = Math.hypot(e.pos.x - np.x, e.pos.y - np.y);
        if (d < this.layout.cell * 0.55) start = { c: n.c, r: n.r };
      }
      const p = this.computePathFrom(start);
      if (p) {
        e.path = p;
        e.repathFlash = 1;
      } else {
        this.log('enemy_no_path', { type: e.type, cell: e.cell });
      }
    }
  }

  // ------------------------------------------------------------------
  // 波次与战斗
  // ------------------------------------------------------------------
  startWave() {
    if (!this.run || this.run.over || this.run.waveActive) return;
    if (this.run.waveIndex >= WAVES.length) return;
    const wave = WAVES[this.run.waveIndex];
    this.run.waveIndex += 1;
    this.run.waveActive = true;
    this.run.waveTime = 0;
    this.run.waveLeaks = 0;
    this.run.currentWave = wave;
    this.run.spawnQueue = this.buildSpawnQueue(wave);
    this.run.waveTotal = this.run.spawnQueue.length;
    this.buildType = null;
    this.selectedTower = null;
    this.dragCell = null;
    this.showToast(wave.name, COLORS.gold, 2.1);
    this.log('wave_start', {
      wave: this.run.waveIndex,
      count: this.run.spawnQueue.length,
      groups: wave.groups.length,
    });
  }

  buildSpawnQueue(wave) {
    const queue = [];
    let alternate = 0;
    for (let g = 0; g < wave.groups.length; g++) {
      const group = wave.groups[g];
      for (let i = 0; i < group.count; i++) {
        const gate =
          typeof group.gate === 'number'
            ? group.gate
            : alternate++ % MAP.spawns.length;
        queue.push({
          time: (group.start || 0) + i * group.interval,
          type: group.type,
          gate,
        });
      }
    }
    queue.sort((a, b) => a.time - b.time);
    return queue;
  }

  spawnEnemy(type, gate, waveNumber) {
    const def = ENEMIES[type];
    if (!def) return;
    const spawn = MAP.spawns[gate % MAP.spawns.length];
    const center = this.cellCenter(spawn.c, spawn.r);
    const w = waveNumber || 1;
    const late = Math.max(0, w - 10) * GAME.enemyHpLateGrowth;
    const hpScale = 1 + GAME.enemyHpGrowth * (w - 1) + late;
    const speedScale = 1 + Math.min(0.18, (w - 1) * 0.006);
    const enemy = {
      id: ++this._enemyId,
      type,
      def,
      cell: { c: spawn.c, r: spawn.r },
      pos: { x: center.x, y: center.y },
      path: [],
      hp: Math.round(def.hp * hpScale),
      maxHp: Math.round(def.hp * hpScale),
      speed: def.speed * speedScale,
      reward: def.reward + Math.floor(w / 3),
      damage: def.damage,
      radius: def.radius,
      armor: def.armor || 0,
      slowTimer: 0,
      slowFactor: 1,
      flash: 0,
      spawnT: 0,
      dead: false,
      reached: false,
      dir: Math.PI / 2,
      bobSeed: Math.random() * 10,
      offX: (Math.random() - 0.5) * this.layout.cell * 0.22,
      offY: (Math.random() - 0.5) * this.layout.cell * 0.22,
      damageTaken: 0,
    };
    enemy.path = this.computePathFrom(enemy.cell) || [];
    this.enemies.push(enemy);
    this.spawnPortalParticles(center.x, center.y, def.color);
    if (def.key === 'boss') {
      this.showToast('首领出现 · 守住底线', COLORS.red, 2.0);
      this.shake = Math.max(this.shake, 5);
      this.log('boss_spawn', { wave: w });
    }
  }

  update(dt) {
    if (!this.run || this.run.over) return;
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateTowerVisuals(dt);

    if (this.run.finishDelay > 0) {
      this.run.finishDelay -= dt;
      if (this.run.finishDelay <= 0) this.finishRun(true);
      return;
    }
    if (!this.run.waveActive) return;

    this.run.waveTime += dt;
    while (
      this.run.spawnQueue.length &&
      this.run.spawnQueue[0].time <= this.run.waveTime
    ) {
      const item = this.run.spawnQueue.shift();
      this.spawnEnemy(item.type, item.gate, this.run.waveIndex);
    }

    this.updateEnemies(dt);
    if (this.run.over) return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.cleanupDead();
    this.checkWaveClear();
  }

  updateEnemies(dt) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      e.spawnT += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) {
          e.slowTimer = 0;
          e.slowFactor = 1;
        }
      }
      if (e.repathFlash > 0) e.repathFlash = Math.max(0, e.repathFlash - dt * 2);

      const speed = e.speed * (e.slowTimer > 0 ? e.slowFactor : 1);
      let remain = speed * dt;
      let guard = 0;
      while (remain > 0 && !e.dead && guard++ < 8) {
        if (!e.path || !e.path.length) {
          e.path = this.computePathFrom(e.cell);
          if (!e.path || !e.path.length) break;
        }
        const next = e.path[0];
        const tp = this.cellCenter(next.c, next.r);
        const tx = tp.x + e.offX;
        const ty = tp.y + e.offY;
        const dx = tx - e.pos.x;
        const dy = ty - e.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) e.dir = Math.atan2(dy, dx);
        if (dist <= remain) {
          e.pos.x = tx;
          e.pos.y = ty;
          e.cell = { c: next.c, r: next.r };
          e.path.shift();
          remain -= dist;
          if (e.cell.c === MAP.exit.c && e.cell.r === MAP.exit.r) {
            this.leakEnemy(e);
            break;
          }
        } else {
          e.pos.x += (dx / dist) * remain;
          e.pos.y += (dy / dist) * remain;
          remain = 0;
        }
      }
    }
  }

  leakEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.reached = true;
    this.run.leaks += 1;
    this.run.waveLeaks += 1;
    this.run.lives = Math.max(0, this.run.lives - enemy.damage);
    this.shake = Math.min(16, this.shake + 7);
    this.flash = Math.min(0.55, this.flash + 0.32);
    const p = this.cellCenter(MAP.exit.c, MAP.exit.r);
    this.spawnLeakParticles(p.x, p.y);
    this.addFloatingText(p.x, p.y - this.layout.cell * 0.55, '-' + enemy.damage, COLORS.red, 16);
    this.log('leak', {
      type: enemy.type,
      damage: enemy.damage,
      lives: this.run.lives,
      wave: this.run.waveIndex,
    });
    this.haptic('heavy');
    if (this.run.lives <= 0) this.finishRun(false);
  }

  updateTowerVisuals(dt) {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 6);
      if (t.pulse > 0) t.pulse = Math.max(0, t.pulse - dt * 2.2);
    }
  }

  updateTowers(dt) {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      t.cd -= dt;
      if (t.cd > 0) continue;
      const stats = this.towerStats(t);
      if (t.type === 'frost') {
        const hits = [];
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          if (e.dead) continue;
          if (this.dist(t.x, t.y, e.pos.x, e.pos.y) <= stats.range + e.radius * 0.3) {
            hits.push(e);
          }
        }
        if (hits.length) {
          t.pulse = 1;
          t.flash = 1;
          t.cd = stats.cooldown;
          for (let j = 0; j < hits.length; j++) {
            const e = hits[j];
            e.slowTimer = Math.max(e.slowTimer, stats.slowTime);
            e.slowFactor = Math.min(e.slowFactor, stats.slowFactor);
            this.damageEnemy(e, stats.damage);
          }
          this.spawnFrostParticles(t.x, t.y, stats.range);
        } else {
          t.cd = 0.12;
        }
        continue;
      }

      const target = this.pickTarget(t, stats);
      if (!target) {
        t.cd = 0.08;
        continue;
      }
      const angle = Math.atan2(target.pos.y - t.y, target.pos.x - t.x);
      t.angle = angle;
      t.flash = 1;
      t.cd = stats.cooldown;
      this.projectiles.push({
        kind: t.type,
        x: t.x + Math.cos(angle) * this.layout.cell * 0.22,
        y: t.y + Math.sin(angle) * this.layout.cell * 0.22,
        target,
        speed: TOWERS[t.type].projectileSpeed,
        damage: stats.damage,
        splash: stats.splash || 0,
        color: TOWERS[t.type].color,
        age: 0,
        dead: false,
        angle,
      });
      this.spawnMuzzleParticles(t.x, t.y, angle, TOWERS[t.type].color);
    }
  }

  towerStats(tower) {
    const def = TOWERS[tower.type];
    const idx = Math.max(0, Math.min(2, tower.level - 1));
    return {
      damage: def.damage * TOWER_LEVELS.damage[idx],
      range: def.range * TOWER_LEVELS.range[idx],
      cooldown: def.cooldown / TOWER_LEVELS.rate[idx],
      splash: def.splash ? def.splash * (1 + idx * 0.12) : 0,
      slowFactor: def.slowFactor || 1,
      slowTime: def.slowTime || 0,
    };
  }

  pickTarget(tower, stats) {
    let best = null;
    let bestScore = Infinity;
    if (tower.type === 'cannon') {
      let bestCount = -1;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        if (this.dist(tower.x, tower.y, e.pos.x, e.pos.y) > stats.range + e.radius * 0.3) {
          continue;
        }
        let count = 0;
        for (let j = 0; j < this.enemies.length; j++) {
          const o = this.enemies[j];
          if (o.dead) continue;
          if (this.dist(e.pos.x, e.pos.y, o.pos.x, o.pos.y) <= stats.splash) count++;
        }
        const score = count * 1000 - (e.path ? e.path.length : 99) * 2;
        if (score > bestCount) {
          bestCount = score;
          best = e;
        }
      }
      return best;
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const d = this.dist(tower.x, tower.y, e.pos.x, e.pos.y);
      if (d > stats.range + e.radius * 0.3) continue;
      const score = (e.path ? e.path.length : 99) * 1000 + d;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  updateProjectiles(dt) {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.dead) continue;
      p.age += dt;
      if (p.age > 4) {
        p.dead = true;
        continue;
      }
      const targetAlive = p.target && !p.target.dead;
      if (!targetAlive) {
        if (p.kind === 'cannon') {
          this.explodeProjectile(p);
        }
        p.dead = true;
        continue;
      }
      const tx = p.target.pos.x;
      const ty = p.target.pos.y;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.angle = Math.atan2(dy, dx);
      if (d <= step + 6) {
        p.x = tx;
        p.y = ty;
        this.impactProjectile(p);
        p.dead = true;
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  impactProjectile(p) {
    if (p.kind === 'cannon') {
      this.explodeProjectile(p);
    } else if (p.target && !p.target.dead) {
      this.damageEnemy(p.target, p.damage);
      this.spawnHitParticles(p.x, p.y, p.color, 4);
    }
  }

  explodeProjectile(p) {
    this.spawnExplosionParticles(p.x, p.y);
    this.shake = Math.max(this.shake, 2.5);
    const radius = p.splash || 36;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (this.dist(p.x, p.y, e.pos.x, e.pos.y) <= radius + e.radius * 0.4) {
        this.damageEnemy(e, p.damage);
      }
    }
  }

  damageEnemy(enemy, rawDamage) {
    if (!enemy || enemy.dead) return;
    const damage = rawDamage * (1 - (enemy.armor || 0));
    enemy.hp -= damage;
    enemy.damageTaken += damage;
    enemy.flash = 1;
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.hp = 0;
    this.run.kills += 1;
    this.run.coins += enemy.reward;
    this.run.coinsEarned += enemy.reward;
    this.coinPulse = 1;
    this.spawnDeathParticles(enemy.pos.x, enemy.pos.y, enemy.def.color);
    this.addFloatingText(
      enemy.pos.x,
      enemy.pos.y - enemy.radius * 1.3,
      '+' + enemy.reward,
      COLORS.gold,
      12
    );
    if (enemy.type === 'boss') {
      this.showToast('首领击破 +' + enemy.reward + ' 金币', COLORS.gold, 2.0);
      this.shake = Math.max(this.shake, 7);
      this.log('boss_kill', { wave: this.run.waveIndex, coins: this.run.coins });
    }
  }

  cleanupDead() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  checkWaveClear() {
    if (!this.run.waveActive) return;
    if (this.run.spawnQueue.length) return;
    for (let i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dead) return;
    }
    this.completeWave();
  }

  completeWave() {
    if (!this.run || !this.run.waveActive) return;
    const wave = this.run.currentWave || WAVES[this.run.waveIndex - 1];
    this.run.waveActive = false;
    this.run.wavesCleared += 1;
    let bonus = wave ? wave.bonus : 40;
    let perfect = false;
    if (this.run.waveLeaks === 0 && this.run.lives < this.run.maxLives) {
      this.run.lives += 1;
      perfect = true;
    }
    this.run.coins += bonus;
    this.run.coinsEarned += bonus;
    this.coinPulse = 1;
    this.showToast(
      '第 ' + this.run.waveIndex + ' 波清除  +' + bonus + ' 金币' + (perfect ? '  +1 生命' : ''),
      COLORS.gold,
      2.3
    );
    this.log('wave_clear', {
      wave: this.run.waveIndex,
      bonus,
      perfect,
      lives: this.run.lives,
      coins: this.run.coins,
    });
    if (this.run.waveIndex >= WAVES.length) {
      this.run.finishDelay = 1.6;
      this.showToast('最后一道防线守住了！', COLORS.mint, 2.2);
    }
  }

  // ------------------------------------------------------------------
  // 升级 / 出售
  // ------------------------------------------------------------------
  upgradeCost(tower) {
    if (!tower || tower.level >= 3) return 0;
    return Math.round(TOWERS[tower.type].cost * TOWER_LEVELS.upgradeCost[tower.level]);
  }

  sellValue(tower) {
    if (!tower) return 0;
    return Math.floor(tower.invested * GAME.sellRatio);
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t || !this.run) return;
    if (t.level >= 3) {
      this.showToast('已经满级了', COLORS.textDim, 1.5);
      return;
    }
    const cost = this.upgradeCost(t);
    if (this.run.coins < cost) {
      this.showToast('金币不足，还差 ' + (cost - this.run.coins), COLORS.gold, 1.7);
      return;
    }
    this.run.coins -= cost;
    t.invested += cost;
    t.level += 1;
    t.flash = 1;
    this.coinPulse = 0.5;
    this.spawnBuildParticles(t.x, t.y, TOWERS[t.type].color);
    this.showToast(TOWERS[t.type].name + ' 升到 Lv.' + t.level, TOWERS[t.type].color, 1.7);
    this.haptic('light');
    this.log('tower_upgrade', {
      type: t.type,
      level: t.level,
      cost,
      coins: this.run.coins,
    });
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t || !this.run) return;
    const refund = this.sellValue(t);
    const key = t.r * MAP.cols + t.c;
    delete this.towerMap[key];
    this.towers = this.towers.filter((x) => x.id !== t.id);
    this.run.coins += refund;
    this.selectedTower = null;
    this.updateFlowPaths();
    this.recomputeEnemyPaths();
    this.spawnBuildParticles(t.x, t.y, COLORS.textDim);
    this.showToast('已出售，返还 ' + refund + ' 金币', COLORS.gold, 1.7);
    this.log('tower_sell', { type: t.type, refund, coins: this.run.coins });
  }

  // ------------------------------------------------------------------
  // 广告：金币补给 / 复活
  // ------------------------------------------------------------------
  async requestSupply() {
    if (this.adBusy || !this.run || this.run.over || this.scene !== 'playing') return;
    if (this.modal) return;
    if (this.run.supplyUsed >= GAME.supplyLimit) {
      this.showToast('本局补给次数已用完', COLORS.textDim, 1.6);
      return;
    }
    this.adBusy = true;
    this.ads.hideBanner();
    this.log('ad_supply_request', {
      used: this.run.supplyUsed,
      mock: this.ads.isMockRewarded(),
    });
    let ok = false;
    try {
      ok = await this.ads.showRewarded('supply');
    } catch (e) {
      ok = false;
    }
    this.adBusy = false;
    if (ok && this.scene === 'playing' && this.run && !this.run.over) {
      if (this.run.supplyUsed >= GAME.supplyLimit) return;
      this.run.supplyUsed += 1;
      this.run.coins += GAME.supplyReward;
      this.run.coinsEarned += GAME.supplyReward;
      this.coinPulse = 1;
      this.spawnBonusParticles();
      this.haptic('light');
      this.showToast(
        '补给到账 +' + GAME.supplyReward + ' 金币（' + this.run.supplyUsed + '/' + GAME.supplyLimit + '）',
        COLORS.gold,
        2.1
      );
      this.log('ad_supply_reward', {
        coins: this.run.coins,
        used: this.run.supplyUsed,
      });
    } else if (!ok) {
      this.showToast('广告未完成，未发放奖励', COLORS.textDim, 1.8);
    }
  }

  async requestRevive() {
    if (this.adBusy || !this.run || !this.result || this.result.win) return;
    if (this.result.revives >= 1) return;
    this.adBusy = true;
    this.ads.hideBanner();
    this.log('ad_revive_request', { wave: this.run.waveIndex });
    let ok = false;
    try {
      ok = await this.ads.showRewarded('revive');
    } catch (e) {
      ok = false;
    }
    this.adBusy = false;
    if (ok && this.run && this.result && !this.result.win && this.scene === 'playing') {
      this.run.over = false;
      this.run.revives += 1;
      this.run.lives = Math.max(this.run.lives, GAME.reviveLives);
      this.run.enemies = [];
      this.projectiles = [];
      this.particles = [];
      this.floatingTexts = [];
      this.cleanupDead();
      for (let i = 0; i < this.run.spawnQueue.length; i++) {
        this.run.spawnQueue[i].time += 2.0;
      }
      this.modal = null;
      this.paused = false;
      this.result = null;
      this.buildType = null;
      this.selectedTower = null;
      this.shake = 0;
      this.flash = 0;
      this.showToast('防线重启 · 生命恢复至 ' + this.run.lives, COLORS.mint, 2.4);
      this.haptic('heavy');
      this.log('ad_revive_reward', {
        wave: this.run.waveIndex,
        lives: this.run.lives,
      });
    } else if (!ok) {
      this.ads.showBanner(this.getBannerLayout());
      this.showToast('广告未完成，未能复活', COLORS.textDim, 1.8);
    }
  }

  restartRun() {
    if (this.restarting) return;
    this.restarting = true;
    this.showToast('正在准备下一局…', COLORS.mint, 1.2);
    const token = ++this.navToken;
    this.ads.hideBanner();
    const done = () => {
      if (token !== this.navToken) return;
      this.restarting = false;
      this.startRun();
    };
    try {
      const p = this.ads.maybeShowInterstitial(this.profile.runs || 0);
      if (p && typeof p.then === 'function') {
        p.then(done).catch(done);
      } else {
        done();
      }
    } catch (e) {
      done();
    }
  }

  // ------------------------------------------------------------------
  // 粒子 / 飘字
  // ------------------------------------------------------------------
  rand(a, b) {
    return a + Math.random() * (b - a);
  }

  addParticles(x, y, count, color, speed, size, life, gravity) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = this.rand(speed * 0.25, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: this.rand(size * 0.5, size),
        life: this.rand(life * 0.55, life),
        maxLife: life,
        color,
        gravity: gravity || 0,
        drag: 0.92,
        dead: false,
      });
    }
  }

  spawnBuildParticles(x, y, color) {
    this.addParticles(x, y, 14, color, 120, 4, 0.6, 40);
  }

  spawnHitParticles(x, y, color, count) {
    this.addParticles(x, y, count || 5, color, 150, 2.8, 0.35, 0);
  }

  spawnDeathParticles(x, y, color) {
    this.addParticles(x, y, 11, color, 170, 4.5, 0.7, 90);
  }

  spawnLeakParticles(x, y) {
    this.addParticles(x, y, 18, COLORS.red, 220, 5, 0.8, 30);
  }

  spawnPortalParticles(x, y, color) {
    this.addParticles(x, y, 6, color, 70, 3, 0.5, -30);
  }

  spawnFrostParticles(x, y, range) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = this.rand(range * 0.25, range);
      this.particles.push({
        x: x + Math.cos(a) * rad,
        y: y + Math.sin(a) * rad,
        vx: Math.cos(a) * 18,
        vy: Math.sin(a) * 18,
        size: this.rand(1.5, 3.6),
        life: this.rand(0.35, 0.7),
        maxLife: 0.7,
        color: '#b7f1ff',
        gravity: 0,
        drag: 0.9,
        dead: false,
      });
    }
  }

  spawnExplosionParticles(x, y) {
    this.addParticles(x, y, 18, '#ffb15e', 260, 6, 0.55, 30);
    this.addParticles(x, y, 8, '#fff1c9', 150, 3.5, 0.35, 0);
  }

  spawnMuzzleParticles(x, y, angle, color) {
    for (let i = 0; i < 3; i++) {
      const a = angle + this.rand(-0.45, 0.45);
      const v = this.rand(60, 150);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: this.rand(1.5, 3),
        life: this.rand(0.12, 0.28),
        maxLife: 0.28,
        color,
        gravity: 0,
        drag: 0.85,
        dead: false,
      });
    }
  }

  spawnBonusParticles() {
    const L = this.layout;
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x: this.rand(L.margin, this.W - L.margin),
        y: this.rand(L.boardY + L.cell, L.waveY),
        vx: this.rand(-10, 10),
        vy: this.rand(-80, -30),
        size: this.rand(2, 4.5),
        life: this.rand(0.5, 1.0),
        maxLife: 1.0,
        color: COLORS.gold,
        gravity: 40,
        drag: 0.96,
        dead: false,
      });
    }
  }

  updateParticles(dt) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
    this.particles = this.particles.filter((p) => !p.dead);
  }

  addFloatingText(x, y, str, color, size) {
    this.floatingTexts.push({
      x,
      y,
      text: str,
      color: color || COLORS.text,
      size: size || 12,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  updateFloatingTexts(dt) {
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const f = this.floatingTexts[i];
      f.life -= dt;
      f.y -= dt * 26;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
  }

  // ------------------------------------------------------------------
  // 通用
  // ------------------------------------------------------------------
  dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  showToast(text, color, duration) {
    this.toast = {
      text: String(text),
      color: color || COLORS.text,
      until: this.time + (duration || 1.8),
    };
  }

  haptic(type) {
    try {
      if (typeof tt.vibrateShort === 'function') {
        tt.vibrateShort({ type: type || 'light' });
      }
    } catch (e) {
      // ignore
    }
  }

  getBannerLayout() {
    return { width: this.W, height: this.H, safeBottom: this.safeBottom };
  }

  log(event, data) {
    try {
      console.log('[TD] ' + event + (data ? ' ' + JSON.stringify(data) : ''));
    } catch (e) {
      // ignore
    }
  }

  tick(ts) {
    const now = typeof ts === 'number' ? ts : nowMs();
    if (!this._lastTs) this._lastTs = now;
    let dt = (now - this._lastTs) / 1000;
    this._lastTs = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    this.ads.tick();
    if (this.coinPulse > 0) this.coinPulse = Math.max(0, this.coinPulse - dt * 3);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);

    if (
      this.scene === 'playing' &&
      this.run &&
      !this.run.over &&
      !this.modal &&
      !this.adBusy
    ) {
      this.update(dt * (this.speed || 1));
    }
    this.render();
    getRaf()(this._tick);
  }

  // ------------------------------------------------------------------
  // 自动化探针：供抖音开发者工具 / 真机调试读取状态，不参与正常玩法
  // ------------------------------------------------------------------
  getDebugState() {
    const run = this.run;
    return {
      scene: this.scene,
      modal: this.modal,
      helpOpen: this.helpOpen,
      paused: this.paused,
      layout: {
        boardX: Math.round(this.layout.boardX),
        boardY: Math.round(this.layout.boardY),
        boardW: Math.round(this.layout.boardW),
        boardH: Math.round(this.layout.boardH),
        cell: Math.round(this.layout.cell * 10) / 10,
        waveY: Math.round(this.layout.waveY),
        dockY: Math.round(this.layout.dockY),
        headerY: Math.round(this.layout.headerY),
      },
      restarting: this.restarting,
      adBusy: this.adBusy,
      speed: this.speed,
      buildType: this.buildType,
      selectedTower: this.selectedTower
        ? { id: this.selectedTower.id, type: this.selectedTower.type, level: this.selectedTower.level }
        : null,
      buttons: this.buttons.map((b) => ({
        id: b.id,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.w),
        h: Math.round(b.h),
      })),
      run: run
        ? {
            waveIndex: run.waveIndex,
            wavesCleared: run.wavesCleared,
            waveActive: run.waveActive,
            waveName: run.currentWave ? run.currentWave.name : null,
            waveTime: Math.round(run.waveTime * 100) / 100,
            lives: run.lives,
            maxLives: run.maxLives,
            coins: run.coins,
            kills: run.kills,
            leaks: run.leaks,
            coinsEarned: run.coinsEarned,
            supplyUsed: run.supplyUsed,
            revives: run.revives,
            over: run.over,
            spawnQueue: run.spawnQueue.length,
          }
        : null,
      towers: this.towers.map((t) => ({
        id: t.id,
        type: t.type,
        c: t.c,
        r: t.r,
        level: t.level,
      })),
      enemies: this.enemies.filter((e) => !e.dead).length,
      paths: this.flowPaths.map((p) => (p ? p.length : -1)),
      pathCells: this.flowPaths.map((p) =>
        (p || []).map((x) => x.c + ',' + x.r).join(' ')
      ),
      result: this.result,
      profile: Object.assign({}, this.profile),
      ads: this.ads.getDebugInfo(),
    };
  }

  installAutomation() {
    const self = this;
    const api = {
      version: '1.0.0',
      getState: () => self.getDebugState(),
      startGame: () => {
        self.startRun();
        return self.getDebugState();
      },
      startWave: () => {
        self.startWave();
        return self.getDebugState();
      },
      placeTower: (type, c, r, free) => {
        const res = self.placeTower(type, c, r, { free: !!free });
        return { ok: res.ok, reason: res.reason || '', state: self.getDebugState() };
      },
      addCoins: (n) => {
        if (self.run) self.run.coins = Math.max(0, self.run.coins + (Number(n) || 0));
        return self.run ? self.run.coins : null;
      },
      setSpeed: (n) => {
        self.speed = n === 2 ? 2 : 1;
        return self.speed;
      },
      toggleSpeed: () => {
        self.speed = self.speed === 1 ? 2 : 1;
        return self.speed;
      },
      setLives: (n) => {
        if (self.run) self.run.lives = Math.max(0, Math.min(self.run.maxLives, Number(n) || 0));
        return self.run ? self.run.lives : null;
      },
      damageBase: (n) => {
        if (!self.run || self.run.over) return null;
        self.run.lives = Math.max(0, self.run.lives - (Number(n) || 1));
        if (self.run.lives <= 0) self.finishRun(false);
        return self.run.lives;
      },
      clearEnemies: () => {
        if (!self.run) return 0;
        const count = self.enemies.length;
        self.enemies = [];
        self.projectiles = [];
        return count;
      },
      finishMockAd: () => self.ads.finishMockAd(true),
      getAds: () => self.ads.getDebugInfo(),
      getProfile: () => Object.assign({}, self.profile),
      forceHome: () => {
        self.returnHome();
        return self.getDebugState();
      },
      forceWin: () => {
        if (self.run && !self.run.over) self.finishRun(true);
        return self.getDebugState();
      },
      forceLose: () => {
        if (self.run && !self.run.over) self.finishRun(false);
        return self.getDebugState();
      },
    };
    try {
      if (typeof globalThis !== 'undefined') globalThis.__gameAutomation__ = api;
      // 抖音小游戏的 game 运行上下文不一定与 execute-js 共享 globalThis；
      // 把探针挂到 tt 对象上，便于开发者工具直接读取状态。
      if (typeof tt !== 'undefined') tt.__gameAutomation__ = api;
      if (typeof GameGlobal !== 'undefined') GameGlobal.__gameAutomation__ = api;
      console.log('[TD] automation_ready version=' + api.version);
    } catch (e) {
      // ignore
    }
  }
}

renderer.attach(Game);

module.exports = { Game };
