/**
 * Types générés depuis le schéma Supabase.
 * En production : supabase gen types typescript --project-id <id> > database.types.ts
 */
export interface Database {
  public: {
    Tables: {
      user_storage: {
        Row: {
          user_id: string;
          key: string;
          value: unknown;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          key: string;
          value: unknown;
          updated_at?: string;
        };
        Update: {
          value?: unknown;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
