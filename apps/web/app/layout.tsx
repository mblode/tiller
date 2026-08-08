import { Agentation } from "agentation";
import { GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import localFont from "next/font/local";

import { CraftedBy } from "@/components/crafted-by";

import "./globals.css";

// Glide reads the prose: the how-to steps and the glossary definitions are
// sentences, and a pixel face is the wrong tool for a paragraph. Geist Pixel
// Square stays on for everything the game labels (`font-pixel`), which is where
// the arcade art direction lives.
const glide = localFont({
  display: "swap",
  src: [
    { path: "./fonts/glide-variable.woff2", style: "normal" },
    { path: "./fonts/glide-variable-italic.woff2", style: "italic" },
  ],
  variable: "--font-glide",
  weight: "100 950",
});
const siteUrl = "https://blode.co/tiller";
const siteTitle = "Tiller: learn to sail a dinghy";
const siteDescription =
  "A tiny pixel-art sailing game. Learn the wind, the no-go zone, tacking and gybing by sailing a little dinghy.";

export const metadata: Metadata = {
  alternates: {
    canonical: siteUrl,
  },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  openGraph: {
    description: siteDescription,
    siteName: "Tiller",
    title: siteTitle,
    type: "website",
    url: siteUrl,
  },
  title: siteTitle,
  twitter: {
    card: "summary_large_image",
    description: siteDescription,
    title: siteTitle,
  },
  verification: {
    google: "mFwyBIbXTaKK4uF_NA0MzVWFyY40hPgBjFObg3rje04",
  },
};

export const viewport = {
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b3a4a",
  userScalable: false,
  viewportFit: "cover",
  width: "device-width",
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${glide.variable} ${GeistPixelSquare.variable} h-full antialiased`}
    >
      <head>
        <link href={process.env.NEXT_PUBLIC_POSTHOG_HOST} rel="preconnect" />
      </head>
      <body className="min-h-full flex flex-col overscroll-none">
        {children}
        <footer className="flex justify-center p-4">
          <CraftedBy />
        </footer>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
