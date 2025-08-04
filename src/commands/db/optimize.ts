import { Command } from 'commander';
import chalk from 'chalk';
import { getDb } from '../../database';
import {
  analyzeIndexUsage,
  applyIndexOptimizations,
  getIndexStats,
  optimizeDatabase,
} from '../../database/optimizations';
import logger from '../../logger';

export function dbOptimizeCommand(): Command {
  const command = new Command('optimize');
  
  command
    .description('Optimize database indexes and performance')
    .option('--analyze', 'Analyze current index usage and provide recommendations')
    .option('--apply', 'Apply recommended index optimizations')
    .option('--vacuum', 'Vacuum and rebuild the database to reclaim space')
    .option('--stats', 'Show index statistics')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--all', 'Run all optimizations (analyze, apply, vacuum)')
    .action(async (options) => {
      try {
        const db = getDb();
        
        console.log(chalk.blue('🔧 Database Optimization Tool\n'));

        // If no specific options, show stats and recommendations
        if (!options.analyze && !options.apply && !options.vacuum && !options.stats && !options.all) {
          options.stats = true;
          options.analyze = true;
        }

        // Show stats
        if (options.stats || options.all) {
          console.log(chalk.yellow('📊 Index Statistics:'));
          const stats = await getIndexStats(db);
          
          console.log(`  Total indexes: ${stats.totalIndexes}`);
          console.log(`  Fragmentation: ${stats.fragmentationScore}%`);
          console.log('\n  Indexes by table:');
          
          for (const [table, count] of Object.entries(stats.indexesByTable)) {
            console.log(`    ${table}: ${count}`);
          }
          console.log();
        }

        // Analyze usage
        if (options.analyze || options.all) {
          console.log(chalk.yellow('🔍 Analyzing index usage...'));
          const analysis = await analyzeIndexUsage(db);
          
          if (analysis.missingIndexes.length > 0) {
            console.log(chalk.red(`\n  Missing indexes (${analysis.missingIndexes.length}):`));
            for (const idx of analysis.missingIndexes) {
              console.log(`    - ${idx}`);
            }
          } else {
            console.log(chalk.green('  ✓ All recommended indexes are present'));
          }

          if (analysis.recommendations.length > 0) {
            console.log(chalk.yellow('\n  Recommendations:'));
            for (const rec of analysis.recommendations) {
              console.log(`    • ${rec}`);
            }
          }
          console.log();
        }

        // Apply optimizations
        if (options.apply || options.all) {
          console.log(chalk.yellow('⚡ Applying index optimizations...'));
          const applyResult = await applyIndexOptimizations(db, { dryRun: options.dryRun });
          
          if (applyResult.applied.length > 0) {
            console.log(chalk.green(`\n  Applied (${applyResult.applied.length}):`));
            for (const idx of applyResult.applied) {
              console.log(`    ✓ ${idx}`);
            }
          }

          if (applyResult.skipped.length > 0) {
            console.log(chalk.gray(`\n  Skipped (${applyResult.skipped.length}):`));
            for (const idx of applyResult.skipped) {
              console.log(`    - ${idx}`);
            }
          }

          if (applyResult.errors.length > 0) {
            console.log(chalk.red(`\n  Errors (${applyResult.errors.length}):`));
            for (const err of applyResult.errors) {
              console.log(`    ✗ ${err}`);
            }
          }
          console.log();
        }

        // Vacuum database
        if (options.vacuum || options.all) {
          if (options.dryRun) {
            console.log(chalk.yellow('🧹 [DRY RUN] Would vacuum and optimize database'));
          } else {
            console.log(chalk.yellow('🧹 Vacuuming and optimizing database...'));
            console.log(chalk.gray('  This may take a while for large databases...'));
            
            const vacuumResult = await optimizeDatabase(db);
            
            if (vacuumResult.success) {
              console.log(chalk.green(`\n  ✓ ${vacuumResult.message}`));
              
              if (vacuumResult.sizeBeforeBytes && vacuumResult.sizeAfterBytes) {
                const sizeBefore = (vacuumResult.sizeBeforeBytes / 1024 / 1024).toFixed(2);
                const sizeAfter = (vacuumResult.sizeAfterBytes / 1024 / 1024).toFixed(2);
                console.log(`    Size: ${sizeBefore} MB → ${sizeAfter} MB`);
              }
            } else {
              console.log(chalk.red(`\n  ✗ ${vacuumResult.message}`));
            }
          }
          console.log();
        }

        console.log(chalk.green('✨ Database optimization complete!'));

        // Additional tips
        console.log(chalk.gray('\nTips:'));
        console.log(chalk.gray('  • Run with --all to apply all optimizations'));
        console.log(chalk.gray('  • Use --dry-run to preview changes'));
        console.log(chalk.gray('  • Run periodically to maintain performance'));
        
        if (stats.fragmentationScore > 20) {
          console.log(chalk.yellow('\n⚠️  High fragmentation detected. Consider running with --vacuum'));
        }

      } catch (error) {
        logger.error('Database optimization failed:', error);
        console.error(chalk.red('\n❌ Error:'), error);
        process.exit(1);
      }
    });

  return command;
}

// Also create a parent db command if it doesn't exist
export function dbCommand(program: Command): void {
  const command = program
    .command('db')
    .description('Database management commands');
    
  command.addCommand(dbOptimizeCommand());
  
  // Add other db commands here in the future (backup, restore, etc.)
}