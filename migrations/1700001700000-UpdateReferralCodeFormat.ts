import { MigrationInterface, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SPECIALS = '!@$%*-_';

function randomChar(charset: string): string {
  return charset[crypto.randomInt(charset.length)];
}

// Mirrors src/users/utils/referral-code.ts at the time this migration was
// written. Duplicated intentionally - migrations are a historical record and
// shouldn't depend on application code that may change later.
function generateReferralCodeCandidate(): string {
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

  return `CEL${parts.join('')}`;
}

export class UpdateReferralCodeFormat1700001700000
  implements MigrationInterface
{
  name = 'UpdateReferralCodeFormat1700001700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const users: { id: string }[] = await queryRunner.query(
      `SELECT id FROM "users"`
    );

    const usedCodes = new Set<string>();
    for (const { id } of users) {
      let code: string;
      do {
        code = generateReferralCodeCandidate();
      } while (usedCodes.has(code));
      usedCodes.add(code);

      await queryRunner.query(
        `UPDATE "users" SET "referralCode" = $1 WHERE id = $2`,
        [code, id]
      );
    }
  }

  public async down(): Promise<void> {
    // The pre-migration codes weren't preserved anywhere - not reversible.
  }
}
