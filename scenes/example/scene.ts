import * as THREE from 'three'
import type { SceneFactory } from '../../src/types'

const createScene: SceneFactory = ({ scene }) => {
  const sky = new THREE.Color('#d9e4ec')
  scene.background = sky
  scene.fog = new THREE.Fog(sky, 12, 30)

  const hemi = new THREE.HemisphereLight('#ffffff', '#8a7f72', 1.2)
  const sun = new THREE.DirectionalLight('#fff1dc', 2.5)
  sun.position.set(5, 8, 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -6
  sun.shadow.camera.right = 6
  sun.shadow.camera.top = 6
  sun.shadow.camera.bottom = -6

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    new THREE.MeshStandardMaterial({ color: '#c8c2b8', roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.6, 0.2, 200, 32),
    new THREE.MeshStandardMaterial({ color: '#d4543a', roughness: 0.35, metalness: 0.1 }),
  )
  knot.position.y = 1.4
  knot.castShadow = true

  const blockMaterial = new THREE.MeshStandardMaterial({ color: '#3e5a6e', roughness: 0.6 })
  const blocks: { size: number; position: THREE.Vector3Tuple }[] = [
    { size: 0.8, position: [-2, 0.4, -0.5] },
    { size: 0.5, position: [1.8, 0.25, 0.8] },
    { size: 1.1, position: [1.2, 0.55, -2.2] },
  ]
  for (const { size, position } of blocks) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), blockMaterial)
    block.position.fromArray(position)
    block.rotation.y = position[0]
    block.castShadow = true
    block.receiveShadow = true
    scene.add(block)
  }

  scene.add(hemi, sun, ground, knot)

  return {
    view: { position: [3.5, 2.4, 4.5], target: [0, 0.9, 0], fov: 45 },
    update: (dt) => {
      knot.rotation.y += dt * 0.5
    },
  }
}

export default createScene
