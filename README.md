# Code Caricature (`context-bridge`)

> **Projet en développement** — API et fonctionnalités peuvent changer.

CLI local pour faire le lien entre votre **IDE**, votre **IA externe** (navigateur ou autre) et vos **fichiers de projet** : export de contexte, import de corrections, sans recopier fichier par fichier.

---

## Démarrage rapide

```bash
cd context-bridge
npm install
npm run build
node dist/index.js
```

| Commande | Rôle |
|----------|------|
| `node dist/index.js` | Tableau de bord interactif |
| `node dist/index.js bridge --clipboard` | Appliquer la réponse IA (presse-papiers) |
| `node dist/index.js export` | Exporter le contexte du projet |
| `node dist/index.js import --clipboard` | Importer des modifications |
| `npm run doctor` | Diagnostic (build, MCP, modèles) |

---

## Usage principal : pont IDE ↔ IA externe

**L’import/export de fichiers ne nécessite pas l’IA intégrée au CLI** — ce sont des opérations directes sur le disque.

1. **IDE → IA** : export → collez le contexte dans votre IA.
2. **IA → IDE** : copiez la réponse → `bridge --clipboard` ou menu « Pont IA → IDE ».

Pour des réponses importables, utilisez le menu **« Instructions format import »** (blocs avec chemin de fichier).

### Session liée (compagnon)

Pendant une discussion avec votre IA externe, le menu **« Session liée »** accompagne export/import : vérification avant import, alertes, bilan. L’IA du CLI intervient surtout en cas de problème — pas pour remplacer l’import automatique.

---

## Rôles des composants

| Composant | Rôle |
|-----------|------|
| **Export / import** | Transfert de contexte et de code (automatique) |
| **Session liée** | Surveillance légère, validation, historique de la session |
| **Discussion (`attitude chat`)** | Aide code, questions courtes, secours |
| **Tutoriel** | Transcription découpée, mentorat pas à pas |
| **MCP** | Intégration avec certains clients (IDE / assistants) |

---

## Configuration MCP (optionnel)

Exemple Windows (`claude_desktop_config.json`) — adaptez le chemin :

```json
{
  "mcpServers": {
    "code-caricature": {
      "command": "node",
      "args": ["CHEMIN_VERS/dist/index.js", "mcp"]
    }
  }
}
```

---

## Notes techniques (contributeurs)

- CommonJS (`"type": "commonjs"`).
- `node-llama-cpp` : import dynamique `Function('return import("node-llama-cpp")')()` — ne pas remplacer par un `require` classique.
- Mode MCP : logs humains via `stderr` uniquement.
