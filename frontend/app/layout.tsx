import type { Metadata, Viewport } from "next";
import { Noto_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const sans = Noto_Sans({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SAFI KARGO",
  description: "Расонидани бор аз Хитой ба Тоҷикистон",
  applicationName: "SAFI KARGO",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SAFI KARGO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E53935",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tg">
      <body className={`${sans.className} ${sans.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
