import * as fs from 'fs';
import * as path from 'path';

/**
 * Script to help identify which MCP tools need to be refactored to use AbstractTool
 */

const toolsDir = path.join(__dirname, '../src/commands/mcp/tools');
const refactoredTools = ['listEvaluations.ts', 'getEvaluationDetails.ts', 'validatePromptfooConfig.ts'];

async function analyzeTools() {
  const files = fs.readdirSync(toolsDir);
  const toolFiles = files.filter(f => f.endsWith('.ts'));
  
  console.log('MCP Tools Refactoring Status:\n');
  console.log('✅ Already Refactored:');
  refactoredTools.forEach(tool => console.log(`   - ${tool}`));
  
  console.log('\n❌ Need Refactoring:');
  const needsRefactoring = toolFiles.filter(f => !refactoredTools.includes(f));
  needsRefactoring.forEach(tool => {
    const content = fs.readFileSync(path.join(toolsDir, tool), 'utf-8');
    const hasAbstractTool = content.includes('extends AbstractTool');
    const hasServerTool = content.includes('server.tool(');
    
    if (!hasAbstractTool && hasServerTool) {
      console.log(`   - ${tool}`);
    }
  });
  
  console.log('\n📊 Summary:');
  console.log(`   Total tools: ${toolFiles.length}`);
  console.log(`   Refactored: ${refactoredTools.length}`);
  console.log(`   Remaining: ${toolFiles.length - refactoredTools.length}`);
}

analyzeTools().catch(console.error); 