// ─────────────────────────────────────────────────────────────────────────────
// Australian phone-number normalisation.
//
// Reps store contact phones in many formats — "+61 4xx xxx xxx", "0412 345 678",
// "(02) 9000 1234", "0412345678", etc. Twilio and our matching logic both
// need a single canonical form.
//
// Rules:
//   - Strip all non-digit characters except a leading '+'.
//   - Convert leading '0' to '+61' (assumes AU; safe for this CRM).
//   - Leave already-internationalised numbers (+61..., +1...) alone.
//   - Return null for inputs that can't form a valid 10+ digit number.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeAuPhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Strip everything except digits and a single leading +
  let cleaned = trimmed.replace(/[^\d+]/g, '');
  // Drop any + that isn't at the start
  cleaned = cleaned[0] === '+' ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned.replace(/\+/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned.length >= 8 ? cleaned : null;
  }

  // Local AU formats (04xx, 02 xx, 03 xx, etc.)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+61' + cleaned.slice(1);
  }

  // Bare 9-digit AU number without leading 0 (rare but seen in CSV imports)
  if (cleaned.length === 9 && /^[2-478]/.test(cleaned)) {
    return '+61' + cleaned;
  }

  // Fall through — number is in some unrecognised form. Return as-is so it's
  // at least loggable, but mark as suspect by leaving the +-prefix off.
  return cleaned.length >= 8 ? cleaned : null;
}

// Last 9 digits — used as the matching key for phoneMatchesEntity().
// "+61400123456" -> "400123456"
// "0400 123 456" -> "400123456"
// "(02) 9000 1234" -> "290001234"
// Lets us match against contacts whose phones were stored in any AU format.
export function phoneMatchKey(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}
