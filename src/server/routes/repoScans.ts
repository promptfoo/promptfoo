import { randomUUID } from 'node:crypto';

import {
  desc,
  eq,
} from 'drizzle-orm';
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import {
  getDb,
  sqliteInstance,
} from '../../database';
import { repoScansTable } from '../../database/tables';

export const repoScansRouter = Router();

function ensureRepoScansTable() {
  // Use raw SQL to create table/index if not present (dev convenience)
  if (!sqliteInstance) { return; }
  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS repo_scans (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP NOT NULL,
      label TEXT,
      root_paths TEXT,
      options TEXT,
      result TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS repo_scans_created_at_idx ON repo_scans (created_at);
  `);
}

function detectModelToken(line: string): string | undefined {
  const re = /(gpt-[\w\-.]+|claude-[\w\-.]+|gemini-[\w\-.]+|mistral-[\w\-.]+|mixtral-[\w\-.]+|llama[\w\-.]*)/i;
  const m = line?.match(re);
  return m ? m[1] : undefined;
}

function detectCallPattern(detectorId: string): 'sdk' | 'http' | 'model-token' | 'env-var' | 'other' {
  if (detectorId?.startsWith('sdk.')) { return 'sdk'; }
  if (detectorId?.startsWith('http.')) { return 'http'; }
  if (detectorId?.startsWith('model.')) { return 'model-token'; }
  if (detectorId?.startsWith('env.')) { return 'env-var'; }
  return 'other';
}

const DEFAULT_ALLOWED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'aws-bedrock',
  'azure-openai',
  'mistral',
  'llama',
  'cohere',
  'ollama',
]);

function computeProfilesAndRisk(row: any) {
  const findings = row.result?.findings || [];

  // Usage profiles
  const map = new Map<string, any>();
  for (const f of findings) {
    const provider = f.provider || 'unknown';
    const capability = f.capability || 'unknown';
    const model = detectModelToken(f.lineText) || 'unknown-model';
    const pattern = detectCallPattern(f.detectorId);
    const key = `${provider}|||${capability}|||${model}|||${pattern}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        provider,
        capability,
        model,
        pattern,
        count: 0,
        files: new Set<string>(),
        sample: f,
        risks: [] as string[],
        score: 0,
      });
    }
    const p = map.get(key);
    p.count += 1;
    p.files.add(f.filePath);
  }

  const profiles = Array.from(map.values()).map((p) => {
    // Risk heuristics (simple, transparent)
    const patternWeight = p.pattern === 'http' ? 3 : p.pattern === 'sdk' ? 2 : p.pattern === 'env-var' ? 2 : 1;
    const capWeight = p.capability === 'chat' ? 3 : p.capability === 'image' || p.capability === 'audio' ? 2 : p.capability === 'embeddings' ? 1 : 1;
    let score = patternWeight + capWeight;

    // Governance: unapproved provider
    if (!DEFAULT_ALLOWED_PROVIDERS.has(p.provider)) {
      p.risks.push('Model governance: unapproved or unknown provider');
      score += 2;
    }

    // Network controls: direct HTTP
    if (p.pattern === 'http') {
      p.risks.push('Network controls: add timeouts/retries and egress allowlist');
      score += 2;
    }

    // Moderation/guardrails: chat needs safety filters
    if (p.capability === 'chat') {
      p.risks.push('Moderation/guardrails: safety checks not verified');
      score += 1;
    }

    // Scale by footprint (log-style)
    const footprint = Math.min(3, 1 + Math.log(1 + p.count));
    p.score = Math.round((score * footprint + Number.EPSILON) * 10) / 10;
    p.files = Array.from(p.files);
    return p;
  }).sort((a, b) => b.score - a.score);

  // Global CI policy signal: look for promptfoo CI or configs
  let ciSignal = false;
  const roots: string[] = Array.isArray(row.rootPaths) ? row.rootPaths : [];
  for (const root of roots) {
    try {
      const wfDir = path.join(root, '.github', 'workflows');
      if (fs.existsSync(wfDir)) {
        const files = fs.readdirSync(wfDir);
        if (files.some((f) => /promptfoo/i.test(f))) {
          ciSignal = true;
          break;
        }
      }
      const hasConfig = fs.existsSync(path.join(root, 'promptfooconfig.yaml')) || fs.existsSync(path.join(root, 'promptfooconfig.yml'));
      if (hasConfig) {
        ciSignal = true; // weak signal, but helpful
      }
    } catch {
      // ignore
    }
  }

  const overall = Math.round((profiles.slice(0, 5).reduce((s, p) => s + p.score, 0) + Number.EPSILON));
  const riskSummary = {
    overall,
    ciIntegrated: ciSignal,
    topRisks: profiles.slice(0, 5).map((p) => ({
      key: p.key,
      score: p.score,
      risks: p.risks,
      provider: p.provider,
      capability: p.capability,
      model: p.model,
      pattern: p.pattern,
      count: p.count,
      files: p.files,
      sample: p.sample,
    })),
  };

  return { profiles, riskSummary };
}

repoScansRouter.get('/', async (req, res) => {
  ensureRepoScansTable();
  const db = getDb();
  const rows = await db.select().from(repoScansTable).orderBy(desc(repoScansTable.createdAt)).all();
  res.json({ data: rows });
});

repoScansRouter.get('/:id', async (req, res) => {
  ensureRepoScansTable();
  const db = getDb();
  const id = req.params.id;
  const rows = await db.select().from(repoScansTable).where(eq(repoScansTable.id, id)).all();
  if (!rows || rows.length === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const row = rows[0];
  const enrich = computeProfilesAndRisk(row);
  res.json({ data: { ...row, ...enrich } });
});

repoScansRouter.post('/', async (req, res) => {
  ensureRepoScansTable();
  const db = getDb();
  const id = randomUUID();
  const { label, rootPaths, options, result } = req.body ?? {};
  await db
    .insert(repoScansTable)
    .values({ id, label, rootPaths, options, result })
    .run();
  res.json({ id });
});

repoScansRouter.delete('/:id', async (req, res) => {
  ensureRepoScansTable();
  const db = getDb();
  const id = req.params.id;
  await db.delete(repoScansTable).where(eq(repoScansTable.id, id)).run();
  res.status(204).send();
});

repoScansRouter.post('/:id/suppress', async (req, res) => {
  ensureRepoScansTable();
  const db = getDb();
  const id = req.params.id;
  const rows = await db.select().from(repoScansTable).where(eq(repoScansTable.id, id)).all();
  if (!rows || rows.length === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const row = rows[0];
  const pattern = String(req.body?.pattern || '').trim();
  if (!pattern) {
    res.status(400).json({ error: 'Missing pattern' });
    return;
  }
  const roots: string[] = Array.isArray(row.rootPaths) ? row.rootPaths : [];
  let wrote = 0;
  for (const root of roots) {
    try {
      const ignorePath = path.join(root, '.promptfoo-scanignore');
      const line = (fs.existsSync(ignorePath) && fs.readFileSync(ignorePath, 'utf8').endsWith('\n'))
        ? `${pattern}\n`
        : `\n${pattern}\n`;
      fs.appendFileSync(ignorePath, line);
      wrote += 1;
    } catch {
      // ignore root write errors and continue
    }
  }
  if (wrote === 0) {
    res.status(500).json({ error: 'Failed to write suppression to any root' });
    return;
  }
  res.json({ ok: true, wrote });
}); 