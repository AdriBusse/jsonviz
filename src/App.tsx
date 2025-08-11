import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Select, Spin, Table, Typography, Divider, FloatButton, Modal, Input, Space, Tag, Button, Checkbox, Popconfirm, message, Tooltip } from 'antd'
import { UpOutlined, InfoCircleOutlined } from '@ant-design/icons'
import './App.css'

type Manifest = {
  root: string
  generatedAt: string
  folders: { name: string; files: { name: string; path: string }[] }[]
}

type LoadedFile = {
  path: string
  name: string
  data: any
  valid: boolean
  error?: string
}

type SavedFilter = {
  id: string
  name: string
  rows: string[]
}

type SavedSuite = {
  id: string
  name: string
  createdAt: string
  selected: string[]
  dataKeySections: string[]
  sectionFilters: Record<number, string | null>
  sectionRows: Record<number, string[]>
}

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
  // Per-section applied filter ID (single) and explicit selected rows
  const [sectionFilters, setSectionFilters] = useState<Record<number, string | null>>({})
  const [sectionRows, setSectionRows] = useState<Record<number, string[]>>({})
  // UI state for filter manager
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingRows, setEditingRows] = useState<string[]>([])
  const [filterSearch, setFilterSearch] = useState('')

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
    return {
      id: Math.random().toString(36).slice(2, 9),
      name,
      createdAt: new Date().toISOString(),
      selected: Array.from(selected),
      dataKeySections: keys,
      sectionFilters: compactFilters,
      sectionRows: compactRows,
    }
  }

  function loadSuite(suite: SavedSuite) {
    setSelected(new Set(suite.selected))
    // Defer applying keys until we know commonDataKeys include them
    pendingSuiteKeysRef.current = suite.dataKeySections ?? []
    setSectionFilters(suite.sectionFilters ?? {})
    setSectionRows(suite.sectionRows ?? {})
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

  // Metric tooltip helpers
  const METRIC_DESCRIPTIONS: Record<string, string> = {
    // User-provided texts
    accuracy: 'Accuracy – The proportion of retrieved documents that are both relevant and correctly identified out of all evaluated cases; in IR, often less informative when relevance is sparse.',
    map: 'MAP (Mean Average Precision) – The mean of the average precision scores across all queries, rewarding systems that return relevant documents early and consistently.',
    mrr: 'MRR (Mean Reciprocal Rank) – The average of the reciprocal ranks of the first relevant document for each query, focusing on how soon the first correct result appears.',
    ndcg: 'nDCG (Normalized Discounted Cumulative Gain) – A graded-relevance metric that rewards placing highly relevant documents near the top, normalized so that 1.0 is the ideal ranking.',
    precision: 'Precision (P) – The fraction of retrieved documents that are relevant; measures result quality.',
    recall: 'Recall – The fraction of all relevant documents that were successfully retrieved; measures completeness.',
    r_cap: 'R_cap (Recall Capped) – Recall computed only over all labels data. Less relevant since our pools are small.',
    hole: 'Hole – The proportion or count of unlabeled data during the benchmark.',
    f1: 'F1 score – The harmonic mean of precision and recall, balancing the two equally.',
    f2: 'F2 score – Like F1, but weights recall twice as heavily as precision.',

    // Retain other helpful defaults
    dcg: 'DCG@k: discounted cumulative gain over the top-k ranked items (unnormalized).',
    ap: 'AP@k: average precision for a single query up to rank k.',
    rr: 'Reciprocal Rank@k: reciprocal of the rank of the first relevant item (per query).',
    hitrate: 'Hit Rate@k (HR@k): whether at least one relevant item appears in the top-k (averaged over queries).',
    hr: 'Hit Rate@k (HR@k): whether at least one relevant item appears in the top-k (averaged over queries).',
    rprecision: 'R-Precision: precision at R where R is the number of relevant items for the query.',
    r_precision: 'R-Precision: precision at R where R is the number of relevant items for the query.',
  }

  function metricBase(name: string): string {
    const base = String(name).split('@')[0]?.trim().toLowerCase()
    // unify some synonyms
    if (base === 'r-precision') return 'rprecision'
    if (base === 'p') return 'precision'
    if (base === 'r-cap' || base === 'rcap') return 'r_cap'
    if (base === 'f-1' || base === 'f_1') return 'f1'
    if (base === 'f-2' || base === 'f_2') return 'f2'
    if (base === 'n_dcg') return 'ndcg'
    if (base === 'm_ap' || base === 'm-ap' || base === 'mean_average_precision') return 'map'
    if (base === 'average_precision') return 'ap'
    return base
  }

  function getMetricDescription(name: string): string | undefined {
    const base = metricBase(name)
    const known = METRIC_DESCRIPTIONS[base]
    if (known) return known
    // Generic fallback for any Metric@k style
    if (String(name).includes('@')) {
      const pretty = base.toUpperCase()
      return `${pretty}@k: metric evaluated at cutoff k.`
    }
    return undefined
  }

  // Flatten helper: build metric map for a given value
  function buildMetricMap(rootKey: string, value: any): Record<string, any> {
    const out: Record<string, any> = {}
    if (Array.isArray(value)) {
      // Merge array of objects into a single flat metric map
      value.forEach((item, i) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            out[k] = v as any
          }
        } else {
          // Fallback: keep index when array items are primitives or arrays
          out[`${rootKey}[${i}]`] = item
        }
      })
      // If we only had objects, 'out' now holds metric keys like 'NDCG@1'
      // If we encountered primitives, they are preserved with indexed keys above
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out[k] = v as any
      }
    } else {
      out[rootKey] = value
    }
    return out
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

    const numFmt = (v: any) => (typeof v === 'number' ? Number(v.toFixed(5)) : v)

    const columns: any[] = [
      { title: 'Metric', dataIndex: 'metric', key: 'metric', fixed: 'left', width: 280, render: (m: string) => {
        const desc = getMetricDescription(m)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <code>{m}</code>
            {desc && (
              <Tooltip title={desc}>
                <InfoCircleOutlined style={{ marginLeft: 6, color: '#999' }} />
              </Tooltip>
            )}
          </span>
        )
      } },
      ...sel.map((p) => {
        const f = filesCache[p]
        const titleName = f?.name || p.split('/').pop()
        return {
          title: titleName,
          dataIndex: p,
          key: p,
          render: (v: any) => {
            if (!f) return <Spin size="small" />
            if (!f.valid) return <span style={{ color: '#999' }}>invalid</span>
            return v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : numFmt(v)
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
      <section>
        <div ref={selectionRef} id="selection-anchor" />
        <h1 style={{ marginBottom: 8 }}>JSON Visualizer — File Selection</h1>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          <span>
            {totals.selected} selected / {totals.totalFiles} files
          </span>
          {manifest?.generatedAt && (
            <span style={{ marginLeft: 12 }}>manifest: {new Date(manifest.generatedAt).toLocaleString()}</span>
          )}
        </div>

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
                    <strong>{folder.name}</strong>
                  </div>
                  <small style={{ color: '#666' }}>{folder.files.length} files</small>
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
                        <code title={file.path} style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      </section>

      <section>
        <h2 style={{ marginBottom: 8 }}>Preview & Compare</h2>
        {filesError && <Alert type="error" message={`Failed loading files: ${filesError}`} showIcon style={{ marginBottom: 12 }} />}
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

        {/* Save/Load Comparison Suites */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Button
            type="primary"
            onClick={() => {
              const defaultName = `Suite ${new Date().toLocaleString()}`
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

        {/* Sections: each has a selector and, if chosen, a table under it. */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {dataKeySections.map((key, idx) => {
              const isPlaceholder = key == null
              return (
                <div key={`section-${idx}`} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ color: '#666', minWidth: 90 }}>{isPlaceholder ? 'New data key:' : 'Data key:'}</span>
                    <Select
                      style={{ minWidth: 260 }}
                      placeholder={commonDataKeys.length ? 'Select data key' : 'No common data keys'}
                      options={commonDataKeys.map((k) => ({ label: k, value: k }))}
                      value={key ?? undefined}
                      onChange={(val) => {
                        setDataKeySections((prev) => {
                          const next = [...prev]
                          next[idx] = val
                          // If this was the last placeholder, append a new one
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
                        size="small"
                        sticky
                        title={() => (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                              style={{ fontSize: 12 }}
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
        onCancel={() => setSaveModalOpen(false)}
        onOk={() => {
          const name = saveName.trim()
          if (!name) { message.error('Please provide a name'); return }
          const suite = buildSuiteFromCurrent(name)
          setSavedSuites((prev) => [...prev, suite])
          setSaveModalOpen(false)
          message.success(`Saved "${name}"`)
        }}
        okText="Save"
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
