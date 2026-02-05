// Placeholder for Supabase database types
// This will be generated from Supabase schema
export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          name: string | null;
          created_at: string;
          last_seen_at: string | null;
        };
      };
      tables: {
        Row: {
          id: string;
          status: 'waiting' | 'running' | 'ended';
          config: unknown;
          seed: string | null;
          created_at: string;
        };
      };
    };
  };
};
