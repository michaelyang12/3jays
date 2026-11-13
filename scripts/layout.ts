import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { areaShape, checkLayout, keepClearAreas, facingVector, floorStats, resolveLayout, wallShapes, type FloorStats, type LayoutSpec, type Point, type Shape } from '../src/lib/layout'
import { fail } from './brief'
import { launch } from './shot'

const PX = 200
const PAD = 0.35

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function planSvg(spec: LayoutSpec, id: string, stats: FloorStats | null, problems: string[]): string {
  const { items } = resolveLayout(spec, spec.layouts[id])
  const walls = wallShapes(spec.room)
  const clear = keepClearAreas(spec, spec.layouts[id]).map((area) => areaShape(area, spec.room.height))
  const all = [...walls, ...items.map((item) => item.shape)].flatMap((shape) => shape.poly)
  const minX = Math.min(...all.map((p) => p[0])) - PAD
  const minZ = Math.min(...all.map((p) => p[1])) - PAD
  const width = (Math.max(...all.map((p) => p[0])) + PAD - minX) * PX
  const height = (Math.max(...all.map((p) => p[1])) + PAD - minZ) * PX
  const header = 46
  const px = ([x, z]: Point): Point => [(x - minX) * PX, (z - minZ) * PX + header]
  const xy = (p: Point) => px(p).map((v) => v.toFixed(1)).join(',')
  const poly = (shape: Shape, style: string) => `<polygon points="${shape.poly.map(xy).join(' ')}" ${style}/>`
  const centroid = (shape: Shape): Point => [shape.poly.reduce((s, p) => s + p[0], 0) / shape.poly.length, shape.poly.reduce((s, p) => s + p[1], 0) / shape.poly.length]
  const taken: Point[] = []
  const labels: string[] = []
  const label = (at: Point, text: string, fill = '#1d1d1d') => {
    let [x, y] = px(at)
    const half = text.length * 3.3 + 4
    while (taken.some(([tx, ty]) => Math.abs(tx - x) < half + 20 && Math.abs(ty - y) < 12)) y += 13
    taken.push([x, y])
    labels.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" stroke="#faf8f4" stroke-width="3" paint-order="stroke" font-size="11" text-anchor="middle" dominant-baseline="middle">${esc(text)}</text>`)
  }
  const flagged = (name: string) => problems.some((problem) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(problem))

  const out: string[] = []
  for (const zone of clear) {
    out.push(poly(zone, 'fill="#e05050" fill-opacity="0.1" stroke="#c03030" stroke-dasharray="5 4"'))
    label(centroid(zone), zone.name, '#a02020')
  }
  if (stats?.rect.width) {
    const r = stats.rect
    const shape: Shape = { name: 'clear', poly: [r.min, [r.min[0] + r.width, r.min[1]], [r.min[0] + r.width, r.min[1] + r.depth], [r.min[0], r.min[1] + r.depth]], y: [0, 0] }
    out.push(poly(shape, 'fill="#3caa5a" fill-opacity="0.12" stroke="#2c8a46" stroke-width="1.5"'))
    label([r.min[0] + r.width / 2, r.min[1] + r.depth - 0.08], `clear ${r.width.toFixed(2)} x ${r.depth.toFixed(2)} m`, '#2c8a46')
  }
  for (const wall of walls) out.push(poly(wall, 'fill="#3b3b3b"'))
  const order = { free: 0, floor: 1, wall: 2 }
  for (const item of [...items].sort((a, b) => order[a.footprint.mount] - order[b.footprint.mount])) {
    if (item.clearance) out.push(poly(item.clearance, 'fill="#f0c43c" fill-opacity="0.25" stroke="#c89a10" stroke-dasharray="3 3"'))
    const bad = flagged(item.id) ? ' stroke="#d01c1c" stroke-width="3"' : ''
    const style = {
      floor: `fill="#d8c3a0" stroke="#6b5a3e"${bad || ' stroke-width="1.2"'}`,
      wall: `fill="#7fa3c8" fill-opacity="0.85" stroke="#2d4f73"${bad || ' stroke-width="1"'}`,
      free: `fill="none" stroke="#8a8a8a" stroke-dasharray="4 3"${bad}`,
    }[item.footprint.mount]
    out.push(poly(item.shape, style))
    const c = centroid(item.shape)
    const slot = spec.layouts[id].items[item.id]
    if (slot && slot !== 'attached' && item.footprint.mount !== 'free') {
      const [dx, dz] = facingVector(slot.facing)
      const [x1, y1] = px(c)
      const [x2, y2] = px([c[0] + dx * 0.12, c[1] + dz * 0.12])
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1d1d1d" stroke-width="1.5"/>`)
    }
    label([c[0], c[1] + (item.footprint.mount === 'wall' ? -0.06 : 0.06)], item.id, flagged(item.id) ? '#d01c1c' : '#1d1d1d')
  }
  const summary = stats ? `free floor ${stats.free.toFixed(2)} m2` : 'no metrics configured'
  const title = `${id}: ${summary}, ${problems.length ? `${problems.length} problem(s)` : 'no problems'}. North is up; ticks show facing.`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height + header)}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="100%" height="100%" fill="#faf8f4"/>`,
    `<text x="12" y="20" font-size="13" fill="#1d1d1d">${esc(title)}</text>`,
    `<text x="12" y="37" font-size="11" fill="#555">tan floor, blue wall-mounted, dashed free; yellow clearance, red keep-clear, green largest clear rectangle</text>`,
    ...out,
    ...labels,
    '</svg>',
  ].join('\n')
}

if (import.meta.main) {
  const usage = 'usage: bun run layout <scene> [--layout <id,id>] [--svg]'
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { layout: { type: 'string' }, svg: { type: 'boolean', default: false } },
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) fail(usage)
  const paramsPath = resolve('scenes', name, 'params.ts')
  if (!existsSync(paramsPath)) fail(`scenes/${name}/params.ts not found`)
  const spec = (await import(paramsPath)).layoutSpec as LayoutSpec | undefined
  if (!spec) fail(`scenes/${name}/params.ts has no \`layoutSpec\` export; see skills/scene-redox/references/layout-system.md`)

  const ids = values.layout ? values.layout.split(',').map((id) => id.trim()) : Object.keys(spec.layouts)
  for (const id of ids) if (!spec.layouts[id]) fail(`no layout "${id}". Layouts: ${Object.keys(spec.layouts).join(', ')}`)

  const rows = ids.map((id) => ({ id, problems: checkLayout(spec, spec.layouts[id]), stats: floorStats(spec, spec.layouts[id]) }))
  const w = Math.max(8, ...ids.map((id) => id.length + 2))
  console.log(`${'layout'.padEnd(w)}${'problems'.padEnd(10)}${'free m2'.padEnd(10)}largest clear rectangle`)
  for (const { id, problems, stats } of rows) {
    const rect = stats ? `${stats.rect.width.toFixed(2)} x ${stats.rect.depth.toFixed(2)} m at (${stats.rect.min.map((v) => v.toFixed(2)).join(', ')})` : '-'
    console.log(`${(id + (id === spec.initial ? '*' : '')).padEnd(w)}${String(problems.length).padEnd(10)}${(stats ? stats.free.toFixed(2) : '-').padEnd(10)}${rect}`)
  }
  for (const { id, problems } of rows) for (const problem of problems) console.log(`  ${id}: ${problem}`)
  console.log('* initial layout. Door swings from `userData.keepClear` meshes and footprint drift are checked at load: run `bun run shot <scene> --layout <id>`.')

  if (values.svg) {
    const dir = join('scenes', name, 'shots')
    mkdirSync(dir, { recursive: true })
    const browser = await launch()
    try {
      const page = await browser.newPage()
      for (const { id, problems, stats } of rows) {
        const svg = planSvg(spec, id, stats, problems)
        const base = join(dir, `plan-${id}`)
        await Bun.write(`${base}.svg`, svg)
        await page.setContent(`<body style="margin:0">${svg}</body>`)
        await page.locator('svg').screenshot({ path: `${base}.png` })
        console.log(`saved ${base}.png`)
      }
    } finally {
      await browser.close()
    }
  }
  if (rows.some((row) => row.problems.length)) process.exit(1)
}
