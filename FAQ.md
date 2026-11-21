# FAQ

**Qu'est-ce qu'un Skill ?**
Un dossier qui contient un fichier `SKILL.md` (un frontmatter YAML avec `name` et `description`, puis des instructions en Markdown) et, au besoin, des scripts, références et ressources. C'est le format Agent Skills, utilisé notamment par Claude Code.

**Le hub modifie-t-il mes dossiers de Skills existants ?**
Non. Les sources sont lues sans modification. Le hub écrit uniquement dans son dossier de données et dans les destinations que vous configurez, après validation du plan de synchronisation.

**Que se passe-t-il si je modifie un Skill directement dans le dossier d'un agent ?**
Au prochain plan de synchronisation, le Skill apparaît en conflit. Vous pouvez voir les différences, garder la version de l'agent (elle devient une nouvelle version dans la bibliothèque) ou garder celle de la bibliothèque (la copie de l'agent est sauvegardée avant d'être remplacée).

**Le hub exécute-t-il les scripts des Skills ?**
Non, jamais. Il n'a aucune fonction pour le faire.

**Faut-il un compte ou une connexion Internet ?**
Non. Internet n'est utilisé que si vous importez depuis une URL ou un dépôt Git.

**Le hub peut-il récupérer les Skills que j'ai créés dans une conversation Claude.ai ou ChatGPT ?**
Pas automatiquement : le hub ne lit pas vos conversations. Téléchargez le Skill (archive ZIP ou fichier) ou copiez son contenu, puis utilisez **Importer**.

**Comment le pack intelligent choisit-il les Skills ?**
Il reconnaît quelques types de besoins (association, application web, audit comptable, recherche, entreprise, tâches administratives), associe à chacun une liste de mots-clés et classe les Skills de votre bibliothèque. Il affiche la raison de chaque choix et les besoins sans Skill. Il n'utilise pas de modèle de langage et ne crée aucun Skill.

**Pourquoi un Skill est-il "à vérifier" ?**
L'analyse statique a trouvé un motif à risque moyen ou élevé, ou un exécutable. Ouvrez l'onglet Sécurité de la fiche, lisez les extraits signalés, puis approuvez ou refusez. Tant qu'il est "à vérifier", il ne peut pas être synchronisé.

**Où sont mes données ? Puis-je les lire sans le logiciel ?**
Dans le dossier indiqué dans **Paramètres**. `library.json` est lisible dans un éditeur de texte, chaque Skill est un dossier ordinaire dans `skills/`, et les sauvegardes sont des archives ZIP avec un manifeste.

**Comment ajouter un agent qui n'est pas dans la liste ?**
Créez une destination "Dossier Agent Skills personnalisé" vers son dossier, ou ajoutez un adaptateur JSON (voir [docs/ADAPTERS.md](docs/ADAPTERS.md)).

**Pourquoi Electron ?**
Il fonctionne sur Windows 11 sans outils de compilation natifs et permet de porter l'application vers macOS et Linux. Le noyau est indépendant de l'interface ; voir [ARCHITECTURE.md](ARCHITECTURE.md).
