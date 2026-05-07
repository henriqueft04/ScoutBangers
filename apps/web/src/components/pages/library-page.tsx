import { Library } from "@/components/library/library"

/**
 * The default route — wraps the existing `Library` block. Lives in `pages/`
 * to keep the route → component mapping in `App.tsx` legible.
 */
export function LibraryPage() {
  return <Library />
}
