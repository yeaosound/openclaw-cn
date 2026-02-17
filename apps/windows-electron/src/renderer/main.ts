import { mountDashboard } from "./pages/dashboard.js";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Renderer root #app not found");
}

mountDashboard(root);
