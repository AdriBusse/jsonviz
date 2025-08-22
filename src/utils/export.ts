// Generic SVG/PNG export helpers with title and background
export function exportSvgWithTitle(
  src: SVGSVGElement,
  chartW: number,
  chartH: number,
  titleText: string,
  filename: string,
  useDarkBg: boolean,
  optionsOrCallback?: { extraRight?: number; postProcessWrap?: (wrap: SVGGElement, chartW: number, chartH: number) => void } | ((wrap: SVGGElement, chartW: number, chartH: number) => void),
) {
  const NS = 'http://www.w3.org/2000/svg'
  const margin = 16
  const titleFontSize = 14
  const titleHeight = titleFontSize + 8
  const extraRight = typeof optionsOrCallback === 'object' && optionsOrCallback ? (optionsOrCallback.extraRight ?? 0) : 0
  const totalW = margin + chartW + extraRight + margin
  const totalH = margin + titleHeight + chartH + margin
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
  const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionsOrCallback?.postProcessWrap
  if (cb) cb(wrap, chartW, chartH)
  chartGroup.appendChild(wrap)
  outSvg.appendChild(chartGroup)
  const xml = new XMLSerializer().serializeToString(outSvg)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportPngWithTitle(
  src: SVGSVGElement,
  chartW: number,
  chartH: number,
  titleText: string,
  filename: string,
  useDarkBg: boolean,
  optionsOrCallback?: { extraRight?: number; postProcessWrap?: (wrap: SVGGElement, chartW: number, chartH: number) => void } | ((wrap: SVGGElement, chartW: number, chartH: number) => void),
) {
  const NS = 'http://www.w3.org/2000/svg'
  const margin = 16
  const titleFontSize = 14
  const titleHeight = titleFontSize + 8
  const extraRight = typeof optionsOrCallback === 'object' && optionsOrCallback ? (optionsOrCallback.extraRight ?? 0) : 0
  const totalW = margin + chartW + extraRight + margin
  const totalH = margin + titleHeight + chartH + margin
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
  const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : optionsOrCallback?.postProcessWrap
  if (cb) cb(wrap, chartW, chartH)
  chartGroup.appendChild(wrap)
  outSvg.appendChild(chartGroup)
  const xml = new XMLSerializer().serializeToString(outSvg)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = totalW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = useDarkBg ? '#111' : '#ffffff'
    ctx.fillRect(0, 0, totalW, totalH)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url2 = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url2
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url2)
    }, 'image/png')
  }
  img.src = url
}
