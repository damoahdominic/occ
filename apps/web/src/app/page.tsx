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

const platformIcons: Record<Platform, React.ReactNode> = {
  windows: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  ),
  macos: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  ),
  linux: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.199.065.395.065.59 0 .2-.065.397-.2.497-.397.2-.4.2-.999 0-1.696-.002-.005 0-.013-.002-.018a6.79 6.79 0 01-.197-.666c.15-.165.293-.399.392-.666a3.85 3.85 0 00.2-1.163c.003-.065-.003-.134-.006-.199-.135-.865-.664-1.53-1.26-2.065a14.92 14.92 0 01-.94-.884c-.398-.398-.737-.866-.97-1.398-.064-.135-.132-.27-.198-.4-.13-.27-.264-.535-.332-.865a3.57 3.57 0 01-.027-.665c.012-.2.048-.398.078-.595.06-.4.13-.795.16-1.264.032-.47.002-.936-.098-1.398-.2-.93-.596-1.83-1.196-2.53-.399-.466-.864-.864-1.397-1.131-.267-.135-.535-.2-.868-.267-.19-.03-.397-.065-.6-.065zm-.22 1.47c.154 0 .515.064.645.13.394.196.707.458 1.01.794.39.465.689 1.064.844 1.731.071.332.095.665.071 1 0 .399-.065.73-.131 1.064-.033.197-.065.397-.065.598-.004.267.014.53.063.795.08.397.222.73.396 1.064.066.13.132.265.198.397.267.6.663 1.13 1.13 1.6.265.265.532.53.795.793.53.465.928.994 1.03 1.596-.003.332-.064.664-.196.93-.07.135-.164.264-.262.394-.2-.132-.396-.267-.596-.466-.198-.133-.397-.332-.528-.465-.133-.133-.198-.2-.265-.265a2.093 2.093 0 01-.395-.53c-.067-.132-.136-.265-.136-.4a1.007 1.007 0 01.068-.397c.066-.133.197-.332.262-.465.067-.133.134-.266.134-.4.002-.133-.063-.265-.13-.33a.824.824 0 00-.397-.2.637.637 0 00-.464.064.978.978 0 00-.397.332 1.592 1.592 0 00-.198.53c-.067.2-.067.468-.002.665a2.8 2.8 0 00.396.93c.132.198.27.398.396.53.13.132.197.265.327.397l.131.134c-.13.265-.06.53-.06.795 0 .333-.132.533-.265.733-.598.065-1.064-.068-1.53-.2-.465-.132-.862-.33-1.196-.53-.13-.065-.265-.197-.396-.265 0-.068-.004-.133 0-.198.003-.4.066-.733.2-.998.132-.267.33-.465.594-.665.133-.065.267-.132.4-.198.133-.066.267-.133.33-.265.067-.067.068-.133.068-.2-.002-.2-.134-.333-.268-.467a.96.96 0 00-.465-.198c-.133 0-.265.066-.33.133a.807.807 0 00-.267.4 2.297 2.297 0 00-.133.665 3.487 3.487 0 01-.264 1.063c-.133.267-.33.468-.596.668a4.39 4.39 0 01-.929.464c-.33.132-.667.198-.998.268-.197.003-.397.003-.596-.065-.133-.065-.197-.133-.264-.198-.133-.2-.133-.467-.067-.797.067-.265 0-.664-.066-1.064-.064-.396-.131-.73-.063-.997a.873.873 0 01.396-.465c.131-.066.33-.133.461-.2.397-.132.862-.264 1.128-.598.133-.197.2-.398.2-.665 0-.132-.068-.265-.134-.33a.94.94 0 00-.53-.265c-.066-.003-.135 0-.198 0l-.132.003c-.197.065-.33.197-.462.332-.133.132-.265.265-.398.332-.133.065-.33.065-.53.065-.197-.003-.396-.068-.527-.2-.133-.13-.2-.264-.267-.464-.064-.132-.064-.332-.064-.53v-.066c.066-.4.2-.73.4-.998.198-.264.461-.465.728-.598.267-.133.596-.2.86-.265.07-.004.13-.004.194 0z" />
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
    title: "Free and open",
    desc: "Completely free to use, built by a community of people who believe AI should be accessible to everyone.",
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

// ─── 3-D card-stack notification feed (GSAP — mirrors Carousel.js technique) ──
const N_VISIBLE = 5;

function NotificationFeed() {
  const sliderRef    = useRef<HTMLDivElement>(null);
  const isAnimating  = useRef(false);
  const tickerRef    = useRef(N_VISIBLE); // next installEvents index to load

  useEffect(() => {
    // Non-null assertion: useEffect only runs after mount, ref is always set by then
    const slider = sliderRef.current!;

    // ── Register the same custom ease as Carousel.js ──────────────────────────
    gsap.registerEase("cubic", (t: number) => bezier(0.83, 0, 0.17, 1, t));

    // ── Set up 3-D context on the slider — same as Carousel.js ───────────────
    gsap.set(slider, { transformPerspective: 800, transformStyle: "preserve-3d" });

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers — declared before use (mirrors Carousel.js structure)
    // ─────────────────────────────────────────────────────────────────────────

    /** Update city + flag text inside a card element. */
    const setCardContent = (card: HTMLElement, ev: (typeof installEvents)[0]) => {
      const flag = card.querySelector<HTMLElement>(".nc-flag");
      const city = card.querySelector<HTMLElement>(".nc-city");
      if (flag) flag.textContent = ev.flag;
      if (city) city.textContent = ev.city;
    };

    /**
     * Position ALL cards in the stack.
     * DOM order: cards[0] = back (furthest), cards[N-1] = front (closest).
     * Mirrors initializeCards() in Carousel.js.
     */
    const initCards = () => {
      const cs = Array.from(slider.querySelectorAll<HTMLElement>(".nc"));
      const n  = cs.length;
      gsap.to(cs, {
        y:        (i) => `${36 - 32 * i}%`,        // front (i=n-1) sits highest (top), back lowest
        z:        (i) => 20 * i,                    // real translateZ depth
        scale:    (i) => 1 - 0.055 * (n - 1 - i),  // back ≈ 0.78, front = 1
        opacity:  1,                                  // always fully opaque — solid bg
        // combine blur (depth haze) + brightness (depth dimming) in one filter
        // front: blur(0) brightness(1) → back: blur(1.2px) brightness(0.55)
        filter:   (i) => `blur(${(n - 1 - i) * 0.3}px) brightness(${1 - (n - 1 - i) * 0.09})`,
        duration: 1.0,
        ease:     "cubic",
        stagger:  -0.06,
        overwrite: "auto",
      });
    };

    /**
     * Rotate the stack: front card exits on Z, moves to back, new content loaded.
     * Mirrors rotateCards() in Carousel.js.
     */
    const rotateCards = () => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const cs    = Array.from(slider.querySelectorAll<HTMLElement>(".nc"));
      const front = cs[cs.length - 1]; // last in DOM = highest z = front card

      // ① Front card blasts toward the viewer until it exits the scene.
      //
      //   perspective: 800  →  apparent scale = 800 / (800 - z)
      //   z = 0   → scale 1.0   (normal)
      //   z = 400 → scale 2.0   (fills container)
      //   z = 600 → scale 4.0   (clearly exits — card is 4× its original size)
      //   z = 700 → scale 8.0   (well past any container edge)
      //
      //   opacity stays 1 the whole time — it's a physical launch, not a fade.
      //   The card naturally disappears when it grows past the container's
      //   overflow-hidden boundary, THEN onComplete teleports it to the back.
      gsap.to(front, {
        z:        "+=680",  // exits the scene at ~4-8× scale
        opacity:  1,        // stays opaque — it moves OUT, not fades out
        duration: 1.1,
        ease:     "power2.in",   // accelerates toward viewer (feels like launching)
        onComplete: () => {
          // ② Recycle to back of DOM (card is already off-screen, so no visual glitch)
          slider.prepend(front);
          // ③ Load next notification into the recycled card
          setCardContent(front, installEvents[tickerRef.current++ % installEvents.length]);
          // ④ Instantly place far behind the viewer, invisible
          gsap.set(front, { z: -300, opacity: 0 });
          // ⑤ Re-stack all cards into their new positions
          initCards();
          // ⑥ Gently fade the new back card in (opacity stays 1, just reveal it)
          gsap.to(front, { opacity: 1, duration: 0.6, delay: 0.2 });
          setTimeout(() => { isAnimating.current = false; }, 1200);
        },
      });
    };

    // ── Seed initial card content ─────────────────────────────────────────────
    Array.from(slider.querySelectorAll<HTMLElement>(".nc")).forEach((card, i) => {
      setCardContent(card, installEvents[i % installEvents.length]);
    });

    // ── Initial stack layout ──────────────────────────────────────────────────
    initCards();

    // ── Auto-rotation ─────────────────────────────────────────────────────────
    const interval = setInterval(rotateCards, 3200);
    return () => clearInterval(interval);
  }, []);

  return (
    // Outer wrapper: overflow-hidden + rounded so the growing card gets clipped
    // at the edges — same pattern as Carousel.js outer container.
    // The extra height gives the card room to grow before being clipped.
    <div className="relative w-full max-w-xs select-none overflow-hidden rounded-2xl" style={{ height: 220 }}>
      {/*
        Slider: transformPerspective + transformStyle:preserve-3d applied by GSAP.
        No overflow-hidden here — cards need to grow freely inside this space.
      */}
      <div
        ref={sliderRef}
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        {Array.from({ length: N_VISIBLE }).map((_, i) => (
          <div
            key={i}
            className="nc absolute inset-x-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-xl shadow-black/30 cursor-default"
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

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("linux");
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

        state.phi   = phi + smoothOffsetX.current;
        state.theta = 0.25 + smoothOffsetY.current;
        state.width  = width * 2;
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

  const otherPlatforms = (["windows", "macos", "linux"] as Platform[]).filter(
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
              { name: "GitHub", link: REPO },
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
                href={RELEASES}
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
            <a href={REPO} className="text-sm text-[var(--text-muted)] hover:text-white transition-colors w-full">
              GitHub
            </a>
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
                href={RELEASES}
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

          <div className="pt-24">
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

                  {/* Download button */}
                  <div className="relative mb-5">
                    <div className="relative flex rounded-xl btn-glow">
                      <a
                        href={RELEASES}
                        className="inline-flex items-center gap-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-8 py-3.5 rounded-l-xl text-lg transition-all"
                      >
                        {platformIcons[platform]}
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

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <a
                      href={REPO}
                      className="w-[75%] sm:w-auto mx-auto group/star inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)]/60 backdrop-blur-sm text-sm text-[var(--text-muted)] hover:text-white hover:border-white/20 hover:bg-[var(--bg-elevated)] transition-all duration-300"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-hover/star:fill-yellow-400 group-hover/star:stroke-yellow-400 transition-colors duration-300">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      Star on GitHub
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40 group-hover/star:opacity-100 group-hover/star:translate-x-0.5 transition-all duration-300">
                        <path d="M7 17l9.2-9.2M17 17V8H8" />
                      </svg>
                    </a>
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
                src="/screenshot.png"
                alt="OpenClaw Code app in action"
                width={1400}
                height={720}
                className="mx-auto rounded-2xl object-cover h-full object-left-top"
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

            <div className="relative flex flex-col lg:flex-row items-center justify-center gap-10">
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
              <NotificationFeed />
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
            <div className="flex items-center gap-8 text-sm text-[var(--text-muted)]">
              <a href={REPO} className="hover:text-white transition-colors">GitHub</a>
              <a href="https://docs.openclaw.ai" className="hover:text-white transition-colors">Docs</a>
              <a href="https://openclaw.ai" className="hover:text-white transition-colors">OpenClaw</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
