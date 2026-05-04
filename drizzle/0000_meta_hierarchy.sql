CREATE TYPE "public"."ad_account_status" AS ENUM('active', 'paused', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."creative_type" AS ENUM('image', 'video', 'carousel', 'other');--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"meta_account_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" "ad_account_status" DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"adset_id" bigint NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"creative_id" bigint,
	"preview_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adsets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"daily_budget" numeric(14, 2),
	"targeting" jsonb,
	"optimization_goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ad_account_id" bigint NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text NOT NULL,
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"start_time" timestamp with time zone,
	"stop_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meta_id" text NOT NULL,
	"name" text,
	"type" "creative_type" NOT NULL,
	"thumbnail_url" text,
	"video_url" text,
	"headline" text,
	"body" text,
	"call_to_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_adset_id_adsets_id_fk" FOREIGN KEY ("adset_id") REFERENCES "public"."adsets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adsets" ADD CONSTRAINT "adsets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_accounts_meta_id_uq" ON "ad_accounts" USING btree ("meta_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_meta_id_uq" ON "ads" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ads_adset_idx" ON "ads" USING btree ("adset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "adsets_meta_id_uq" ON "adsets" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "adsets_campaign_idx" ON "adsets" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_meta_id_uq" ON "campaigns" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "campaigns_account_idx" ON "campaigns" USING btree ("ad_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creatives_meta_id_uq" ON "creatives" USING btree ("meta_id");