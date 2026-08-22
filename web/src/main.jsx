import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import SimpleBusinessManager from "./Dashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SimpleBusinessManager />
  </StrictMode>
);
