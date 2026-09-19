/**
 * What a shared view says when it lands in somebody's inbox.
 *
 * The wording is the whole of what this module does, and the two things it
 * must never get wrong are stating the period - a spreadsheet of targets with
 * no period on it gets read as the wrong quarter six weeks later - and being
 * honest about the attachment, since a message that mentions a workbook nobody
 * attached sends the reader looking for a file that is not there.
 */

import { describe, expect, it } from "vitest";
import { ATTACHMENT_LIMIT_BYTES, buildShareMessage, shareUrl } from "@/lib/share/message";

const base = {
  to: "ox@honda.example",
  recipientName: "Olivia Xu",
  senderName: "Managing Director",
  viewTitle: "Company sheet — Levels 1 to 3",
  kiCode: "103KI",
  periodLabel: "Q2",
  viewUrl: "https://plan.example/sheet?bu=MC",
};

describe("buildShareMessage", () => {
  it("names who sent it, what it is and which period", () => {
    const message = buildShareMessage(base);
    expect(message.to).toBe("ox@honda.example");
    expect(message.subject).toContain("Managing Director");
    expect(message.subject).toContain("103KI");
    for (const body of [message.text, message.html]) {
      expect(body).toContain("103KI");
      expect(body).toContain("Q2");
      expect(body).toContain("Company sheet");
    }
  });

  it("greets by first name", () => {
    expect(buildShareMessage(base).text).toContain("Hello Olivia,");
  });

  it("carries the link that reopens the same view", () => {
    const message = buildShareMessage(base);
    expect(message.text).toContain("https://plan.example/sheet?bu=MC");
    expect(message.html).toContain('href="https://plan.example/sheet?bu=MC"');
  });

  it("names the attachment when one is travelling", () => {
    const message = buildShareMessage({ ...base, attachmentName: "company-sheet-103ki.xlsx" });
    expect(message.text).toContain("company-sheet-103ki.xlsx");
  });

  /*
   * The case that would otherwise arrive as a silent absence: too large to
   * attach, so the link goes alone. Saying nothing would have the reader
   * hunting for a file the message never carried.
   */
  it("says why the workbook is missing when it was too large", () => {
    const message = buildShareMessage({ ...base, attachmentSkipped: "TOO_LARGE" });
    expect(message.text).toContain("too large to attach");
    expect(message.text).not.toContain("attached as");
  });

  it("mentions no attachment at all when none was asked for", () => {
    const message = buildShareMessage(base);
    expect(message.text).not.toContain("attached");
    expect(message.text).not.toContain("too large");
  });

  it("includes the sender's note when there is one, and nothing when there is not", () => {
    expect(buildShareMessage({ ...base, note: "For Thursday's review" }).text).toContain(
      "For Thursday's review",
    );
    expect(buildShareMessage(base).html).not.toContain("<p></p>");
  });

  // A note is typed by a person and lands inside an HTML mail.
  it("escapes what the sender typed", () => {
    const message = buildShareMessage({ ...base, note: '<script>alert("x")</script>' });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("holds the limit Graph will carry inline", () => {
    expect(ATTACHMENT_LIMIT_BYTES).toBe(3 * 1024 * 1024);
  });
});

describe("shareUrl", () => {
  it("puts the view's own querystring on the sheet's URL", () => {
    const params = new URLSearchParams({ bu: "MC", quarter: "Q2" });
    expect(shareUrl("https://plan.example", params)).toBe(
      "https://plan.example/sheet?bu=MC&quarter=Q2",
    );
  });

  it("tolerates a trailing slash on the configured address", () => {
    expect(shareUrl("https://plan.example/", new URLSearchParams())).toBe(
      "https://plan.example/sheet",
    );
  });
});
