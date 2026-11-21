// Duplicate and variant detection. Two skills are never considered identical
// only because they share a name: the comparison uses file hashes, the
// normalized instructions and a word shingle similarity.

import { shingles, jaccard } from './text.js';

export const RELATIONS = {
  exact: 'Doublon exact (tous les fichiers identiques)',
  'same-instructions': 'Instructions identiques, fichiers annexes différents',
  'renamed': 'Contenu identique sous un autre nom',
  'minor-change': 'Modification mineure (variante très proche)',
  variant: 'Variante ou fork',
  'partial': 'Partiellement similaire',
  homonym: 'Même nom, contenu différent (pas un doublon)'
};

function sig(skill) {
  return skill._shingles || (skill._shingles = shingles(`${skill.description || ''}\n${skill.body || ''}`));
}

/** Compares two skills and returns a relation or null. */
export function compareSkills(a, b) {
  const sameName = (a.name || '').trim().toLowerCase() === (b.name || '').trim().toLowerCase();
  if (a.contentHash && a.contentHash === b.contentHash) {
    return { relation: sameName ? 'exact' : 'renamed', similarity: 1 };
  }
  if (a.instructionsHash && a.instructionsHash === b.instructionsHash) {
    return { relation: sameName ? 'same-instructions' : 'renamed', similarity: 0.98 };
  }
  const sim = jaccard(sig(a), sig(b));
  if (sim >= 0.85) return { relation: 'minor-change', similarity: round(sim) };
  if (sim >= 0.55) return { relation: 'variant', similarity: round(sim) };
  if (sim >= 0.3) return { relation: 'partial', similarity: round(sim) };
  if (sameName) return { relation: 'homonym', similarity: round(sim) };
  return null;
}

function round(x) {
  return Math.round(x * 100) / 100;
}

/** Finds the best matches of a candidate among existing skills. */
export function findMatches(candidate, skills, { minSimilarity = 0.3 } = {}) {
  const out = [];
  for (const s of skills) {
    if (s.id && s.id === candidate.id) continue;
    const r = compareSkills(candidate, s);
    if (r && (r.similarity >= minSimilarity || r.relation === 'homonym')) out.push({ skillId: s.id, name: s.name, ...r });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

/** Groups the library into duplicate clusters. Complexity is quadratic, fine for a few thousand skills. */
export function findDuplicateGroups(skills, { minSimilarity = 0.55 } = {}) {
  const pairs = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const r = compareSkills(skills[i], skills[j]);
      if (!r || r.relation === 'homonym' || r.relation === 'partial') continue;
      if (r.similarity < minSimilarity) continue;
      pairs.push({ a: skills[i].id, b: skills[j].id, ...r });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}
