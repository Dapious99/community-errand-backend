import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminAuthService } from "../admin-auth.service";

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, "admin-jwt") {
  constructor(
    private configService: ConfigService,
    private adminAuthService: AdminAuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("ADMIN_JWT_SECRET"),
    });
  }

  async validate(payload: any) {
    const admin = await this.adminAuthService.findOne(payload.sub);
    if (!admin) {
      throw new UnauthorizedException();
    }
    return { id: admin.id, email: admin.email, scope: "admin" };
  }
}
