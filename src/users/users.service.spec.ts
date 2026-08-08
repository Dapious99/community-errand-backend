import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConflictException } from "@nestjs/common";
import { UsersService } from "./users.service";
import { User } from "./entities/user.entity";
import { RatingsService } from "../ratings/ratings.service";
import { SettingsService } from "../settings/settings.service";

describe("UsersService", () => {
  let service: UsersService;
  let usersRepo: any;
  let settingsService: jest.Mocked<SettingsService>;

  const user = { id: "user-1", email: "user@example.com" };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(user),
            create: jest.fn((data) => ({ id: "new-user-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: RatingsService, useValue: {} },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn((key: string, fallback: any) =>
              Promise.resolve(fallback)
            ),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    usersRepo = module.get(getRepositoryToken(User));
    settingsService = module.get(SettingsService);
  });

  describe("create", () => {
    const dto = {
      email: "new@example.com",
      name: "New User",
      password: "password123",
    } as any;

    it("generates a unique referral code for the new user", async () => {
      usersRepo.findOne.mockResolvedValue(null); // no existing user, no code collision

      const result: any = await service.create(dto);

      expect(result.referralCode).toMatch(/^CEL.{5}$/);
    });

    it("resolves a valid referralCode to the referrer's id", async () => {
      usersRepo.findOne
        .mockResolvedValueOnce(null) // existing-user-by-email/phone check
        .mockResolvedValueOnce({ id: "referrer-1", referralCode: "ABCD1234" }) // findByReferralCode
        .mockResolvedValueOnce(null); // referral-code-collision check

      const result: any = await service.create({
        ...dto,
        referralCode: "ABCD1234",
      });

      expect(result.referredByUserId).toBe("referrer-1");
    });

    it("silently ignores an unknown referralCode instead of failing registration", async () => {
      usersRepo.findOne
        .mockResolvedValueOnce(null) // existing-user check
        .mockResolvedValueOnce(null) // findByReferralCode - not found
        .mockResolvedValueOnce(null); // collision check

      const result: any = await service.create({
        ...dto,
        referralCode: "UNKNOWN1",
      });

      expect(result.referredByUserId).toBeUndefined();
    });
  });

  describe("update", () => {
    it("allows the first role change and stamps roleChangedAt", async () => {
      usersRepo.findOne.mockResolvedValueOnce({
        ...user,
        role: "both",
        roleChangedAt: null,
      });

      const result: any = await service.update(user.id, { role: "runner" } as any);

      expect(result.role).toBe("runner");
      expect(result.roleChangedAt).toBeInstanceOf(Date);
    });

    it("rejects a second role change", async () => {
      usersRepo.findOne.mockResolvedValueOnce({
        ...user,
        role: "runner",
        roleChangedAt: new Date("2024-01-01"),
      });

      await expect(
        service.update(user.id, { role: "requester" } as any)
      ).rejects.toThrow(ConflictException);
    });

    it("allows saving without touching role when it's unchanged", async () => {
      usersRepo.findOne.mockResolvedValueOnce({
        ...user,
        role: "both",
        roleChangedAt: new Date("2024-01-01"),
      });

      const result: any = await service.update(user.id, {
        role: "both",
        name: "New Name",
      } as any);

      expect(result.name).toBe("New Name");
    });

    it("rejects a phone number already used by another account", async () => {
      usersRepo.findOne
        .mockResolvedValueOnce({ ...user, phone: "+2348011111111" }) // this.findOne(id)
        .mockResolvedValueOnce({ id: "other-user", phone: "+2348022222222" }); // conflict check

      await expect(
        service.update(user.id, { phone: "+2348022222222" } as any)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("recordErrandFailure", () => {
    it("just increments the streak below the 3-strike threshold", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 1,
        banEscalationLevel: 0,
      });

      const result = await service.recordErrandFailure(user.id);

      expect(result.consecutiveErrandFailures).toBe(2);
      expect(result.runnerBannedUntil).toBeUndefined();
      expect(result.permanentlyBannedFromPicking).toBeUndefined();
    });

    it("issues a 72-hour ban on the 1st escalation and resets the streak", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 2,
        banEscalationLevel: 0,
      });

      const before = Date.now();
      const result = await service.recordErrandFailure(user.id);

      expect(result.consecutiveErrandFailures).toBe(0);
      expect(result.banEscalationLevel).toBe(1);
      expect(result.runnerBannedUntil.getTime() - before).toBeCloseTo(
        72 * 60 * 60 * 1000,
        -3
      );
    });

    it("issues a 7-day ban on the 2nd escalation", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 2,
        banEscalationLevel: 1,
      });

      const before = Date.now();
      const result = await service.recordErrandFailure(user.id);

      expect(result.banEscalationLevel).toBe(2);
      expect(result.runnerBannedUntil.getTime() - before).toBeCloseTo(
        7 * 24 * 60 * 60 * 1000,
        -3
      );
    });

    it("permanently bans on the 3rd escalation instead of setting a timed ban", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 2,
        banEscalationLevel: 2,
      });

      const result = await service.recordErrandFailure(user.id);

      expect(result.permanentlyBannedFromPicking).toBe(true);
      expect(result.runnerBannedUntil).toBeUndefined();
      // Escalation level is left as-is - a lifted permanent ban should go
      // straight back to permanent on the next violation, not restart at 72h.
      expect(result.banEscalationLevel).toBe(2);
    });

    it("honors an admin-configured ban_strike_threshold override", async () => {
      settingsService.get.mockImplementation((key: string, fallback: any) =>
        Promise.resolve(key === "ban_strike_threshold" ? 1 : fallback)
      );
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 0,
        banEscalationLevel: 0,
      });

      const result = await service.recordErrandFailure(user.id);

      expect(result.runnerBannedUntil).toBeInstanceOf(Date);
      expect(result.consecutiveErrandFailures).toBe(0);
    });

    it("honors an admin-configured ban_duration_ladder_hours override", async () => {
      settingsService.get.mockImplementation((key: string, fallback: any) =>
        Promise.resolve(key === "ban_duration_ladder_hours" ? [1] : fallback)
      );
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutiveErrandFailures: 2,
        banEscalationLevel: 0,
      });

      const before = Date.now();
      const result = await service.recordErrandFailure(user.id);

      expect(result.runnerBannedUntil.getTime() - before).toBeCloseTo(
        1 * 60 * 60 * 1000,
        -3
      );
    });
  });

  describe("liftPermanentBan", () => {
    it("clears the permanent ban without touching banEscalationLevel", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        permanentlyBannedFromPicking: true,
        banEscalationLevel: 2,
        runnerBannedUntil: new Date(),
      });

      const result = await service.liftPermanentBan(user.id);

      expect(result.permanentlyBannedFromPicking).toBe(false);
      expect(result.runnerBannedUntil).toBeUndefined();
      expect(result.banEscalationLevel).toBe(2);
    });
  });

  describe("recordPostingFailure", () => {
    it("just increments the streak below the 3-strike threshold", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutivePostingFailures: 1,
        postingBanEscalationLevel: 0,
      });

      const result = await service.recordPostingFailure(user.id);

      expect(result.consecutivePostingFailures).toBe(2);
      expect(result.requesterBannedUntil).toBeUndefined();
      expect(result.permanentlyBannedFromPosting).toBeUndefined();
    });

    it("issues a 72-hour posting ban on the 1st escalation and resets the streak", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutivePostingFailures: 2,
        postingBanEscalationLevel: 0,
      });

      const before = Date.now();
      const result = await service.recordPostingFailure(user.id);

      expect(result.consecutivePostingFailures).toBe(0);
      expect(result.postingBanEscalationLevel).toBe(1);
      expect(result.requesterBannedUntil.getTime() - before).toBeCloseTo(
        72 * 60 * 60 * 1000,
        -3
      );
    });

    it("issues a 7-day posting ban on the 2nd escalation", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutivePostingFailures: 2,
        postingBanEscalationLevel: 1,
      });

      const before = Date.now();
      const result = await service.recordPostingFailure(user.id);

      expect(result.postingBanEscalationLevel).toBe(2);
      expect(result.requesterBannedUntil.getTime() - before).toBeCloseTo(
        7 * 24 * 60 * 60 * 1000,
        -3
      );
    });

    it("permanently bans posting on the 3rd escalation instead of setting a timed ban", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        consecutivePostingFailures: 2,
        postingBanEscalationLevel: 2,
      });

      const result = await service.recordPostingFailure(user.id);

      expect(result.permanentlyBannedFromPosting).toBe(true);
      expect(result.requesterBannedUntil).toBeUndefined();
      expect(result.postingBanEscalationLevel).toBe(2);
    });
  });

  describe("resetPostingFailures", () => {
    it("zeroes the consecutive-cancellation streak", async () => {
      await service.resetPostingFailures(user.id);

      expect(usersRepo.update).toHaveBeenCalledWith(user.id, {
        consecutivePostingFailures: 0,
      });
    });
  });

  describe("liftPermanentPostingBan", () => {
    it("clears the permanent posting ban without touching postingBanEscalationLevel", async () => {
      usersRepo.findOne.mockResolvedValue({
        ...user,
        permanentlyBannedFromPosting: true,
        postingBanEscalationLevel: 2,
        requesterBannedUntil: new Date(),
      });

      const result = await service.liftPermanentPostingBan(user.id);

      expect(result.permanentlyBannedFromPosting).toBe(false);
      expect(result.requesterBannedUntil).toBeUndefined();
      expect(result.postingBanEscalationLevel).toBe(2);
    });
  });
});
