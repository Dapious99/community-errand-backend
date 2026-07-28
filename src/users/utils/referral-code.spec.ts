import { generateReferralCodeCandidate } from "./referral-code";

describe("generateReferralCodeCandidate", () => {
  it("always starts with CEL followed by exactly 5 characters", () => {
    const code = generateReferralCodeCandidate();

    expect(code).toMatch(/^CEL.{5}$/);
  });

  it("composes the 5 trailing characters from exactly 2 digits, 2 letters, and 1 special character", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateReferralCodeCandidate().slice(3);

      const digits = suffix.match(/[0-9]/g) ?? [];
      const letters = suffix.match(/[A-Z]/g) ?? [];
      const specials = suffix.match(/[^0-9A-Z]/g) ?? [];

      expect(digits).toHaveLength(2);
      expect(letters).toHaveLength(2);
      expect(specials).toHaveLength(1);
    }
  });

  it("shuffles the order rather than always producing the same layout", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateReferralCodeCandidate())
    );

    // Vanishingly unlikely to collide on the full 8-char code if shuffling
    // (and the underlying randomness) is actually working.
    expect(codes.size).toBe(20);
  });
});
