import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SimpleBusinessManager from "./Dashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SimpleBusinessManager />
  </StrictMode>
);
