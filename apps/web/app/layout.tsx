import { Agentation } from "agentation";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-press",
  weight: "400",
});

export const metadata: Metadata = {
  description:
    "A tiny pixel-art sailing game. Learn the wind, the no-go zone, tacking and gybing by sailing a little dinghy.",
  title: "Tiller — learn to sail a dinghy",
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
      className={`${geistSans.variable} ${geistMono.variable} ${pressStart.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overscroll-none">
        {children}
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
