import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export type RadarSeries = {
  name: string
  values: number[] // aligned with categories order
  color?: string
}

type Props = {
  categories: string[]
  series: RadarSeries[]
  width?: number
  height?: number
  isDark?: boolean
  exportRef?: (el: SVGSVGElement | null) => void
  normalizeToOne?: boolean
}

export default function RadarChart({ categories, series, width = 860, height = 520, isDark = false, exportRef, normalizeToOne = true }: Props) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (exportRef) exportRef(ref.current)
  }, [exportRef])

  useEffect(() => {
    const svg = d3.select(ref.current).style('color', isDark ? '#fff' : '#000')
    svg.selectAll('*').remove()
    const margin = { top: 20, right: 20, bottom: 40, left: 20 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const radius = Math.min(innerW, innerH) / 2
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    if (!categories || categories.length === 0 || !series || series.length === 0) {
      g.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', isDark ? '#aaa' : '#888')
        .text('No data')
      return
    }

    // Radial scale
    let r = d3.scaleLinear().range([0, radius])
    if (normalizeToOne) {
      r = r.domain([0, 1]).nice()
    } else {
      const allVals = series.flatMap((s) => s.values)
      let min = d3.min(allVals) ?? 0
      let max = d3.max(allVals) ?? 1
      if (min === max) {
        const delta = min === 0 ? 1 : Math.abs(min) * 0.1
        min -= delta
        max += delta
      }
      r = r.domain([min, max]).nice()
    }
    r.clamp(true)

    const angle = d3.scaleLinear().domain([0, categories.length]).range([0, Math.PI * 2])

    // Grid circles and radial value labels (data-driven ticks)
    const gridColor = isDark ? '#666' : '#bbb'
    const fmt = d3.format('.3~f')
    const ticks = r.ticks(4)
    ticks.forEach((t) => {
      if (!Number.isFinite(t)) return
      const rr = r(t)
      if (rr <= 0) return
      g.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', rr)
        .attr('fill', 'none')
        .attr('stroke', gridColor)
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1)
        .style('opacity', 0.5)
      // ring label on the +X axis side
      g.append('text')
        .attr('x', rr + 6)
        .attr('y', 0)
        .attr('fill', gridColor)
        .attr('font-size', 12)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .text(fmt(t))
    })

    // Axes
    const axisColor = isDark ? '#e6e6e6' : '#333'
    categories.forEach((cat, i) => {
      const a = angle(i)
      const x = radius * Math.cos(a - Math.PI / 2)
      const y = radius * Math.sin(a - Math.PI / 2)
      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', axisColor)
        .attr('stroke-width', 1)
        .style('opacity', 0.75)
      const lx = (radius + 12) * Math.cos(a - Math.PI / 2)
      const ly = (radius + 12) * Math.sin(a - Math.PI / 2)
      g.append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', axisColor)
        .style('font-size', '12px')
        .text(cat)
    })

    // Color helper
    const colorFor = (i: number) => `hsl(${Math.round((i * 360) / series.length)}, 70%, ${isDark ? 60 : 45}%)`

    // Radar polygons
    const line = d3
      .lineRadial<number>()
      .radius((d) => r(d))
      .angle((_d, i) => angle(i))
      .curve(d3.curveLinearClosed)

    const seriesRoot = g.append('g').attr('class', 'series-root')

    series.forEach((s, i) => {
      const vals = s.values
      const sc = s.color || colorFor(i)
      const group = seriesRoot.append('g').attr('class', 'series').attr('data-idx', String(i))
      // Draw filled area
      group
        .append('path')
        .datum(vals)
        .attr('class', 'radar-area')
        .attr('d', line as any)
        .attr('fill', sc)
        .attr('fill-opacity', 0.15)
        .attr('stroke', sc)
        .attr('stroke-width', 2)

      // Draw vertices with basic tooltips
      const pts = vals.map((v, j) => {
        const a = angle(j) - Math.PI / 2
        const rr = r(v)
        return { x: rr * Math.cos(a), y: rr * Math.sin(a), v, j }
      })
      const circles = group
        .append('g')
        .attr('class', 'radar-points')
        .selectAll('circle')
        .data(pts)
        .enter()
        .append('circle')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', 3)
        .attr('fill', sc)
        .attr('stroke', isDark ? '#111' : '#fff')
        .attr('stroke-width', 1)

      circles.append('title').text((d) => `${s.name} • ${categories[d.j]}: ${fmt(d.v)}`)

      // Hover interactions to highlight series
      group
        .on('mouseenter', function () {
          seriesRoot.selectAll('path.radar-area')
            .attr('fill-opacity', 0.08)
            .attr('stroke-opacity', 0.6)
          d3.select(this).select('path.radar-area')
            .attr('fill-opacity', 0.35)
            .attr('stroke-opacity', 1)
            .attr('stroke-width', 3)
        })
        .on('mouseleave', function () {
          seriesRoot.selectAll('path.radar-area')
            .attr('fill-opacity', 0.15)
            .attr('stroke-opacity', 1)
            .attr('stroke-width', 2)
        })
    })

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${margin.left}, ${height - margin.bottom + 8})`)
    series.forEach((s, i) => {
      const x = (i % 3) * 240
      const y = Math.floor(i / 3) * 20
      legend
        .append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', s.color || colorFor(i))
        .attr('fill-opacity', 0.6)
      legend
        .append('text')
        .attr('x', x + 18)
        .attr('y', y + 10)
        .attr('fill', isDark ? '#ddd' : '#333')
        .style('font-size', '12px')
        .text(s.name)
    })
  }, [categories, series, width, height, isDark, normalizeToOne])

  return <svg ref={ref} />
}
