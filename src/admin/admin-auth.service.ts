import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { Admin } from "./entities/admin.entity";
import { AdminLoginDto } from "./dto/admin-login.dto";

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Admin)
    private adminsRepository: Repository<Admin>,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async login(adminLoginDto: AdminLoginDto) {
    const admin = await this.adminsRepository.findOne({
      where: { email: adminLoginDto.email },
    });

    if (!admin) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(
      adminLoginDto.password,
      admin.passwordHash
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: admin.id, email: admin.email },
      {
        secret: this.configService.get<string>("ADMIN_JWT_SECRET"),
        expiresIn: this.configService.get<string>("ADMIN_JWT_EXPIRES_IN", "4h"),
      }
    );

    return {
      admin: { id: admin.id, email: admin.email, name: admin.name },
      accessToken,
    };
  }

  async findOne(id: string): Promise<Admin> {
    const admin = await this.adminsRepository.findOne({ where: { id } });
    if (!admin) {
      throw new UnauthorizedException("Invalid token");
    }
    return admin;
  }
}
