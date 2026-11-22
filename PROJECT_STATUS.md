# État du projet

Dernière mise à jour : 2026-11-22, version 0.1.0.

Statuts utilisés : **terminé et testé** (code écrit et vérifié par un test exécuté), **terminé, test partiel**, **en cours**, **planifié**, **bloqué**, **non vérifié** (dépend d'un logiciel tiers non testé).

## Fonctionnalités terminées et testées

| Fonctionnalité | Vérification |
| --- | --- |
| Lecture des Skills (frontmatter, fichiers, empreintes, Skills incomplets, YAML invalide) | `tests/core.test.js` |
| Import dossier, fichier, ZIP, texte | `tests/core.test.js` |
| Protection des archives (chemins dangereux) | `tests/core.test.js` |
| Refus des URL et adresses Git non sûres | `tests/core.test.js` |
| Bibliothèque, versions, comparaison, restauration, corbeille | `tests/core.test.js` |
| Classification et catégories personnalisées | `tests/core.test.js`, `tests/packs-backup.test.js` |
| Analyse de sécurité, blocage des Skills non approuvés | `tests/core.test.js`, `tests/sync.test.js` |
| Doublons, variantes, homonymes | `tests/core.test.js` |
| Détection dans les sources (nouveau, modifié, déplacé, renommé, absent, incomplet, doublon) | `tests/sync.test.js` |
| Conflit source / bibliothèque et résolution | `tests/sync.test.js` |
| Source inaccessible et lien symbolique cassé | `tests/sync.test.js` |
| Synchronisation : installation, mise à jour avec sauvegarde, conflit, récupération, dossier non géré, retrait | `tests/sync.test.js` |
| Adaptateur Cursor (conversion `.mdc`) | `tests/sync.test.js` |
| Adaptateurs intégrés, refus d'installation pour les agents manuels, adaptateurs JSON | `tests/sync.test.js` |
| Skill Packs, pack intelligent, sélection pour une tâche | `tests/packs-backup.test.js` |
| Recherche et filtres | `tests/packs-backup.test.js` |
| Exports (ZIP, dossier, Markdown), export et import de packs | `tests/packs-backup.test.js` |
| Sauvegarde, vérification, détection d'altération, restauration sélective | `tests/packs-backup.test.js` |
| Tableau de bord et vue sécurité | `tests/packs-backup.test.js` |
| Script des tirets interdits (fichier propre, `U+2014`, `U+2013`, violations multiples, plusieurs fichiers, exclusions, binaire, dossier absent, erreur de lecture, numéros de ligne et colonne, codes de sortie, `--fix`, `--staged`) | `tests/check-writing.test.js` |
| Hook `pre-commit` réel qui refuse un commit | `tests/check-writing.test.js` |
| Traductions françaises et anglaises complètes, liste blanche IPC, absence d'insertion HTML | `tests/ui-static.test.js` |
| Démarrage, affichage des 8 vues en clair et sombre, arrêt | `npm run test:smoke` |
| Parcours interface : pack intelligent, onglets d'un Skill, nouvelle version, destination et synchronisation, recherche globale | `npm run test:smoke` |
| Exécutable Windows (`dist/win-unpacked`) : même test de fumée | exécuté le 2026-11-22 |

## Fonctionnalités terminées, test partiel

| Fonctionnalité | Ce qui manque |
| --- | --- |
| Import depuis un dépôt Git | Le clone a été testé avec un dépôt local ; le filtre d'adresse est testé séparément. Aucun clone réseau dans les tests automatisés. |
| Import depuis une URL HTTPS | Le refus des URL non HTTPS est testé ; aucun téléchargement réel dans les tests. |
| Surveillance en temps réel (`fs.watch`) et périodique | Code en place, aucun test automatisé. |
| Synchronisation au démarrage, à chaque modification, périodique | Code en place, aucun test automatisé. |
| Boîtes de dialogue natives (choix de dossier, confirmation) | Utilisées par l'interface, non pilotées par le test de fumée. |
| Exécutables de la release (portable et installateur NSIS) | Construits par GitHub Actions ; non lancés sur une machine à ce jour. |
| Workflows GitHub Actions | Écrits ; leur exécution sur GitHub est vérifiée après publication (voir "Publication"). |

## Non vérifié (logiciels tiers)

- Lecture par Codex des Skills installés dans `~/.codex/skills` ou `~/.agents/skills`.
- Lecture par VS Code / GitHub Copilot des Skills installés dans `.github/skills` ou `~/.copilot/skills`.
- Prise en charge native des Agent Skills par Cursor (la conversion `.mdc` est testée, son chargement par Cursor non).
- Import des archives produites par Claude.ai ou Claude Desktop (format supposé : ZIP d'un dossier avec `SKILL.md`).

## Planifié

Voir [ROADMAP.md](ROADMAP.md) : vérification réelle des agents ci-dessus, surveillance des destinations, fusion assistée, suivi d'un dépôt Git comme source, paquets macOS et Linux testés, signature et mise à jour automatique, sélection sémantique optionnelle, API locale.

## Bloqué

Aucun élément bloqué à ce jour.

## Tests exécutés (2026-11-22)

| Commande | Résultat |
| --- | --- |
| `npm test` | 49 tests, 49 réussis, 0 échec |
| `npm run test:smoke` | 16 vues sans erreur, 6 parcours réussis, 0 erreur de console |
| Test de fumée de l'application empaquetée (`win-unpacked`) | 6 parcours réussis, 0 erreur de console |
| `npm run check:writing` | aucun caractère interdit |
| `npm run check:secrets` | aucun secret ni fichier sensible |
| `npm run check:quality` | aucun avertissement |
| `npx electron-builder --win portable` | exécutable produit (110 Mo, non signé) |

## Tests non exécutés

- Installateur NSIS : construit par le workflow Release, non installé à ce jour.
- Paquets macOS et Linux.
- Exécution sur Windows 10, macOS et Linux.
- Tests de charge (bibliothèque de plusieurs milliers de Skills).

## Problèmes connus

- La détection des doublons compare toutes les paires : prévue pour quelques milliers de Skills, pas davantage.
- Le pack intelligent ne reconnaît que six types de besoins ; au-delà, il utilise les mots de la demande.
- L'exécutable n'est pas signé : Windows SmartScreen peut avertir au premier lancement.
- Les règles de sécurité produisent des faux positifs, à trancher par la revue manuelle.

## Décisions techniques

- Electron plutôt que Tauri : Rust et les outils MSVC ne sont pas installés sur la machine de développement ; le noyau reste indépendant de l'interface.
- JavaScript ESM sans bundler ni framework : aucune étape de build, code exécuté identique au code publié.
- Stockage JSON et blobs SHA-256 : formats ouverts, versions peu coûteuses, sauvegardes vérifiables.
- Moteur de sélection local par mots-clés : fonctionne hors ligne, explicable ; un moteur sémantique optionnel est planifié.
- Licence MIT : compatible avec les dépendances (`yaml` ISC, `fflate` MIT, `electron` MIT, `electron-builder` MIT).

## Publication

Voir la section "Publication (2026-11-22)" à la fin de ce fichier.

## Prochaine étape

Vérifier l'installation réelle des Skills chez Codex, VS Code / Copilot et Cursor, et ajouter des tests automatisés pour les modes de surveillance.

## Publication (2026-11-22)

| Élément | État vérifié |
| --- | --- |
| Dépôt | https://github.com/ATSU-ADJOTO007/universal-skills-hub |
| Visibilité | public (vérifié par l'API publique GitHub, sans authentification) |
| Branche par défaut | `main` |
| Licence détectée par GitHub | MIT |
| Workflow Writing check | exécuté sur GitHub, succès |
| Workflow CI (Linux et Windows) | exécuté sur GitHub, succès |
| Release | v0.1.0 publiée le 2026-11-22 (https://github.com/ATSU-ADJOTO007/universal-skills-hub/releases/tag/v0.1.0), avec la version portable et l'installateur Windows construits par le workflow Release |
| Protection de branche | règle `protect-main` active sur `main` (vérifiée par l'API publique) : statut "Forbidden dashes" obligatoire, suppression et force-push bloqués ; exception "Repository admin" pour permettre les pushes directs du propriétaire |
| Section About | description du projet, site web pointant vers la page Releases, 12 topics (`agent-skills`, `ai-agents`, `claude-code`, `codex`, `cursor`, `desktop-app`, `electron`, `github-copilot`, `local-first`, `privacy`, `skills-manager`, `windows`), vérifiés par l'API publique |
