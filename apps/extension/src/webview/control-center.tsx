import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ControlCenterData } from "@occode/control-center/data";
import { ControlCenterShell } from "@occode/control-center/ui";

declare global {
  interface Window {
    __CONTROL_CENTER_DATA__?: ControlCenterData;
  }
}

const mount = () => {
  const container = document.getElementById("control-center-root");
  const data = window.__CONTROL_CENTER_DATA__;
  if (!container || !data) {
    console.warn("Control Center: missing container or data");
    return;
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ControlCenterShell data={data} />
    </StrictMode>
  );
};

document.addEventListener("DOMContentLoaded", mount);
