import { DISPLAY_MODES } from "../../visualizationSchema.js";
import { registerThreeMode } from "./threeModeRegistry.js";
import { createPlasmaFieldRenderer } from "./plasmaFieldRenderer.js";
import { createParticleGalaxyRenderer } from "./particleGalaxyRenderer.js";

registerThreeMode(DISPLAY_MODES.threePlasmaField, createPlasmaFieldRenderer);
registerThreeMode(DISPLAY_MODES.threeParticleGalaxy, createParticleGalaxyRenderer);
