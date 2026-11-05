/**
 * 游戏数值与地图表。
 * 地图使用字符表格描述：S=怪物出生点，E=底部防线入口，#=固定岩石，.=可建塔草地。
 */
const MAP = {
  cols: 9,
  rows: 11,
  terrain: [
    '..S...S..',
    '.........',
    '..#......',
    '.........',
    '.....#...',
    '.........',
    '......#..',
    '.........',
    '.........',
    '.........',
    '....E....',
  ],
  spawns: [
    { c: 2, r: 0 },
    { c: 6, r: 0 },
  ],
  exit: { c: 4, r: 10 },
};

const COLORS = {
  bg0: '#06131f',
  bg1: '#0b2830',
  bg2: '#123d42',
  panel: 'rgba(9, 30, 40, 0.94)',
  panelSoft: 'rgba(13, 42, 52, 0.86)',
  line: 'rgba(126, 235, 214, 0.18)',
  mint: '#7debd6',
  mintDeep: '#31a891',
  gold: '#ffd166',
  goldDeep: '#d9922e',
  red: '#ff6b73',
  blue: '#65c7ff',
  text: '#eafcf7',
  textDim: '#8db5b1',
};

const TOWERS = {
  arrow: {
    key: 'arrow',
    name: '箭塔',
    tag: '单体',
    desc: '攻速快，优先打最靠近底线的怪',
    cost: 60,
    color: '#69e29a',
    dark: '#1d7f56',
    range: 112,
    damage: 16,
    cooldown: 0.55,
    projectileSpeed: 760,
    kind: 'arrow',
  },
  frost: {
    key: 'frost',
    name: '冰塔',
    tag: '减速',
    desc: '范围冰爆，让怪物走得更慢',
    cost: 80,
    color: '#74d2ff',
    dark: '#236c9d',
    range: 102,
    damage: 8,
    cooldown: 1.65,
    slowFactor: 0.55,
    slowTime: 1.5,
    kind: 'frost',
  },
  cannon: {
    key: 'cannon',
    name: '炮塔',
    tag: '溅射',
    desc: '炮弹落点范围伤害，适合拐角',
    cost: 110,
    color: '#ffbd5e',
    dark: '#9f5a1c',
    range: 124,
    damage: 34,
    cooldown: 1.55,
    splash: 44,
    projectileSpeed: 380,
    kind: 'cannon',
  },
};

const TOWER_ORDER = ['arrow', 'frost', 'cannon'];

// 等级成长：伤害、射程、攻速
const TOWER_LEVELS = {
  damage: [1, 1.68, 2.62],
  range: [1, 1.1, 1.2],
  rate: [1, 1.12, 1.26],
  upgradeCost: [0, 0.9, 1.25],
};

const ENEMIES = {
  grunt: {
    key: 'grunt',
    name: '裂隙兽',
    hp: 62,
    speed: 44,
    reward: 7,
    damage: 1,
    radius: 11,
    armor: 0,
    color: '#ff7d70',
    color2: '#bf3f47',
  },
  runner: {
    key: 'runner',
    name: '疾行者',
    hp: 35,
    speed: 82,
    reward: 6,
    damage: 1,
    radius: 9,
    armor: 0,
    color: '#ffd166',
    color2: '#ba7d22',
  },
  tank: {
    key: 'tank',
    name: '重甲兽',
    hp: 215,
    speed: 30,
    reward: 15,
    damage: 2,
    radius: 14,
    armor: 0.16,
    color: '#bca3ff',
    color2: '#6751a8',
  },
  boss: {
    key: 'boss',
    name: '深渊领主',
    hp: 1550,
    speed: 26,
    reward: 90,
    damage: 5,
    radius: 22,
    armor: 0.24,
    color: '#ff5f91',
    color2: '#8d1f52',
  },
};

/**
 * 波次表。groups 里的 start 表示相对本波开始的秒数；
 * gate 不填时两支队伍交替从左右两个出生点出现。
 */
const WAVES = [
  {
    name: '第一波 · 试探',
    bonus: 40,
    groups: [{ type: 'grunt', count: 6, interval: 1.0, start: 0.3 }],
  },
  {
    name: '第二波 · 混编',
    bonus: 45,
    groups: [
      { type: 'grunt', count: 7, interval: 0.95, start: 0.2 },
      { type: 'runner', count: 4, interval: 0.7, start: 2.4 },
    ],
  },
  {
    name: '第三波 · 疾行',
    bonus: 50,
    groups: [
      { type: 'runner', count: 12, interval: 0.55, start: 0.2 },
      { type: 'grunt', count: 4, interval: 1.0, start: 3.0 },
    ],
  },
  {
    name: '第四波 · 重甲',
    bonus: 55,
    groups: [
      { type: 'tank', count: 4, interval: 1.9, start: 0.3 },
      { type: 'grunt', count: 8, interval: 0.8, start: 1.0 },
    ],
  },
  {
    name: '第五波 · 首领',
    bonus: 80,
    groups: [
      { type: 'boss', count: 1, interval: 1, start: 0.8, gate: 0 },
      { type: 'grunt', count: 10, interval: 0.8, start: 2.0 },
    ],
  },
  {
    name: '第六波 · 蜂群',
    bonus: 60,
    groups: [
      { type: 'runner', count: 16, interval: 0.42, start: 0.2 },
      { type: 'grunt', count: 6, interval: 0.9, start: 2.5 },
    ],
  },
  {
    name: '第七波 · 铁壁',
    bonus: 65,
    groups: [
      { type: 'tank', count: 6, interval: 1.5, start: 0.2 },
      { type: 'grunt', count: 12, interval: 0.7, start: 1.0 },
    ],
  },
  {
    name: '第八波 · 合围',
    bonus: 70,
    groups: [
      { type: 'grunt', count: 16, interval: 0.55, start: 0.2 },
      { type: 'runner', count: 8, interval: 0.6, start: 4.0 },
      { type: 'tank', count: 3, interval: 2.0, start: 5.0 },
    ],
  },
  {
    name: '第九波 · 破阵',
    bonus: 75,
    groups: [
      { type: 'tank', count: 8, interval: 1.35, start: 0.2 },
      { type: 'runner', count: 12, interval: 0.55, start: 2.0 },
    ],
  },
  {
    name: '第十波 · 双生首领',
    bonus: 100,
    groups: [
      { type: 'boss', count: 1, interval: 1, start: 0.5, gate: 1 },
      { type: 'runner', count: 12, interval: 0.55, start: 1.5 },
      { type: 'tank', count: 6, interval: 1.6, start: 3.0 },
    ],
  },
  {
    name: '第十一波 · 兽潮',
    bonus: 85,
    groups: [
      { type: 'grunt', count: 20, interval: 0.42, start: 0.2 },
      { type: 'runner', count: 10, interval: 0.5, start: 2.0 },
      { type: 'tank', count: 4, interval: 1.8, start: 4.0 },
    ],
  },
  {
    name: '第十二波 · 重压',
    bonus: 90,
    groups: [
      { type: 'tank', count: 10, interval: 1.2, start: 0.2 },
      { type: 'runner', count: 10, interval: 0.5, start: 1.5 },
      { type: 'grunt', count: 10, interval: 0.7, start: 4.0 },
    ],
  },
  {
    name: '第十三波 · 风暴',
    bonus: 95,
    groups: [
      { type: 'runner', count: 22, interval: 0.34, start: 0.2 },
      { type: 'tank', count: 8, interval: 1.4, start: 2.0 },
    ],
  },
  {
    name: '第十四波 · 最后集结',
    bonus: 110,
    groups: [
      { type: 'tank', count: 12, interval: 1.0, start: 0.2 },
      { type: 'grunt', count: 16, interval: 0.48, start: 1.0 },
      { type: 'runner', count: 12, interval: 0.42, start: 4.0 },
    ],
  },
  {
    name: '第十五波 · 深渊降临',
    bonus: 160,
    groups: [
      { type: 'boss', count: 2, interval: 3.0, start: 0.5, gate: 0 },
      { type: 'runner', count: 16, interval: 0.42, start: 1.5 },
      { type: 'tank', count: 10, interval: 1.2, start: 3.0 },
      { type: 'grunt', count: 12, interval: 0.55, start: 6.0 },
    ],
  },
];

const GAME = {
  startingCoins: 210,
  maxLives: 12,
  supplyReward: 120,
  supplyLimit: 3,
  reviveLives: 5,
  sellRatio: 0.65,
  enemyHpGrowth: 0.16,
  enemyHpLateGrowth: 0.055,
  waveIntermission: 0.8,
};

module.exports = {
  MAP,
  COLORS,
  TOWERS,
  TOWER_ORDER,
  TOWER_LEVELS,
  ENEMIES,
  WAVES,
  GAME,
};
