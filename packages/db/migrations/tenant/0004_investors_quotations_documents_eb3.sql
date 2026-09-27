CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance" numeric(18, 2) NOT NULL,
	"book_balance" numeric(18, 2) NOT NULL,
	"difference" numeric(18, 2) NOT NULL,
	"notes" text,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_recon_uniq" UNIQUE("bank_account_id","statement_date")
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"doc_no" varchar(100),
	"issued_by" varchar(200),
	"issue_date" date,
	"expiry_date" date,
	"project_id" uuid,
	"is_confidential" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"investor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"committed_amount" numeric(18, 2) NOT NULL,
	"profit_share_percent" numeric(18, 6) NOT NULL,
	"shares_loss" boolean DEFAULT true NOT NULL,
	"start_date" date,
	"end_date" date,
	"terms" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_agreements_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "investor_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"investor_id" uuid NOT NULL,
	"agreement_id" uuid,
	"project_id" uuid,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"cash_account_id" uuid,
	"method" varchar(20),
	"reference" varchar(100),
	"period_from" date,
	"period_to" date,
	"notes" text,
	"status" varchar(20) DEFAULT 'posted' NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_transactions_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(20) DEFAULT 'individual' NOT NULL,
	"contact_person" varchar(200),
	"phone" varchar(50),
	"email" varchar(200),
	"address" text,
	"nid" varchar(30),
	"tin" varchar(30),
	"passport_no" varchar(30),
	"bank_name" varchar(100),
	"bank_account_no" varchar(50),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_no" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"uom" varchar(20),
	"quantity" numeric(18, 2) DEFAULT '0' NOT NULL,
	"rate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"is_section" boolean DEFAULT false NOT NULL,
	"sort_order" varchar(10) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"valid_until" date,
	"client_id" uuid,
	"title" varchar(200) NOT NULL,
	"location" text,
	"project_code" varchar(30),
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"retention_percent" numeric(18, 6) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"lost_reason" text,
	"notes" text,
	"terms" text,
	"won_project_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "eb3_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"father_name" varchar(200),
	"date_of_birth" date,
	"gender" varchar(10),
	"marital_status" varchar(20),
	"dependents" integer DEFAULT 0 NOT NULL,
	"nid" varchar(30),
	"passport_no" varchar(30),
	"passport_issue_date" date,
	"passport_expiry" date,
	"phone" varchar(50),
	"email" varchar(200),
	"address" text,
	"district" varchar(100),
	"education" varchar(200),
	"experience_years" integer,
	"skill" varchar(100),
	"english_level" varchar(20),
	"status" varchar(20) DEFAULT 'lead' NOT NULL,
	"source" varchar(100),
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb3_candidates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eb3_case_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"doc_type" varchar(100) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"received_date" date,
	"expiry_date" date,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb3_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"date" date NOT NULL,
	"stage" varchar(30),
	"title" varchar(200) NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eb3_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"candidate_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"job_order_id" uuid,
	"stage" varchar(30) DEFAULT 'prevailing_wage' NOT NULL,
	"stage_date" date,
	"opened_date" date NOT NULL,
	"priority_date" date,
	"perm_case_no" varchar(50),
	"i140_receipt" varchar(50),
	"nvc_case_no" varchar(50),
	"interview_date" date,
	"consulate" varchar(100),
	"visa_number" varchar(50),
	"departure_date" date,
	"attorney_name" varchar(200),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"agreed_fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb3_cases_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "eb3_employers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_person" varchar(200),
	"email" varchar(200),
	"phone" varchar(50),
	"address" text,
	"city" varchar(100),
	"state" varchar(50),
	"industry" varchar(100),
	"fein" varchar(30),
	"attorney_name" varchar(200),
	"attorney_email" varchar(200),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb3_employers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eb3_job_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"employer_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"soc_code" varchar(20),
	"positions" integer DEFAULT 1 NOT NULL,
	"filled_positions" integer DEFAULT 0 NOT NULL,
	"offered_wage" numeric(18, 2),
	"wage_unit" varchar(20) DEFAULT 'hour',
	"worksite_city" varchar(100),
	"worksite_state" varchar(50),
	"requirements" text,
	"opened_date" date,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb3_job_orders_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "eb3_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" varchar(30) NOT NULL,
	"case_id" uuid,
	"candidate_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" varchar(30) NOT NULL,
	"direction" varchar(10) DEFAULT 'in' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"cash_account_id" uuid,
	"method" varchar(20),
	"reference" varchar(100),
	"notes" text,
	"status" varchar(20) DEFAULT 'posted' NOT NULL,
	"journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eb3_payments_no_unique" UNIQUE("no")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_balance" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_date" date;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "last_reconciled_date" date;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "last_reconciled_balance" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_agreements" ADD CONSTRAINT "investment_agreements_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_agreements" ADD CONSTRAINT "investment_agreements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_transactions" ADD CONSTRAINT "investor_transactions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_transactions" ADD CONSTRAINT "investor_transactions_agreement_id_investment_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."investment_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_transactions" ADD CONSTRAINT "investor_transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_transactions" ADD CONSTRAINT "investor_transactions_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_won_project_id_projects_id_fk" FOREIGN KEY ("won_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_case_documents" ADD CONSTRAINT "eb3_case_documents_case_id_eb3_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eb3_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_case_events" ADD CONSTRAINT "eb3_case_events_case_id_eb3_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eb3_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_cases" ADD CONSTRAINT "eb3_cases_candidate_id_eb3_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."eb3_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_cases" ADD CONSTRAINT "eb3_cases_employer_id_eb3_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."eb3_employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_cases" ADD CONSTRAINT "eb3_cases_job_order_id_eb3_job_orders_id_fk" FOREIGN KEY ("job_order_id") REFERENCES "public"."eb3_job_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_job_orders" ADD CONSTRAINT "eb3_job_orders_employer_id_eb3_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."eb3_employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_payments" ADD CONSTRAINT "eb3_payments_case_id_eb3_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eb3_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_payments" ADD CONSTRAINT "eb3_payments_candidate_id_eb3_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."eb3_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eb3_payments" ADD CONSTRAINT "eb3_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_doc_category_idx" ON "company_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "company_doc_expiry_idx" ON "company_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "agreement_investor_idx" ON "investment_agreements" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "agreement_project_idx" ON "investment_agreements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inv_txn_investor_idx" ON "investor_transactions" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "inv_txn_project_idx" ON "investor_transactions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inv_txn_type_idx" ON "investor_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "investors_status_idx" ON "investors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotation_client_idx" ON "quotations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quotation_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eb3_cand_status_idx" ON "eb3_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eb3_cand_passport_idx" ON "eb3_candidates" USING btree ("passport_no");--> statement-breakpoint
CREATE INDEX "eb3_doc_case_idx" ON "eb3_case_documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "eb3_event_case_idx" ON "eb3_case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "eb3_case_candidate_idx" ON "eb3_cases" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "eb3_case_stage_idx" ON "eb3_cases" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "eb3_case_status_idx" ON "eb3_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eb3_job_employer_idx" ON "eb3_job_orders" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "eb3_job_status_idx" ON "eb3_job_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eb3_pay_case_idx" ON "eb3_payments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "eb3_pay_candidate_idx" ON "eb3_payments" USING btree ("candidate_id");