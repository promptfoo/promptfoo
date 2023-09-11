import { EvaluateSummary, EvaluateTestSuite } from '@/../../../types';
import { supabase } from '@/supabase-server';

import type { Database } from '@/types/supabase';

export type EvaluationJob = Database['public']['Tables']['EvaluationJob']['Row'];
export type EvaluationResult = Database['public']['Tables']['EvaluationResult']['Row'];
export enum JobStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
}

export async function createJob(): Promise<EvaluationJob> {
  const { data: job, error } = await supabase
    .from('EvaluationJob')
    .insert([
      {
        status: JobStatus.IN_PROGRESS,
        progress: 0,
        total: 0,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return job;
}

export async function updateJob(id: string, progress: number, total: number) {
  const { error } = await supabase
    .from('EvaluationJob')
    .update({
      progress,
      total,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function getJob(id: string): Promise<EvaluationJob> {
  const { data: job, error } = await supabase.from('EvaluationJob').select().eq('id', id).single();

  if (error) throw error;
  return job;
}

export async function getResult(id: string): Promise<EvaluationResult> {
  const { data: result, error } = await supabase
    .from('EvaluationResult')
    .select()
    .eq('id', id)
    .single();

  if (error) throw error;
  return result;
}

export async function createResult(
  jobId: string,
  config: EvaluateTestSuite,
  results: EvaluateSummary,
): Promise<EvaluationResult> {
  const { data: result, error } = await supabase
    .from('EvaluationResult')
    .insert([
      {
        id: jobId, // eval id matches job id
        version: 1,
        config:
          config as unknown as Database['public']['Tables']['EvaluationResult']['Insert']['config'],
        results:
          results as unknown as Database['public']['Tables']['EvaluationResult']['Insert']['results'],
      },
    ])
    .select()
    .single();

  if (error) throw error;

  const { error: jobUpdateError } = await supabase
    .from('EvaluationJob')
    .update({
      status: JobStatus.COMPLETE,
      evaluationResultId: jobId,
    })
    .eq('id', jobId);

  //if (jobUpdateError) throw jobUpdateError;

  return result;
}
