import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { TimestampPeriodQueryDto } from '../../common/dto/period-query.dto';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewSettingsDto } from './dto/update-review-settings.dto';
import { ReviewsService } from './reviews.service';

/**
 * The form and the submission are public: customers reach them from the
 * store's QR, with no account. Everything else is the admin's.
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('form')
  form() {
    return this.reviewsService.form();
  }

  /** Customers on the store's Wi-Fi share one IP, so the limit leaves room
   * for a busy day; the honeypot and the validation stop the rest. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(201)
  async create(@Body() dto: CreateReviewDto) {
    await this.reviewsService.create(dto);
    return { ok: true };
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  list(@Query() period: TimestampPeriodQueryDto) {
    return this.reviewsService.list(period);
  }

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  settings() {
    return this.reviewsService.settings();
  }

  @Put('settings')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateSettings(@Body() dto: UpdateReviewSettingsDto) {
    return this.reviewsService.updateSettings(dto);
  }

  @Get('qr')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  qr() {
    return this.reviewsService.qr();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    await this.reviewsService.delete(id);
  }
}
