# 🎨 Code Caricature (`context-bridge`)

**Le pont sémantique entre votre code local et les intelligences artificielles.**

`code-caricature` est un outil en ligne de commande (CLI) écrit en TypeScript/Node.js. Il permet d'extraire de manière condensée et sécurisée le contexte d'un projet de développement (signatures de fonctions, arborescence, dépendances), de le soumettre à une intelligence artificielle, puis d'appliquer automatiquement les corrections proposées en retour sur vos fichiers locaux.

---

## 🚀 Commencer Immédiatement (Quickstart)

Pour utiliser ou tester l'outil sans frustration, voici les commandes essentielles à exécuter dans votre terminal.

### 1. Installation et initialisation
```bash
# Se placer dans le répertoire du projet
cd context-bridge

# Installer les dépendances
npm install

# Compiler le code TypeScript
npm run build
```

### 2. Lancer le tableau de bord interactif (Menu guidé)
```bash
# Démarre l'interface interactive pas-à-pas
node dist/index.js
```

### 3. Commandes rapides en une ligne
* **Exporter le projet** (génère un fichier de contexte pour l'IA) :
  ```bash
  node dist/index.js export --output caricature.txt --cost
  ```
* **Importer les corrections** (applique les modifications suggérées par l'IA) :
  ```bash
  node dist/index.js import --clipboard
  ```
* **Lancer l'IA locale en mode discussion** (pour vous guider pas-à-pas) :
  ```bash
  node dist/index.js attitude chat
  ```

---

## 🎯 Liste des Fonctionnalités Implémentées

### 1. Mode Export (`export`)
Extrait et formate le contexte global du workspace pour le transmettre à une IA.
* **Filtre de Sécurité :** Masque automatiquement les secrets (clés d'API, mots de passe, tokens) détectés dans les fichiers.
* **Mode Architecture (AST) :** Extrait uniquement la structure globale (signatures de fonctions, classes, interfaces) pour consommer le moins de tokens possible.
* **Graphe de Dépendances :** Analyse les imports et représente les dépendances entre les fichiers.
* **Estimation de Coût :** Évalue le nombre de tokens et estime le coût financier sur les principaux modèles généraux.

### 2. Mode Import (`import`)
Réintègre les modifications de code rédigées par l'IA directement dans les fichiers locaux.
* **Multi-fichiers :** Met à jour plusieurs fichiers et crée les nouveaux sous-dossiers automatiquement si la réponse contient des blocs de code annotés avec leurs chemins (ex : ` ```typescript src/index.ts `).
* **Prévisualisation interactive (Dry Run) :** Affiche un diff couleur clair (git-like) montrant précisément les modifications proposées avant de toucher physiquement aux fichiers.

### 3. IA Locale et Attitudes (`attitude`)
Permet d'utiliser l'IA locale `Qwen2.5-Coder-1.5B-Instruct` (téléchargée automatiquement à la première exécution dans `~/.code-caricature/models/`).
* **Attitude `chat` (Discussion) :** Session de discussion interactive locale avec des fonctionnalités d'agent :
  * **Pièces jointes par `@` :** Tapez `@src/interactive.ts` ou `@package.json` dans votre message, et le CLI lit et injecte automatiquement le contenu du fichier ou du répertoire ciblé.
  * **Agent avec validation utilisateur :** L'IA locale maîtrise le CLI et peut suggérer d'exécuter des commandes en retournant des lignes commençant par `$`. **Toute commande suggérée par l'IA doit être explicitement validée par l'utilisateur (invite de confirmation interactive `y/N`) avant son exécution.**
* **Attitude `tutoriel` (Mentorat) :** Guide l'utilisateur pas-à-pas à partir d'une transcription textuelle (chargée depuis un fichier ou directement copiée dans le presse-papiers via `--transcript clipboard`). Analyse le code écrit à chaque étape à l'aide d'un parser AST pour valider la progression.
* **Double IA (Fallback) :** Utilise par défaut l'API OpenAI si configurée, et bascule de manière invisible sur l'IA locale autonome en cas d'erreur réseau, d'absence de clé ou de dépassement de quota.

### 4. Persistance des Sessions
* Sauvegarde automatique des discussions et mentorats en temps réel dans `~/.code-caricature/sessions/`.
* Identification des sessions par hash SHA-256 du chemin absolu du répertoire actif. Chaque dossier de travail possède sa propre mémoire isolée.

### 5. Mode Serveur MCP (`mcp`)
Expose le CLI comme un serveur local standardisé en suivant le protocole **Model Context Protocol** de Anthropic.
* Permet à des clients IA externes comme **Claude Desktop**, **Cursor** ou **VS Code** d'appeler les outils locaux de `code-caricature` (`get_project_context`, `get_dependency_graph`, `apply_code_changes`).
* Redirige automatiquement toutes les instructions de log `stdout` vers `stderr` pour ne pas perturber le protocole JSON-RPC de communication de l'agent.

---

## ⚙️ Configuration du Serveur MCP (Claude Desktop)

Pour connecter Claude Desktop à votre serveur local `code-caricature`, modifiez votre fichier de configuration `%APPDATA%\Claude\claude_desktop_config.json` sous Windows :

```json
{
  "mcpServers": {
    "code-caricature": {
      "command": "node",
      "args": [
        "D:\\caricature\\context-bridge\\dist\\index.js",
        "mcp"
      ]
    }
  }
}
```
*(Remplacez le chemin absolu vers `dist/index.js` par celui correspondant à votre répertoire d'installation réel).*

---

## 🧠 Note d'Architecture pour les Agents IA de passage

> [!NOTE]
> Cette section est destinée aux assistants IA qui travaillent sur cette base de code.
> * Le projet utilise une architecture **CommonJS** (`"type": "commonjs"` dans `package.json`).
> * La bibliothèque `node-llama-cpp` est un module ESM avec "top-level await" et ne peut pas être importée classiquement via `require` en CommonJS. Pour contourner la transpilation TypeScript, nous utilisons l'évaluation dynamique : `Function('return import("node-llama-cpp")')()`. Ne modifiez pas cette logique au risque de casser le chargement de l'IA locale.
> * Les logs destinés aux humains doivent utiliser les fonctions formatées de `src/ui.ts`. En mode MCP (`src/mcp-server.ts`), la sortie standard `console.log` est désactivée et redirigée vers la sortie d'erreur standard `console.error` pour préserver le flux de communication JSON-RPC de `stdout`.
