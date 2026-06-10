import { DISPLAY_MODES } from "../../visualizationSchema.js";
import { registerThreeMode } from "./threeModeRegistry.js";
import { createPlasmaFieldRenderer } from "./plasmaFieldRenderer.js";
import { createParticleGalaxyRenderer } from "./particleGalaxyRenderer.js";
import { createBloomTunnelRenderer } from "./bloomTunnelRenderer.js";
import { createEnergySphereRenderer } from "./energySphereRenderer.js";
import { createKaleidoscopeRenderer } from "./kaleidoscopeRenderer.js";
import { createGlitchSpectrumRenderer } from "./glitchSpectrumRenderer.js";

registerThreeMode(DISPLAY_MODES.threePlasmaField, createPlasmaFieldRenderer);
registerThreeMode(DISPLAY_MODES.threeParticleGalaxy, createParticleGalaxyRenderer);
registerThreeMode(DISPLAY_MODES.threeBloomTunnel, createBloomTunnelRenderer);
registerThreeMode(DISPLAY_MODES.threeEnergySphere, createEnergySphereRenderer);
registerThreeMode(DISPLAY_MODES.threeKaleidoscope, createKaleidoscopeRenderer);
registerThreeMode(DISPLAY_MODES.threeGlitchSpectrum, createGlitchSpectrumRenderer);
