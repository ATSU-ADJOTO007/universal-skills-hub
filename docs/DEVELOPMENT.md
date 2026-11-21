# Guide de développement

## Structure du dépôt

```
src/core/         noyau (Node.js, sans Electron)
src/core/adapters adaptateurs d'agents
src/main/         processus principal Electron, preload, liste blanche IPC
src/renderer/     interface (HTML, CSS, JavaScript sans framework)
src/cli/          ligne de commande
scripts/          contrôles qualité, hooks, icône, test de fumée
tests/            tests node:test
examples/skills/  Skills d'exemple non sensibles
assets/           logo et icônes
.githooks/        hooks pre-commit et pre-push
.github/          workflows et modèles
```

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm start` | Lance l'application |
| `npm test` | Tests (`tests/**/*.test.js`) |
| `npm run test:smoke` | Test de fumée de l'application réelle |
| `npm run check` | Contrôle des tirets, des secrets, puis tests |
| `npm run check:quality` | Avertissements de qualité |
| `npm run cli -- help` | Ligne de commande |
| `npm run icon` | Régénère `assets/icon.png` |
| `npm run dist:win` | Paquets Windows (après `npm run check`) |
| `npm run dist:dir` | Application non empaquetée dans `dist/` |

Variables d'environnement :

- `USH_DATA_DIR` : dossier de données utilisé par l'application et la CLI ;
- `USH_SMOKE_DIR` : active le mode test de fumée de l'application (captures et `report.json` dans ce dossier).

## Tests

Les tests utilisent des dossiers temporaires et des Skills synthétiques. Ils ne lisent ni n'écrivent les dossiers réels des agents.

| Fichier | Couverture |
| --- | --- |
| `tests/core.test.js` | parseur, classification, sécurité, doublons, diff, chemins, ZIP, bibliothèque, versions, corbeille, imports |
| `tests/sync.test.js` | détection dans les sources, conflits de source, synchronisation, conflits de destination, blocage de sécurité, Cursor, adaptateurs, liens cassés |
| `tests/packs-backup.test.js` | packs, pack intelligent, sélection, recherche, exports, sauvegarde, vérification, restauration, tableau de bord, catégories |
| `tests/check-writing.test.js` | script des tirets interdits, `--fix`, `--staged`, hook `pre-commit` réel |
| `tests/ui-static.test.js` | clés de traduction, liste blanche IPC, absence d'insertion HTML |

`npm run test:smoke` complète ces tests en pilotant la vraie fenêtre Electron : 8 vues en mode clair et sombre, puis les parcours pack intelligent, onglets d'un Skill, nouvelle version, destination et synchronisation, recherche globale.

## Conventions

- Les modules du noyau ne dépendent pas de l'interface.
- Toute écriture de `library.json` passe par `Store.save()` (écriture atomique, sérialisée).
- Toute opération qui remplace ou supprime des données crée une version, une copie de sauvegarde ou une entrée de corbeille, et une ligne d'historique.
- Les chaînes de l'interface sont dans `src/renderer/i18n.js`, en français et en anglais. Le test `ui-static` vérifie que chaque clé existe dans les deux langues.
- Les contenus respectent la règle des tirets (voir [QUALITY_CHECKS.md](QUALITY_CHECKS.md)). Dans le code, écrivez les caractères interdits avec `String.fromCharCode(0x2014)` si vous devez les manipuler.

## Publier une version

1. Mettre à jour `version` dans `package.json` et `CHANGELOG.md`.
2. `npm run check` puis `npm run test:smoke`.
3. Commit, puis tag `vX.Y.Z` et push du tag.
4. Le workflow **Release** relance les contrôles ; s'ils passent, il construit les paquets Windows et crée une release GitHub en brouillon, à relire avant publication.
