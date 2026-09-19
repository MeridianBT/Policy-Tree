"use client";

/**
 * Everything that takes this view out of the application, behind one control.
 *
 * Export and Print used to sit in the header as two labelled links, and adding
 * two more - email, and a page sized to a slide - would have spent most of the
 * title row on actions nobody uses more than once a sitting. A menu is the
 * ordinary answer: the actions collapse, the filters stay on show, because it
 * is the filters somebody adjusts ten times an hour.
 *
 * The button keeps its word beside its icon. A bare glyph is a guess for
 * anyone who has not used the app before, and icon-plus-word is still narrower
 * than the links it replaces.
 */

import { useEffect, useState } from "react";
import { Download, Mail, Printer, Presentation, Share2 } from "lucide-react";
import { Menu, MenuItem, MenuLink } from "@/components/ui/primitives";
import { canSendMail, shareCurrentView, shareRecipients, type ShareRecipient } from "@/lib/share/actions";

export function ShareMenu({
  exportUrl,
  printUrl,
  slideUrl,
  shareParams,
  viewTitle,
  periodLabel,
  outputTitle,
}: {
  exportUrl?: string;
  /** Absent in the Across view, which the portrait print page would not match. */
  printUrl?: string;
  slideUrl: string;
  /** The querystring the view is described by, for the emailed link and file. */
  shareParams: string;
  viewTitle: string;
  periodLabel: string;
  /** Whether the outputs carry filters, said the same way the links used to. */
  outputTitle: string;
}) {
  const [mode, setMode] = useState<"menu" | "email">("menu");

  return (
    <Menu
      label="Share"
      icon={<Share2 size={12} />}
      title={outputTitle}
      width={mode === "email" ? 300 : 232}
      // Reopening starts at the top. A menu that reopens mid-form is one of
      // those small wrongnesses nobody reports and everybody notices.
      onOpenChange={(open) => {
        if (open) setMode("menu");
      }}
    >
      {(close) =>
        mode === "email" ? (
          <EmailPanel
            shareParams={shareParams}
            viewTitle={viewTitle}
            periodLabel={periodLabel}
            exportUrl={exportUrl}
            onDone={close}
          />
        ) : (
          <>
            {exportUrl && (
              <MenuLink href={exportUrl} icon={<Download size={12} />} title={outputTitle}>
                Export to Excel
              </MenuLink>
            )}
            <MenuItem icon={<Mail size={12} />} onClick={() => setMode("email")}>
              Email current view
            </MenuItem>
            {printUrl && (
              <MenuLink href={printUrl} icon={<Printer size={12} />} newTab title={outputTitle}>
                Print view
              </MenuLink>
            )}
            <MenuLink
              href={slideUrl}
              icon={<Presentation size={12} />}
              newTab
              title="A page the size of a PowerPoint slide — print it to PDF and drop it on a slide"
            >
              Slide view (16:9)
            </MenuLink>
          </>
        )
      }
    </Menu>
  );
}

/**
 * Send this view to somebody who already has an account here.
 *
 * The recipient list is fetched when the panel opens rather than rendered into
 * every page: it is a list of colleagues, it changes rarely, and nobody should
 * pay for it on a screen they are only reading.
 */
function EmailPanel({
  shareParams,
  viewTitle,
  periodLabel,
  exportUrl,
  onDone,
}: {
  shareParams: string;
  viewTitle: string;
  periodLabel: string;
  exportUrl?: string;
  onDone: () => void;
}) {
  const [people, setPeople] = useState<ShareRecipient[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([shareRecipients(), canSendMail()]).then(([recipients, can]) => {
      if (!live) return;
      setPeople(recipients);
      setConfigured(can);
    });
    return () => {
      live = false;
    };
  }, []);

  async function send() {
    setSending(true);
    const outcome = await shareCurrentView({
      recipientId,
      params: shareParams,
      note: note.trim() || undefined,
      viewTitle,
      periodLabel,
      attach,
    });
    setSending(false);
    setResult(outcome.message);
    if (outcome.ok) setTimeout(onDone, 1600);
  }

  /*
   * Said plainly rather than hidden. A deployment without the mail permission
   * granted is a perfectly ordinary state - the reminder run has always had to
   * cope with it - and a Send button that silently does nothing would be worse
   * than a sentence explaining why the download is the way to do this today.
   */
  if (configured === false) {
    return (
      <div className="px-2 py-1.5 text-[11px] text-ink-muted">
        <p className="mb-2 text-ink">Mail is not set up on this deployment.</p>
        <p>
          Nothing can be sent from here yet.{" "}
          {exportUrl && (
            <>
              Use{" "}
              <a className="underline" href={exportUrl}>
                Export to Excel
              </a>{" "}
              and attach it yourself.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 text-[11px] text-ink-muted">
      <p className="mb-1.5 text-ink">Email this view</p>

      <label className="mb-1.5 block">
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-faint">To</span>
        <select
          value={recipientId}
          onChange={(event) => setRecipientId(event.target.value)}
          className="w-full rounded-sm border border-rule bg-paper px-1.5 py-1 text-[11px] text-ink"
        >
          <option value="">{people === null ? "Loading…" : "Choose a colleague"}</option>
          {(people ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.orgUnitCode ? ` · ${person.orgUnitCode}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-1.5 block">
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-faint">
          Note (optional)
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Why you are sending it"
          className="w-full rounded-sm border border-rule bg-paper px-1.5 py-1 text-[11px] text-ink placeholder:text-ink-faint"
        />
      </label>

      <label className="mb-2 flex items-center gap-1.5">
        <input type="checkbox" checked={attach} onChange={(event) => setAttach(event.target.checked)} />
        Attach the workbook
      </label>

      {/* The recipient signs in to see the link, but the attachment travels
          wherever their mailbox does. Worth one line, once, at the moment of
          sending rather than in a policy nobody reads. */}
      {attach && (
        <p className="mb-2 text-[10px] text-ink-faint">
          The workbook carries the figures as filtered, and leaves the application with it.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!recipientId || sending}
          onClick={send}
          className="rounded-sm bg-ink px-2 py-1 text-[11px] text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={onDone} className="text-[11px] text-ink-muted hover:underline">
          Cancel
        </button>
      </div>

      {result && <p className="mt-2 text-[11px] text-ink">{result}</p>}
    </div>
  );
}
