import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = { title: "Hoshin Kanri — print" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#fff" }}>{children}</body>
    </html>
  );
}
