"use client";

import { useEffect, useState } from "react";
import type { CommandHistoryEntry } from "../data";

type Props = {
  history: CommandHistoryEntry[];
  prefilledCommand: string;
  onPrefillCommand: (command: string) => void;
  onStageClear: () => void;
};

export function CommandConsolePanel({
  history,
  prefilledCommand,
  onPrefillCommand,
  onStageClear,
}: Props) {
  const [input, setInput] = useState(prefilledCommand);
  const [logEntries, setLogEntries] = useState(history);
  const [currentOutput, setCurrentOutput] = useState("Ready.");
  const [running, setRunning] = useState(false);
  const [sandboxed, setSandboxed] = useState(true);

  useEffect(() => {
    setInput(prefilledCommand);
  }, [prefilledCommand]);

  const runCommand = () => {
    if (!input.trim()) return;
    setRunning(true);
    setCurrentOutput("Executing...");
    setTimeout(() => {
      const newEntry: CommandHistoryEntry = {
        id: `local-${Date.now()}`,
        command: input,
        status: sandboxed ? "success" : "running",
        timestamp: new Date().toISOString(),
        output: sandboxed
          ? "Sandbox dry-run complete. CLI output deferred until wiring real exec."
          : "Live execution pending. Hook CLI adapter here.",
      };
      setLogEntries((entries) => [newEntry, ...entries]);
      setCurrentOutput(newEntry.output);
      setRunning(false);
      onPrefillCommand(input);
      onStageClear();
    }, 600);
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">Inline console</p>
        <h2 className="text-2xl font-semibold">Command Console</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Run surgical openclaw commands without leaving the Control Center. Sandbox mode is on by default.
        </p>
      </header>

      <div className="rounded border border-[var(--border)] p-4">
        <label className="text-sm">
          Command
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="mt-2 h-24 w-full rounded border border-[var(--border)] bg-transparent p-3 text-sm"
            placeholder="openclaw status"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sandboxed}
              onChange={(event) => setSandboxed(event.target.checked)}
            />
            Sandbox (dry run)
          </label>
          <button
            className="rounded border border-[var(--border)] px-3 py-1"
            onClick={() => setInput("openclaw cron list --json")}
          >
            Suggest cron list
          </button>
          <button
            className="rounded border border-[var(--border)] px-3 py-1"
            onClick={() => setInput("openclaw bindings lint")}
          >
            Suggest bindings lint
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-black"
            onClick={runCommand}
            disabled={running}
          >
            {running ? "Running" : "Run command"}
          </button>
          <button
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            onClick={() => setInput(prefilledCommand)}
          >
            Reset to prefills
          </button>
        </div>
      </div>

      <div className="rounded border border-[var(--border)] p-4">
        <p className="text-sm font-semibold">Output</p>
        <pre className="mt-2 min-h-[120px] rounded bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
{currentOutput}
        </pre>
      </div>

      <div className="rounded border border-[var(--border)]">
        <div className="border-b border-[var(--border)] px-4 py-2">
          <p className="text-sm font-semibold">History</p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {logEntries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{entry.command}</p>
                <span className="text-xs text-[var(--text-muted)]">{entry.timestamp}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{entry.output}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-1 text-xs ${
                  entry.status === "success"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : entry.status === "failed"
                    ? "bg-rose-500/20 text-rose-200"
                    : "bg-amber-500/20 text-amber-200"
                }`}
              >
                {entry.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
