"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const tabs = [
  {
    id: "editor",
    label: "Editor",
    caption:
      "A full VSCodium editor with OpenClaw pre-configured — open it and start coding immediately.",
    // Set imagePath to the real screenshot when ready, e.g. "/screenshots/editor.png"
    imagePath: null as string | null,
  },
  {
    id: "control-center",
    label: "Control Center",
    caption:
      "Monitor your agents, manage routing, and track automation — all in one dashboard.",
    imagePath: null as string | null,
  },
  {
    id: "terminal",
    label: "Terminal",
    caption:
      "Built-in terminal with agent output streaming in real time as your workflows run.",
    imagePath: null as string | null,
  },
  {
    id: "settings",
    label: "Settings",
    caption:
      "Simple settings panel — tweak your workspace without touching config files.",
    imagePath: null as string | null,
  },
];

type Tab = (typeof tabs)[0];

// Placeholder tile shown when no real screenshot is set yet
function Placeholder({ tab }: { tab: Tab }) {
  const accent =
    tab.id === "editor"
      ? "#3B82F6"
      : tab.id === "control-center"
      ? "#EF4444"
      : tab.id === "terminal"
      ? "#10B981"
      : "#8B5CF6";

  return (
    <div
      className="relative w-full aspect-video flex items-center justify-center overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 30% 40%, ${accent}1a 0%, transparent 60%),
                     radial-gradient(ellipse at 70% 60%, ${accent}0d 0%, transparent 50%),
                     var(--bg)`,
      }}
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center px-8">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `${accent}1a`,
            border: `1px solid ${accent}33`,
          }}
        >
          <div
            className="w-5 h-5 rounded-md"
            style={{ background: accent, opacity: 0.7 }}
          />
        </div>
        <p className="text-sm font-medium mt-1" style={{ color: accent }}>
          {tab.label}
        </p>
        <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
          Drop your screenshot at{" "}
          <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-[11px]">
            /public/screenshots/{tab.id}.png
          </code>{" "}
          then set{" "}
          <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-[11px]">
            imagePath
          </code>{" "}
          in{" "}
          <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-[11px]">
            screenshot-showcase.tsx
          </code>
        </p>
      </div>
    </div>
  );
}

export function ScreenshotShowcase() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((t) => t.id === activeTab)!;

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* Tab pills */}
      <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 cursor-pointer ${
                isActive
                  ? "text-white"
                  : "text-[var(--text-muted)] hover:text-white"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="screenshot-active-pill"
                  className="absolute inset-0 rounded-full bg-[var(--accent)]"
                  transition={{ type: "spring", stiffness: 420, damping: 40 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Screenshot card */}
      <div className="relative w-full rounded-2xl p-px">
        <GlowingEffect
          blur={0}
          borderWidth={2}
          spread={60}
          glow={true}
          disabled={false}
          proximity={80}
          inactiveZone={0.01}
        />
        <div className="relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
          {/* macOS window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border)] select-none">
            <span className="w-3 h-3 rounded-full bg-[#FF5F57] shrink-0" />
            <span className="w-3 h-3 rounded-full bg-[#FEBC2E] shrink-0" />
            <span className="w-3 h-3 rounded-full bg-[#28C840] shrink-0" />
            <span className="ml-3 text-xs text-[var(--text-muted)]">
              OCCode — {active.label}
            </span>
          </div>

          {/* Screenshot / placeholder with transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {active.imagePath ? (
                <Image
                  src={active.imagePath}
                  alt={`OCCode ${active.label}`}
                  width={1400}
                  height={720}
                  className="w-full h-auto block"
                  draggable={false}
                />
              ) : (
                <Placeholder tab={active} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Caption */}
      <AnimatePresence mode="wait">
        <motion.p
          key={activeTab + "-caption"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="text-sm text-[var(--text-muted)] text-center max-w-lg"
        >
          {active.caption}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
