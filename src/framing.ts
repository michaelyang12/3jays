import type { SceneContext, SceneView } from './types'

export function frameCamera(ctx: SceneContext, view: SceneView | undefined): void {
  if (!view) {
    // TODO: Fallback policy when a scene declares no view: keep the default camera from main.ts,
    // or fit to the bounding box of ctx.scene (Box3.setFromObject), ignoring ground planes and sky domes.
    return
  }
  ctx.camera.position.fromArray(view.position)
  ctx.controls.target.fromArray(view.target)
  if (view.fov) ctx.camera.fov = view.fov
  if (view.near) ctx.camera.near = view.near
  if (view.far) ctx.camera.far = view.far
  ctx.camera.updateProjectionMatrix()
  ctx.controls.update()
}
