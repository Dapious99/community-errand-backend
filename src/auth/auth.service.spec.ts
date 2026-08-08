import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/entities/user.entity";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";
import { TrustedDevice } from "./entities/trusted-device.entity";
import { ReferralsService } from "../referrals/referrals.service";
import { CountryConfigService } from "../settings/country-config.service";

describe("AuthService", () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let otpService: jest.Mocked<OtpService>;
  let referralsService: jest.Mocked<ReferralsService>;
  let trustedDevicesRepo: any;

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    role: UserRole.REQUESTER,
    verified: false,
    ratingAvg: 0,
    avatarUrl: null,
    passwordHash: "",
    country: "Nigeria",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findOne: jest.fn(),
            setVerified: jest.fn(),
            setPassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue("signed-token"),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => fallback),
          },
        },
        {
          provide: OtpService,
          useValue: {
            request: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn(),
            resend: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(TrustedDevice),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve(data)),
          },
        },
        {
          provide: ReferralsService,
          useValue: {
            createPending: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CountryConfigService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              country: "Nigeria",
              currencyCode: "NGN",
              currencySymbol: "₦",
              boostPrice: 2500,
              platformFeePercent: 10,
              paymentGatewayProvider: "paystack",
            }),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    otpService = module.get(OtpService);
    referralsService = module.get(ReferralsService);
    trustedDevicesRepo = module.get(getRepositoryToken(TrustedDevice));
  });

  describe("register", () => {
    it("creates the user, sends a verification email, and returns tokens", async () => {
      usersService.create.mockResolvedValue(mockUser as any);

      const result = await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
      } as any);

      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        verified: mockUser.verified,
        country: mockUser.country,
      });
      expect(result.accessToken).toBe("signed-token");
      expect(otpService.request).toHaveBeenCalled();
      expect(trustedDevicesRepo.save).not.toHaveBeenCalled();
    });

    it("trusts the device immediately when a deviceId is provided at signup", async () => {
      usersService.create.mockResolvedValue(mockUser as any);
      trustedDevicesRepo.findOne.mockResolvedValue(null);

      await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
        deviceId: "device-abc",
      } as any);

      expect(trustedDevicesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUser.id, deviceId: "device-abc" })
      );
    });

    it("records a pending referral when the new user was referred", async () => {
      usersService.create.mockResolvedValue({
        ...mockUser,
        referralCode: "NEWCODE1",
        referredByUserId: "referrer-1",
      } as any);

      await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
        referralCode: "REFERRER1",
      } as any);

      expect(referralsService.createPending).toHaveBeenCalledWith(
        "referrer-1",
        mockUser.id
      );
    });

    it("does not attempt to record a referral when the new user wasn't referred", async () => {
      usersService.create.mockResolvedValue(mockUser as any);

      await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
      } as any);

      expect(referralsService.createPending).not.toHaveBeenCalled();
    });

    it("does not fail registration if recording the referral throws", async () => {
      usersService.create.mockResolvedValue({
        ...mockUser,
        referredByUserId: "referrer-1",
      } as any);
      referralsService.createPending.mockRejectedValue(new Error("db down"));

      const result = await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
        referralCode: "REFERRER1",
      } as any);

      expect(result.accessToken).toBe("signed-token");
    });

    it("does not fail registration if the verification email fails to send", async () => {
      usersService.create.mockResolvedValue(mockUser as any);
      otpService.request.mockRejectedValue(new Error("resend down"));

      const result = await authService.register({
        email: mockUser.email,
        name: mockUser.name,
        password: "password123",
      } as any);

      expect(result.accessToken).toBe("signed-token");
    });
  });

  describe("login", () => {
    it("throws when the email is not registered", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: "nope@example.com",
          password: "password123",
        } as any)
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when the password does not match", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);

      await expect(
        authService.login({
          email: mockUser.email,
          password: "wrong-password",
        } as any)
      ).rejects.toThrow(UnauthorizedException);
    });

    it("requires device verification when no deviceId is sent", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);

      const result = await authService.login({
        email: mockUser.email,
        password: "correct-password",
      } as any);

      expect(result).toEqual({
        requiresDeviceVerification: true,
        message: expect.any(String),
      });
      expect(otpService.request).toHaveBeenCalled();
    });

    it("requires device verification when the deviceId is not recognized", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);
      trustedDevicesRepo.findOne.mockResolvedValue(null);

      const result = await authService.login({
        email: mockUser.email,
        password: "correct-password",
        deviceId: "unknown-device",
      } as any);

      expect(result.requiresDeviceVerification).toBe(true);
    });

    it("logs in directly when the device is already trusted", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);
      trustedDevicesRepo.findOne.mockResolvedValue({
        userId: mockUser.id,
        deviceId: "known-device",
      });

      const result: any = await authService.login({
        email: mockUser.email,
        password: "correct-password",
        deviceId: "known-device",
      } as any);

      expect(result.accessToken).toBe("signed-token");
      expect(otpService.request).not.toHaveBeenCalled();
      expect(trustedDevicesRepo.save).toHaveBeenCalled();
    });
  });

  describe("confirmDevice", () => {
    it("throws for an unknown email without revealing that it's unknown", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.confirmDevice({
          email: "nope@example.com",
          deviceId: "d1",
          code: "123456",
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("trusts the device and returns tokens on a valid code", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      trustedDevicesRepo.findOne.mockResolvedValue(null);

      const result = await authService.confirmDevice({
        email: mockUser.email,
        deviceId: "device-abc",
        code: "123456",
      });

      expect(otpService.verify).toHaveBeenCalled();
      expect(trustedDevicesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUser.id, deviceId: "device-abc" })
      );
      expect(result.accessToken).toBe("signed-token");
    });
  });

  describe("resendDeviceLoginCode", () => {
    it("gives the same generic response whether or not the account/device has a pending confirmation", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const forUnknown = await authService.resendDeviceLoginCode(
        "nope@example.com",
        "device-1"
      );

      usersService.findByEmail.mockResolvedValue(mockUser as any);
      otpService.resend.mockRejectedValue(new Error("nothing pending"));
      const forNoPending = await authService.resendDeviceLoginCode(
        mockUser.email,
        "device-1"
      );

      expect(forUnknown).toEqual(forNoPending);
    });

    it("resends via the OTP service when a confirmation is pending", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      otpService.resend.mockResolvedValue(undefined);

      await authService.resendDeviceLoginCode(mockUser.email, "device-1");

      expect(otpService.resend).toHaveBeenCalledWith(
        OtpPurpose.NEW_DEVICE_LOGIN,
        `${mockUser.id}:device-1`,
        mockUser.email
      );
    });
  });

  describe("verifyEmail / resendVerification", () => {
    it("marks the user verified on a correct code", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      await authService.verifyEmail({ email: mockUser.email, code: "123456" });

      expect(usersService.setVerified).toHaveBeenCalledWith(mockUser.id);
    });

    it("throws for an unknown email", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.verifyEmail({ email: "nope@example.com", code: "123456" })
      ).rejects.toThrow(BadRequestException);
    });

    it("resend gives the same response whether or not the account needs verification", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const forUnknown = await authService.resendVerification({
        email: "nope@example.com",
      });

      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        verified: true,
      } as any);
      const forVerified = await authService.resendVerification({
        email: mockUser.email,
      });

      expect(forUnknown).toEqual(forVerified);
      expect(otpService.request).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword / resetPassword", () => {
    it("gives the same response whether or not the account exists", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const forUnknown = await authService.forgotPassword({
        email: "nope@example.com",
      });

      usersService.findByEmail.mockResolvedValue(mockUser as any);
      const forKnown = await authService.forgotPassword({
        email: mockUser.email,
      });

      expect(forUnknown).toEqual(forKnown);
      expect(otpService.request).toHaveBeenCalledTimes(1);
    });

    it("resets the password on a valid code", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);

      await authService.resetPassword({
        email: mockUser.email,
        code: "123456",
        newPassword: "newPassword123",
      });

      expect(otpService.verify).toHaveBeenCalled();
      expect(usersService.setPassword).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String)
      );
    });
  });

  describe("refreshToken", () => {
    it("throws UnauthorizedException when the refresh token is invalid", async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error("invalid");
      });

      await expect(authService.refreshToken("bad-token")).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("issues new tokens for a valid refresh token", async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
      });
      usersService.findOne.mockResolvedValue(mockUser as any);

      const result = await authService.refreshToken("valid-token");

      expect(result.accessToken).toBe("signed-token");
      expect(result.refreshToken).toBe("signed-token");
    });
  });
});
