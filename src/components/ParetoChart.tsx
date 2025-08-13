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
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
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

    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const xExtent = d3.extent(xs) as [number, number]
    const yExtent = d3.extent(ys) as [number, number]

    // Add small padding
    const padX = (xExtent[1] - xExtent[0]) * 0.05 || 0.05
    const padY = (yExtent[1] - yExtent[0]) * 0.05 || 0.05

    const x = d3.scaleLinear().domain([xExtent[0] - padX, xExtent[1] + padX]).nice().range([0, innerW])
    const y = d3.scaleLinear().domain([yExtent[0] - padY, yExtent[1] + padY]).nice().range([innerH, 0])

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
      g.append('path')
        .datum([min, max])
        .attr('fill', 'none')
        .attr('stroke', isDark ? '#777' : '#888')
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1)
        .attr('d', line as any)
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
      .text((d) => d.category)

    if (showFrontier) {
      const isDominated = (a: ParetoPoint) =>
        points.some((b) => {
          if (a === b) return false
          const betterX = maximizeX ? b.x >= a.x : b.x <= a.x
          const betterY = maximizeY ? b.y >= a.y : b.y <= a.y
          const strictlyBetter = maximizeX ? b.x > a.x : b.x < a.x
          const strictlyBetterY = maximizeY ? b.y > a.y : b.y < a.y
          return betterX && betterY && (strictlyBetter || strictlyBetterY)
        })
      const frontier = points.filter((p) => !isDominated(p))
      const sorted = frontier.sort((a, b) => a.x - b.x)
      const line = d3
        .line<ParetoPoint>()
        .x((d) => x(d.x))
        .y((d) => y(d.y))
      g
        .append('path')
        .datum(sorted)
        .attr('fill', 'none')
        .attr('stroke', isDark ? '#6fa8ff' : '#165dff')
        .attr('stroke-width', 2)
        .attr('d', line as any)
    }

    return () => {
      tooltip.remove()
    }
  }, [points, width, height, isDark, xLabel, yLabel, showFrontier, showDiagonal, maximizeX, maximizeY])

  return <svg ref={ref} />
}
