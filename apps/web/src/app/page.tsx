import Home from "./page-client";
import type { DownloadUrls } from "./page-client";

const REPO = "damoahdominic/occ";
const FALLBACK: DownloadUrls = {
  windows: `https://github.com/${REPO}/releases/latest`,
  macos: `https://github.com/${REPO}/releases/latest`,
};

async function getDownloadUrls(): Promise<DownloadUrls> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 }, // re-fetch every 5 minutes
      }
    );
    if (!res.ok) return FALLBACK;

    const data = await res.json();
    const tag: string = data.tag_name ?? "";
    const assets: Array<{ name: string; browser_download_url: string }> =
      data.assets ?? [];

    const win = assets.find(
      (a) => a.name.includes("win32") && a.name.endsWith(".exe")
    );
    const mac = assets.find(
      (a) => a.name.includes("darwin") && a.name.endsWith(".zip")
    );

    const tagUrl = tag
      ? `https://github.com/${REPO}/releases/tag/${tag}`
      : FALLBACK.windows;

    return {
      windows: win?.browser_download_url ?? tagUrl,
      macos: mac?.browser_download_url ?? tagUrl,
    };
  } catch {
    return FALLBACK;
  }
}

export default async function Page() {
  const downloadUrls = await getDownloadUrls();
  return <Home downloadUrls={downloadUrls} />;
}
