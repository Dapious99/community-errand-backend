import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  controllers: [UploadsController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class UploadsModule {}



