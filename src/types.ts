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
  // Backward-compatible single selections
  metricBase?: string | null
  k?: number | null
  // New multi-select support
  metricBases?: string[]
  ks?: number[]
  // New: per-metric base -> selected k(s) mapping
  metricKByBase?: Record<string, number[]>
  // New tri-state maximize control: 'y' | 'none' | 'x'
  maximize?: 'y' | 'none' | 'x'
  showFrontier: boolean
  showDiagonal: boolean
  maximizeX: boolean
  maximizeY: boolean
}

export type SavedRadar = {
  categories: string[]
  metricBase: string | null
  k: number | null
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
  // Backward-compatible single Pareto configuration
  pareto?: SavedPareto
  // New: multiple Pareto charts per suite
  paretoSections?: SavedPareto[]
  // New: radar chart configuration
  radar?: SavedRadar
}

export type DiagramSpec = { key: string | null; metricBase: string | null }

export type Series = { name: string; color: string; points: { k: number; value: number }[] }
