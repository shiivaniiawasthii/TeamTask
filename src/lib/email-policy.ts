import crypto from "crypto";

/**
 * Workspace-wide email domain restriction for registration/invites.
 *
 * Reads ALLOWED_EMAIL_DOMAINS from env (comma-separated). If set, only users
 * with email addresses in those domains can register or be invited.
 * If not set, registration is open to any domain.
 *
 * Example: ALLOWED_EMAIL_DOMAINS="cognifai.in,company.com"
 */
function getAllowedDomains(): string[] | null {
  const envVal = process.env.ALLOWED_EMAIL_DOMAINS?.trim();
  if (!envVal) return null;
  return envVal.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

const ALLOWED_DOMAINS = getAllowedDomains();

export function isAllowedEmail(email: string): boolean {
  if (!ALLOWED_DOMAINS) return true;
  const lowered = email.toLowerCase().trim();
  const domain = lowered.split("@")[1];
  return domain ? ALLOWED_DOMAINS.includes(domain) : false;
}

export function emailDomainError(): string {
  if (!ALLOWED_DOMAINS) return "Invalid email address.";
  if (ALLOWED_DOMAINS.length === 1) {
    return `Only @${ALLOWED_DOMAINS[0]} email addresses are allowed.`;
  }
  return `Only emails from: ${ALLOWED_DOMAINS.join(", ")} are allowed.`;
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
