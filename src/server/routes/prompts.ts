import { eq, and, desc } from 'drizzle-orm';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../database';
import {
  managedPromptsTable,
  promptVersionsTable,
  promptDeploymentsTable,
} from '../../database/tables';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
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
    })),
    deployments: deploymentsMap,
  };
}

export const promptsRouter = Router();

// List all prompts
promptsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
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
promptsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, description, content, notes } = req.body;
    const author = getUserEmail() || 'unknown';
    const db = getDb();

    // Validate prompt ID
    if (!id || !VALID_ID_REGEX.test(id)) {
      res.status(400).json({
        error: 'Invalid prompt ID. Must contain only letters, numbers, hyphens, and underscores.',
      });
      return;
    }

    // Check if prompt already exists
    const existing = await db
      .select()
      .from(managedPromptsTable)
      .where(eq(managedPromptsTable.name, id))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: `Prompt with id "${id}" already exists` });
      return;
    }

    const promptId = uuidv4();
    const versionId = uuidv4();

    db.transaction(() => {
      // Create prompt
      db.insert(managedPromptsTable)
        .values({
          id: promptId,
          name: id,
          description,
          currentVersion: 1,
          author,
        })
        .run();

      // Create first version
      db.insert(promptVersionsTable)
        .values({
          id: versionId,
          promptId,
          version: 1,
          content: content || '',
          author,
          notes: notes || 'Initial version',
        })
        .run();
    });

    // Fetch and return the created prompt with versions
    const result = await getPromptWithVersions(promptId);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`Error creating prompt: ${error}`);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// Get prompt details
promptsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
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
promptsRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
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
promptsRouter.post('/:id/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content, notes } = req.body;
    const author = getUserEmail() || 'unknown';
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
    const newVersion = prompt.currentVersion + 1;
    const versionId = uuidv4();

    db.transaction(() => {
      // Create new version
      db.insert(promptVersionsTable)
        .values({
          id: versionId,
          promptId: id,
          version: newVersion,
          content,
          author,
          notes,
        })
        .run();

      // Update prompt
      db.update(managedPromptsTable)
        .set({
          currentVersion: newVersion,
          updatedAt: Date.now(),
        })
        .where(eq(managedPromptsTable.id, id))
        .run();
    });

    // Return updated prompt
    const result = await getPromptWithVersions(id);
    res.json(result);
  } catch (error) {
    logger.error(`Error creating version: ${error}`);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Get specific version
promptsRouter.get('/:id/versions/:version', async (req: Request, res: Response): Promise<void> => {
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
promptsRouter.post('/:id/deploy', async (req: Request, res: Response): Promise<void> => {
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
promptsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
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
