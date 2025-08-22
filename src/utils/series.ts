import { buildMetricMap, parseMetricName } from './metrics'
import { colorForIndex } from './colors'
import type { LoadedFile, Series } from '../types'

export function buildChartSeries(
  selected: Set<string>,
  filesCache: Record<string, LoadedFile>,
  key: string,
  metricBase: string,
  isDark: boolean,
): Series[] {
  const sel = Array.from(selected)
  const validFiles = sel
    .map((p) => filesCache[p])
    .filter((f): f is LoadedFile => !!f && (f as any).valid)
  const series: Series[] = []
  const total = validFiles.length
  validFiles.forEach((f, idx) => {
    const map = buildMetricMap(key, f.data?.[key])
    const points: { k: number; value: number }[] = []
    for (const [metricName, v] of Object.entries(map)) {
      const { base, k } = parseMetricName(metricName)
      if (base === metricBase && k != null) {
        const num = typeof v === 'number' ? v : Number(v)
        if (Number.isFinite(num)) points.push({ k, value: num })
      }
    }
    points.sort((a, b) => a.k - b.k)
    if (points.length > 0) {
      const color = colorForIndex(isDark, idx, total)
      series.push({ name: f.name || f.path, color, points })
    }
  })
  return series
}

export function buildRadarSeriesFor(
  files: LoadedFile[],
  categories: string[],
  base: string | null,
  k: number | null,
  isDark: boolean,
): { name: string; values: number[]; color: string }[] {
  if (!base || k == null || categories.length === 0) return []
  const total = files.length
  return files.map((f, idx) => {
    const color = colorForIndex(isDark, idx, total)
    const values = categories.map((cat) => {
      const map = buildMetricMap(cat, f.data?.[cat])
      let val: number | null = null
      for (const [m, v] of Object.entries(map)) {
        const { base: b, k: kk } = parseMetricName(m)
        if (b === base && kk === k) {
          const num = typeof v === 'number' ? v : Number(v)
          if (Number.isFinite(num)) { val = num; break }
        }
      }
      return val ?? 0
    })
    return { name: f.name || f.path, values, color }
  })
}
