CREATE TYPE "public"."tenant_status" AS ENUM('provisioning', 'active', 'suspended', 'failed');--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"name" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan" varchar(50) NOT NULL,
	"max_users" integer DEFAULT 25 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_databases" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"db_name" varchar(63) NOT NULL,
	"db_user" varchar(63) NOT NULL,
	"db_password_enc" text NOT NULL,
	"schema_version" varchar(100),
	"last_migrated_at" timestamp with time zone,
	CONSTRAINT "tenant_databases_db_name_unique" UNIQUE("db_name")
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tenant_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(63) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "tenant_status" DEFAULT 'provisioning' NOT NULL,
	"plan" varchar(50) DEFAULT 'standard' NOT NULL,
	"contact_email" varchar(200),
	"contact_phone" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_databases" ADD CONSTRAINT "tenant_databases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;