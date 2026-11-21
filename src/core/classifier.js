// Keyword based classification. Each category has French and English
// keywords. The result lists every category whose score is close enough to the
// best one, with a confidence value between 0 and 1. Users can edit categories
// and override the result; manual choices are never replaced automatically.

import { normForMatch, countKeyword } from './text.js';

export const DEFAULT_CATEGORIES = [
  { id: 'administration', label: 'Administration', keywords: ['administration', 'administratif', 'administrative', 'courrier', 'formulaire', 'form', 'paperwork', 'demarche', 'dossier', 'association', 'statuts', 'proces-verbal', 'secretariat'] },
  { id: 'comptabilite', label: 'Comptabilité', keywords: ['comptabilite', 'comptable', 'accounting', 'bookkeeping', 'ledger', 'grand livre', 'journal entry', 'ecriture', 'bilan', 'balance sheet', 'reconciliation', 'rapprochement', 'invoice', 'facture'] },
  { id: 'fiscalite', label: 'Fiscalité', keywords: ['fiscalite', 'fiscal', 'tax', 'taxes', 'impot', 'impots', 'tva', 'vat', 'declaration fiscale', 'hmrc', 'irs'] },
  { id: 'finance', label: 'Finance', keywords: ['finance', 'financial', 'financier', 'budget', 'cash flow', 'tresorerie', 'investment', 'valuation', 'dcf', 'portfolio', 'equity', 'bond', 'revenue', 'forecast'] },
  { id: 'audit', label: 'Audit', keywords: ['audit', 'auditing', 'auditor', 'sox', 'compliance', 'conformite', 'controle interne', 'internal control', 'review', 'checklist'] },
  { id: 'controle-de-gestion', label: 'Contrôle de gestion', keywords: ['controle de gestion', 'variance', 'kpi', 'reporting', 'tableau de bord', 'cost', 'couts', 'management accounting', 'ecart'] },
  { id: 'developpement', label: 'Développement', keywords: ['development', 'developpement', 'developer', 'code', 'coding', 'software', 'logiciel', 'refactor', 'build', 'debug', 'git', 'pull request', 'commit', 'repository'] },
  { id: 'programmation', label: 'Programmation', keywords: ['programming', 'programmation', 'python', 'javascript', 'typescript', 'rust', 'golang', 'java', 'kotlin', 'swift', 'c++', 'c#', 'php', 'ruby', 'function', 'compiler'] },
  { id: 'frontend', label: 'Frontend', keywords: ['frontend', 'front-end', 'react', 'vue', 'angular', 'svelte', 'css', 'html', 'ui', 'ux', 'component', 'tailwind', 'design system', 'accessibility', 'wcag'] },
  { id: 'backend', label: 'Backend', keywords: ['backend', 'back-end', 'api', 'rest', 'graphql', 'server', 'serveur', 'endpoint', 'microservice', 'django', 'fastapi', 'express', 'spring', 'node'] },
  { id: 'bases-de-donnees', label: 'Bases de données', keywords: ['database', 'base de donnees', 'sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'schema', 'migration', 'query', 'index'] },
  { id: 'cybersecurite', label: 'Cybersécurité', keywords: ['security', 'securite', 'cybersecurity', 'cybersecurite', 'vulnerability', 'pentest', 'penetration', 'malware', 'threat', 'exploit', 'forensics', 'siem', 'owasp', 'phishing', 'incident response'] },
  { id: 'automatisation', label: 'Automatisation', keywords: ['automation', 'automatisation', 'automatiser', 'automate', 'workflow', 'script', 'cron', 'pipeline', 'ci/cd', 'zapier', 'make', 'n8n', 'scheduled'] },
  { id: 'recherche', label: 'Recherche', keywords: ['research', 'recherche', 'literature', 'litterature', 'paper', 'article scientifique', 'study', 'etude', 'source', 'citation', 'bibliography', 'pubmed', 'scholar'] },
  { id: 'marketing', label: 'Marketing', keywords: ['marketing', 'seo', 'campaign', 'campagne', 'brand', 'marque', 'audience', 'ads', 'publicite', 'newsletter', 'social media', 'reseaux sociaux', 'content strategy', 'lead'] },
  { id: 'communication', label: 'Communication', keywords: ['communication', 'email', 'e-mail', 'message', 'press release', 'communique', 'announcement', 'slack', 'presentation', 'redaction', 'writing', 'copywriting'] },
  { id: 'gestion-de-projet', label: 'Gestion de projet', keywords: ['project management', 'gestion de projet', 'roadmap', 'sprint', 'agile', 'scrum', 'kanban', 'milestone', 'jalon', 'planning', 'jira', 'backlog', 'stakeholder'] },
  { id: 'documentation', label: 'Documentation', keywords: ['documentation', 'docs', 'readme', 'guide', 'manual', 'manuel', 'changelog', 'specification', 'adr', 'knowledge base', 'wiki'] },
  { id: 'productivite', label: 'Productivité', keywords: ['productivity', 'productivite', 'task', 'tache', 'todo', 'calendar', 'agenda', 'notes', 'organisation', 'meeting', 'reunion', 'inbox'] },
  { id: 'musique', label: 'Musique', keywords: ['music', 'musique', 'song', 'chanson', 'audio', 'melody', 'melodie', 'chord', 'accord', 'midi', 'partition', 'composition', 'lyrics', 'beat'] },
  { id: 'intelligence-artificielle', label: 'Intelligence artificielle', keywords: ['artificial intelligence', 'intelligence artificielle', 'machine learning', 'llm', 'prompt', 'embedding', 'rag', 'model', 'modele', 'neural', 'pytorch', 'inference', 'fine-tuning'] },
  { id: 'agents-ia', label: 'Agents IA', keywords: ['agent', 'agents', 'subagent', 'mcp', 'claude', 'codex', 'copilot', 'cursor', 'tool use', 'orchestration', 'multi-agent', 'harness', 'hook'] },
  { id: 'systemes', label: 'Systèmes', keywords: ['system', 'systeme', 'linux', 'windows', 'macos', 'shell', 'bash', 'powershell', 'docker', 'kubernetes', 'network', 'reseau', 'devops', 'infrastructure', 'terraform'] },
  { id: 'gestion-entreprise', label: "Gestion d'entreprise", keywords: ['business', 'entreprise', 'company', 'societe', 'strategy', 'strategie', 'sales', 'vente', 'crm', 'customer', 'client', 'pricing', 'business plan', 'operations'] },
  { id: 'ressources-humaines', label: 'Ressources humaines', keywords: ['human resources', 'ressources humaines', 'hr', 'rh', 'recruiting', 'recrutement', 'hiring', 'onboarding', 'payroll', 'paie', 'employee', 'salarie', 'interview', 'entretien'] },
  { id: 'analyse-de-donnees', label: 'Analyse de données', keywords: ['data analysis', 'analyse de donnees', 'data', 'donnees', 'analytics', 'statistics', 'statistique', 'dashboard', 'visualization', 'chart', 'pandas', 'excel', 'spreadsheet', 'csv'] },
  { id: 'education', label: 'Éducation', keywords: ['education', 'teaching', 'enseignement', 'course', 'cours', 'lesson', 'lecon', 'student', 'etudiant', 'learning', 'apprentissage', 'quiz', 'tutorial', 'formation'] },
  { id: 'transversal', label: 'Transversal', keywords: [] }
];

const FIELD_WEIGHTS = { name: 4, tags: 3, description: 2, body: 1, files: 1 };

/**
 * @param {{name?:string, description?:string, body?:string, tags?:string[], files?:{path:string}[], allowedTools?:string[]}} skill
 * @param {{id:string,label:string,keywords:string[]}[]} categories
 */
export function classify(skill, categories = DEFAULT_CATEGORIES) {
  const fields = {
    name: normForMatch(skill.name || ''),
    tags: normForMatch((skill.tags || []).join(' ')),
    description: normForMatch(skill.description || ''),
    body: normForMatch(String(skill.body || '').slice(0, 20000)),
    files: normForMatch([...(skill.files || []).map((f) => f.path), ...(skill.allowedTools || [])].join(' ').replace(/[/_.-]/g, ' '))
  };
  const scored = [];
  for (const cat of categories) {
    let score = 0;
    const matched = new Set();
    for (const kw of cat.keywords || []) {
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        const n = countKeyword(fields[field], kw);
        if (n) {
          // The body is capped per keyword so one long document cannot dominate.
          score += weight * (field === 'body' ? Math.min(n, 5) : Math.min(n, 2));
          matched.add(kw);
        }
      }
    }
    if (score > 0) scored.push({ id: cat.id, label: cat.label, score, matched: [...matched].slice(0, 8) });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return { categories: ['transversal'], confidence: 0.1, details: [], uncertain: true };
  }
  const top = scored[0].score;
  const selected = scored.filter((s) => s.score >= top * 0.5).slice(0, 4);
  const second = scored[1]?.score || 0;
  // Confidence grows with the absolute evidence and with the gap to the runner up.
  const evidence = Math.min(1, top / 20);
  const separation = top > 0 ? (top - second) / top : 0;
  // Capped at 0.95: a keyword match is never a certainty.
  const confidence = Math.min(0.95, Math.round((0.6 * evidence + 0.4 * Math.max(separation, selected.length > 1 ? 0.5 : 0)) * 100) / 100);
  return {
    categories: selected.map((s) => s.id),
    confidence,
    details: scored.slice(0, 6),
    uncertain: confidence < 0.4
  };
}
