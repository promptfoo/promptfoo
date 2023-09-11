// https://supabase.com/dashboard/project/vhywkeydkitmauabqnwv/api?page=tables-intro

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      EvaluationJob: {
        Row: {
          createdAt: string;
          evaluationResultId: string | null;
          id: string;
          progress: number;
          status: Database['public']['Enums']['JobStatus'];
          total: number;
          updatedAt: string;
          userId: string | null;
        };
        Insert: {
          createdAt?: string;
          evaluationResultId?: string | null;
          id?: string;
          progress: number;
          status: Database['public']['Enums']['JobStatus'];
          total: number;
          updatedAt?: string;
          userId?: string | null;
        };
        Update: {
          createdAt?: string;
          evaluationResultId?: string | null;
          id?: string;
          progress?: number;
          status?: Database['public']['Enums']['JobStatus'];
          total?: number;
          updatedAt?: string;
          userId?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'EvaluationJob_evaluationResultId_fkey';
            columns: ['evaluationResultId'];
            referencedRelation: 'EvaluationResult';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'EvaluationJob_userId_fkey';
            columns: ['userId'];
            referencedRelation: 'users';
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
          userId: string | null;
          version: number;
        };
        Insert: {
          config: Json;
          createdAt?: string;
          id?: string;
          results: Json;
          updatedAt?: string;
          userId?: string | null;
          version: number;
        };
        Update: {
          config?: Json;
          createdAt?: string;
          id?: string;
          results?: Json;
          updatedAt?: string;
          userId?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'EvaluationResult_userId_fkey';
            columns: ['userId'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
