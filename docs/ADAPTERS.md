# Ajouter un agent (adaptateur)

Un adaptateur décrit ce qu'un environnement d'IA sait réellement faire : où se trouvent ses Skills, quels formats il lit, et comment le hub peut détecter, importer, exporter, installer et synchroniser. Le noyau n'a pas besoin d'être modifié pour en ajouter un.

## Option 1 : adaptateur déclaratif JSON (sans code)

Pour un agent qui lit des dossiers Agent Skills (`SKILL.md`), créez un fichier dans le dossier `adapters` des données de l'application (chemin visible dans **Paramètres**) :

```json
{
  "id": "mon-agent",
  "label": "Mon agent",
  "vendor": "Éditeur",
  "compatibility": "unverified",
  "userPaths": ["~/.mon-agent/skills"],
  "projectPaths": [".mon-agent/skills"],
  "detectPaths": ["~/.mon-agent"],
  "limits": ["Chemins issus de la documentation de l'éditeur, non testés."],
  "notes": "Lit les dossiers Agent Skills."
}
```

Règles :

- `id` : lettres minuscules, chiffres et tirets, 2 à 40 caractères, différent des adaptateurs intégrés ;
- `compatibility` : `native` ou `unverified` (valeur par défaut). Utilisez `native` seulement après avoir vérifié que l'agent charge les Skills installés ;
- `~` est remplacé par le dossier personnel de l'utilisateur ;
- aucun code n'est exécuté : le fichier est seulement lu.

Redémarrez l'application. L'adaptateur apparaît dans **Agents** ; les erreurs de chargement sont listées dans **Paramètres**.

## Option 2 : module JavaScript (développeurs)

Pour un format différent (conversion, fichier unique, API), créez un module dans `src/core/adapters/` et enregistrez-le :

```js
import { registerAdapter } from './index.js';

registerAdapter({
  id: 'exemple',
  label: 'Exemple',
  vendor: 'Éditeur',
  compatibility: 'adapter',
  layout: 'single-file',              // 'skill-folder', 'single-file' ou 'manual'
  formats: ['.exemple/rules/*.md'],
  capabilities: { detect: true, import: true, export: true, install: true, sync: true },
  limits: ['Seul SKILL.md est converti.'],
  async locations(projectDir) { return []; },             // [{ scope, path, state }]
  async detect() { return { installed: false, evidence: [] }; },
  targetPath(root, skill) { /* chemin du fichier ou dossier installé */ },
  async install(skillDir, root, skill) { /* écrit et retourne le chemin */ }
});
```

Contrat :

| Membre | Rôle |
| --- | --- |
| `layout` | `skill-folder` : le dossier est copié tel quel. `single-file` : un fichier converti (le hub compare son empreinte). `manual` : pas d'installation, seulement l'export. |
| `capabilities` | Ce qui est réellement possible. L'interface masque ce qui est à `false`. |
| `locations()` | Emplacements connus, avec un état `ok`, `missing`, `broken-link` ou `not-a-directory`. |
| `detect()` | Indices de présence de l'agent sur la machine. |
| `targetPath()` | Où le Skill sera écrit pour une destination donnée. |
| `install()` | Écrit le Skill et retourne le chemin. Doit être idempotent. |
| `convert()` | (facultatif, `single-file`) Produit le contenu converti, utilisé aussi pour afficher les différences. |

Importez le module dans `src/core/adapters/index.js` ou dans `src/core/hub.js` pour qu'il soit chargé.

## Règles à respecter

- Ne déclarez pas une capacité qui n'est pas vérifiée. Documentez les limites dans `limits` et dans [COMPATIBILITY.md](../COMPATIBILITY.md).
- Ne modifiez jamais les fichiers internes d'un agent (configuration, extensions, bases de données).
- Une installation ne doit pas supprimer de fichiers en dehors du dossier du Skill concerné.
- Ajoutez un test dans `tests/sync.test.js` qui installe un Skill dans un dossier temporaire et vérifie le résultat.
