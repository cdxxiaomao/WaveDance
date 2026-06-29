import * as THREE from "three";

/**
 * 点击柱网地面时回调世界 XZ（fieldGroup 局部坐标）。
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   camera: THREE.Camera,
 *   fieldGroup: THREE.Group,
 *   onPointerHit: (x: number, z: number) => void,
 * }} opts
 */
export function createSoundFieldPointerHandler(opts) {
  const { canvas, camera, fieldGroup, onPointerHit } = opts;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const invGroupMatrix = new THREE.Matrix4();
  const localOrigin = new THREE.Vector3();
  const localDir = new THREE.Vector3();
  const hitLocal = new THREE.Vector3();

  let enabled = false;
  let bound = false;
  let prevPointerEvents = "";

  /** @param {PointerEvent} event */
  function pointerToHit(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    invGroupMatrix.copy(fieldGroup.matrixWorld).invert();
    localOrigin.copy(raycaster.ray.origin).applyMatrix4(invGroupMatrix);
    localDir.copy(raycaster.ray.direction).transformDirection(invGroupMatrix);

    if (Math.abs(localDir.y) < 1e-5) return null;
    const t = -localOrigin.y / localDir.y;
    if (t < 0) return null;

    hitLocal.copy(localOrigin).addScaledVector(localDir, t);
    return { x: hitLocal.x, z: hitLocal.z };
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (!enabled || event.button !== 0) return;
    const hit = pointerToHit(event);
    if (!hit) return;
    onPointerHit(hit.x, hit.z);
  }

  function bindListeners() {
    if (bound) return;
    canvas.addEventListener("pointerdown", onPointerDown);
    bound = true;
  }

  function unbindListeners() {
    if (!bound) return;
    canvas.removeEventListener("pointerdown", onPointerDown);
    bound = false;
  }

  /** @param {boolean} next */
  function setEnabled(next) {
    const want = Boolean(next);
    if (want === enabled) return;
    enabled = want;

    if (enabled) {
      prevPointerEvents = canvas.style.pointerEvents || "";
      canvas.style.pointerEvents = "auto";
      canvas.setAttribute("data-no-drag", "");
      bindListeners();
      return;
    }

    canvas.style.pointerEvents = prevPointerEvents || "none";
    canvas.removeAttribute("data-no-drag");
    unbindListeners();
  }

  function dispose() {
    setEnabled(false);
  }

  return { setEnabled, dispose };
}
