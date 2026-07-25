import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Enums
    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('requester', 'runner', 'both')`
    );
    await queryRunner.query(
      `CREATE TYPE "kyc_status_enum" AS ENUM ('pending', 'approved', 'rejected')`
    );
    await queryRunner.query(
      `CREATE TYPE "errands_category_enum" AS ENUM ('delivery', 'buy_for_me', 'queue', 'repair', 'custom')`
    );
    await queryRunner.query(
      `CREATE TYPE "errands_status_enum" AS ENUM ('open', 'accepted', 'in_progress', 'completed', 'cancelled')`
    );
    await queryRunner.query(
      `CREATE TYPE "errands_urgency_enum" AS ENUM ('low', 'medium', 'high', 'urgent')`
    );
    await queryRunner.query(
      `CREATE TYPE "locations_type_enum" AS ENUM ('pickup', 'dropoff')`
    );
    await queryRunner.query(
      `CREATE TYPE "media_attachments_type_enum" AS ENUM ('image', 'video', 'document')`
    );
    await queryRunner.query(
      `CREATE TYPE "payments_type_enum" AS ENUM ('escrow', 'payout', 'refund')`
    );
    await queryRunner.query(
      `CREATE TYPE "payments_status_enum" AS ENUM ('pending', 'processing', 'success', 'failed', 'cancelled')`
    );

    // users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "phone" character varying,
        "name" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'requester',
        "verified" boolean NOT NULL DEFAULT false,
        "ratingAvg" numeric(3,2) NOT NULL DEFAULT '0',
        "avatarUrl" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_phone" ON "users" ("phone")`);

    // kyc
    await queryRunner.query(`
      CREATE TABLE "kyc" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "bvn" character varying,
        "idCardUrl" character varying,
        "bankAccountNumber" character varying,
        "bankName" character varying,
        "paystackRecipientCode" character varying,
        "status" "kyc_status_enum" NOT NULL DEFAULT 'pending',
        "verifiedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_kyc_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_kyc" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // errands
    await queryRunner.query(`
      CREATE TABLE "errands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "category" "errands_category_enum" NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "tip" numeric(10,2),
        "status" "errands_status_enum" NOT NULL DEFAULT 'open',
        "urgency" "errands_urgency_enum" NOT NULL DEFAULT 'medium',
        "requesterId" uuid NOT NULL,
        "runnerId" uuid,
        "etaMinutes" integer,
        "timeWindowStart" TIMESTAMP,
        "timeWindowEnd" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_errands" PRIMARY KEY ("id"),
        CONSTRAINT "FK_errands_requesterId" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_errands_runnerId" FOREIGN KEY ("runnerId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_errands_status_createdAt" ON "errands" ("status", "createdAt")`
    );

    // locations
    await queryRunner.query(`
      CREATE TABLE "locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "type" "locations_type_enum" NOT NULL,
        "label" character varying NOT NULL,
        "latitude" numeric(10,8),
        "longitude" numeric(11,8),
        CONSTRAINT "PK_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_locations_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE
      )
    `);

    // media_attachments
    await queryRunner.query(`
      CREATE TABLE "media_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "url" character varying NOT NULL,
        "cloudinaryId" character varying,
        "type" "media_attachments_type_enum" NOT NULL DEFAULT 'image',
        CONSTRAINT "PK_media_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_attachments_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE
      )
    `);

    // messages
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "fromUserId" uuid NOT NULL,
        "text" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_fromUserId" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_messages_errandId_createdAt" ON "messages" ("errandId", "createdAt")`
    );

    // ratings
    await queryRunner.query(`
      CREATE TABLE "ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "fromUserId" uuid NOT NULL,
        "toUserId" uuid NOT NULL,
        "rating" integer NOT NULL,
        "review" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ratings_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ratings_fromUserId" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ratings_toUserId" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ratings_toUserId_createdAt" ON "ratings" ("toUserId", "createdAt")`
    );
    await queryRunner.query(`CREATE INDEX "IDX_ratings_errandId" ON "ratings" ("errandId")`);

    // payments
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "type" "payments_type_enum" NOT NULL,
        "status" "payments_status_enum" NOT NULL DEFAULT 'pending',
        "paystackReference" character varying,
        "paystackAuthorizationUrl" character varying,
        "description" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payments_paystackReference" UNIQUE ("paystackReference"),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_errandId_status" ON "payments" ("errandId", "status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_userId_status" ON "payments" ("userId", "status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "ratings"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "media_attachments"`);
    await queryRunner.query(`DROP TABLE "locations"`);
    await queryRunner.query(`DROP TABLE "errands"`);
    await queryRunner.query(`DROP TABLE "kyc"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "payments_type_enum"`);
    await queryRunner.query(`DROP TYPE "media_attachments_type_enum"`);
    await queryRunner.query(`DROP TYPE "locations_type_enum"`);
    await queryRunner.query(`DROP TYPE "errands_urgency_enum"`);
    await queryRunner.query(`DROP TYPE "errands_status_enum"`);
    await queryRunner.query(`DROP TYPE "errands_category_enum"`);
    await queryRunner.query(`DROP TYPE "kyc_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
