export type TargetModel = 'gpt' | 'claude';

export interface FormatOptions {
    tree: string;
    contents: { [path: string]: string };
    target: TargetModel;
    issue?: string;
    focus?: string[];
    architectureMode?: boolean;
    architectureContents?: { [path: string]: string };
    dependencyGraph?: string;
}

// ─── Cost Estimation ────────────────────────────────────────────────

interface CostEstimate {
    model: string;
    inputCostPer1M: number;
    outputCostPer1M: number;
    estimatedInputCost: number;
}

const MODEL_COSTS: CostEstimate[] = [
    { model: 'GPT-4o',       inputCostPer1M: 2.5,  outputCostPer1M: 10,  estimatedInputCost: 0 },
    { model: 'GPT-4o mini',  inputCostPer1M: 0.15, outputCostPer1M: 0.6, estimatedInputCost: 0 },
    { model: 'Claude Sonnet', inputCostPer1M: 3,    outputCostPer1M: 15,  estimatedInputCost: 0 },
    { model: 'Claude Haiku',  inputCostPer1M: 0.25, outputCostPer1M: 1.25, estimatedInputCost: 0 },
    { model: 'Gemini Pro',    inputCostPer1M: 1.25, outputCostPer1M: 5,   estimatedInputCost: 0 },
];

export function estimateCost(tokens: number): CostEstimate[] {
    return MODEL_COSTS.map(m => ({
        ...m,
        estimatedInputCost: (tokens / 1_000_000) * m.inputCostPer1M,
    }));
}

export function formatCostTable(estimates: CostEstimate[]): string {
    let table = '  💰  Coût estimé (API) :\n';
    table += '  ┌─────────────────┬──────────────┐\n';
    table += '  │ Modèle          │ Coût (input) │\n';
    table += '  ├─────────────────┼──────────────┤\n';
    for (const e of estimates) {
        const cost = e.estimatedInputCost < 0.01
            ? `< $0.01`
            : `$${e.estimatedInputCost.toFixed(3)}`;
        table += `  │ ${e.model.padEnd(15)} │ ${cost.padEnd(12)} │\n`;
    }
    table += '  └─────────────────┴──────────────┘\n';
    return table;
}

// ─── Main Formatter ─────────────────────────────────────────────────

export function formatContext(options: FormatOptions): string {
    let result = '';

    const focusFiles = options.focus || [];
    const allPaths = Object.keys(options.contents);
    const normalFiles = allPaths.filter(f => !focusFiles.includes(f));
    const focusedFilesList = allPaths.filter(f => focusFiles.includes(f));

    if (options.target === 'claude') {
        if (options.issue) {
            result += `<user_instruction>\n${options.issue}\n</user_instruction>\n\n`;
        }

        result += `<project_context>\n`;
        result += `  <project_tree>\n${options.tree}\n  </project_tree>\n`;

        if (options.dependencyGraph) {
            result += `  <dependency_graph>\n${options.dependencyGraph}\n  </dependency_graph>\n`;
        }

        result += `  <project_files>\n`;

        // Architecture mode: show signatures only
        if (options.architectureMode && options.architectureContents) {
            for (const [filePath, content] of Object.entries(options.architectureContents)) {
                const isFocused = focusFiles.includes(filePath);
                result += `    <file path="${filePath}" mode="architecture"${isFocused ? ' focus="true"' : ''}>\n`;
                result += `${content}\n`;
                result += `    </file>\n`;
            }
            // If focus files exist, include their full content too
            for (const filePath of focusedFilesList) {
                result += `    <file path="${filePath}" mode="full" focus="true">\n`;
                result += `${options.contents[filePath]}\n`;
                result += `    </file>\n`;
            }
        } else {
            for (const filePath of focusedFilesList) {
                result += `    <file path="${filePath}" focus="true">\n`;
                result += `${options.contents[filePath]}\n`;
                result += `    </file>\n`;
            }
            for (const filePath of normalFiles) {
                result += `    <file path="${filePath}">\n`;
                result += `${options.contents[filePath]}\n`;
                result += `    </file>\n`;
            }
        }

        result += `  </project_files>\n`;
        result += `</project_context>`;
    } else {
        // GPT / Markdown
        if (options.issue) {
            result += `# 🎯 User Instruction\n\n**${options.issue}**\n\n---\n\n`;
        }

        result += `# Project Context\n\n`;
        result += `## 📂 Directory Structure\n`;
        result += `\`\`\`text\n${options.tree}\n\`\`\`\n\n`;

        if (options.dependencyGraph) {
            result += `## 🔗 Dependency Graph\n`;
            result += `\`\`\`text\n${options.dependencyGraph}\n\`\`\`\n\n`;
        }

        result += `## 📄 Files\n\n`;

        if (options.architectureMode && options.architectureContents) {
            result += `### 🏗️ Architecture Overview (Signatures Only)\n\n`;
            for (const [filePath, content] of Object.entries(options.architectureContents)) {
                const ext = filePath.split('.').pop() || 'text';
                result += `#### \`${filePath}\`\n`;
                result += `\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
            }
            if (focusedFilesList.length > 0) {
                result += `### 🔥 Full Code (Focused Files)\n\n`;
                for (const filePath of focusedFilesList) {
                    const ext = filePath.split('.').pop() || 'text';
                    result += `#### \`${filePath}\`\n`;
                    result += `\`\`\`${ext}\n${options.contents[filePath]}\n\`\`\`\n\n`;
                }
            }
        } else {
            if (focusedFilesList.length > 0) {
                result += `### 🔥 FOCUSED FILES\n\n`;
                for (const filePath of focusedFilesList) {
                    const ext = filePath.split('.').pop() || 'text';
                    result += `#### \`${filePath}\`\n`;
                    result += `\`\`\`${ext}\n${options.contents[filePath]}\n\`\`\`\n\n`;
                }
                result += `### Other Files\n\n`;
            }
            for (const filePath of normalFiles) {
                const ext = filePath.split('.').pop() || 'text';
                result += `#### \`${filePath}\`\n`;
                result += `\`\`\`${ext}\n${options.contents[filePath]}\n\`\`\`\n\n`;
            }
        }
    }

    return result;
}
