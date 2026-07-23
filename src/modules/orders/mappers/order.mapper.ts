import { Role } from '../../../common/enums/role.enum';
import { Order, OrderItem } from '../entities/order.entity';

/** Strips internal cost/margin and ERP-sync fields for anyone who isn't an admin —
 * mirrors the same admin-only gating products.mapper.ts applies to the catalog. */
export function toOrderDto(order: Order, role: Role | undefined) {
  const isAdmin = role === Role.ADMIN;

  const items = order.items.map((item: OrderItem) => {
    const { unitCost: _unitCost, ...rest } = item;
    return isAdmin ? item : rest;
  });

  const { erpExportedAt: _erpExportedAt, erpExportError: _erpExportError, ...rest } = order;
  return isAdmin ? { ...order, items } : { ...rest, items };
}
