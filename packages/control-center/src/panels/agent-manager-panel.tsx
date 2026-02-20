"use client";

import { useMemo, useState } from "react";
import type { AgentSummary } from "../data";

const tabs = ["Overview", "Identity", "Models / Tools", "Heartbeat"] as const;

type AgentFormState = {
  workspace: string;
  model: string;
  heartbeatPrompt: string;
  heartbeatCadence: string;
  toolAccess: Record<string, boolean>;
  identityDraft: string;
  soulDraft: string;
  heartbeatDraft: string;
  dirty: boolean;
};

type Props = {
  agents: AgentSummary[];
  stagedEntities: string[];
  onStageChange: (entityId: string, staged: boolean) => void;
  onApply: () => void;
  onCommandPrefill: (command: string) => void;
};

const defaultTools = [
  "web-search",
  "web-fetch",
  "exec",
  "browser",
  "voice-call",
];

export function AgentManagerPanel({
  agents,
  stagedEntities,
  onStageChange,
  onApply,
  onCommandPrefill,
}: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  const initialForms = useMemo(() => {
    const map: Record<string, AgentFormState> = {};
    agents.forEach((agent) => {
      map[agent.id] = {
        workspace: agent.workspace,
        model: agent.overview.model,
        heartbeatPrompt: agent.heartbeat.preview,
        heartbeatCadence: agent.heartbeat.cadence === "—" ? "30m" : agent.heartbeat.cadence,
        toolAccess: defaultTools.reduce<Record<string, boolean>>((acc, tool) => {
          acc[tool] = true;
          return acc;
        }, {}),
        identityDraft: `# ${agent.name}\n\n${agent.notes}`,
        soulDraft: "Guiding principles go here...",
        heartbeatDraft: agent.heartbeat.preview,
        dirty: false,
      };
    });
    return map;
  }, [agents]);

  const [formState, setFormState] = useState<Record<string, AgentFormState>>(initialForms);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedForm = selectedAgent ? formState[selectedAgent.id] : undefined;

  const updateForm = (agentId: string, updater: (draft: AgentFormState) => AgentFormState) => {
    setFormState((current) => {
      const next = { ...current };
      next[agentId] = updater(current[agentId]);
      const dirty = JSON.stringify(next[agentId]) !== JSON.stringify(initialForms[agentId]);
      next[agentId].dirty = dirty;
      onStageChange(agentId, dirty);
      return next;
    });
  };

  const stageCount = stagedEntities.filter((id) => agents.some((agent) => agent.id === id)).length;

  const wizardSteps = [
    {
      title: "Basics",
      description: "Define agent id, persona, workspace.",
    },
    {
      title: "Workspace Template",
      description: "Pick base repo with SOUL/IDENTITY seeds.",
    },
    {
      title: "Models",
      description: "Choose primary + fallback models.",
    },
    {
      title: "Channels & Heartbeat",
      description: "Set default channels and heartbeat cadence.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Agent Manager</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Select an agent to inspect workspace, heartbeat, and identity files.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            onClick={() => {
              setShowWizard(true);
              setWizardStep(0);
            }}
          >
            Add / Clone Agent
          </button>
          <button
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            onClick={() => onCommandPrefill(`openclaw agents list --json`)}
          >
            Prefill CLI
          </button>
        </div>
      </div>

      {showWizard && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
                Agent Wizard
              </p>
              <h3 className="text-lg font-semibold">{wizardSteps[wizardStep].title}</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {wizardSteps[wizardStep].description}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((step) => Math.max(step - 1, 0))}
                className="rounded border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
              >
                Back
              </button>
              {wizardStep < wizardSteps.length - 1 ? (
                <button
                  onClick={() => setWizardStep((step) => Math.min(step + 1, wizardSteps.length - 1))}
                  className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-black"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={() => setShowWizard(false)}
                  className="rounded border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm text-black"
                >
                  Finish
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 h-2 rounded bg-[var(--bg-card)]">
            <div
              className="h-full rounded bg-[var(--accent)]"
              style={{ width: `${((wizardStep + 1) / wizardSteps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          {agents.map((agent) => {
            const isSelected = agent.id === selectedAgent?.id;
            const isDirty = stagedEntities.includes(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full rounded border px-3 py-3 text-left ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{agent.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{agent.workspace}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      agent.status === "healthy"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {agent.status === "healthy" ? "Healthy" : "Attention"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>
                    HB: {agent.heartbeat.status === "active" ? agent.heartbeat.cadence : "Paused"}
                  </span>
                  {isDirty && <span className="text-amber-300">Unsaved edits</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`rounded px-3 py-2 text-sm ${
                  activeTab === tab
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {selectedAgent && selectedForm && (
            <div className="space-y-6">
              {activeTab === "Overview" && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Workspace</span>
                      <input
                        value={selectedForm.workspace}
                        onChange={(event) =>
                          updateForm(selectedAgent.id, (draft) => ({
                            ...draft,
                            workspace: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Default model</span>
                      <input
                        value={selectedForm.model}
                        onChange={(event) =>
                          updateForm(selectedAgent.id, (draft) => ({
                            ...draft,
                            model: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="rounded border border-[var(--border)] p-4">
                    <p className="text-sm font-semibold">Stats</p>
                    <div className="mt-2 grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-2xl font-semibold">{selectedAgent.overview.cronJobs}</p>
                        <p className="text-xs text-[var(--text-muted)]">Cron jobs</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{selectedAgent.overview.heartbeatsPerDay}</p>
                        <p className="text-xs text-[var(--text-muted)]">Heartbeats / day</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{selectedAgent.overview.channels.length}</p>
                        <p className="text-xs text-[var(--text-muted)]">Surfaces</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "Identity" && (
                <div className="space-y-4">
                  <FileEditor
                    title="IDENTITY.md"
                    path={selectedAgent.files.identityPath}
                    value={selectedForm.identityDraft}
                    onChange={(value) =>
                      updateForm(selectedAgent.id, (draft) => ({
                        ...draft,
                        identityDraft: value,
                      }))
                    }
                  />
                  <FileEditor
                    title="SOUL.md"
                    path={selectedAgent.files.soulPath}
                    value={selectedForm.soulDraft}
                    onChange={(value) =>
                      updateForm(selectedAgent.id, (draft) => ({
                        ...draft,
                        soulDraft: value,
                      }))
                    }
                  />
                </div>
              )}

              {activeTab === "Models / Tools" && (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Toggle tools per agent. Conflicting capabilities surface warnings before apply.
                  </p>
                  <div className="rounded border border-[var(--border)] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {defaultTools.map((tool) => (
                        <label key={tool} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedForm.toolAccess[tool]}
                            onChange={(event) =>
                              updateForm(selectedAgent.id, (draft) => ({
                                ...draft,
                                toolAccess: {
                                  ...draft.toolAccess,
                                  [tool]: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>{tool}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "Heartbeat" && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Cadence</span>
                      <select
                        value={selectedForm.heartbeatCadence}
                        onChange={(event) =>
                          updateForm(selectedAgent.id, (draft) => ({
                            ...draft,
                            heartbeatCadence: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="15m">Every 15 minutes</option>
                        <option value="30m">Every 30 minutes</option>
                        <option value="1h">Every hour</option>
                        <option value="paused">Paused</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Next run preview</span>
                      <input
                        readOnly
                        value={selectedAgent.heartbeat.nextRun}
                        className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-muted)]"
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span>Prompt</span>
                    <textarea
                      value={selectedForm.heartbeatDraft}
                      onChange={(event) =>
                        updateForm(selectedAgent.id, (draft) => ({
                          ...draft,
                          heartbeatDraft: event.target.value,
                        }))
                      }
                      className="h-32 w-full rounded border border-[var(--border)] bg-transparent p-3 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--text-muted)]">
                    {[...Array(7)].map((_, dayIndex) => (
                      <div
                        key={dayIndex}
                        className="rounded bg-[var(--bg-elevated)] px-2 py-3"
                      >
                        {dayIndex === 0 && "Mon"}
                        {dayIndex === 1 && "Tue"}
                        {dayIndex === 2 && "Wed"}
                        {dayIndex === 3 && "Thu"}
                        {dayIndex === 4 && "Fri"}
                        {dayIndex === 5 && "Sat"}
                        {dayIndex === 6 && "Sun"}
                        <div className="mt-2 h-2 w-full rounded bg-emerald-500/40" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                <div className="text-xs text-[var(--text-muted)]">
                  {selectedForm.dirty ? "Staged locally — apply to write config" : "No pending edits"}
                </div>
                <div className="space-x-3">
                  <button
                    className="rounded border border-[var(--border)] px-3 py-2 text-sm"
                    onClick={() => onStageChange(selectedAgent.id, false)}
                  >
                    Discard
                  </button>
                  <button
                    disabled={!stageCount}
                    onClick={onApply}
                    className="rounded border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-black disabled:opacity-40"
                  >
                    Apply staged
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type FileEditorProps = {
  title: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
};

function FileEditor({ title, path, value, onChange }: FileEditorProps) {
  return (
    <div className="rounded border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-[var(--text-muted)]">{path}</p>
        </div>
        <span className="text-xs text-[var(--text-muted)]">Diff preview pending</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-36 w-full rounded border border-[var(--border)] bg-transparent p-3 text-sm"
      />
    </div>
  );
}
