import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import SmoothScrolling from "@/components/ui/scroller";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const SITE_URL = "https://openclawcode.org";

export const viewport: Viewport = {
  themeColor: "#b91c1c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OpenClaw Code — The Easiest Way to Use AI Locally",
    template: "%s | OpenClaw Code",
  },
  description:
    "OpenClaw Code is the simplest way to get started with OpenClaw AI locally. One download, zero configuration. Works on Windows, macOS, and Linux.",
  keywords: [
    "OpenClaw",
    "OpenClaw Code",
    "AI coding assistant",
    "local AI",
    "VS Code AI",
    "AI setup",
    "self-hosted AI",
    "open source AI",
    "OCCode",
    "AI developer tools",
    "one-click AI install",
  ],
  authors: [{ name: "Making Better Agents", url: "https://mba.sh" }],
  creator: "Making Better Agents",
  publisher: "OpenClaw",
  applicationName: "OpenClaw Code",
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "OpenClaw Code",
    title: "OpenClaw Code — The Easiest Way to Use AI Locally",
    description:
      "One download, zero configuration. Get OpenClaw running locally in minutes on Windows, macOS, or Linux. Free and open source.",
    images: [
      {
        url: "/screenshot.png",
        width: 1400,
        height: 720,
        alt: "OpenClaw Code — AI coding workspace",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenClaw Code — The Easiest Way to Use AI Locally",
    description:
      "One download, zero configuration. Get OpenClaw running locally in minutes on Windows, macOS, or Linux.",
    images: ["/screenshot.png"],
    creator: "@openclawai",
    site: "@openclawai",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon.png", sizes: "512x512" }],
    shortcut: "/favicon.ico",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OpenClaw Code",
  url: SITE_URL,
  description:
    "OpenClaw Code is the simplest way to get started with OpenClaw AI locally. One download, zero configuration. Works on Windows, macOS, and Linux.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows, macOS, Linux",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  screenshot: `${SITE_URL}/screenshot.png`,
  downloadUrl: "https://github.com/damoahdominic/occ/releases",
  releaseNotes: "https://github.com/damoahdominic/occ/releases",
  softwareVersion: "latest",
  license: "https://github.com/damoahdominic/occ/blob/main/LICENSE",
  author: {
    "@type": "Organization",
    name: "Making Better Agents",
    url: "https://mba.sh",
  },
  publisher: {
    "@type": "Organization",
    name: "OpenClaw",
    url: "https://openclaw.ai",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${geist.variable} font-sans antialiased`}>
        <SmoothScrolling>
          {children}
        </SmoothScrolling>
      </body>
    </html>
  );
}
