import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Select, Spin, Table, Typography, Divider, FloatButton, Modal, Input, InputNumber, Space, Tag, Button, Checkbox, Popconfirm, message, Tooltip, Tabs, Collapse, Dropdown } from 'antd'
import { UpOutlined, InfoCircleOutlined, RightOutlined, DownloadOutlined } from '@ant-design/icons'
import './App.css'
import './table-theme.css'
import HeaderTitle from './components/HeaderTitle'
import ChartInfo from './components/ChartInfo'
import LineChart from './components/LineChart'
 
import ParetoTab from './components/ParetoTab'
import RadarChart from './components/RadarChart'
import { buildMetricMap, getMetricDescription, parseMetricName } from './utils/metrics'
import { buildChartSeries, buildRadarSeriesFor } from './utils/series'
import { sanitizeFilename } from './utils/files'
import { getRadarMetricBasesFor, getRadarKsFor } from './utils/radar'
import { exportSvgWithTitle, exportPngWithTitle } from './utils/export'
import type { Manifest, LoadedFile, SavedFilter, SavedSuite, DiagramSpec, Series, SavedPareto, SavedRadar } from './types'

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
  const paretoSvgRefs = useRef<Record<number, SVGSVGElement | null>>({})
  const radarSvgRefs = useRef<Record<number, SVGSVGElement | null>>({})
  // Diagram preview modal state
  const [previewDiagram, setPreviewDiagram] = useState<{ key: string; metricBase: string } | null>(null)
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

  // Wire Pareto chart SVG ref from child component
  const setParetoSvgRef = (idx: number, el: SVGSVGElement | null) => {
    paretoSvgRefs.current[idx] = el
  }

  // Export Pareto chart (SVG) for a section
  function downloadParetoSvgAt(idx: number, sec: SavedPareto) {
    const src = paretoSvgRefs.current[idx]
    if (!src) { message.error('Pareto chart not ready to export'); return }
    const bName = sec.baseline ? (filesCache[sec.baseline]?.name || sec.baseline) : 'baseline'
    const vName = sec.variant ? (filesCache[sec.variant]?.name || sec.variant) : 'variant'
    const bases = (sec.metricBases && sec.metricBases.length) ? sec.metricBases.join(',') : (sec.metricBase ?? '')
    const ksTxt = (sec.ks && sec.ks.length) ? '@' + sec.ks.join(',') : (sec.k != null ? `@${sec.k}` : '')
    const baseK = (sec.metricKByBase && Object.keys(sec.metricKByBase).length)
      ? Object.entries(sec.metricKByBase)
          .flatMap(([b, ks]) => (Array.isArray(ks) ? ks.map((k) => `${b}@${k}`) : []))
          .join(', ')
      : `${bases}${ksTxt}`
    const titleText = `Pareto: ${baseK} — X: ${bName} vs Y: ${vName}`
    const chartW = 900
    const chartH = 520
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const file = sanitizeFilename(`${compName}_pareto_${(baseK || 'metric').replace(/[^a-z0-9_@,-]+/gi, '-')}.svg`)
    // Post-process cloned SVG so exported labels/axes are high-contrast for the chosen background
    exportSvgWithTitle(src, chartW, chartH, titleText, file, isDark, (wrap) => {
      const useDarkBg = isDark
      // Axis tick text
      const axisText = wrap.querySelectorAll<SVGTextElement>('.tick text')
      axisText.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      // Axis labels (x/y)
      const axisLabels = wrap.querySelectorAll<SVGTextElement>('.axis-label-x, .axis-label-y')
      axisLabels.forEach((t) => { t.setAttribute('fill', useDarkBg ? '#ddd' : '#111'); (t as any).style.opacity = '1' })
      // Point labels next to dots
      const pointLabels = wrap.querySelectorAll<SVGTextElement>('text.ppl')
      pointLabels.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      // Axis strokes
      const domainLines = wrap.querySelectorAll<SVGPathElement>('.domain')
      domainLines.forEach((d) => { d.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (d as any).style.opacity = '0.4' })
      const tickLines = wrap.querySelectorAll<SVGLineElement>('.tick line')
      tickLines.forEach((l) => { l.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (l as any).style.opacity = '0.2' })
    })
  }

  // Export Pareto chart (PNG) for a section
  function downloadParetoPngAt(idx: number, sec: SavedPareto, useDarkBg: boolean) {
    const src = paretoSvgRefs.current[idx]
    if (!src) { message.error('Pareto chart not ready to export'); return }
    const bName = sec.baseline ? (filesCache[sec.baseline]?.name || sec.baseline) : 'baseline'
    const vName = sec.variant ? (filesCache[sec.variant]?.name || sec.variant) : 'variant'
    const bases = (sec.metricBases && sec.metricBases.length) ? sec.metricBases.join(',') : (sec.metricBase ?? '')
    const ksTxt = (sec.ks && sec.ks.length) ? '@' + sec.ks.join(',') : (sec.k != null ? `@${sec.k}` : '')
    const baseK = (sec.metricKByBase && Object.keys(sec.metricKByBase).length)
      ? Object.entries(sec.metricKByBase)
          .flatMap(([b, ks]) => (Array.isArray(ks) ? ks.map((k) => `${b}@${k}`) : []))
          .join(', ')
      : `${bases}${ksTxt}`
    const titleText = `Pareto: ${baseK} — X: ${bName} vs Y: ${vName}`
    const chartW = 900
    const chartH = 520
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const file = sanitizeFilename(`${compName}_pareto_${(baseK || 'metric').replace(/[^a-z0-9_@,-]+/gi, '-')}.png`)
    exportPngWithTitle(src, chartW, chartH, titleText, file, useDarkBg, (wrap) => {
      const axisText = wrap.querySelectorAll<SVGTextElement>('.tick text')
      axisText.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      // Axis labels (x/y)
      const axisLabels = wrap.querySelectorAll<SVGTextElement>('.axis-label-x, .axis-label-y')
      axisLabels.forEach((t) => { t.setAttribute('fill', useDarkBg ? '#ddd' : '#111'); (t as any).style.opacity = '1' })
      // Point labels next to dots
      const pointLabels = wrap.querySelectorAll<SVGTextElement>('text.ppl')
      pointLabels.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      const domainLines = wrap.querySelectorAll<SVGPathElement>('.domain')
      domainLines.forEach((d) => { d.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (d as any).style.opacity = '0.4' })
      const tickLines = wrap.querySelectorAll<SVGLineElement>('.tick line')
      tickLines.forEach((l) => { l.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (l as any).style.opacity = '0.2' })
    })
  }
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
  // Client-side uploaded folders and input ref
  const [uploadedFolders, setUploadedFolders] = useState<{ name: string; files: { name: string; path: string }[] }[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  // When loading a suite, defer applying dataKeySections until keys are available
  const pendingSuiteKeysRef = useRef<string[] | null>(null)
  // Defer applying diagram sections until keys and metric bases are available
  const pendingSuiteDiagramsRef = useRef<{ key: string; metricBase: string }[] | null>(null)
  // Per-section applied filter ID (single) and explicit selected rows
  const [sectionFilters, setSectionFilters] = useState<Record<number, string | null>>({})
  const [sectionRows, setSectionRows] = useState<Record<number, string[]>>({})
  // Per-section near-maximum threshold for table highlighting (absolute diff from row max)
  const [nearMaxThresholds, setNearMaxThresholds] = useState<Record<number, number>>({})
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

  const allFolders = useMemo(() => {
    return [ ...(manifest?.folders ?? []), ...uploadedFolders ]
  }, [manifest, uploadedFolders])

  const totals = useMemo(() => {
    const totalFromManifest = manifest?.folders.reduce((acc, f) => acc + f.files.length, 0) ?? 0
    const totalFromUploaded = uploadedFolders.reduce((acc, f) => acc + f.files.length, 0)
    const totalFiles = totalFromManifest + totalFromUploaded
    return { totalFiles, selected: selected.size }
  }, [manifest, uploadedFolders, selected])

  function toggleFile(path: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function toggleFolder(folderName: string, checked: boolean) {
    const folder = allFolders.find((f) => f.name === folderName)
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
    const folder = allFolders.find((f) => f.name === folderName)
    if (!folder || folder.files.length === 0) return false
    return folder.files.every((f) => selected.has(f.path))
  }

  function isFolderPartiallySelected(folderName: string): boolean {
    const folder = allFolders.find((f) => f.name === folderName)
    if (!folder || folder.files.length === 0) return false
    const some = folder.files.some((f) => selected.has(f.path))
    const all = folder.files.every((f) => selected.has(f.path))
    return some && !all
  }

  // Handle directory upload (client-side)
  async function handleUploadDir(files: FileList | null) {
    if (!files || files.length === 0) return
    // Group json files by top-level folder name from webkitRelativePath
    const items = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.json'))
    if (items.length === 0) { message.warning('No JSON files found in selected directory'); return }
    type Group = { name: string; files: { name: string; path: string }[] }
    const byFolder = new Map<string, Group>()
    // Read all files
    const loadedEntries: Record<string, LoadedFile> = {}
    for (const f of items) {
      const rel = (f as any).webkitRelativePath as string | undefined
      const topFolder = rel ? rel.split('/')[0] : 'uploaded'
      const folderKey = `Uploaded/${topFolder}`
      if (!byFolder.has(folderKey)) byFolder.set(folderKey, { name: folderKey, files: [] })
      const text = await f.text().catch(() => null)
      if (!text) continue
      try {
        const json = JSON.parse(text)
        const hasData = json && typeof json.data === 'object' && json.data !== null
        const displayName = typeof json?.name === 'string' && json.name.trim() ? json.name.trim() : f.name
        // Build a virtual path for this uploaded file
        const vpathBase = `uploaded://${topFolder}/${f.name}`
        let vpath = vpathBase
        let counter = 1
        while (loadedEntries[vpath] || filesCache[vpath]) { vpath = `${vpathBase}#${counter++}` }
        loadedEntries[vpath] = { path: vpath, name: displayName, data: json?.data, valid: !!hasData, error: hasData ? undefined : 'Missing or invalid "data" key' }
        byFolder.get(folderKey)!.files.push({ name: f.name, path: vpath })
      } catch (e) {
        // skip bad json
      }
    }
    if (Object.keys(loadedEntries).length === 0) { message.error('Failed to parse any JSON files from the folder'); return }
    // Update caches and uploaded folders
    setFilesCache((prev) => ({ ...prev, ...loadedEntries }))
    setUploadedFolders((prev) => ([ ...prev, ...Array.from(byFolder.values()) ]))
    message.success(`Imported ${Object.keys(loadedEntries).length} file(s) from ${byFolder.size} folder(s)`) 
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
    // Compact per-table near-max thresholds
    const compactNear: Record<number, number> = {}
    Object.entries(nearMaxThresholds).forEach(([idxStr, thr]) => {
      const origIdx = Number(idxStr)
      if (!Number.isNaN(origIdx) && indexMap.has(origIdx)) {
        const newIdx = indexMap.get(origIdx) as number
        if (typeof thr === 'number' && Number.isFinite(thr)) compactNear[newIdx] = thr
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
      sectionNearMaxThresholds: compactNear,
      diagramSections: diagramsCompact,
      // Back-compat single pareto (use first section or current single state)
      pareto: (() => {
        const first = (paretoSections || []).find((s) => (s.metricBases && s.metricBases.length) || (s.metricBase && s.metricBase.length))
        const baseSec = first || {
          metricBase: paretoMetricBase,
          k: paretoK,
          metricBases: paretoMetricBasesSel,
          ks: paretoKsSel,
          metricKByBase: paretoMetricKByBase,
          showFrontier: paretoShowFrontier,
          showDiagonal: paretoShowDiagonal,
          maximize: paretoMaximizeMode,
          maximizeX: paretoMaximizeMode === 'x',
          maximizeY: paretoMaximizeMode === 'y',
        } as Partial<SavedPareto>
        return {
          baseline: paretoBaseline,
          variant: paretoVariant,
          categories: (Array.isArray((baseSec as any).categories) && (baseSec as any).categories.length > 0) ? (baseSec as any).categories : paretoCategories,
          metricBase: baseSec.metricBase ?? null,
          k: baseSec.k ?? null,
          metricBases: baseSec.metricBases ?? [],
          ks: baseSec.ks ?? [],
          metricKByBase: baseSec.metricKByBase ?? {},
          showFrontier: !!baseSec.showFrontier,
          showDiagonal: !!baseSec.showDiagonal,
          maximize: (baseSec.maximize as 'y' | 'none' | 'x') ?? 'none',
          maximizeX: !!baseSec.maximizeX,
          maximizeY: !!baseSec.maximizeY,
        } as SavedPareto
      })(),
      // New: all pareto sections; embed current globals (baseline/variant/categories)
      paretoSections: (paretoSections || []).map((s) => ({
        baseline: paretoBaseline,
        variant: paretoVariant,
        categories: Array.isArray(s.categories) ? s.categories : [],
        metricBase: s.metricBase ?? null,
        k: s.k ?? null,
        metricBases: s.metricBases ?? [],
        ks: s.ks ?? [],
        metricKByBase: s.metricKByBase ?? {},
        showFrontier: !!s.showFrontier,
        showDiagonal: !!s.showDiagonal,
        maximize: (s.maximize as 'y' | 'none' | 'x') ?? 'none',
        maximizeX: !!s.maximizeX,
        maximizeY: !!s.maximizeY,
      })),
      // Radar (back-compat single); prefer first populated section if available
      radar: (() => {
        const first = (radarSections || []).find((s) => s.metricBase && s.k != null)
        return {
          categories: Array.isArray(radarCategories) ? radarCategories : [],
          metricBase: (first?.metricBase ?? radarMetricBase) ?? null,
          k: (first?.k ?? radarK) ?? null,
        }
      })(),
      // New: all radar sections (persist configured and partially-configured; drop pure placeholders)
      radarSections: (radarSections || [])
        .filter((s) => s && (s.metricBase != null || s.k != null))
        .map((s) => ({
          categories: Array.isArray(radarCategories) ? radarCategories : [],
          metricBase: s.metricBase ?? null,
          k: s.k ?? null,
        })),
    }
  }

  function loadSuite(suite: SavedSuite) {
    setSelected(new Set(suite.selected))
    // Defer applying keys until we know commonDataKeys include them
    pendingSuiteKeysRef.current = suite.dataKeySections ?? []
    setSectionFilters(suite.sectionFilters ?? {})
    setSectionRows(suite.sectionRows ?? {})
    setNearMaxThresholds(suite.sectionNearMaxThresholds ?? {})
    // Defer applying diagrams until keys and metric bases are ready
    const ds = (suite.diagramSections ?? []).filter((d) => d && d.key && d.metricBase) as { key: string; metricBase: string }[]
    pendingSuiteDiagramsRef.current = ds
    // show a clean placeholder until diagrams can be applied
    setDiagramSections([{ key: null, metricBase: null }])
    setActiveSuiteId(suite.id)
    // Apply Pareto settings if present (single + multiple)
    if (suite.pareto) {
      setParetoBaseline(suite.pareto.baseline ?? null)
      setParetoVariant(suite.pareto.variant ?? null)
      setParetoCategories(Array.isArray(suite.pareto.categories) ? suite.pareto.categories : [])
      setParetoMetricBase(suite.pareto.metricBase ?? null)
      setParetoK(suite.pareto.k ?? null)
      setParetoMetricBasesSel(Array.isArray(suite.pareto.metricBases) ? suite.pareto.metricBases : [])
      setParetoKsSel(Array.isArray(suite.pareto.ks) ? suite.pareto.ks : [])
      // Normalize old/new metricKByBase formats to arrays
      const rawMap = (suite.pareto.metricKByBase ?? {}) as Record<string, unknown>
      const normalized: Record<string, number[]> = {}
      for (const [base, val] of Object.entries(rawMap)) {
        if (Array.isArray(val)) {
          normalized[base] = (val as unknown[]).filter((x) => typeof x === 'number') as number[]
        } else if (typeof val === 'number') {
          normalized[base] = [val]
        } else if (val == null) {
          normalized[base] = []
        }
      }
      setParetoMetricKByBase(normalized)
      setParetoShowFrontier(!!suite.pareto.showFrontier)
      setParetoShowDiagonal(!!suite.pareto.showDiagonal)
      if (suite.pareto.maximize === 'x' || suite.pareto.maximize === 'y' || suite.pareto.maximize === 'none') {
        setParetoMaximizeMode(suite.pareto.maximize)
      } else {
        const mx = !!suite.pareto.maximizeX
        const my = !!suite.pareto.maximizeY
        setParetoMaximizeMode(mx && !my ? 'x' : my && !mx ? 'y' : 'none')
      }
    }
    // Apply multi Pareto sections if present
    if (suite.paretoSections && Array.isArray(suite.paretoSections) && suite.paretoSections.length > 0) {
      const first = suite.paretoSections[0]
      setParetoBaseline(first.baseline ?? null)
      setParetoVariant(first.variant ?? null)
      setParetoCategories(Array.isArray(first.categories) ? first.categories : [])
      const normalized = suite.paretoSections.map((s) => ({
        baseline: s.baseline ?? null,
        variant: s.variant ?? null,
        categories: Array.isArray(s.categories) ? s.categories : [],
        metricBase: s.metricBase ?? null,
        k: s.k ?? null,
        metricBases: Array.isArray(s.metricBases) ? s.metricBases : [],
        ks: Array.isArray(s.ks) ? s.ks : [],
        metricKByBase: s.metricKByBase ?? {},
        showFrontier: !!s.showFrontier,
        showDiagonal: !!s.showDiagonal,
        maximize: (s.maximize as 'y' | 'none' | 'x') ?? 'none',
        maximizeX: !!s.maximizeX,
        maximizeY: !!s.maximizeY,
      }))
      setParetoSections(normalized)
    } else {
      // Ensure at least one placeholder section exists
      setParetoSections([
        {
          baseline: null,
          variant: null,
          categories: paretoCategories,
          metricBases: [],
          ks: [],
          metricKByBase: {},
          showFrontier: true,
          showDiagonal: true,
          maximize: 'none',
          maximizeX: false,
          maximizeY: false,
        },
      ])
    }
    // Apply Radar (multi first; fallback to legacy single; else placeholder)
    if (suite.radarSections && Array.isArray(suite.radarSections) && suite.radarSections.length > 0) {
      const normalizedRadar = suite.radarSections.map((s) => ({
        categories: Array.isArray(s.categories) ? s.categories : [],
        metricBase: s.metricBase ?? null,
        k: s.k ?? null,
      }))
      setRadarSections(normalizedRadar)
      // Prefer global radar categories if provided; otherwise first non-empty section, else []
      let cats = Array.isArray(suite.radar?.categories) ? suite.radar!.categories : []
      if (!cats || cats.length === 0) {
        const firstNonEmpty = normalizedRadar.find((s) => Array.isArray(s.categories) && s.categories.length > 0)
        cats = firstNonEmpty ? (firstNonEmpty.categories as string[]) : []
      }
      setRadarCategories(cats)
      const firstR = normalizedRadar[0]
      setRadarMetricBase((suite.radar?.metricBase ?? firstR.metricBase) ?? null)
      setRadarK((suite.radar?.k ?? firstR.k) ?? null)
    } else if (suite.radar) {
      const cats = Array.isArray(suite.radar.categories) ? suite.radar.categories : []
      const base = suite.radar.metricBase ?? null
      const kk = suite.radar.k ?? null
      setRadarCategories(cats)
      setRadarMetricBase(base)
      setRadarK(kk)
      setRadarSections([{ categories: cats, metricBase: base, k: kk }])
    } else {
      setRadarSections([{ categories: [], metricBase: null, k: null }])
    }
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
      // include manifest folders
      for (const folder of m.folders) {
        for (const file of folder.files) {
          allEntries.push({ path: file.path })
        }
      }
      // include uploaded folders
      for (const uf of uploadedFolders) {
        for (const file of uf.files) {
          allEntries.push({ path: file.path })
        }
      }
      for (const entry of allEntries) {
        if (cancelled) break
        try {
          let data: any | null = null
          const cached = filesCache[entry.path]
          if (cached) {
            data = { data: cached.data }
          } else {
            const res = await fetch(entry.path)
            if (!res.ok) continue
            data = await res.json()
          }
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
  }, [manifest, uploadedFolders, filesCache])

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
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(null)
  const previewSeries = useMemo(() => {
    if (!previewDiagram || !previewDiagram.key || !previewDiagram.metricBase) return [] as Series[]
    return buildChartSeries(selected, filesCache, previewDiagram.key, previewDiagram.metricBase, isDark)
  }, [previewDiagram, selected, filesCache])

  // ----- Pareto Frontier (separate area) -----
  const selectedValidFiles = useMemo(() => {
    return Array.from(selected)
      .map((p) => filesCache[p])
      .filter((f): f is LoadedFile => !!f && f.valid)
  }, [selected, filesCache])
  const [paretoBaseline, setParetoBaseline] = useState<string | null>(null)
  const [paretoVariant, setParetoVariant] = useState<string | null>(null)
  const [paretoCategories, setParetoCategories] = useState<string[]>([])
  // Back-compat single selections (kept for loading old suites); not used for chart if multi selects are set
  const [paretoMetricBase, setParetoMetricBase] = useState<string | null>(null)
  const [paretoK, setParetoK] = useState<number | null>(null)
  // New multi-selects
  const [paretoMetricBasesSel, setParetoMetricBasesSel] = useState<string[]>([])
  const [paretoKsSel, setParetoKsSel] = useState<number[]>([])
  // New: per-metric selected k mapping for Pareto
  const [paretoMetricKByBase, setParetoMetricKByBase] = useState<Record<string, number[]>>({})
  const [paretoShowFrontier, setParetoShowFrontier] = useState(true)
  const [paretoShowDiagonal, setParetoShowDiagonal] = useState(true)
  const [paretoMaximizeMode, setParetoMaximizeMode] = useState<'y' | 'none' | 'x'>('none')

  // Multiple Pareto sections (stacked charts). Each section controls its own metric selections and display.
  const [paretoSections, setParetoSections] = useState<SavedPareto[]>([
    {
      baseline: null,
      variant: null,
      categories: paretoCategories,
      metricBases: [],
      ks: [],
      metricKByBase: {},
      showFrontier: true,
      showDiagonal: true,
      maximize: 'none',
      maximizeX: false,
      maximizeY: false,
    },
  ])

  // Initialize defaults when selection changes
  useEffect(() => {
    if (!paretoBaseline && selectedValidFiles[0]) setParetoBaseline(selectedValidFiles[0].path)
    if (!paretoVariant && selectedValidFiles[1]) setParetoVariant(selectedValidFiles[1].path)
    // Preselect likely category keys
    if (paretoCategories.length === 0 && commonDataKeys.length > 0) {
      const likely = commonDataKeys.filter((k) => /gold|generic|synonym|short|shorten|shortened/i.test(k))
      setParetoCategories(likely.length ? likely : commonDataKeys.slice(0, Math.min(8, commonDataKeys.length)))
    }
  }, [selectedValidFiles, commonDataKeys])

  // ----- Radar (multiple sections; categories across files at base@k) -----
  // Back-compat single-state (used only for older suites and fallback save)
  const [radarCategories, setRadarCategories] = useState<string[]>([])
  const [radarMetricBase, setRadarMetricBase] = useState<string | null>(null)
  const [radarK, setRadarK] = useState<number | null>(null)
  // New multi Radar sections
  const [radarSections, setRadarSections] = useState<SavedRadar[]>([
    { categories: [], metricBase: null, k: null },
  ])

  // Default categories similar to Pareto on first load/selection
  useEffect(() => {
    if (radarCategories.length === 0 && commonDataKeys.length > 0) {
      const likely = commonDataKeys.filter((k) => /gold|generic|synonym|short|shorten|shortened/i.test(k))
      setRadarCategories(likely.length ? likely : commonDataKeys.slice(0, Math.min(8, commonDataKeys.length)))
    }
  }, [commonDataKeys])

  const selectedRadarFiles = useMemo(() => {
    return Array.from(selected)
      .map((p) => filesCache[p])
      .filter((f): f is LoadedFile => !!f && f.valid)
  }, [selected, filesCache])

  // Radar availability helpers moved to utils/radar

  // Keep first radar section defaults in sync with availability (placeholder convenience)
  useEffect(() => {
    setRadarSections((prev) => {
      // Defer adjustments until files are loaded; avoid wiping loaded sections on initial load
      if (selectedRadarFiles.length === 0) return prev
      // Also wait until global categories are set; otherwise availability looks empty
      if (!radarCategories || radarCategories.length === 0) return prev
      if (prev.length === 0) return [{ categories: [], metricBase: null, k: null }]
      const first = prev[0]
      const cats = first.categories.length > 0 ? first.categories : (radarCategories.length > 0 ? radarCategories : first.categories)
      const bases = getRadarMetricBasesFor(selectedRadarFiles, cats)
      let base = first.metricBase
      let k = first.k
      if (bases.length > 0 && (!base || !bases.includes(base))) base = bases[0]
      if (bases.length === 0) { base = null; k = null }
      const ks = getRadarKsFor(selectedRadarFiles, cats, base)
      if (ks.length > 0 && (k == null || !ks.includes(k))) k = ks[0]
      if (base && ks.length === 0) k = null
      const next = [...prev]
      next[0] = { categories: cats, metricBase: base, k }
      return next
    })
  }, [selectedRadarFiles, radarCategories])

  // Keep all radar sections valid when global categories or files change; ensure one trailing placeholder
  useEffect(() => {
    setRadarSections((prev) => {
      // Defer adjustments until files are loaded; avoid wiping loaded sections on initial load
      if (selectedRadarFiles.length === 0) return prev
      // Also wait until global categories are set; otherwise availability looks empty
      if (!radarCategories || radarCategories.length === 0) return prev
      const adjusted = prev.map((s) => {
        const bases = new Set(getRadarMetricBasesFor(selectedRadarFiles, radarCategories))
        let metricBase = s.metricBase as string | null
        let k = s.k as number | null
        if (metricBase && !bases.has(metricBase)) {
          metricBase = null
          k = null
        }
        if (metricBase) {
          const kset = new Set(getRadarKsFor(selectedRadarFiles, radarCategories, metricBase))
          if (k != null && !kset.has(k)) {
            k = null
          }
        }
        return { ...s, metricBase, k }
      })
      const compact = adjusted.filter((s, i) => !(s.metricBase == null && s.k == null && i < adjusted.length - 1))
      return compact.length && compact[compact.length - 1].metricBase == null && compact[compact.length - 1].k == null
        ? compact
        : [...compact, { categories: [], metricBase: null, k: null }]
    })
  }, [radarCategories, selectedRadarFiles])

  // buildRadarSeriesFor moved to utils/series

  // Export Radar SVG per section
  function downloadRadarSvgAt(idx: number, sec: SavedRadar, useDarkBg: boolean) {
    const src = radarSvgRefs.current[idx]
    if (!src) { message.error('Radar chart not ready to export'); return }
    const chartW = 860
    const chartH = 520
    const catsTxt = (sec.categories || []).join(', ')
    const titleText = sec.metricBase && sec.k != null ? `Radar: ${sec.metricBase}@${sec.k} — ${catsTxt}` : 'Radar'
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const baseK = sec.metricBase && sec.k != null ? `${sec.metricBase}@${sec.k}` : 'metric'
    const file = sanitizeFilename(`${compName}_radar_${baseK}.svg`)
    // Ensure high-contrast text and point strokes on export based on background
    exportSvgWithTitle(src, chartW, chartH, titleText, file, useDarkBg, (wrap) => {
      // Darken all chart texts (category labels, ring labels, legend)
      const texts = wrap.querySelectorAll<SVGTextElement>('text')
      texts.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      // Make radar point outlines darker on light to improve visibility
      const pts = wrap.querySelectorAll<SVGCircleElement>('g.radar-points circle')
      pts.forEach((c) => c.setAttribute('stroke', useDarkBg ? '#111' : '#333'))
    })
  }

  // Export Radar PNG per section
  function downloadRadarPngAt(idx: number, sec: SavedRadar, useDarkBg: boolean) {
    const src = radarSvgRefs.current[idx]
    if (!src) { message.error('Radar chart not ready to export'); return }
    const chartW = 860
    const chartH = 520
    const catsTxt = (sec.categories || []).join(', ')
    const titleText = sec.metricBase && sec.k != null ? `Radar: ${sec.metricBase}@${sec.k} — ${catsTxt}` : 'Radar'
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const baseK = sec.metricBase && sec.k != null ? `${sec.metricBase}@${sec.k}` : 'metric'
    const file = sanitizeFilename(`${compName}_radar_${baseK}.png`)
    exportPngWithTitle(src, chartW, chartH, titleText, file, useDarkBg, (wrap) => {
      // Darken all chart texts (category labels, ring labels, legend)
      const texts = wrap.querySelectorAll<SVGTextElement>('text')
      texts.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#222'))
      // Make radar point outlines darker on light to improve visibility
      const pts = wrap.querySelectorAll<SVGCircleElement>('g.radar-points circle')
      pts.forEach((c) => c.setAttribute('stroke', useDarkBg ? '#111' : '#333'))
    })
  }

  // Collect available metric bases (intersection across chosen files and categories)
  const paretoMetricBases = useMemo(() => {
    const bases = new Set<string>()
    const b = paretoBaseline ? filesCache[paretoBaseline] : null
    const v = paretoVariant ? filesCache[paretoVariant] : null
    if (!b || !v) return [] as string[]
    const accum: Record<string, number> = {}
    for (const cat of paretoCategories) {
      const mapB = buildMetricMap(cat, b.data?.[cat])
      const mapV = buildMetricMap(cat, v.data?.[cat])
      const basesB = new Set(Object.keys(mapB).map((m) => parseMetricName(m).base))
      const basesV = new Set(Object.keys(mapV).map((m) => parseMetricName(m).base))
      for (const base of basesB) {
        if (basesV.has(base)) accum[base] = (accum[base] || 0) + 1
      }
    }
    for (const [base, count] of Object.entries(accum)) {
      if (count === paretoCategories.length) bases.add(base)
    }
    const out = Array.from(bases)
    out.sort()
    return out
  }, [paretoBaseline, paretoVariant, paretoCategories, filesCache])

  // Collect available k values for selected base (intersection across files and categories)
  const paretoKs = useMemo(() => {
    if (!paretoMetricBase) return [] as number[]
    const b = paretoBaseline ? filesCache[paretoBaseline] : null
    const v = paretoVariant ? filesCache[paretoVariant] : null
    if (!b || !v) return [] as number[]
    const counter: Record<number, number> = {}
    for (const cat of paretoCategories) {
      const mapB = buildMetricMap(cat, b.data?.[cat])
      const mapV = buildMetricMap(cat, v.data?.[cat])
      const ksB = new Set(Object.keys(mapB).map((m) => parseMetricName(m)).filter((x) => x.base === paretoMetricBase && x.k != null).map((x) => x.k as number))
      const ksV = new Set(Object.keys(mapV).map((m) => parseMetricName(m)).filter((x) => x.base === paretoMetricBase && x.k != null).map((x) => x.k as number))
      for (const k of ksB) {
        if (ksV.has(k)) counter[k] = (counter[k] || 0) + 1
      }
    }
    const all = Object.entries(counter).filter(([, c]) => c === paretoCategories.length).map(([k]) => Number(k))
    all.sort((a, b) => a - b)
    return all
  }, [paretoMetricBase, paretoBaseline, paretoVariant, paretoCategories, filesCache])

  useEffect(() => {
    if (!paretoMetricBase && paretoMetricBases.length) setParetoMetricBase(paretoMetricBases[0])
  }, [paretoMetricBases])
  useEffect(() => {
    if (!paretoK && paretoKs.length) setParetoK(paretoKs[0])
  }, [paretoKs])

  // Initialize multi-selects from single selections for convenience
  useEffect(() => {
    if (paretoMetricBasesSel.length === 0 && paretoMetricBase) setParetoMetricBasesSel([paretoMetricBase])
  }, [paretoMetricBase])
  useEffect(() => {
    if (paretoKsSel.length === 0 && paretoK != null) setParetoKsSel([paretoK])
  }, [paretoK])

  // Available k values per selected metric base (intersection across files+categories per base)
  const paretoKsByBase = useMemo(() => {
    const out: Record<string, number[]> = {}
    if (!paretoBaseline || !paretoVariant) return out
    const b = filesCache[paretoBaseline]
    const v = filesCache[paretoVariant]
    if (!b || !v) return out
    for (const base of paretoMetricBasesSel) {
      const counter: Record<number, number> = {}
      for (const cat of paretoCategories) {
        const mapB = buildMetricMap(cat, b.data?.[cat])
        const mapV = buildMetricMap(cat, v.data?.[cat])
        const ksB = new Set(Object.keys(mapB).map((m) => parseMetricName(m)).filter((x) => x.base === base && x.k != null).map((x) => x.k as number))
        const ksV = new Set(Object.keys(mapV).map((m) => parseMetricName(m)).filter((x) => x.base === base && x.k != null).map((x) => x.k as number))
        for (const k of ksB) { if (ksV.has(k)) counter[k] = (counter[k] || 0) + 1 }
      }
      out[base] = Object.entries(counter)
        .filter(([, c]) => c === paretoCategories.length)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b)
    }
    return out
  }, [paretoBaseline, paretoVariant, paretoCategories, paretoMetricBasesSel, filesCache])

  // Keep per-base k selection in sync with available bases/options
  useEffect(() => {
    setParetoMetricKByBase((prev) => {
      const next: Record<string, number[]> = {}
      for (const base of paretoMetricBasesSel) {
        const opts = paretoKsByBase[base] || []
        const prevArr = Array.isArray(prev[base]) ? prev[base] : []
        const kept = prevArr.filter((k) => opts.includes(k))
        next[base] = kept.length > 0 ? kept : (opts.length > 0 ? [opts[0]] : [])
      }
      return next
    })
  }, [paretoMetricBasesSel, paretoKsByBase])

  // Helpers for per-section Pareto UI
  function getParetoKsByBaseFor(bases: string[], cats: string[]): Record<string, number[]> {
    const out: Record<string, number[]> = {}
    if (!paretoBaseline || !paretoVariant) return out
    const b = filesCache[paretoBaseline]
    const v = filesCache[paretoVariant]
    if (!b || !v) return out
    for (const base of bases) {
      const counter: Record<number, number> = {}
      for (const cat of cats) {
        const mapB = buildMetricMap(cat, b.data?.[cat])
        const mapV = buildMetricMap(cat, v.data?.[cat])
        const ksB = new Set(Object.keys(mapB).map((m) => parseMetricName(m)).filter((x) => x.base === base && x.k != null).map((x) => x.k as number))
        const ksV = new Set(Object.keys(mapV).map((m) => parseMetricName(m)).filter((x) => x.base === base && x.k != null).map((x) => x.k as number))
        for (const k of ksB) { if (ksV.has(k)) counter[k] = (counter[k] || 0) + 1 }
      }
      out[base] = Object.entries(counter)
        .filter(([, c]) => c === cats.length)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b)
    }
    return out
  }

  function buildParetoPointsForSection(sec: SavedPareto) {
    if (!paretoBaseline || !paretoVariant) return [] as { category: string; x: number; y: number; color?: string }[]
    const b = filesCache[paretoBaseline]
    const v = filesCache[paretoVariant]
    if (!b || !v) return []
    const bases = (sec.metricBases && sec.metricBases.length > 0) ? sec.metricBases : ((sec.metricBase ? [sec.metricBase] : []) as string[])
    const cats = (sec.categories && sec.categories.length > 0) ? sec.categories : paretoCategories
    const usingPerBase = (sec.metricBases && sec.metricBases.length > 0)
    if (!usingPerBase) {
      const ksUse = (sec.ks && sec.ks.length > 0) ? sec.ks : (sec.k != null ? [sec.k] : [])
      if (bases.length === 0 || ksUse.length === 0) return []
      const baseToColor = new Map<string, string>()
      bases.forEach((base, i) => {
        const hue = Math.round((i * 360) / bases.length)
        const col = `hsl(${hue}, 70%, ${isDark ? 60 : 45}%)`
        baseToColor.set(base, col)
      })
      const pts: { category: string; x: number; y: number; color?: string }[] = []
      for (const cat of cats) {
        const mapB = buildMetricMap(cat, b.data?.[cat])
        const mapV = buildMetricMap(cat, v.data?.[cat])
        for (const base of bases) {
          for (const k of ksUse) {
            let xb: number | null = null
            let yv: number | null = null
            for (const [mk, mv] of Object.entries(mapB)) {
              const parsed = parseMetricName(mk)
              if (parsed.base === base && parsed.k === k) {
                const num = typeof mv === 'number' ? mv : Number(mv)
                if (Number.isFinite(num)) xb = num
              }
            }
            for (const [mk, mv] of Object.entries(mapV)) {
              const parsed = parseMetricName(mk)
              if (parsed.base === base && parsed.k === k) {
                const num = typeof mv === 'number' ? mv : Number(mv)
                if (Number.isFinite(num)) yv = num
              }
            }
            if (xb != null && yv != null) {
              const color = baseToColor.get(base)
              const label = `${cat} • ${base}@${k}`
              pts.push({ category: label, x: xb, y: yv, color })
            }
          }
        }
      }
      return pts
    }
    // Per-base multi-k per base
    if (bases.length === 0) return []
    const baseToColor = new Map<string, string>()
    bases.forEach((base, i) => {
      const hue = Math.round((i * 360) / bases.length)
      const col = `hsl(${hue}, 70%, ${isDark ? 60 : 45}%)`
      baseToColor.set(base, col)
    })
    const pts: { category: string; x: number; y: number; color?: string }[] = []
    for (const cat of cats) {
      const mapB = buildMetricMap(cat, b.data?.[cat])
      const mapV = buildMetricMap(cat, v.data?.[cat])
      for (const base of bases) {
        const ksSel = (sec.metricKByBase && sec.metricKByBase[base]) ? sec.metricKByBase[base] : []
        for (const kSel of ksSel) {
          let xb: number | null = null
          let yv: number | null = null
          for (const [mk, mv] of Object.entries(mapB)) {
            const parsed = parseMetricName(mk)
            if (parsed.base === base && parsed.k === kSel) {
              const num = typeof mv === 'number' ? mv : Number(mv)
              if (Number.isFinite(num)) xb = num
            }
          }
          for (const [mk, mv] of Object.entries(mapV)) {
            const parsed = parseMetricName(mk)
            if (parsed.base === base && parsed.k === kSel) {
              const num = typeof mv === 'number' ? mv : Number(mv)
              if (Number.isFinite(num)) yv = num
            }
          }
          if (xb != null && yv != null) {
            const color = baseToColor.get(base)
            const label = `${cat} • ${base}@${kSel}`
            pts.push({ category: label, x: xb, y: yv, color })
          }
        }
      }
    }
    return pts
  }

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
 
  // colorForIndex/buildChartSeries/sanitizeFilename moved to utils

  function downloadDiagram(idx: number, spec: { key: string; metricBase: string }, series: Series[], chartW: number, chartH: number) {
    const src = diagramSvgRefs.current[idx]
    if (!src) { message.error('Chart not ready to export'); return }
    const titleText = `Showing ${spec.metricBase} across k for data key ${spec.key}`
    const legendItemH = 18
    const legendPadL = 16
    const legendW = 220
    const effectiveH = Math.max(legendItemH * series.length, chartH)
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const file = sanitizeFilename(`${compName}_${spec.key}_${spec.metricBase}.svg`)
    exportSvgWithTitle(src, chartW, effectiveH, titleText, file, isDark, {
      extraRight: legendPadL + legendW,
      postProcessWrap: (wrap) => {
        const NS = 'http://www.w3.org/2000/svg'
        const legendG = document.createElementNS(NS, 'g')
        legendG.setAttribute('transform', `translate(${chartW + legendPadL}, 0)`)
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
        wrap.appendChild(legendG)
      },
    })
  }

  function downloadDiagramPng(
    idx: number,
    spec: { key: string; metricBase: string },
    series: Series[],
    chartW: number,
    chartH: number,
    useDarkBg: boolean,
  ) {
    const src = diagramSvgRefs.current[idx]
    if (!src) { message.error('Chart not ready to export'); return }
    const titleText = `Showing ${spec.metricBase} across k for data key ${spec.key}`
    const legendItemH = 18
    const legendPadL = 16
    const legendW = 220
    const effectiveH = Math.max(legendItemH * series.length, chartH)
    const compName = (activeSuiteId && savedSuites.find((x) => x.id === activeSuiteId)?.name) || 'comparison'
    const file = sanitizeFilename(`${compName}_${spec.key}_${spec.metricBase}.png`)
    exportPngWithTitle(src, chartW, effectiveH, titleText, file, useDarkBg, {
      extraRight: legendPadL + legendW,
      postProcessWrap: (wrap) => {
        // Adjust axis colors to match export theme
        const axisText = wrap.querySelectorAll<SVGTextElement>('.tick text, .axis-label-x, .axis-label-y')
        axisText.forEach((t) => t.setAttribute('fill', useDarkBg ? '#ddd' : '#333'))
        const domainLines = wrap.querySelectorAll<SVGPathElement>('.domain')
        domainLines.forEach((d) => { d.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (d as any).style.opacity = '0.9' })
        const tickLines = wrap.querySelectorAll<SVGLineElement>('.tick line')
        tickLines.forEach((l) => { l.setAttribute('stroke', useDarkBg ? '#ddd' : '#333'); (l as any).style.opacity = '0.35' })

        // Append legend on the right
        const NS = 'http://www.w3.org/2000/svg'
        const legendG = document.createElementNS(NS, 'g')
        legendG.setAttribute('transform', `translate(${chartW + legendPadL}, 0)`)
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
          name.setAttribute('fill', useDarkBg ? '#ddd' : '#333')
          name.textContent = s.name
          legendG.appendChild(name)
        })
        wrap.appendChild(legendG)
      },
    })
  }

  function getTableConfig(key: string, sectionIndex: number) {
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

    // Threshold for near-max highlighting (absolute difference from row max)
    const nearThr = nearMaxThresholds[sectionIndex] ?? 0.05

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
              if (num >= ext.max - nearThr) return <span className="cell-near-max">{numFmt(num)}</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    {totals.selected} selected / {totals.totalFiles} files
                    {manifest?.generatedAt && (
                      <span style={{ marginLeft: 12 }}>manifest: {new Date(manifest.generatedAt).toLocaleString()}</span>
                    )}
                  </span>
                  {/* Hidden directory input */}
                  <input
                    type="file"
                    multiple
                    accept=".json,application/json"
                    ref={(el) => {
                      uploadInputRef.current = el
                      if (el) {
                        el.setAttribute('webkitdirectory', '')
                        el.setAttribute('directory', '')
                        el.setAttribute('mozdirectory', '')
                      }
                    }}
                    onChange={(e) => {
                      handleUploadDir(e.target.files)
                      // reset so the same folder can be chosen again
                      e.currentTarget.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                  <Button size="small" onClick={() => uploadInputRef.current?.click()}>
                    Upload folder…
                  </Button>
                </div>
              </div>
            }
          >
            {loading && <div>Loading manifest…</div>}
            {error && (
              <div style={{ color: 'crimson' }}>
                Failed to load manifest: {error}. Make sure your JSON folders are under `public/results/` and run `npm run gen:manifest`.
              </div>
            )}

            {!loading && !error && (allFolders.length === 0) && (
              <div style={{ color: '#555' }}>
                No folders found. You can either add date folders with JSON files under <code>public/results/</code> and rerun <code>npm run gen:manifest</code>,
                or use the <em>Upload folder…</em> button to import benchmark results from your disk.
              </div>
            )}

            {!loading && !error && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {allFolders.map((folder) => (
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

      {/* Pareto integrated into Tabs below */}

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

        {/* Tabs: Tables, Diagrams and Pareto */}
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
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ color: isDark ? '#aaa' : '#666' }}>Near-max:</span>
                                    <Tooltip title="Highlight values within this absolute distance from the row max">
                                      <InputNumber
                                        size="small"
                                        min={0}
                                        step={0.01}
                                        value={nearMaxThresholds[idx] ?? 0.05}
                                        onChange={(val) =>
                                          setNearMaxThresholds((prev) => ({
                                            ...prev,
                                            [idx]: typeof val === 'number' && !Number.isNaN(val) ? val : 0.05,
                                          }))
                                        }
                                        style={{ width: 90 }}
                                      />
                                    </Tooltip>
                                  </span>
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
                        const series = spec.key && spec.metricBase ? buildChartSeries(selected, filesCache, spec.key, spec.metricBase, isDark) : []
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
                                options={metricBases.map((b: string) => {
                                  const desc = getMetricDescription(b)
                                  return {
                                    label: (
                                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        {b.toUpperCase()}
                                        {desc && (
                                          <Tooltip title={desc}>
                                            <InfoCircleOutlined style={{ marginLeft: 6, color: isDark ? '#bbb' : '#999' }} />
                                          </Tooltip>
                                        )}
                                      </span>
                                    ),
                                    value: b,
                                  }
                                })}
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
                                <div onClick={() => setPreviewDiagram({ key: spec.key!, metricBase: spec.metricBase! })}>
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
            {
              key: 'pareto',
              label: <span style={{ color: isDark ? '#fff' : '#000' }}>Pareto</span>,
              children: (
                <ParetoTab
                  isDark={isDark}
                  selectedValidFiles={selectedValidFiles}
                  commonDataKeys={commonDataKeys}
                  paretoBaseline={paretoBaseline}
                  setParetoBaseline={setParetoBaseline}
                  paretoVariant={paretoVariant}
                  setParetoVariant={setParetoVariant}
                  paretoCategories={paretoCategories}
                  setParetoCategories={setParetoCategories}
                  paretoSections={paretoSections}
                  setParetoSections={setParetoSections}
                  paretoMetricBases={paretoMetricBases}
                  paretoKs={paretoKs}
                  getParetoKsByBaseFor={getParetoKsByBaseFor}
                  buildParetoPointsForSection={buildParetoPointsForSection}
                  downloadParetoPngAt={downloadParetoPngAt}
                  downloadParetoSvgAt={downloadParetoSvgAt}
                  setParetoSvgRef={setParetoSvgRef}
                  getMetricDescription={getMetricDescription}
                />
              ),
            },
            {
              key: 'radar',
              label: <span style={{ color: isDark ? '#fff' : '#000' }}>Radar</span>,
              children: (
                <div className={`radar-pane ${isDark ? 'dark' : 'light'}`}>
                  <Divider orientation="left">Radar Comparison</Divider>
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <div>
                      <div className="form-label" style={{ marginBottom: 4 }}>Default categories</div>
                      <Select
                        mode="multiple"
                        style={{ minWidth: 360 }}
                        placeholder="Select categories (data keys)"
                        value={radarCategories}
                        onChange={(vals) => setRadarCategories(vals)}
                        options={commonDataKeys.map((k) => ({ label: k, value: k }))}
                        getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {radarSections.map((sec, idx) => {
                        const catsForSec = radarCategories
                        const bases = getRadarMetricBasesFor(selectedRadarFiles, catsForSec)
                        const ks = getRadarKsFor(selectedRadarFiles, catsForSec, sec.metricBase)
                        const series = buildRadarSeriesFor(selectedRadarFiles, catsForSec, sec.metricBase, sec.k, isDark)
                        const isPlaceholder = (!sec.metricBase || sec.k == null)
                        return (
                          <div key={`radar-sec-${idx}`} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 12, color: isDark ? '#fff' : '#000' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ fontWeight: 500 }}>Radar section {idx + 1}</div>
                              <Space>
                                {(!isPlaceholder || radarSections.length > 1) && (
                                  <Popconfirm title="Remove this section?" onConfirm={() => {
                                    setRadarSections((prev) => {
                                      const next = prev.filter((_, i) => i !== idx)
                                      return next.length > 0 ? next : [{ categories: [], metricBase: null, k: null }]
                                    })
                                  }}>
                                    <Button size="small" danger>Remove</Button>
                                  </Popconfirm>
                                )}
                                {sec.metricBase && sec.k != null && series.length > 0 && (
                                  <Dropdown
                                    menu={{
                                      items: [
                                        { key: 'png-light', label: 'PNG (Light bg)' },
                                        { key: 'png-dark', label: 'PNG (Dark bg)' },
                                        { key: 'svg', label: 'SVG' },
                                      ],
                                      onClick: ({ key }) => {
                                        const enriched = {
                                          categories: catsForSec,
                                          metricBase: sec.metricBase,
                                          k: sec.k,
                                        }
                                        if (key === 'png-light') downloadRadarPngAt(idx, enriched, false)
                                        else if (key === 'png-dark') downloadRadarPngAt(idx, enriched, true)
                                        else if (key === 'svg') downloadRadarSvgAt(idx, enriched, isDark)
                                      },
                                    }}
                                  >
                                    <Button size="small" icon={<DownloadOutlined />}>Download</Button>
                                  </Dropdown>
                                )}
                              </Space>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                              <Select
                                style={{ width: 160 }}
                                placeholder="Metric"
                                value={sec.metricBase ?? undefined}
                                onChange={(v) => {
                                  setRadarSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { ...next[idx], metricBase: v as string, k: null }
                                    if (idx === prev.length - 1) next.push({ categories: [], metricBase: null, k: null })
                                    return next
                                  })
                                }}
                                options={bases.map((b) => {
                                  const desc = getMetricDescription(b)
                                  return {
                                    label: (
                                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        {b.toUpperCase()}
                                        {desc && (
                                          <Tooltip title={desc}>
                                            <InfoCircleOutlined style={{ marginLeft: 6, color: isDark ? '#bbb' : '#999' }} />
                                          </Tooltip>
                                        )}
                                      </span>
                                    ),
                                    value: b,
                                  }
                                })}
                                getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                              />
                              <Select
                                style={{ width: 120 }}
                                placeholder="k"
                                value={sec.k ?? undefined}
                                onChange={(v) => {
                                  setRadarSections((prev) => {
                                    const next = [...prev]
                                    next[idx] = { ...next[idx], k: Number(v) }
                                    if (idx === prev.length - 1) next.push({ categories: [], metricBase: null, k: null })
                                    return next
                                  })
                                }}
                                options={ks.map((k) => ({ label: String(k), value: k }))}
                                getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                                disabled={!sec.metricBase}
                              />
                            </div>
                            {sec.metricBase && sec.k != null && series.length === 0 && (
                              <div style={{ color: isDark ? '#aaa' : '#888' }}>No data for {sec.metricBase.toUpperCase()}@{sec.k} across selected categories.</div>
                            )}
                            {sec.metricBase && sec.k != null && series.length > 0 && (
                              <div style={{ alignSelf: 'center' }}>
                                <RadarChart
                                  categories={catsForSec}
                                  series={series}
                                  width={900}
                                  height={520}
                                  isDark={isDark}
                                  exportRef={(el: SVGSVGElement | null) => { radarSvgRefs.current[idx] = el }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </section>
      <Modal
        open={!!previewDiagram}
        onCancel={() => { setPreviewDiagram(null); setPreviewHighlight(null) }}
        footer={null}
        width={1200}
        bodyStyle={{ maxHeight: '80vh', overflow: 'auto' }}
        title={previewDiagram ? <ChartInfo k={previewDiagram.key} metricBase={previewDiagram.metricBase} /> : 'Diagram Preview'}
      >
        {previewDiagram ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <LineChart
                series={previewSeries}
                width={900}
                height={520}
                isDark={isDark}
                highlightedSeries={previewHighlight}
                xLabel="k"
                yLabel={previewDiagram.metricBase || 'value'}
                labelColor={isDark ? '#e6e6e6' : '#111'}
              />
            </div>
            <div style={{ minWidth: 280 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {previewSeries.map((item) => (
                  <li
                    key={`preview-legend-${item.name}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                    onMouseEnter={() => setPreviewHighlight(item.name)}
                    onMouseLeave={() => setPreviewHighlight(null)}
                  >
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: item.color }} />
                    <Tooltip
                      title={
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                          <div>
                            {item.points.map((p) => (
                              <div key={`tt-${item.name}-${p.k}`}>k={p.k}, {previewDiagram.metricBase}: {Number(p.value).toFixed(5)}</div>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <span style={{ display: 'inline-block', whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.name}</span>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>
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
              <li>Per-table near-max thresholds</li>
              <li>Diagram sections (data key + metric)</li>
              <li>Pareto sections (metrics, k selections, display options)</li>
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
