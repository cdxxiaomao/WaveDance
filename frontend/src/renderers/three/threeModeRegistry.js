/** @type {Map<string, (ctx: import('./threeContext.js').ThreeContext) => { render: Function, dispose: Function }}>} */
const factories = new Map();

/**
 * 注册 Three 模式工厂（Phase 16 起各 renderer 调用）。
 * @param {string} modeId
 * @param {(ctx: import('./threeContext.js').ThreeContext) => { render: Function, dispose: Function }} factory
 */
export function registerThreeMode(modeId, factory) {
  factories.set(String(modeId), factory);
}

/** @param {string} modeId */
export function hasThreeMode(modeId) {
  return factories.has(String(modeId));
}

/**
 * @param {string} modeId
 * @param {import('./threeContext.js').ThreeContext} ctx
 */
export function createThreeModeRenderer(modeId, ctx) {
  const factory = factories.get(String(modeId));
  if (!factory) return null;
  return factory(ctx);
}
