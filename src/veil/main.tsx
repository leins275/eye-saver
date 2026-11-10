import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/styles.css";
import "./veil.css";
import { Veil } from "./Veil";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Veil />
  </StrictMode>,
);
