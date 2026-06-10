import { DISPLAY_MODES } from "../../visualizationSchema.js";
import { registerThreeMode } from "./threeModeRegistry.js";
import { createPlasmaFieldRenderer } from "./plasmaFieldRenderer.js";

registerThreeMode(DISPLAY_MODES.threePlasmaField, createPlasmaFieldRenderer);
