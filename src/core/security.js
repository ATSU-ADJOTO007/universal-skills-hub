// Static security analysis of skill content. Skills are untrusted data: this
// module reads them as text and never executes anything. The application has
// no feature that runs a skill script.

const RULES = [
  // Remote code execution patterns
  { id: 'remote-exec', level: 'high', label: 'Téléchargement puis exécution de code distant', re: /(curl|wget)[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b|iwr[^\n|]*\|\s*iex|invoke-webrequest[^\n|]*\|\s*invoke-expression|downloadstring\s*\(/i },
  { id: 'destructive', level: 'high', label: 'Commande destructrice', re: /rm\s+-rf\s+(\/|~|\$home|\*)(\s|$)|remove-item\s+[^\n]*-recurse[^\n]*(c:\\|\$env:userprofile|~)|format\s+c:|mkfs\.|dd\s+if=.*of=\/dev\/|del\s+\/s\s+\/q\s+c:\\/i },
  { id: 'secrets', level: 'high', label: 'Accès à des secrets ou identifiants', re: /~\/\.ssh|id_rsa|id_ed25519|\.aws\/credentials|aws_secret_access_key|\.netrc|\.git-credentials|keychain|credential manager|lsass|mimikatz|\bpasswords?\.txt\b|cookies\.sqlite|login data/i },
  { id: 'env-files', level: 'medium', label: 'Lecture de fichiers .env ou de variables sensibles', re: /(cat|type|get-content|read)\s+[^\n]*\.env\b|process\.env\.[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)|\$env:[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)/i },
  { id: 'exfiltration', level: 'high', label: 'Envoi possible de données vers un service externe', re: /(curl|wget|invoke-restmethod|fetch|requests\.post|axios\.post)[^\n]*(-d\s|--data|-F\s|--upload-file|method\s*[:=]\s*['"]post|body\s*[:=])[^\n]*(https?:\/\/)?|discord(app)?\.com\/api\/webhooks|hooks\.slack\.com|webhook\.site|ngrok\.io|pastebin\.com|requestbin/i },
  { id: 'safety-bypass', level: 'high', label: 'Tentative de désactivation des protections', re: /ignore (all )?(previous|prior|above) instructions|disregard (the )?(system|previous)|--dangerously-skip-permissions|bypass(ing)? (the )?(security|safety|permission)|disable (the )?(antivirus|defender|firewall|security|safety)|set-mppreference\s+-disable|you are no longer bound|jailbreak/i },
  { id: 'obfuscation', level: 'medium', label: 'Code obfusqué ou évalué dynamiquement', re: /\beval\s*\(|\bexec\s*\(|frombase64string|base64\s+(-d|--decode)|atob\s*\(|-encodedcommand|\bpowershell\s+-e(nc)?\s/i },
  { id: 'persistence', level: 'medium', label: 'Modification du démarrage ou de tâches planifiées', re: /crontab\s+-|schtasks\s+\/create|\\currentversion\\run|launchagents|systemctl\s+enable|startup folder/i },
  { id: 'privilege', level: 'medium', label: 'Élévation de privilèges', re: /\bsudo\s|runas\s|start-process[^\n]*-verb\s+runas|chmod\s+(\+s|[0-7]*7[0-7]{2}\s+\/)/i },
  { id: 'network', level: 'low', label: 'Accès réseau', re: /\b(curl|wget|invoke-webrequest|invoke-restmethod|requests\.(get|post)|urllib|fetch\()\b/i },
  { id: 'long-base64', level: 'low', label: 'Long bloc encodé en base64', re: /[A-Za-z0-9+/]{300,}={0,2}/ }
];

const LEVEL_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

export function maxLevel(a, b) {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

/**
 * @param {{files:{path:string,kind:string,binary:boolean,size:number}[], contents:Record<string,string>, allowedTools?:string[]}} parsed
 * @param {{trustedSource?:boolean}} [opts]
 */
export function scanSkill(parsed, opts = {}) {
  const findings = [];
  for (const [rel, text] of Object.entries(parsed.contents || {})) {
    const lines = text.split(/\r?\n/);
    for (const rule of RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.re.test(lines[i])) {
          findings.push({ rule: rule.id, level: rule.level, label: rule.label, file: rel, line: i + 1, excerpt: lines[i].trim().slice(0, 160) });
          break; // one finding per rule and file keeps reports readable
        }
      }
    }
  }
  const scripts = parsed.files.filter((f) => f.kind === 'script').map((f) => f.path);
  const executables = parsed.files.filter((f) => f.kind === 'executable' || (f.binary && f.kind !== 'resource')).map((f) => f.path);
  for (const p of executables) findings.push({ rule: 'executable', level: 'high', label: 'Fichier exécutable binaire', file: p, line: null, excerpt: '' });
  if (scripts.length) findings.push({ rule: 'scripts', level: 'low', label: `${scripts.length} script(s) associé(s)`, file: scripts[0], line: null, excerpt: scripts.slice(0, 5).join(', ') });
  const tools = parsed.allowedTools || [];
  const permissions = tools.filter((t) => /bash|shell|exec|write|edit|computer|powershell|\*/i.test(t));
  if (permissions.length) findings.push({ rule: 'permissions', level: 'low', label: `Outils autorisés sensibles : ${permissions.join(', ')}`, file: parsed.instructionFile || 'SKILL.md', line: null, excerpt: '' });
  let level = 'none';
  for (const f of findings) level = maxLevel(level, f.level);
  if (!opts.trustedSource && level === 'none' && scripts.length === 0) level = 'none';
  return {
    level,
    findings,
    scripts,
    executables,
    permissions,
    reviewRequired: LEVEL_ORDER[level] >= LEVEL_ORDER.medium || executables.length > 0,
    scannedAt: new Date().toISOString()
  };
}

export const SECURITY_RULES = RULES.map(({ id, level, label }) => ({ id, level, label }));
