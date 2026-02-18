"use client";

import { useMemo, useState } from "react";
import type { RoutingSummary } from "../data";

type Props = {
  routing: RoutingSummary;
  stagedEntities: string[];
  onStageChange: (entityId: string, staged: boolean) => void;
};

export function RoutingStudioPanel({ routing, stagedEntities, onStageChange }: Props) {
  const [selectedBindingId, setSelectedBindingId] = useState(routing.bindings[0]?.id ?? "");
  const [showConflicts, setShowConflicts] = useState(true);
  const [simulation, setSimulation] = useState({
    channel: "WhatsApp",
    account: "Primary",
    metadata: "peer:+233545****",
  });
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  const selectedBinding = useMemo(
    () => routing.bindings.find((binding) => binding.id === selectedBindingId),
    [routing.bindings, selectedBindingId]
  );

  const toggleBindingScope = (bindingId: string) => {
    onStageChange(bindingId, !stagedEntities.includes(bindingId));
  };

  const runSimulation = () => {
    const winner = routing.bindings.find((binding) => binding.status !== "missing") ?? routing.bindings[0];
    setSimulationResult(
      winner
        ? `${winner.agentId} wins via ${winner.precedence.toUpperCase()} precedence`
        : "No agent matched"
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Routing Studio</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Inspect bindings, precedence ladders, and run routing simulations.
          </p>
        </div>
        <button
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          onClick={() => setShowConflicts((prev) => !prev)}
        >
          {showConflicts ? "Hide" : "Show"} conflicts
        </button>
      </header>

      {showConflicts && routing.conflicts.length > 0 && (
        <div className="rounded border border-amber-500 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-semibold">Conflicts detected</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {routing.conflicts.map((conflict) => (
              <li key={conflict.id}>
                {conflict.description}
                <div className="text-xs text-amber-100">
                  Scopes: {conflict.affectedScopes.join(", ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="border-b border-[var(--border)] px-4 py-2">Channel</th>
                  <th className="border-b border-[var(--border)] px-4 py-2">Account</th>
                  <th className="border-b border-[var(--border)] px-4 py-2">Scope</th>
                  <th className="border-b border-[var(--border)] px-4 py-2">Agent</th>
                  <th className="border-b border-[var(--border)] px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {routing.bindings.map((binding) => (
                  <tr
                    key={binding.id}
                    className={`cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--bg-elevated)] ${
                      binding.id === selectedBindingId ? "bg-[var(--bg-elevated)]" : ""
                    }`}
                    onClick={() => setSelectedBindingId(binding.id)}
                  >
                    <td className="px-4 py-3">{binding.channel}</td>
                    <td className="px-4 py-3">{binding.account}</td>
                    <td className="px-4 py-3">{binding.scope}</td>
                    <td className="px-4 py-3 font-semibold">{binding.agentId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          binding.status === "healthy"
                            ? "bg-emerald-500/20 text-emerald-200"
                            : binding.status === "overlap"
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-rose-500/20 text-rose-200"
                        }`}
                      >
                        {binding.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Broadcast groups</p>
            <div className="mt-3 space-y-3">
              {routing.broadcastGroups.map((group) => (
                <div key={group.id} className="rounded border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{group.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{group.members.length} members</p>
                    </div>
                    <button
                      className="text-xs text-[var(--accent)]"
                      onClick={() => toggleBindingScope(`broadcast-${group.id}`)}
                    >
                      {stagedEntities.includes(`broadcast-${group.id}`) ? "Unstage" : "Stage"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{group.members.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedBinding && (
            <div className="rounded border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
                    Binding detail
                  </p>
                  <h3 className="text-lg font-semibold">{selectedBinding.scope}</h3>
                </div>
                <button
                  className="text-xs text-[var(--accent)]"
                  onClick={() => toggleBindingScope(selectedBinding.id)}
                >
                  {stagedEntities.includes(selectedBinding.id) ? "Unstage" : "Stage edits"}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <DetailRow label="Channel" value={selectedBinding.channel} />
                <DetailRow label="Account" value={selectedBinding.account} />
                <DetailRow label="Agent" value={selectedBinding.agentId} />
                <DetailRow label="Precedence" value={selectedBinding.precedence} />
              </div>
            </div>
          )}

          <div className="rounded border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Precedence ladder</p>
            <ul className="mt-2 space-y-2 text-sm">
              {routing.precedenceNotes.map((note, index) => (
                <li key={index} className="rounded bg-[var(--bg-elevated)] p-2">
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Simulate routing</p>
            <div className="mt-3 space-y-3 text-sm">
              <label className="space-y-1">
                <span>Channel</span>
                <input
                  value={simulation.channel}
                  onChange={(event) => setSimulation((prev) => ({ ...prev, channel: event.target.value }))}
                  className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span>Account</span>
                <input
                  value={simulation.account}
                  onChange={(event) => setSimulation((prev) => ({ ...prev, account: event.target.value }))}
                  className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span>Metadata</span>
                <input
                  value={simulation.metadata}
                  onChange={(event) => setSimulation((prev) => ({ ...prev, metadata: event.target.value }))}
                  className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
                />
              </label>
              <button
                className="w-full rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-black"
                onClick={runSimulation}
              >
                Run
              </button>
              {simulationResult && (
                <p className="rounded bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
                  {simulationResult}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
