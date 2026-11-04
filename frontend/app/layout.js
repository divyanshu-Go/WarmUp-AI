// frontend/app/layout.js
import { Google_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

import Header from "@/components/Header";
import Providers from "@/components/Providers";

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  weight: "variable",
  adjustFontFallback: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "WarmUp | AI Interview Preparation",
  description:
    "Prepare for interviews with personalized questions and AI-powered interview practice.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${googleSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${googleSans.className} min-h-screen flex flex-col`}>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}