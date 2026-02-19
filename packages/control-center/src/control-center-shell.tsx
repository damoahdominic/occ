"use client";

import { useMemo } from "react";
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

  const suggested = [
    {
      label: "Verify WhatsApp",
      status: summary.connectedChannels > 0 ? "good" : "warn",
      note: summary.connectedChannels > 0 ? "Ready" : "Pending",
    },
    {
      label: "Add backup channel",
      status: summary.channelCount > 1 ? "good" : "warn",
      note: summary.channelCount > 1 ? "Configured" : "Recommended",
    },
    {
      label: "Enable daily check-ins",
      status: summary.activeJobs > 0 ? "good" : "bad",
      note: summary.activeJobs > 0 ? "Enabled" : "Not set",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-[1440px] px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <div className="text-xl font-semibold tracking-tight">OpenClaw Configure</div>
          </div>
          <div className="rounded-full bg-[var(--bg-card)] px-4 py-2 text-xs uppercase text-[var(--text-muted)]">
            Onboarding · Friendly mode
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[2.1fr_1fr]">
          <section className="rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
            <h1 className="text-3xl font-semibold">Get your Control Center ready in minutes</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Follow the guided steps below. We’ll handle the heavy lifting and show you what’s ready,
              what needs attention, and what you can skip for now.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <h4 className="text-sm font-semibold">Connect a channel</h4>
                <span className="mt-1 text-xs text-[var(--text-muted)]">
                  Let OpenClaw talk to you on WhatsApp, Telegram, or Slack.
                </span>
                <div className="mt-auto rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-xs font-semibold text-black">
                  Start channel setup
                </div>
              </div>
              <div className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <h4 className="text-sm font-semibold">Add your first agent</h4>
                <span className="mt-1 text-xs text-[var(--text-muted)]">
                  Choose a role or a template. No code required.
                </span>
                <div className="mt-auto rounded-lg bg-gradient-to-r from-[#9d7bff] to-[#6ee7ff] px-3 py-2 text-center text-xs font-semibold text-black">
                  Create agent
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-[var(--bg-elevated)] p-4">
              {[
                {
                  title: "Pick your assistants",
                  meta: "(2 mins)",
                  body: "Add roles, names, and access levels.",
                },
                {
                  title: "Connect channels",
                  meta: "(3 mins)",
                  body: "WhatsApp, Telegram, Slack, or Email.",
                },
                {
                  title: "Automation",
                  meta: "(5 mins)",
                  body: "Schedule reminders and background checks.",
                },
              ].map((step, index) => (
                <div
                  key={step.title}
                  className={`flex items-center gap-3 rounded-xl p-3 ${
                    index > 0 ? "mt-3 bg-[var(--bg-card)]" : ""
                  }`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#242c40] text-xs font-semibold text-[var(--accent)]">
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      {step.title} <span className="text-xs text-[var(--text-muted)]">{step.meta}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{step.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
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
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl bg-[var(--bg-card)] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
              <h3 className="text-base font-semibold">Overview</h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Agents</span>
                  <span className="rounded-full bg-[#2a3145] px-2 py-1 text-[var(--text-muted)]">
                    {summary.agentCount} ready
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Channels</span>
                  <span className="rounded-full bg-[#2a3145] px-2 py-1 text-[var(--text-muted)]">
                    {summary.connectedChannels} connected
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Automation</span>
                  <span className="rounded-full bg-[#2a3145] px-2 py-1 text-[var(--text-muted)]">
                    {summary.activeJobs} active
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Maintenance</span>
                  <span className="rounded-full bg-[#2a3145] px-2 py-1 text-[var(--text-muted)]">
                    {summary.doctorStatus === "healthy" ? "Up to date" : "Needs review"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--bg-card)] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
              <h3 className="text-base font-semibold">Now Suggested</h3>
              <div className="mt-3 space-y-2 text-xs">
                {suggested.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2"
                  >
                    <span>{item.label}</span>
                    <span
                      className={`font-semibold ${
                        item.status === "good"
                          ? "text-emerald-400"
                          : item.status === "warn"
                          ? "text-amber-300"
                          : "text-rose-400"
                      }`}
                    >
                      {item.note}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--bg-card)] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
              <h3 className="text-base font-semibold">Maintenance</h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Gateway status</span>
                  <span className="text-emerald-400">Online</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Updates</span>
                  <span className="text-amber-300">1 available</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2">
                  <span>Last backup</span>
                  <span className="rounded-full bg-[#2a3145] px-2 py-1 text-[var(--text-muted)]">Today</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-[var(--bg-card)] p-4">
            <h4 className="text-sm font-semibold">Agents</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Guided roles: Executive, Ops, Research, Customer Support.
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Templates</span>
              <span className="text-emerald-400">6</span>
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--bg-card)] p-4">
            <h4 className="text-sm font-semibold">Channels</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              One-click pairing + QR scan, with friendly copy.
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Connected</span>
              <span className="text-amber-300">
                {summary.connectedChannels}/{summary.channelCount}
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--bg-card)] p-4">
            <h4 className="text-sm font-semibold">Automation</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Simple language: “Check inbox at 9am”.
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Rules</span>
              <span className="text-rose-400">{summary.activeJobs}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--bg-card)] p-4">
            <h4 className="text-sm font-semibold">Maintenance</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Status indicators for health, updates, backups.
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Health</span>
              <span className="text-emerald-400">
                {summary.doctorStatus === "healthy" ? "OK" : "Needs review"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
