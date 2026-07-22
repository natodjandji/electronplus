import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
