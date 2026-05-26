/**
 * Test MCP server: spawn code-caricature mcp and call tools via stdio.
 * Usage: node scripts/test-mcp.js
 */
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { ListToolsResultSchema, CallToolResultSchema } = require('@modelcontextprotocol/sdk/types.js');

const indexJs = path.resolve(__dirname, '..', 'dist', 'index.js');
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('=== Test MCP code-caricature ===\n');
  console.log('Serveur:', indexJs);
  console.log('CWD:', projectRoot, '\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [indexJs, 'mcp'],
    cwd: projectRoot,
    stderr: 'inherit',
  });

  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    console.log('[OK] Connexion MCP établie\n');

    const toolsResult = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);
    console.log(`[OK] Outils disponibles (${toolsResult.tools.length}) :`);
    for (const t of toolsResult.tools) {
      console.log(`  - ${t.name}: ${(t.description || '').slice(0, 80)}...`);
    }
    console.log('');

    const ctxResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'get_project_context',
          arguments: { architecture: true, includeExts: ['.ts'] },
        },
      },
      CallToolResultSchema
    );

    const text = ctxResult.content?.find((c) => c.type === 'text')?.text || '';
    console.log('[OK] get_project_context (architecture, .ts only)');
    console.log(`     Taille réponse: ${text.length} caractères`);
    console.log(`     Extrait: ${text.slice(0, 200).replace(/\n/g, ' ')}...\n`);

    const graphResult = await client.request(
      {
        method: 'tools/call',
        params: { name: 'get_dependency_graph', arguments: {} },
      },
      CallToolResultSchema
    );
    const graphText = graphResult.content?.find((c) => c.type === 'text')?.text || '';
    console.log('[OK] get_dependency_graph');
    console.log(`     Taille: ${graphText.length} caractères\n`);

    console.log('=== MCP fonctionne correctement ===');
  } catch (err) {
    console.error('[ERREUR]', err.message || err);
    process.exit(1);
  } finally {
    try {
      await transport.close();
    } catch (_) {}
  }
}

main();
