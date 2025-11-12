// Dynamic table exports based on database type
import { getEnvBool } from '../envars';

// Detect if MySQL should be used (duplicated to avoid circular dependency)
function shouldUseMysql(): boolean {
  // Check explicit flag
  if (getEnvBool('PROMPTFOO_USE_MYSQL', false)) {
    return true;
  }
  
  // Check if MySQL environment variables are set
  const mysqlHost = process.env.PROMPTFOO_MYSQL_HOST;
  const mysqlDatabase = process.env.PROMPTFOO_MYSQL_DATABASE;
  
  // Use MySQL if host is explicitly set (and not testing)
  return !!(mysqlHost && mysqlDatabase) && !getEnvBool('IS_TESTING');
}

// Export the appropriate table definitions based on database type
let tables: any;

if (shouldUseMysql()) {
  // Use MySQL table definitions
  tables = require('./mysql-tables');
} else {
  // Use SQLite table definitions (default)
  tables = require('./tables');
}

// Re-export all tables
export const {
  promptsTable,
  evalsTable,
  evalResultsTable,
  evalsToPromptsTable,
  evalsToDatasetsTable,
  evalsToTagsTable,
  datasetsTable,
  tagsTable,
  modelAuditsTable,
  tracesTable,
  spansTable,
  configsTable,
} = tables;

// Export relations if they exist
export const {
  evalsTableRelations,
  promptsTableRelations,
  evalResultsTableRelations,
  datasetsTableRelations,
  tagsTableRelations,
  evalsToPromptsTableRelations,
  evalsToDatasetsTableRelations,
  evalsToTagsTableRelations,
  modelAuditsTableRelations,
  tracesTableRelations,
  spansTableRelations,
  configsTableRelations,
} = tables;