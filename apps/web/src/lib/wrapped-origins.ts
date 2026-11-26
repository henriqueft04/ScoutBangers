/**
 * "Como tudo começou": the app on its first day of development next to the
 * app today, for the 2026 Wrapped. The screenshots in public/images/wrapped/ were
 * taken from the first commit (3ba8f913) and from the app as it is now, both
 * at a 390×844 phone size. (Not under public/wrapped/: a folder named
 * like the /wrapped route could be served instead of the app.)
 */
export const WRAPPED_ORIGINS = {
  /** Date of the first commit. The slide only shows in that year's Wrapped. */
  firstDay: "2026-05-07",
  /** Songs in the catalog on that day. */
  songsOnDayOne: 73,
  before: "/images/wrapped/dia1.jpg",
  after: "/images/wrapped/hoje.jpg",
} as const
