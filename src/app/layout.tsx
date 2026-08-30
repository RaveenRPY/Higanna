import type { Metadata, Viewport } from "next";
import { Cinzel, Noto_Serif_Sinhala, Poppins } from "next/font/google";
import "./globals.css";

const sinhala = Noto_Serif_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
  weight: ["400", "600", "700"],
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
    <html lang="en" className={`${poppins.variable} ${sinhala.variable} ${cinzel.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
