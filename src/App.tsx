import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Select, Spin, Table, Typography, Divider, FloatButton, Modal, Input, Space, Tag, Button, Checkbox, Popconfirm, message, Tooltip, Tabs, Collapse, Dropdown } from 'antd'
import { UpOutlined, InfoCircleOutlined, RightOutlined, DownloadOutlined } from '@ant-design/icons'
import './App.css'
import './table-theme.css'
import HeaderTitle from './components/HeaderTitle'
import ChartInfo from './components/ChartInfo'
import LineChart from './components/LineChart'
import { buildMetricMap, getMetricDescription, parseMetricName } from './utils/metrics'
import type { Manifest, LoadedFile, SavedFilter, SavedSuite, DiagramSpec, Series } from './types'

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filesCache, setFilesCache] = useState<Record<string, LoadedFile>>({})
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  // Dynamic list of data-key sections; start with one empty (null)
  const [dataKeySections, setDataKeySections] = useState<(string | null)[]>([null])
  const selectionRef = useRef<HTMLDivElement | null>(null)
  const diagramSvgRefs = useRef<Record<number, SVGSVGElement | null>>({})
  // Saved reusable filters (initialize from localStorage to avoid first-render overwrite)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try {
      const rawV2 = localStorage.getItem('jsonviz_filters_v2')
      if (rawV2) return JSON.parse(rawV2)
      const rawV1 = localStorage.getItem('jsonviz_filters_v1')
      if (rawV1) {
        const old = JSON.parse(rawV1)
        const migrated: SavedFilter[] = (old as any[]).map((f) => ({ id: f.id, name: f.name, rows: f.patterns ?? [] }))
        localStorage.setItem('jsonviz_filters_v2', JSON.stringify(migrated))
        return migrated
      }
    } catch {}
    return []
  })
  // Comparison suites (saved app state)
  const [savedSuites, setSavedSuites] = useState<SavedSuite[]>(() => {
    try {
      const raw = localStorage.getItem('jsonviz_suites_v1')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [activeSuiteId, setActiveSuiteId] = useState<string | undefined>(undefined)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  // When loading a suite, defer applying dataKeySections until keys are available
  const pendingSuiteKeysRef = useRef<string[] | null>(null)
  // Defer applying diagram sections until keys and metric bases are available
  const pendingSuiteDiagramsRef = useRef<{ key: string; metricBase: string }[] | null>(null)
  // Per-section applied filter ID (single) and explicit selected rows
  const [sectionFilters, setSectionFilters] = useState<Record<number, string | null>>({})
  const [sectionRows, setSectionRows] = useState<Record<number, string[]>>({})
  // UI state for filter manager
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingRows, setEditingRows] = useState<string[]>([])
  const [filterSearch, setFilterSearch] = useState('')

  // Track system dark mode to adjust colors for charts and labels
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    if ('addEventListener' in mql) {
      mql.addEventListener('change', handler)
    } else {
      // @ts-ignore legacy Safari
      mql.addListener(handler)
    }
    return () => {
      if ('removeEventListener' in mql) {
        mql.removeEventListener('change', handler)
      } else {
        // @ts-ignore legacy Safari
        mql.removeListener(handler)
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/results-manifest.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: Manifest = await res.json()
        if (mounted) setManifest(data)
      } catch (e: any) {
        if (mounted) setError(e?.message ?? 'Failed to load manifest')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // Load effect no longer needed; we initialized from storage above

  useEffect(() => {
    try {
      localStorage.setItem('jsonviz_filters_v2', JSON.stringify(savedFilters))
    } catch {}
  }, [savedFilters])

  useEffect(() => {
    try {
      localStorage.setItem('jsonviz_suites_v1', JSON.stringify(savedSuites))
    } catch {}
  }, [savedSuites])

  const totals = useMemo(() => {
    const totalFiles = manifest?.folders.reduce((acc, f) => acc + f.files.length, 0) ?? 0
    return { totalFiles, selected: selected.size }
  }, [manifest, selected])

  function toggleFile(path: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function toggleFolder(folderName: string, checked: boolean) {
    if (!manifest) return
    const folder = manifest.folders.find((f) => f.name === folderName)
    if (!folder) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const file of folder.files) {
        if (checked) next.add(file.path)
        else next.delete(file.path)
      }
      return next
    })
  }

  function isFolderFullySelected(folderName: string): boolean {
    if (!manifest) return false
    const folder = manifest.folders.find((f) => f.name === folderName)
    if (!folder || folder.files.length === 0) return false
    return folder.files.every((f) => selected.has(f.path))
  }

  function isFolderPartiallySelected(folderName: string): boolean {
    if (!manifest) return false
    const folder = manifest.folders.find((f) => f.name === folderName)
    if (!folder || folder.files.length === 0) return false
    const some = folder.files.some((f) => selected.has(f.path))
    const all = folder.files.every((f) => selected.has(f.path))
    return some && !all
  }

  // Build a saved suite object from current UI state
  function buildSuiteFromCurrent(name: string): SavedSuite {
    const keys = dataKeySections
      .map((k) => (k ?? null))
      .filter((k): k is string => k !== null)
    // Remap section indexes to compacted keys indexes
    const indexMap = new Map<number, number>()
    let j = 0
    dataKeySections.forEach((k, i) => {
      if (k != null) {
        indexMap.set(i, j)
        j += 1
      }
    })
    const compactFilters: Record<number, string | null> = {}
    Object.entries(sectionFilters).forEach(([idxStr, val]) => {
      const origIdx = Number(idxStr)
      if (!Number.isNaN(origIdx) && indexMap.has(origIdx)) {
        const newIdx = indexMap.get(origIdx) as number
        compactFilters[newIdx] = val
      }
    })
    const compactRows: Record<number, string[]> = {}
    Object.entries(sectionRows).forEach(([idxStr, rows]) => {
      const origIdx = Number(idxStr)
      if (!Number.isNaN(origIdx) && indexMap.has(origIdx)) {
        const newIdx = indexMap.get(origIdx) as number
        compactRows[newIdx] = rows
      }
    })
    const diagramsCompact = (diagramSections || [])
      .filter((d) => d.key && d.metricBase)
      .map((d) => ({ key: d.key as string, metricBase: d.metricBase as string }))

    return {
      id: Math.random().toString(36).slice(2, 9),
      name,
      createdAt: new Date().toISOString(),
      selected: Array.from(selected),
      dataKeySections: keys,
      sectionFilters: compactFilters,
      sectionRows: compactRows,
      diagramSections: diagramsCompact,
    }
  }

  function loadSuite(suite: SavedSuite) {
    setSelected(new Set(suite.selected))
    // Defer applying keys until we know commonDataKeys include them
    pendingSuiteKeysRef.current = suite.dataKeySections ?? []
    setSectionFilters(suite.sectionFilters ?? {})
    setSectionRows(suite.sectionRows ?? {})
    // Defer applying diagrams until keys and metric bases are ready
    const ds = (suite.diagramSections ?? []).filter((d) => d && d.key && d.metricBase) as { key: string; metricBase: string }[]
    pendingSuiteDiagramsRef.current = ds
    // show a clean placeholder until diagrams can be applied
    setDiagramSections([{ key: null, metricBase: null }])
    setActiveSuiteId(suite.id)
    message.success(`Loaded "${suite.name}"`)
  }

  // NOTE: Effect applying pending suite keys is defined later, after commonDataKeys

  // Fetch JSON content for selected files (cache results by path)
  useEffect(() => {
    const sel = Array.from(selected)
    if (sel.length === 0) {
      setDataKeySections([null])
      setSectionFilters({})
      setSectionRows({})
      setDiagramSections([{ key: null, metricBase: null }])
      return
    }
    const missing = sel.filter((p) => !filesCache[p])
    if (missing.length === 0) return
    let mounted = true
    ;(async () => {
      try {
        setFilesLoading(true)
        setFilesError(null)
        const loaded: Record<string, LoadedFile> = {}
        for (const p of missing) {
          try {
            const res = await fetch(p, { cache: 'no-store' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            const name = typeof json?.name === 'string' && json.name.trim() ? json.name.trim() : p.split('/').pop() || p
            const hasData = json && typeof json.data === 'object' && json.data !== null
            loaded[p] = { path: p, name, data: json?.data, valid: !!hasData, error: hasData ? undefined : 'Missing or invalid "data" key' }
          } catch (e: any) {
            loaded[p] = { path: p, name: p.split('/').pop() || p, data: null, valid: false, error: e?.message ?? 'Failed to fetch' }
          }
        }
        if (mounted) setFilesCache((prev) => ({ ...prev, ...loaded }))
      } catch (e: any) {
        if (mounted) setFilesError(e?.message ?? 'Failed loading files')
      } finally {
        if (mounted) setFilesLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Compute common data keys across valid selected files
  const commonDataKeys = useMemo(() => {
    const selFiles = Array.from(selected)
      .map((p) => filesCache[p])
      .filter((f): f is LoadedFile => !!f && f.valid)
    if (selFiles.length === 0) return [] as string[]
    const keySets = selFiles.map((f) => new Set(Object.keys(f.data ?? {})))
    const first = keySets[0]
    const inter = Array.from(first).filter((k) => keySets.every((s) => s.has(k)))
    inter.sort()
    return inter
  }, [selected, filesCache])

  // Validate existing section keys when commonDataKeys change
  useEffect(() => {
    setDataKeySections((prev) => {
      // 1) Drop invalid keys
      const mapped = prev.map((k) => (k && !commonDataKeys.includes(k) ? null : k))
      // 2) Remove all nulls except potentially the last one
      const compact = mapped.filter((k, i) => !(k === null && i < mapped.length - 1))
      // 3) Ensure exactly one trailing null placeholder
      return compact[compact.length - 1] === null ? compact : [...compact, null]
    })
  }, [commonDataKeys, selected, filesCache])

  // Keep diagram sections valid if keys/metrics become unavailable
  useEffect(() => {
    setDiagramSections((prev) => {
      const adjusted = prev.map((d) => {
        if (d.key && !commonDataKeys.includes(d.key)) return { key: null, metricBase: null }
        if (d.key && d.metricBase) {
          const bases = new Set(getAvailableMetricBasesForKey(d.key))
          if (!bases.has(d.metricBase)) return { key: d.key, metricBase: null }
        }
        return d
      })
      // remove intermediate empty placeholders; keep exactly one trailing placeholder
      const compact = adjusted.filter((d, i) => !(d.key == null && d.metricBase == null && i < adjusted.length - 1))
      return compact.length && compact[compact.length - 1].key == null && compact[compact.length - 1].metricBase == null
        ? compact
        : [...compact, { key: null, metricBase: null }]
    })
  }, [commonDataKeys])

  // Apply pending suite keys once commonDataKeys are ready (placed after declaration)
  useEffect(() => {
    const keys = pendingSuiteKeysRef.current
    if (!keys || keys.length === 0) return
    const allPresent = keys.every((k) => commonDataKeys.includes(k))
    if (allPresent) {
      setDataKeySections([...keys, null])
      pendingSuiteKeysRef.current = null
    }
  }, [commonDataKeys])

  // Build a global metric union (across all files in manifest) to power the filter manager
  const [globalMetricUnion, setGlobalMetricUnion] = useState<Record<string, Set<string>>>({})
  useEffect(() => {
    if (!manifest) return
    let cancelled = false
    async function scanAll() {
      const m = manifest!
      setGlobalMetricUnion({})
      const allEntries: { path: string }[] = []
      for (const folder of m.folders) {
        for (const file of folder.files) {
          allEntries.push({ path: file.path })
        }
      }
      for (const entry of allEntries) {
        if (cancelled) break
        try {
          const res = await fetch(entry.path)
          if (!res.ok) continue
          const data = await res.json()
          const d = data?.data
          if (!d || typeof d !== 'object') continue
          const keys = Object.keys(d)
          for (const k of keys) {
            const map = buildMetricMap(k, d[k])
            const rows = Object.keys(map)
            if (rows.length === 0) continue
            setGlobalMetricUnion((prev) => {
              const next = { ...prev }
              const set = new Set<string>(prev[k] ? Array.from(prev[k]) : [])
              for (const r of rows) set.add(r)
              next[k] = set
              return next
            })
          }
        } catch {
          // ignore bad files
        }
      }
    }
    scanAll()
    return () => { cancelled = true }
  }, [manifest])

  // Helpers
  const getMetricUnion = (key: string) => {
    const sel = Array.from(selected)
    const selectedFiles = sel.map((p) => filesCache[p])
    const validFiles = selectedFiles.filter((f): f is LoadedFile => !!f && f.valid)
    const metricUnion = new Set<string>()
    for (const f of validFiles) {
      const raw = f.data?.[key]
      const map = buildMetricMap(key, raw)
      Object.keys(map).forEach((m) => metricUnion.add(m))
    }
    return metricUnion
  }

  const getMetricList = (key: string) => {
    const list = Array.from(getMetricUnion(key))
    list.sort()
    return list
  }

  const applyFiltersToMetrics = (metrics: string[], filterId: string | null, explicitRows: string[]) => {
    const hasFilters = !!filterId
    const hasExplicit = explicitRows && explicitRows.length > 0
    if (!hasFilters && !hasExplicit) return metrics

    const fromFilters = new Set<string>(
      hasFilters ? (savedFilters.find((f) => f.id === filterId)?.rows ?? []) : []
    )
    const fromExplicit = new Set<string>(hasExplicit ? explicitRows : [])
    const union = new Set<string>([...fromFilters, ...fromExplicit])
    return metrics.filter((m) => union.has(m))
  }

  const getAllAvailableMetrics = () => {
    // Prefer global scan results; fallback to current selection unions
    const all = new Set<string>()
    const hasGlobal = Object.keys(globalMetricUnion).length > 0
    if (hasGlobal) {
      for (const k of Object.keys(globalMetricUnion)) {
        for (const m of globalMetricUnion[k]) all.add(m)
      }
    } else {
      for (const k of commonDataKeys) {
        for (const m of Array.from(getMetricUnion(k))) all.add(m)
      }
    }
    return Array.from(all).sort()
  }

  // Metric helpers moved to utils/metrics

  // ----- Visual Comparison (D3 Line Charts) -----
  const [diagramSections, setDiagramSections] = useState<DiagramSpec[]>([{ key: null, metricBase: null }])

  // Metric parsing helpers for charting
  // parseMetricName imported from utils

  const getAvailableMetricBasesForKey = (key: string): string[] => {
    const union = Array.from(getMetricUnion(key))
    const bases = new Set<string>()
    for (const m of union) {
      const { base, k } = parseMetricName(m)
      if (k != null) bases.add(base)
    }
    return Array.from(bases).sort()
  }

  // Apply pending suite diagrams once keys and metric bases are ready (placed after helper declaration)
  useEffect(() => {
    const ds = pendingSuiteDiagramsRef.current
    if (!ds || ds.length === 0) return
    // Ensure all keys are present
    const keysReady = ds.every((d) => commonDataKeys.includes(d.key))
    if (!keysReady) return
    // Ensure metric bases for each key are available
    const basesReady = ds.every((d) => {
      const bases = new Set(getAvailableMetricBasesForKey(d.key))
      return bases.has(d.metricBase)
    })
    if (!basesReady) return
    setDiagramSections([...ds.map((d) => ({ key: d.key, metricBase: d.metricBase })), { key: null, metricBase: null }])
    pendingSuiteDiagramsRef.current = null
  }, [commonDataKeys, selected, filesCache])
 

  function buildChartSeries(key: string, metricBase: string): Series[] {
    const sel = Array.from(selected)
    const validFiles = sel
      .map((p) => filesCache[p])
      .filter((f): f is LoadedFile => !!f && f.valid)
    const palette = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']
    const series: Series[] = []
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
      if (points.length > 0) series.push({ name: f.name || f.path, color: palette[idx % palette.length], points })
    })
    return series
  }

  function sanitizeFilename(name: string) {
    return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  }

  function downloadDiagram(idx: number, spec: { key: string; metricBase: string }, series: Series[], chartW: number, chartH: number) {
    const src = diagramSvgRefs.current[idx]
    if (!src) { message.error('Chart not ready to export'); return }
    const NS = 'http://www.w3.org/2000/svg'
    const titleText = `Showing ${spec.metricBase} across k for data key ${spec.key}`
    const margin = 16
    const titleFontSize = 14
    const titleHeight = titleFontSize + 8
    const legendItemH = 18
    const legendPadL = 16
    const legendW = 220
    const legendH = Math.max(legendItemH * series.length, chartH)
    const totalW = margin + chartW + legendPadL + legendW + margin
    const totalH = margin + titleHeight + legendH + margin

    const outSvg = document.createElementNS(NS, 'svg')
    outSvg.setAttribute('xmlns', NS)
    outSvg.setAttribute('width', String(totalW))
    outSvg.setAttribute('height', String(totalH))

    // Background to preserve dark mode visibility
    const bg = document.createElementNS(NS, 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(totalW))
    bg.setAttribute('height', String(totalH))
    bg.setAttribute('fill', isDark ? '#111' : '#ffffff')
    outSvg.appendChild(bg)

    // Title
    const title = document.createElementNS(NS, 'text')
    title.setAttribute('x', String(margin))
    title.setAttribute('y', String(margin + titleFontSize))
    title.setAttribute('font-size', String(titleFontSize))
    title.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')
    title.setAttribute('fill', isDark ? '#ddd' : '#333')
    title.textContent = titleText
    outSvg.appendChild(title)

    // Chart clone
    const chartGroup = document.createElementNS(NS, 'g')
    chartGroup.setAttribute('transform', `translate(${margin}, ${margin + titleHeight})`)
    const cloned = src.cloneNode(true) as SVGSVGElement
    // Ensure cloned SVG has no extra size that interferes; we use its content
    cloned.removeAttribute('width')
    cloned.removeAttribute('height')
    // Move all children of cloned into a group to avoid nested svg
    const wrap = document.createElementNS(NS, 'g')
    while (cloned.firstChild) wrap.appendChild(cloned.firstChild)
    chartGroup.appendChild(wrap)
    outSvg.appendChild(chartGroup)

    // Legend
    const legendG = document.createElementNS(NS, 'g')
    legendG.setAttribute('transform', `translate(${margin + chartW + legendPadL}, ${margin + titleHeight})`)
    series.forEach((s, i) => {
      const y = 2 + i * legendItemH
      const dot = document.createElementNS(NS, 'rect')
      dot.setAttribute('x', '0')
      dot.setAttribute('y', String(y - 9))
      dot.setAttribute('width', '12')
      dot.setAttribute('height', '12')
      dot.setAttribute('rx', '6')
      dot.setAttribute('ry', '6')
      dot.setAttribute('fill', s.color)
      legendG.appendChild(dot)
      const name = document.createElementNS(NS, 'text')
      name.setAttribute('x', '18')
      name.setAttribute('y', String(y))
      name.setAttribute('font-size', '12')
      name.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')
      name.setAttribute('fill', isDark ? '#ddd' : '#333')
      name.textContent = s.name
      legendG.appendChild(name)
    })
    outSvg.appendChild(legendG)

    const xml = new XMLSerializer().serializeToString(outSvg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const file = sanitizeFilename(`${compName}_${spec.key}_${spec.metricBase}.svg`)
    const a = document.createElement('a')
    a.href = url
    a.download = file
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function downloadDiagramPng(idx: number, spec: { key: string; metricBase: string }, series: Series[], chartW: number, chartH: number, useDarkBg: boolean) {
    const src = diagramSvgRefs.current[idx]
    if (!src) { message.error('Chart not ready to export'); return }
    const NS = 'http://www.w3.org/2000/svg'
    const titleText = `Showing ${spec.metricBase} across k for data key ${spec.key}`
    const margin = 16
    const titleFontSize = 14
    const titleHeight = titleFontSize + 8
    const legendItemH = 18
    const legendPadL = 16
    const legendW = 220
    const legendH = Math.max(legendItemH * series.length, chartH)
    const totalW = margin + chartW + legendPadL + legendW + margin
    const totalH = margin + titleHeight + legendH + margin

    const outSvg = document.createElementNS(NS, 'svg')
    outSvg.setAttribute('xmlns', NS)
    outSvg.setAttribute('width', String(totalW))
    outSvg.setAttribute('height', String(totalH))

    const bg = document.createElementNS(NS, 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(totalW))
    bg.setAttribute('height', String(totalH))
    bg.setAttribute('fill', useDarkBg ? '#111' : '#ffffff')
    outSvg.appendChild(bg)

    const title = document.createElementNS(NS, 'text')
    title.setAttribute('x', String(margin))
    title.setAttribute('y', String(margin + titleFontSize))
    title.setAttribute('font-size', String(titleFontSize))
    title.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')
    title.setAttribute('fill', useDarkBg ? '#ddd' : '#333')
    title.textContent = titleText
    outSvg.appendChild(title)

    const chartGroup = document.createElementNS(NS, 'g')
    chartGroup.setAttribute('transform', `translate(${margin}, ${margin + titleHeight})`)
    const cloned = src.cloneNode(true) as SVGSVGElement
    cloned.removeAttribute('width')
    cloned.removeAttribute('height')
    const wrap = document.createElementNS(NS, 'g')
    while (cloned.firstChild) wrap.appendChild(cloned.firstChild)
    // Adjust axis text/lines color to match background choice
    const axisText = wrap.querySelectorAll<SVGTextElement>('.tick text')
    axisText.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#333'))
    const domainLines = wrap.querySelectorAll<SVGPathElement>('.domain')
    domainLines.forEach((d) => {
      d.setAttribute('stroke', useDarkBg ? '#ddd' : '#333')
      d.style.opacity = '0.4'
    })
    const tickLines = wrap.querySelectorAll<SVGLineElement>('.tick line')
    tickLines.forEach((l) => {
      l.setAttribute('stroke', useDarkBg ? '#ddd' : '#333')
      l.style.opacity = '0.2'
    })
    chartGroup.appendChild(wrap)
    outSvg.appendChild(chartGroup)

    const legendG = document.createElementNS(NS, 'g')
    legendG.setAttribute('transform', `translate(${margin + chartW + legendPadL}, ${margin + titleHeight})`)
    series.forEach((s, i) => {
      const y = 2 + i * 18
      const dot = document.createElementNS(NS, 'rect')
      dot.setAttribute('x', '0')
      dot.setAttribute('y', String(y - 9))
      dot.setAttribute('width', '12')
      dot.setAttribute('height', '12')
      dot.setAttribute('rx', '6')
      dot.setAttribute('ry', '6')
      dot.setAttribute('fill', s.color)
      legendG.appendChild(dot)
      const name = document.createElementNS(NS, 'text')
      name.setAttribute('x', '18')
      name.setAttribute('y', String(y))
      name.setAttribute('font-size', '12')
      name.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')
      name.setAttribute('fill', useDarkBg ? '#ddd' : '#333')
      name.textContent = s.name
      legendG.appendChild(name)
    })
    outSvg.appendChild(legendG)

    const xml = new XMLSerializer().serializeToString(outSvg)
    const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = totalW
      canvas.height = totalH
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(svgUrl); message.error('Canvas not supported'); return }
      ctx.fillStyle = useDarkBg ? '#111' : '#ffffff'
      ctx.fillRect(0, 0, totalW, totalH)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) { URL.revokeObjectURL(svgUrl); message.error('Failed to export PNG'); return }
        const url = URL.createObjectURL(blob)
        const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
        const file = sanitizeFilename(`${compName}_${spec.key}_${spec.metricBase}.png`)
        const a = document.createElement('a')
        a.href = url
        a.download = file
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        URL.revokeObjectURL(svgUrl)
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      message.error('Failed to render PNG')
    }
    img.src = svgUrl
  }
  // Build table data for a given data key
  function getTableConfig(key: string | null, sectionIndex?: number) {
    if (!key) return { columns: [], dataSource: [] as any[] }
    const sel = Array.from(selected)
    const selectedFiles = sel.map((p) => filesCache[p])
    const validFiles = selectedFiles.filter((f): f is LoadedFile => !!f && f.valid)

    const perFileMetrics: Record<string, Record<string, any>> = {}
    const union = getMetricUnion(key)
    for (const f of validFiles) {
      const raw = f.data?.[key]
      perFileMetrics[f.path] = buildMetricMap(key, raw)
    }
    let metricList = Array.from(union).sort()
    if (sectionIndex != null) {
      const filterId = sectionFilters[sectionIndex] ?? null
      const rows = sectionRows[sectionIndex] ?? []
      metricList = applyFiltersToMetrics(metricList, filterId, rows)
    }

    const dataSource = metricList.map((metric) => {
      const row: any = { key: metric, metric }
      for (const f of validFiles) {
        row[f.path] = perFileMetrics[f.path]?.[metric]
      }
      return row
    })

    // Compute per-row numeric min/max across selected files for highlighting
    const extremaByMetric: Record<string, { min: number; max: number; count: number }> = {}
    for (const row of dataSource) {
      const nums: number[] = []
      for (const f of validFiles) {
        const val = row[f.path]
        const num = typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : NaN
        if (Number.isFinite(num)) nums.push(num)
      }
      if (nums.length >= 2) {
        extremaByMetric[row.metric] = {
          min: Math.min(...nums),
          max: Math.max(...nums),
          count: nums.length,
        }
      }
    }

    const numFmt = (v: any) => (typeof v === 'number' ? Number(v.toFixed(5)) : v)

    const columns: any[] = [
      { title: 'Metric', dataIndex: 'metric', key: 'metric', fixed: 'left', width: 280, render: (m: string) => {
        const desc = getMetricDescription(m)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <code>{m}</code>
            {desc && (
              <Tooltip title={desc}>
                <InfoCircleOutlined style={{ marginLeft: 6, color: isDark ? '#bbb' : '#999' }} />
              </Tooltip>
            )}
          </span>
        )
      } },
      ...sel.map((p) => {
        const f = filesCache[p]
        const titleName = f?.name || p.split('/').pop()
        return {
          title: <span style={{ color: isDark ? '#fff' : '#000' }}>{titleName}</span>,
          dataIndex: p,
          key: p,
          render: (v: any, record: any) => {
            if (!f) return <Spin size="small" />
            if (!f.valid) return <span style={{ color: isDark ? '#aaa' : '#999' }}>invalid</span>
            if (v === undefined) return ''
            if (typeof v === 'object') return JSON.stringify(v)
            const ext = extremaByMetric[record.metric]
            const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
            if (!Number.isFinite(num)) return String(v)
            if (ext && ext.count >= 2) {
              if (num === ext.max) return <span className="cell-max">{numFmt(num)}</span>
              if (num === ext.min) return <span className="cell-min">{numFmt(num)}</span>
            }
            return numFmt(num)
          },
          align: 'right' as const,
          width: 180,
        }
      }),
    ]

    return { columns, dataSource }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <HeaderTitle isDark={isDark} />
      <section>
        <div ref={selectionRef} id="selection-anchor" />
        <Collapse
          bordered
          defaultActiveKey={[]}
          style={{ background: 'transparent' }}
          className="fileCollapse"
          expandIcon={({ isActive }) => (
            <RightOutlined
              style={{
                color: isDark ? '#fff' : '#000',
                transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            />
          )}
        >
          <Collapse.Panel
            key="files"
            style={{ background: 'transparent' }}
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: isDark ? '#fff' : '#000' }}>
                <span style={{ fontWeight: 600 }}>JSON Visualizer — File Selection</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  {totals.selected} selected / {totals.totalFiles} files
                  {manifest?.generatedAt && (
                    <span style={{ marginLeft: 12 }}>manifest: {new Date(manifest.generatedAt).toLocaleString()}</span>
                  )}
                </span>
              </div>
            }
          >
            {loading && <div>Loading manifest…</div>}
            {error && (
              <div style={{ color: 'crimson' }}>
                Failed to load manifest: {error}. Make sure your JSON folders are under `public/results/` and run `npm run gen:manifest`.
              </div>
            )}

            {!loading && !error && manifest && manifest.folders.length === 0 && (
              <div style={{ color: '#555' }}>
                No folders found in <code>public/results/</code>. Add date folders with JSON files and rerun <code>npm run gen:manifest</code>.
              </div>
            )}

            {!loading && !error && manifest && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {manifest.folders.map((folder) => (
                  <div key={folder.name} style={{ border: '1px solid #e3e3e3', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={isFolderFullySelected(folder.name)}
                          ref={(el) => {
                            if (el) el.indeterminate = isFolderPartiallySelected(folder.name)
                          }}
                          onChange={(e) => toggleFolder(folder.name, e.currentTarget.checked)}
                          aria-checked={
                            isFolderPartiallySelected(folder.name)
                              ? 'mixed'
                              : isFolderFullySelected(folder.name)
                              ? 'true'
                              : 'false'
                          }
                        />
                        <strong style={{ color: isDark ? '#fff' : '#000' }}>{folder.name}</strong>
                      </div>
                      <small style={{ color: isDark ? '#aaa' : '#666' }}>{folder.files.length} files</small>
                    </div>

                    {folder.files.length > 0 && (
                      <ul style={{ marginTop: 8, listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {folder.files.map((file) => (
                          <li key={file.path} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={selected.has(file.path)}
                              onChange={(e) => toggleFile(file.path, e.currentTarget.checked)}
                            />
                            <code
                              title={file.path}
                              style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isDark ? '#fff' : '#000' }}
                            >
                              {file.name}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Collapse.Panel>
        </Collapse>
      </section>

      <section>
        <h2 style={{ marginBottom: 8 }}>Preview & Compare</h2>
        {filesError && <Alert type="error" message={`Failed loading files: ${filesError}`} showIcon style={{ marginBottom: 12 }} />}
        {/* ... */}
        {filesLoading && (
          <div style={{ marginBottom: 12 }}>
            <Spin /> <span style={{ marginLeft: 8 }}>Loading selected files…</span>
          </div>
        )}

        {/* Selected files list */}
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          <strong>Selected:</strong>{' '}
          {selected.size === 0 ? 'None' : `${selected.size} file(s)`}
        </Typography.Paragraph>

        <Divider style={{ margin: '8px 0 12px' }} />

        

        {/* Save/Load Comparison Suites */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Button
            type="primary"
            onClick={() => {
              const current = activeSuiteId ? savedSuites.find((x) => x.id === activeSuiteId) : undefined
              const defaultName = current?.name || `Suite ${new Date().toLocaleString()}`
              setSaveName(defaultName)
              setSaveModalOpen(true)
            }}
            disabled={selected.size === 0}
          >
            Save comparison
          </Button>
          <Select
            style={{ minWidth: 260 }}
            placeholder="Open saved comparison"
            options={savedSuites.map((s) => ({ label: s.name, value: s.id }))}
            value={activeSuiteId}
            onChange={(id) => {
              setActiveSuiteId(id as string)
              const s = savedSuites.find((x) => x.id === id)
              if (s) loadSuite(s)
            }}
            allowClear
            onClear={() => setActiveSuiteId(undefined)}
          />
          <Popconfirm
            title="Delete selected comparison?"
            onConfirm={() => {
              if (!activeSuiteId) return
              setSavedSuites((prev) => prev.filter((s) => s.id !== activeSuiteId))
              setActiveSuiteId(undefined)
              message.success('Deleted comparison')
            }}
          >
            <Button danger disabled={!activeSuiteId}>Delete</Button>
          </Popconfirm>
        </div>

        {/* Tabs: Tables and Diagrams */}
        <Tabs
          items={[
            {
              key: 'tables',
              label: <span style={{ color: isDark ? '#fff' : '#000' }}>Tables</span>,
              children: (
                <>
                  {/* Row Filters Manager */}
                  <div style={{ border: '1px dashed #bbb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>Row Filters</strong>
                        <Button size="small" type="primary" onClick={() => { setEditingFilter({ id: '', name: '', rows: [] }); setEditingName(''); setEditingRows([]); setFilterSearch(''); setFilterModalOpen(true) }}>Add filter</Button>
                      </div>
                    {savedFilters.length === 0 ? (
                      <div style={{ color: '#777', marginTop: 8 }}>No saved filters yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        {savedFilters.map((f) => (
                          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #eee', borderRadius: 6, padding: '6px 8px' }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{f.name}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {f.rows.map((p, i) => {
                                  const desc = getMetricDescription(p)
                                  return (
                                    <Tag key={i}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        {p}
                                        {desc && (
                                          <Tooltip title={desc}>
                                            <InfoCircleOutlined style={{ marginLeft: 6, color: '#999' }} />
                                          </Tooltip>
                                        )}
                                      </span>
                                    </Tag>
                                  )
                                })}
                              </div>
                            </div>
                            <Space>
                              <Button size="small" onClick={() => { setEditingFilter(f); setEditingName(f.name); setEditingRows(f.rows); setFilterSearch(''); setFilterModalOpen(true) }}>Edit</Button>
                              <Popconfirm title="Delete filter?" onConfirm={() => setSavedFilters((prev) => prev.filter((x) => x.id !== f.id))}>
                                <Button size="small" danger>Delete</Button>
                              </Popconfirm>
                            </Space>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sections: each has a selector and, if chosen, a table under it. */}
                  {selected.size > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {dataKeySections.map((key, idx) => {
                        const isPlaceholder = key == null
                        return (
                          <div
                            key={`section-${idx}`}
                            style={{
                              border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#e5e5e5'}`,
                              borderRadius: 8,
                              padding: 12,
                              color: isDark ? '#fff' : '#000',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <span style={{ color: isDark ? '#aaa' : '#666', minWidth: 90 }}>{isPlaceholder ? 'New data key:' : 'Data key:'}</span>
                              <Select
                                style={{ minWidth: 260 }}
                                placeholder={commonDataKeys.length ? 'Select data key' : 'No common data keys'}
                                options={commonDataKeys.map((k) => ({ label: k, value: k }))}
                                value={key ?? undefined}
                                onChange={(val) => {
                                  setDataKeySections((prev) => {
                                    const next = [...prev]
                                    next[idx] = val
                                    if (idx === prev.length - 1 && val) next.push(null)
                                    return next
                                  })
                                }}
                                allowClear
                                onClear={() => {
                                  setDataKeySections((prev) => {
                                    const next = [...prev]
                                    next[idx] = null
                                    return next
                                  })
                                }}
                              />
                              {!isPlaceholder && key && (
                                <>
                                  <Select
                                    style={{ minWidth: 240 }}
                                    placeholder="Apply saved filter"
                                    options={savedFilters.map((sf) => ({ label: sf.name, value: sf.id }))}
                                    value={sectionFilters[idx] ?? undefined}
                                    onChange={(val) => setSectionFilters((prev) => ({ ...prev, [idx]: (val as string) || null }))}
                                    allowClear
                                  />
                                  <Button
                                    onClick={() => {
                                      const allMetrics = getMetricList(key)
                                      const current = new Set(sectionRows[idx] ?? [])
                                      let tempSelected = new Set(current)
                                      let search = ''
                                      const MetricSelector = () => {
                                        const [query, setQuery] = useState(search)
                                        const [checked, setChecked] = useState<string[]>(Array.from(tempSelected))
                                        const filtered = allMetrics.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
                                        return (
                                          <div>
                                            <Input placeholder="Search rows" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 8 }} />
                                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                              <Button size="small" onClick={() => setChecked(filtered)}>Select visible</Button>
                                              <Button size="small" onClick={() => setChecked([])}>Clear</Button>
                                              <Button size="small" onClick={() => setChecked(allMetrics)}>Select all</Button>
                                            </div>
                                            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #eee', borderRadius: 4, padding: 8 }}>
                                              <Checkbox.Group
                                                style={{ width: '100%' }}
                                                value={checked}
                                                onChange={(vals) => setChecked(vals as string[])}
                                              >
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                  {filtered.map((m) => {
                                                    const desc = getMetricDescription(m)
                                                    return (
                                                      <Checkbox key={m} value={m}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                          {m}
                                                          {desc && (
                                                            <Tooltip title={desc}>
                                                              <InfoCircleOutlined style={{ marginLeft: 6, color: isDark ? '#bbb' : '#999' }} />
                                                            </Tooltip>
                                                          )}
                                                        </span>
                                                      </Checkbox>
                                                    )
                                                  })}
                                                </Space>
                                              </Checkbox.Group>
                                            </div>
                                            <div style={{ marginTop: 8, textAlign: 'right' }}>
                                              <Button type="primary" onClick={() => {
                                                setSectionRows((prev) => ({ ...prev, [idx]: checked }))
                                                Modal.destroyAll()
                                                message.success(`Selected ${checked.length} row(s) for table ${idx + 1}`)
                                              }}>Apply</Button>
                                            </div>
                                          </div>
                                        )
                                      }
                                      Modal.info({ title: 'Select rows to display', content: <MetricSelector />, width: 640, icon: null })
                                    }}
                                  >Rows…</Button>
                                </>
                              )}
                            </div>
                            {key && (
                              <div style={{ overflowX: 'auto' }}>
                                <Table
                                  className={`themedTable ${isDark ? 'dark' : 'light'}`}
                                  size="small"
                                  sticky
                                  title={() => (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: isDark ? '#fff' : '#000' }}>
                                      <div>
                                      Showing data key: <code>{key}</code>{' '}
                                      {((sectionFilters[idx] ? 1 : 0) > 0 || (sectionRows[idx] ?? []).length > 0) && (
                                        <span style={{ marginLeft: 8 }}>
                                          {sectionFilters[idx] && <Tag color="blue">filter: 1</Tag>}
                                          <Tag color="green">rows: {(sectionRows[idx] ?? []).length}</Tag>
                                        </span>
                                      )}
                                      </div>
                                      <a
                                        onClick={() => selectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        style={{ fontSize: 12, color: isDark ? '#91caff' : '#1677ff' }}
                                      >
                                        Back to selection
                                      </a>
                                    </div>
                                  )}
                                  columns={getTableConfig(key, idx).columns as any}
                                  dataSource={getTableConfig(key, idx).dataSource}
                                  pagination={false}
                                  scroll={{ x: 'max-content' }}
                                  bordered
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'diagrams',
              label: <span style={{ color: isDark ? '#fff' : '#000' }}>Diagrams</span>,
              children: (
                <>
                  {selected.size === 0 && <div style={{ color: '#888' }}>Select one or more files above to compare.</div>}
                  {selected.size > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
                        gap: 16,
                        alignItems: 'start',
                      }}
                    >
                      {diagramSections.map((spec, idx) => {
                        const metricBases = spec.key ? Array.from(getAvailableMetricBasesForKey(spec.key)) : []
                        const series = spec.key && spec.metricBase ? buildChartSeries(spec.key, spec.metricBase) : []
                        return (
                          <div key={`diagram-${idx}`} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 12, color: isDark ? '#fff' : '#000' }}>
                            <div style={{ marginBottom: 8, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                {spec.key && spec.metricBase ? (
                                  <ChartInfo k={spec.key} metricBase={spec.metricBase} />
                                ) : (
                                  <span>New diagram</span>
                                )}
                              </div>
                              {spec.key && spec.metricBase && series.length > 0 && (
                                <Dropdown
                                  menu={{
                                    items: [
                                      { key: 'png-light', label: 'PNG (Light bg)' },
                                      { key: 'png-dark', label: 'PNG (Dark bg)' },
                                      { key: 'svg', label: 'SVG' },
                                    ],
                                    onClick: ({ key }) => {
                                      if (key === 'png-light') {
                                        downloadDiagramPng(idx, { key: spec.key!, metricBase: spec.metricBase! }, series, 280, 200, false)
                                      } else if (key === 'png-dark') {
                                        downloadDiagramPng(idx, { key: spec.key!, metricBase: spec.metricBase! }, series, 280, 200, true)
                                      } else if (key === 'svg') {
                                        downloadDiagram(idx, { key: spec.key!, metricBase: spec.metricBase! }, series, 280, 200)
                                      }
                                    },
                                  }}
                                >
                                  <Button size="small" icon={<DownloadOutlined />}>Download</Button>
                                </Dropdown>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <Select
                                size="small"
                                style={{ width: 180 }}
                                placeholder={commonDataKeys.length ? 'Select data key' : 'No common keys'}
                                options={commonDataKeys.map((k) => ({ label: k, value: k }))}
                                value={spec.key ?? undefined}
                                onChange={(val) => {
                                  setDiagramSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { key: val, metricBase: null }
                                    if (idx === prev.length - 1) next.push({ key: null, metricBase: null })
                                    return next
                                  })
                                }}
                                allowClear
                                onClear={() => {
                                  setDiagramSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { key: null, metricBase: null }
                                    return next
                                  })
                                }}
                              />
                              <Select
                                size="small"
                                style={{ width: 160 }}
                                placeholder="Metric"
                                options={metricBases.map((b: string) => ({ label: b.toUpperCase(), value: b }))}
                                value={spec.metricBase ?? undefined}
                                onChange={(v) => {
                                  setDiagramSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { ...next[idx], metricBase: v }
                                    if (idx === prev.length - 1) next.push({ key: null, metricBase: null })
                                    return next
                                  })
                                }}
                                disabled={!spec.key}
                                allowClear
                                onClear={() => {
                                  setDiagramSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { ...next[idx], metricBase: null }
                                    return next
                                  })
                                }}
                              />
                            </div>
                            {spec.key && spec.metricBase && series.length === 0 && (
                              <div style={{ color: isDark ? '#aaa' : '#888' }}>No data for {spec.metricBase.toUpperCase()}@k under <code>{spec.key}</code> in selected files.</div>
                            )}
                            {spec.key && spec.metricBase && series.length > 0 && (
                              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'flex-start' }}>
                                <div>
                                  <LineChart series={series} width={280} height={200} isDark={isDark} exportRef={(el: SVGSVGElement | null) => { diagramSvgRefs.current[idx] = el }} />
                                </div>
                                <div style={{ minWidth: 120 }}>
                                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {series.map((s) => (
                                      <li key={`legend-${s.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 6, background: s.color }} />
                                        <Tooltip title={s.name}>
                                          <span style={{ display: 'inline-block', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {s.name.length > 24 ? `${s.name.slice(0, 24)}…` : s.name}
                                          </span>
                                        </Tooltip>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />

      </section>
      {/* Filter Add/Edit Modal */}
      <Modal
        open={filterModalOpen}
        onCancel={() => { setFilterModalOpen(false); setEditingFilter(null) }}
        title={editingFilter?.id ? 'Edit Row Filter' : 'Add Row Filter'}
        onOk={() => {
          if (!editingFilter) return
          const name = editingName.trim()
          if (!name) { message.error('Please provide a filter name'); return }
          if (editingFilter.id) {
            setSavedFilters((prev) => prev.map((f) => (f.id === editingFilter.id ? { ...editingFilter, name, rows: editingRows } : f)))
          } else {
            const id = Math.random().toString(36).slice(2, 9)
            setSavedFilters((prev) => [...prev, { id, name, rows: editingRows }])
          }
          setFilterModalOpen(false); setEditingFilter(null)
        }}
        okText="Save"
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 4 }}>Name</div>
            <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="e.g. Core metrics" />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>Select rows (scanned from all files in results)</div>
            <Input placeholder="Search rows" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #eee', borderRadius: 4, padding: 8 }}>
              <Checkbox.Group
                style={{ width: '100%' }}
                value={editingRows}
                onChange={(vals) => setEditingRows(vals as string[])}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {getAllAvailableMetrics()
                    .filter((m) => m.toLowerCase().includes(filterSearch.toLowerCase()))
                    .map((m) => {
                      const desc = getMetricDescription(m)
                      return (
                        <Checkbox key={m} value={m}>
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            {m}
                            {desc && (
                              <Tooltip title={desc}>
                                <InfoCircleOutlined style={{ marginLeft: 6, color: '#999' }} />
                              </Tooltip>
                            )}
                          </span>
                        </Checkbox>
                      )
                    })}
                </Space>
              </Checkbox.Group>
            </div>
          </div>
        </Space>
      </Modal>
      {/* Save Comparison Modal */}
      <Modal
        open={saveModalOpen}
        title="Save comparison"
        footer={[
          <Button key="cancel" onClick={() => setSaveModalOpen(false)}>Cancel</Button>,
          <Button
            key="saveNew"
            type="primary"
            onClick={() => {
              const name = saveName.trim()
              if (!name) { message.error('Please provide a name'); return }
              const suite = buildSuiteFromCurrent(name)
              setSavedSuites((prev) => [...prev, suite])
              setActiveSuiteId(suite.id)
              setSaveModalOpen(false)
              message.success(`Saved new comparison "${name}"`)
            }}
          >
            Save as new
          </Button>,
          activeSuiteId && savedSuites.find((s) => s.id === activeSuiteId) ? (
            <Button
              key="overwrite"
              danger
              onClick={() => {
                const name = saveName.trim()
                if (!name) { message.error('Please provide a name'); return }
                const current = savedSuites.find((s) => s.id === activeSuiteId)
                if (!current) { message.error('No active comparison selected'); return }
                const updated = buildSuiteFromCurrent(name)
                setSavedSuites((prev) => prev.map((s) => s.id === activeSuiteId ? { ...updated, id: current.id, createdAt: current.createdAt } : s))
                setSaveModalOpen(false)
                message.success(`Overwrote "${name}"`)
              }}
            >
              Overwrite current
            </Button>
          ) : null,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 4 }}>Name</div>
            <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. My comparison" />
          </div>
          <div style={{ color: '#666' }}>
            This will save:
            <ul style={{ margin: '4px 0 0 18px' }}>
              <li>Selected datasets</li>
              <li>Chosen data keys (tables)</li>
              <li>Applied per-table filter and rows</li>
              <li>Diagram sections (data key + metric)</li>
            </ul>
          </div>
        </Space>
      </Modal>
      <FloatButton
        icon={<UpOutlined />}
        tooltip="Back to selection"
        type="primary"
        style={{ right: 24, bottom: 24, zIndex: 2000 }}
        onClick={() => selectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
    </div>
  )
}

export default App
