import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hoshin Kanri",
  description: "Policy deployment — annual plan, quarterly PDCA review",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
