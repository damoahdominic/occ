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
    default: "OpenClaw Code — AI Powered Local Harness for OpenClaw",
    template: "%s | OpenClaw Code",
  },
  description:
    "OpenClaw Code is the easiest way to set up, manage, and troubleshoot your OpenClaw AI agent. One download, zero configuration. Works on Windows, macOS, and Linux.",
  keywords: [
    "OpenClaw",
    "OpenClaw Code",
    "AI agent setup",
    "local AI agent",
    "OpenClaw setup wizard",
    "AI setup",
    "self-hosted AI agent",
    "OCCode",
    "AI agent manager",
    "one-click AI setup",
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
    title: "OpenClaw Code — AI Powered Local Harness for OpenClaw",
    description:
      "One download, zero configuration. Set up and manage your OpenClaw AI agent in minutes on Windows, macOS, or Linux.",
    images: [
      {
        url: "/OpenClawOGImage.png",
        width: 1400,
        height: 720,
        alt: "OpenClaw Code — set up and manage your AI agent",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenClaw Code — AI Powered Local Harness for OpenClaw",
    description:
      "One download, zero configuration. Set up and manage your OpenClaw AI agent in minutes on Windows, macOS, or Linux.",
    images: ["/OpenClawOGImage.png"],
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
    "OpenClaw Code is the easiest way to set up, manage, and troubleshoot your OpenClaw AI agent. One download, zero configuration. Works on Windows, macOS, and Linux.",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Windows, macOS, Linux",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  screenshot: `${SITE_URL}/OpenClawOGImage.png`,
  downloadUrl: "https://github.com/damoahdominic/occ/releases",
  releaseNotes: "https://github.com/damoahdominic/occ/releases",
  softwareVersion: "latest",
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
