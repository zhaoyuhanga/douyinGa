/**
 * 抖音小游戏广告封装。
 *
 * 真实广告：
 * - 激励视频 tt.createRewardedVideoAd
 * - Banner tt.createBannerAd
 * - 插屏 tt.createInterstitialAd
 *
 * 未配置激励视频广告位时，使用 Canvas 模拟广告走通「看广告 -> 发奖励」流程。
 * 真实广告失败时绝不补发奖励，避免线上被白嫖。
 */
const storage = require('./storage');

const STATS_KEY = 'ad_stats_v1';

function nowMs() {
  return Date.now();
}

function safeLog(event, data) {
  try {
    console.log('[TD][ads] ' + event + (data ? ' ' + JSON.stringify(data) : ''));
  } catch (e) {
    // ignore
  }
}

function defaultStats() {
  return {
    rewardedRequested: 0,
    rewardedCompleted: 0,
    rewardedFailed: 0,
    bannerShown: 0,
    bannerFailed: 0,
    interstitialShown: 0,
    interstitialSkipped: 0,
    lastInterstitialAt: 0,
  };
}

class AdService {
  constructor(config) {
    this.config = config || {};
    this.stats = Object.assign(defaultStats(), storage.get(STATS_KEY, {}));
    this._rewarded = null;
    this._rewardInitTried = false;
    this._pendingReward = null;
    this._rewardTimer = null;
    this._mock = null;
    this._mockResolve = null;
    this._banner = null;
    this._bannerTried = false;
    this._bannerBroken = false;
    this._bannerVisible = false;
    this._interstitial = null;
    this._interstitialTried = false;
    this._interstitialBroken = false;
  }

  hasBanner() {
    return !!(
      this.config.enableBanner &&
      this.config.bannerAdUnitId &&
      !this._bannerBroken
    );
  }

  isMockRewarded() {
    // 只有「显式开发开关」或「没有配置广告位」时才走模拟；
    // 配置了真实广告位但 API 不可用时必须失败，不能白送奖励。
    return (
      !!this.config.forceMockRewarded ||
      !this.config.rewardedVideoAdUnitId
    );
  }

  _saveStats() {
    storage.set(STATS_KEY, this.stats);
  }

  _trackReward(ok, placement, err) {
    if (ok) this.stats.rewardedCompleted += 1;
    else this.stats.rewardedFailed += 1;
    this._saveStats();
    safeLog('rewarded_' + (ok ? 'complete' : 'fail'), {
      placement,
      error: err && (err.errMsg || err.message || String(err)),
    });
  }

  // ------------------------------------------------------------------
  // 激励视频
  // ------------------------------------------------------------------
  showRewarded(placement) {
    if (this._pendingReward || this._mock) {
      safeLog('rewarded_busy', { placement });
      return Promise.resolve(false);
    }

    this.stats.rewardedRequested += 1;
    this._saveStats();
    safeLog('rewarded_request', { placement, mock: this.isMockRewarded() });

    if (this.isMockRewarded()) {
      return this._showMockRewarded(placement);
    }

    return new Promise((resolve) => {
      this._pendingReward = {
        resolve,
        placement,
        settled: false,
      };
      this._rewardTimer = setTimeout(() => {
        this._settleRewarded(false, { errMsg: 'rewarded timeout' });
      }, 90 * 1000);
      const ad = this._ensureRewarded();
      if (!ad) {
        this._settleRewarded(false, { errMsg: 'rewarded unavailable' });
        return;
      }
      this._tryShowRewarded(ad);
    });
  }

  _ensureRewarded() {
    if (this._rewarded) return this._rewarded;
    if (this._rewardInitTried) return null;
    this._rewardInitTried = true;
    if (typeof tt === 'undefined' || typeof tt.createRewardedVideoAd !== 'function') {
      return null;
    }
    try {
      const ad = tt.createRewardedVideoAd({
        adUnitId: this.config.rewardedVideoAdUnitId,
      });
      ad.onLoad(() => safeLog('rewarded_loaded', {}));
      ad.onError((err) => {
        safeLog('rewarded_error', { error: err && err.errMsg });
        this._settleRewarded(false, err || { errMsg: 'rewarded error' });
      });
      ad.onClose((res) => {
        const ended = !res || res.isEnded === true || res.isEnded === undefined;
        this._settleRewarded(ended, res);
      });
      this._rewarded = ad;
      return ad;
    } catch (e) {
      this._rewardInitTried = false;
      safeLog('rewarded_create_throw', { error: e && e.message });
      return null;
    }
  }

  _tryShowRewarded(ad) {
    let showResult;
    try {
      showResult = ad.show();
    } catch (e) {
      this._settleRewarded(false, e);
      return;
    }
    if (!showResult || typeof showResult.catch !== 'function') return;
    showResult.catch((err) => {
      safeLog('rewarded_show_fail_retry_load', {
        error: err && (err.errMsg || err.message),
      });
      try {
        ad.load()
          .then(() => ad.show())
          .catch((err2) => this._settleRewarded(false, err2));
      } catch (e) {
        this._settleRewarded(false, e);
      }
    });
  }

  _settleRewarded(ok, detail) {
    const pending = this._pendingReward;
    if (!pending || pending.settled) return;
    pending.settled = true;
    this._pendingReward = null;
    if (this._rewardTimer) {
      clearTimeout(this._rewardTimer);
      this._rewardTimer = null;
    }
    this._trackReward(ok, pending.placement, detail);
    try {
      pending.resolve(!!ok);
    } catch (e) {
      // ignore
    }
  }

  // ------------------------------------------------------------------
  // 模拟激励视频（仅开发预览）
  // ------------------------------------------------------------------
  _showMockRewarded(placement) {
    const duration = Math.max(1200, this.config.mockRewardedDurationMs || 3200);
    const startedAt = nowMs();
    this._mock = {
      placement,
      startedAt,
      endsAt: startedAt + duration,
      duration,
    };
    return new Promise((resolve) => {
      this._mockResolve = resolve;
      safeLog('mock_rewarded_start', { placement, duration });
    });
  }

  getMockState() {
    if (!this._mock) return null;
    const left = Math.max(0, this._mock.endsAt - nowMs());
    const progress = Math.max(
      0,
      Math.min(1, (nowMs() - this._mock.startedAt) / this._mock.duration)
    );
    return {
      placement: this._mock.placement,
      remaining: Math.ceil(left / 1000),
      progress,
    };
  }

  tick() {
    if (!this._mock) return;
    if (nowMs() >= this._mock.endsAt) {
      this._finishMock(true);
    }
  }

  finishMockAd(success) {
    return this._finishMock(success !== false);
  }

  _finishMock(ok) {
    if (!this._mock) return false;
    const placement = this._mock.placement;
    const resolve = this._mockResolve;
    this._mock = null;
    this._mockResolve = null;
    this._trackReward(!!ok, placement, ok ? null : { errMsg: 'mock skipped' });
    safeLog('mock_rewarded_finish', { placement, ok: !!ok });
    if (resolve) {
      try {
        resolve(!!ok);
      } catch (e) {
        // ignore
      }
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Banner
  // ------------------------------------------------------------------
  showBanner(layout) {
    if (!this.hasBanner()) return;
    const api = typeof tt !== 'undefined' ? tt.createBannerAd : null;
    if (typeof api !== 'function') {
      this._bannerBroken = true;
      return;
    }
    const screenW = (layout && layout.width) || 375;
    const screenH = (layout && layout.height) || 667;
    const safeBottom = (layout && layout.safeBottom) || 0;
    const wantedW = Math.min(
      this.config.bannerWidth || 320,
      Math.max(240, screenW - 16)
    );

    if (!this._banner) {
      this._bannerTried = true;
      try {
        this._banner = tt.createBannerAd({
          adUnitId: this.config.bannerAdUnitId,
          style: {
            left: Math.round((screenW - wantedW) / 2),
            top: Math.round(screenH - safeBottom - 70),
            width: Math.round(wantedW),
          },
        });
        this._banner.onError((err) => {
          this.stats.bannerFailed += 1;
          this._saveStats();
          this._bannerBroken = true;
          this._bannerVisible = false;
          safeLog('banner_error', { error: err && err.errMsg });
        });
        this._banner.onResize((res) => {
          if (!this._banner) return;
          const w = res && res.width ? res.width : wantedW;
          const h = res && res.height ? res.height : 60;
          try {
            this._banner.style.left = Math.round((screenW - w) / 2);
            this._banner.style.top = Math.round(screenH - safeBottom - h - 8);
          } catch (e) {
            // ignore
          }
        });
        this._banner.onLoad(() => {
          safeLog('banner_loaded', {});
        });
      } catch (e) {
        this._bannerBroken = true;
        safeLog('banner_create_throw', { error: e && e.message });
        return;
      }
    }

    if (!this._banner || this._bannerVisible) return;
    try {
      const p = this._banner.show();
      this._bannerVisible = true;
      this.stats.bannerShown += 1;
      this._saveStats();
      safeLog('banner_show', {});
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          this._bannerVisible = false;
          safeLog('banner_show_fail', { error: err && err.errMsg });
        });
      }
    } catch (e) {
      safeLog('banner_show_throw', { error: e && e.message });
    }
  }

  hideBanner() {
    if (!this._banner || !this._bannerVisible) {
      this._bannerVisible = false;
      return;
    }
    this._bannerVisible = false;
    try {
      this._banner.hide();
      safeLog('banner_hide', {});
    } catch (e) {
      // ignore
    }
  }

  // ------------------------------------------------------------------
  // 插屏
  // ------------------------------------------------------------------
  maybeShowInterstitial(runCount) {
    if (
      !this.config.enableInterstitial ||
      !this.config.interstitialAdUnitId ||
      this._interstitialBroken
    ) {
      return Promise.resolve(false);
    }
    const every = Math.max(1, this.config.interstitialEveryRuns || 3);
    const gap = Math.max(0, this.config.interstitialMinIntervalMs || 0);
    if (runCount < every || runCount % every !== 0) {
      this.stats.interstitialSkipped += 1;
      this._saveStats();
      return Promise.resolve(false);
    }
    if (nowMs() - (this.stats.lastInterstitialAt || 0) < gap) {
      this.stats.interstitialSkipped += 1;
      this._saveStats();
      return Promise.resolve(false);
    }
    if (typeof tt === 'undefined' || typeof tt.createInterstitialAd !== 'function') {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (ok) {
          this.stats.interstitialShown += 1;
          this.stats.lastInterstitialAt = nowMs();
          this._saveStats();
        }
        resolve(!!ok);
      };

      const timeout = setTimeout(() => finish(false), 20 * 1000);

      try {
        if (!this._interstitial) {
          this._interstitialTried = true;
          this._interstitial = tt.createInterstitialAd({
            adUnitId: this.config.interstitialAdUnitId,
          });
          this._interstitial.onClose(() => {
            clearTimeout(timeout);
            finish(true);
            safeLog('interstitial_close', {});
          });
          this._interstitial.onError((err) => {
            clearTimeout(timeout);
            finish(false);
            safeLog('interstitial_error', { error: err && err.errMsg });
          });
        }
        const p = this._interstitial.show();
        safeLog('interstitial_show', {});
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            safeLog('interstitial_show_fail', { error: err && err.errMsg });
            try {
              this._interstitial
                .load()
                .then(() => this._interstitial.show())
                .catch(() => {
                  clearTimeout(timeout);
                  finish(false);
                });
            } catch (e) {
              clearTimeout(timeout);
              finish(false);
            }
          });
        }
      } catch (e) {
        clearTimeout(timeout);
        this._interstitialBroken = true;
        finish(false);
        safeLog('interstitial_throw', { error: e && e.message });
      }
    });
  }

  // ------------------------------------------------------------------
  // 调试信息
  // ------------------------------------------------------------------
  getDebugInfo() {
    return {
      mockRewarded: this.isMockRewarded(),
      hasBanner: this.hasBanner(),
      hasInterstitial: !!(
        this.config.enableInterstitial && this.config.interstitialAdUnitId
      ),
      mock: this.getMockState(),
      stats: Object.assign({}, this.stats),
    };
  }

  getStats() {
    return Object.assign({}, this.stats);
  }
}

module.exports = { AdService };
