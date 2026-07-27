import { Agentation } from "agentation";
import { GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { CraftedBy } from "@/components/crafted-by";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} ${GeistPixelSquare.variable} h-full antialiased`}
    >
      <head>
        <link href="https://us.i.posthog.com" rel="preconnect" />
        <link href="https://us-assets.i.posthog.com" rel="dns-prefetch" />
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
