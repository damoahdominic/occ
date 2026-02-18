"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Platform = "windows" | "macos" | "linux";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

const RELEASES = "https://github.com/damoahdominic/occ/releases";
const REPO = "https://github.com/damoahdominic/occ";

const platformLabels: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const platformIcons: Record<Platform, string> = {
  windows: "⊞",
  macos: "",
  linux: "🐧",
};

const features = [
  {
    title: "One-click AI setup",
    desc: "OpenClaw detected and configured automatically. No terminal commands, no config files.",
    icon: "⚡",
  },
  {
    title: "Built on VS Code",
    desc: "Full VS Code experience — extensions, themes, debugging — powered by VSCodium.",
    icon: "🧩",
  },
  {
    title: "Cross-platform",
    desc: "Runs on Windows, macOS, and Linux. Same experience everywhere.",
    icon: "💻",
  },
  {
    title: "OpenClaw integrated",
    desc: "Status panel, config editor, and gateway management built right into the editor.",
    icon: "🦞",
  },
  {
    title: "Open source",
    desc: "Free, transparent, community-driven. See every line of code.",
    icon: "🔓",
  },
];

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("linux");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const otherPlatforms = (["windows", "macos", "linux"] as Platform[]).filter(
    (p) => p !== platform
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Image src="/icon.png" alt="OCCode" width={32} height={32} className="rounded-lg" />
          <span className="font-semibold text-lg tracking-tight">OCCode</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <a href={REPO} className="hover:text-white transition-colors">GitHub</a>
          <a href="https://docs.openclaw.ai" className="hover:text-white transition-colors">Docs</a>
          <a href="https://openclaw.ai" className="hover:text-white transition-colors">OpenClaw</a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative flex flex-col items-center text-center px-6 pt-20 pb-16 max-w-4xl mx-auto overflow-hidden">
          {/* Background video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-20 -z-10 hidden sm:block"
          >
            <source src="/videos/hero.mp4" type="video/mp4" />
          </video>
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-20 -z-10 sm:hidden"
          >
            <source src="/videos/hero_mobile.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)]/60 via-transparent to-[var(--bg)] -z-10" />
          <Image
            src="/icon.png"
            alt="OpenClaw Code"
            width={96}
            height={96}
            className="rounded-2xl mb-8"
            priority
          />
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
            Open<span className="text-[var(--accent)]">Claw</span> Code
          </h1>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mb-10 leading-relaxed">
            AI-powered development without the setup hassle. Download, install, code.
            <br className="hidden sm:block" />
            No terminal required.
          </p>

          {/* Download button */}
          <div className="relative mb-4">
            <div className="flex">
              <a
                href={RELEASES}
                className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-8 py-3.5 rounded-l-xl text-lg transition-colors"
              >
                Download for {platformLabels[platform]}
              </a>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-3.5 rounded-r-xl border-l border-white/20 transition-colors"
                aria-label="Other platforms"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {showDropdown && (
              <div className="absolute top-full mt-2 right-0 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xl z-10 min-w-[200px]">
                {otherPlatforms.map((p) => (
                  <a
                    key={p}
                    href={RELEASES}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-sm"
                    onClick={() => setShowDropdown(false)}
                  >
                    <span>{platformIcons[p]}</span>
                    <span>Download for {platformLabels[p]}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <a
            href={REPO}
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-white transition-colors text-sm"
          >
            ⭐ Star on GitHub
          </a>
        </section>

        {/* Screenshot */}
        <section className="px-6 pb-20 max-w-5xl mx-auto">
          <div className="rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl shadow-black/50">
            <Image
              src="/screenshot.png"
              alt="OCCode editor showing OpenClaw integration"
              width={1280}
              height={720}
              className="w-full h-auto"
            />
          </div>
        </section>

        {/* Features */}
        <section className="px-6 pb-24 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Everything you need, nothing you don&apos;t</h2>
          <p className="text-[var(--text-muted)] text-center mb-14 max-w-xl mx-auto">
            A complete development environment with AI built in. No plugins to hunt down, no configs to edit.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 hover:border-[var(--accent)]/40 transition-colors"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
          <span>Built with ❤️ by the OpenClaw community</span>
          <div className="flex gap-6">
            <a href={REPO} className="hover:text-white transition-colors">GitHub</a>
            <a href="https://docs.openclaw.ai" className="hover:text-white transition-colors">Docs</a>
            <a href="https://openclaw.ai" className="hover:text-white transition-colors">OpenClaw</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
