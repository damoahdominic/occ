"use client";

import { useMemo, useState } from "react";
import type { ChannelSummary } from "../data";

type Props = {
  channels: ChannelSummary[];
  stagedEntities: string[];
  onStageChange: (entityId: string, staged: boolean) => void;
};

export function ChannelControlsPanel({ channels, stagedEntities, onStageChange }: Props) {
  const [activeChannel, setActiveChannel] = useState(channels[0]?.channel ?? "");
  const [probeLog, setProbeLog] = useState<string[]>([]);

  const channelState = useMemo(() => {
    const map: Record<string, ChannelSummary["accounts"]> = {};
    channels.forEach((channel) => {
      map[channel.channel] = channel.accounts;
    });
    return map;
  }, [channels]);

  const handlePolicyChange = (
    channelKey: string,
    accountId: string,
    field: "dmPolicy" | "groupPolicy" | "mentionRequired",
    value: string | boolean
  ) => {
    onStageChange(`${channelKey}-${accountId}`, true);
    const message = `Field ${field} updated to ${value}`;
    setProbeLog((log) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...log].slice(0, 5));
  };

  const runProbe = (channelKey: string, accountId: string) => {
    setProbeLog((log) => [
      `[${new Date().toLocaleTimeString()}] Probing ${channelKey} / ${accountId}...`,
      "Probe healthy (latency 412ms)",
      ...log,
    ]);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Channel Controls</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Channel policy guardrails and override workflows per account.
          </p>
        </div>
        <div className="flex gap-2">
          {channels.map((channel) => (
            <button
              key={channel.channel}
              className={`rounded px-3 py-2 text-sm ${
                activeChannel === channel.channel
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
              }`}
              onClick={() => setActiveChannel(channel.channel)}
            >
              {channel.channel}
            </button>
          ))}
        </div>
      </header>

      {channels
        .filter((channel) => channel.channel === activeChannel)
        .map((channel) => (
          <div key={channel.channel} className="space-y-4">
            {channel.accounts.map((account) => {
              const staged = stagedEntities.includes(`${channel.channel}-${account.id}`);
              return (
                <div
                  key={account.id}
                  className="rounded border border-[var(--border)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{account.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Last probe {account.lastProbe}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          account.status === "connected"
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-amber-500/20 text-amber-200"
                        }`}
                      >
                        {account.status === "connected" ? "Connected" : "Needs relink"}
                      </span>
                      {staged && <span className="text-amber-200">Staged</span>}
                      <button
                        className="rounded border border-[var(--border)] px-3 py-1"
                        onClick={() => runProbe(channel.channel, account.id)}
                      >
                        Probe account
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>DM policy</span>
                      <select
                        value={account.policies.dmPolicy}
                        onChange={(event) =>
                          handlePolicyChange(
                            channel.channel,
                            account.id,
                            "dmPolicy",
                            event.target.value
                          )
                        }
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
                      >
                        <option value="allow">Allow all</option>
                        <option value="allowlist">Allowlist</option>
                        <option value="deny">Deny</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Group policy</span>
                      <select
                        value={account.policies.groupPolicy ?? "inherit"}
                        onChange={(event) =>
                          handlePolicyChange(
                            channel.channel,
                            account.id,
                            "groupPolicy",
                            event.target.value
                          )
                        }
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow all</option>
                        <option value="allowlist">Allowlist</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(account.policies.mentionRequired)}
                        onChange={(event) =>
                          handlePolicyChange(
                            channel.channel,
                            account.id,
                            "mentionRequired",
                            event.target.checked
                          )
                        }
                      />
                      Require mentions before agent replies
                    </label>
                  </div>

                  {account.policies.allowList && account.policies.allowList.length > 0 && (
                    <div className="mt-4 text-sm">
                      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        Allowlist
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {account.policies.allowList.map((entry) => (
                          <span
                            key={entry}
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                          >
                            {entry}
                          </span>
                        ))}
                        <button
                          className="rounded border border-dashed border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
                          onClick={() =>
                            handlePolicyChange(channel.channel, account.id, "dmPolicy", "allowlist")
                          }
                        >
                          + Add entry
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      Overrides
                    </p>
                    <div className="mt-2 space-y-2 text-sm">
                      {account.overrides.map((override) => (
                        <div
                          key={override.id}
                          className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold">{override.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Routed to {override.agentId}
                            </p>
                          </div>
                          <button className="text-xs text-[var(--accent)]">Edit</button>
                        </div>
                      ))}
                      <button className="text-xs text-[var(--accent)]">+ Add override</button>
                    </div>
                  </div>

                  <div className="mt-4 rounded border border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
                    Advanced: {account.advanced.join(" · ")}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      <div className="rounded border border-[var(--border)] p-4">
        <p className="text-sm font-semibold">Probe log</p>
        <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
          {probeLog.length === 0 && <p>No probes executed this session.</p>}
          {probeLog.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
