import { eq, and, desc } from 'drizzle-orm';
import type { Request, Response } from 'express';
import express from 'express';
import { getDb } from '../../database';
import {
  managedPromptsTable,
  promptVersionsTable,
  promptDeploymentsTable,
} from '../../database/tables';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { PromptManager } from '../../prompts/management/PromptManager';
import telemetry from '../../telemetry';
import type { ManagedPromptWithVersions } from '../../types/prompt-management';

const VALID_ID_REGEX = /^[a-zA-Z0-9-_]+$/;

// Helper function to get prompt with versions
async function getPromptWithVersions(promptId: string): Promise<ManagedPromptWithVersions | null> {
  const db = getDb();

  const promptRows = await db
    .select()
    .from(managedPromptsTable)
    .where(eq(managedPromptsTable.id, promptId))
    .limit(1);

  if (promptRows.length === 0) {
    return null;
  }

  const prompt = promptRows[0];

  // Get versions
  const versions = await db
    .select()
    .from(promptVersionsTable)
    .where(eq(promptVersionsTable.promptId, promptId))
    .orderBy(promptVersionsTable.version);

  // Get deployments
  const deployments = await db
    .select({
      environment: promptDeploymentsTable.environment,
      versionId: promptDeploymentsTable.versionId,
    })
    .from(promptDeploymentsTable)
    .leftJoin(promptVersionsTable, eq(promptDeploymentsTable.versionId, promptVersionsTable.id))
    .where(eq(promptDeploymentsTable.promptId, promptId));

  // Build deployments map
  const deploymentsMap: Record<string, number> = {};
  for (const dep of deployments) {
    const version = versions.find((v) => v.id === dep.versionId);
    if (version) {
      deploymentsMap[dep.environment] = version.version;
    }
  }

  return {
    ...prompt,
    description: prompt.description || undefined,
    tags: prompt.tags || undefined,
    author: prompt.author || undefined,
    createdAt: new Date(prompt.createdAt),
    updatedAt: new Date(prompt.updatedAt),
    versions: versions.map((v) => ({
      ...v,
      createdAt: new Date(v.createdAt),
      author: v.author || undefined,
      notes: v.notes || undefined,
      config: v.config ? JSON.parse(v.config) : undefined,
      contentType: (v.contentType || undefined) as 'string' | 'json' | 'function' | 'file' | undefined,
      functionSource: v.functionSource || undefined,
      functionName: v.functionName || undefined,
      fileFormat: v.fileFormat || undefined,
      transform: v.transform || undefined,
      label: v.label || undefined,
    })),
    deployments: deploymentsMap,
  };
}

export const promptsRouter = express.Router();

// List all prompts
promptsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const prompts = await db
      .select({
        id: managedPromptsTable.id,
        name: managedPromptsTable.name,
        description: managedPromptsTable.description,
        tags: managedPromptsTable.tags,
        currentVersion: managedPromptsTable.currentVersion,
        createdAt: managedPromptsTable.createdAt,
        updatedAt: managedPromptsTable.updatedAt,
        author: managedPromptsTable.author,
      })
      .from(managedPromptsTable)
      .orderBy(desc(managedPromptsTable.updatedAt));

    res.json(prompts || []);
  } catch (error) {
    logger.error(`Error listing prompts: ${error}`);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// Create a new prompt
promptsRouter.post('/', async (req, res) => {
  try {
    const {
      id,
      description,
      content,
      notes,
      config,
      contentType,
      functionSource,
      functionName,
      fileFormat,
      transform,
      label,
    } = req.body;

    if (!id) {
      res.status(400).json({ error: 'Prompt ID is required' });
      return;
    }

    // Validate prompt ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
      res.status(400).json({
        error: 'Invalid prompt ID. Use only letters, numbers, hyphens, and underscores.',
      });
      return;
    }

    const manager = new PromptManager();

    // Check if prompt already exists
    const existing = await manager.getPrompt(id);
    if (existing) {
      res.status(409).json({ error: 'Prompt with this ID already exists' });
      return;
    }

    const additionalFields: Record<string, any> = {
      config,
      contentType,
      functionSource,
      functionName,
      fileFormat,
      transform,
      label,
    };

    // Remove undefined fields
    Object.keys(additionalFields).forEach((key) => {
      if (additionalFields[key] === undefined) {
        delete additionalFields[key];
      }
    });

    const prompt = await manager.createPrompt(
      id,
      description,
      content || '',
      Object.keys(additionalFields).length > 0 ? additionalFields : undefined,
    );

    telemetry.record('feature_used', {
      feature: 'prompt_management_create_api',
      contentType: contentType || 'string',
    });

    res.json(prompt);
  } catch (error) {
    logger.error(`Failed to create prompt: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create prompt' });
  }
});

// Get prompt details
promptsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // First try to find by ID
    let prompt = await getPromptWithVersions(id);

    // If not found, try to find by name
    if (!prompt) {
      const byName = await db
        .select({ id: managedPromptsTable.id })
        .from(managedPromptsTable)
        .where(eq(managedPromptsTable.name, id))
        .limit(1);

      if (byName.length > 0) {
        prompt = await getPromptWithVersions(byName[0].id);
      }
    }

    if (!prompt) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json(prompt);
  } catch (error) {
    logger.error(`Error getting prompt: ${error}`);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// Update prompt metadata
promptsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, tags } = req.body;
    const db = getDb();

    const result = await db
      .update(managedPromptsTable)
      .set({
        description,
        tags,
        updatedAt: Date.now(),
      })
      .where(eq(managedPromptsTable.id, id))
      .run();

    if (result.changes === 0) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error updating prompt: ${error}`);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// Create a new version
promptsRouter.post('/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      content,
      notes,
      config,
      contentType,
      functionSource,
      functionName,
      fileFormat,
      transform,
      label,
    } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const manager = new PromptManager();

    // Check if prompt exists
    const existing = await manager.getPrompt(id);
    if (!existing) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    const additionalFields: Record<string, any> = {
      config,
      contentType,
      functionSource,
      functionName,
      fileFormat,
      transform,
      label,
    };

    // Remove undefined fields
    Object.keys(additionalFields).forEach((key) => {
      if (additionalFields[key] === undefined) {
        delete additionalFields[key];
      }
    });

    const prompt = await manager.updatePrompt(
      id,
      content,
      notes,
      Object.keys(additionalFields).length > 0 ? additionalFields : undefined,
    );

    telemetry.record('feature_used', {
      feature: 'prompt_management_update_api',
      versionNumber: prompt.currentVersion,
      contentType: contentType || 'string',
    });

    res.json(prompt);
  } catch (error) {
    logger.error(`Failed to create version: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create version' });
  }
});

// Get specific version
promptsRouter.get('/:id/versions/:version', async (req, res) => {
  try {
    const { id, version } = req.params;
    const db = getDb();

    const versionData = await db
      .select()
      .from(promptVersionsTable)
      .where(
        and(
          eq(promptVersionsTable.promptId, id),
          eq(promptVersionsTable.version, Number.parseInt(version)),
        ),
      )
      .limit(1);

    if (versionData.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json(versionData[0]);
  } catch (error) {
    logger.error(`Error getting version: ${error}`);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Deploy prompt version
promptsRouter.post('/:id/deploy', async (req, res) => {
  try {
    const { id } = req.params;
    const { environment, version } = req.body;
    const updatedBy = getUserEmail() || 'unknown';
    const db = getDb();

    // Get prompt
    const promptRows = await db
      .select()
      .from(managedPromptsTable)
      .where(eq(managedPromptsTable.id, id))
      .limit(1);

    if (promptRows.length === 0) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    const prompt = promptRows[0];
    const targetVersion = version || prompt.currentVersion;

    // Get version
    const versionRows = await db
      .select()
      .from(promptVersionsTable)
      .where(
        and(eq(promptVersionsTable.promptId, id), eq(promptVersionsTable.version, targetVersion)),
      )
      .limit(1);

    if (versionRows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // Update or insert deployment
    await db
      .insert(promptDeploymentsTable)
      .values({
        promptId: id,
        environment,
        versionId: versionRows[0].id,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: [promptDeploymentsTable.promptId, promptDeploymentsTable.environment],
        set: {
          versionId: versionRows[0].id,
          updatedAt: Date.now(),
          updatedBy,
        },
      })
      .run();

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deploying prompt: ${error}`);
    res.status(500).json({ error: 'Failed to deploy prompt' });
  }
});

// Delete prompt
promptsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const result = await db.delete(managedPromptsTable).where(eq(managedPromptsTable.id, id)).run();

    if (result.changes === 0) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting prompt: ${error}`);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});
