# Compatibilité des agents

## Niveaux

| Niveau | Signification |
| --- | --- |
| Natif | L'agent lit directement les dossiers Agent Skills (`SKILL.md` et fichiers associés). Le hub copie le dossier tel quel. |
| Via adaptateur | Le hub convertit le Skill dans le format propre à l'agent. Une partie du contenu peut être perdue. |
| Manuel | L'agent n'a pas de dossier local géré par fichiers. Le hub prépare un fichier à importer dans l'application. |
| Non vérifié | Les chemins suivent la documentation de l'éditeur, mais la lecture par l'agent n'a pas été testée par ce projet. |

Ce que ce projet a vérifié lui-même : la lecture et l'écriture des dossiers par le hub, la conversion Cursor `.mdc`, la production des archives ZIP et des exports Markdown. Il n'a pas vérifié qu'un agent tiers charge effectivement les fichiers produits, sauf mention contraire.

## Tableau récapitulatif

| Agent | Niveau | Détection | Import | Export | Installation | Synchronisation |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | Natif | oui | oui | oui | oui | oui |
| Claude Code (plugins) | Natif, lecture seule | oui | oui | non | non | non |
| Claude.ai et Claude Desktop | Manuel | dossier de l'application | ZIP | ZIP | non | non |
| Codex (OpenAI) | Non vérifié | oui | oui | oui | oui | oui |
| VS Code / GitHub Copilot | Non vérifié | oui | oui | oui | oui | oui |
| Cursor | Via adaptateur | oui | dossier ou fichier | `.mdc` | oui (`.mdc`) | oui (sens bibliothèque vers Cursor) |
| ChatGPT | Manuel | non | copier-coller, fichier | Markdown | non | non |
| Dossier personnalisé | Natif | selon le chemin | oui | oui | oui | oui |
| Adaptateur JSON | Non vérifié par défaut | oui | oui | oui | oui | oui |

## Détails par agent

### Claude Code

- Formats : dossier Agent Skills (`SKILL.md`, `scripts/`, `references/`, `assets/`).
- Chemins : `~/.claude/skills/<nom>/` (personnel), `<projet>/.claude/skills/<nom>/` (projet).
- Import : source surveillée ou import de dossier.
- Export et installation : copie du dossier.
- Synchronisation : bidirectionnelle par conflits (une modification faite dans Claude Code peut être récupérée dans la bibliothèque).
- Limites : `~/.claude/skills` peut être un lien symbolique ; un lien cassé est signalé et n'interrompt pas l'analyse.

### Claude Code (plugins)

- Chemin : `~/.claude/plugins/marketplaces/*/skills/`.
- Lecture seule : ces Skills sont gérés par le système de plugins. Le hub les importe comme copies et ne modifie jamais le dossier.

### Claude.ai et Claude Desktop

- Format : archive ZIP contenant un dossier avec `SKILL.md`.
- Import : archive ZIP téléchargée depuis l'application.
- Export : bouton **Exportation pour un agent** dans l'onglet Installation, puis téléversement manuel dans les paramètres de Claude.
- Limites : aucune API de synchronisation n'est utilisée ; le contenu des conversations n'est pas accessible.

### Codex (OpenAI)

- Formats : dossier Agent Skills.
- Chemins proposés : `~/.codex/skills`, `~/.agents/skills` (personnel), `.codex/skills`, `.agents/skills` (projet).
- Limites : non vérifié sur une installation réelle de Codex. Si Codex utilise un autre emplacement dans votre version, créez une destination "Dossier Agent Skills personnalisé" vers ce dossier.

### VS Code / GitHub Copilot

- Formats : dossier Agent Skills.
- Chemins proposés : `.github/skills` (projet), `~/.copilot/skills` (personnel).
- Limites : la prise en charge dépend de la version de VS Code, de l'extension Copilot et de ses réglages. Non vérifié. Les extensions VS Code ne sont jamais modifiées.

### Cursor

- Format produit : règle `.cursor/rules/<nom>.mdc` avec frontmatter `description`, `globs`, `alwaysApply: false`, suivie du corps des instructions.
- Limites : seul `SKILL.md` est converti ; scripts et ressources ne sont pas copiés. Les règles sont liées à un projet. La récupération d'une règle modifiée dans Cursor vers la bibliothèque n'est pas proposée (le format converti ne contient pas tout le Skill). La prise en charge native des Agent Skills par Cursor n'est pas vérifiée.

### ChatGPT

- Format : Markdown (titre, description, instructions) à coller dans des instructions personnalisées ou un projet.
- Import : copier-coller ou fichier téléchargé.
- Limites : aucune API de Skills utilisée ; aucune lecture des conversations.

### Dossier personnalisé et MCP

Tout agent local qui lit le format Agent Skills peut recevoir des Skills via l'adaptateur "Dossier Agent Skills personnalisé". Les environnements MCP ne sont pas pris en charge directement dans cette version : un serveur MCP qui expose des Skills depuis un dossier peut être alimenté par ce même adaptateur.

## Ajouter un agent

Voir [docs/ADAPTERS.md](docs/ADAPTERS.md).
