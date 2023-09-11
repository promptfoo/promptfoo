// https://supabase.com/dashboard/project/vhywkeydkitmauabqnwv/api?page=tables-intro

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number;
          checksum: string;
          finished_at: string | null;
          id: string;
          logs: string | null;
          migration_name: string;
          rolled_back_at: string | null;
          started_at: string;
        };
        Insert: {
          applied_steps_count?: number;
          checksum: string;
          finished_at?: string | null;
          id: string;
          logs?: string | null;
          migration_name: string;
          rolled_back_at?: string | null;
          started_at?: string;
        };
        Update: {
          applied_steps_count?: number;
          checksum?: string;
          finished_at?: string | null;
          id?: string;
          logs?: string | null;
          migration_name?: string;
          rolled_back_at?: string | null;
          started_at?: string;
        };
        Relationships: [];
      };
      EvaluationJob: {
        Row: {
          createdAt: string;
          evaluationResultId: string | null;
          id: string;
          progress: number;
          status: Database['public']['Enums']['JobStatus'];
          total: number;
          updatedAt: string;
        };
        Insert: {
          createdAt?: string;
          evaluationResultId?: string | null;
          id?: string;
          progress: number;
          status: Database['public']['Enums']['JobStatus'];
          total: number;
          updatedAt?: string;
        };
        Update: {
          createdAt?: string;
          evaluationResultId?: string | null;
          id?: string;
          progress?: number;
          status?: Database['public']['Enums']['JobStatus'];
          total?: number;
          updatedAt?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'EvaluationJob_evaluationResultId_fkey';
            columns: ['evaluationResultId'];
            referencedRelation: 'EvaluationResult';
            referencedColumns: ['id'];
          },
        ];
      };
      EvaluationResult: {
        Row: {
          config: Json;
          createdAt: string;
          id: string;
          results: Json;
          updatedAt: string;
          version: number;
        };
        Insert: {
          config: Json;
          createdAt?: string;
          id?: string;
          results: Json;
          updatedAt?: string;
          version: number;
        };
        Update: {
          config?: Json;
          createdAt?: string;
          id?: string;
          results?: Json;
          updatedAt?: string;
          version?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      JobStatus: 'IN_PROGRESS' | 'COMPLETE';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
