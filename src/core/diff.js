// Line based diff (longest common subsequence). Used to show the
// differences between two versions or between a library copy and a
// destination copy before a conflict is resolved.

const MAX_LINES = 4000;

export function diffLines(oldText, newText) {
  const a = String(oldText ?? '').split(/\r?\n/);
  const b = String(newText ?? '').split(/\r?\n/);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return { truncated: true, ops: [{ op: 'note', text: `Fichier trop long pour un diff ligne par ligne (${a.length} / ${b.length} lignes).` }], added: 0, removed: 0 };
  }
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'same', text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'del', text: a[i], a: i + 1 });
      removed++;
      i++;
    } else {
      ops.push({ op: 'add', text: b[j], b: j + 1 });
      added++;
      j++;
    }
  }
  while (i < n) {
    ops.push({ op: 'del', text: a[i], a: i + 1 });
    removed++;
    i++;
  }
  while (j < m) {
    ops.push({ op: 'add', text: b[j], b: j + 1 });
    added++;
    j++;
  }
  return { truncated: false, ops, added, removed };
}

/** Keeps only changed lines and a few lines of context. */
export function compactDiff(diff, context = 2) {
  if (diff.truncated) return diff;
  const keep = new Array(diff.ops.length).fill(false);
  diff.ops.forEach((o, idx) => {
    if (o.op !== 'same') for (let k = Math.max(0, idx - context); k <= Math.min(diff.ops.length - 1, idx + context); k++) keep[k] = true;
  });
  const ops = [];
  let skipped = 0;
  diff.ops.forEach((o, idx) => {
    if (keep[idx]) {
      if (skipped) ops.push({ op: 'skip', text: `... ${skipped} ligne(s) identique(s)` });
      skipped = 0;
      ops.push(o);
    } else skipped++;
  });
  if (skipped) ops.push({ op: 'skip', text: `... ${skipped} ligne(s) identique(s)` });
  return { ...diff, ops };
}

/** Compares two file maps {path: {hash}} and lists added, removed and modified paths. */
export function diffFileSets(oldFiles, newFiles) {
  const oldMap = new Map(oldFiles.map((f) => [f.path, f.hash]));
  const newMap = new Map(newFiles.map((f) => [f.path, f.hash]));
  const added = [];
  const removed = [];
  const modified = [];
  for (const [p, h] of newMap) {
    if (!oldMap.has(p)) added.push(p);
    else if (oldMap.get(p) !== h) modified.push(p);
  }
  for (const p of oldMap.keys()) if (!newMap.has(p)) removed.push(p);
  return { added, removed, modified, changed: added.length + removed.length + modified.length > 0 };
}
