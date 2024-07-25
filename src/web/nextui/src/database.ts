import { EvaluateSummary, EvaluateTestSuite } from '@/../../../types';
import type { Database } from '@/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseEvaluationJob = Database['public']['Tables']['EvaluationJob']['Row'];
export type SupabaseEvaluationResult = Database['public']['Tables']['EvaluationResult']['Row'];
export enum SupabaseJobStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
}

export async function createJob(supabase: SupabaseClient): Promise<SupabaseEvaluationJob> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: job, error } = await supabase
    .from('EvaluationJob')
    .insert([
      {
        user_id: user?.id,
        status: SupabaseJobStatus.IN_PROGRESS,
        progress: 0,
        total: 0,
      },
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }
  return job;
}

export async function updateJob(
  supabase: SupabaseClient,
  id: string,
  progress: number,
  total: number,
) {
  const { error } = await supabase
    .from('EvaluationJob')
    .update({
      progress,
      total,
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
}

export async function getJob(supabase: SupabaseClient, id: string): Promise<SupabaseEvaluationJob> {
  const { data: job, error } = await supabase.from('EvaluationJob').select().eq('id', id).single();

  if (error) {
    throw error;
  }
  return job;
}

export async function getResult(
  supabase: SupabaseClient,
  id: string,
): Promise<SupabaseEvaluationResult> {
  const { data: result, error } = await supabase
    .from('EvaluationResult')
    .select()
    .eq('id', id)
    .single();

  if (error) {
    throw error;
  }
  return result;
}

export async function createResult(
  supabase: SupabaseClient,
  jobId: string,
  config: EvaluateTestSuite,
  results: EvaluateSummary,
): Promise<SupabaseEvaluationResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const record = {
    user_id: user?.id,
    id: jobId, // eval id matches job id
    // TODO(ian): Doesn't actually have the `createdAt` field
    version: 2,
    config:
      config as unknown as Database['public']['Tables']['EvaluationResult']['Insert']['config'],
    results:
      results as unknown as Database['public']['Tables']['EvaluationResult']['Insert']['results'],
  };
  const { data: result, error } = await supabase
    .from('EvaluationResult')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw error;
  }

  const { error: jobUpdateError } = await supabase
    .from('EvaluationJob')
    .update({
      status: SupabaseJobStatus.COMPLETE,
      evaluationResultId: jobId,
    })
    .eq('id', jobId);

  //if (jobUpdateError) throw jobUpdateError;

  return result;
}
