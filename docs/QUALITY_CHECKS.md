# Contrôles qualité

## Contrôle des tirets interdits (bloquant)

Script : `scripts/check-writing.mjs`. Aucune dépendance.

### Caractères recherchés

| Caractère | Nom | Code |
| --- | --- | --- |
| tiret cadratin | em dash | `U+2014` |
| tiret demi-cadratin | en dash | `U+2013` |

Le seul tiret autorisé dans les contenus est le tiret court `-`.

### Fichiers contrôlés

Extensions par défaut : `.md`, `.mdx`, `.txt`, `.rst`, `.html`, `.htm`, `.xml`, `.json`, `.yaml`, `.yml`, `.toml`, `.csv`, `.log`, `.adoc`.

Le fichier `.writingcheck.json` du dépôt ajoute `.js`, `.mjs`, `.cjs`, `.css` et `.svg`, car les textes de l'interface et les messages d'erreur se trouvent dans ces fichiers.

Exclusions par défaut : `node_modules`, `.git`, `dist`, `build`, `coverage`, `.venv`, `venv`, `.cache`, `__pycache__`, `.next`, `.turbo`, `out`, et le fichier `package-lock.json` (généré par npm). Les fichiers binaires (octet nul dans les 8 premiers Ko) et les liens symboliques sont ignorés.

### Configuration

```json
{
  "extensions": [".md", ".txt"],
  "extraExtensions": [".js", ".css"],
  "excludeDirs": ["node_modules", ".git", "dist"],
  "excludeFiles": ["package-lock.json"],
  "replacement": "-"
}
```

`extensions` remplace la liste par défaut ; `extraExtensions` la complète.

### Utilisation

```powershell
npm run check:writing
node scripts/check-writing.mjs docs README.md
node scripts/check-writing.mjs --staged
node scripts/check-writing.mjs --json
node scripts/check-writing.mjs --fix
node scripts/check-writing.mjs --fix --yes
```

Exemple de sortie :

```
ERROR: README.md:42 contains forbidden character "..." (em dash, colonne 17)
       extrait de la ligne
Publication bloquée : 1 violation détectée.
```

Codes de sortie : `0` aucune violation, `1` violations, `2` erreur d'utilisation ou d'accès (chemin absent, fichier illisible, configuration invalide).

`--fix` affiche les fichiers et le nombre de remplacements proposés sans rien modifier. `--fix --yes` remplace chaque caractère interdit par le tiret court. Le script ne corrige jamais en silence.

### Où il s'exécute

| Étape | Mécanisme | Portée |
| --- | --- | --- |
| Manuel | `npm run check:writing` | dépôt complet |
| Commit | `.githooks/pre-commit` | fichiers indexés |
| Push | `.githooks/pre-push` | dépôt complet, plus le contrôle des secrets |
| Pull request et push sur `main` | workflow `Writing check` | dépôt complet, plus un auto-test qui vérifie que le script échoue bien sur un caractère interdit |
| Tag de version et release | workflows `Writing check` et `Release` | la release n'est créée que si les contrôles passent |
| Paquet local | `npm run dist:win` | lance `npm run check` avant la compilation |

Les hooks sont activés par `npm install` (script `prepare`), qui règle `core.hooksPath` dans la configuration locale du dépôt.

### Limites de la protection

- Un hook local peut être contourné avec `git commit --no-verify`. Le workflow GitHub Actions reste un contrôle indépendant.
- La branche `main` est protégée par la règle `protect-main` (Settings > Rules) : le statut **Forbidden dashes** doit réussir avant qu'un commit soit accepté sur `main`, et la suppression ainsi que le force-push de `main` sont bloqués.
- Le rôle **Repository admin** figure dans la liste d'exceptions de cette règle, pour que le propriétaire puisse pousser directement sur `main`. Ses commits passent alors par les hooks locaux et sont contrôlés par le workflow après le push, sans être bloqués à l'avance. Les autres contributeurs doivent passer par une branche ou une pull request dont la vérification réussit.

## Contrôle des secrets (bloquant)

Script : `scripts/check-secrets.mjs`. Il parcourt les fichiers suivis par Git (ou tout le dossier hors Git) et cherche :

- des formats de jetons (AWS, GitHub, Anthropic, OpenAI, Slack, Google, Stripe, npm) ;
- des clés privées ;
- des affectations de mots de passe ou de clés en clair ;
- des fichiers sensibles : `.env`, `*.pem`, `*.p12`, `*.pfx`, `id_rsa`, `credentials`, `library.json`, `history.jsonl`.

Le contenu détecté n'est jamais affiché, seulement le fichier, la ligne et le type.

## Avertissements de qualité (non bloquant)

Script : `scripts/check-quality.mjs`. Il signale les espaces en fin de ligne, les fins de ligne mélangées, l'absence de retour à la ligne final, les fichiers Markdown vides, les liens locaux cassés dans le Markdown et l'encodage UTF-8 invalide. `--strict` le rend bloquant.

## Tests

`npm test` couvre le noyau, les scripts de contrôle et l'interface (analyse statique). `npm run test:smoke` pilote la vraie application. Voir [DEVELOPMENT.md](DEVELOPMENT.md).
