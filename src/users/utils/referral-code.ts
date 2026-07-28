import * as crypto from "crypto";

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Kept away from URL-reserved/ambiguous characters (&, ?, /, \, #, quotes,
// spaces) since a referral code may end up in a shared deep link.
const SPECIALS = "!@$%*-_";

function randomChar(charset: string): string {
  return charset[crypto.randomInt(charset.length)];
}

/**
 * Always "CEL" followed by 5 shuffled characters: 2 digits, 2 letters, and 1
 * special character - e.g. "CEL7K@3B". Not guaranteed unique on its own;
 * callers must check for collisions against existing codes.
 */
export function generateReferralCodeCandidate(): string {
  const parts = [
    randomChar(DIGITS),
    randomChar(DIGITS),
    randomChar(LETTERS),
    randomChar(LETTERS),
    randomChar(SPECIALS),
  ];

  for (let i = parts.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return `CEL${parts.join("")}`;
}
