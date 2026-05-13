CREATE TYPE "public"."ig_media_type" AS ENUM('image', 'video', 'carousel_album', 'reels', 'story', 'other');--> statement-breakpoint
CREATE TABLE "ig_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"name" text,
	"profile_picture_url" text,
	"biography" text,
	"fb_page_id" text,
	"access_token_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"followers_count" integer DEFAULT 0,
	"follows_count" integer DEFAULT 0,
	"media_count" integer DEFAULT 0,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_insights_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"reach" integer DEFAULT 0,
	"profile_views" integer DEFAULT 0,
	"follower_count" integer DEFAULT 0,
	"followers_snapshot" integer,
	"website_clicks" integer DEFAULT 0,
	"email_contacts" integer DEFAULT 0,
	"phone_call_clicks" integer DEFAULT 0,
	"extra" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_media" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"ig_media_id" text NOT NULL,
	"type" "ig_media_type" DEFAULT 'other' NOT NULL,
	"caption" text,
	"permalink" text,
	"media_url" text,
	"thumbnail_url" text,
	"timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_media_insights" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"media_id" bigint NOT NULL,
	"synced_at" date NOT NULL,
	"reach" integer DEFAULT 0,
	"impressions" integer DEFAULT 0,
	"engagement" integer DEFAULT 0,
	"saved" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"video_views" integer DEFAULT 0,
	"engagement_rate" numeric(8, 4),
	"extra" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ig_insights_daily" ADD CONSTRAINT "ig_insights_daily_account_id_ig_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_media" ADD CONSTRAINT "ig_media_account_id_ig_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_media_insights" ADD CONSTRAINT "ig_media_insights_media_id_ig_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."ig_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ig_accounts_ig_user_id_uq" ON "ig_accounts" USING btree ("ig_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_insights_daily_account_date_uq" ON "ig_insights_daily" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "ig_insights_daily_date_idx" ON "ig_insights_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_media_meta_id_uq" ON "ig_media" USING btree ("ig_media_id");--> statement-breakpoint
CREATE INDEX "ig_media_account_idx" ON "ig_media" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ig_media_timestamp_idx" ON "ig_media" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_media_insights_media_date_uq" ON "ig_media_insights" USING btree ("media_id","synced_at");