CREATE TABLE "sendflow_leadscoring" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"release_id" bigint NOT NULL,
	"phone_normalized" text NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sendflow_leadscoring" ADD CONSTRAINT "sendflow_leadscoring_release_id_sendflow_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."sendflow_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sendflow_leadscoring_release_phone_uq" ON "sendflow_leadscoring" USING btree ("release_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "sendflow_leadscoring_score_idx" ON "sendflow_leadscoring" USING btree ("release_id","score");--> statement-breakpoint
CREATE INDEX "sendflow_leadscoring_phone_idx" ON "sendflow_leadscoring" USING btree ("phone_normalized");