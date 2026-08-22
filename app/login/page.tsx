import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signIn } from "@/lib/auth/config";
import { AuthError } from "next-auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect(params.next ?? "/sheet");

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? "").toLowerCase().trim(),
        password: String(formData.get("password") ?? ""),
        redirectTo: String(formData.get("next") ?? "/sheet"),
      });
    } catch (error) {
      if (error instanceof AuthError) redirect("/login?error=1");
      throw error;
    }
  }

  return (
    <main className="flex h-full items-center justify-center bg-paper-sunken">
      <form
        action={authenticate}
        className="w-80 border border-rule-strong bg-paper p-6"
      >
        <h1 className="text-[15px] font-semibold">Hoshin Kanri</h1>
        <p className="mt-1 text-[11px] text-ink-muted">Policy deployment — sign in to continue.</p>

        <input type="hidden" name="next" value={params.next ?? "/sheet"} />

        <label className="mt-5 block text-[11px] text-ink-muted">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
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

        {params.error && (
          <p className="mt-3 border border-rule px-2 py-1 text-[11px]" style={{ color: "#B3261E" }}>
            That email and password did not match an active account.
          </p>
        )}

        <button
          type="submit"
          className="mt-5 w-full bg-ink px-3 py-1.5 text-[12px] text-paper hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
