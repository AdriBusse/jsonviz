import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Series } from '../types'

type Props = { series: Series[]; width?: number; height?: number; isDark?: boolean; exportRef?: (el: SVGSVGElement | null) => void }

export default function LineChart({ series, width = 860, height = 320, isDark = false, exportRef }: Props) {
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

    const hostColor = getComputedStyle(svg.node() as SVGSVGElement).color || '#ccc'
    g.selectAll('.tick text').attr('fill', hostColor)
    g.selectAll('.domain').attr('stroke', hostColor).style('opacity', 0.4)
    g.selectAll('.tick line').attr('stroke', hostColor).style('opacity', 0.2)

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

        const circles = g
          .selectAll(null)
          .data(s.points)
          .enter()
          .append('circle')
          .attr('cx', (d: { k: number; value: number }) => x(d.k))
          .attr('cy', (d: { k: number; value: number }) => y(d.value))
          .attr('r', 3)
          .attr('fill', s.color)
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
  useEffect(() => {
    exportRef?.(ref.current)
    return () => exportRef?.(null)
  }, [exportRef, ref.current])
  return <svg ref={ref} />
}
