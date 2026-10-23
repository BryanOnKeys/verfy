import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Effects } from "@/components/effects";
import { THEME_COLOR, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Verfy: stop MCP tools that change in secret", template: "%s · Verfy" },
  description:
    "For teams using Claude Code and Cursor: if a tool your agent uses changes in secret, Verfy stops it, fails the pull request in CI, and keeps a signed receipt of every call.",
  applicationName: "Verfy",
  openGraph: {
    type: "website",
    siteName: "Verfy",
    title: "Verfy: stop MCP tools that change in secret",
    description: "MCP tool locks, a GitHub Action and signed receipts for teams using Claude Code and Cursor.",
  },
  twitter: { card: "summary_large_image", title: "Verfy", description: "If a tool your agent uses changes in secret, Verfy stops it and signs a receipt for every call it checks." },
  robots: { index: true, follow: true },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return { width: "device-width", initialScale: 1, themeColor: THEME_COLOR[theme] };
}

const FX_BOOT =
  "(function(d){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.dataset.fx='on';setTimeout(function(){if(!d.dataset.fxReady)delete d.dataset.fx},2500)}catch(e){}})(document.documentElement)";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Light unless the visitor picked dark; the server renders the choice, so a reload never flashes.
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme={theme} data-scroll-behavior="smooth" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks the page as animated before the first paint, so elements that rise in start hidden instead of
            flashing. If the effects script never runs, the mark is removed again and everything stays visible. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: FX_BOOT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <Effects />
      </body>
    </html>
  );
}
