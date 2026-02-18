"use client";

import { useMemo, useState } from "react";
import type { ControlCenterData } from "./data";
import { AgentManagerPanel } from "./panels/agent-manager-panel";
import { RoutingStudioPanel } from "./panels/routing-studio-panel";
import { ChannelControlsPanel } from "./panels/channel-controls-panel";
import { AutomationCenterPanel } from "./panels/automation-center-panel";
import { MaintenancePluginsPanel } from "./panels/maintenance-plugins-panel";
import { CommandConsolePanel } from "./panels/command-console-panel";

type PanelId =
  | "agent-manager"
  | "routing-studio"
  | "channel-controls"
  | "automation-center"
  | "maintenance-plugins"
  | "command-console";

const panels: { id: PanelId; label: string; description: string }[] = [
  {
    id: "agent-manager",
    label: "Agent Manager",
    description: "Workspaces, files, heartbeat cadence",
  },
  {
    id: "routing-studio",
    label: "Routing Studio",
    description: "Bindings + precedence",
  },
  {
    id: "channel-controls",
    label: "Channel Controls",
    description: "Policies per surface",
  },
  {
    id: "automation-center",
    label: "Automation Center",
    description: "Heartbeats · Cron",
  },
  {
    id: "maintenance-plugins",
    label: "Maintenance & Plugins",
    description: "Doctor · Voice · Plugins",
  },
  {
    id: "command-console",
    label: "Command Console",
    description: "Inline CLI",
  },
];

export function ControlCenterShell({ data }: { data: ControlCenterData }) {
  const [activePanel, setActivePanel] = useState<PanelId>("agent-manager");
  const [pendingRestart, setPendingRestart] = useState(false);
  const [stagedEntities, setStagedEntities] = useState<string[]>([]);
  const [prefilledCommand, setPrefilledCommand] = useState<string>(
    data.commandHistory[0]?.command ?? "openclaw status"
  );

  const personaDigest = useMemo(() => data.personas.slice(0, 4), [data.personas]);

  const handleStageChange = (entityId: string, staged: boolean) => {
    setStagedEntities((current) => {
      const exists = current.includes(entityId);
      if (staged && !exists) {
        return [...current, entityId];
      }
      if (!staged && exists) {
        return current.filter((id) => id !== entityId);
      }
      return current;
    });
  };

  const handleApply = () => {
    if (!stagedEntities.length) return;
    setPendingRestart(true);
    setStagedEntities([]);
  };

  const renderPanel = () => {
    switch (activePanel) {
      case "agent-manager":
        return (
          <AgentManagerPanel
            agents={data.agents}
            onStageChange={handleStageChange}
            onCommandPrefill={setPrefilledCommand}
            onApply={handleApply}
            stagedEntities={stagedEntities}
          />
        );
      case "routing-studio":
        return (
          <RoutingStudioPanel
            routing={data.routing}
            onStageChange={handleStageChange}
            stagedEntities={stagedEntities}
          />
        );
      case "channel-controls":
        return (
          <ChannelControlsPanel
            channels={data.channels}
            onStageChange={handleStageChange}
            stagedEntities={stagedEntities}
          />
        );
      case "automation-center":
        return (
          <AutomationCenterPanel
            automation={data.automation}
            onStageChange={handleStageChange}
            stagedEntities={stagedEntities}
          />
        );
      case "maintenance-plugins":
        return (
          <MaintenancePluginsPanel
            maintenance={data.maintenance}
            onStageChange={handleStageChange}
            stagedEntities={stagedEntities}
            onPrefillCommand={setPrefilledCommand}
          />
        );
      case "command-console":
        return (
          <CommandConsolePanel
            history={data.commandHistory}
            prefilledCommand={prefilledCommand}
            onPrefillCommand={setPrefilledCommand}
            onStageClear={() => setStagedEntities([])}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="flex border-b border-[var(--border)] px-6 py-4">
        <div className="flex-1">
          <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            OCCode Control Center
          </p>
          <h1 className="text-3xl font-semibold">Configuration Console</h1>
        </div>
        <div className="flex items-center gap-4">
          {pendingRestart && (
            <span className="rounded-full border border-amber-500 px-4 py-1 text-sm text-amber-300">
              Pending gateway restart
            </span>
          )}
          {stagedEntities.length > 0 && (
            <button
              className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm"
              onClick={handleApply}
            >
              Apply {stagedEntities.length} staged change
              {stagedEntities.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      <div className="flex">
        <aside className="w-80 border-r border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Personas
              </p>
              <ul className="mt-2 space-y-3">
                {personaDigest.map((persona) => (
                  <li key={persona.id} className="rounded border border-[var(--border)] p-3">
                    <p className="text-sm font-semibold">{persona.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{persona.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Experience Principles
              </p>
              <ul className="mt-2 space-y-2">
                {data.principles.map((principle) => (
                  <li key={principle.id} className="rounded bg-[var(--bg-elevated)] p-3">
                    <p className="text-sm font-semibold">{principle.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{principle.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
            <nav>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Panels
              </p>
              <ul className="mt-2 space-y-2">
                {panels.map((panel) => (
                  <li key={panel.id}>
                    <button
                      className={`w-full rounded border px-3 py-2 text-left text-sm transition-colors ${
                        activePanel === panel.id
                          ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
                          : "border-[var(--border)] hover:border-[var(--accent)]"
                      }`}
                      onClick={() => setActivePanel(panel.id)}
                    >
                      <p className="font-semibold">{panel.label}</p>
                      <p className="text-xs text-[var(--text-muted)]">{panel.description}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>
        <main className="flex-1 p-6">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
            {renderPanel()}
          </div>
        </main>
      </div>
    </div>
  );
}
