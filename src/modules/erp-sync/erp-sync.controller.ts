import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SyncService } from './sync.service';

@ApiTags('erp-sync')
@ApiBearerAuth()
@Controller('erp-sync')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
export class ErpSyncController {
  constructor(private readonly syncService: SyncService) {}

  // Walks the full ERP inventory (reads + writes per item) — one click
  // shouldn't be able to fire this off faster than it can actually run.
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post('trigger')
  trigger() {
    return this.syncService.runInboundSync();
  }

  @Get('status')
  status() {
    return this.syncService.getStatus();
  }

  @Get('logs')
  logs() {
    return this.syncService.getLogs();
  }
}
