// Skill Packs (groups) and the selection engine. A pack stores skill ids, so a
// skill can belong to many packs without being copied.
//
// The selection engine is deterministic and local: it ranks skills with a
// keyword relevance score, explains each choice, flags duplicates and
// incompatibilities, and lists the needs for which no skill exists. It never
// invents a skill to fill a gap.

import { newId, nowIso } from './fsutil.js';
import { tokenize, normForMatch, countKeyword } from './text.js';
import { compareSkills } from './duplicates.js';

export function normalizePack(input) {
  return {
    id: input.id || newId('pk_'),
    name: String(input.name || 'Nouveau pack').trim(),
    description: String(input.description || ''),
    skillIds: Array.isArray(input.skillIds) ? [...new Set(input.skillIds)] : [],
    enabled: input.enabled !== false,
    isDefault: !!input.isDefault,
    agentIds: Array.isArray(input.agentIds) ? input.agentIds : [],
    projectPaths: Array.isArray(input.projectPaths) ? input.projectPaths : [],
    rules: {
      requireReviewed: !!input.rules?.requireReviewed,
      maxSkills: Number(input.rules?.maxSkills) || null,
      excludeTags: Array.isArray(input.rules?.excludeTags) ? input.rules.excludeTags : [],
      notes: String(input.rules?.notes || '')
    },
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

// Needs expected for common requests. Each need is described by keywords;
// a need is "covered" when at least one skill matches it well enough.
export const INTENTS = [
  { id: 'association', triggers: ['association', 'asso', 'benevole', 'nonprofit', 'non-profit'], label: 'Gérer une association', needs: [
    { id: 'admin', label: 'Administration et courriers', keywords: ['administration', 'courrier', 'formulaire', 'statuts', 'proces-verbal', 'secretariat'] },
    { id: 'compta', label: 'Comptabilité et budget', keywords: ['comptabilite', 'accounting', 'budget', 'bookkeeping', 'tresorerie'] },
    { id: 'members', label: 'Membres et communication', keywords: ['membres', 'members', 'newsletter', 'email', 'communication', 'crm'] },
    { id: 'events', label: 'Événements et planification', keywords: ['evenement', 'event', 'calendar', 'planning', 'agenda', 'meeting'] },
    { id: 'docs', label: 'Documents et comptes rendus', keywords: ['documentation', 'compte rendu', 'minutes', 'notes', 'report', 'docx', 'pdf'] }
  ] },
  { id: 'webapp', triggers: ['application web', 'web app', 'webapp', 'site web', 'website', 'saas'], label: 'Développer une application web', needs: [
    { id: 'frontend', label: 'Interface (frontend)', keywords: ['frontend', 'react', 'vue', 'css', 'ui', 'component', 'html'] },
    { id: 'backend', label: 'API et serveur (backend)', keywords: ['backend', 'api', 'server', 'rest', 'graphql', 'endpoint'] },
    { id: 'database', label: 'Base de données', keywords: ['database', 'sql', 'postgres', 'schema', 'migration'] },
    { id: 'testing', label: 'Tests', keywords: ['test', 'testing', 'e2e', 'tdd', 'playwright', 'unit test'] },
    { id: 'security', label: 'Sécurité applicative', keywords: ['security', 'owasp', 'auth', 'xss', 'vulnerability'] },
    { id: 'deploy', label: 'Déploiement', keywords: ['deploy', 'deployment', 'docker', 'ci/cd', 'release', 'hosting'] }
  ] },
  { id: 'audit', triggers: ['audit comptable', 'audit financier', 'audit'], label: 'Réaliser un audit comptable', needs: [
    { id: 'audit', label: 'Méthodologie d\'audit', keywords: ['audit', 'auditing', 'sox', 'internal control', 'controle interne'] },
    { id: 'compta', label: 'Comptabilité', keywords: ['comptabilite', 'accounting', 'journal entry', 'ledger', 'reconciliation'] },
    { id: 'analysis', label: 'Analyse des écarts et des données', keywords: ['variance', 'analysis', 'analyse', 'data', 'excel', 'spreadsheet'] },
    { id: 'statements', label: 'États financiers', keywords: ['financial statements', 'etats financiers', 'bilan', 'balance sheet', 'income statement'] },
    { id: 'report', label: 'Rapport d\'audit', keywords: ['report', 'rapport', 'documentation', 'docx', 'memo'] }
  ] },
  { id: 'research', triggers: ['recherche', 'research', 'etude', 'literature'], label: 'Faire de la recherche', needs: [
    { id: 'search', label: 'Recherche de sources', keywords: ['research', 'recherche', 'search', 'literature', 'paper', 'pubmed', 'scholar'] },
    { id: 'synthesis', label: 'Synthèse', keywords: ['synthesis', 'synthese', 'summary', 'resume', 'knowledge'] },
    { id: 'data', label: 'Analyse de données', keywords: ['data', 'analysis', 'statistics', 'visualization'] },
    { id: 'writing', label: 'Rédaction et citations', keywords: ['writing', 'redaction', 'citation', 'bibliography', 'article'] }
  ] },
  { id: 'business', triggers: ['entreprise', 'business', 'societe', 'company', 'startup', 'pme'], label: 'Gérer une entreprise', needs: [
    { id: 'strategy', label: 'Stratégie et pilotage', keywords: ['strategy', 'strategie', 'business plan', 'kpi', 'dashboard'] },
    { id: 'finance', label: 'Finance et comptabilité', keywords: ['finance', 'accounting', 'comptabilite', 'budget', 'cash flow', 'invoice'] },
    { id: 'sales', label: 'Ventes et clients', keywords: ['sales', 'vente', 'crm', 'customer', 'client', 'lead'] },
    { id: 'marketing', label: 'Marketing', keywords: ['marketing', 'seo', 'campaign', 'brand', 'content'] },
    { id: 'hr', label: 'Ressources humaines', keywords: ['hr', 'recruiting', 'hiring', 'onboarding', 'payroll', 'rh'] },
    { id: 'legal', label: 'Juridique et contrats', keywords: ['legal', 'juridique', 'contract', 'contrat', 'compliance', 'nda'] }
  ] },
  { id: 'admin-automation', triggers: ['taches administratives', 'administratif', 'administrative', 'paperasse'], label: 'Automatiser des tâches administratives', needs: [
    { id: 'automation', label: 'Automatisation', keywords: ['automation', 'automatisation', 'workflow', 'script', 'scheduled', 'cron'] },
    { id: 'documents', label: 'Documents (PDF, Word, Excel)', keywords: ['pdf', 'docx', 'xlsx', 'excel', 'word', 'document', 'form'] },
    { id: 'email', label: 'Courriels et messages', keywords: ['email', 'mail', 'inbox', 'message', 'courrier'] },
    { id: 'calendar', label: 'Agenda et tâches', keywords: ['calendar', 'agenda', 'task', 'todo', 'reminder'] }
  ] }
];

function skillText(s) {
  return {
    name: normForMatch(`${s.name} ${s.slug || ''}`.replace(/[-_]/g, ' ')),
    tags: normForMatch((s.tags || []).join(' ')),
    desc: normForMatch(s.description || ''),
    cats: normForMatch((s.categories || []).join(' ').replace(/-/g, ' ')),
    body: normForMatch(String(s.body || '').slice(0, 8000))
  };
}

/** Relevance of a skill for a list of keywords, with the matched words. */
export function relevance(s, keywords) {
  const t = s._t || (s._t = skillText(s));
  let score = 0;
  const matched = [];
  for (const kw of keywords) {
    const k = normForMatch(kw);
    const parts = [
      [countKeyword(t.name, k), 6],
      [countKeyword(t.tags, k), 4],
      [countKeyword(t.desc, k), 3],
      [countKeyword(t.cats, k), 2],
      [Math.min(countKeyword(t.body, k), 4), 0.5]
    ];
    let local = 0;
    for (const [n, w] of parts) local += Math.min(n, 3) * w;
    if (local > 0) {
      score += local;
      matched.push(kw);
    }
  }
  return { score, matched };
}

function compatibilityIssue(skill, agentId) {
  if (!agentId) return null;
  if (skill.status === 'archived') return 'Skill archivé.';
  if (skill.status === 'pending-review') return 'Vérification de sécurité en attente.';
  if (agentId === 'cursor' && skill.files.some((f) => f.kind === 'script')) return 'Cursor : les scripts associés ne seront pas copiés (conversion en règle .mdc).';
  return null;
}

/**
 * Selects skills for a free text task.
 * @param {object[]} skills  library skills with their body text
 * @param {string} task
 * @param {{agentId?:string, packId?:string, packs?:object, exclude?:string[], include?:string[], limit?:number, minScore?:number}} opts
 */
export function selectForTask(skills, task, opts = {}) {
  const words = [...new Set(tokenize(task))];
  const exclude = new Set(opts.exclude || []);
  let pool = skills.filter((s) => !exclude.has(s.id) && s.status !== 'archived');
  if (opts.packId && opts.packs?.[opts.packId]) {
    const ids = new Set(opts.packs[opts.packId].skillIds);
    pool = pool.filter((s) => ids.has(s.id));
  }
  const ranked = [];
  for (const s of pool) {
    const { score, matched } = relevance(s, words);
    const forced = (opts.include || []).includes(s.id);
    if (!forced && score < (opts.minScore ?? 3)) continue;
    const prio = Number(s.priority) || 0;
    ranked.push({ skill: s, score: Math.round((score + prio * 2) * 10) / 10, matched, forced });
  }
  ranked.sort((a, b) => (b.forced - a.forced) || b.score - a.score);
  const selected = [];
  const conflicts = [];
  for (const r of ranked) {
    if (selected.length >= (opts.limit || 8)) break;
    const dupOf = selected.find((x) => {
      const c = compareSkills(x.skill, r.skill);
      return c && ['exact', 'renamed', 'same-instructions', 'minor-change'].includes(c.relation);
    });
    if (dupOf) {
      conflicts.push({ skillId: r.skill.id, name: r.skill.name, type: 'duplicate', with: dupOf.skill.name, message: `Doublon ou variante proche de "${dupOf.skill.name}" : écarté.` });
      continue;
    }
    const issue = compatibilityIssue(r.skill, opts.agentId);
    if (issue && r.skill.status !== 'active') {
      conflicts.push({ skillId: r.skill.id, name: r.skill.name, type: 'incompatible', message: issue });
      continue;
    }
    selected.push({
      ...r,
      warning: issue,
      reason: r.forced ? 'Ajouté manuellement.' : `Correspond à : ${r.matched.slice(0, 6).join(', ')}.`
    });
  }
  return {
    task,
    keywords: words,
    selected: selected.map((x) => ({ skillId: x.skill.id, name: x.skill.name, score: x.score, reason: x.reason, warning: x.warning })),
    conflicts,
    consideredCount: pool.length
  };
}

export function detectIntents(request) {
  const n = normForMatch(request);
  return INTENTS.filter((i) => i.triggers.some((t) => countKeyword(n, t) > 0));
}

/**
 * Builds a pack proposal from a natural language request. The proposal is
 * not saved: the user validates or edits it first.
 */
export function proposePack(skills, request, opts = {}) {
  const intents = detectIntents(request);
  const needs = intents.length
    ? intents.flatMap((i) => i.needs)
    : [{ id: 'request', label: 'Besoin exprimé', keywords: [...new Set(tokenize(request))] }];
  const chosen = new Map();
  const coverage = [];
  const conflicts = [];
  const pool = skills.filter((s) => s.status !== 'archived');
  for (const need of needs) {
    const ranked = pool
      .map((s) => ({ s, ...relevance(s, need.keywords) }))
      .filter((r) => r.score >= (opts.minScore ?? 4))
      .sort((a, b) => b.score - a.score);
    const picks = [];
    for (const r of ranked) {
      if (picks.length >= (opts.perNeed || 2)) break;
      const dup = [...chosen.values(), ...picks].find((p) => {
        const c = compareSkills(p.s, r.s);
        return c && ['exact', 'renamed', 'same-instructions', 'minor-change'].includes(c.relation);
      });
      if (dup && dup.s.id !== r.s.id) {
        conflicts.push({ skillId: r.s.id, name: r.s.name, type: 'duplicate', message: `Doublon ou variante proche de "${dup.s.name}".` });
        continue;
      }
      if (r.s.status === 'pending-review') conflicts.push({ skillId: r.s.id, name: r.s.name, type: 'security', message: 'Sélectionné mais en attente de vérification de sécurité.' });
      picks.push(r);
    }
    for (const p of picks) {
      const prev = chosen.get(p.s.id);
      const reason = `${need.label} : ${p.matched.slice(0, 5).join(', ')}`;
      if (prev) prev.reasons.push(reason);
      else chosen.set(p.s.id, { s: p.s, score: p.score, reasons: [reason] });
    }
    coverage.push({ need: need.label, keywords: need.keywords, covered: picks.length > 0, skillIds: picks.map((p) => p.s.id) });
  }
  const label = intents.map((i) => i.label).join(' + ') || request.trim().slice(0, 60);
  return {
    request,
    name: `Pack ${label}`,
    intents: intents.map((i) => i.id),
    skills: [...chosen.values()].map((c) => ({ skillId: c.s.id, name: c.s.name, reasons: c.reasons, status: c.s.status })),
    coverage,
    missing: coverage.filter((c) => !c.covered).map((c) => c.need),
    conflicts,
    note: 'Aucun Skill n\'est créé automatiquement : les besoins non couverts sont listés dans "missing".'
  };
}
