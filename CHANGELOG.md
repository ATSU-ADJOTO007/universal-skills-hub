# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions selon [Semantic Versioning](https://semver.org/lang/fr/).

## [0.1.0] - 2026-11-22

Première version publique (MVP).

### Ajouté

- Application desktop Electron : tableau de bord, bibliothèque, Skill Packs, agents, sources, historique, sécurité, paramètres ; modes clair et sombre ; français et anglais.
- Bibliothèque locale en formats ouverts (JSON, blobs SHA-256, Markdown, ZIP) avec écritures atomiques.
- Import depuis un dossier, un fichier, une archive ZIP, un copier-coller, un dépôt Git, une URL HTTPS et une archive de Skill Pack.
- Sources surveillées : détection des Skills nouveaux, modifiés, déplacés, renommés, supprimés, en double et incomplets ; modes manuel, au démarrage, temps réel et périodique.
- Classification automatique sur 28 catégories modifiables, avec niveau de confiance et correction manuelle.
- Détection des doublons exacts, des contenus renommés, des variantes et des homonymes.
- Versions à chaque modification, comparaison ligne par ligne, restauration sans perte.
- Skill Packs : création, ordre, duplication, activation, pack par défaut, agents et projets associés, règles, import et export.
- Pack intelligent à partir d'une phrase, avec raisons, couverture et besoins manquants ; sélection de Skills pour une tâche.
- Synchronisation vers les agents avec plan, détection des conflits, sauvegarde avant écrasement et corbeille.
- Adaptateurs : Claude Code, Claude Code (plugins, lecture seule), Claude.ai et Claude Desktop (ZIP), Codex, VS Code / GitHub Copilot, Cursor (`.mdc`), ChatGPT (Markdown), dossier personnalisé, adaptateurs JSON déclaratifs.
- Analyse de sécurité statique, statut "à vérifier" et blocage de la synchronisation des Skills non approuvés.
- Sauvegardes ZIP vérifiables et restauration sélective.
- Ligne de commande `npm run cli`.
- Contrôle bloquant des caractères `U+2014` et `U+2013` (script, hooks Git, GitHub Actions, release).
- Contrôle des secrets, avertissements de qualité, tests automatisés et test de fumée de l'application.
- Exécutable Windows portable et installateur NSIS via `electron-builder`.
