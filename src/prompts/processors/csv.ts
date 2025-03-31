import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import logger from '../../logger';
import type { Prompt } from '../../types';

/**
 * Processes a CSV file containing prompts
 * @param filePath - Path to the CSV file
 * @param prompt - Base prompt object with default properties
 * @returns Array of processed prompts
 */
export async function processCsvPrompts(
  filePath: string,
  prompt: Partial<Prompt>,
): Promise<Prompt[]> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV with header detection
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Allow rows with different column counts
      // csv-parse auto-detects headers by default, we'll handle the single column case manually
    });
    
    // No rows found
    if (records.length === 0) {
      logger.warn(`No prompts found in CSV file: ${filePath}`);
      return [];
    }
    
    // Check if this is a headerless single column CSV
    const firstRow = records[0];
    const keys = Object.keys(firstRow);
    
    // Single column CSV - could be with or without header
    if (keys.length === 1) {
      const columnName = keys[0];
      
      // If the first value looks like a header ("prompt"), treat it as such and skip first row
      // Otherwise, treat as headerless and use all rows
      const startsAtIndex = columnName.toLowerCase() === 'prompt' ? 1 : 0;
      
      return records.slice(startsAtIndex).map((row: Record<string, string>, index: number) => {
        const rawValue = row[columnName];
        return {
          ...prompt,
          raw: rawValue,
          label: prompt.label || `Prompt ${index + 1}`,
        };
      });
    }
    
    // Multi-column CSV - we expect a header row
    // Re-parse with headers
    const recordsWithHeaders = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    // Validate column names
    const columns = Object.keys(recordsWithHeaders[0]).map(c => c.toLowerCase());
    if (!columns.includes('prompt')) {
      throw new Error(`CSV file must contain a 'prompt' column. Found: ${columns.join(', ')}`);
    }
    
    // Process rows
    return recordsWithHeaders.map((row: Record<string, string>, index: number) => {
      // Find prompt column (case insensitive)
      const promptKey = Object.keys(row).find(k => k.toLowerCase() === 'prompt');
      const labelKey = Object.keys(row).find(k => k.toLowerCase() === 'label');
      const idKey = Object.keys(row).find(k => k.toLowerCase() === 'id');
      const configKey = Object.keys(row).find(k => k.toLowerCase() === 'config');
      
      if (!promptKey || !row[promptKey]) {
        logger.warn(`Skipping row ${index + 1} due to missing prompt value`);
        return null;
      }
      
      const rawPrompt = row[promptKey];
      const label = labelKey && row[labelKey] ? row[labelKey] : prompt.label || rawPrompt.substring(0, 30) + (rawPrompt.length > 30 ? '...' : '');
      const id = idKey && row[idKey] ? row[idKey] : undefined;
      
      // Parse config if provided
      let config = undefined;
      if (configKey && row[configKey]) {
        try {
          config = JSON.parse(row[configKey]);
        } catch {
          logger.warn(`Invalid JSON in config column for row ${index + 1}: ${row[configKey]}`);
        }
      }
      
      return {
        ...prompt,
        raw: rawPrompt,
        label,
        ...(id ? { id } : {}),
        ...(config ? { config } : {}),
      };
    }).filter(Boolean) as Prompt[];
  } catch (error) {
    logger.error(`Error processing CSV prompts from ${filePath}: ${error}`);
    throw error;
  }
} 