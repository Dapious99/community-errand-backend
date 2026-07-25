import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ErrandsService } from "./errands.service";
import { ErrandsController } from "./errands.controller";
import { Errand } from "./entities/errand.entity";
import { Location } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Errand, Location, MediaAttachment]),
    PaymentsModule,
  ],
  controllers: [ErrandsController],
  providers: [ErrandsService],
  exports: [ErrandsService],
})
export class ErrandsModule {}
