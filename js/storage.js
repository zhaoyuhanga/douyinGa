/**
 * 本地存档：对 tt 存储做最小的容错封装。
 * 抖音小游戏原生支持 tt.getStorageSync / setStorageSync，模拟器同样可用。
 */
const PREFIX = 'lastline_';

function get(key, fallback) {
  try {
    const raw = tt.getStorageSync(PREFIX + key);
    if (raw === '' || raw === undefined || raw === null) return fallback;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return raw;
      }
    }
    return raw;
  } catch (e) {
    return fallback;
  }
}

function set(key, value) {
  try {
    tt.setStorageSync(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { get, set };
