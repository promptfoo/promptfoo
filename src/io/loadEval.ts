import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EvalRun, EvalRow } from '../diff/types';

async function readJson(p: string) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

function stableId(r: any) {
  if (r.id) {
    return r.id;
  }
  const data = JSON.stringify([r.prompt ?? '', r.vars ?? {}, r.provider ?? r.model ?? '']);
  return crypto.createHash('sha1').update(data).digest('hex').slice(0, 16);
}

function toEvalRun(obj: any): EvalRun {
  const rows: EvalRow[] = (obj.rows || obj.results || []).map((r: any) => ({
    id: stableId(r),
    output: r.output ?? '',
    score: r.score ?? null,
    passed: !!r.passed,
    prompt: r.prompt,
    vars: r.vars,
    provider: r.provider ?? r.model,
    meta: r.meta ?? {},
  }));
  return {
    runId: obj.runId || obj.id || obj.meta?.runId || 'unknown',
    createdAt: obj.createdAt || obj.meta?.createdAt,
    configName: obj.configName || obj.meta?.configName,
    rows,
    summary: { passRate: obj.summary?.passRate, avgScore: obj.summary?.avgScore ?? null, total: rows.length },
  };
}

export async function loadEval(inputPath: string): Promise<EvalRun> {
  const stat = await fs.stat(inputPath);
  if (stat.isDirectory()) {
    for (const f of ['results.json', 'run.json']) {
      try { return toEvalRun(await readJson(path.join(inputPath, f))); } catch {}
    }
    throw new Error(`No results.json or run.json in ${inputPath}`);
  }
  return toEvalRun(await readJson(inputPath));
}
