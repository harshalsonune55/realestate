import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Al Manara PMS — Property Management System",
  description:
    "Internal property management system: contracts, cheques, renewals, maintenance and approvals.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#080b12" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `data-theme` is rewritten by the head script before paint, so the server
    // value and the client value legitimately differ on the first pass.
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
