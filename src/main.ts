import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameCamera } from './framing'
import type { SceneContext, SceneFactory, SceneHandle } from './types'

const modules = import.meta.glob<{ default: SceneFactory }>('/scenes/*/scene.ts')
const scenes = new Map(Object.entries(modules).map(([path, load]) => [path.split('/')[2], load]))

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

async function start(name: string) {
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

  const ctx: SceneContext = { renderer, scene: new THREE.Scene(), camera, controls }
  const handle: SceneHandle = await (await load()).default(ctx)

  frameCamera(ctx, handle.view)
  controls.update()
  window.addEventListener('keydown', (event) => {
    if (event.key === 'r' && !event.metaKey && !event.ctrlKey) frameCamera(ctx, handle.view)
  })

  let last = performance.now()
  let firstFrame = true
  renderer.setAnimationLoop((now) => {
    const dt = (now - last) / 1000
    last = now
    handle.update?.(dt, now / 1000)
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

const name = new URLSearchParams(window.location.search).get('scene')
if (name) start(name).catch((error) => showError(String(error?.stack ?? error)))
else showIndex()
