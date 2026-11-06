CREATE TABLE "agent_context_docs" (
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "agent_context_docs_agent_id_path_pk" PRIMARY KEY("agent_id","path"),
	CONSTRAINT "agent_context_docs_order_check" CHECK ("agent_context_docs"."order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "context_documents" (
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"tokens" integer NOT NULL,
	"too_large" boolean DEFAULT false NOT NULL,
	CONSTRAINT "context_documents_repo_id_path_pk" PRIMARY KEY("repo_id","path"),
	CONSTRAINT "context_documents_type_check" CHECK ("context_documents"."type" in ('docs','specs','insights','plans','readme')),
	CONSTRAINT "context_documents_size_bytes_check" CHECK ("context_documents"."size_bytes" >= 0),
	CONSTRAINT "context_documents_tokens_check" CHECK ("context_documents"."tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "context_scans" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_context_docs" (
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "skill_context_docs_skill_id_path_pk" PRIMARY KEY("skill_id","path"),
	CONSTRAINT "skill_context_docs_order_check" CHECK ("skill_context_docs"."order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_documents" ADD CONSTRAINT "context_documents_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_scans" ADD CONSTRAINT "context_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_context_docs_path_idx" ON "agent_context_docs" USING btree ("path");--> statement-breakpoint
CREATE INDEX "skill_context_docs_path_idx" ON "skill_context_docs" USING btree ("path");