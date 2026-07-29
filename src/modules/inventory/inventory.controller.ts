import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('alerts')
  activeAlerts() {
    return this.inventoryService.findActiveAlerts();
  }

  @Get('warehouse/:id/stock')
  stockInWarehouse(@Param('id') id: string) {
    return this.inventoryService.stockInWarehouse(id);
  }
}
