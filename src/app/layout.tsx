import type { Metadata, Viewport } from "next";
import { Abhaya_Libre, Cinzel, Noto_Serif_Sinhala, Poppins } from "next/font/google";
import { AppBoot } from "@/components/SplashScreen";
import { MINI_LOGO_SRC, SPLASH_LOGO_SRC } from "@/lib/brand";
import "./globals.css";

const sinhala = Noto_Serif_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
  weight: ["400", "600", "700"],
});

const fmAbhaya = Abhaya_Libre({
  variable: "--font-fm-abhaya",
  subsets: ["sinhala", "latin"],
  weight: ["400", "600", "700", "800"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#12070a",
};

export const metadata: Metadata = {
  title: "හිඟන්නා",
  description: "Realtime multiplayer card game — King, Queen, Beggar",
  appleWebApp: {
    capable: true,
    title: "හිඟන්නා",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${sinhala.variable} ${fmAbhaya.variable} ${cinzel.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preload" href={SPLASH_LOGO_SRC} as="image" type="image/webp" />
        <link rel="preload" href={MINI_LOGO_SRC} as="image" type="image/webp" />
      </head>
      <body className="min-h-full bg-[#12070a]" suppressHydrationWarning>
        <AppBoot>{children}</AppBoot>
      </body>
    </html>
  );
}
