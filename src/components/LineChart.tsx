import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Series } from '../types'

type Props = {
  series: Series[]
  width?: number
  height?: number
  isDark?: boolean
  exportRef?: (el: SVGSVGElement | null) => void
  highlightedSeries?: string | null
  xLabel?: string
  yLabel?: string
}

export default function LineChart({ series, width = 860, height = 320, isDark = false, exportRef, highlightedSeries = null, xLabel, yLabel }: Props) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = d3.select(ref.current).style('color', isDark ? '#fff' : '#000')
    svg.selectAll('*').remove()
    if (!series || series.length === 0) return
    const margin = { top: 16, right: 24, bottom: 40, left: 56 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const allK = series.flatMap((s) => s.points.map((p) => p.k))
    const allV = series.flatMap((s) => s.points.map((p) => p.value))
    const kExtent = d3.extent(allK)
    const vMax = d3.max(allV) ?? 1
    const x = d3.scaleLinear().domain([kExtent[0] ?? 0, kExtent[1] ?? 1]).range([0, innerW])
    const y = d3.scaleLinear().domain([0, Math.max(1, vMax)]).nice().range([innerH, 0])

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d: any) => String(d))
    const yAxis = d3.axisLeft(y).ticks(6)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis as any)
    g.append('g').call(yAxis as any)

    // High-contrast axis styling for visibility on white and dark backgrounds
    const axisTextColor = isDark ? '#e6e6e6' : '#333'
    const axisStrokeColor = isDark ? '#b5b5b5' : '#444'
    g.selectAll('.tick text').attr('fill', axisTextColor)
    g.selectAll('.domain')
      .attr('stroke', axisStrokeColor)
      .attr('stroke-width', 1)
      .style('opacity', 0.9)
    g.selectAll('.tick line')
      .attr('stroke', axisStrokeColor)
      .attr('stroke-width', 0.75)
      .style('opacity', isDark ? 0.35 : 0.35)

    // Axis labels if provided
    if (xLabel) {
      g.append('text')
        .attr('class', 'axis-label-x')
        .attr('x', innerW / 2)
        .attr('y', innerH + 34)
        .attr('text-anchor', 'middle')
        .attr('fill', axisTextColor)
        .style('opacity', 0.75)
        .style('font-size', '12px')
        .text(xLabel)
    }
    if (yLabel) {
      g.append('text')
        .attr('class', 'axis-label-y')
        .attr('transform', `rotate(-90) translate(${-innerH / 2}, -42)`) // position left of y-axis
        .attr('text-anchor', 'middle')
        .attr('fill', axisTextColor)
        .style('opacity', 0.75)
        .style('font-size', '12px')
        .text(yLabel)
    }

    const lineGen = d3
      .line<{ k: number; value: number }>()
      .x((d: { k: number; value: number }) => x(d.k))
      .y((d: { k: number; value: number }) => y(d.value))
      .curve(d3.curveMonotoneX)

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'jsonviz-chart-tooltip')
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

    for (const s of series) {
      g.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 2)
        .attr('d', lineGen as any)
        .attr('class', 'series-path')
        .attr('data-series', s.name)

        const circles = g
          .selectAll(null)
          .data(s.points)
          .enter()
          .append('circle')
          .attr('cx', (d: { k: number; value: number }) => x(d.k))
          .attr('cy', (d: { k: number; value: number }) => y(d.value))
          .attr('r', 3)
          .attr('fill', s.color)
          .attr('class', 'series-point')
          .attr('data-series', s.name)
          .style('cursor', 'pointer')

        circles
          .on('mouseover', (event: MouseEvent, d: { k: number; value: number }) => {
            const el = event.currentTarget as SVGCircleElement
            d3.select(el).attr('r', 5)
            tooltip
              .style('display', 'block')
              .html(`<strong>${s.name}</strong><br/>k=${d.k}<br/>${Number(d.value).toFixed(5)}`)
          })
          .on('mousemove', (event: MouseEvent) => {
            tooltip.style('left', event.clientX + 12 + 'px').style('top', event.clientY + 12 + 'px')
          })
          .on('mouseout', (event: MouseEvent) => {
            const el = event.currentTarget as SVGCircleElement
            d3.select(el).attr('r', 3)
            tooltip.style('display', 'none')
          })

        circles.append('title').text((d: { k: number; value: number }) => `${s.name}: k=${d.k}, value=${Number(d.value).toFixed(5)}`)
    }

    return () => {
      tooltip.remove()
    }
  }, [series, width, height, isDark])

  // Apply highlight styling without redrawing the chart
  useEffect(() => {
    const svgEl = ref.current
    if (!svgEl) return
    const g = d3.select(svgEl).select('g')
    if (g.empty()) return
    const hasHighlight = !!highlightedSeries
    const paths = g.selectAll<SVGPathElement, unknown>('.series-path')
    const points = g.selectAll<SVGCircleElement, unknown>('.series-point')
    if (!hasHighlight) {
      paths.attr('opacity', 1).attr('stroke-width', 2)
      points.attr('opacity', 1)
      return
    }
    paths.attr('opacity', 0.25).attr('stroke-width', 2)
    points.attr('opacity', 0.2)
    const targetPaths = paths.filter(function () {
      return (this as SVGPathElement).getAttribute('data-series') === highlightedSeries
    })
    const targetPoints = points.filter(function () {
      return (this as SVGCircleElement).getAttribute('data-series') === highlightedSeries
    })
    targetPaths.attr('opacity', 1).attr('stroke-width', 3.5)
    targetPoints.attr('opacity', 1)
    // bring highlighted path to front
    targetPaths.each(function () {
      const n = this as SVGPathElement
      n.parentNode && n.parentNode.appendChild(n)
    })
  }, [highlightedSeries])
  useEffect(() => {
    exportRef?.(ref.current)
    return () => exportRef?.(null)
  }, [exportRef, ref.current])
  return <svg ref={ref} />
}
