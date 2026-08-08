import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AdminAuthService } from "./admin-auth.service";
import { Admin } from "./entities/admin.entity";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";

describe("AdminAuthService", () => {
  let service: AdminAuthService;
  let repo: any;
  let jwtService: jest.Mocked<JwtService>;
  let otpService: jest.Mocked<OtpService>;

  const admin = {
    id: "admin-1",
    email: "admin@example.com",
    name: "Ops",
    passwordHash: "",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        {
          provide: getRepositoryToken(Admin),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue("admin-token") },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, fallback?: any) => fallback) },
        },
        {
          provide: OtpService,
          useValue: {
            request: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn(),
            resend: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(AdminAuthService);
    repo = module.get(getRepositoryToken(Admin));
    jwtService = module.get(JwtService);
    otpService = module.get(OtpService);
  });

  describe("login", () => {
    it("throws when no admin has that email", async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: "nope@example.com", password: "password123" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when the password does not match", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      repo.findOne.mockResolvedValue({ ...admin, passwordHash: hash });

      await expect(
        service.login({ email: admin.email, password: "wrong-password" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("requests an OTP instead of returning a token on valid credentials", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      repo.findOne.mockResolvedValue({ ...admin, passwordHash: hash });

      const result = await service.login({
        email: admin.email,
        password: "correct-password",
      });

      expect(result).toEqual({
        requiresOtp: true,
        message: expect.any(String),
      });
      expect(otpService.request).toHaveBeenCalledWith(
        OtpPurpose.ADMIN_LOGIN_VERIFICATION,
        admin.id,
        admin.email
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe("verifyOtp", () => {
    it("throws for an unknown email without revealing that it's unknown", async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ email: "nope@example.com", code: "123456" })
      ).rejects.toThrow(BadRequestException);
    });

    it("returns an admin token on a valid code", async () => {
      repo.findOne.mockResolvedValue(admin);

      const result = await service.verifyOtp({
        email: admin.email,
        code: "123456",
      });

      expect(otpService.verify).toHaveBeenCalledWith(
        OtpPurpose.ADMIN_LOGIN_VERIFICATION,
        admin.id,
        "123456"
      );
      expect(result.accessToken).toBe("admin-token");
      expect(result.admin).toEqual({
        id: admin.id,
        email: admin.email,
        name: admin.name,
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: admin.id, email: admin.email },
        expect.any(Object)
      );
    });
  });

  describe("resendOtp", () => {
    it("gives the same generic response whether or not the account has a pending OTP", async () => {
      repo.findOne.mockResolvedValue(null);
      const forUnknown = await service.resendOtp({
        email: "nope@example.com",
      });

      repo.findOne.mockResolvedValue(admin);
      otpService.resend.mockRejectedValue(new Error("nothing pending"));
      const forNoPending = await service.resendOtp({ email: admin.email });

      expect(forUnknown).toEqual(forNoPending);
    });

    it("resends via the OTP service when a login OTP is pending", async () => {
      repo.findOne.mockResolvedValue(admin);
      otpService.resend.mockResolvedValue(undefined);

      await service.resendOtp({ email: admin.email });

      expect(otpService.resend).toHaveBeenCalledWith(
        OtpPurpose.ADMIN_LOGIN_VERIFICATION,
        admin.id,
        admin.email
      );
    });
  });

  describe("findOne", () => {
    it("throws when the admin no longer exists", async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne("admin-1")).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("returns the admin when found", async () => {
      repo.findOne.mockResolvedValue(admin);

      const result = await service.findOne("admin-1");

      expect(result).toBe(admin);
    });
  });
});
