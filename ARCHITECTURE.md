# Architecture

## Choix techniques

| Besoin | Choix | Raison |
| --- | --- | --- |
| Application desktop | Electron 45 | Fonctionne sur Windows 11 sans chaîne de compilation native. Tauri a été envisagé (plus léger), mais il demande Rust et les outils de build MSVC, absents de la machine de développement ; il reste possible plus tard car le noyau est indépendant de l'interface. |
| Langage | JavaScript ESM, sans bundler | Aucun outil de build : le code exécuté est le code du dépôt. |
| Interface | HTML, CSS et JavaScript sans framework | Peu de dépendances, démarrage rapide, insertion de contenu par `textContent` uniquement. |
| Stockage | JSON et blobs adressés par SHA-256 | Formats ouverts, lisibles sans le logiciel, sauvegarde simple. |
| YAML | `yaml` (ISC) | Lecture du frontmatter des `SKILL.md`. |
| ZIP | `fflate` (MIT) | Pur JavaScript, sans dépendance. |
| Tests | `node:test` | Inclus dans Node.js. |

## Vue d'ensemble

```
+-------------------- Electron --------------------+
|  renderer (sandbox)          main process        |
|  index.html, app.js  <-IPC->  main.js, api.js    |
|  ui.js, i18n.js               (liste blanche)    |
+--------------------------------|-----------------+
                                 v
+------------------------- core (Node.js) ---------------------------+
|  hub.js (façade)                                                    |
|   |-- store.js        library.json, blobs/, history.jsonl, trash/   |
|   |-- library.js      fiches, copies gérées, versions, métadonnées  |
|   |-- importer.js     dossier, fichier, ZIP, texte, Git, URL         |
|   |-- detector.js     sources, analyse, déplacements, disparitions  |
|   |-- sync.js         plans, installation, conflits, sauvegardes    |
|   |-- packs.js        Skill Packs, pack intelligent, sélection      |
|   |-- backup.js       exports, sauvegardes vérifiables, restauration|
|   |-- adapters/       un adaptateur par agent + adaptateurs JSON    |
|   |-- skill-parser.js frontmatter, fichiers, empreintes             |
|   |-- classifier.js   catégories et confiance                       |
|   |-- duplicates.js   doublons, variantes, homonymes                |
|   |-- security.js     analyse statique                              |
|   |-- diff.js, text.js, archive.js, fsutil.js                       |
+---------------------------------------------------------------------+
        ^
        |  même noyau
   src/cli/ush.js (ligne de commande)
```

Chaque module a une responsabilité. `hub.js` les assemble mais les modules ne dépendent pas de l'interface ; la CLI et les tests utilisent exactement le même noyau que l'application.

## Données

```
<dossier de données>/
  library.json          skills, packs, catégories, sources, destinations, conflits, paramètres
  skills/<id>/          copie gérée de chaque Skill (format Agent Skills)
  blobs/<aa>/<sha256>   contenu des fichiers, partagé entre les versions
  history.jsonl         un événement JSON par ligne
  trash/                Skills supprimés et copies remplacées (récupérables)
  backups/              sauvegardes ZIP et copies faites avant écrasement
  adapters/*.json       adaptateurs déclaratifs (facultatif)
```

Une version est une liste de fichiers `{chemin, empreinte}`. Le contenu est stocké une seule fois dans `blobs/`, ce qui rend les versions peu coûteuses. Les écritures de `library.json` sont atomiques (fichier temporaire puis renommage) et sérialisées.

### Fiche d'un Skill (extrait)

```json
{
  "id": "sk_1a2b3c4d5e6f7a8b",
  "slug": "sql-schema-review",
  "name": "sql-schema-review",
  "categories": ["bases-de-donnees", "developpement"],
  "classification": { "source": "auto", "confidence": 0.62, "uncertain": false },
  "origin": { "type": "source", "path": "C:/Users/.../skills/sql-schema-review", "sourceId": "src_..." },
  "originHash": "...",
  "contentHash": "...",
  "status": "active",
  "security": { "level": "none", "findings": [], "reviewed": false },
  "currentVersion": 2,
  "versions": [{ "n": 1, "contentHash": "...", "files": [], "createdAt": "2026-01-01T00:00:00.000Z", "note": "Importation initiale" }],
  "installations": [{ "destinationId": "dst_...", "path": "...", "installedHash": "...", "libraryHash": "...", "version": 2 }]
}
```

## Empreintes et comparaisons

- `contentHash` : SHA-256 de la liste triée `chemin + SHA-256 du fichier`. Deux Skills avec ce même hash sont identiques fichier par fichier.
- `instructionsHash` : SHA-256 des instructions normalisées (casse et espaces). Repère un même texte avec des fichiers annexes différents.
- `structureHash` : SHA-256 de la liste des chemins.
- Similarité : indice de Jaccard sur des séquences de 4 mots. Au-dessus de 0,85 : modification mineure ; de 0,55 : variante ; de 0,3 : partiellement similaire.

## Synchronisation

Pour chaque couple (Skill, destination), le moteur compare :

| Bibliothèque modifiée | Destination modifiée | Action |
| --- | --- | --- |
| non | non | à jour |
| oui | non | mise à jour (sauvegarde de la destination d'abord) |
| non | oui | conflit |
| oui | oui | conflit |

"Destination modifiée" signifie que l'empreinte actuelle diffère de celle enregistrée lors de l'installation. Un dossier présent mais jamais installé par le hub est un conflit de type "non géré".

## Détection dans les sources

| Situation sur le disque | Résultat |
| --- | --- |
| Chemin connu, empreinte égale à `originHash` | inchangé |
| Chemin connu, empreinte différente | modifié (conflit si la bibliothèque a aussi changé) |
| Chemin inconnu, contenu d'un Skill dont l'ancien chemin a disparu | déplacé ou renommé |
| Chemin inconnu, contenu déjà dans la bibliothèque | déjà connu |
| Autre | nouveau ou incomplet |
| Chemin connu absent | absent de la source (le Skill est conservé) |

## Sécurité de l'application

- Renderer isolé : `contextIsolation`, `sandbox`, pas d'intégration Node.js, navigation et nouvelles fenêtres bloquées.
- Politique CSP stricte : aucun script distant, aucune connexion réseau depuis la page.
- Pont unique (`preload.cjs`) et liste blanche d'opérations (`api.js`).
- Contenu des Skills inséré avec `textContent`, jamais en HTML.
- Extraction ZIP protégée contre les chemins hors du dossier cible et les archives trop volumineuses.
- Aucune fonction d'exécution des scripts de Skills.

## Extension

- Nouvel agent : un fichier JSON dans `<données>/adapters/` ou un module enregistré avec `registerAdapter()`. Voir [docs/ADAPTERS.md](docs/ADAPTERS.md).
- Nouvelle catégorie : depuis l'interface.
- Nouvelle règle de sécurité : tableau `RULES` de `src/core/security.js`.
- Nouveau type de besoin pour le pack intelligent : tableau `INTENTS` de `src/core/packs.js`.
