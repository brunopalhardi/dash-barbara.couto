ALTER TYPE "public"."sync_job_type" ADD VALUE 'ig_full' BEFORE 'hotmart_replay';--> statement-breakpoint
ALTER TYPE "public"."sync_job_type" ADD VALUE 'ig_incremental' BEFORE 'hotmart_replay';--> statement-breakpoint
ALTER TYPE "public"."sync_job_type" ADD VALUE 'ig_manual' BEFORE 'hotmart_replay';