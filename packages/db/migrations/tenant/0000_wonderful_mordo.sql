CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"requested_by" uuid,
	"approver_role_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size" integer,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(20) NOT NULL,
	"entity" varchar(100) NOT NULL,
	"entity_id" varchar(100),
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"phone" varchar(50),
	"bin_no" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(255),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_type" varchar(50) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 5 NOT NULL,
	CONSTRAINT "number_seq_doc_year" UNIQUE("doc_type","year")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"module" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(50),
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"branch_id" uuid,
	"employee_id" uuid,
	"last_login_at" timestamp with time zone,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" varchar(20) NOT NULL,
	"check_in" time,
	"check_out" time,
	"overtime_hours" numeric(18, 4) DEFAULT '0' NOT NULL,
	"project_id" uuid,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_emp_date" UNIQUE("employee_id","date")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"grade" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"father_name" varchar(200),
	"mother_name" varchar(200),
	"gender" varchar(10),
	"date_of_birth" date,
	"nid" varchar(30),
	"tin" varchar(30),
	"phone" varchar(50),
	"email" varchar(200),
	"present_address" text,
	"permanent_address" text,
	"emergency_contact_name" varchar(200),
	"emergency_contact_phone" varchar(50),
	"blood_group" varchar(5),
	"department_id" uuid,
	"designation_id" uuid,
	"branch_id" uuid,
	"manager_id" uuid,
	"employment_type" varchar(20) DEFAULT 'permanent' NOT NULL,
	"joining_date" date NOT NULL,
	"confirmation_date" date,
	"exit_date" date,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"bank_name" varchar(100),
	"bank_account_no" varchar(50),
	"mobile_banking_no" varchar(30),
	"daily_wage" numeric(18, 2),
	"current_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"event" varchar(30) NOT NULL,
	"department_id" uuid,
	"designation_id" uuid,
	"gross_salary" numeric(18, 2),
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"entitled" numeric(18, 4) NOT NULL,
	"used" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "leave_bal_uniq" UNIQUE("employee_id","leave_type_id","year")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" numeric(18, 4) NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"days_per_year" integer NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"carry_forward" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "account_mappings" (
	"key" varchar(50) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(20) NOT NULL,
	"subtype" varchar(30),
	"parent_id" uuid,
	"is_group" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"branch_name" varchar(100),
	"account_no" varchar(50) NOT NULL,
	"routing_no" varchar(20),
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"reference" varchar(100),
	"amount" numeric(18, 2) NOT NULL,
	"matched_journal_line_id" uuid,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"item_id" uuid,
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"vat_code_id" uuid,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"expense_account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"party_id" uuid NOT NULL,
	"vendor_ref" varchar(100),
	"date" date NOT NULL,
	"due_date" date,
	"project_id" uuid,
	"purchase_order_id" uuid,
	"goods_receipt_id" uuid,
	"subcontract_bill_id" uuid,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"fx_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"name" varchar(20) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "period_uniq" UNIQUE("fiscal_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(20) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_years_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"item_id" uuid,
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"vat_code_id" uuid,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"income_account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"project_id" uuid,
	"ra_bill_id" uuid,
	"mushak_no" varchar(50),
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"fx_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retention_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"advance_adjustment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"reference" varchar(100),
	"narration" text,
	"source_type" varchar(30) DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reversal_of_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_no_unique" UNIQUE("no"),
	CONSTRAINT "je_balanced" CHECK ("journal_entries"."status" <> 'posted' OR "journal_entries"."total_debit" = "journal_entries"."total_credit")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"party_id" uuid,
	"project_id" uuid,
	"department_id" uuid,
	"description" text,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"fx_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	CONSTRAINT "jl_one_side" CHECK (("journal_lines"."debit" = 0) <> ("journal_lines"."credit" = 0)),
	CONSTRAINT "jl_non_negative" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."credit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"type" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_person" varchar(200),
	"phone" varchar(50),
	"email" varchar(200),
	"address" text,
	"bin_no" varchar(30),
	"tin" varchar(30),
	"trade_license" varchar(50),
	"credit_limit" numeric(18, 2),
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"default_tds_code_id" uuid,
	"default_vds_code_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid,
	"bill_id" uuid,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"method" varchar(20) NOT NULL,
	"cheque_no" varchar(50),
	"reference" varchar(100),
	"amount" numeric(18, 2) NOT NULL,
	"tds_code_id" uuid,
	"tds_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vds_code_id" uuid,
	"vds_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"project_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"section" varchar(50),
	"account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"order_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"challan_no" varchar(50),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"parent_id" uuid,
	"inventory_account_id" uuid,
	"expense_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"specification" text,
	"category_id" uuid,
	"uom_id" uuid NOT NULL,
	"type" varchar(20) DEFAULT 'stock' NOT NULL,
	"reorder_level" numeric(18, 4) DEFAULT '0' NOT NULL,
	"standard_cost" numeric(18, 2),
	"default_vat_code_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"received_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"billed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"vat_code_id" uuid,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"expected_date" date,
	"project_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"requisition_id" uuid,
	"quotation_id" uuid,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"terms" text,
	"approved_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"estimated_rate" numeric(18, 2),
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"required_by" date,
	"project_id" uuid,
	"warehouse_id" uuid,
	"site_requisition_id" uuid,
	"requested_by" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requisitions_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(18, 6) DEFAULT '0' NOT NULL,
	"value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_bal_uniq" UNIQUE("item_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "stock_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 6),
	"boq_item_id" uuid,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "stock_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"type" varchar(20) NOT NULL,
	"date" date NOT NULL,
	"from_warehouse_id" uuid,
	"to_warehouse_id" uuid,
	"project_id" uuid,
	"site_requisition_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_documents_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 6) NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"balance_qty" numeric(18, 4) NOT NULL,
	"balance_value" numeric(18, 2) NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" uuid NOT NULL,
	"project_id" uuid,
	"boq_item_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"delivery_days" integer
);
--> statement-breakpoint
CREATE TABLE "supplier_quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid,
	"party_id" uuid NOT NULL,
	"quote_ref" varchar(100),
	"date" date NOT NULL,
	"valid_until" date,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uoms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(20) DEFAULT 'central' NOT NULL,
	"project_id" uuid,
	"address" text,
	"manager_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "boq_item_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boq_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty_per_unit" numeric(18, 4) NOT NULL,
	"wastage_percent" numeric(18, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"uom" varchar(20),
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"rate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"is_section" boolean DEFAULT false NOT NULL,
	"executed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boq_code_uniq" UNIQUE("project_id","code")
);
--> statement-breakpoint
CREATE TABLE "daily_progress_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weather" varchar(50),
	"work_done" text NOT NULL,
	"manpower" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" text,
	"next_day_plan" text,
	"prepared_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dpr_uniq" UNIQUE("project_id","date")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(50),
	"ownership" varchar(10) DEFAULT 'owned' NOT NULL,
	"hourly_rate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_project_id" uuid,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "equipment_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" numeric(18, 4) NOT NULL,
	"fuel_liters" numeric(18, 4) DEFAULT '0' NOT NULL,
	"operator_id" uuid,
	"cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" varchar(20) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_uniq" UNIQUE("project_id","category")
);
--> statement-breakpoint
CREATE TABLE "project_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"in_charge_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"start_date" date,
	"end_date" date,
	"progress" numeric(18, 6) DEFAULT '0' NOT NULL,
	"weight" numeric(18, 6) DEFAULT '1' NOT NULL,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"assignee_id" uuid,
	"boq_item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"client_id" uuid,
	"contract_no" varchar(100),
	"contract_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"location" text,
	"start_date" date,
	"end_date" date,
	"actual_end_date" date,
	"status" varchar(20) DEFAULT 'planning' NOT NULL,
	"project_manager_id" uuid,
	"retention_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"mobilization_advance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"advance_recovery_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"vat_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ra_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ra_bill_id" uuid NOT NULL,
	"boq_item_id" uuid NOT NULL,
	"previous_qty" numeric(18, 4) NOT NULL,
	"current_qty" numeric(18, 4) NOT NULL,
	"rate" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ra_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"project_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"date" date NOT NULL,
	"period_from" date,
	"period_to" date,
	"gross_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retention_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"advance_recovery" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"invoice_id" uuid,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ra_bills_no_unique" UNIQUE("no"),
	CONSTRAINT "ra_seq_uniq" UNIQUE("project_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "site_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"issued_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"boq_item_id" uuid,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "site_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"required_by" date,
	"requested_by" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_requisitions_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "subcontract_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subcontract_bill_id" uuid NOT NULL,
	"work_order_line_id" uuid NOT NULL,
	"previous_qty" numeric(18, 4) NOT NULL,
	"current_qty" numeric(18, 4) NOT NULL,
	"rate" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontract_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"work_order_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_from" date,
	"period_to" date,
	"gross_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retention_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"bill_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcontract_bills_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "variation_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"no" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"boq_item_id" uuid,
	"description" text NOT NULL,
	"uom" varchar(20),
	"quantity" numeric(18, 4) NOT NULL,
	"rate" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"executed_qty" numeric(18, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"project_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"scope" text,
	"value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retention_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"month" varchar(7) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"working_days" integer NOT NULL,
	"include_festival_bonus" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_no_unique" UNIQUE("no"),
	CONSTRAINT "payroll_month_uniq" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid,
	"present_days" numeric(18, 4) NOT NULL,
	"absent_days" numeric(18, 4) NOT NULL,
	"leave_days" numeric(18, 4) NOT NULL,
	"basic" numeric(18, 2) NOT NULL,
	"house_rent" numeric(18, 2) NOT NULL,
	"medical" numeric(18, 2) NOT NULL,
	"conveyance" numeric(18, 2) NOT NULL,
	"other_allowance" numeric(18, 2) NOT NULL,
	"overtime_hours" numeric(18, 4) NOT NULL,
	"overtime_amount" numeric(18, 2) NOT NULL,
	"festival_bonus" numeric(18, 2) NOT NULL,
	"gross" numeric(18, 2) NOT NULL,
	"absent_deduction" numeric(18, 2) NOT NULL,
	"pf_employee" numeric(18, 2) NOT NULL,
	"pf_employer" numeric(18, 2) NOT NULL,
	"tds" numeric(18, 2) NOT NULL,
	"other_deduction" numeric(18, 2) NOT NULL,
	"net_pay" numeric(18, 2) NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslip_uniq" UNIQUE("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"basic" numeric(18, 2) NOT NULL,
	"house_rent" numeric(18, 2) DEFAULT '0' NOT NULL,
	"medical" numeric(18, 2) DEFAULT '0' NOT NULL,
	"conveyance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"other_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"gross" numeric(18, 2) NOT NULL,
	"pf_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"overtime_rate_per_hour" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structures_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approver_role_id_roles_id_fk" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("matched_journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_vat_code_id_tax_codes_id_fk" FOREIGN KEY ("vat_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_expense_account_id_accounts_id_fk" FOREIGN KEY ("expense_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_vat_code_id_tax_codes_id_fk" FOREIGN KEY ("vat_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_income_account_id_accounts_id_fk" FOREIGN KEY ("income_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_default_tds_code_id_tax_codes_id_fk" FOREIGN KEY ("default_tds_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_default_vds_code_id_tax_codes_id_fk" FOREIGN KEY ("default_vds_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_account_id_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tds_code_id_tax_codes_id_fk" FOREIGN KEY ("tds_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_vds_code_id_tax_codes_id_fk" FOREIGN KEY ("vds_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_inventory_account_id_accounts_id_fk" FOREIGN KEY ("inventory_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_expense_account_id_accounts_id_fk" FOREIGN KEY ("expense_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_uom_id_uoms_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_vat_code_id_tax_codes_id_fk" FOREIGN KEY ("default_vat_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_vat_code_id_tax_codes_id_fk" FOREIGN KEY ("vat_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_id_supplier_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."supplier_quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_document_id_stock_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."stock_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_lines" ADD CONSTRAINT "supplier_quotation_lines_quotation_id_supplier_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."supplier_quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotation_lines" ADD CONSTRAINT "supplier_quotation_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_item_materials" ADD CONSTRAINT "boq_item_materials_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_item_materials" ADD CONSTRAINT "boq_item_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_reports" ADD CONSTRAINT "daily_progress_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_current_project_id_projects_id_fk" FOREIGN KEY ("current_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_logs" ADD CONSTRAINT "equipment_logs_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_logs" ADD CONSTRAINT "equipment_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_logs" ADD CONSTRAINT "equipment_logs_operator_id_employees_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_in_charge_id_employees_id_fk" FOREIGN KEY ("in_charge_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_parties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_employees_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bill_lines" ADD CONSTRAINT "ra_bill_lines_ra_bill_id_ra_bills_id_fk" FOREIGN KEY ("ra_bill_id") REFERENCES "public"."ra_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bill_lines" ADD CONSTRAINT "ra_bill_lines_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bills" ADD CONSTRAINT "ra_bills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bills" ADD CONSTRAINT "ra_bills_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_requisition_lines" ADD CONSTRAINT "site_requisition_lines_requisition_id_site_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."site_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_requisition_lines" ADD CONSTRAINT "site_requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_requisition_lines" ADD CONSTRAINT "site_requisition_lines_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_requisitions" ADD CONSTRAINT "site_requisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_bill_lines" ADD CONSTRAINT "subcontract_bill_lines_subcontract_bill_id_subcontract_bills_id_fk" FOREIGN KEY ("subcontract_bill_id") REFERENCES "public"."subcontract_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_bill_lines" ADD CONSTRAINT "subcontract_bill_lines_work_order_line_id_work_order_lines_id_fk" FOREIGN KEY ("work_order_line_id") REFERENCES "public"."work_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_bills" ADD CONSTRAINT "subcontract_bills_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract_bills" ADD CONSTRAINT "subcontract_bills_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_lines" ADD CONSTRAINT "work_order_lines_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_entity_idx" ON "approval_requests" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "attach_entity_idx" ON "attachments" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "emp_dept_idx" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "bill_party_idx" ON "bills" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "bill_project_idx" ON "bills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inv_party_idx" ON "invoices" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "inv_project_idx" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "je_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "je_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "jl_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "jl_project_idx" ON "journal_lines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "jl_party_idx" ON "journal_lines" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "parties_type_idx" ON "parties" USING btree ("type");--> statement-breakpoint
CREATE INDEX "pay_party_idx" ON "payments" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "po_party_idx" ON "purchase_orders" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "po_project_idx" ON "purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sm_item_wh_idx" ON "stock_movements" USING btree ("item_id","warehouse_id","date");--> statement-breakpoint
CREATE INDEX "sm_source_idx" ON "stock_movements" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "sm_project_idx" ON "stock_movements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");