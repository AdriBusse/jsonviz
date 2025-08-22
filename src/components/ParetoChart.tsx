import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export type ParetoPoint = {
  category: string
  x: number
  y: number
  color?: string
}

type Props = {
  points: ParetoPoint[]
  width?: number
  height?: number
  isDark?: boolean
  xLabel?: string
  yLabel?: string
  showFrontier?: boolean
  showDiagonal?: boolean
  maximizeX?: boolean
  maximizeY?: boolean
  // Absolute tolerance to consider near-ties as included on the favored side
  nearTieThreshold?: number
  exportRef?: (el: SVGSVGElement | null) => void
}

export default function ParetoChart({
  points,
  width = 860,
  height = 520,
  isDark = false,
  xLabel,
  yLabel,
  showFrontier = true,
  showDiagonal = true,
  maximizeX = true,
  maximizeY = true,
  nearTieThreshold = 0,
  exportRef,
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const thr = Math.max(0, Number.isFinite(nearTieThreshold) ? nearTieThreshold : 0)
    const svg = d3.select(ref.current).style('color', isDark ? '#fff' : '#000')
    svg.selectAll('*').remove()
    const margin = { top: 16, right: 24, bottom: 44, left: 60 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    if (!points || points.length === 0) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', isDark ? '#aaa' : '#888')
        .text('No data')
      return
    }

    // Data-driven axes domains aligning to displayed values
    let xMin = d3.min(points, (d) => d.x) ?? 0
    let xMax = d3.max(points, (d) => d.x) ?? 1
    if (xMin === xMax) {
      const delta = xMin === 0 ? 1 : Math.abs(xMin) * 0.1
      xMin -= delta
      xMax += delta
    }
    let yMin = d3.min(points, (d) => d.y) ?? 0
    let yMax = d3.max(points, (d) => d.y) ?? 1
    if (yMin === yMax) {
      const delta = yMin === 0 ? 1 : Math.abs(yMin) * 0.1
      yMin -= delta
      yMax += delta
    }
    const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]).nice()
    const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]).nice()

    const xAxis = d3.axisBottom(x).ticks(6)
    const yAxis = d3.axisLeft(y).ticks(6)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis as any)
    g.append('g').call(yAxis as any)

    const axisTextColor = isDark ? '#e6e6e6' : '#333'
    const axisStrokeColor = isDark ? '#b5b5b5' : '#444'
    g.selectAll('.tick text').attr('fill', axisTextColor)
    g.selectAll('.domain').attr('stroke', axisStrokeColor).attr('stroke-width', 1).style('opacity', 0.9)
    g.selectAll('.tick line').attr('stroke', axisStrokeColor).attr('stroke-width', 0.75).style('opacity', 0.35)

    if (xLabel) {
      g.append('text')
        .attr('class', 'axis-label-x')
        .attr('x', innerW / 2)
        .attr('y', innerH + 36)
        .attr('text-anchor', 'middle')
        .attr('fill', axisTextColor)
        .style('opacity', 0.85)
        .style('font-size', '12px')
        .text(xLabel)
    }
    if (yLabel) {
      g.append('text')
        .attr('class', 'axis-label-y')
        .attr('transform', `rotate(-90) translate(${-innerH / 2}, -46)`) 
        .attr('text-anchor', 'middle')
        .attr('fill', axisTextColor)
        .style('opacity', 0.85)
        .style('font-size', '12px')
        .text(yLabel)
    }

    if (showDiagonal) {
      const minX = x.domain()[0]
      const maxX = x.domain()[1]
      const minY = y.domain()[0]
      const maxY = y.domain()[1]
      const min = Math.max(Math.min(minX, maxY), Math.min(minY, maxX))
      const max = Math.min(Math.max(maxX, minY), Math.max(maxY, minX))
      const line = d3.line<number>()
        .x((d) => x(d))
        .y((d) => y(d))
      const diagColor = maximizeY ? '#2ca02c' : (maximizeX ? '#d67c00' : '#8a8a8a')
      g
        .append('path')
        .datum([min, max])
        .attr('fill', 'none')
        .attr('stroke', diagColor)
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1.5)
        .attr('d', line as any)
        .style('pointer-events', 'none')

      // Invisible wider hit area for reliable hover
      const diagHit = g
        .append('path')
        .datum([min, max])
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .attr('d', line as any)
        .style('pointer-events', 'stroke')
      ;(diagHit as any).raise()

      // Tooltip over diagonal: show which/how many points are above/below/on the line
      const eps = 1e-9
      const above = points.filter((p) => p.y > p.x + eps)
      const below = points.filter((p) => p.y < p.x - eps)
      const on = points.filter((p) => Math.abs(p.y - p.x) <= eps)
      const favored = maximizeY ? 'above (variant > baseline)' : maximizeX ? 'below (baseline > variant)' : 'none'
      const fmtList = (arr: typeof points) => {
        const names = arr.map((p) => p.category)
        const maxShow = 12
        if (names.length <= maxShow) return names.join(', ')
        return names.slice(0, maxShow).join(', ') + `, +${names.length - maxShow} more`
      }
      diagHit
        .on('mouseover', function () {
          const html = `
            <div><strong>Diagonal y=x</strong></div>
            <div>Favored side: <strong>${favored}</strong></div>
            <div>Above: <strong>${above.length}</strong>${above.length ? '<br/>' + fmtList(above) : ''}</div>
            <div>Below: <strong>${below.length}</strong>${below.length ? '<br/>' + fmtList(below) : ''}</div>
            <div>On: <strong>${on.length}</strong>${on.length ? '<br/>' + fmtList(on) : ''}</div>
          `
          tooltip.html(html).style('display', 'block')
        })
        .on('mousemove', (event: MouseEvent) => {
          tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
        })
        .on('mouseout', function () {
          tooltip.style('display', 'none')
        })
    }

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'jsonviz-pareto-tooltip')
      .style('position', 'fixed')
      .style('z-index', '9999')
      .style('background', isDark ? '#222' : '#fff')
      .style('color', isDark ? '#fff' : '#000')
      .style('padding', '6px 8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('display', 'none')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
      .style('border', isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)')

    const colorFor = (i: number) => `hsl(${Math.round((i * 360) / points.length)}, 70%, ${isDark ? 60 : 45}%)`

    g
      .selectAll('circle.ppt')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', 'ppt')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.y))
      .attr('r', 4)
      .attr('fill', (d, i) => d.color || colorFor(i))
      .style('cursor', 'pointer')
      .on('mouseover', function (_e: any, d) {
        d3.select(this as any).attr('r', 6)
        tooltip
          .style('display', 'block')
          .html(`<strong>${d.category}</strong><br/>x=${d.x.toFixed(5)}<br/>y=${d.y.toFixed(5)}<br/>Δ=${(d.y - d.x).toFixed(5)}`)
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
      })
      .on('mouseout', function () {
        d3.select(this as any).attr('r', 4)
        tooltip.style('display', 'none')
      })

    // Labels near points
    g
      .selectAll('text.ppl')
      .data(points)
      .enter()
      .append('text')
      .attr('class', 'ppl')
      .attr('x', (d) => x(d.x) + 6)
      .attr('y', (d) => y(d.y) - 6)
      .attr('fill', isDark ? '#ddd' : '#333')
      .style('font-size', '11px')
      .style('cursor', 'pointer')
      .text((d) => d.category)
      .on('mouseover', function (_e: any, d) {
        d3.select(this as any).style('font-weight', '600')
        tooltip
          .style('display', 'block')
          .html(`<strong>${d.category}</strong><br/>x=${d.x.toFixed(5)}<br/>y=${d.y.toFixed(5)}<br/>Δ=${(d.y - d.x).toFixed(5)}`)
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
      })
      .on('mouseout', function () {
        d3.select(this as any).style('font-weight', null)
        tooltip.style('display', 'none')
      })

    if (showFrontier) {
      // Frontier depends on maximize mode
      const both = (!maximizeX && !maximizeY) || (maximizeX && maximizeY)
      const eps = 1e-9
      let frontier: ParetoPoint[]
      let modeLabel = 'X & Y'
      if (both) {
        const mX = true
        const mY = true
        const isDominated = (a: ParetoPoint) =>
          points.some((b) => {
            if (a === b) return false
            const betterX = mX ? b.x >= a.x : b.x <= a.x
            const betterY = mY ? b.y >= a.y : b.y <= a.y
            const strictlyBetterX = mX ? b.x > a.x : b.x < a.x
            const strictlyBetterY = mY ? b.y > a.y : b.y < a.y
            return betterX && betterY && (strictlyBetterX || strictlyBetterY)
          })
        frontier = points.filter((p) => !isDominated(p))
        modeLabel = 'X & Y'
      } else if (maximizeX) {
        const maxX = d3.max(points, (d) => d.x) ?? 0
        frontier = points.filter((p) => p.x >= maxX - eps)
        modeLabel = 'X'
      } else {
        const maxY = d3.max(points, (d) => d.y) ?? 0
        frontier = points.filter((p) => p.y >= maxY - eps)
        modeLabel = 'Y'
      }

      // Sort for a clean polyline
      const sorted = both
        ? frontier.sort((a, b) => a.x - b.x)
        : maximizeX
        ? frontier.sort((a, b) => a.y - b.y)
        : frontier.sort((a, b) => a.x - b.x)

      const line = d3
        .line<ParetoPoint>()
        .x((d) => x(d.x))
        .y((d) => y(d.y))

      const strokeColor = both ? (isDark ? '#6fa8ff' : '#165dff') : maximizeX ? '#d67c00' : '#2ca02c'

      g
        .append('path')
        .datum(sorted)
        .attr('class', 'pareto-frontier')
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 2)
        .attr('d', line as any)
        .style('pointer-events', 'none')

      // Hit area for tooltip
      const frontierHit = g
        .append('path')
        .datum(sorted)
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .attr('d', line as any)
        .style('pointer-events', 'stroke')
      ;(frontierHit as any).raise()

      const fmtList = (arr: ParetoPoint[]) => {
        const names = arr.map((p) => p.category)
        const maxShow = 12
        if (names.length <= maxShow) return names.join(', ')
        return names.slice(0, maxShow).join(', ') + `, +${names.length - maxShow} more`
      }
      frontierHit
        .on('mouseover', function () {
          const extra = maximizeX
            ? `<div>max X = <strong>${(d3.max(points, (d) => d.x) ?? 0).toFixed(5)}</strong></div>`
            : both
            ? ''
            : `<div>max Y = <strong>${(d3.max(points, (d) => d.y) ?? 0).toFixed(5)}</strong></div>`
          const html = `
            <div><strong>Frontier (maximize ${modeLabel})</strong></div>
            ${extra}
            <div>Points: <strong>${frontier.length}</strong>${frontier.length ? '<br/>' + fmtList(frontier) : ''}</div>
          `
          tooltip.html(html).style('display', 'block')
        })
        .on('mousemove', (event: MouseEvent) => {
          tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
        })
        .on('mouseout', function () {
          tooltip.style('display', 'none')
        })
    }

    // Maximize-side polyline: connect all points where selected axis has higher or equal value
    if ((maximizeX && !maximizeY) || (maximizeY && !maximizeX)) {
      const eps = 0
      const side = maximizeX ? 'X' : 'Y'
      const subset = maximizeX
        ? points.filter((p) => p.x + thr >= p.y - eps)
        : points.filter((p) => p.y + thr >= p.x - eps)
      if (subset.length >= 2) {
        const sorted = maximizeX
          ? subset.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
          : subset.slice().sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
        const line = d3
          .line<ParetoPoint>()
          .x((d) => x(d.x))
          .y((d) => y(d.y))
        const stroke = maximizeX ? '#d67c00' : '#2ca02c'
        g
          .append('path')
          .datum(sorted)
          .attr('class', 'maximize-side-line')
          .attr('fill', 'none')
          .attr('stroke', stroke)
          .attr('stroke-width', 2)
          .attr('d', line as any)
          .style('pointer-events', 'none')
        const hit = g
          .append('path')
          .datum(sorted)
          .attr('fill', 'none')
          .attr('stroke', 'transparent')
          .attr('stroke-width', 12)
          .attr('d', line as any)
          .style('pointer-events', 'stroke')
        ;(hit as any).raise()
        const names = subset.map((p) => p.category)
        const maxShow = 12
        const list = names.length <= maxShow ? names.join(', ') : names.slice(0, maxShow).join(', ') + `, +${names.length - maxShow} more`
        hit
          .on('mouseover', function () {
            const html = `
              <div><strong>Maximize ${side} line</strong></div>
              <div>Points on line: <strong>${subset.length}</strong></div>
              ${subset.length ? `<div>${list}</div>` : ''}
              <div style="margin-top:4px;color:${isDark ? '#bbb' : '#666'}">Tolerance: ±${thr.toFixed(5)} around y=x. Ties (x=y) count for both sides.</div>
            `
            tooltip.html(html).style('display', 'block')
          })
          .on('mousemove', (event: MouseEvent) => {
            tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
          })
          .on('mouseout', function () {
            tooltip.style('display', 'none')
          })
      }
    }

    return () => {
      tooltip.remove()
    }
  }, [points, width, height, isDark, xLabel, yLabel, showFrontier, showDiagonal, maximizeX, maximizeY, nearTieThreshold])

  // Expose SVG element to parent for export
  useEffect(() => {
    exportRef?.(ref.current)
    return () => exportRef?.(null)
  }, [exportRef, ref.current])

  return <svg ref={ref} />
}
