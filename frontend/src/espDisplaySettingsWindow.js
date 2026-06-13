import { initEspDisplaySettings } from "./espDisplaySettings.js";

initEspDisplaySettings().catch((err) => {
  console.error("esp display settings init failed:", err);
});
