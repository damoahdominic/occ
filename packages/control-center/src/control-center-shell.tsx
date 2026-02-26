"use client";

import { useMemo, useState } from "react";
import type { ControlCenterData } from "./data";

type StatChip = {
  label: string;
  status: "good" | "warn" | "accent" | "bad";
};

const statusStyles: Record<StatChip["status"], string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  accent: "bg-[var(--accent)]",
  bad: "bg-rose-500",
};

export function ControlCenterShell({ data }: { data: ControlCenterData }) {
  const [activeTab, setActiveTab] = useState<"overview" | "pairing" | "security" | "troubleshoot">(
    "overview"
  );
  const [activeChannel, setActiveChannel] = useState(0);

  const vscode =
    typeof window !== "undefined" && "acquireVsCodeApi" in window
      ? (window as unknown as { acquireVsCodeApi: () => { postMessage: Function } }).acquireVsCodeApi()
      : null;

  const post = (command: string, payload?: Record<string, unknown>) => {
    vscode?.postMessage({ command, ...(payload ?? {}) });
  };

  const summary = useMemo(() => {
    const agentCount = data.agents.length;
    const channelCount = data.channels.length;
    const connectedChannels = data.channels.filter((channel) =>
      channel.accounts.some((account) => account.status === "connected")
    ).length;
    const activeJobs = data.automation.cronJobs.filter((job) => job.status === "enabled").length;
    const doctorStatus = data.maintenance.doctor.status;

    const chips: StatChip[] = [
      {
        label: doctorStatus === "healthy" ? "System healthy" : "System needs attention",
        status: doctorStatus === "healthy" ? "good" : doctorStatus === "warning" ? "warn" : "bad",
      },
      {
        label: `${channelCount - connectedChannels} channels pending`,
        status: channelCount - connectedChannels > 0 ? "warn" : "good",
      },
      {
        label: `${agentCount} active agents`,
        status: "accent",
      },
    ];

    return {
      agentCount,
      channelCount,
      connectedChannels,
      activeJobs,
      doctorStatus,
      chips,
    };
  }, [data]);

  const tabs: { id: "overview" | "pairing" | "security" | "troubleshoot"; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "pairing", label: "Pairing" },
    { id: "security", label: "Security" },
    { id: "troubleshoot", label: "Troubleshoot" },
  ];

  const channels = data.channels;
  const currentChannel = channels[activeChannel];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-[1440px] px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <div className="text-xl font-semibold tracking-tight">Channel Manager</div>
          </div>
          <div className="rounded-full bg-[var(--bg-card)] px-4 py-2 text-xs uppercase text-[var(--text-muted)]">
            Friendly mode · No JSON needed
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1.7fr_1fr]">
          <aside className="rounded-2xl bg-[var(--bg-card)] p-4 shadow-[0_16px_32px_rgba(0,0,0,0.35)]">
            <div className="text-xs uppercase text-[var(--text-muted)]">Control Center</div>
            <nav className="mt-4 space-y-2 text-sm">
              {["Dashboard", "Agents", "Channels", "Automation", "Maintenance"].map((item) => (
                <div
                  key={item}
                  className={`rounded-xl px-3 py-2 ${
                    item === "Channels"
                      ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {item}
                </div>
              ))}
            </nav>
            <div className="mt-6 rounded-xl bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
              {summary.connectedChannels}/{summary.channelCount} channels connected
            </div>
          </aside>

          <section className="rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Channels</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Add, pair, and secure your communication channels with guided steps.
                </p>
              </div>
              <button
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black"
                onClick={() => post("openclaw.channelAdd")}
              >
                Add channel
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {channels.map((channel, index) => {
                const connected = channel.accounts.some((account) => account.status === "connected");
                const needsReview = channel.accounts.some((account) => account.status === "needs-relink");
                const status = connected ? "Connected" : needsReview ? "Needs review" : "Not connected";
                const chipStyle = connected
                  ? "bg-emerald-500"
                  : needsReview
                  ? "bg-amber-400"
                  : "bg-rose-500";

                return (
                  <button
                    key={channel.channel}
                    onClick={() => setActiveChannel(index)}
                    className={`w-full rounded-2xl border border-[var(--border)] p-4 text-left transition ${
                      index === activeChannel ? "bg-[var(--bg-elevated)]" : "bg-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold capitalize">{channel.channel}</div>
                        <div className="text-xs text-[var(--text-muted)]">{channel.description}</div>
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-xs">
                        <span className={`h-2 w-2 rounded-full ${chipStyle}`} />
                        <span>{status}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                      {channel.accounts.map((account) => (
                        <span
                          key={account.id}
                          className="rounded-full bg-[var(--bg-card)] px-3 py-1"
                        >
                          {account.title}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Quick pairing steps</span>
                <span className="text-xs text-[var(--text-muted)]">Add → Pair → Assign → Secure</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-[var(--text-muted)]">
                <div className="rounded-xl bg-[var(--bg-card)] px-3 py-2">1. Choose a channel</div>
                <div className="rounded-xl bg-[var(--bg-card)] px-3 py-2">2. Pair or sign in</div>
                <div className="rounded-xl bg-[var(--bg-card)] px-3 py-2">3. Assign agents</div>
                <div className="rounded-xl bg-[var(--bg-card)] px-3 py-2">4. Set security defaults</div>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl bg-[var(--bg-card)] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold capitalize">{currentChannel?.channel ?? "Channel"}</div>
                <div className="text-xs text-[var(--text-muted)]">Channel details</div>
              </div>
              <button
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-[11px] text-[var(--text-muted)]"
                onClick={() => post("openclaw.channelAdd")}
              >
                Pair channel
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-3 py-1 text-[11px] ${
                    tab.id === activeTab
                      ? "bg-[var(--accent)] text-black"
                      : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3 text-xs text-[var(--text-muted)]">
              {activeTab === "overview" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Status</div>
                    <div className="mt-1 text-xs">
                      {currentChannel?.accounts.some((account) => account.status === "connected")
                        ? "Connected and ready"
                        : "Not connected"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Paired device</div>
                    <div className="mt-1 text-xs">Primary account</div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Last activity</div>
                    <div className="mt-1 text-xs">Last checked a few minutes ago</div>
                  </div>
                </div>
              )}

              {activeTab === "pairing" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Pairing</div>
                    <div className="mt-1 text-xs">
                      Start pairing to connect this channel. A QR code or token will appear in the
                      terminal.
                    </div>
                    <button
                      className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-black"
                      onClick={() => post("openclaw.channelAdd")}
                    >
                      Start pairing
                    </button>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Re-pair warning</div>
                    <div className="mt-1 text-xs">Re-pairing disconnects the existing device.</div>
                  </div>
                </div>
              )}

              {activeTab === "security" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Approvals</div>
                    <div className="mt-1 text-xs">Default to pairing approvals for DMs.</div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">External messaging</div>
                    <div className="mt-1 text-xs">Keep groups allowlisted to stay safe.</div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Quiet hours</div>
                    <div className="mt-1 text-xs">Recommended for off-hours.</div>
                  </div>
                </div>
              )}

              {activeTab === "troubleshoot" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Checklist</div>
                    <div className="mt-1 text-xs">Reconnect, check permissions, confirm device.</div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
                    <div className="text-sm font-semibold text-[var(--text)]">Run health check</div>
                    <div className="mt-1 text-xs">Use the command console for diagnostics.</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {summary.chips.map((chip) => (
            <div
              key={chip.label}
              className="flex items-center gap-2 rounded-full bg-[var(--bg-elevated)] px-3 py-2 text-xs"
            >
              <span className={`h-2 w-2 rounded-full ${statusStyles[chip.status]}`} />
              <span>{chip.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
