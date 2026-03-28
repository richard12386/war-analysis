import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const headlineFont = Newsreader({
  variable: "--font-headline",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://iran-war-desk.local"),
  title: {
    default: "Iran War Desk",
    template: "%s | Iran War Desk",
  },
  description:
    "Redakcni dashboard pro sledovani, trizeni a publikaci aktualit o valce v Iranu.",
  applicationName: "Iran War Desk",
  keywords: [
    "Iran",
    "valka",
    "aktuality",
    "breaking news",
    "analyza konfliktu",
  ],
  openGraph: {
    title: "Iran War Desk",
    description:
      "Prehled incidentu, redakcni watchlist a pripraveny zaklad pro overene zpravodajstvi.",
    type: "website",
    locale: "cs_CZ",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      className={`${headlineFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
