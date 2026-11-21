// Small text utilities used by classification, search, duplicate detection
// and the selection engine. No external NLP dependency is required.

const STOPWORDS = new Set((
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with ' +
  'you your use used using can into when which what how not all any each more most other some such only ' +
  'le la les un une des du de et ou en au aux dans pour par sur avec sans ce cet cette ces est sont etre ' +
  'qui que quoi dont il elle ils elles vous nous on se sa son ses leur leurs pas plus tout tous toute toutes ' +
  'skill skills'
).split(/\s+/));

export function stripAccents(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(text) {
  return stripAccents(text)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function shingles(text, size = 4) {
  const words = tokenize(text);
  const set = new Set();
  if (words.length < size) {
    if (words.length) set.add(words.join(' '));
    return set;
  }
  for (let i = 0; i <= words.length - size; i++) set.add(words.slice(i, i + size).join(' '));
  return set;
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function termFrequencies(text) {
  const tf = new Map();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/** Counts how many times a keyword (single word or phrase) appears in a text. */
export function countKeyword(normText, keyword) {
  const k = stripAccents(keyword).toLowerCase().trim();
  if (!k) return 0;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'g');
  return (normText.match(re) || []).length;
}

export function normForMatch(text) {
  return stripAccents(text).toLowerCase();
}
