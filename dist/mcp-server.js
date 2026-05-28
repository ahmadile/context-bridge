"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMcpServer = runMcpServer;
/**
 * mcp-server.ts
 *
 * Implémentation du serveur Model Context Protocol (MCP) pour code-caricature.
 * Expose les fonctionnalités principales sous forme d'outils réutilisables par des clients IA.
 */
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Importation des utilitaires internes de code-caricature
const scanner_1 = require("./scanner");
const formatter_1 = require("./formatter");
const ast_parser_1 = require("./ast-parser");
const dep_graph_1 = require("./dep-graph");
const importer_1 = require("./importer");
const version_1 = require("./version");
// Initialisation du serveur MCP
const server = new mcp_js_1.McpServer({
    name: "code-caricature-server",
    version: (0, version_1.getPackageVersion)(),
});
// Outil 1 : get_project_context
server.registerTool("get_project_context", {
    description: "Exporter le contexte du projet local (arborescence, signatures AST, ou contenu complet des fichiers).",
    inputSchema: zod_1.z.object({
        architecture: zod_1.z.boolean().optional().describe("Si vrai, extrait uniquement les signatures (classes, interfaces, fonctions) au lieu du code complet (mode léger)."),
        focusFiles: zod_1.z.array(zod_1.z.string()).optional().describe("Liste des chemins relatifs de fichiers à mettre en évidence (focus)."),
        includeExts: zod_1.z.array(zod_1.z.string()).optional().describe("Extensions de fichiers à inclure (ex: ['.ts', '.js']). Par défaut, inclut tous les fichiers non ignorés."),
        sinceHours: zod_1.z.number().optional().describe("Filtrer les fichiers modifiés depuis N heures."),
        includeGraph: zod_1.z.boolean().optional().describe("Si vrai, inclut le graphe de dépendances textuel du projet.")
    })
}, async (args) => {
    try {
        const targetDir = process.cwd();
        const includeExts = args.includeExts || [];
        const sinceMs = args.sinceHours ? Date.now() - (args.sinceHours * 60 * 60 * 1000) : undefined;
        const files = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, { includeExts, sinceMs });
        const { contents, securityReport } = (0, scanner_1.readFilesContent)(targetDir, files, true);
        const tree = (0, scanner_1.generateTree)(files);
        // Mode Architecture (AST)
        let architectureContents;
        if (args.architecture) {
            architectureContents = {};
            for (const [filePath, content] of Object.entries(contents)) {
                if (content.startsWith('//'))
                    continue;
                const sigs = (0, ast_parser_1.extractSignatures)(content, filePath);
                architectureContents[filePath] = (0, ast_parser_1.formatSignatures)(sigs, filePath);
            }
        }
        // Graphe de dépendances
        let depGraphText;
        if (args.includeGraph) {
            const graph = (0, dep_graph_1.buildDependencyGraph)(targetDir, files, contents);
            depGraphText = (0, dep_graph_1.formatDependencyGraph)(graph, args.focusFiles?.[0]);
        }
        const formatted = (0, formatter_1.formatContext)({
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
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Erreur lors de la récupération du contexte : ${err.message}` }],
            isError: true
        };
    }
});
// Outil 2 : apply_code_changes
server.registerTool("apply_code_changes", {
    description: "Appliquer les modifications de code suggérées par l'IA dans les fichiers locaux du projet.",
    inputSchema: zod_1.z.object({
        content: zod_1.z.string().describe("Le texte complet ou les blocs de code générés par l'IA contenant les fichiers et les modifications (au format ```lang chemin ou <file path=...)."),
        dryRun: zod_1.z.boolean().optional().describe("Si vrai, prévisualise les modifications sous forme de diff sans les appliquer physiquement aux fichiers.")
    })
}, async (args) => {
    try {
        const targetDir = process.cwd();
        const blocks = (0, importer_1.parseAIResponse)(args.content);
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
            const fullPath = path_1.default.resolve(targetDir, block.filePath);
            if (fs_1.default.existsSync(fullPath)) {
                const oldContent = fs_1.default.readFileSync(fullPath, "utf8");
                diffText += (0, importer_1.generateDiff)(oldContent, block.content, block.filePath) + "\n";
            }
            else {
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
        const result = (0, importer_1.applyCodeBlocks)(targetDir, blocks, false);
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
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Erreur lors de l'application des modifications : ${err.message}` }],
            isError: true
        };
    }
});
// Outil 3 : get_dependency_graph
server.registerTool("get_dependency_graph", {
    description: "Générer et obtenir le graphe de dépendances textuel du projet actuel.",
    inputSchema: zod_1.z.object({
        focusFile: zod_1.z.string().optional().describe("Chemin relatif d'un fichier sur lequel focaliser l'analyse du graphe.")
    })
}, async (args) => {
    try {
        const targetDir = process.cwd();
        const files = (0, scanner_1.scanDirectory)(targetDir, targetDir, undefined, {});
        const { contents } = (0, scanner_1.readFilesContent)(targetDir, files, true);
        const graph = (0, dep_graph_1.buildDependencyGraph)(targetDir, files, contents);
        const depGraphText = (0, dep_graph_1.formatDependencyGraph)(graph, args.focusFile);
        return {
            content: [{ type: "text", text: depGraphText }]
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Erreur lors de la génération du graphe : ${err.message}` }],
            isError: true
        };
    }
});
/**
 * Fonction de démarrage du serveur MCP
 */
async function runMcpServer() {
    // Rediriger console.log et console.info vers console.error pour éviter de corrompre le canal stdout
    console.log = (...args) => {
        console.error(...args);
    };
    console.info = (...args) => {
        console.error(...args);
    };
    try {
        const transport = new stdio_js_1.StdioServerTransport();
        await server.connect(transport);
        console.error("Serveur MCP code-caricature démarré avec succès sur stdio.");
    }
    catch (err) {
        console.error(`Échec du démarrage du serveur MCP : ${err.message}`);
        process.exit(1);
    }
}
