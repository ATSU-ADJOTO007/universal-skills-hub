# Sécurité

## Signaler une vulnérabilité

Merci de ne pas ouvrir d'issue publique pour une faille. Utilisez le signalement privé de GitHub (onglet **Security > Report a vulnerability** du dépôt) en décrivant le problème, la version concernée et un moyen de le reproduire. Une première réponse est visée sous 7 jours.

## Modèle de menace

Un Skill importé peut contenir :

- des instructions qui demandent à un agent de désactiver ses protections ou d'ignorer ses consignes ;
- des commandes destructrices ou des téléchargements suivis d'exécution ;
- des accès à des secrets (clés SSH, fichiers `.env`, identifiants) ;
- des envois de données vers un service externe ;
- du code obfusqué ou des exécutables binaires.

Le hub traite donc tout Skill importé comme une donnée non fiable.

## Mesures en place (version 0.1.0)

| Mesure | Détail |
| --- | --- |
| Aucune exécution | L'application n'a aucune fonction qui exécute un script de Skill. Les fichiers sont affichés en lecture seule. |
| Analyse statique | Règles dans `src/core/security.js` : exécution distante, commandes destructrices, secrets, fichiers `.env`, exfiltration, contournement des protections, obfuscation, persistance, élévation de privilèges, accès réseau, longs blocs base64, exécutables, scripts, outils autorisés sensibles. |
| Statut "à vérifier" | Risque moyen ou élevé, ou exécutable présent : le Skill reste "à vérifier". |
| Blocage | Un Skill "à vérifier" ou archivé ne peut pas être synchronisé vers un agent. |
| Revue tracée | L'approbation ou le refus est enregistré dans l'historique. Une nouvelle version annule la vérification précédente. |
| Sources en lecture seule | Les dossiers surveillés ne sont jamais modifiés. |
| Archives | Refus des chemins absolus, des `..` et des archives de plus de 200 Mo décompressés ou 5 000 fichiers. |
| Git et URL | Seules les adresses `https://` et `git@` sont acceptées ; clone superficiel sans exécution de code du dépôt ; téléchargements limités à 20 Mo. |
| Application | Renderer isolé (`contextIsolation`, `sandbox`, pas de Node.js), CSP stricte, navigation bloquée, liste blanche d'opérations IPC, contenu inséré par `textContent`. |
| Pas de perte silencieuse | Sauvegarde avant tout écrasement, corbeille pour les suppressions, versions conservées. |

## Limites

- L'analyse statique repère des motifs connus. Elle ne garantit pas qu'un Skill est sûr : lisez un Skill avant de l'utiliser, surtout s'il contient des scripts.
- Les règles produisent des faux positifs (par exemple un Skill légitime qui explique comment lire une variable d'environnement). Le statut "à vérifier" sert justement à trancher.
- Le hub ne contrôle pas ce que fait un agent avec un Skill une fois installé ; les permissions restent celles de l'agent hôte.

## Confidentialité

- Données stockées localement, en formats ouverts.
- Aucune télémétrie, aucun compte, aucun envoi automatique.
- Réseau utilisé uniquement pour les imports Git ou URL demandés par l'utilisateur.

## Contrôles du dépôt

- `npm run check:secrets` recherche des formats de jetons connus, des clés privées et des fichiers sensibles (`.env`, `*.pem`, `library.json`...). Il est appelé par le hook `pre-push`, la CI et le workflow de release.
- `.gitignore` exclut les données locales et les fichiers de secrets.
