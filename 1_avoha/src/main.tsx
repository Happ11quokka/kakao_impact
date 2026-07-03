import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="phone-frame-wrapper">
      <div className="phone-frame-bezel">
        <div className="phone-frame">
          <App />
        </div>
      </div>
    </div>
  </StrictMode>
);
