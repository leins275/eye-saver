import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/styles.css";
import "./hud.css";
import { Hud } from "./Hud";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Hud />
  </StrictMode>,
);
