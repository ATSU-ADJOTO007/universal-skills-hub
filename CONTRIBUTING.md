# Contribuer

Merci de votre intérêt. Les contributions sont acceptées par pull request.

## Mise en place

```powershell
git clone https://github.com/OWNER/universal-skills-hub.git
cd universal-skills-hub
npm install
```

`npm install` active les hooks Git du dépôt (`core.hooksPath = .githooks`, configuration locale du dépôt uniquement).

## Avant de soumettre

Lancez les contrôles. Ils sont obligatoires pour toute contribution et toute publication :

```powershell
npm run check
```

Cette commande enchaîne :

1. `npm run check:writing` : contrôle des tirets interdits (bloquant) ;
2. `npm run check:secrets` : recherche de secrets et de fichiers sensibles (bloquant) ;
3. `npm test` : tests automatisés.

Pour une modification de l'interface, lancez aussi :

```powershell
npm run test:smoke
```

## Règle des tirets

Les caractères `U+2014` (tiret cadratin) et `U+2013` (tiret demi-cadratin) sont interdits dans les contenus du projet (Markdown, textes, JSON, YAML, interface, commentaires...). Utilisez le tiret court `-`.

Le contrôle s'exécute :

- à chaque commit (hook `pre-commit`, fichiers indexés) ;
- à chaque push (hook `pre-push`, dépôt complet) ;
- dans GitHub Actions, sur chaque pull request et chaque push sur `main` (workflow **Writing check**), de façon indépendante des hooks locaux ;
- avant toute release (workflow **Release**).

En cas d'erreur, le script indique le fichier, la ligne, la colonne et un extrait. Pour voir les remplacements proposés :

```powershell
npm run check:writing -- --fix
```

Pour les appliquer après relecture :

```powershell
npm run check:writing -- --fix --yes
```

Contourner un hook avec `--no-verify` ne sert à rien : le workflow GitHub Actions refusera la contribution.

## Style rédactionnel

- Phrases directes et précises, longueur variée, pas de remplissage.
- Pas de formules du type "ce n'est pas X, c'est Y", pas de slogans de conclusion, pas de questions rhétoriques.
- Ne présentez jamais une fonctionnalité planifiée comme disponible ; utilisez les statuts de [PROJECT_STATUS.md](PROJECT_STATUS.md).
- N'inventez ni résultat de test, ni statistique, ni retour d'utilisateur.

## Code

- JavaScript ESM, sans bundler. Les modules du noyau (`src/core`) ne dépendent pas d'Electron.
- Tout contenu provenant d'un Skill est inséré dans l'interface avec `textContent`.
- Aucune fonction ne doit exécuter un script de Skill.
- Toute opération qui remplace ou supprime des données doit être récupérable (version, corbeille ou sauvegarde) et journalisée.
- Ajoutez des tests pour tout comportement nouveau (`tests/*.test.js`).

## Commits et pull requests

- Messages de commit courts et explicites, en anglais ou en français.
- N'ajoutez pas de lignes de crédit automatiques ou de co-auteurs qui ne sont pas des personnes ayant contribué.
- Décrivez dans la pull request ce qui a été testé et comment.

## Ajouter un agent

Voir [docs/ADAPTERS.md](docs/ADAPTERS.md).

## Licence

En contribuant, vous acceptez que votre contribution soit publiée sous la [licence MIT](LICENSE) du projet.
