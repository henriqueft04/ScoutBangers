/**
 * Hand-written subset of the Supabase schema. Mirrors `supabase/schema.sql`.
 * Keep in sync when the SQL changes — or regenerate via the Supabase CLI:
 *   supabase gen types typescript --project-id <id> > database.types.ts
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          share_activity: boolean
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          share_activity?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          share_activity?: boolean
          created_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          user_id: string
          song_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          song_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          song_id?: string
          created_at?: string
        }
        Relationships: []
      }
      playlists: {
        Row: {
          id: string
          user_id: string
          name: string
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          is_public?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          is_public?: boolean
          created_at?: string
        }
        Relationships: []
      }
      playlist_songs: {
        Row: {
          playlist_id: string
          song_id: string
          position: number
          added_at: string
        }
        Insert: {
          playlist_id: string
          song_id: string
          position: number
          added_at?: string
        }
        Update: {
          playlist_id?: string
          song_id?: string
          position?: number
          added_at?: string
        }
        Relationships: []
      }
      plays: {
        Row: {
          id: string
          user_id: string | null
          song_id: string
          artist: string | null
          played_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          song_id: string
          artist?: string | null
          played_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          song_id?: string
          artist?: string | null
          played_at?: string
        }
        Relationships: []
      }
      playlist_saves: {
        Row: {
          user_id: string
          playlist_id: string
          saved_at: string
        }
        Insert: {
          user_id: string
          playlist_id: string
          saved_at?: string
        }
        Update: {
          user_id?: string
          playlist_id?: string
          saved_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      top_songs_global: {
        Args: { lim?: number }
        Returns: { song_id: string; play_count: number }[]
      }
      top_songs_for_user: {
        Args: { uid: string; lim?: number }
        Returns: { song_id: string; play_count: number }[]
      }
      top_artists_for_user: {
        Args: { uid: string; lim?: number }
        Returns: { artist: string; play_count: number }[]
      }
      recent_plays: {
        Args: { lim?: number }
        Returns: {
          song_id: string
          user_id: string
          display_name: string | null
          avatar_url: string | null
          played_at: string
        }[]
      }
      playlist_save_count: {
        Args: { pid: string }
        Returns: number
      }
      saved_playlists_for_user: {
        Args: { uid: string }
        Returns: {
          id: string
          name: string
          owner_id: string
          owner_display_name: string
          song_count: number
          saved_at: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
