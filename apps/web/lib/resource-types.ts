import type { ReactNode } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type FieldType = 'text' | 'email' | 'password' | 'number' | 'decimal' | 'date' | 'textarea' | 'checkbox' | 'select' | 'multi';

export interface Option {
  value: string;
  label: string;
}

/** Where a select gets its options: a /lookups kind, or an endpoint returning an array or a page. */
export interface OptionSource {
  lookup?: string;
  endpoint?: string;
  label?: (row: Row) => string;
  filter?: (row: Row, values: Row) => boolean;
}

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  options?: (string | Option)[];
  source?: OptionSource;
  required?: boolean;
  span?: 1 | 2 | 3 | 4;
  hint?: string;
  default?: unknown;
  showIf?: (values: Row) => boolean;
  /** Only shown when creating. */
  createOnly?: boolean;
}

export type Format = 'money' | 'qty' | 'date' | 'datetime' | 'status' | 'bool';

export interface ColumnDef {
  key: string;
  label: string;
  format?: Format;
  render?: (row: Row) => ReactNode;
}

export interface LineColumn {
  name: string;
  label: string;
  type?: 'text' | 'decimal' | 'select';
  source?: OptionSource;
  options?: (string | Option)[];
  width?: string;
  /** When a select changes, copy extra values from the chosen option row into the line. */
  onPick?: (picked: Row, line: Row) => Row;
}

export interface LinesDef {
  columns: LineColumn[];
  newLine: () => Row;
  /** Right-aligned computed column, e.g. qty × price. */
  amount?: (line: Row) => number;
}

export interface ActionDef {
  label: string;
  path: (row: Row) => string;
  method?: 'post' | 'delete';
  body?: (row: Row) => Row;
  when?: (row: Row) => boolean;
  perm?: string;
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Navigate after success; defaults to staying on the page (refetch). */
  redirect?: (res: Row, row: Row) => string | null;
}

export interface ResourceDef {
  key: string;
  title: string;
  singular: string;
  endpoint: string;
  /** Permission prefix, e.g. "hr.employee" */
  perm: string;
  columns: ColumnDef[];
  filters?: FieldDef[];
  defaultParams?: Record<string, string>;
  searchable?: boolean;
  form?: {
    fields: FieldDef[];
    lines?: LinesDef;
    /** Endpoint accepts ?post=true (save & post in one step). */
    postable?: boolean;
    transform?: (values: Row) => Row;
  };
  /** Custom create page instead of the generic form. */
  createHref?: string;
  /** Row opens the generic form in edit mode (PATCH endpoint/:id). */
  editable?: boolean;
  /** Row opens a read-only document view. */
  detail?: {
    fields: ColumnDef[];
    lines?: { key: string; columns: ColumnDef[] };
    actions?: ActionDef[];
    extra?: (row: Row) => ReactNode;
  };
  rowActions?: ActionDef[];
  /** No row link at all. */
  noLink?: boolean;
  /** Route prefix for this resource's pages (default /m/<key>). */
  basePath?: string;
}

export const basePath = (def: ResourceDef) => def.basePath ?? `/m/${def.key}`;
