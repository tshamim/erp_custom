CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"doc_type" varchar(50) NOT NULL,
	"doc_no" varchar(100),
	"issue_date" date,
	"expiry_date" date,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"date" date NOT NULL,
	"quality" integer NOT NULL,
	"delivery" integer NOT NULL,
	"price" integer NOT NULL,
	"service" integer NOT NULL,
	"remarks" text,
	"evaluated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "vendor_status" varchar(20) DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "vendor_category" varchar(100);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "bank_branch" varchar(100);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "bank_account_no" varchar(50);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "routing_no" varchar(20);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "blacklist_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_evaluations" ADD CONSTRAINT "vendor_evaluations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_doc_party_idx" ON "vendor_documents" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "vendor_eval_party_idx" ON "vendor_evaluations" USING btree ("party_id");