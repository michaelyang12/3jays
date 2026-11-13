import type * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export interface SceneContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  query: URLSearchParams
}

export interface SceneView {
  position: THREE.Vector3Tuple
  target: THREE.Vector3Tuple
  fov?: number
  near?: number
  far?: number
  aspect?: string
}

export interface SceneHandle {
  view?: SceneView
  views?: Record<string, SceneView>
  update?: (dt: number, elapsed: number) => void
  render?: () => void
}

export type SceneFactory = (ctx: SceneContext) => SceneHandle | Promise<SceneHandle>
