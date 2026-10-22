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
          update_tour_seen: boolean | null
          jam_tour_seen: boolean | null
          playlists_tour_seen: boolean | null
          artists_tour_seen: boolean | null
          created_at: string
          regiao: string | null
          nucleo: string | null
          agrupamento_numero: number | null
          agrupamento_nome: string | null
          is_admin: boolean
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          share_activity?: boolean
          show_badges?: boolean
          tour_completed_at?: string | null
          update_tour_seen?: boolean | null
          jam_tour_seen?: boolean | null
          playlists_tour_seen?: boolean | null
          artists_tour_seen?: boolean | null
          created_at?: string
          regiao?: string | null
          nucleo?: string | null
          agrupamento_numero?: number | null
          agrupamento_nome?: string | null
          is_admin?: boolean
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          share_activity?: boolean
          show_badges?: boolean
          tour_completed_at?: string | null
          update_tour_seen?: boolean | null
          jam_tour_seen?: boolean | null
          playlists_tour_seen?: boolean | null
          artists_tour_seen?: boolean | null
          created_at?: string
          regiao?: string | null
          nucleo?: string | null
          agrupamento_numero?: number | null
          agrupamento_nome?: string | null
          is_admin?: boolean
        }
        Relationships: []
      }
      playlists: {
        Row: {
          id: string
          user_id: string
          name: string
          is_public: boolean
          cover_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          is_public?: boolean
          cover_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          is_public?: boolean
          cover_url?: string | null
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
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_banners: {
        Row: {
          artist_key: string
          artist_name: string
          banner_url: string
          updated_at: string
        }
        Insert: {
          artist_key: string
          artist_name: string
          banner_url: string
          updated_at?: string
        }
        Update: {
          artist_key?: string
          artist_name?: string
          banner_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_banner_submissions: {
        Row: {
          id: string
          user_id: string
          artist_name: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          artist_name: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          artist_name?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      playlist_collaborators: {
        Row: {
          playlist_id: string
          user_id: string
          invited_by: string
          status: string
          created_at: string
        }
        Insert: {
          playlist_id: string
          user_id: string
          invited_by: string
          status?: string
          created_at?: string
        }
        Update: {
          playlist_id?: string
          user_id?: string
          invited_by?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_collaborators_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      plays: {
        Row: {
          id: string
          user_id: string | null
          song_id: string
          artist: string | null
          played_at: string
          duration_seconds: number | null
          device_id: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          song_id: string
          artist?: string | null
          played_at?: string
          duration_seconds?: number | null
          device_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          song_id?: string
          artist?: string | null
          played_at?: string
          duration_seconds?: number | null
          device_id?: string | null
        }
        Relationships: []
      }
      active_devices: {
        Row: {
          device_id: string
          is_playing: boolean
          last_seen_at: string
        }
        Insert: {
          device_id: string
          is_playing?: boolean
          last_seen_at?: string
        }
        Update: {
          device_id?: string
          is_playing?: boolean
          last_seen_at?: string
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
      song_submissions: {
        Row: {
          id: string
          user_id: string
          status: string
          title: string
          artist: string
          album: string | null
          year: string | null
          genre: string | null
          audio_path: string
          thumbnail_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: string
          title: string
          artist: string
          album?: string | null
          year?: string | null
          genre?: string | null
          audio_path: string
          thumbnail_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          status?: string
          title?: string
          artist?: string
          album?: string | null
          year?: string | null
          genre?: string | null
          audio_path?: string
          thumbnail_path?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
      search_profiles: {
        Args: { q: string; lim?: number }
        Returns: {
          id: string
          display_name: string | null
          avatar_url: string | null
        }[]
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
          save_count: number
          cover_url: string | null
          preview_song_ids: string[]
        }[]
      }
      my_playlists_overview: {
        Args: { uid: string }
        Returns: {
          id: string
          name: string
          is_public: boolean
          created_at: string
          song_count: number
          save_count: number
          cover_url: string | null
          preview_song_ids: string[]
          owner_id: string
          owner_display_name: string
          is_collaborator: boolean
        }[]
      }
      submit_artist_banner: {
        Args: { artist_name: string }
        Returns: string
      }
      invite_playlist_collaborator: {
        Args: { pid: string; uid: string }
        Returns: undefined
      }
      playlist_collaborators_list: {
        Args: { pid: string }
        Returns: {
          user_id: string
          display_name: string
          avatar_url: string | null
          status: string
        }[]
      }
      my_playlist_invites: {
        Args: Record<PropertyKey, never>
        Returns: {
          playlist_id: string
          playlist_name: string
          inviter_id: string
          inviter_name: string
          invited_at: string
        }[]
      }
      respond_playlist_invite: {
        Args: { pid: string; accept: boolean }
        Returns: undefined
      }
      discover_public_playlists: {
        Args: { q?: string; sort?: string; lim?: number; off?: number }
        Returns: {
          id: string
          name: string
          owner_id: string
          owner_display_name: string
          song_count: number
          save_count: number
          cover_url: string | null
          preview_song_ids: string[]
        }[]
      }
      stats_top_songs_weekly: {
        Args: { weeks_back?: number | null }
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
        Args: { days?: number | null }
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
          total_seconds: number
          total_devices: number
          total_users: number
        }[]
      }
      stats_for_user: {
        Args: { uid: string }
        Returns: { total_seconds: number; total_plays: number }[]
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
