import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from "@nestjs/swagger";
import { CloudinaryService } from "./services/cloudinary.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("uploads")
@Controller("uploads")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post("image")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a single image" })
  @ApiConsumes("multipart/form-data")
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    // Validate file type
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("File must be an image");
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException("File size must be less than 5MB");
    }

    return this.cloudinaryService.uploadImage(file);
  }

  @Post("images")
  @UseInterceptors(FilesInterceptor("files", 10))
  @ApiOperation({ summary: "Upload multiple images (max 10)" })
  @ApiConsumes("multipart/form-data")
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException("No files uploaded");
    }

    // Validate file types and sizes
    const maxSize = 5 * 1024 * 1024; // 5MB
    for (const file of files) {
      if (!file.mimetype.startsWith("image/")) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`
        );
      }
      if (file.size > maxSize) {
        throw new BadRequestException(
          `File ${file.originalname} size must be less than 5MB`
        );
      }
    }

    return this.cloudinaryService.uploadMultipleImages(files);
  }

  @Post("document")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a document (e.g. PDF, ID card scan)" })
  @ApiConsumes("multipart/form-data")
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException("File must be a PDF or image");
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException("File size must be less than 10MB");
    }

    return this.cloudinaryService.uploadDocument(file);
  }
}
