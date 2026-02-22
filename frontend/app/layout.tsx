import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ThemeProvider from "@/components/ThemeProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Voice AI Platform",
  description: "Retell AI Clone — Voice AI Agent Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} font-sans antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        <ThemeProvider>
          <Sidebar />
          <main className="ml-64 min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
