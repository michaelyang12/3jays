import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from './framing'
import { openBakes, pruneBakes } from './lib/bake'
import type { SceneContext, SceneFactory, SceneHandle } from './types'

const modules = import.meta.glob<{ default: SceneFactory }>('/scenes/*/scene.ts')
const scenes = new Map(Object.entries(modules).map(([path, load]) => [path.split('/')[2], load]))
const layoutSpecs = import.meta.glob<{ layouts: Record<string, unknown>; initial: string } | undefined>('/scenes/*/params.ts', { import: 'layoutSpec' })

const app = document.querySelector<HTMLDivElement>('#app')!
const overlay = document.querySelector<HTMLDivElement>('#overlay')!

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
app.append(renderer.domElement)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

const held = new Set<string>()
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'])
window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.altKey || !FLY_KEYS.has(event.code)) return
  held.add(event.code)
  event.preventDefault()
})
window.addEventListener('keyup', (event) => held.delete(event.code))
window.addEventListener('blur', () => held.clear())

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const step = new THREE.Vector3()
const PIVOT = 0.01

// Speed scales with the camera's far plane: about walking pace in a room (far 60 m), much faster in a landscape.
const flySpeed = () => 2 * Math.max(1, camera.far / 60) ** 0.75

// Dragging turns the view around the camera itself: the orbit target sits a centimeter in front of it.
function pivotAtCamera() {
  camera.getWorldDirection(forward)
  controls.target.copy(camera.position).addScaledVector(forward, PIVOT)
  controls.update()
}

function move(offset: THREE.Vector3) {
  camera.position.add(offset)
  controls.target.add(offset)
}

// WASD flies along the view direction, Shift rises and Control drops.
function fly(dt: number) {
  if (!held.size) return
  camera.getWorldDirection(forward)
  right.crossVectors(forward, camera.up).normalize()
  step.set(0, 0, 0)
  if (held.has('KeyW')) step.add(forward)
  if (held.has('KeyS')) step.sub(forward)
  if (held.has('KeyD')) step.add(right)
  if (held.has('KeyA')) step.sub(right)
  if (held.has('ShiftLeft') || held.has('ShiftRight')) step.add(camera.up)
  if (held.has('ControlLeft') || held.has('ControlRight')) step.sub(camera.up)
  if (step.lengthSq() === 0) return
  move(step.normalize().multiplyScalar(flySpeed() * Math.min(dt, 0.1)))
}

controls.enableZoom = false
controls.rotateSpeed = 0.6
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault()
  camera.getWorldDirection(forward)
  move(step.copy(forward).multiplyScalar(-event.deltaY * flySpeed() * 0.001))
}, { passive: false })

function resize() {
  const { clientWidth: width, clientHeight: height } = app
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function setStatus(status: 'loading' | 'ready' | 'error') {
  document.documentElement.dataset.scene = status
}

function sceneList(): HTMLUListElement {
  const list = document.createElement('ul')
  for (const name of [...scenes.keys()].sort()) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `?scene=${encodeURIComponent(name)}`
    link.textContent = name
    item.append(link)
    list.append(item)
    layoutSpecs[`/scenes/${name}/params.ts`]?.().then((spec) => {
      if (spec) item.append(layoutList(name, spec))
    })
  }
  return list
}

function layoutList(name: string, spec: { layouts: Record<string, unknown>; initial: string }): HTMLUListElement {
  const list = document.createElement('ul')
  for (const id of Object.keys(spec.layouts)) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `?scene=${encodeURIComponent(name)}&layout=${encodeURIComponent(id)}`
    link.textContent = id
    item.append(link)
    if (id === spec.initial) item.append(' (default)')
    list.append(item)
  }
  return list
}

function showIndex() {
  overlay.hidden = false
  overlay.textContent = scenes.size ? 'Pick a scene:' : 'No scenes yet. Add one at scenes/<name>/scene.ts'
  if (scenes.size) overlay.append(sceneList())
}

function showError(message: string) {
  setStatus('error')
  overlay.hidden = false
  overlay.className = 'error'
  overlay.textContent = message
}

async function start(name: string, query: URLSearchParams) {
  const viewId = query.get('view')
  const load = scenes.get(name)
  if (!load) {
    showError(`Unknown scene "${name}".`)
    if (scenes.size) overlay.append(sceneList())
    return
  }

  setStatus('loading')
  document.title = `${name} | 3jays`
  camera.position.set(4, 3, 6)
  controls.target.set(0, 0, 0)

  const ctx: SceneContext = { renderer, scene: new THREE.Scene(), camera, controls, query }
  const [module] = await Promise.all([load(), openBakes(name)])
  const handle: SceneHandle = await module.default(ctx)
  pruneBakes()

  const views = handle.views ?? {}
  let view = handle.view
  const setView = (id: string) => {
    if (!views[id]) throw new Error(`Unknown view "${id}". Views: ${Object.keys(views).join(', ') || 'none'}`)
    view = views[id]
    frameCamera(ctx, view)
    pivotAtCamera()
  }
  frameCamera(ctx, view)
  if (viewId) setView(viewId)
  pivotAtCamera()
  if (import.meta.env.DEV) Object.assign(window, { __3jays: { ...ctx, THREE, view: handle.view, views, setView } })
  window.addEventListener('keydown', (event) => {
    if (event.key === 'r' && !event.metaKey && !event.ctrlKey) {
      frameCamera(ctx, view)
      pivotAtCamera()
    }
  })

  let last = performance.now()
  let firstFrame = true
  renderer.setAnimationLoop((now) => {
    const dt = (now - last) / 1000
    last = now
    handle.update?.(dt, now / 1000)
    fly(dt)
    controls.update()
    if (handle.render) handle.render()
    else renderer.render(ctx.scene, camera)
    if (firstFrame) {
      firstFrame = false
      setStatus('ready')
    }
  })
}

window.addEventListener('resize', resize)
window.addEventListener('error', (event) => showError(String(event.error ?? event.message)))
window.addEventListener('unhandledrejection', (event) => showError(String(event.reason?.stack ?? event.reason)))
resize()

const query = new URLSearchParams(window.location.search)
const name = query.get('scene')
if (name) start(name, query).catch((error) => showError(String(error?.stack ?? error)))
else showIndex()
