import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { TenantDb } from '@erp/db';

/** Document number prefixes per doc type. */
export const DOC_PREFIX: Record<string, string> = {
  employee: 'EMP',
  journal: 'JV',
  invoice: 'INV',
  bill: 'BILL',
  receipt: 'RCV',
  payment: 'PAY',
  party_customer: 'CUS',
  party_vendor: 'VEN',
  party_subcontractor: 'SUB',
  stock_issue: 'SIV',
  stock_transfer: 'STN',
  stock_adjustment: 'ADJ',
  stock_opening: 'OPN',
  purchase_requisition: 'PR',
  purchase_order: 'PO',
  goods_receipt: 'GRN',
  site_requisition: 'SR',
  work_order: 'WO',
  subcontract_bill: 'SCB',
  ra_bill: 'RA',
  payroll: 'PRL',
};

@Injectable()
export class NumberingService {
  /**
   * Atomically allocates the next number for (docType, year). Call it with the caller's transaction:
   * the sequence row stays locked until commit and a rollback reverts the increment, so numbers are gap-free.
   */
  async next(db: TenantDb, docType: string, date: string | Date = new Date()): Promise<string> {
    const prefix = DOC_PREFIX[docType] ?? docType.toUpperCase().slice(0, 6);
    const year = typeof date === 'string' ? Number(date.slice(0, 4)) : date.getFullYear();
    const res = await db.execute(sql`
      insert into number_sequences (doc_type, prefix, year, next_value)
      values (${docType}, ${prefix}, ${year}, 2)
      on conflict (doc_type, year) do update set next_value = number_sequences.next_value + 1
      returning next_value - 1 as value, prefix, padding`);
    const row = res.rows[0] as { value: number; prefix: string; padding: number };
    return `${row.prefix}-${year}-${String(row.value).padStart(row.padding, '0')}`;
  }
}
