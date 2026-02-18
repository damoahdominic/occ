import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "OpenClaw Code — AI-Powered Code Editor",
  description:
    "The easiest way to get started with OpenClaw. A code editor with AI built in. Download, install, and you're ready to go.",
  openGraph: {
    title: "OpenClaw Code",
    description: "AI-powered code editor. No terminal required.",
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
      <body className={`${spaceGrotesk.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
