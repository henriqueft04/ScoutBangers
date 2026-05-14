import type { TourStep } from "./tour-context"

/**
 * Main first-run tour. Adding / removing steps only requires editing
 * this array — the engine reacts to the data. Keep copy short (mobile
 * tooltip width is ~300 px). For elements you want highlighted, set
 * `data-tour-id="..."` on the rendered DOM node and use a matching
 * `[data-tour-id="..."]` selector here.
 *
 * `route` makes the engine navigate before showing the step; targets
 * on lazy-loaded pages are resolved via MutationObserver, so there's
 * no need to await the suspended chunk yourself.
 *
 * `nextRoute` runs when the user clicks Seguinte and takes them to a
 * destination so the tour can demonstrate "tap this → that happens".
 * Pair a destination-jumping step with an immediate intermediate step
 * whose own `route` is omitted (or matches the destination), so the
 * next step's route doesn't fire and snap the user back.
 *
 * `onAdvance` runs synchronously on advance for side effects that
 * aren't navigations — e.g. dispatching a click on a DOM element to
 * open the fullscreen player so the next step can highlight a
 * control that only mounts inside the sheet.
 */

/** Click whichever expand-to-fullscreen button is currently visible. */
function openFullscreenPlayer(): void {
  const candidates = document.querySelectorAll(
    'button[aria-label="Abrir leitor em ecrã inteiro"]'
  )
  for (const el of candidates) {
    if (!(el instanceof HTMLButtonElement)) continue
    if (el.disabled) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    el.click()
    return
  }
}

/** Click the first row in the library so a song starts playing. */
function playFirstSong(): void {
  const row = document.querySelector(
    '[data-tour-id="song-list-demo"] [role="button"], [data-tour-id="song-list-demo"] button'
  )
  if (row instanceof HTMLElement) row.click()
}

/**
 * Click an element matching `selector` if its underlying button is a
 * real (visible, enabled) HTMLButtonElement. Used by the lyrics and
 * queue tour steps to open the corresponding panel as part of the
 * walkthrough.
 *
 * The `selector` may resolve to a wrapper span (the data-tour-id is
 * sometimes on a wrapper around the actual button), so the helper
 * unwraps to find the click target.
 *
 * Many tour-id'd elements have two renders (mobile + desktop variants)
 * that share the selector. We iterate all matches and pick the one
 * with a non-zero bounding rect — i.e. the variant actually laid out
 * for the current viewport — so the click hits an element React's
 * event system is willing to process.
 */
function clickTourButton(selector: string): void {
  const matches = document.querySelectorAll(selector)
  for (const el of matches) {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const btn =
      el instanceof HTMLButtonElement ? el : el.querySelector("button")
    if (btn instanceof HTMLButtonElement && !btn.disabled) {
      btn.click()
      return
    }
  }
}

function openLyricsPanel(): void {
  clickTourButton('[data-tour-id="player-lyrics"]')
}

function openQueuePanel(): void {
  clickTourButton('[data-tour-id="player-queue"]')
}

/**
 * Toggle a tour-id'd button back off if it's currently in the
 * pressed state. Used by the "panel-shown" intermediate steps to
 * close the lyrics / queue sheet they preceded, so the next step
 * (e.g. the queue button highlight, or fullscreen-close) renders
 * against a clean UI instead of one half-covered by an open
 * BottomSheet.
 */
function closeTogglableTourButton(selector: string): void {
  const matches = document.querySelectorAll(selector)
  for (const el of matches) {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const btn =
      el instanceof HTMLButtonElement ? el : el.querySelector("button")
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) continue
    if (btn.getAttribute("aria-pressed") === "true") {
      btn.click()
    }
    return
  }
}

function closeLyricsPanel(): void {
  closeTogglableTourButton('[data-tour-id="player-lyrics"]')
}

function closeQueuePanel(): void {
  closeTogglableTourButton('[data-tour-id="player-queue"]')
}

export const MAIN_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bem-vindo à ScoutBangers",
    body: "Vou mostrar-te os essenciais em menos de um minuto. Podes saltar a qualquer momento.",
  },
  {
    id: "nav-home",
    target: '[data-tour-id="nav-home"]',
    route: "/",
    title: "Início",
    body: "O Top 10 e o que os teus amigos andam a ouvir.",
    side: "auto",
  },
  {
    id: "home-friends",
    target: '[data-tour-id="home-friends"]',
    route: "/",
    title: "Amigos",
    body: "Toca no nome ou no avatar de um amigo para abrires o perfil dele. Carrega em Seguinte para experimentares.",
    side: "auto",
    nextRoute: () => {
      const link = document.querySelector(
        '[data-tour-id="home-friends"] a[href^="/u/"]'
      )
      return link instanceof HTMLAnchorElement ? link.getAttribute("href") : null
    },
  },
  {
    id: "friend-profile",
    target: null,
    title: "Perfil de um amigo",
    body: "Aqui vês o que ele anda a ouvir, os tops dele e as playlists públicas. Carrega em Seguinte para voltar.",
    nextRoute: "/",
  },
  {
    id: "home-stats",
    target: '[data-tour-id="home-stats"]',
    route: "/",
    title: "Estatísticas",
    body: "Aqui chegas às estatísticas globais: tops de músicas, artistas e atividade. Carrega em Seguinte para experimentares.",
    side: "auto",
    nextRoute: "/estatisticas",
  },
  {
    id: "stats-page",
    target: null,
    title: "Estatísticas globais",
    body: "Tops da semana e de sempre, atividade da comunidade e mais. Carrega em Seguinte para continuar.",
    nextRoute: "/",
  },
  {
    id: "nav-music",
    target: '[data-tour-id="nav-music"]',
    title: "Biblioteca",
    body: "Todo a Cancioneiro num só sítio. Pesquisa, descarrega para ouvir offline e cria playlists.",
    side: "auto",
  },
  {
    id: "search",
    target: '[data-tour-id="library-search"]',
    route: "/music",
    title: "Pesquisa",
    body: "Procura por título ou artista. As pesquisas recentes aparecem aqui.",
    side: "bottom",
  },
  {
    id: "song-play",
    target: '[data-tour-id="song-list-demo"]',
    route: "/music",
    title: "Tocar uma música",
    body: "Toca para começar a ouvir. Arrasta a linha para a direita para adicionares à fila sem interromperes o que está a tocar. Carrega em Seguinte para tocar esta música.",
    side: "top",
    onAdvance: playFirstSong,
  },
  {
    id: "player-bar",
    target: '[data-tour-id="player-bar"]',
    title: "Barra do leitor",
    body: "Esta barra mostra o que está a tocar. Carrega em Seguinte para abrires o leitor completo.",
    side: "top",
    onAdvance: openFullscreenPlayer,
  },
  {
    id: "fullscreen-controls",
    target: '[data-tour-id="fullscreen-controls-wrap"]',
    title: "Controlos",
    body: "Anterior, tocar/pausar e seguinte. Os controlos principais ao centro.",
    side: "top",
  },
  {
    id: "fullscreen-shuffle",
    target:
      '[data-tour-id="fullscreen-controls-wrap"] [data-tour-id="player-shuffle"]',
    title: "Aleatório",
    body: "Toca a fila de reprodução por ordem aleatória.",
    side: "top",
  },
  {
    id: "fullscreen-repeat",
    target:
      '[data-tour-id="fullscreen-controls-wrap"] [data-tour-id="player-repeat"]',
    title: "Repetir",
    body: "Carrega para alternar entre repetir a fila, repetir uma só música ou desativar.",
    side: "top",
  },
  {
    id: "fullscreen-favorite",
    target: '[data-tour-id="player-favorite"]',
    title: "Favoritos",
    body: "Toca no coração para marcares uma música como favorita.",
    side: "top",
  },
  {
    id: "fullscreen-lyrics",
    target: '[data-tour-id="player-lyrics"]',
    title: "Letra",
    body: "Vê a letra da música a tocar. Carrega em Seguinte para abrir.",
    side: "top",
    onAdvance: openLyricsPanel,
  },
  {
    id: "lyrics-shown",
    target: null,
    title: "Letra aberta",
    body: "Esta é a letra da música. Acompanha enquanto ouves. Carrega em Seguinte para fechar e continuar.",
    onAdvance: closeLyricsPanel,
  },
  {
    id: "fullscreen-queue",
    target: '[data-tour-id="player-queue"]',
    title: "Fila",
    body: "Vê e reorganiza a fila. Lá dentro, arrasta uma linha para a esquerda para a remover. Carrega em Seguinte para abrir.",
    side: "top",
    onAdvance: openQueuePanel,
  },
  {
    id: "queue-shown",
    target: null,
    title: "Fila aberta",
    body: "Esta é a fila de reprodução. Arrasta uma linha para a esquerda para a remover, ou usa o pega para reordenar. Carrega em Seguinte para fechar e continuar.",
    onAdvance: closeQueuePanel,
  },
  {
    id: "fullscreen-close",
    target: '[data-tour-id="fullscreen-close"]',
    title: "Voltar",
    body: "Toca na seta para fecharem o leitor e continuares o passeio.",
    side: "bottom",
    advanceOn: "click",
  },
  {
    id: "nav-playlists",
    target: '[data-tour-id="nav-playlists"]',
    title: "Playlists",
    body: "Cria e organiza as tuas playlists. Carrega em Seguinte para experimentares.",
    side: "auto",
    nextRoute: "/playlists",
  },
  {
    id: "playlists-page",
    target: null,
    title: "As tuas playlists",
    body: "Vês aqui todas as playlists que tens. Cria novas com o botão no topo. Carrega em Seguinte para continuar.",
    nextRoute: "/",
  },
  {
    id: "nav-profile",
    target: '[data-tour-id="nav-profile"]',
    title: "Perfil",
    body: "O teu perfil, estatísticas e definições. Carrega em Seguinte para experimentares.",
    side: "auto",
    nextRoute: "/profile",
  },
  {
    id: "profile-page",
    target: null,
    title: "Pronto!",
    body: "Este é o teu perfil. Aqui podes editar dados, gerir downloads e voltar a ver este passeio quando quiseres.",
  },
]

export const TOURS: Record<string, TourStep[]> = {
  main: MAIN_TOUR,
}
