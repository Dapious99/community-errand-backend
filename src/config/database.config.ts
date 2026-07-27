import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";

export const getDatabaseConfig = (
  configService: ConfigService
): TypeOrmModuleOptions => ({
  type: "postgres",
  host: configService.get<string>("DB_HOST", "localhost"),
  port: configService.get<number>("DB_PORT", 5432),
  username: configService.get<string>("DB_USERNAME", "postgres"),
  password: configService.get<string>("DB_PASSWORD", "postgres"),
  database: configService.get<string>("DB_DATABASE", "community_errand"),
  entities: [__dirname + "/../**/*.entity{.ts,.js}"],
  // Migrations are run out-of-band via `npm run migration:run` (see
  // src/config/data-source.ts, which runs under ts-node). The running app
  // itself never needs to read the migrations directory - doing so here
  // would make TypeORM try to `require()` the raw .ts migration files at
  // boot, which fails outside of a ts-node context.
  synchronize: configService.get<string>("DB_SYNCHRONIZE", "false") === "true",
  logging: configService.get<string>("NODE_ENV") === "development",
  ssl:
    configService.get<string>("NODE_ENV") === "production"
      ? { rejectUnauthorized: false }
      : false,
});
