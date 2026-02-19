"use client";

import { useState } from "react";
import type { MaintenanceSummary } from "../data";

type Props = {
  maintenance: MaintenanceSummary;
  stagedEntities: string[];
  onStageChange: (entityId: string, staged: boolean) => void;
  onPrefillCommand: (command: string) => void;
};

export function MaintenancePluginsPanel({
  maintenance,
  stagedEntities,
  onStageChange,
  onPrefillCommand,
}: Props) {
  const [showLog, setShowLog] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);

  const runDoctor = () => {
    setDoctorRunning(true);
    setTimeout(() => {
      setDoctorRunning(false);
      onPrefillCommand("openclaw doctor --non-interactive");
    }, 800);
  };

  const togglePlugin = (pluginId: string) => {
    const staged = stagedEntities.includes(pluginId);
    onStageChange(pluginId, !staged);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Maintenance & Plugins</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Doctor runs, restart signals, and plugin health in one grid.
          </p>
        </div>
        <button
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          onClick={() => onPrefillCommand("openclaw plugins list --json")}
        >
          Prefill CLI
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="rounded border border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
                  Doctor status
                </p>
                <h3 className="text-xl font-semibold">{maintenance.doctor.status}</h3>
                <p className="text-xs text-[var(--text-muted)]">Last run {maintenance.doctor.lastRun}</p>
              </div>
              <button
                className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-black"
                onClick={runDoctor}
                disabled={doctorRunning}
              >
                {doctorRunning ? "Running..." : "Run doctor"}
              </button>
            </div>
            {maintenance.doctor.pendingMigrations.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Pending migrations
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {maintenance.doctor.pendingMigrations.map((migration) => (
                    <li key={migration}>{migration}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              className="mt-4 text-xs text-[var(--accent)]"
              onClick={() => setShowLog((prev) => !prev)}
            >
              {showLog ? "Hide" : "Show"} doctor log
            </button>
            {showLog && (
              <div className="mt-3 rounded bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
                {maintenance.doctor.log.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded border border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-4 py-2">
            <p className="text-sm font-semibold">Plugins</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {maintenance.plugins.map((plugin) => (
              <div key={plugin.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">{plugin.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">v{plugin.version}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        plugin.status === "ok"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {plugin.status}
                    </span>
                    <button
                      className="rounded border border-[var(--border)] px-3 py-1 text-xs"
                      onClick={() => togglePlugin(plugin.id)}
                    >
                      {stagedEntities.includes(plugin.id) ? "Unstage" : plugin.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{plugin.notes}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
