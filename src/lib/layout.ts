import * as THREE from 'three'

export type Point = [number, number]
export type Facing = 'N' | 'E' | 'S' | 'W'
// A compass bearing in degrees (N 0, E 90, S 180, W 270; north is -z) or its letter.
export type Heading = Facing | number
export type Mount = 'floor' | 'wall' | 'free'

export const CLEARANCE = {
  walkway: 0.6,
  drawers: 0.7,
  bedSide: 0.45,
  seat: 0.45,
  desk: 0.75,
}

export interface Footprint {
  min: Point
  size: Point
  y: [number, number]
  facing: Facing
  mount: Mount
  clearance?: number
  attachTo?: string
  measure?: false | number
}

export interface Placement {
  min?: Point
  center?: Point
  facing: Heading
  lift?: number
  within?: string
}

export type Slot = Placement | 'attached'

export interface Layout<Id extends string = string> {
  items: Partial<Record<Id, Slot>>
  keepClear?: Area[]
}

export interface Wall {
  a: Point
  b: Point
  thickness: number
}

export interface Area {
  name: string
  min: Point
  max: Point
}

export interface RoomSpec {
  height: number
  walls: Wall[]
  keepClear?: Area[]
  metrics?: { bounds: [Point, Point]; region: [Point, Point]; seed: Point; cell?: number }
}

export interface LayoutSpec<Id extends string = string, L extends Layout<Id> = Layout<Id>> {
  room: RoomSpec
  footprints: Record<Id, Footprint>
  layouts: Record<string, L>
  initial: string
}

export interface Shape {
  name: string
  poly: Point[]
  y: [number, number]
}

export interface Transform {
  theta: number
  cos: number
  sin: number
  offset: Point
  lift: number
}

export interface PlacedItem<Id extends string = string> {
  id: Id
  footprint: Footprint
  transform: Transform
  shape: Shape
  clearance: Shape | null
}

export interface FloorStats {
  free: number
  rect: { width: number; depth: number; min: Point }
}

const BEARING: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 }
const DIRECTION: Record<Facing, Point> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
const EPS = 0.002

export const bearing = (heading: Heading) => (typeof heading === 'number' ? heading : BEARING[heading])
const yaw = (heading: Heading) => THREE.MathUtils.degToRad(90 - bearing(heading))

// Quarter turns use exact trig so rotated footprints keep their sizes to the millimeter.
function trig(theta: number): [number, number] {
  const q = theta / (Math.PI / 2)
  if (Math.abs(q - Math.round(q)) < 1e-9) return ([[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][])[((Math.round(q) % 4) + 4) % 4]
  return [Math.cos(theta), Math.sin(theta)]
}

const turn = (t: Transform, [x, z]: Point): Point => [x * t.cos + z * t.sin + t.offset[0], -x * t.sin + z * t.cos + t.offset[1]]
const rect = (min: Point, max: Point): Point[] => [min, [max[0], min[1]], max, [min[0], max[1]]]

export function transformFor(home: Footprint, at: Placement): Transform {
  const theta = yaw(at.facing) - yaw(home.facing)
  const [cos, sin] = trig(theta)
  const [w, d] = home.size
  const size: Point = [Math.abs(w * cos) + Math.abs(d * sin), Math.abs(w * sin) + Math.abs(d * cos)]
  const target: Point | undefined = at.center ?? (at.min && [at.min[0] + size[0] / 2, at.min[1] + size[1] / 2])
  if (!target) throw new Error('a placement needs `min` or `center`')
  const center: Point = [home.min[0] + w / 2, home.min[1] + d / 2]
  const turned = turn({ theta, cos, sin, offset: [0, 0], lift: 0 }, center)
  return { theta, cos, sin, offset: [target[0] - turned[0], target[1] - turned[1]], lift: at.lift ?? 0 }
}

export function placeObject(object: THREE.Object3D, t: Transform) {
  object.rotation.y = t.theta
  object.position.set(t.offset[0], t.lift, t.offset[1])
}

function strip(f: Footprint, side: Facing, depth: number): [Point, Point] {
  const max: Point = [f.min[0] + f.size[0], f.min[1] + f.size[1]]
  if (side === 'E') return [[max[0], f.min[1]], [max[0] + depth, max[1]]]
  if (side === 'W') return [[f.min[0] - depth, f.min[1]], [f.min[0], max[1]]]
  if (side === 'S') return [[f.min[0], max[1]], [max[0], max[1] + depth]]
  return [[f.min[0], f.min[1] - depth], [max[0], f.min[1]]]
}

const OPPOSITE: Record<Facing, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' }

function shapeOf(name: string, t: Transform, [min, max]: [Point, Point], y: [number, number]): Shape {
  return { name, poly: rect(min, max).map((p) => turn(t, p)), y: [y[0] + t.lift, y[1] + t.lift] }
}

export function wallShapes(room: RoomSpec): Shape[] {
  return room.walls.map((wall, i) => {
    const [ax, az] = wall.a
    const [bx, bz] = wall.b
    const len = Math.hypot(bx - ax, bz - az)
    const n: Point = [((bz - az) / len) * wall.thickness, (-(bx - ax) / len) * wall.thickness]
    return { name: `wall ${i}`, poly: [wall.a, wall.b, [bx + n[0], bz + n[1]], [ax + n[0], az + n[1]]], y: [0, room.height] }
  })
}

export function areaShape(area: Area, height: number): Shape {
  return { name: area.name, poly: rect(area.min, area.max), y: [0, height] }
}

function project(poly: Point[], axis: Point): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of poly) {
    const v = x * axis[0] + z * axis[1]
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  return [min, max]
}

// Separating-axis test on convex polygons; shapes that only touch don't overlap.
export function overlaps(a: Shape, b: Shape): boolean {
  if (Math.min(a.y[1], b.y[1]) - Math.max(a.y[0], b.y[0]) <= EPS) return false
  for (const poly of [a.poly, b.poly]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i]
      const [x1, z1] = poly[(i + 1) % poly.length]
      const len = Math.hypot(x1 - x0, z1 - z0)
      if (len < 1e-9) continue
      const axis: Point = [-(z1 - z0) / len, (x1 - x0) / len]
      const [a0, a1] = project(a.poly, axis)
      const [b0, b1] = project(b.poly, axis)
      if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false
    }
  }
  return true
}

export function contains(poly: Point[], [x, z]: Point): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function resolveLayout<Id extends string>(spec: LayoutSpec<Id>, layout: Layout<Id>): { items: PlacedItem<Id>[]; problems: string[] } {
  const problems: string[] = []
  const transforms = new Map<string, Transform>()
  const ids = (Object.keys(layout.items) as Id[]).filter((id) => layout.items[id])
  for (const id of ids) {
    const slot = layout.items[id]!
    if (slot !== 'attached') transforms.set(id, transformFor(spec.footprints[id], slot))
  }
  const items: PlacedItem<Id>[] = []
  for (const id of ids) {
    const footprint = spec.footprints[id]
    let transform = transforms.get(id)
    if (layout.items[id] === 'attached') {
      if (!footprint.attachTo) problems.push(`${id} is marked attached but its footprint has no attachTo`)
      else if (!transforms.has(footprint.attachTo)) problems.push(`${id} is attached to ${footprint.attachTo}, which is not in the layout`)
      transform = footprint.attachTo ? transforms.get(footprint.attachTo) : undefined
      if (!transform) continue
    }
    const box: [Point, Point] = [footprint.min, [footprint.min[0] + footprint.size[0], footprint.min[1] + footprint.size[1]]]
    const clearance = footprint.clearance ? shapeOf(`${id} clearance`, transform!, strip(footprint, footprint.facing, footprint.clearance), [0, footprint.y[1]]) : null
    items.push({ id, footprint, transform: transform!, shape: shapeOf(id, transform!, box, footprint.y), clearance })
  }
  return { items, problems }
}

// Room-wide walkways plus the layout's own, for rules the source scene broke (a door it blocked).
export const keepClearAreas = <Id extends string>(spec: LayoutSpec<Id>, layout: Layout<Id>): Area[] => [...(spec.room.keepClear ?? []), ...(layout.keepClear ?? [])]

export function checkLayout<Id extends string>(spec: LayoutSpec<Id>, layout: Layout<Id>, extraClear: Shape[] = []): string[] {
  const { items, problems } = resolveLayout(spec, layout)
  const walls = wallShapes(spec.room)
  const clear = [...keepClearAreas(spec, layout).map((area) => areaShape(area, spec.room.height)), ...extraClear]
  const solid = items.filter((item) => item.footprint.mount !== 'free')
  const floor = solid.filter((item) => item.footprint.mount === 'floor')

  for (const item of solid) {
    for (const zone of [...walls, ...(item.footprint.mount === 'floor' ? clear : [])]) {
      if (overlaps(item.shape, zone)) problems.push(`${item.id} overlaps ${zone.name}`)
    }
    if (item.footprint.mount === 'wall') {
      const back = shapeOf('back', item.transform, strip(item.footprint, OPPOSITE[item.footprint.facing], 0.01), item.footprint.y)
      if (!walls.some((wall) => overlaps(back, wall))) problems.push(`${item.id} is wall-mounted but its back is not against a wall`)
    }
  }
  const nested = (a: PlacedItem<Id>, b: PlacedItem<Id>) => {
    const slot = layout.items[a.id]
    return typeof slot === 'object' && slot.within === b.id
  }
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (nested(solid[i], solid[j]) || nested(solid[j], solid[i])) continue
      if (overlaps(solid[i].shape, solid[j].shape)) problems.push(`${solid[i].id} overlaps ${solid[j].id}`)
    }
  }
  for (const item of floor) {
    if (!item.clearance) continue
    for (const other of [...walls, ...floor.filter((f) => f !== item).map((f) => f.shape)]) {
      if (overlaps(item.clearance, other)) problems.push(`${item.clearance.name} (${item.footprint.clearance} m) is blocked by ${other.name}`)
    }
  }
  return problems
}

// Rasterizes the floor reachable from `metrics.seed` (walls are solid), then removes floor items.
// Both numbers count only cells inside `metrics.region`, so a hallway can't inflate them.
export function floorStats<Id extends string>(spec: LayoutSpec<Id>, layout: Layout<Id>): FloorStats | null {
  const m = spec.room.metrics
  if (!m) return null
  const cell = m.cell ?? 0.05
  const [b0, b1] = m.bounds
  const nx = Math.round((b1[0] - b0[0]) / cell)
  const nz = Math.round((b1[1] - b0[1]) / cell)
  const at = (i: number, k: number): Point => [b0[0] + (i + 0.5) * cell, b0[1] + (k + 0.5) * cell]
  const walls = wallShapes(spec.room).map((w) => w.poly)
  const solids = resolveLayout(spec, layout).items.filter((item) => item.footprint.mount === 'floor').map((item) => item.shape.poly)

  const reached = new Uint8Array(nx * nz)
  const stack: Point[] = [[Math.floor((m.seed[0] - b0[0]) / cell), Math.floor((m.seed[1] - b0[1]) / cell)]]
  while (stack.length) {
    const [i, k] = stack.pop()!
    if (i < 0 || k < 0 || i >= nx || k >= nz || reached[k * nx + i] || walls.some((w) => contains(w, at(i, k)))) continue
    reached[k * nx + i] = 1
    stack.push([i + 1, k], [i - 1, k], [i, k + 1], [i, k - 1])
  }

  const [r0, r1] = m.region
  const free = new Uint8Array(nx * nz)
  let count = 0
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const p = at(i, k)
      const inRegion = p[0] > r0[0] && p[0] < r1[0] && p[1] > r0[1] && p[1] < r1[1]
      if (inRegion && reached[k * nx + i] && !solids.some((s) => contains(s, p))) {
        free[k * nx + i] = 1
        count++
      }
    }
  }

  let best = { area: 0, width: 0, depth: 0, min: [0, 0] as Point }
  const heights = new Array(nx).fill(0)
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) heights[i] = free[k * nx + i] ? heights[i] + 1 : 0
    const open: number[] = []
    for (let i = 0; i <= nx; i++) {
      const h = i === nx ? 0 : heights[i]
      while (open.length && heights[open[open.length - 1]] >= h) {
        const top = open.pop()!
        const left = open.length ? open[open.length - 1] + 1 : 0
        const area = heights[top] * (i - left)
        if (area > best.area) best = { area, width: (i - left) * cell, depth: heights[top] * cell, min: [b0[0] + left * cell, b0[1] + (k - heights[top] + 1) * cell] }
      }
      open.push(i)
    }
  }
  return { free: count * cell * cell, rect: { width: best.width, depth: best.depth, min: best.min } }
}

export function pickLayout<Id extends string, L extends Layout<Id>>(spec: LayoutSpec<Id, L>, query?: URLSearchParams): [string, L] {
  const id = query?.get('layout') ?? spec.initial
  const layout = spec.layouts[id]
  if (!layout) throw new Error(`Unknown layout "${id}". Layouts: ${Object.keys(spec.layouts).join(', ')}`)
  return [id, layout]
}

// Bounds of what the builder made, skipping anything tagged `userData.outsideFootprint` (a cord
// running down to an outlet). A wall-mounted item's back side isn't compared: mounting hardware
// may sink into the wall or hold the item off it.
function builtBounds(object: THREE.Object3D, f: Footprint): number[] | null {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const part = new THREE.Box3()
  const visit = (node: THREE.Object3D) => {
    if (node.userData.outsideFootprint) return
    const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    const instanced = node as THREE.InstancedMesh
    if (instanced.isInstancedMesh) {
      instanced.computeBoundingBox()
      if (instanced.count) box.union(part.copy(instanced.boundingBox!).applyMatrix4(node.matrixWorld))
    } else if (geometry?.attributes?.position) {
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      box.union(part.copy(geometry.boundingBox!).applyMatrix4(node.matrixWorld))
    }
    for (const child of node.children) visit(child)
  }
  visit(object)
  if (box.isEmpty()) return null
  const built = [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z]
  if (f.mount === 'wall') {
    const back = { E: 0, W: 1, S: 4, N: 5 }[f.facing]
    const declared = back === 0 ? f.min[0] : back === 1 ? f.min[0] + f.size[0] : back === 4 ? f.min[1] : f.min[1] + f.size[1]
    built[back] = declared
  }
  return built
}

function footprintDrift(object: THREE.Object3D, id: string, f: Footprint): string | null {
  if (f.measure === false || f.mount === 'free') return null
  const built = builtBounds(object, f)
  if (!built) return null
  const declared = [f.min[0], f.min[0] + f.size[0], f.y[0], f.y[1], f.min[1], f.min[1] + f.size[1]]
  const worst = Math.max(...declared.map((v, i) => Math.abs(v - built[i])))
  if (worst <= (f.measure ?? 0.01)) return null
  const fmt = (a: number, b: number) => `${a.toFixed(3)}..${b.toFixed(3)}`
  return `${id} footprint is off by ${(worst * 100).toFixed(1)} cm from what its builder makes (built x ${fmt(built[0], built[1])}, y ${fmt(built[2], built[3])}, z ${fmt(built[4], built[5])}); fix the footprint, or set measure to a tolerance or false`
}

function markedZones(root: THREE.Object3D): Shape[] {
  root.updateMatrixWorld(true)
  const zones: Shape[] = []
  root.traverse((object) => {
    const name = object.userData.keepClear
    if (typeof name !== 'string') return
    for (const part of object.children.length ? object.children : [object]) {
      const box = new THREE.Box3().setFromObject(part)
      zones.push({ name, poly: rect([box.min.x, box.min.z], [box.max.x, box.max.z]), y: [box.min.y, box.max.y] })
    }
  })
  return zones
}

// Builds every item in the layout at its home footprint, moves it rigidly into place, and reports
// problems as console warnings so `bun run shot` fails on them. Objects anywhere in `scene` tagged
// with `userData.keepClear = '<name>'` (door leaves, for example) become keep-clear zones.
export function applyLayout<Id extends string>(scene: THREE.Object3D, spec: LayoutSpec<Id>, layout: Layout<Id>, build: Record<Id, () => THREE.Object3D>) {
  const { items } = resolveLayout(spec, layout)
  for (const item of items) {
    const object = build[item.id]()
    object.name = item.id
    const drift = footprintDrift(object, item.id, item.footprint)
    if (drift) console.warn(`[layout] ${drift}`)
    placeObject(object, item.transform)
    scene.add(object)
  }
  for (const problem of checkLayout(spec, layout, markedZones(scene))) console.warn(`[layout] ${problem}`)
  const stats = floorStats(spec, layout)
  if (stats) console.info(`[layout] free floor ${stats.free.toFixed(2)} m2, largest clear rectangle ${stats.rect.width.toFixed(2)} x ${stats.rect.depth.toFixed(2)} m at (${stats.rect.min.map((v) => v.toFixed(2)).join(', ')})`)
}

export const facingVector = (heading: Heading): Point => {
  if (typeof heading !== 'number') return DIRECTION[heading]
  const b = THREE.MathUtils.degToRad(heading)
  return [Math.sin(b), -Math.cos(b)]
}
