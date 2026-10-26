import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { brand, demo } from "@/lib/config";
import "./globals.css";
import "./premium.css";
import "@fontsource-variable/manrope";
import "./obsidian.css";
export const viewport: Viewport = {
  themeColor: "#0e111b",
  colorScheme: "dark",
};
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
  openGraph: {
    title: brand.name,
    description: brand.tagline,
    images: ["/social.png"],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const body = (
    <html
      lang="en"
      style={
        {
          "--orange": /^#[a-fA-F0-9]{6}$/.test(
            process.env.NEXT_PUBLIC_ACCENT || "",
          )
            ? process.env.NEXT_PUBLIC_ACCENT
            : undefined,
        } as CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
  return !demo && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider>{body}</ClerkProvider>
  ) : (
    body
  );
}
