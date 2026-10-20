import { supabase } from "@/lib/supabase"

export interface Collaborator {
  userId: string
  displayName: string
  avatarUrl: string | null
  /** `pending` until the invitee accepts. */
  status: "pending" | "accepted"
}

export interface PlaylistInvite {
  playlistId: string
  playlistName: string
  inviterId: string
  inviterName: string
  invitedAt: string
}

export interface PersonResult {
  id: string
  displayName: string
  avatarUrl: string | null
}

/** Returns `null` on failure. The owner also gets the pending invites. */
export async function listCollaborators(
  playlistId: string
): Promise<Collaborator[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("playlist_collaborators_list", {
    pid: playlistId,
  })
  if (error || !data) return null
  return data.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name || "Ouvinte",
    avatarUrl: row.avatar_url,
    status: row.status === "accepted" ? "accepted" : "pending",
  }))
}

/** Returns an error message, or `null` on success. */
export async function inviteCollaborator(
  playlistId: string,
  userId: string
): Promise<string | null> {
  if (!supabase) return "Sem ligação"
  const { error } = await supabase.rpc("invite_playlist_collaborator", {
    pid: playlistId,
    uid: userId,
  })
  return error ? error.message : null
}

/** Owner removing someone, or a collaborator leaving. Returns an error message or `null`. */
export async function removeCollaborator(
  playlistId: string,
  userId: string
): Promise<string | null> {
  if (!supabase) return "Sem ligação"
  const { error } = await supabase
    .from("playlist_collaborators")
    .delete()
    .match({ playlist_id: playlistId, user_id: userId })
  return error ? error.message : null
}

/** Returns `null` on failure. */
export async function myInvites(): Promise<PlaylistInvite[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("my_playlist_invites")
  if (error || !data) return null
  return data.map((row) => ({
    playlistId: row.playlist_id,
    playlistName: row.playlist_name,
    inviterId: row.inviter_id,
    inviterName: row.inviter_name || "Alguém",
    invitedAt: row.invited_at,
  }))
}

/** Returns an error message, or `null` on success. */
export async function respondToInvite(
  playlistId: string,
  accept: boolean
): Promise<string | null> {
  if (!supabase) return "Sem ligação"
  const { error } = await supabase.rpc("respond_playlist_invite", {
    pid: playlistId,
    accept,
  })
  return error ? error.message : null
}

/** People whose name matches `query` (accent-insensitive), for the invite search. */
export async function searchPeople(query: string): Promise<PersonResult[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("search_profiles", {
    q: query,
    lim: 8,
  })
  if (error || !data) return null
  return data.map((row) => ({
    id: row.id,
    displayName: row.display_name ?? "Ouvinte",
    avatarUrl: row.avatar_url,
  }))
}
