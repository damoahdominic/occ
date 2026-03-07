"use client";

import createGlobe from "cobe";
import { gsap } from "gsap";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "@/components/ui/resizable-navbar";
import { NoiseBackground } from "@/components/ui/noise-background";
import { ScreenshotShowcase } from "@/components/ui/screenshot-showcase";

export type Platform = "windows" | "macos";
export type DownloadUrls = Record<Platform, string>;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  return "windows";
}

const RELEASES = "https://github.com/damoahdominic/occ/releases";

const FALLBACK_URLS: DownloadUrls = {
  windows: "https://github.com/damoahdominic/occ/releases/latest",
  macos: "https://github.com/damoahdominic/occ/releases/latest",
};

const platformLabels: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
};

const platformIcons: Record<Platform, React.ReactNode> = {
  windows: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  ),
  macos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  ),
};

const features = [
  {
    title: "Ready in one click",
    desc: "OpenClaw is set up for you automatically. No complicated steps, no confusing settings — just open the app and go.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M18 2L6 18h8l-2 12 12-16h-8l2-12z"
          fill="var(--accent)"
          className="animate-icon-pulse"
        />
      </svg>
    ),
  },
  {
    title: "A real workspace",
    desc: "Built on the same tools professionals use, so you get a powerful, polished experience from day one.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {/* heroicons code-bracket scaled to 32×32 */}
        <path d="M23 9L30 16l-7 7" />
        <path d="M9 9L2 16l7 7" />
        <path d="M19.5 5l-7 22" />
      </svg>
    ),
  },
  {
    title: "Works on any computer",
    desc: "Whether you're on Windows, Mac, or Linux — it just works. Same great experience everywhere.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="animate-icon-float">
        <circle cx="16" cy="16" r="12" stroke="var(--accent)" strokeWidth="2" />
        <ellipse cx="16" cy="16" rx="5" ry="12" stroke="var(--accent)" strokeWidth="1.5" />
        <path d="M4 16h24" stroke="var(--accent)" strokeWidth="1.5" />
        <path d="M6 10.5h20" stroke="var(--accent)" strokeWidth="1" opacity="0.35" />
        <path d="M6 21.5h20" stroke="var(--accent)" strokeWidth="1" opacity="0.35" />
      </svg>
    ),
  },
  {
    title: "Everything in one place",
    desc: "Check your status, tweak your settings, and manage everything from a single, easy-to-use app.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M9 5C5 5 3 9 5 13l7 5"
          stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="animate-icon-pinch-left"
        />
        <path
          d="M23 5c4 0 6 4 4 8l-7 5"
          stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="animate-icon-pinch-right"
        />
        <path
          d="M12 18c0 4 2 7 4 7s4-3 4-7"
          stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Free to use",
    desc: "Completely free to use. No subscriptions, no hidden fees — just download and get started.",
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <rect x="7" y="15" width="18" height="13" rx="3" stroke="var(--accent)" strokeWidth="2" />
        <path
          d="M11 15V10a5 5 0 0 1 10 0v3"
          stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
          className="animate-icon-unlock"
        />
        <circle cx="16" cy="22" r="2" fill="var(--accent)" />
      </svg>
    ),
  },
];

const installEvents = [
  { city: "Tokyo", flag: "🇯🇵", lat: 35.6762, lng: 139.6503 },
  { city: "São Paulo", flag: "🇧🇷", lat: -23.5505, lng: -46.6333 },
  { city: "Berlin", flag: "🇩🇪", lat: 52.52, lng: 13.405 },
  { city: "San Francisco", flag: "🇺🇸", lat: 37.7749, lng: -122.4194 },
  { city: "Lagos", flag: "🇳🇬", lat: 6.5244, lng: 3.3792 },
  { city: "Mumbai", flag: "🇮🇳", lat: 19.076, lng: 72.8777 },
  { city: "London", flag: "🇬🇧", lat: 51.5074, lng: -0.1278 },
  { city: "Sydney", flag: "🇦🇺", lat: -33.8688, lng: 151.2093 },
  { city: "Seoul", flag: "🇰🇷", lat: 37.5665, lng: 126.978 },
  { city: "Nairobi", flag: "🇰🇪", lat: -1.2921, lng: 36.8219 },
  { city: "Toronto", flag: "🇨🇦", lat: 43.6532, lng: -79.3832 },
  { city: "Stockholm", flag: "🇸🇪", lat: 59.3293, lng: 18.0686 },
  { city: "Singapore", flag: "🇸🇬", lat: 1.3521, lng: 103.8198 },
  { city: "Cape Town", flag: "🇿🇦", lat: -33.9249, lng: 18.4241 },
  { city: "Mexico City", flag: "🇲🇽", lat: 19.4326, lng: -99.1332 },
  { city: "Amsterdam", flag: "🇳🇱", lat: 52.3676, lng: 4.9041 },
];

// ─── Apple-style notification stack (3 cards, horizontal fling exit) ──────────
const N_VISIBLE = 3;

function NotificationFeed() {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const tickerRef = useRef(N_VISIBLE);

  useEffect(() => {
    const slider = sliderRef.current!;

    const setCardContent = (card: HTMLElement, ev: (typeof installEvents)[0]) => {
      const flag = card.querySelector<HTMLElement>(".nc-flag");
      const city = card.querySelector<HTMLElement>(".nc-city");
      if (flag) flag.textContent = ev.flag;
      if (city) city.textContent = ev.city;
    };

    // Stack: cards anchor to bottom. front (i=n-1) sits at y=0, back cards
    // peek upward with negative translateY and are slightly scaled down.
    const initCards = () => {
      const cs = Array.from(slider.querySelectorAll<HTMLElement>(".nc"));
      const n = cs.length;
      gsap.to(cs, {
        y: (i) => (n - 1 - i) * -11,         // front=0px, mid=-11px, back=-22px
        scale: (i) => 1 - (n - 1 - i) * 0.06,    // front=1, mid=0.94, back=0.88
        duration: 0.5,
        ease: "power3.out",
        overwrite: "auto",
      });
    };

    const rotateCards = () => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const cs = Array.from(slider.querySelectorAll<HTMLElement>(".nc"));
      const front = cs[cs.length - 1];

      // Fling front card off to the right — accelerates like a physical throw
      gsap.to(front, {
        x: "110%",
        opacity: 0,
        duration: 0.44,
        ease: "power2.in",
        onComplete: () => {
          // Recycle: move to back of DOM, load next city
          slider.prepend(front);
          setCardContent(front, installEvents[tickerRef.current++ % installEvents.length]);
          // Place new back card slightly above the stack, invisible
          gsap.set(front, { x: 0, y: -32, opacity: 0, scale: 0.82 });
          // Restack all cards smoothly
          initCards();
          // Fade the new back card in after the others have settled
          gsap.to(front, { opacity: 1, duration: 0.45, delay: 0.12, ease: "power2.out" });
          setTimeout(() => { isAnimating.current = false; }, 900);
        },
      });
    };

    // Seed content and lay out initial stack
    Array.from(slider.querySelectorAll<HTMLElement>(".nc")).forEach((card, i) => {
      setCardContent(card, installEvents[i % installEvents.length]);
    });
    gsap.set(slider.querySelectorAll<HTMLElement>(".nc"), { opacity: 1 });
    initCards();

    const interval = setInterval(rotateCards, 3200);
    return () => clearInterval(interval);
  }, []);

  return (
    // overflow-hidden clips the card as it flings right; height fits 3 stacked cards
    <div className="relative w-full max-w-sm select-none overflow-hidden" style={{ height: 100 }}>
      <div ref={sliderRef} className="absolute inset-0">
        {Array.from({ length: N_VISIBLE }).map((_, i) => (
          <div
            key={i}
            className="nc absolute inset-x-0 bottom-0 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-xl shadow-black/30 cursor-default"
            style={{ minHeight: 64 }}
          >
            <span className="nc-flag text-lg shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="nc-city text-sm font-semibold truncate" />
              <p className="text-xs text-[var(--text-muted)]">started using OpenClaw Code</p>
            </div>
            <span className="ml-auto text-xs text-[var(--text-muted)] shrink-0 whitespace-nowrap pl-2">
              just now
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cubic-bezier solver (needed for gsap.registerEase) ────────────────────────
function bezier(p1x: number, p1y: number, p2x: number, p2y: number, progress: number): number {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  // Newton-Raphson: find u where sampleX(u) === progress, return sampleY(u)
  let u = progress;
  for (let i = 0; i < 8; i++) {
    const s = sampleX(u) - progress;
    if (Math.abs(s) < 1e-6) break;
    u -= s / ((3 * ax * u * u + 2 * bx * u + cx) || 1e-6);
  }
  return sampleY(u);
}

export default function Home({ downloadUrls = FALLBACK_URLS }: { downloadUrls?: DownloadUrls }) {
  const [platform, setPlatform] = useState<Platform>("windows");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  // Mouse-tracking state for globe interaction
  const isGlobeHovered = useRef(false);
  const mouseNormX = useRef(0); // -0.5 → 0.5 (left → right)
  const mouseNormY = useRef(0); // -0.5 → 0.5 (top → bottom)
  // Smooth offsets applied on top of the base auto-rotation
  const smoothOffsetX = useRef(0);
  const smoothOffsetY = useRef(0);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // Cobe globe
  useEffect(() => {
    if (!canvasRef.current || !globeContainerRef.current) return;

    let width = 0;

    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener("resize", onResize);
    onResize();

    // Mouse handlers attached to the container div
    const container = globeContainerRef.current;

    const handleMouseEnter = () => {
      isGlobeHovered.current = true;
    };

    const handleMouseLeave = () => {
      isGlobeHovered.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      // Normalize to -0.5 → 0.5
      mouseNormX.current = (e.clientX - rect.left) / rect.width - 0.5;
      mouseNormY.current = (e.clientY - rect.top) / rect.height - 0.5;
    };

    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("mousemove", handleMouseMove);

    let phi = 0; // always-advancing base rotation

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 20000,
      mapBrightness: 4,
      baseColor: [0.15, 0.15, 0.15],
      markerColor: [0.94, 0.27, 0.27],
      glowColor: [0.06, 0.06, 0.06],
      markers: installEvents.map((e) => ({
        location: [e.lat, e.lng] as [number, number],
        size: 0.07,
      })),
      onRender: (state) => {
        // Base rotation always ticks — slower while hovered so the globe
        // feels like it's "pausing" to look at the cursor
        phi += isGlobeHovered.current ? 0.0005 : 0.003;

        // Target offsets: mouse position mapped to a gentle angular nudge
        // mouseNormX/Y are already -0.5 → 0.5; scale to a comfortable range
        const targetOffX = isGlobeHovered.current ? mouseNormX.current * 1.4 : 0;
        const targetOffY = isGlobeHovered.current ? mouseNormY.current * 0.5 : 0;

        // Lerp the smooth offsets toward the targets each frame
        smoothOffsetX.current += (targetOffX - smoothOffsetX.current) * 0.05;
        smoothOffsetY.current += (targetOffY - smoothOffsetY.current) * 0.05;

        state.phi = phi + smoothOffsetX.current;
        state.theta = 0.25 + smoothOffsetY.current;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const otherPlatforms = (["windows", "macos"] as Platform[]).filter(
    (p) => p !== platform
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <Navbar>
        <NavBody>
          <NavbarLogo />
          <NavItems
            items={[
              { name: "Docs", link: "https://docs.openclaw.ai" },
              { name: "OpenClaw", link: "https://openclaw.ai" },
            ]}
          />
          <div className="flex items-center gap-4">
            <NoiseBackground
              containerClassName="w-fit p-1 rounded-full border border-red-500/40"
              gradientColors={[
                "rgb(239, 68, 68)",
                "rgb(185, 28, 28)",
                "rgb(248, 113, 113)",
              ]}
              speed={0.08}
              noiseIntensity={0.15}
            >
              <a
                href="#download"
                className="inline-flex items-center gap-2 cursor-pointer rounded-full bg-[var(--bg)] px-5 py-2 text-sm font-semibold text-white shadow-[0px_1px_0px_0px_rgba(255,255,255,0.06)_inset,0px_1px_2px_0px_rgba(0,0,0,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </a>
            </NoiseBackground>
          </div>
        </NavBody>
        <MobileNav>
          <MobileNavHeader>
            <NavbarLogo />
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
          </MobileNavHeader>
          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          >
            <a href="https://docs.openclaw.ai" className="text-sm text-[var(--text-muted)] hover:text-white transition-colors w-full">
              Docs
            </a>
            <a href="https://openclaw.ai" className="text-sm text-[var(--text-muted)] hover:text-white transition-colors w-full">
              OpenClaw
            </a>
            <NoiseBackground
              containerClassName="w-full p-1 rounded-full border border-red-500/40"
              gradientColors={[
                "rgb(239, 68, 68)",
                "rgb(185, 28, 28)",
                "rgb(248, 113, 113)",
              ]}
              speed={0.08}
              noiseIntensity={0.15}
            >
              <a
                href="#download"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 cursor-pointer rounded-full bg-[var(--bg)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0px_1px_0px_0px_rgba(255,255,255,0.06)_inset,0px_1px_2px_0px_rgba(0,0,0,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </a>
            </NoiseBackground>
          </MobileNavMenu>
        </MobileNav>
      </Navbar>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative w-full overflow-hidden">
          {/* Background video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-30 -z-10 hidden sm:block"
          >
            <source src="/videos/hero.mp4" type="video/mp4" />
          </video>
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-30 -z-10 sm:hidden"
          >
            <source src="/videos/hero_mobile.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)]/60 via-transparent to-[var(--bg)] -z-10" />

          <div className="md:pt-24 pt-46">
            <ContainerScroll
              titleComponent={
                <div className="flex flex-col items-center">
                  <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6">
                    Open<span className="text-[var(--accent)]">Claw</span> Code
                  </h1>
                  <p className="text-lg sm:text-xl text-[var(--text-muted)] max-w-2xl mb-10 leading-relaxed">
                    The simplest way to get started with OpenClaw locally.
                    <br className="hidden sm:block" />
                    Just download, open, and you&apos;re ready to go.
                  </p>

                  {/* Download buttons */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 mb-10">
                    {(["windows", "macos"] as Platform[]).map((p) =>
                      p === platform ? (
                        <div key={p} className="relative btn-glow rounded-xl">
                          <a
                            href={downloadUrls[p]}
                            className="inline-flex items-center gap-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-7 py-3.5 rounded-xl text-base transition-all"
                          >
                            {platformIcons[p]}
                            Download for {platformLabels[p]}
                          </a>
                        </div>
                      ) : (
                        <a
                          key={p}
                          href={downloadUrls[p]}
                          className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/60 backdrop-blur-sm text-base font-semibold text-[var(--text-muted)] hover:text-white hover:border-white/20 hover:bg-[var(--bg-elevated)] transition-all duration-200"
                        >
                          {platformIcons[p]}
                          Download for {platformLabels[p]}
                        </a>
                      )
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center md:gap-4 w-full sm:w-auto gap-6">
                    <a
                      href="https://mba.sh"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-[75%] sm:w-auto mx-auto group/skool inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)]/60 backdrop-blur-sm text-sm text-[var(--text-muted)] hover:text-white hover:border-white/20 hover:bg-[var(--bg-elevated)] transition-all duration-300"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-hover/skool:stroke-emerald-400 transition-colors duration-300">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Join our community on Skool
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40 group-hover/skool:opacity-100 group-hover/skool:translate-x-0.5 transition-all duration-300">
                        <path d="M7 17l9.2-9.2M17 17V8H8" />
                      </svg>
                    </a>
                  </div>
                </div>
              }
            >
              <Image
                src="/screenshot.jpeg"
                alt="OpenClaw Code app in action"
                width={1400}
                height={720}
                priority
                unoptimized
                className="mx-auto rounded-2xl object-cover h-full object-left-top hidden sm:block"
                draggable={false}
              />
              <Image
                src="/screenshot1.jpeg"
                alt="OpenClaw Code app in action"
                width={720}
                height={1400}
                priority
                unoptimized
                className="mx-auto rounded-2xl object-cover h-full object-left-top sm:hidden"
                draggable={false}
              />
            </ContainerScroll>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24 max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Simple by design</h2>
          <p className="text-[var(--text-muted)] text-center mb-16 max-w-xl mx-auto">
            All the power of AI in a friendly app. No technical knowledge required — just download and start creating.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const isHero = i === 0;
              const isWide = i === 4;
              return (
                <div
                  key={f.title}
                  className={`relative rounded-2xl p-px ${isHero ? "sm:col-span-2 lg:col-span-2 lg:row-span-2" : ""} ${isWide ? "lg:col-span-2" : ""}`}
                >
                  <GlowingEffect
                    blur={0}
                    borderWidth={3}
                    spread={80}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                  />
                  <div
                    className={`group relative h-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 transition-all duration-300 hover:bg-[var(--bg-elevated)] ${isHero ? "flex flex-col justify-between" : ""}`}
                  >
                    <div>
                      <div className={`mb-3 group-hover:scale-110 transition-transform duration-300 ${isHero ? "w-12 h-12" : "w-8 h-8"}`}>{f.icon}</div>
                      <h3 className={`font-semibold mb-2 ${isHero ? "text-2xl" : "text-lg"}`}>{f.title}</h3>
                      <p className={`text-[var(--text-muted)] leading-relaxed ${isHero ? "text-base max-w-md" : "text-sm"}`}>{f.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Global community */}
        <section className="relative px-6 py-24 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              Loved around the world
            </h2>
            <p className="text-[var(--text-muted)] text-center mb-16 max-w-xl mx-auto">
              People everywhere are getting started with AI through OpenClaw Code.
            </p>

            <div className="relative flex flex-col items-center justify-center gap-10">
              {/* Globe */}
              <div ref={globeContainerRef} className="relative aspect-square w-[400px] sm:w-[580px] lg:w-[720px] shrink-0">
                <div className="absolute inset-0 bg-[var(--accent)]/[0.06] rounded-full blur-3xl pointer-events-none" />
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                  style={{ contain: "layout paint size", aspectRatio: "1" }}
                />
              </div>

              {/* Install feed — iOS push notification style */}
              {/* <NotificationFeed /> */}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="download" className="px-6 py-24">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden border border-red-500/20 bg-[var(--bg-card)]">
              {/* Top gradient line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/70 to-transparent" />
              {/* Soft background bloom */}
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[260px] bg-red-500/[0.08] rounded-full blur-3xl pointer-events-none" />

              <div className="relative px-8 py-16 sm:px-20 text-center">
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
                  Get started in minutes
                </h2>
                <p className="text-[var(--text-muted)] text-base sm:text-lg mb-10 max-w-sm mx-auto leading-relaxed">
                  Download OCCode and go from zero to a fully configured OpenClaw environment — no manual setup required.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {(["windows", "macos"] as Platform[]).map((p) =>
                    p === platform ? (
                      <div key={p} className="relative btn-glow rounded-xl">
                        <a
                          href={downloadUrls[p]}
                          className="inline-flex items-center gap-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-7 py-3.5 rounded-xl text-base transition-colors"
                        >
                          {platformIcons[p]}
                          Download for {platformLabels[p]}
                        </a>
                      </div>
                    ) : (
                      <a
                        key={p}
                        href={downloadUrls[p]}
                        className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/60 text-base font-semibold text-[var(--text-muted)] hover:text-white hover:border-white/20 hover:bg-[var(--bg-elevated)] transition-all duration-200"
                      >
                        {platformIcons[p]}
                        Download for {platformLabels[p]}
                      </a>
                    )
                  )}
                </div>
              </div>

              {/* Bottom gradient line */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] relative overflow-hidden">
        {/* Hover text effect */}
        <div className="h-[16rem] flex items-center justify-center pointer-events-auto">
          <TextHoverEffect text="OCCode" />
        </div>

        {/* Footer links */}
        <div className="border-t border-[var(--border)] px-6 py-8">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image src="/icon.png" alt="OCCode" width={24} height={24} className="rounded-md opacity-60" />
              <span className="text-sm text-[var(--text-muted)]">
                Built by the <a href="https://mba.sh" className="hover:text-white transition-colors underline underline-offset-4 decoration-[var(--border)] hover:decoration-white/40">Making Better Agents</a> community
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
              <a href="https://docs.openclaw.ai" className="flex items-center gap-1.5 hover:text-white transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Docs
              </a>
              <a href="https://openclaw.ai" className="flex items-center gap-1.5 hover:text-white transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://openclaw.ai/favicon.svg" alt="OpenClaw" width={15} height={15} className="opacity-70" />
                OpenClaw
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
