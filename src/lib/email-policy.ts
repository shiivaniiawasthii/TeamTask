import crypto from "crypto";

/**
 * Workspace-wide email policy.
 *
 * Reads ALLOWED_EMAIL_DOMAIN from env (defaults to "cognifai.in"). All
 * registration + invite flows go through `isAllowedEmail` so the rule can be
 * changed in one place.
 *
 * Set ALLOWED_EMAIL_DOMAIN="" to disable the lockdown entirely (e.g. for dev).
 */
export const ALLOWED_DOMAIN =
  process.env.ALLOWED_EMAIL_DOMAIN === ""
    ? null
    : (process.env.ALLOWED_EMAIL_DOMAIN ?? "cognifai.in");

export function isAllowedEmail(email: string): boolean {
  if (!ALLOWED_DOMAIN) return true;
  const lowered = email.toLowerCase().trim();
  return lowered.endsWith(`@${ALLOWED_DOMAIN}`);
}

export function emailDomainError(): string {
  return ALLOWED_DOMAIN
    ? `Only @${ALLOWED_DOMAIN} email addresses are allowed.`
    : "Invalid email address.";
}

/**
 * Generate a short, human-friendly temporary password for invited users.
 * Format: 4 lowercase letters + 4 digits, e.g. "qfha-3471".
 * Random source: Node's crypto, not Math.random.
 */
export function generateTempPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz"; // no l, i, o for clarity
  const digits = "23456789";
  const pickFrom = (chars: string, n: number) =>
    Array.from({ length: n }, () =>
      chars.charAt(crypto.randomInt(0, chars.length)),
    ).join("");
  return `${pickFrom(letters, 4)}-${pickFrom(digits, 4)}`;
}
