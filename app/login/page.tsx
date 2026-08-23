import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signIn } from "@/lib/auth/config";
import { entraConfigured, passwordSignInEnabled } from "@/lib/auth/providers";
import { AuthError } from "next-auth";

/**
 * An unprovisioned employee must never see the same message as a wrong
 * password: they have signed in correctly and simply have no account here,
 * and telling them to check their password would send them to the wrong
 * help desk.
 */
const MESSAGES: Record<string, string> = {
  credentials: "That email and password did not match an active account.",
  notprovisioned:
    "Your Microsoft account is not set up for Hoshin Kanri yet. Ask an admin for access.",
  inactive: "That account has been deactivated. Ask an admin to reactivate it.",
  sso: "Microsoft sign-in did not complete. Try again, or ask an admin if it keeps failing.",
  // Auth.js's own codes, which arrive capitalised. `Configuration` is what a
  // wrong or expired client secret looks like from here, and it needs to point
  // at the administrator rather than leave the user retrying forever.
  configuration:
    "Microsoft sign-in is not configured correctly. An administrator needs to check the Entra credentials.",
  accessdenied: "Microsoft did not authorise that sign-in.",
  verification: "That sign-in link is no longer valid. Try again.",
};

/** Auth.js sends `Configuration`; our own redirects send `notprovisioned`. */
function messageFor(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code.toLowerCase()] ?? MESSAGES.sso;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect(params.next ?? "/sheet");

  const next = params.next ?? "/sheet";
  const message = messageFor(params.error);

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? "").toLowerCase().trim(),
        password: String(formData.get("password") ?? ""),
        redirectTo: String(formData.get("next") ?? "/sheet"),
      });
    } catch (error) {
      if (error instanceof AuthError) redirect("/login?error=credentials");
      throw error;
    }
  }

  async function authenticateWithMicrosoft(formData: FormData) {
    "use server";
    // Checked before handing over to Auth.js, which would otherwise redirect
    // internally and strand the user on a bare sign-in screen.
    if (!entraConfigured()) redirect("/login?error=configuration");
    try {
      await signIn("microsoft-entra-id", {
        redirectTo: String(formData.get("next") ?? "/sheet"),
      });
    } catch (error) {
      // The errors thrown out of the provider's profile() arrive here wrapped
      // by Auth.js, so the cause is what carries the reason the person needs.
      if (error instanceof AuthError) {
        const name = (error.cause as { err?: Error } | undefined)?.err?.name;
        if (name === "SsoAccountNotProvisionedError") redirect("/login?error=notprovisioned");
        if (name === "SsoAccountInactiveError") redirect("/login?error=inactive");
        redirect("/login?error=sso");
      }
      throw error;
    }
  }

  return (
    <main className="flex h-full items-center justify-center bg-paper-sunken">
      <div className="w-80 border border-rule-strong bg-paper p-6">
        <h1 className="text-[15px] font-semibold">Hoshin Kanri</h1>
        <p className="mt-1 text-[11px] text-ink-muted">Policy deployment — sign in to continue.</p>

        <form action={authenticateWithMicrosoft}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 border border-rule-strong px-3 py-2 text-[12px] hover:bg-paper-sunken"
          >
            <MicrosoftMark />
            Sign in with Microsoft
          </button>
        </form>

        {message && (
          <p className="mt-3 border border-rule px-2 py-1 text-[11px]" style={{ color: "#B3261E" }}>
            {message}
          </p>
        )}

        {passwordSignInEnabled && <PasswordForm authenticate={authenticate} next={next} />}
      </div>
    </main>
  );
}

/** The four-square Microsoft logo, drawn rather than fetched - the page
 *  loads before any session exists and pulls in nothing external. */
function MicrosoftMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0" y="0" width="7" height="7" fill="#F25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7FBA00" />
      <rect x="0" y="9" width="7" height="7" fill="#00A4EF" />
      <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
    </svg>
  );
}

/** Development only. Production authenticates against the corporate
 *  directory, so there is no local password to get wrong. */
function PasswordForm({
  authenticate,
  next,
}: {
  authenticate: (formData: FormData) => Promise<void>;
  next: string;
}) {
  return (
    <form action={authenticate}>
      <div className="mt-5 flex items-center gap-2">
        <span className="h-px flex-1 bg-rule" />
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          or, in development
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <input type="hidden" name="next" value={next} />

      <label className="mt-3 block text-[11px] text-ink-muted">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mt-1 w-full border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink"
        />
      </label>

      <label className="mt-3 block text-[11px] text-ink-muted">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full border border-rule bg-paper px-2 py-1.5 text-[13px] text-ink"
        />
      </label>

      <button
        type="submit"
        className="mt-4 w-full border border-rule-strong px-3 py-1.5 text-[12px] hover:bg-paper-sunken"
      >
        Sign in with a password
      </button>
    </form>
  );
}
