import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { MovementType } from '@erp/shared';
import { TenantContext } from '../tenancy/tenant-context';
import { D, Decimal, m2, q4, r6, Num } from '../common/money';

export interface Balance {
  quantity: Decimal;
  value: Decimal;
}

/** Weighted-average receipt. Pure. */
export function applyReceipt(b: Balance, qty: Num, unitCost: Num) {
  const q = D(qty);
  const inValue = q.times(D(unitCost)).toDecimalPlaces(2);
  const quantity = b.quantity.plus(q);
  const value = b.value.plus(inValue);
  const avgCost = quantity.isZero() ? new Decimal(0) : value.dividedBy(quantity);
  return { quantity, value, avgCost, movementValue: inValue };
}

/** Weighted-average issue. Throws on insufficient stock. Issuing the full balance takes the full value (no residue). Pure. */
export function applyIssue(b: Balance, qty: Num) {
  const q = D(qty);
  if (q.greaterThan(b.quantity)) {
    throw new BadRequestException(`Insufficient stock: available ${b.quantity.toFixed(4)}, requested ${q.toFixed(4)}`);
  }
  const avg = b.quantity.isZero() ? new Decimal(0) : b.value.dividedBy(b.quantity);
  const outValue = q.equals(b.quantity) ? b.value : q.times(avg).toDecimalPlaces(2);
  const quantity = b.quantity.minus(q);
  const value = b.value.minus(outValue);
  return { quantity, value, avgCost: quantity.isZero() ? new Decimal(0) : avg, movementValue: outValue, unitCost: avg };
}

export interface MoveInput {
  date: string;
  type: MovementType;
  itemId: string;
  warehouseId: string;
  /** Always positive; direction comes from `type`. For 'adjustment' pass signed quantity. */
  quantity: Num;
  unitCost?: Num;
  sourceType: string;
  sourceId: string;
  projectId?: string | null;
  boqItemId?: string | null;
}

const INBOUND: MovementType[] = ['receipt', 'transfer_in', 'opening'];

/** Only writer of stock_balances / stock_movements. Always call inside a transaction. */
@Injectable()
export class StockService {
  constructor(private readonly ctx: TenantContext) {}

  private async lockBalance(db: TenantDb, itemId: string, warehouseId: string) {
    await db.insert(t.stockBalances).values({ itemId, warehouseId }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(t.stockBalances)
      .where(and(eq(t.stockBalances.itemId, itemId), eq(t.stockBalances.warehouseId, warehouseId)))
      .for('update');
    return row;
  }

  /** Applies one movement; returns its absolute value (for GL posting). */
  async move(db: TenantDb, m: MoveInput): Promise<Decimal> {
    const row = await this.lockBalance(db, m.itemId, m.warehouseId);
    const bal: Balance = { quantity: D(row.quantity), value: D(row.value) };
    const signed = D(m.quantity);
    const inbound = INBOUND.includes(m.type) || (m.type === 'adjustment' && signed.isPositive());
    const qty = signed.abs();
    if (qty.isZero()) throw new BadRequestException('Quantity cannot be zero');

    let next: { quantity: Decimal; value: Decimal; avgCost: Decimal; movementValue: Decimal };
    let unitCost: Decimal;
    if (inbound) {
      unitCost = m.unitCost != null && m.unitCost !== '' ? D(m.unitCost) : bal.quantity.isZero() ? new Decimal(0) : bal.value.dividedBy(bal.quantity);
      next = applyReceipt(bal, qty, unitCost);
    } else {
      const r = applyIssue(bal, qty);
      unitCost = r.unitCost;
      next = r;
    }

    await db
      .update(t.stockBalances)
      .set({ quantity: q4(next.quantity), value: m2(next.value), avgCost: r6(next.avgCost) })
      .where(eq(t.stockBalances.id, row.id));
    await db.insert(t.stockMovements).values({
      date: m.date,
      type: m.type,
      itemId: m.itemId,
      warehouseId: m.warehouseId,
      quantity: q4(inbound ? qty : qty.negated()),
      unitCost: r6(unitCost),
      value: m2(inbound ? next.movementValue : next.movementValue.negated()),
      balanceQty: q4(next.quantity),
      balanceValue: m2(next.value),
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      projectId: m.projectId ?? null,
      boqItemId: m.boqItemId ?? null,
      createdBy: this.ctx.userId ?? null,
    });
    return next.movementValue;
  }
}
