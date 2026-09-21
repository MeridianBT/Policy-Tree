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

          The frame is measured in `svh`, not `vh`, and that is the whole of an
          iPad bug. Safari's `vh` is the *large* viewport - the page as it would
          be with the browser's chrome collapsed - so `h-screen` made this body
          taller than the screen it was on, the document scrolled by the height
          of the tab bar, and the nav went up underneath it with no way to
          scroll it back, because the body it lives in hides its own overflow.
          `svh` is the viewport with the chrome showing: the one measurement
          that is never taller than what you can see. `dvh` would also fit, but
          it changes as the chrome hides and a virtualised grid re-measuring
          mid-scroll is a second bug in place of the first.
        */}
      <body className="min-h-dvh sm:h-svh sm:overflow-hidden">{children}</body>
    </html>
  );
}
