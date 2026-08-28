import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoshin Kanri",
  description: "Policy deployment — annual plan, quarterly PDCA review",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
          The desktop app shell is a fixed-height frame with its own scrolling
          panes - right for a dense grid, wrong for a phone, where the browser
          chrome moves and the keyboard takes half the viewport. Below `sm` the
          page scrolls the way every other page on a phone does.
        */}
        <body className="min-h-screen sm:h-screen sm:overflow-hidden">{children}</body>
    </html>
  );
}
