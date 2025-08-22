import { Divider, Space, Select, Popconfirm, Dropdown, Button, Tooltip, Tag, Switch, Segmented } from 'antd'
import { InfoCircleOutlined, DownloadOutlined } from '@ant-design/icons'
import ParetoChart from './ParetoChart'
import type { LoadedFile, SavedPareto } from '../types'

export type ParetoPoint = { category: string; x: number; y: number; color?: string }

type ParetoTabProps = {
  // theme
  isDark: boolean
  // global availability
  selectedValidFiles: LoadedFile[]
  commonDataKeys: string[]
  // global selections
  paretoBaseline: string | null
  setParetoBaseline: (v: string) => void
  paretoVariant: string | null
  setParetoVariant: (v: string) => void
  paretoCategories: string[]
  setParetoCategories: (vals: string[]) => void
  // sections
  paretoSections: SavedPareto[]
  setParetoSections: (updater: (prev: SavedPareto[]) => SavedPareto[]) => void
  // derived options
  paretoMetricBases: string[]
  paretoKs: number[]
  getParetoKsByBaseFor: (bases: string[], cats: string[]) => Record<string, number[]>
  // helpers
  buildParetoPointsForSection: (sec: SavedPareto) => ParetoPoint[]
  downloadParetoPngAt: (idx: number, sec: SavedPareto, useDarkBg: boolean) => void
  downloadParetoSvgAt: (idx: number, sec: SavedPareto) => void
  setParetoSvgRef: (idx: number, el: SVGSVGElement | null) => void
  getMetricDescription: (metricOrBase: string) => string | undefined | null
}

export default function ParetoTab(props: ParetoTabProps) {
  const {
    isDark,
    selectedValidFiles,
    commonDataKeys,
    paretoBaseline,
    setParetoBaseline,
    paretoVariant,
    setParetoVariant,
    paretoCategories,
    setParetoCategories,
    paretoSections,
    setParetoSections,
    paretoMetricBases,
    paretoKs,
    getParetoKsByBaseFor,
    buildParetoPointsForSection,
    downloadParetoPngAt,
    downloadParetoSvgAt,
    setParetoSvgRef,
    getMetricDescription,
  } = props

  return (
    <div className={`pareto-pane ${isDark ? 'dark' : 'light'}`}>
      <Divider orientation="left">Pareto Frontier Comparison</Divider>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {/* Global selectors: shared across sections */}
        <Space wrap>
          <div>
            <div className="form-label" style={{ marginBottom: 4 }}>Baseline method</div>
            <Select
              style={{ width: 280 }}
              placeholder="Select baseline"
              value={paretoBaseline ?? undefined}
              onChange={(v) => setParetoBaseline(v)}
              options={selectedValidFiles.map((f) => ({ label: f.name || f.path, value: f.path }))}
              getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
            />
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 4 }}>Variant method</div>
            <Select
              style={{ width: 280 }}
              placeholder="Select variant"
              value={paretoVariant ?? undefined}
              onChange={(v) => setParetoVariant(v)}
              options={selectedValidFiles.map((f) => ({ label: f.name || f.path, value: f.path }))}
              getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
            />
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 4 }}>Categories</div>
            <Select
              mode="multiple"
              style={{ minWidth: 360 }}
              placeholder="Select categories (data keys)"
              value={paretoCategories}
              onChange={(vals) => setParetoCategories(vals)}
              options={commonDataKeys.map((k) => ({ label: k, value: k }))}
              getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
            />
          </div>
        </Space>
        {/* Sections: each has metrics + k + display + chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {paretoSections.map((sec, idx) => {
            const catsForSec = (sec.categories && sec.categories.length > 0) ? sec.categories : paretoCategories
            const ksByBase = getParetoKsByBaseFor(sec.metricBases && sec.metricBases.length ? sec.metricBases : [], catsForSec)
            const points = buildParetoPointsForSection(sec)
            const singleBase = sec.metricBases && sec.metricBases.length === 1 ? sec.metricBases[0] : (sec.metricBase || null)
            const singleKs = singleBase ? (sec.metricKByBase?.[singleBase] || (sec.ks && sec.ks.length ? sec.ks : (sec.k != null ? [sec.k] : []))) : []
            const showXLabel = singleBase && singleKs.length === 1 ? `${singleBase}@${singleKs[0]} (baseline)` : 'baseline'
            const showYLabel = singleBase && singleKs.length === 1 ? `${singleBase}@${singleKs[0]} (variant)` : 'variant'
            const isPlaceholder = (!sec.metricBases || sec.metricBases.length === 0) && !sec.metricBase
            return (
              <div key={`pareto-sec-${idx}`} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 12, color: isDark ? '#fff' : '#000' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 500 }}>Pareto section {idx + 1}</div>
                  <Space>
                    {/* Delete section (except keep at least one placeholder) */}
                    {(!isPlaceholder || paretoSections.length > 1) && (
                      <Popconfirm title="Remove this section?" onConfirm={() => {
                        setParetoSections((prev) => {
                          const next = prev.filter((_, i) => i !== idx)
                          return next.length > 0 ? next : [{ baseline: null, variant: null, categories: paretoCategories, metricBases: [], ks: [], metricKByBase: {}, showFrontier: true, showDiagonal: true, maximize: 'none', maximizeX: false, maximizeY: false }]
                        })
                      }}>
                        <Button size="small" danger>Remove</Button>
                      </Popconfirm>
                    )}
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'png-light', label: 'PNG (Light bg)' },
                          { key: 'png-dark', label: 'PNG (Dark bg)' },
                          { key: 'svg', label: 'SVG' },
                        ],
                        onClick: ({ key }) => {
                          const enriched: SavedPareto = {
                            ...sec,
                            baseline: paretoBaseline,
                            variant: paretoVariant,
                            categories: (sec.categories && sec.categories.length > 0) ? sec.categories : paretoCategories,
                            maximizeX: sec.maximize === 'x' || sec.maximizeX,
                            maximizeY: sec.maximize === 'y' || sec.maximizeY,
                          }
                          if (key === 'png-light') downloadParetoPngAt(idx, enriched, false)
                          else if (key === 'png-dark') downloadParetoPngAt(idx, enriched, true)
                          else if (key === 'svg') downloadParetoSvgAt(idx, enriched)
                        },
                      }}
                    >
                      <Button size="small" icon={<DownloadOutlined />}>Download</Button>
                    </Dropdown>
                  </Space>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div className="form-label" style={{ marginBottom: 4 }}>Categories (section)</div>
                    <Select
                      mode="multiple"
                      style={{ minWidth: 260 }}
                      placeholder="Select categories"
                      value={(sec.categories && sec.categories.length > 0) ? sec.categories : paretoCategories}
                      onChange={(vals) => {
                        setParetoSections((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], categories: vals as string[] }
                          if (idx === prev.length - 1 && isPlaceholder) {
                            next.push({ baseline: null, variant: null, categories: paretoCategories, metricBases: [], ks: [], metricKByBase: {}, showFrontier: true, showDiagonal: true, maximize: 'none', maximizeX: false, maximizeY: false })
                          }
                          return next
                        })
                      }}
                      options={commonDataKeys.map((k) => ({ label: k, value: k }))}
                      getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                    />
                  </div>
                  <div>
                    <div className="form-label" style={{ marginBottom: 4 }}>Metric base(s)</div>
                    <Select
                      mode="multiple"
                      style={{ minWidth: 260 }}
                      placeholder="Metric base(s)"
                      value={sec.metricBases ?? []}
                      onChange={(vals) => {
                        setParetoSections((prev) => {
                          const next = [...prev]
                          const updated: SavedPareto = {
                            ...next[idx],
                            baseline: paretoBaseline,
                            variant: paretoVariant,
                            // keep section-specific categories unchanged
                            metricBases: vals as string[],
                            metricBase: null,
                          }
                          next[idx] = updated
                          // auto-add placeholder at end
                          if (idx === prev.length - 1) {
                            next.push({ baseline: null, variant: null, categories: paretoCategories, metricBases: [], ks: [], metricKByBase: {}, showFrontier: true, showDiagonal: true, maximize: 'none', maximizeX: false, maximizeY: false })
                          }
                          return next
                        })
                      }}
                      options={paretoMetricBases.map((b) => {
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
                  </div>
                  {sec.metricBases && sec.metricBases.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {sec.metricBases.map((base) => {
                        const desc = getMetricDescription(base)
                        const selectedKs = sec.metricKByBase?.[base] ?? []
                        const options = (ksByBase[base] || []).map((k) => ({ label: String(k), value: k }))
                        return (
                          <div key={`${idx}-${base}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tag color={isDark ? '#555' : '#ddd'} style={{ color: isDark ? '#fff' : '#333' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {base}
                                {desc && (
                                  <Tooltip title={desc}>
                                    <InfoCircleOutlined style={{ marginLeft: 6, color: isDark ? '#bbb' : '#999' }} />
                                  </Tooltip>
                                )}
                              </span>
                            </Tag>
                            <Select
                              mode="multiple"
                              size="small"
                              style={{ width: 140 }}
                              value={selectedKs}
                              onChange={(vals) => {
                                setParetoSections((prev) => {
                                  const next = [...prev]
                                  const mkb = { ...(next[idx].metricKByBase || {}) }
                                  mkb[base] = vals as number[]
                                  next[idx] = { ...next[idx], metricKByBase: mkb }
                                  return next
                                })
                              }}
                              options={options}
                              placeholder="k(s)"
                              getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Legacy single selectors if no bases chosen */}
                  {(!sec.metricBases || sec.metricBases.length === 0) && (
                    <>
                      <Select
                        style={{ width: 160 }}
                        placeholder="Metric"
                        value={sec.metricBase ?? undefined}
                        onChange={(v) => {
                          setParetoSections((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], baseline: paretoBaseline, variant: paretoVariant, metricBase: v as string }
                            if (idx === prev.length - 1) next.push({ baseline: null, variant: null, categories: paretoCategories, metricBases: [], ks: [], metricKByBase: {}, showFrontier: true, showDiagonal: true, maximize: 'none', maximizeX: false, maximizeY: false })
                            return next
                          })
                        }}
                        options={paretoMetricBases.map((b) => ({ label: b.toUpperCase(), value: b }))}
                        getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                      />
                      <Select
                        style={{ width: 120 }}
                        placeholder="k"
                        value={(sec.ks && sec.ks[0]) ?? (sec.k ?? undefined)}
                        onChange={(v) => {
                          setParetoSections((prev) => {
                            const next = [...prev]
                            const kVal = Number(v)
                            const hasKs = Array.isArray(next[idx].ks) && next[idx].ks!.length > 0
                            next[idx] = hasKs ? { ...next[idx], ks: [kVal] } : { ...next[idx], k: kVal }
                            if (idx === prev.length - 1) next.push({ baseline: null, variant: null, categories: paretoCategories, metricBases: [], ks: [], metricKByBase: {}, showFrontier: true, showDiagonal: true, maximize: 'none', maximizeX: false, maximizeY: false })
                            return next
                          })
                        }}
                        options={(sec.metricBase ? (getParetoKsByBaseFor([sec.metricBase], (sec.categories && sec.categories.length > 0) ? sec.categories : paretoCategories)[sec.metricBase] || []) : paretoKs).map((k) => ({ label: String(k), value: k }))}
                        getPopupContainer={(t) => (t.parentElement as HTMLElement) || t}
                      />
                    </>
                  )}
                  <div style={{ marginLeft: 'auto' }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Display</div>
                    <Space>
                      <span className="form-inline-label">Frontier</span>
                      <Switch checked={!!sec.showFrontier} onChange={(val) => setParetoSections((prev) => { const next = [...prev]; next[idx] = { ...next[idx], showFrontier: val }; return next })} />
                      <span className="form-inline-label">Diagonal</span>
                      <Switch checked={!!sec.showDiagonal} onChange={(val) => setParetoSections((prev) => { const next = [...prev]; next[idx] = { ...next[idx], showDiagonal: val }; return next })} />
                      <span className="form-inline-label">Maximize</span>
                      <Segmented
                        size="small"
                        options={[
                          { label: (<span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#2ca02c', marginRight: 6 }} />Y</span>), value: 'y' },
                          { label: (<span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#8a8a8a', marginRight: 6 }} />None</span>), value: 'none' },
                          { label: (<span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#d67c00', marginRight: 6 }} />X</span>), value: 'x' },
                        ]}
                        value={sec.maximize ?? 'none'}
                        onChange={(v) => setParetoSections((prev) => { const next = [...prev]; next[idx] = { ...next[idx], maximize: v as 'y' | 'none' | 'x', maximizeX: v === 'x', maximizeY: v === 'y' }; return next })}
                        className={`tri tri-${sec.maximize ?? 'none'}`}
                      />
                    </Space>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ color: isDark ? '#aaa' : '#666', maxWidth: 900, fontSize: 12, alignSelf: 'center', textAlign: 'center' }}>
                    Compare categories by plotting baseline (X) vs variant (Y) for the selected metric and k. Points above the diagonal favor the variant.
                  </div>
                  <div style={{ alignSelf: 'center' }}>
                    <ParetoChart
                      points={points}
                      width={900}
                      height={520}
                      isDark={isDark}
                      xLabel={showXLabel}
                      yLabel={showYLabel}
                      showFrontier={!!sec.showFrontier}
                      showDiagonal={!!sec.showDiagonal}
                      maximizeX={!!sec.maximizeX || sec.maximize === 'x'}
                      maximizeY={!!sec.maximizeY || sec.maximize === 'y'}
                      exportRef={(el: SVGSVGElement | null) => { setParetoSvgRef(idx, el) }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Space>
    </div>
  )
}
