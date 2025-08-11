export const METRIC_DESCRIPTIONS: Record<string, string> = {
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
  dcg: 'DCG@k: discounted cumulative gain over the top-k ranked items (unnormalized).',
  ap: 'AP@k: average precision for a single query up to rank k.',
  rr: 'Reciprocal Rank@k: reciprocal of the rank of the first relevant item (per query).',
  hitrate: 'Hit Rate@k (HR@k): whether at least one relevant item appears in the top-k (averaged over queries).',
  hr: 'Hit Rate@k (HR@k): whether at least one relevant item appears in the top-k (averaged over queries).',
  rprecision: 'R-Precision: precision at R where R is the number of relevant items for the query.',
  r_precision: 'R-Precision: precision at R where R is the number of relevant items for the query.',
}

export function metricBase(name: string): string {
  const base = String(name).split('@')[0]?.trim().toLowerCase()
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

export function getMetricDescription(name: string): string | undefined {
  const base = metricBase(name)
  const known = METRIC_DESCRIPTIONS[base]
  if (known) return known
  if (String(name).includes('@')) {
    const pretty = base.toUpperCase()
    return `${pretty}@k: metric evaluated at cutoff k.`
  }
  return undefined
}

export function parseMetricName(name: string): { base: string; k: number | null } {
  const raw = String(name)
  const [basePart, kPart] = raw.split('@')
  const base = metricBase(basePart || '')
  const k = kPart != null ? parseInt(kPart, 10) : NaN
  return { base, k: Number.isFinite(k) ? k : null }
}

export function buildMetricMap(rootKey: string, value: any): Record<string, any> {
  const out: Record<string, any> = {}
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const [k, v] of Object.entries(item)) {
          out[k] = v as any
        }
      } else {
        out[`${rootKey}[${i}]`] = item
      }
    })
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out[k] = v as any
    }
  } else {
    out[rootKey] = value
  }
  return out
}
