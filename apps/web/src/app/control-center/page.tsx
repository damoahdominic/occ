import { ControlCenterShell } from "@occode/control-center/ui";
import { getControlCenterData } from "@occode/control-center/data";

export default function ControlCenterPage() {
  const data = getControlCenterData();
  return <ControlCenterShell data={data} />;
}
