"use client";

import { useMemo, useState } from "react";
import type { AutomationSummary } from "../data";

type Props = {
  automation: AutomationSummary;
  stagedEntities: string[];
  onStageChange: (entityId: string, staged: boolean) => void;
};

export function AutomationCenterPanel({ automation, stagedEntities, onStageChange }: Props) {
  const [selectedJobId, setSelectedJobId] = useState(automation.cronJobs[0]?.id ?? "");
  const [showHeartbeat, setShowHeartbeat] = useState(true);
  const [timelineFilter, setTimelineFilter] = useState("all");

  const heartbeatStats = useMemo(() => {
    const active = automation.heartbeats.filter((heartbeat) => heartbeat.status === "active").length;
    return {
      active,
      paused: automation.heartbeats.length - active,
    };
  }, [automation.heartbeats]);

  const selectedJob = automation.cronJobs.find((job) => job.id === selectedJobId);

  const toggleJob = (jobId: string) => {
    const isStaged = stagedEntities.includes(jobId);
    onStageChange(jobId, !isStaged);
  };

  const filteredHistory = automation.runHistory.filter((entry) =>
    timelineFilter === "all" ? true : entry.status === timelineFilter
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Automation Center</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Manage heartbeats and cron automations with clear delivery previews.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <div className="rounded border border-[var(--border)] px-3 py-2">
            Active heartbeats: <span className="font-semibold">{heartbeatStats.active}</span>
          </div>
          <div className="rounded border border-[var(--border)] px-3 py-2">
            Cron jobs: <span className="font-semibold">{automation.cronJobs.length}</span>
          </div>
        </div>
      </header>

      <div className="rounded border border-[var(--border)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <p className="text-sm font-semibold">Heartbeats</p>
          <button className="text-xs text-[var(--accent)]" onClick={() => setShowHeartbeat((prev) => !prev)}>
            {showHeartbeat ? "Collapse" : "Expand"}
          </button>
        </div>
        {showHeartbeat && (
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {automation.heartbeats.map((heartbeat) => (
              <div key={heartbeat.agentId} className="rounded border border-[var(--border)] p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{heartbeat.agentId}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      heartbeat.status === "active"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-rose-500/20 text-rose-200"
                    }`}
                  >
                    {heartbeat.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{heartbeat.promptSnippet}</p>
                <div className="mt-3 flex justify-between text-xs text-[var(--text-muted)]">
                  <span>{heartbeat.cadence}</span>
                  <span>Next: {heartbeat.nextRun}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded border border-[var(--border)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
            <p className="text-sm font-semibold">Cron timeline</p>
            <select
              value={timelineFilter}
              onChange={(event) => setTimelineFilter(event.target.value)}
              className="rounded border border-[var(--border)] bg-transparent px-3 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {automation.cronJobs.map((job) => (
              <button
                key={job.id}
                className={`w-full px-4 py-3 text-left text-sm transition hover:bg-[var(--bg-elevated)] ${
                  job.id === selectedJobId ? "bg-[var(--bg-elevated)]" : ""
                }`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{job.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{job.schedule}</p>
                  </div>
                  <div className="text-right text-xs text-[var(--text-muted)]">
                    <p>Next: {job.nextRun}</p>
                    <span
                      className={`rounded-full px-2 py-1 ${
                        job.status === "enabled"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {selectedJob && (
            <div className="rounded border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
                    Job detail
                  </p>
                  <h3 className="text-lg font-semibold">{selectedJob.label}</h3>
                </div>
                <button
                  className="text-xs text-[var(--accent)]"
                  onClick={() => toggleJob(selectedJob.id)}
                >
                  {stagedEntities.includes(selectedJob.id) ? "Unstage" : "Stage edits"}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <Detail label="Schedule" value={selectedJob.schedule} />
                <Detail label="Delivery" value={selectedJob.delivery} />
                <Detail label="Session target" value={selectedJob.sessionTarget} />
                <Detail label="Last run" value={selectedJob.lastRunState} />
              </div>
              <div className="mt-4 flex gap-2 text-xs">
                <button className="flex-1 rounded border border-[var(--border)] px-3 py-2">
                  Run now
                </button>
                <button className="flex-1 rounded border border-[var(--border)] px-3 py-2">
                  Pause
                </button>
              </div>
            </div>
          )}

          <div className="rounded border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Run history</p>
            <div className="mt-3 space-y-3">
              {filteredHistory.map((entry) => (
                <div key={entry.id} className="rounded border border-[var(--border)] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{entry.jobId}</p>
                    <span className="text-xs text-[var(--text-muted)]">{entry.ranAt}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{entry.logExcerpt}</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-1 text-xs ${
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
      </div>
    </div>
  );
}

type DetailProps = {
  label: string;
  value: string;
};

function Detail({ label, value }: DetailProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
