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
          banner_url: string | null
          share_activity: boolean
          show_badges: boolean
          tour_completed_at: string | null
          created_at: string
          regiao: string | null
          nucleo: string | null
          agrupamento_numero: number | null
          agrupamento_nome: string | null
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          share_activity?: boolean
          show_badges?: boolean
          tour_completed_at?: string | null
          created_at?: string
          regiao?: string | null
          nucleo?: string | null
          agrupamento_numero?: number | null
          agrupamento_nome?: string | null
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          share_activity?: boolean
          show_badges?: boolean
          tour_completed_at?: string | null
          created_at?: string
          regiao?: string | null
          nucleo?: string | null
          agrupamento_numero?: number | null
          agrupamento_nome?: string | null
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
      stats_top_songs_weekly: {
        Args: { weeks_back?: number }
        Returns: {
          week_start: string
          song_id: string
          rank: number
          play_count: number
        }[]
      }
      stats_top_songs: {
        Args: { period?: "week" | "month" | "all"; lim?: number }
        Returns: { song_id: string; play_count: number }[]
      }
      stats_top_listeners: {
        Args: { period?: "week" | "month" | "all"; lim?: number }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          play_count: number
        }[]
      }
      stats_top_artists: {
        Args: { days?: number | null; lim?: number }
        Returns: { artist: string; play_count: number }[]
      }
      stats_plays_per_day: {
        Args: { days?: number }
        Returns: { day: string; play_count: number }[]
      }
      stats_summary: {
        Args: { period?: "week" | "month" | "all" }
        Returns: {
          total_plays: number
          unique_songs: number
          unique_artists: number
          biggest_day: string | null
          biggest_day_count: number | null
        }[]
      }
      get_user_badges: {
        Args: { uid: string }
        Returns: { rank: number; badge_count: number }[]
      }
      get_user_badge_weeks: {
        Args: { uid: string; rank_in: number }
        Returns: { week_start: string; play_count: number }[]
      }
      stats_listeners_by_region: {
        Args: { period?: "week" | "month" | "all"; lim?: number }
        Returns: { regiao: string; nucleo: string | null; play_count: number }[]
      }
      stats_users_by_region: {
        Args: { lim?: number }
        Returns: { regiao: string; nucleo: string | null; user_count: number }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
