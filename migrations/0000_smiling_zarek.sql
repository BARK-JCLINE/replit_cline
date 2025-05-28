CREATE TABLE "order_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"configuration_id" integer,
	"order_count" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"error_message" text,
	"created_orders" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "order_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "order_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"warehouse" text NOT NULL,
	"address" text NOT NULL,
	"line_items" jsonb NOT NULL,
	"subscription_type" text,
	"customer_segment" text,
	"custom_tags" text[],
	"address_template" text,
	"state_province" text,
	"customer_first_name" text NOT NULL,
	"customer_last_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"order_count" integer DEFAULT 1 NOT NULL,
	"order_delay" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_batches" ADD CONSTRAINT "order_batches_configuration_id_order_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."order_configurations"("id") ON DELETE no action ON UPDATE no action;