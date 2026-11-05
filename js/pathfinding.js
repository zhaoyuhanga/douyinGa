/**
 * 轻量 BFS 寻路：棋盘只有 9x11，每帧/每次建塔重算完全够用。
 * 4 方向移动，优先向下，保证怪物天然朝底部防线走。
 */
function findPath(cols, rows, isBlocked, start, goal) {
  if (!start || !goal) return null;
  if (isBlocked(start.c, start.r) || isBlocked(goal.c, goal.r)) return null;

  const total = cols * rows;
  const visited = new Uint8Array(total);
  const parent = new Int16Array(total);
  for (let i = 0; i < total; i++) parent[i] = -1;

  const startId = start.r * cols + start.c;
  const goalId = goal.r * cols + goal.c;
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;

  queue[tail++] = startId;
  visited[startId] = 1;

  const dc = [0, 0, -1, 1];
  const dr = [1, -1, 0, 0];

  while (head < tail) {
    const id = queue[head++];
    if (id === goalId) break;
    const c = id % cols;
    const r = (id - c) / cols;

    for (let k = 0; k < 4; k++) {
      const nc = c + dc[k];
      const nr = r + dr[k];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nid = nr * cols + nc;
      if (visited[nid] || isBlocked(nc, nr)) continue;
      visited[nid] = 1;
      parent[nid] = id;
      queue[tail++] = nid;
    }
  }

  if (!visited[goalId]) return null;

  const path = [];
  let cur = goalId;
  while (cur !== startId) {
    const c = cur % cols;
    const r = (cur - c) / cols;
    path.push({ c, r });
    cur = parent[cur];
    if (cur < 0) return null;
  }
  path.reverse();
  return path;
}

function pathKey(path) {
  if (!path) return '';
  let out = '';
  for (let i = 0; i < path.length; i++) out += path[i].c + ',' + path[i].r + ';';
  return out;
}

module.exports = { findPath, pathKey };
