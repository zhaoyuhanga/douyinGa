/**
 * 抖音广告位配置
 * ------------------------------------------------------------------
 * 1. 在抖音开放平台「小游戏 - 流量变现 - 广告变现」创建广告位；
 * 2. 把下面的广告位 ID 换成自己的真实 ID；
 * 3. 真机/预览环境才会产生真实收益，开发者工具与未配置 ID 时使用
 *    「模拟激励视频」便于走通流程，模拟广告不会产生任何收益。
 *
 * 广告位建议：
 * - 激励视频：金币补给、看广告复活
 * - Banner：首页、结算页底部
 * - 插屏：每隔若干局重开时展示一次（有频控）
 */
module.exports = {
  // 例：'7xxxxxxxxxxxxxxxxxx'，留空则激励视频走本地模拟
  rewardedVideoAdUnitId: '',
  bannerAdUnitId: '',
  interstitialAdUnitId: '',

  enableBanner: true,
  enableInterstitial: true,

  // 插屏频控：每 N 局结算后最多展示一次，且两次展示间隔不小于此毫秒数
  interstitialEveryRuns: 3,
  interstitialMinIntervalMs: 90 * 1000,

  // 本地模拟激励视频时长（毫秒），仅开发预览使用
  mockRewardedDurationMs: 3000,
  forceMockRewarded: false,

  // Banner 期望宽度，实际尺寸以 onResize 返回为准
  bannerWidth: 320,
};
