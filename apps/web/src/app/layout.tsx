import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "OpenClaw Code — The Easiest Way to Use AI",
  description:
    "Get started with OpenClaw in minutes. Just download, install, and you're ready to go — no technical experience needed.",
  openGraph: {
    title: "OpenClaw Code",
    description: "The easiest way to get started with AI. No technical experience needed.",
    images: ["/screenshot.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
