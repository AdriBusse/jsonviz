export type Manifest = {
  root: string
  generatedAt: string
  folders: { name: string; files: { name: string; path: string }[] }[]
}

export type LoadedFile = {
  path: string
  name: string
  data: any
  valid: boolean
  error?: string
}

export type SavedFilter = {
  id: string
  name: string
  rows: string[]
}

export type SavedPareto = {
  baseline: string | null
  variant: string | null
  categories: string[]
  metricBase: string | null
  k: number | null
  showFrontier: boolean
  showDiagonal: boolean
  maximizeX: boolean
  maximizeY: boolean
}

export type SavedSuite = {
  id: string
  name: string
  createdAt: string
  selected: string[]
  dataKeySections: string[]
  sectionFilters: Record<number, string | null>
  sectionRows: Record<number, string[]>
  diagramSections?: { key: string; metricBase: string }[]
  pareto?: SavedPareto
}

export type DiagramSpec = { key: string | null; metricBase: string | null }

export type Series = { name: string; color: string; points: { k: number; value: number }[] }
