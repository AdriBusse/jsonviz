export function colorForIndex(isDark: boolean, idx: number, total: number): string {
  const hue = Math.round((idx * 360) / Math.max(1, total))
  const sat = 70
  const light = isDark ? 60 : 45
  return `hsl(${hue} ${sat}% ${light}%)`
}
