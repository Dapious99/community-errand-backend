import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AdminAuthService } from "./admin-auth.service";
import { Admin } from "./entities/admin.entity";

describe("AdminAuthService", () => {
  let service: AdminAuthService;
  let repo: any;
  let jwtService: jest.Mocked<JwtService>;

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
      ],
    }).compile();

    service = module.get(AdminAuthService);
    repo = module.get(getRepositoryToken(Admin));
    jwtService = module.get(JwtService);
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

    it("returns an admin token on valid credentials", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      repo.findOne.mockResolvedValue({ ...admin, passwordHash: hash });

      const result = await service.login({
        email: admin.email,
        password: "correct-password",
      });

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
