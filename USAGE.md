# Guide d'utilisation

Ce guide suit l'ordre de l'interface. Toutes les actions décrites existent dans la version 0.1.0.

## Premier lancement

Au premier lancement, la bibliothèque est vide. Deux chemins possibles :

- **Sources** : le hub affiche les dossiers d'agents trouvés sur l'ordinateur (par exemple `~/.claude/skills`). Un lien symbolique cassé est signalé comme tel. Cliquez sur **Ajouter** à côté d'un dossier présent, puis sur **Analyser**.
- **Importer** (en haut à droite) : choisissez un dossier, un fichier, une archive, un dépôt Git, une URL ou collez un texte.

Pour essayer sans risque, importez le dossier `examples/skills` du dépôt.

## Tableau de bord

Les tuiles indiquent le nombre de Skills, de packs, d'agents pris en charge et de sources, les nouveaux Skills détectés, les modifications en attente, les synchronisations, les erreurs, les conflits ouverts et les alertes de sécurité. Chaque tuile ouvre la vue correspondante. La répartition par catégorie filtre la bibliothèque au clic.

## Importer des Skills

| Méthode | Ce qui est importé |
| --- | --- |
| Dossier | Tous les sous-dossiers qui contiennent un `SKILL.md` (profondeur réglable dans les paramètres) |
| Fichier | Un `SKILL.md` avec son dossier, un fichier Markdown seul, ou une archive |
| Archive ZIP | Tous les dossiers de Skills de l'archive ; chemins dangereux et archives trop volumineuses refusés |
| Copier-coller | Le texte d'un Skill créé dans une conversation IA |
| Dépôt Git | Clone superficiel (`git clone --depth 1`) d'une adresse `https://` ou `git@` |
| URL | Un `SKILL.md` ou une archive en HTTPS ; une adresse de dépôt GitHub, GitLab ou Codeberg est clonée |
| Skill Pack | Une archive exportée par le hub (les Skills déjà présents ne sont pas dupliqués) |

Les doublons exacts sont ignorés par défaut. Le résultat de l'import indique le statut de chaque Skill, son niveau de risque et les Skills proches déjà présents.

Les fichiers d'origine ne sont jamais modifiés : le hub travaille sur une copie.

## Bibliothèque

- **Recherche globale** : la barre du haut cherche dans les noms, descriptions, tags et notes.
- **Filtres** : catégorie, tag, pack, agent, statut, niveau de sécurité. **Tri** : pertinence, nom, dernière modification, date d'import.
- **Doublons** : liste des paires de Skills identiques ou proches, avec le type de relation et le pourcentage de similarité. Deux Skills qui portent le même nom avec un contenu différent ne sont pas considérés comme des doublons.
- **Corbeille** : les Skills supprimés y restent et peuvent être récupérés.

### Fiche d'un Skill

| Onglet | Contenu |
| --- | --- |
| Fiche | Description, origine, auteur, licence, dates, packs, dépendances, outils autorisés, destinations, classification et confiance, Skills proches, catégories, tags, priorité, statut, notes. Actions : enregistrer, reclasser, afficher le dossier, exporter, supprimer. |
| Instructions | Éditeur du `SKILL.md`. Chaque enregistrement crée une nouvelle version avec une note. |
| Fichiers | Liste des fichiers avec leur type (instructions, script, exécutable, référence...). Contenu affiché en lecture seule. |
| Versions | Historique, comparaison de deux versions ligne par ligne, restauration. Une restauration crée une nouvelle version : rien n'est perdu. |
| Sécurité | Résultats de l'analyse, approbation ou refus, nouvelle analyse. |
| Installation | Destinations où le Skill est sélectionné ou installé, ajout à une destination, exportation pour Claude.ai, Claude Desktop ou ChatGPT. |

## Classification

À l'import, chaque Skill reçoit une ou plusieurs catégories calculées à partir du nom, des tags, de la description, des instructions, des fichiers et des outils déclarés. La confiance est affichée ; en dessous de 40 %, la classification est marquée "incertaine". Une catégorie choisie à la main n'est plus modifiée automatiquement.

Les catégories et leurs mots-clés se modifient dans **Paramètres > Catégories**. Supprimer une catégorie ne supprime aucun Skill.

## Skill Packs

- **Nouveau pack** : nom, description, Skills (ordre modifiable), activation, pack par défaut, agents et projets associés, règles (exiger des Skills vérifiés, nombre maximal, consignes).
- **Dupliquer**, **Exporter** (archive ZIP), **Importer** (onglet Skill Pack de la fenêtre d'import).
- **Synchroniser vers un agent** : crée une destination qui reçoit le pack.

### Pack intelligent

Écrivez une demande, par exemple "Crée un pack pour réaliser un audit comptable". Le moteur :

1. reconnaît le type de besoin (association, application web, audit comptable, recherche, entreprise, tâches administratives) ou, à défaut, utilise les mots de la demande ;
2. liste les besoins associés ;
3. cherche les Skills existants pour chaque besoin et écarte les doublons ;
4. affiche pour chaque Skill la raison de sa sélection ;
5. indique les besoins couverts et les besoins sans Skill.

Vous cochez ou décochez les Skills avant de créer le pack. Aucun Skill n'est inventé.

### Sélection pour une tâche

Décrivez une tâche, choisissez éventuellement un agent et un pack. Le moteur classe les Skills pertinents, écarte les doublons et les Skills archivés ou en attente de vérification, et explique chaque choix. La sélection peut devenir un pack.

## Agents et synchronisation

La vue **Agents** présente chaque adaptateur : niveau de compatibilité, détection sur la machine, formats, emplacements (présent, absent, lien cassé), fonctions disponibles et limites connues.

### Ajouter une destination

Choisissez l'agent, le dossier cible (les chemins habituels sont proposés), le mode de synchronisation (manuel, au démarrage, à chaque modification, périodique) et la sélection de Skills ou de packs.

### Plan de synchronisation

Le plan liste une action par Skill :

| Action | Signification | Choix possibles |
| --- | --- | --- |
| Installer | Absent de la destination | Appliquer, ignorer |
| Mettre à jour | Nouvelle version dans la bibliothèque, destination intacte | Appliquer (avec sauvegarde), ignorer |
| À jour | Rien à faire | |
| Conflit | Modifié chez l'agent, ou dossier non géré déjà présent | Ignorer, garder la bibliothèque, garder la destination, voir les différences |
| Supprimé chez l'agent | Le dossier installé a disparu | Ignorer, réinstaller, oublier |
| Retirer | Ne fait plus partie de la sélection | Conserver, retirer (sauvegarde puis corbeille) |
| Bloqué | Skill archivé ou en attente de vérification | |

Les synchronisations automatiques n'appliquent que les installations et les mises à jour sans risque. Les conflits ouverts apparaissent en haut de la vue Agents.

## Sources

Une source est un dossier lu par le hub. Réglages : nom, agent d'origine, mode de surveillance (manuel, au démarrage, temps réel, périodique), intervalle, profondeur, import automatique des nouveaux Skills, mises à jour automatiques.

**Analyser** affiche l'état de chaque Skill trouvé : nouveau, modifié, inchangé, déplacé, renommé, déjà connu, incomplet, ainsi que les Skills disparus. Cochez les éléments à importer ou à mettre à jour.

Règles appliquées :

- un Skill disparu de la source reste dans la bibliothèque et porte la mention "absent de la source" ;
- un Skill déplacé ou renommé est relié à son nouvel emplacement ;
- un Skill modifié à la fois dans la source et dans la bibliothèque devient un conflit ; la version locale reste en place et dans l'historique.

## Historique

Journal local de toutes les opérations (imports, versions, synchronisations, conflits, sauvegardes, paramètres, démarrage et arrêt), filtrable par type. Chaque ligne peut afficher ses détails.

## Sécurité

La vue regroupe les Skills en attente de vérification, à risque élevé, avec scripts, avec exécutables, avec permissions sensibles, venant de sources externes non vérifiées, ou modifiés depuis la dernière vérification. La liste des règles d'analyse est affichée en bas.

## Paramètres

- Langue (français, anglais) et thème (système, clair, sombre).
- Notifications, classification automatique, analyse des sources au démarrage, sauvegarde avant restauration, profondeur d'analyse.
- Dossier des données et adaptateurs personnalisés chargés.
- Sauvegardes : créer, enregistrer sous, vérifier, restaurer (sélection des Skills, packs, paramètres, sources, destinations, catégories).
- Catégories et mots-clés.

## Ligne de commande

```powershell
npm run cli -- help
npm run cli -- list sql
npm run cli -- pack-propose "Crée un pack pour faire de la recherche"
npm run cli -- backup
npm run cli -- verify C:\chemin\backup.zip
```
