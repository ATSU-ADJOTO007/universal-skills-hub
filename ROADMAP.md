# Roadmap

Les phases évoluent selon les contraintes techniques rencontrées. Statuts : **fait**, **partiel**, **planifié**.

## Phase 1 - MVP (version 0.1.0)

| Élément | Statut |
| --- | --- |
| Application desktop | fait |
| Bibliothèque locale | fait |
| Détection de Skills | fait |
| Importation | fait |
| Classification | fait |
| Recherche et filtres | fait |
| Groupes (Skill Packs) | fait |
| Détection des doublons | fait |
| Versionnement | fait |
| Compatibilité de base | fait (plusieurs agents non vérifiés, voir COMPATIBILITY.md) |
| Exportation | fait |
| Synchronisation locale | fait |
| Documentation | fait |
| Contrôle rédactionnel automatique | fait |
| Tests | fait |

## Phase 2 - Synchronisation avancée

| Élément | Statut |
| --- | --- |
| Gestion des conflits et restaurations | fait (base) |
| Synchronisation sélective | fait (par Skill, par pack, par destination) |
| Vérification réelle des chemins Codex, VS Code / Copilot et Cursor | planifié |
| Surveillance des destinations (détecter une modification chez l'agent sans lancer de plan) | planifié |
| Fusion assistée de deux versions en conflit | planifié |
| Test automatisé du mode de surveillance en temps réel | planifié |

## Phase 3 - Intégrations

| Élément | Statut |
| --- | --- |
| Import GitHub (clone) | fait |
| Suivi d'un dépôt Git comme source (pull périodique) | planifié |
| Intégrations officielles lorsque les éditeurs publient des API de Skills | planifié |
| Extension de navigateur pour importer un Skill depuis une page | planifié |
| Paquets macOS et Linux testés | planifié |
| Installateur signé et mise à jour automatique | planifié |

## Phase 4 - Orchestration

| Élément | Statut |
| --- | --- |
| Sélection pour une tâche et pack intelligent (mots-clés) | fait |
| Moteur de sélection sémantique optionnel (modèle local ou API choisie par l'utilisateur) | planifié |
| Recommandations et détection des besoins | planifié |
| Gestion avancée des dépendances et incompatibilités entre Skills | planifié |
| Workflows multi-agents | planifié |

## Phase 5 - Extensions

| Élément | Statut |
| --- | --- |
| API publique locale | planifié |
| Système d'extensions | partiel (adaptateurs JSON déclaratifs) |
| Connecteurs | planifié |
| Marketplace facultative | planifié |
| Collaboration et cloud facultatifs, désactivés par défaut | planifié |
