import { DISPLAY_MODES } from "../../visualizationSchema.js";
import { registerThreeMode } from "./threeModeRegistry.js";
import { createPlasmaFieldRenderer } from "./plasmaFieldRenderer.js";
import { createParticleGalaxyRenderer } from "./particleGalaxyRenderer.js";
import { createBloomTunnelRenderer } from "./bloomTunnelRenderer.js";
import { createEnergySphereRenderer } from "./energySphereRenderer.js";

registerThreeMode(DISPLAY_MODES.threePlasmaField, createPlasmaFieldRenderer);
registerThreeMode(DISPLAY_MODES.threeParticleGalaxy, createParticleGalaxyRenderer);
registerThreeMode(DISPLAY_MODES.threeBloomTunnel, createBloomTunnelRenderer);
registerThreeMode(DISPLAY_MODES.threeEnergySphere, createEnergySphereRenderer);
