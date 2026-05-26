/**
 * mcp-server.ts
 *
 * Implémentation du serveur Model Context Protocol (MCP) pour code-caricature.
 * Expose les fonctionnalités principales sous forme d'outils réutilisables par des clients IA.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Importation des utilitaires internes de code-caricature
import { scanDirectory, generateTree, readFilesContent } from "./scanner";
import { formatContext } from "./formatter";
import { extractSignatures, formatSignatures } from "./ast-parser";
import { buildDependencyGraph, formatDependencyGraph } from "./dep-graph";
import { parseAIResponse, generateDiff, applyCodeBlocks } from "./importer";
import { getPackageVersion } from "./version";

// Initialisation du serveur MCP
const server = new McpServer({
  name: "code-caricature-server",
  version: getPackageVersion(),
});

// Outil 1 : get_project_context
server.registerTool(
  "get_project_context",
  {
    description: "Exporter le contexte du projet local (arborescence, signatures AST, ou contenu complet des fichiers).",
    inputSchema: z.object({
      architecture: z.boolean().optional().describe("Si vrai, extrait uniquement les signatures (classes, interfaces, fonctions) au lieu du code complet (mode léger)."),
      focusFiles: z.array(z.string()).optional().describe("Liste des chemins relatifs de fichiers à mettre en évidence (focus)."),
      includeExts: z.array(z.string()).optional().describe("Extensions de fichiers à inclure (ex: ['.ts', '.js']). Par défaut, inclut tous les fichiers non ignorés."),
      sinceHours: z.number().optional().describe("Filtrer les fichiers modifiés depuis N heures."),
      includeGraph: z.boolean().optional().describe("Si vrai, inclut le graphe de dépendances textuel du projet.")
    })
  },
  async (args) => {
    try {
      const targetDir = process.cwd();
      const includeExts = args.includeExts || [];
      const sinceMs = args.sinceHours ? Date.now() - (args.sinceHours * 60 * 60 * 1000) : undefined;

      const files = scanDirectory(targetDir, targetDir, undefined, { includeExts, sinceMs });
      const { contents, securityReport } = readFilesContent(targetDir, files, true);

      const tree = generateTree(files);

      // Mode Architecture (AST)
      let architectureContents: { [key: string]: string } | undefined;
      if (args.architecture) {
        architectureContents = {};
        for (const [filePath, content] of Object.entries(contents)) {
          if (content.startsWith('//')) continue;
          const sigs = extractSignatures(content, filePath);
          architectureContents[filePath] = formatSignatures(sigs, filePath);
        }
      }

      // Graphe de dépendances
      let depGraphText: string | undefined;
      if (args.includeGraph) {
        const graph = buildDependencyGraph(targetDir, files, contents);
        depGraphText = formatDependencyGraph(graph, args.focusFiles?.[0]);
      }

      const formatted = formatContext({
        tree,
        contents,
        target: 'gpt',
        focus: args.focusFiles || [],
        architectureMode: !!args.architecture,
        architectureContents,
        dependencyGraph: depGraphText,
      });

      let message = formatted;
      if (securityReport.length > 0) {
        message = `[🔒 FILTRE DE SÉCURITÉ : ${securityReport.length} élément(s) masqué(s)]\n\n${message}`;
      }

      return {
        content: [{ type: "text", text: message }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Erreur lors de la récupération du contexte : ${err.message}` }],
        isError: true
      };
    }
  }
);

// Outil 2 : apply_code_changes
server.registerTool(
  "apply_code_changes",
  {
    description: "Appliquer les modifications de code suggérées par l'IA dans les fichiers locaux du projet.",
    inputSchema: z.object({
      content: z.string().describe("Le texte complet ou les blocs de code générés par l'IA contenant les fichiers et les modifications (au format ```lang chemin ou <file path=...)."),
      dryRun: z.boolean().optional().describe("Si vrai, prévisualise les modifications sous forme de diff sans les appliquer physiquement aux fichiers.")
    })
  },
  async (args) => {
    try {
      const targetDir = process.cwd();
      const blocks = parseAIResponse(args.content);

      if (blocks.length === 0) {
        return {
          content: [{
            type: "text",
            text: "Aucun bloc de code avec chemin de fichier n'a été détecté dans le contenu fourni."
          }]
        };
      }

      let diffText = "";
      for (const block of blocks) {
        const fullPath = path.resolve(targetDir, block.filePath);
        if (fs.existsSync(fullPath)) {
          const oldContent = fs.readFileSync(fullPath, "utf8");
          diffText += generateDiff(oldContent, block.content, block.filePath) + "\n";
        } else {
          diffText += `\n📝 Nouveau fichier : ${block.filePath} (${block.content.split('\n').length} lignes)\n`;
        }
      }

      if (args.dryRun) {
        return {
          content: [{
            type: "text",
            text: `[DRY-RUN] Diffs de modifications :\n${diffText}`
          }]
        };
      }

      const result = applyCodeBlocks(targetDir, blocks, false);
      let outputText = `Diffs appliqués :\n${diffText}\n\n`;
      outputText += `Résultat de l'application :\n`;
      outputText += `- Fichiers modifiés : ${result.applied.join(", ") || "aucun"}\n`;
      outputText += `- Fichiers créés : ${result.created.join(", ") || "aucun"}\n`;
      if (result.errors.length > 0) {
        outputText += `- Erreurs : ${result.errors.join(", ")}\n`;
      }

      return {
        content: [{ type: "text", text: outputText }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Erreur lors de l'application des modifications : ${err.message}` }],
        isError: true
      };
    }
  }
);

// Outil 3 : get_dependency_graph
server.registerTool(
  "get_dependency_graph",
  {
    description: "Générer et obtenir le graphe de dépendances textuel du projet actuel.",
    inputSchema: z.object({
      focusFile: z.string().optional().describe("Chemin relatif d'un fichier sur lequel focaliser l'analyse du graphe.")
    })
  },
  async (args) => {
    try {
      const targetDir = process.cwd();
      const files = scanDirectory(targetDir, targetDir, undefined, {});
      const { contents } = readFilesContent(targetDir, files, true);

      const graph = buildDependencyGraph(targetDir, files, contents);
      const depGraphText = formatDependencyGraph(graph, args.focusFile);

      return {
        content: [{ type: "text", text: depGraphText }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Erreur lors de la génération du graphe : ${err.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Fonction de démarrage du serveur MCP
 */
export async function runMcpServer() {
  // Rediriger console.log et console.info vers console.error pour éviter de corrompre le canal stdout
  console.log = (...args: any[]) => {
    console.error(...args);
  };
  console.info = (...args: any[]) => {
    console.error(...args);
  };

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Serveur MCP code-caricature démarré avec succès sur stdio.");
  } catch (err: any) {
    console.error(`Échec du démarrage du serveur MCP : ${err.message}`);
    process.exit(1);
  }
}
