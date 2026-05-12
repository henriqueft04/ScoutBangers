/**
 * Portuguese scouting hierarchy used to populate the profile dropdowns.
 * Regiões with an empty `nucleos` array don't have a núcleo subdivision —
 * the UI hides the Núcleo dropdown in that case.
 */
export interface Regiao {
  name: string
  nucleos: string[]
}

export const REGIOES: Regiao[] = [
  {
    name: "Açores",
    nucleos: [
      "Faial",
      "Pico",
      "Graciosa",
      "Santa Maria",
      "São Jorge",
      "São Miguel",
      "Terceira",
    ],
  },
  { name: "Algarve", nucleos: [] },
  { name: "Aveiro", nucleos: [] },
  { name: "Beja", nucleos: [] },
  {
    name: "Braga",
    nucleos: [
      "Barcelos",
      "Braga",
      "Cego do Maio",
      "Fafe",
      "Famalicão",
      "Guimarães",
      "Póvoa de Lanhoso",
      "Vieira do Minho",
      "Vila Verde",
    ],
  },
  { name: "Bragança-Miranda", nucleos: [] },
  {
    name: "Coimbra",
    nucleos: ["Beira-Mar", "Centro Norte", "Mondego Sul"],
  },
  { name: "Évora", nucleos: [] },
  { name: "Guarda", nucleos: [] },
  { name: "Lamego", nucleos: [] },
  { name: "Leiria-Fátima", nucleos: [] },
  {
    name: "Lisboa",
    nucleos: [
      "Barra",
      "Ocidental de Lisboa",
      "Oeste",
      "Oriental de Lisboa",
      "Moinhos de Vento",
      "Solarius",
      "Serra da Lua",
    ],
  },
  { name: "Madeira", nucleos: [] },
  { name: "Portalegre e Castelo Branco", nucleos: [] },
  {
    name: "Porto",
    nucleos: [
      "Centro Norte",
      "Cidade do Porto",
      "Douro Sul",
      "Este",
      "Litoral",
      "Norte",
      "Terras de Santa Maria",
    ],
  },
  { name: "Santarém", nucleos: [] },
  { name: "Setúbal", nucleos: [] },
  { name: "Viana Castelo", nucleos: [] },
  { name: "Vila Real", nucleos: [] },
  { name: "Viseu", nucleos: [] },
]

export function nucleosFor(regiao: string | null | undefined): string[] {
  if (!regiao) return []
  return REGIOES.find((r) => r.name === regiao)?.nucleos ?? []
}

export function regiaoHasNucleos(regiao: string | null | undefined): boolean {
  return nucleosFor(regiao).length > 0
}
