# Installation

## Prérequis

- Windows 10 ou 11 (plateforme testée : Windows 11), macOS ou Linux
- Node.js 20 ou plus récent (testé avec Node.js 25.9) et npm
- Git (testé avec Git 2.55)
- Environ 400 Mo d'espace disque pour les dépendances de développement (Electron)

Vérifier les versions :

```powershell
node --version
npm --version
git --version
```

## Télécharger la version Windows

La page [Releases](https://github.com/ATSU-ADJOTO007/universal-skills-hub/releases) propose deux fichiers pour chaque version :

- `Universal.Skills.Hub.<version>.exe` : version portable, se lance sans installation ;
- `Universal.Skills.Hub.Setup.<version>.exe` : installateur (choix du dossier d'installation, désinstallation depuis les Paramètres Windows).

Ces exécutables ne sont pas signés. Au premier lancement, Windows SmartScreen peut afficher un avertissement : choisissez "Informations complémentaires" puis "Exécuter quand même" si le fichier provient bien de la page Releases du dépôt.

## Installation depuis les sources

```powershell
git clone https://github.com/ATSU-ADJOTO007/universal-skills-hub.git
cd universal-skills-hub
npm install
npm start
```

`npm install` :

- installe les dépendances (`yaml`, `fflate`, `electron`, `electron-builder`) ;
- télécharge le binaire Electron ;
- exécute `scripts/install-hooks.mjs`, qui règle `core.hooksPath` sur `.githooks` dans la configuration locale du dépôt uniquement. La configuration Git globale n'est pas modifiée.

## Construire les exécutables Windows

Pour produire un exécutable qui se lance sans installation :

```powershell
npm run dist:win
```

La commande exécute d'abord les contrôles bloquants et les tests, puis écrit dans `dist/` :

- `Universal Skills Hub <version>.exe` : version portable ;
- `Universal Skills Hub Setup <version>.exe` : installateur NSIS (choix du dossier d'installation).

Pour générer seulement la version portable :

```powershell
npx electron-builder --win portable --publish never
```

L'exécutable n'est pas signé numériquement. Windows SmartScreen peut afficher un avertissement au premier lancement.

## macOS et Linux

La configuration `electron-builder` contient des cibles macOS et Linux (AppImage), mais ces paquets n'ont pas encore été construits ni testés. Sur ces systèmes, utilisez l'installation depuis les sources (`npm install` puis `npm start`).

## Ligne de commande

La CLI utilise le même noyau que l'application :

```powershell
npm run cli -- info
npm run cli -- agents
npm run cli -- import C:\chemin\vers\mes-skills
```

Variable utile : `USH_DATA_DIR` choisit un autre dossier de données (pratique pour essayer sans toucher à la bibliothèque principale).

## Emplacement des données

| Système | Dossier |
| --- | --- |
| Windows | `%APPDATA%\universal-skills-hub\library` |
| macOS | `~/Library/Application Support/universal-skills-hub/library` |
| Linux | `~/.config/universal-skills-hub/library` |

Le chemin exact est affiché dans **Paramètres > Confidentialité et données**.

## Mise à jour

Depuis les sources :

```powershell
git pull
npm install
```

Avant une mise à jour, une sauvegarde est conseillée : **Paramètres > Sauvegardes > Créer une sauvegarde**. Le format des données porte un numéro de schéma, et le chargement complète automatiquement les champs ajoutés par les nouvelles versions.

Vérifier la version installée : **Paramètres > Confidentialité et données > Version**, ou :

```powershell
npm pkg get version
```

## Désinstallation

1. Si vous avez utilisé l'installateur NSIS : Paramètres Windows > Applications > Universal Skills Hub > Désinstaller. Pour la version portable ou l'installation depuis les sources, supprimez le dossier du programme.
2. Les données ne sont pas supprimées automatiquement. Pour les effacer, supprimez le dossier de données indiqué ci-dessus, après avoir fait une sauvegarde si nécessaire.
3. Les Skills installés chez les agents (par exemple dans `~/.claude/skills`) restent en place : ce sont des fichiers ordinaires.

## Vérifier l'installation

```powershell
npm test
npm run test:smoke
```

`npm run test:smoke` démarre la vraie application sur une bibliothèque temporaire, ouvre toutes les vues en mode clair et sombre, exécute des parcours utilisateur puis se ferme. Il affiche `PASS` ou `FAIL` pour chaque parcours.
