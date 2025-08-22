import { buildMetricMap, parseMetricName } from './metrics'
import type { LoadedFile } from '../types'

export function getRadarMetricBasesFor(files: LoadedFile[], categories: string[]): string[] {
  const bases = new Set<string>()
  if (files.length === 0 || categories.length === 0) return []
  const counts: Record<string, number> = {}
  for (const f of files) {
    for (const cat of categories) {
      const map = buildMetricMap(cat, f.data?.[cat])
      const set = new Set(
        Object.keys(map)
          .map((m) => parseMetricName(m).base)
          .filter((b): b is string => !!b)
      )
      for (const b of set) counts[b] = (counts[b] || 0) + 1
    }
  }
  const need = files.length * categories.length
  for (const [b, c] of Object.entries(counts)) if (c === need) bases.add(b)
  return Array.from(bases).sort()
}

export function getRadarKsFor(files: LoadedFile[], categories: string[], base: string | null): number[] {
  const out = new Set<number>()
  if (!base || files.length === 0 || categories.length === 0) return []
  const counts: Record<number, number> = {}
  for (const f of files) {
    for (const cat of categories) {
      const map = buildMetricMap(cat, f.data?.[cat])
      const ks = new Set(
        Object.keys(map)
          .map((m) => parseMetricName(m))
          .filter((x) => x.base === base && x.k != null)
          .map((x) => x.k as number)
      )
      ks.forEach((k) => { counts[k] = (counts[k] || 0) + 1 })
    }
  }
  const need = files.length * categories.length
  for (const [k, c] of Object.entries(counts)) if (c === need) out.add(Number(k))
  return Array.from(out).sort((a, b) => a - b)
}
