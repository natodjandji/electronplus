import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UploadImageDto } from './dto/upload-image.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('product-image')
  uploadProductImage(@Body() dto: UploadImageDto) {
    return this.uploadsService.uploadProductImage(dto.image);
  }
}
