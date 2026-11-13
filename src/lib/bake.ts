import * as THREE from 'three'

interface Entry {
  key: string
  hash: string
  data: unknown
}

interface Session {
  scope: string
  db: IDBDatabase | null
  entries: Map<string, Entry>
  touched: Set<string>
  sources: Map<string, string>
  hashes: Map<string, string>
}

const DB_NAME = '3jays-bake'
const STORE = 'entries'
const TEXTURE_PROPS = ['name', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'flipY', 'generateMipmaps', 'premultiplyAlpha', 'rotation'] as const
const VECTOR_PROPS = ['repeat', 'offset', 'center'] as const

const sourceLoaders: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? import.meta.glob<string>(['/scenes/*/**/*.ts', '/src/lib/**/*.ts', '!**/rounds/**'], { query: '?raw', import: 'default' })
  : {}

let session: Session | null = null

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function scopeRange(scope: string): IDBKeyRange {
  return IDBKeyRange.bound(`/scenes/${scope}/`, `/scenes/${scope}/￿`)
}

export async function openBakes(scope: string): Promise<void> {
  session = null
  if (!import.meta.env.DEV) return
  const prefix = `/scenes/${scope}/`
  const paths = Object.keys(sourceLoaders).filter((path) => path.startsWith(prefix) || path.startsWith('/src/lib/'))
  const [db, texts] = await Promise.all([openDb(), Promise.all(paths.map((path) => sourceLoaders[path]()))])
  const stored = db ? await request(db.transaction(STORE).objectStore(STORE).getAll(scopeRange(scope))).catch(() => []) : []
  session = {
    scope,
    db,
    entries: new Map((stored as Entry[]).map((entry) => [entry.key, entry])),
    touched: new Set(),
    sources: new Map(paths.map((path, i) => [path, texts[i]])),
    hashes: new Map(),
  }
}

export function pruneBakes(): void {
  const s = session
  if (!s?.db) return
  const stale = [...s.entries.keys()].filter((key) => !s.touched.has(key))
  if (!stale.length) return
  const store = s.db.transaction(STORE, 'readwrite').objectStore(STORE)
  for (const key of stale) {
    store.delete(key)
    s.entries.delete(key)
  }
}

function resolveImport(from: string, spec: string, sources: Map<string, string>): string | null {
  const base = from.slice(0, from.lastIndexOf('/') + 1)
  const path = new URL(spec, `http://x${base}`).pathname
  for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) if (sources.has(candidate)) return candidate
  return null
}

function hashString(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

// Hash of the module and every local module it imports, transitively. Imports of packages are covered by THREE.REVISION only.
function fingerprint(s: Session, path: string): string {
  const cached = s.hashes.get(path)
  if (cached) return cached
  const seen = new Set<string>()
  const stack = [path]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const match of s.sources.get(file)!.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const dep = resolveImport(file, match[1], s.sources)
      if (dep) stack.push(dep)
    }
  }
  const hash = hashString([THREE.REVISION, ...[...seen].sort().map((file) => `${file}\n${s.sources.get(file)}`)].join('\n'))
  s.hashes.set(path, hash)
  return hash
}

function argsKey(label: string, args: unknown[]): string {
  return JSON.stringify(args, (_, value) => {
    if (typeof value === 'function') throw new Error(`bake "${label}": arguments must be plain data, got a function`)
    return value
  })
}

function encode(value: unknown, label: string): unknown {
  if (value === null || typeof value !== 'object') return value
  if (ArrayBuffer.isView(value) || value instanceof ImageData) return value
  if (Array.isArray(value)) return value.map((item) => encode(item, label))
  if (value instanceof THREE.Texture && value.image instanceof HTMLCanvasElement) {
    const canvas = value.image
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(`bake "${label}": texture canvas has no 2d context`)
    const props: Record<string, unknown> = {}
    for (const prop of TEXTURE_PROPS) props[prop] = value[prop]
    for (const prop of VECTOR_PROPS) props[prop] = value[prop].toArray()
    return { __bake: 'canvas', image: ctx.getImageData(0, 0, canvas.width, canvas.height), props }
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) throw new Error(`bake "${label}": can't store a ${proto.constructor?.name ?? 'class instance'}`)
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v, label)]))
}

function decode(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return data
  if (data instanceof ImageData) return new ImageData(data.data.slice(), data.width, data.height)
  if (ArrayBuffer.isView(data)) return (data as unknown as { slice(): unknown }).slice()
  if (Array.isArray(data)) return data.map(decode)
  const record = data as Record<string, unknown>
  if (record.__bake === 'canvas') {
    const image = record.image as ImageData
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')!.putImageData(image, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    const props = record.props as Record<string, unknown>
    for (const prop of TEXTURE_PROPS) (texture as unknown as Record<string, unknown>)[prop] = props[prop]
    for (const prop of VECTOR_PROPS) texture[prop].fromArray(props[prop] as number[])
    return texture
  }
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, decode(v)]))
}

// Wraps a slow, deterministic builder so its result is cached in IndexedDB across page loads (dev only).
// The cache key is the label plus the arguments; an entry is reused only while the calling module and its local
// imports are unchanged. Results may hold plain data, typed arrays, ImageData, and canvas-backed textures.
export function baked<A extends unknown[], R>(moduleUrl: string, label: string, build: (...args: A) => R): (...args: A) => R {
  const path = new URL(moduleUrl).pathname
  return (...args: A): R => {
    const s = session
    if (!s || !s.sources.has(path)) return build(...args)
    const key = `${path}#${label}${argsKey(label, args)}`
    const hash = fingerprint(s, path)
    s.touched.add(key)
    const hit = s.entries.get(key)
    if (hit?.hash === hash) return decode(hit.data) as R
    const value = build(...args)
    const entry: Entry = { key, hash, data: encode(value, label) }
    s.entries.set(key, entry)
    if (s.db) {
      try {
        s.db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry)
      } catch {}
    }
    return value
  }
}
