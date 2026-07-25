import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/entities/user.entity";

describe("AuthService", () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    role: UserRole.REQUESTER,
    verified: false,
    ratingAvg: 0,
    avatarUrl: null,
    passwordHash: "",
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
      ],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  describe("register", () => {
    it("creates the user and returns tokens alongside a safe user payload", async () => {
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
      });
      expect(result.accessToken).toBe("signed-token");
      expect(result.refreshToken).toBe("signed-token");
    });
  });

  describe("login", () => {
    it("throws when the email is not registered", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: "nope@example.com",
          password: "password123",
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when the password does not match", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);

      await expect(
        authService.login({ email: mockUser.email, password: "wrong-password" })
      ).rejects.toThrow(UnauthorizedException);
    });

    it("returns tokens on valid credentials", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
      } as any);

      const result = await authService.login({
        email: mockUser.email,
        password: "correct-password",
      });

      expect(result.accessToken).toBe("signed-token");
      expect(result.user.email).toBe(mockUser.email);
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
