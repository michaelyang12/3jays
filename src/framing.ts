import type { SceneContext, SceneView } from './types'

// TODO: Decide how the viewer frames the camera when a scene loads and when the user presses R.
//
// When `view` is provided, the scene has stated exactly where the camera should be.
// When it is undefined, the viewer needs a fallback policy, for example:
//   - leave the default camera from main.ts alone
//   - fit the camera to the bounding box of ctx.scene (Box3.setFromObject)
//
// Remember to call ctx.camera.updateProjectionMatrix() after changing fov,
// and ctx.controls.update() after moving the camera or target.
export function frameCamera(ctx: SceneContext, view: SceneView | undefined): void {
  void ctx
  void view
}
