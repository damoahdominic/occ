import fs from "fs";
import os from "os";
import path from "path";

export type Persona = {
  id: string;
  title: string;
  summary: string;
};

export type Principle = {
  id: string;
  title: string;
  detail: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  workspace: string;
  isDefault: boolean;
  status: "healthy" | "attention";
  heartbeat: {
    status: "active" | "paused";
    cadence: string;
    nextRun: string;
    preview: string;
  };
  overview: {
    model: string;
    channels: string[];
    cronJobs: number;
    heartbeatsPerDay: number;
  };
  files: {
    identityPath: string;
    soulPath: string;
    heartbeatPath: string;
  };
  notes: string;
};

export type RoutingBinding = {
  id: string;
  channel: string;
  account: string;
  scope: string;
  agentId: string;
  precedence: string;
  status: "healthy" | "overlap" | "missing";
};

export type RoutingSummary = {
  bindings: RoutingBinding[];
  conflicts: {
    id: string;
    description: string;
    affectedScopes: string[];
  }[];
  precedenceNotes: string[];
  broadcastGroups: {
    id: string;
    name: string;
    members: string[];
  }[];
};

export type ChannelAccount = {
  id: string;
  title: string;
  status: "connected" | "needs-relink";
  lastProbe: string;
  policies: {
    dmPolicy: string;
    groupPolicy?: string;
    allowList?: string[];
    mentionRequired?: boolean;
  };
  overrides: {
    id: string;
    label: string;
    agentId: string;
    inherited: boolean;
  }[];
  advanced: string[];
};

export type ChannelSummary = {
  channel: string;
  description: string;
  accounts: ChannelAccount[];
};

export type HeartbeatSummary = {
  agentId: string;
  status: "active" | "paused";
  cadence: string;
  promptSnippet: string;
  nextRun: string;
};

export type CronJobSummary = {
  id: string;
  label: string;
  schedule: string;
  delivery: string;
  status: "enabled" | "paused";
  sessionTarget: string;
  nextRun: string;
  lastRunState: "success" | "failed" | "skipped";
};

export type AutomationSummary = {
  heartbeats: HeartbeatSummary[];
  cronJobs: CronJobSummary[];
  runHistory: {
    id: string;
    jobId: string;
    ranAt: string;
    status: string;
    logExcerpt: string;
  }[];
};

export type DoctorSummary = {
  status: "healthy" | "warning" | "error";
  lastRun: string;
  pendingMigrations: string[];
  log: string[];
};

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  status: "ok" | "attention";
  notes: string;
};

export type MaintenanceSummary = {
  doctor: DoctorSummary;
  plugins: PluginSummary[];
};

export type CommandHistoryEntry = {
  id: string;
  command: string;
  status: "success" | "failed" | "running";
  timestamp: string;
  output: string;
};

export type ControlCenterData = {
  personas: Persona[];
  principles: Principle[];
  agents: AgentSummary[];
  routing: RoutingSummary;
  channels: ChannelSummary[];
  automation: AutomationSummary;
  maintenance: MaintenanceSummary;
  commandHistory: CommandHistoryEntry[];
};

function readOpenClawConfig(configPathOverride?: string) {
  const configPath =
    configPathOverride ??
    process.env.OPENCLAW_CONFIG_PATH ??
    path.join(os.homedir(), ".openclaw", "openclaw.json");

  try {
    const contents = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(contents);
  } catch (error) {
    console.warn("Control Center: unable to read openclaw config", error);
    return null;
  }
}

function toIso(date: Date) {
  return date.toISOString();
}

export function getControlCenterData(configPathOverride?: string): ControlCenterData {
  const rawConfig = readOpenClawConfig(configPathOverride);
  const agents = rawConfig?.agents?.list ?? [];
  const defaultWorkspace = rawConfig?.agents?.defaults?.workspace ?? "";
  const defaultModel = rawConfig?.agents?.defaults?.model?.primary ?? "openai/gpt-4.1";

  const personaList: Persona[] = [
    {
      id: "systems-steward",
      title: "Systems Steward",
      summary:
        "Keeps the multi-agent fleet honest. Needs quick state of routing, restarts, and heartbeat drift.",
    },
    {
      id: "automation-strategist",
      title: "Automation Strategist",
      summary:
        "Designs cron cadences and delivery flows. Obsessed with timing clarity and conflict detection.",
    },
    {
      id: "channel-lead",
      title: "Channel Lead",
      summary:
        "Owns compliance per surface. Needs rapid overrides when accounts misbehave.",
    },
    {
      id: "plugin-maintainer",
      title: "Plugin Maintainer",
      summary:
        "Validates doctor runs, plugin drift, and integration health before rollouts.",
    },
  ];

  const principleList: Principle[] = [
    {
      id: "truth",
      title: "Schema truthfulness",
      detail: "UI mirrors ~/.openclaw/openclaw.json. No phantom settings.",
    },
    {
      id: "precedence",
      title: "Precedence clarity",
      detail: "Every binding explains how it beats the others.",
    },
    {
      id: "safe",
      title: "Safe operations",
      detail: "Show validation + restart guardrails before writes.",
    },
    {
      id: "assist",
      title: "Assistive power",
      detail: "Inline console for surgical fixes without context switching.",
    },
  ];

  const agentSummaries: AgentSummary[] = agents.map((agent: any, index: number) => {
    const workspace = agent.workspace ?? defaultWorkspace ?? "";
    const cadence = index === 0 ? "30m" : index % 2 === 0 ? "2h" : "paused";
    const heartbeatStatus: "active" | "paused" = cadence === "paused" ? "paused" : "active";

    return {
      id: agent.id,
      name: agent.identity?.name ?? agent.id,
      workspace,
      isDefault: Boolean(agent.default),
      status: index === 0 ? "healthy" : index === 1 ? "attention" : "healthy",
      heartbeat: {
        status: heartbeatStatus,
        cadence: heartbeatStatus === "active" ? cadence : "—",
        nextRun:
          heartbeatStatus === "active"
            ? toIso(new Date(Date.now() + (index + 1) * 15 * 60 * 1000))
            : "Not scheduled",
        preview: `Monitoring ${agent.identity?.name ?? agent.id} inbox + cron surfaces`,
      },
      overview: {
        model: agent.models?.primary ?? defaultModel,
        channels: Object.keys(rawConfig?.channels ?? { whatsapp: true }),
        cronJobs: index + 2,
        heartbeatsPerDay: heartbeatStatus === "active" ? 48 - index * 4 : 0,
      },
      files: {
        identityPath: path.join(workspace, "IDENTITY.md"),
        soulPath: path.join(workspace, "SOUL.md"),
        heartbeatPath: path.join(workspace, "HEARTBEAT.md"),
      },
      notes:
        index === 1
          ? "Missing HEARTBEAT prompt, last run 18h ago."
          : "Aligned with defaults",
    };
  });

  const routingSummary: RoutingSummary = {
    bindings: [
      {
        id: "whatsapp-default",
        channel: "WhatsApp",
        account: "Primary",
        scope: "DM + Groups",
        agentId: agentSummaries[0]?.id ?? "main",
        precedence: "channel",
        status: "healthy",
      },
      {
        id: "whatsapp-priority",
        channel: "WhatsApp",
        account: "Boss",
        scope: "+233***",
        agentId: agentSummaries[1]?.id ?? "cody",
        precedence: "peer",
        status: "overlap",
      },
      {
        id: "discord-default",
        channel: "Discord",
        account: "Guild · Ops",
        scope: "#routing-alerts",
        agentId: agentSummaries[2]?.id ?? "eraya",
        precedence: "channel",
        status: "missing",
      },
    ],
    conflicts: [
      {
        id: "conflict-1",
        description: "Boss DM scope overlaps routing default for WhatsApp.",
        affectedScopes: [
          "+233545***",
          "WhatsApp Default",
        ],
      },
    ],
    precedenceNotes: [
      "Peer overrides beat channel defaults.",
      "Missing global fallback agent for Discord guild.",
    ],
    broadcastGroups: [
      {
        id: "exec-brief",
        name: "Executive Brief",
        members: [agentSummaries[0]?.id ?? "main", agentSummaries[3]?.id ?? "jonathan"],
      },
      {
        id: "alerts",
        name: "Routing Alerts",
        members: [agentSummaries[2]?.id ?? "eraya"],
      },
    ],
  };

  const channelsConfig = rawConfig?.channels ?? {};
  const channelSummaries: ChannelSummary[] = Object.entries(channelsConfig).map(
    ([channelKey, channelValue]: [string, any]) => {
      const baseAccount: ChannelAccount = {
        id: `${channelKey}-primary`,
        title: `${channelKey} · Primary`,
        status: "connected",
        lastProbe: rawConfig?.meta?.lastTouchedAt ?? toIso(new Date()),
        policies: {
          dmPolicy: channelValue.dmPolicy ?? "allow",
          groupPolicy: channelValue.groupPolicy,
          allowList: channelValue.allowFrom ?? [],
          mentionRequired: channelValue.mentionRequired ?? false,
        },
        overrides: [
          {
            id: `${channelKey}-ops`,
            label: "Ops Escalations",
            agentId: agentSummaries[0]?.id ?? "main",
            inherited: false,
          },
        ],
        advanced: [
          channelValue.selfChatMode ? "Self-chat enabled" : "Self-chat disabled",
          channelValue.mediaMaxMb
            ? `Media max ${channelValue.mediaMaxMb}MB`
            : "Default media policy",
        ],
      };

      return {
        channel: channelKey,
        description: `${channelKey} surface configuration`,
        accounts: [baseAccount],
      };
    }
  );

  if (channelSummaries.length === 0) {
    channelSummaries.push({
      channel: "whatsapp",
      description: "WhatsApp surface configuration",
      accounts: [
        {
          id: "whatsapp-primary",
          title: "WhatsApp · Primary",
          status: "connected",
          lastProbe: toIso(new Date()),
          policies: {
            dmPolicy: "allowlist",
            allowList: ["+233***"],
          },
          overrides: [],
          advanced: ["Self-chat disabled"],
        },
      ],
    });
  }

  const automationSummary: AutomationSummary = {
    heartbeats: agentSummaries.map((agent) => ({
      agentId: agent.id,
      status: agent.heartbeat.status,
      cadence: agent.heartbeat.cadence,
      promptSnippet: agent.heartbeat.preview,
      nextRun: agent.heartbeat.nextRun,
    })),
    cronJobs: [
      {
        id: "cron-brief",
        label: "Boss Morning Brief",
        schedule: "0 6 * * 1-5",
        delivery: "WhatsApp · Boss",
        status: "enabled",
        sessionTarget: "isolated",
        nextRun: toIso(new Date(Date.now() + 2 * 60 * 60 * 1000)),
        lastRunState: "success",
      },
      {
        id: "cron-heartbeat-audit",
        label: "Heartbeat Drift Audit",
        schedule: "every 4h",
        delivery: "Console",
        status: "paused",
        sessionTarget: "main",
        nextRun: "—",
        lastRunState: "skipped",
      },
    ],
    runHistory: [
      {
        id: "run-1",
        jobId: "cron-brief",
        ranAt: toIso(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        status: "success",
        logExcerpt: "Delivered summary to Boss (WhatsApp).",
      },
      {
        id: "run-2",
        jobId: "cron-heartbeat-audit",
        ranAt: toIso(new Date(Date.now() - 6 * 60 * 60 * 1000)),
        status: "skipped",
        logExcerpt: "Paused job skipped run.",
      },
    ],
  };

  const maintenanceSummary: MaintenanceSummary = {
    doctor: {
      status: "warning",
      lastRun: rawConfig?.wizard?.lastRunAt ?? toIso(new Date(Date.now() - 4 * 60 * 60 * 1000)),
      pendingMigrations: ["Sync workspace metadata", "Clean legacy bindings"],
      log: [
        "[10:02] Doctor detected drift in bindings array.",
        "[10:04] Suggested running openclaw bindings lint.",
      ],
    },
    plugins: Object.entries(rawConfig?.plugins?.entries ?? {}).map(
      ([pluginId, pluginValue]: [string, any]) => ({
        id: pluginId,
        name: pluginId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        version: pluginValue.version ?? "1.x",
        enabled: pluginValue.enabled ?? false,
        status: pluginValue.enabled ? "ok" : "attention",
        notes: pluginValue.enabled ? "Ready" : "Disabled",
      })
    ),
  };

  if (maintenanceSummary.plugins.length === 0) {
    maintenanceSummary.plugins.push({
      id: "voice-call",
      name: "Voice Call",
      version: "1.x",
      enabled: true,
      status: "ok",
      notes: "Using mock config",
    });
  }

  const commandHistory: CommandHistoryEntry[] = [
    {
      id: "cmd-1",
      command: "openclaw doctor --non-interactive",
      status: "success",
      timestamp: toIso(new Date(Date.now() - 60 * 60 * 1000)),
      output: "Doctor completed with warnings.",
    },
    {
      id: "cmd-2",
      command: "openclaw cron list --json",
      status: "failed",
      timestamp: toIso(new Date(Date.now() - 30 * 60 * 1000)),
      output: "Gateway offline while fetching cron jobs.",
    },
  ];

  return {
    personas: personaList,
    principles: principleList,
    agents: agentSummaries,
    routing: routingSummary,
    channels: channelSummaries,
    automation: automationSummary,
    maintenance: maintenanceSummary,
    commandHistory,
  };
}
