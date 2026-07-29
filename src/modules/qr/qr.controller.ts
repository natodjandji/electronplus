import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../../common/guards/optional-firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { BulkLabelsDto } from './dto/bulk-labels.dto';
import { QrService } from './qr.service';

@ApiTags('qr')
@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('tokens/:productId')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  @ApiBearerAuth()
  issueToken(@Param('productId') productId: string) {
    return this.qrService.issueLabel(productId);
  }

  @Post('labels')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  @ApiBearerAuth()
  bulkLabels(@Body() dto: BulkLabelsDto) {
    return this.qrService.issueLabels(dto.productIds);
  }

  @Get('scan/:token')
  @UseGuards(OptionalFirebaseAuthGuard)
  scan(@Param('token') token: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.qrService.scan(token, user);
  }
}
