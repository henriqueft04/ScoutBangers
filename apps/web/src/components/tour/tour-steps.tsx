import * as React from "react"
import type { Profile } from "@/hooks/auth-context"
import { FAVORITES_PLAYLIST_NAME } from "@/lib/playlist-saves"
import { supabase } from "@/lib/supabase"

import type { TourStep } from "./tour-context"

interface JokeOption {
  text: string
  reply: string
  /** A reaction image from `public/`, shown next to the reply. */
  image?: string
}

/** A playful "guess the new feature" card: every option gets its own reply. */
function JokeMultipleChoice({ options }: { options: JokeOption[] }) {
  const [selected, setSelected] = React.useState<number | null>(null)

  // Fetch the reaction images up front so they are there the instant an
  // option is tapped, not a beat later.
  React.useEffect(() => {
    for (const { image } of options) {
      if (image) new Image().src = image
    }
  }, [options])

  return (
    <div className="flex flex-col gap-3 mt-2">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => setSelected(i)}
          className={`text-left text-xs p-2 rounded-md transition-colors border ${selected === i ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent"}`}
        >
          {opt.text}
        </button>
      ))}
      {selected !== null && (
        <div className="mt-2 flex items-center gap-3">
          {options[selected].image ? (
            <img
              src={options[selected].image}
              alt=""
              className="size-16 shrink-0 object-contain"
            />
          ) : null}
          {/* min-w-0 lets the text shrink inside the flex row; anywhere-wrapping
              breaks a long unbroken word (a hashtag) instead of overflowing. */}
          <p className="min-w-0 text-sm font-medium text-red-800 wrap-anywhere">
            {options[selected].reply}
          </p>
        </div>
      )}
    </div>
  )
}

const SUBMISSION_JOKES: JokeOption[] = [
  { text: "Agora o ScoutBangers é pago 🤑 (vou ficar rico LET'S GOO)", reply: "Por acaso comprei agora uma mochila nova e as atividades andam caras, mas continua grátis 🏄" },
  { text: "As músicas vão passar a ser covers do Chefe Nacional 🎤", reply: "Embora o Chefe Bento tenha com certeza o maior vozeirão do CNE, ainda não o consegui convencer a cantar os 7 minutos da Ronda :(" },
  { text: "O Spotify comprou a app por duas Bifanas e um Fino 🌭", reply: "Embora adore essa combinação, seriam precisos mais alguns finos do que isso para eu vender o ScoutBangers hehe" },
]

const JAM_RIC_JOKES: JokeOption[] = [
  {
    text: "SIMMMM, estes updates têm mesmo muita piada!!!",
    reply: "Ó pá assim até fico tímido",
    image: "/timido.webp",
  },
  {
    text: "Não, és ganda chato",
    reply: "Yha esta opção bane a tua conta instantaneamente do scoutbangers, mas juro que não levei a peito",
    image: "/sideeye.webp",
  },
  {
    text: "Dou sempre skip às tuas piadas",
    reply: "ok... vou repensar o meu compromisso com o ScoutBangers, se calhar vou migrar para o TikTok...",
    image: "/sad.webp",
  },
]
const JAM_JOKES: JokeOption[] = [
  {
    text: "ScoutBangers Wrapped!!!",
    reply: "Vocês devem mesmo achar que isto é o Spotify e que eu não tenho mais nada para fazer ahaha",
  },
  {
    text: "O Fescut vai ser transmitido em direto na app! 📺",
    reply: "Não, ainda não sou pago pelo CNE, talvez um dia ✊🏼 #CNEpaga-meporfavortenhofomeeprecisodeunscalçoesdafardanovos",
  },
  {
    text: "A app agora usa Inteligência Artificial para adivinhar qual é a próxima música que queres ouvir 🧠",
    reply: "A IA achava sempre que era Ronda a seguir, ainda precisa de trabalho",
  },
]


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
 * Start the first song unless one is already loaded (the expand-to-fullscreen
 * button is only enabled once something is), so a tour that needs the player
 * never interrupts what the user is already listening to.
 */
function playFirstSongIfIdle(): void {
  const expand = document.querySelector(
    'button[aria-label="Abrir leitor em ecrã inteiro"]'
  )
  if (expand instanceof HTMLButtonElement && !expand.disabled) return
  playFirstSong()
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

function openPlaylistOptions(): void {
  clickTourButton('[data-tour-id="playlist-options"]')
}

/** The options sheet closes on Escape. */
function closePlaylistOptions(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
}

/** Set when the tour had to create a playlist so there is one to open. */
let tourPlaylistId: string | null = null

/**
 * Makes sure the user has a playlist (other than Favorites) for the tour to
 * open: someone with none would otherwise see the playlist steps point at
 * nothing. The playlist is private and empty, and stays theirs afterwards.
 */
async function ensureTourPlaylist(): Promise<void> {
  tourPlaylistId = null
  if (!supabase) return
  try {
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) return
    const { data: existing } = await supabase
      .from("playlists")
      .select("id")
      .eq("user_id", userId)
      .neq("name", FAVORITES_PLAYLIST_NAME)
      .limit(1)
    if (existing && existing.length > 0) return
    const { data: created } = await supabase
      .from("playlists")
      .insert({ user_id: userId, name: "A minha primeira playlist", is_public: false })
      .select("id")
      .single()
    tourPlaylistId = created?.id ?? null
  } catch {
    /* the steps just fall back to whatever playlist is listed */
  }
}

/**
 * Playlist walkthrough, shared by the main tour and the playlists update
 * tour so the two never drift apart. Starts on /playlists and ends inside a
 * playlist (the main tour's next step navigates away on its own).
 */
const PLAYLIST_STEPS: TourStep[] = [
  {
    id: "playlists-tabs",
    target: '[data-tour-id="playlists-tabs"]',
    route: "/playlists",
    title: "As minhas e Descobrir",
    body: "Em “As minhas” estão as tuas playlists, as partilhadas contigo e os convites para colaborar. Em “Descobrir” pesquisas as playlists públicas de outras pessoas e guardas as que gostares.",
    side: "bottom",
  },
  {
    id: "playlists-new",
    target: '[data-tour-id="playlists-new"]',
    title: "Criar uma playlist",
    body: "Cria uma nova playlist aqui. Também podes tocar no coração de uma música para a guardares numa playlist. Se ainda não tens nenhuma, criámos-te uma vazia para veres como funciona. Carrega em Seguinte para a abrires.",
    side: "bottom",
    onEnter: () => void ensureTourPlaylist(),
    nextRoute: () => {
      if (tourPlaylistId) return `/playlists/${tourPlaylistId}`
      // Favorites is listed first and can't be shared, so prefer the next one.
      const links = document.querySelectorAll(
        '[data-tour-id="playlists-list"] a[href^="/playlists/"]'
      )
      const link = links[1] ?? links[0]
      return link instanceof HTMLAnchorElement ? link.getAttribute("href") : null
    },
  },
  {
    id: "playlist-actions",
    target: '[data-tour-id="playlist-actions"]',
    title: "Dentro da playlist",
    body: "Guarda playlists de outros, descarrega para ouvir offline, partilha o link e convida colaboradores com o botão da pessoa com “+”: eles podem adicionar músicas, mudar o nome e a capa. À direita tens o aleatório e o play.",
    side: "bottom",
  },
  {
    id: "playlist-options",
    target: '[data-tour-id="playlist-options"]',
    title: "Mais opções",
    body: "Aqui estão as opções da playlist. Carrega em Seguinte para as veres.",
    side: "bottom",
    onAdvance: openPlaylistOptions,
  },
  {
    id: "playlist-options-shown",
    target: '[data-tour-id="playlist-options-panel"]',
    title: "O que podes fazer",
    body: "Editar o nome e a capa, tornar pública ou privada, convidar colaboradores, adicionar à fila e descarregar para ouvir offline. Carrega em Seguinte para fechar e continuar.",
    side: "top",
    onAdvance: closePlaylistOptions,
  },
]

export const MAIN_TOUR: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bem-vindo ao ScoutBangers",
    body: "Vou mostrar-te os essenciais em menos de um minuto para não estares perdido, era mesmo importante veres isto, mas podes bazar daqui a qualquer momento.",
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
    body: "Toca no coração para a marcares como favorita; abre também a lista para a guardares noutras playlists.",
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
    id: "fullscreen-jam",
    target: '[data-tour-id="player-jam"]',
    title: "Jam 🎧",
    body: "Cria uma Jam e partilha o link: quem abrir ouve exatamente o mesmo que tu, ao mesmo tempo. Qualquer pessoa na Jam pode pausar, avançar ou pôr músicas na fila. Quando estás numa, o título do leitor mostra quem está contigo. Ainda é novo e pode ter bugs, avisem-me se algo falhar 🤟",
    side: "top",
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
  ...PLAYLIST_STEPS,
  {
    id: "nav-submit",
    target: '[data-tour-id="nav-submit"]',
    route: "/",
    title: "Submeter músicas",
    body: "Qualquer pessoa pode submeter novas músicas (áudio e imagem de capa) para integrarem a plataforma. Começa por aqui!",
    side: "auto",
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
    id: "outro",
    target: null,
    title: "E é tudo!",
    body: "Tudo o resto vais descobrindo. Aproveita e partilha as tuas músicas favoritas com a malta!",
  },
]

export const UPDATE_TOUR: TourStep[] = [
  {
    id: "update-welcome",
    target: null,
    unskippable: true,
    title: "Atenção!! Novidades no ScoutBangers! 👀",
    body: "Há uma funcionalidade nova e um aviso importante. Em primeiro lugar: se tens tido problemas em tocar as músicas no telemóvel, por favor desinstala e volta a instalar a app, houve bastantes alterações na app e pode ser preciso reinstalar, my bad lol.",
  },
  {
    id: "update-joke",
    target: null,
    unskippable: true,
    title: "O que achas que é a nova feature? 🤔",
    body: <JokeMultipleChoice options={SUBMISSION_JOKES} />,
  },
  {
    id: "update-upload",
    target: '[data-tour-id="nav-submit"]',
    route: "/",
    unskippable: true,
    advanceOn: "click",
    title: "Nova Funcionalidade: Uploads!!!",
    body: "Agora qualquer pessoa pode submeter novas músicas (incluindo áudio e imagem de capa) para integrar a plataforma (já não têm de lidar com a dor de cabeça que é me mandar mensagem ahaha). Carrega aqui em cima e começa a contribuir!",
    side: "auto",
  }
]

/** Shown once: the Jam (listen together) feature. */
export const JAM_TOUR: TourStep[] = [
  {
    id: "jam-pre",
    target: null,
    title: "WOWWWW Mais novidades na APP!",
    body: "Ai ai qui loucura 😝. Esta é certamente a app do ano, breve ninguém usa Spotify, Apple Music ou YouTube Music, só ScoutBangers mesmo yhaaaa.",
  },
  {
    id: "jam-ric-joke",
    target: null,
    title: "Tinham saudades minhas?",
    body: <JokeMultipleChoice options={JAM_RIC_JOKES} />,
  },
  {
    id: "jam-joke",
    target: null,
    title: "Qual é a nova funcionalidade?",
    body: <JokeMultipleChoice options={JAM_JOKES} />,
  },
  {
    id: "jam-welcome",
    target: null,
    title: "Novidade: Jam! 🎧 (Tou-vos a dizer que isto vai ficar igual ao Spotify ahaha)",
    body: "Agora podes ouvir música ao mesmo tempo que os teus amigos, mesmo estando a quilómetros de distância. Vou mostrar-te onde fica, e bem fast KACHOWWW.",
  },
  {
    id: "jam-play",
    target: '[data-tour-id="song-list-demo"]',
    route: "/music",
    title: "Primeiro, uma música",
    body: "Para criares uma Jam precisas de ter uma música a tocar. Carrega em Seguinte e eu ponho uma a tocar (se já estiver alguma, fica como está).",
    side: "top",
    onAdvance: playFirstSongIfIdle,
  },
  {
    id: "jam-player-bar",
    target: '[data-tour-id="player-bar"]',
    title: "Barra do leitor",
    body: "Carrega em Seguinte para abrires o leitor completo.",
    side: "top",
    onAdvance: openFullscreenPlayer,
  },
  {
    id: "jam-button",
    target: '[data-tour-id="player-jam"]',
    title: "O botão da Jam",
    body: "Toca aqui para criares uma Jam e partilhares o link no WhatsApp, Instagram, onde quiseres. Quem abrir o link entra e ouve exatamente o mesmo que tu, ao mesmo tempo. Qualquer pessoa na Jam pode pausar, avançar ou pôr músicas na fila.",
    side: "top",
  },
  {
    id: "jam-status",
    target: '[data-tour-id="jam-status"]',
    title: "Quem está a ouvir",
    body: "Quando estás numa Jam, este título mostra quem está contigo. Toca nele para veres a malta e, se quiseres, saíres da Jam.",
    side: "bottom",
  },
  {
    id: "jam-close",
    target: '[data-tour-id="fullscreen-close"]',
    title: "Top xuxa!",
    body: "Toca na seta para fechares o leitor. Agora é só chamar a malta e fazer ganda party yhaaaaaaaaa meuu",
    side: "bottom",
  },
  {
    id: "jam-disclaimer",
    target: '[data-tour-id="fullscreen-close"]',
    title: "Disclaimer",
    body: "Isto pode muito bem estar tudo partido e não funcionar direito, como é algo que é preciso várias pessoas para testar não foi muito testado, portanto, se estiver terrível avisem-me yha 🤟",
    side: "bottom",
    advanceOn: "click",
  },
]

export const PLAYLISTS_TOUR: TourStep[] = [
  {
    id: "playlists-welcome",
    target: null,
    title: "BANGER UPDAAATEEEEEE",
    body: (
      <>
        <img
          src="/passinho.gif"
          alt=""
          className="mb-3 max-h-40 w-full rounded-md object-contain"
        />
        Ai ai qui locura 😝
      </>
    ),
  },
  {
    id: "playlists-intro",
    target: null,
    title: "As playlists estão muuuuito melhores🎶",
    body: "Agora há playlists colaborativas, playlists públicas para descobrir e guardar, capas personalizadas e muito mais. Olha bem fast onde está cada coisa.",
  },
  {
    id: "playlists-nav",
    target: '[data-tour-id="nav-playlists"]',
    route: "/",
    title: "Playlists",
    body: "Carrega em Seguinte para veres as novidades.",
    side: "auto",
    nextRoute: "/playlists",
  },
  ...PLAYLIST_STEPS,
]

export const TOURS: Record<string, TourStep[]> = {
  main: MAIN_TOUR,
  update: UPDATE_TOUR,
  jam: JAM_TOUR,
  playlists: PLAYLISTS_TOUR,
}

/** A profile flag recording that an update tour has been seen. */
export type UpdateTourColumn = Extract<keyof Profile, `${string}_tour_seen`>

/**
 * The one-off "what's new" tours, oldest first. Each is shown once per user —
 * after the main tour — and remembered by its profile column. To announce a
 * new feature: add its steps above, a `*_tour_seen` column (migration, schema
 * and types), and a line here. `id` must match its key in `TOURS`.
 */
export const UPDATE_TOURS: readonly { id: string; seenColumn: UpdateTourColumn }[] = [
  { id: "update", seenColumn: "update_tour_seen" },
  { id: "jam", seenColumn: "jam_tour_seen" },
  { id: "playlists", seenColumn: "playlists_tour_seen" },
]
