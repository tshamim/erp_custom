'use client';

import Papa from 'papaparse';
import type { ColumnDef, Row } from './resource-types';
import { date, dateTime, money, qty } from './format';
import { getSession } from './api';

/** Plain-text value of a cell for CSV/PDF (numbers stay raw in CSV so spreadsheets can sum them). */
function cellText(col: ColumnDef, row: Row, forCsv: boolean): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === '') return '';
  switch (col.format) {
    case 'money':
      return forCsv ? String(Number(v)) : money(v);
    case 'qty':
      return forCsv ? String(Number(v)) : qty(v);
    case 'date':
      return forCsv ? String(v).slice(0, 10) : date(v);
    case 'datetime':
      return forCsv ? String(v) : dateTime(v);
    case 'bool':
      return v ? 'Yes' : 'No';
    default:
      return typeof v === 'object' ? (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? (x.name ?? JSON.stringify(x)) : x)).join(', ') : JSON.stringify(v)) : String(v);
  }
}

const exportable = (columns: ColumnDef[]) => columns.filter((c) => c.key && !c.key.startsWith('_'));
const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(title: string, columns: ColumnDef[], rows: Row[]) {
  const cols = exportable(columns);
  const csv = Papa.unparse({ fields: cols.map((c) => c.label), data: rows.map((r) => cols.map((c) => cellText(c, r, true))) });
  // BOM so Excel opens UTF-8 (৳, Bangla names) correctly
  save(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${slug(title)}-${stamp()}.csv`);
}

export function downloadCsvTemplate(name: string, columns: readonly string[], example: readonly string[]) {
  const csv = Papa.unparse({ fields: [...columns], data: [[...example]] });
  save(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${name}-template.csv`);
}

export function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) =>
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (r) => (r.errors.length && !r.data.length ? reject(new Error(r.errors[0].message)) : resolve(r.data)),
      error: reject,
    }),
  );
}

export interface PdfSection {
  /** Key/value header block (document fields). */
  fields?: { label: string; value: string }[];
  table?: { columns: ColumnDef[]; rows: Row[] };
  heading?: string;
}

/** A4 PDF with company header; landscape automatically for wide tables. */
export async function exportPdf(title: string, sections: PdfSection[], subtitle?: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const widest = Math.max(0, ...sections.map((s) => s.table?.columns.length ?? 0));
  const doc = new jsPDF({ orientation: widest > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const company = getSession()?.profile.tenant?.name ?? 'BuildERP';
  const width = doc.internal.pageSize.getWidth();
  doc.setFontSize(9).setTextColor(110).text(company, 40, 32);
  doc.text(`Printed ${new Date().toLocaleString('en-GB')}`, width - 40, 32, { align: 'right' });
  doc.setFontSize(15).setTextColor(20).text(title, 40, 56);
  let y = 64;
  if (subtitle) {
    doc.setFontSize(9).setTextColor(100).text(subtitle, 40, 74);
    y = 82;
  }
  for (const s of sections) {
    if (s.heading) {
      doc.setFontSize(11).setTextColor(30).text(s.heading, 40, y + 16);
      y += 22;
    }
    if (s.fields?.length) {
      const perRow = doc.internal.pageSize.getWidth() > 700 ? 4 : 3;
      const body: string[][] = [];
      for (let i = 0; i < s.fields.length; i += perRow) {
        body.push(s.fields.slice(i, i + perRow).flatMap((f) => [f.label, f.value]));
      }
      autoTable(doc, {
        startY: y + 6,
        body,
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 3 },
        columnStyles: Object.fromEntries(Array.from({ length: perRow }, (_, i) => [i * 2, { textColor: 120 }])),
        margin: { left: 40, right: 40 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    if (s.table) {
      const cols = exportable(s.table.columns);
      autoTable(doc, {
        startY: y + 6,
        head: [cols.map((c) => c.label)],
        body: s.table.rows.map((r) => cols.map((c) => cellText(c, r, false))),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [31, 90, 214] },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.format === 'money' || c.format === 'qty' ? { halign: 'right' } : {}])),
        margin: { left: 40, right: 40 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(140).text(`Page ${i} of ${pages}`, width - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  doc.save(`${slug(title)}-${stamp()}.pdf`);
}

export { cellText };
