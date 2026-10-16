# Examples: before → after

Refactors in DevDigest shapes. The code is shortened; imports use the repo's `.js` suffix convention.

## Contents
- [1. Route that queries the database](#1-route-that-queries-the-database)
- [2. Service that takes the whole container](#2-service-that-takes-the-whole-container)
- [3. Business rule hidden in a route or repository](#3-business-rule-hidden-in-a-route-or-repository)
- [4. New external tool called from a service](#4-new-external-tool-called-from-a-service)
- [5. Row type through a schema value import](#5-row-type-through-a-schema-value-import)
- [6. HTTP concerns inside a service](#6-http-concerns-inside-a-service)
- [7. Adding a dependency to a legacy service](#7-adding-a-dependency-to-a-legacy-service)
- [8. One builder for HTTP, a job and an MCP tool](#8-one-builder-for-http-a-job-and-an-mcp-tool)

## 1. Route that queries the database

**Before** (the shape of `modules/pulls/routes.ts`): the handler loads the repo, calls GitHub and upserts
rows. That is presentation, application and infrastructure in one function.

```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos).where(/* … */);
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  for (const pr of await gh.listPullRequests(repo)) {
    await container.db.insert(t.pullRequests).values({ /* … */ }).onConflictDoUpdate({ /* … */ });
  }
  return container.db.select().from(t.pullRequests).where(/* … */);
});
```

**After:** each file does one job. Nothing outside `modules/pulls/` changes.

```ts
// ports.ts (application): what the use case needs, in contract/module types (no rows)
export interface PullStore {
  getRepo(ws: string, id: string): Promise<RepoRef | undefined>;   // RepoRef: { id, owner, name }
  upsertFromGitHub(ws: string, repoId: string, pulls: PrMeta[]): Promise<void>;
  listForRepo(ws: string, repoId: string): Promise<PrMeta[]>;
}

// helpers.ts (application): pure row mappers the repository uses
export const toPrMeta = (row: PullRow): PrMeta => ({ /* … */ });      // import type { PullRow }

// repository.ts (infrastructure): SQL only, implements the port, maps rows on the way out
export class PullRepository implements PullStore {
  constructor(private db: Db) {}
  async listForRepo(ws: string, repoId: string) {
    return (await this.db.select().from(t.pullRequests).where(/* workspaceId + repoId */)).map(toPrMeta);
  }
  /* getRepo, upsertFromGitHub: every query scoped by workspaceId */
}

// service.ts (application): the use case, narrow deps
export class PullService {
  constructor(private deps: { pulls: PullStore; github: () => Promise<GitHubClient>; log: Logger }) {}

  async listForRepo(ws: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.deps.pulls.getRepo(ws, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.syncFromGitHub(ws, repo); // local-first: failure is logged, not thrown
    return this.deps.pulls.listForRepo(ws, repo.id);
  }
}

// wiring.ts (composition): the only place that constructs
export function buildPullService(container: Container, log: Logger): PullService {
  return new PullService({
    pulls: new PullRepository(container.db),
    github: () => container.github(),
    log,
  });
}

// routes.ts (presentation)
const service = buildPullService(app.container, app.log);
app.get('/repos/:id/pulls', { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});
```

## 2. Service that takes the whole container

**Before** (`AgentsService`, `ReviewService`): the dependencies are invisible, and tests must fake a
whole `Container`.

```ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async listModels(provider: Provider) {
    return (await this.container.llm(provider)).listModels();
  }
}
```

**After:** narrow, explicit dependencies. `wiring.ts` builds them. `agentsRepo` stays in the container
only because several modules share the `agents` table.

```ts
// service.ts
export interface AgentsServiceDeps {
  agents: AgentStore;                                  // port in agents/ports.ts
  resolveLlm: (id: Provider) => Promise<LLMProvider>;
}
export class AgentsService {
  constructor(private deps: AgentsServiceDeps) {}
  async listModels(provider: Provider) {
    return (await this.deps.resolveLlm(provider)).listModels();
  }
}

// wiring.ts
export const buildAgentsService = (c: Container) =>
  new AgentsService({ agents: c.agentsRepo, resolveLlm: (id) => c.llm(id) });
```

## 3. Business rule hidden in a route or repository

**Before:** the rule "a review blocks merge when it has a critical finding or the score is below 60"
is inlined where it's needed, so it's duplicated and untested.

```ts
// in a route…
const blocking = findings.some((f) => f.severity === 'critical') || review.score < 60;
// …and again in a repository WHERE clause
```

**After:** one named pure function in the domain ring, tested directly. Callers use the name.
(`modules/pulls/status.ts` → `deriveReviewStatus` is an existing example of this shape.)

```ts
// modules/reviews/domain.ts
import type { Finding } from '@devdigest/shared';
import { BLOCKING_SCORE_THRESHOLD } from './constants.js';

export function isBlocking(review: { score: number }, findings: Pick<Finding, 'severity'>[]): boolean {
  return findings.some((f) => f.severity === 'critical') || review.score < BLOCKING_SCORE_THRESHOLD;
}
```

## 4. New external tool called from a service

**Before:** a service imports an SDK, so its unit tests need the network and the SDK's types leak.

```ts
import { WebClient } from '@slack/web-api';
export class NotifyService {
  async reviewDone(review: Review) {
    await new WebClient(process.env.SLACK_TOKEN).chat.postMessage({ channel: '#reviews', text: '…' });
  }
}
```

**After:** port → adapter → mock → container getter → wiring. The container changes because this is a
new external tool. The port lives in the module that uses it, and moves to `platform/ports/` once a second
module needs it.

```ts
// modules/reviews/ports.ts (application): shaped by the use case
export interface ReviewNotifier { send(digest: { title: string; lines: string[]; url: string }): Promise<void> }

// adapters/notifier/slack.ts (infrastructure)
export class SlackNotifier implements ReviewNotifier {
  constructor(private webhookUrl: string) {}
  async send(d: { title: string; lines: string[]; url: string }) {
    const res = await fetch(this.webhookUrl, { method: 'POST', body: JSON.stringify(toSlackBlocks(d)) });
    if (!res.ok) throw new ExternalServiceError('Slack post failed', { status: res.status });
  }
}

// adapters/mocks.ts
export class MockNotifier implements ReviewNotifier { sent: unknown[] = []; async send(d: unknown) { this.sent.push(d); } }

// platform/container.ts: async getter honoring ContainerOverrides.notifier; webhook via SecretsProvider;
//                        returns null when not configured
// modules/reviews/wiring.ts
resolveNotifier: () => container.notifier(),

// modules/reviews/service.ts: best-effort, summary built by a pure domain function
const notifier = await this.deps.resolveNotifier();
if (notifier) await notifier.send(buildDigest(review)).catch((err) => this.deps.log.warn({ err }, 'notify failed'));
```

## 5. Row type through a schema value import

**Before** (`reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`):

```ts
import * as schema from '../../db/schema.js';
function load(repo: typeof schema.repos.$inferSelect) { /* … */ }
```

**After:** the row type is declared once next to the schema and imported as a type.

```ts
// db/rows.ts
export type RepoRow = typeof t.repos.$inferSelect;

// service / helper
import type { RepoRow } from '../../db/rows.js';
function load(repo: RepoRow) { /* … */ }
```

## 6. HTTP concerns inside a service

**Before:**

```ts
async dismiss(ws: string, id: string, reply: FastifyReply) {
  const f = await this.repo.getFinding(ws, id);
  if (!f) return reply.code(404).send({ error: 'not found' });
}
```

**After:** the service speaks domain errors. The shared handler builds the envelope and status.

```ts
async dismiss(ws: string, id: string): Promise<Finding> {
  const f = await this.repo.getFinding(ws, id);
  if (!f) throw new NotFoundError('Finding not found');
  return toFindingDto(await this.repo.setFindingDismissed(ws, id, true));
}
```

## 7. Adding a dependency to a legacy service

The task: `ReviewService` (legacy, takes `Container`) now needs the linked skills of an agent. The task is
not a refactor of `ReviewService`.

**Don't:** add one more container read. The import-rule baseline already knows the
`service.ts → container.ts` edge, so it won't report this.

```ts
const skills = await this.container.skillsRepo.listForAgent(agent.id);
```

**Do:** add an explicit option next to the legacy argument, and pass it where the service is built.

```ts
export class ReviewService {
  constructor(private container: Container, private deps: { skills?: SkillCatalog } = {}) { /* … */ }
}
// skills/types.ts: `export interface SkillCatalog { listForAgent(id: string): Promise<Skill[]> }` (facade)
// reviews/routes.ts (until reviews gets its own wiring.ts):
const service = new ReviewService(app.container, { skills: app.container.skills });
```

The new dependency is visible in the constructor, and tests can pass a fake. When `ReviewService` is
refactored, the option becomes part of its deps object.

## 8. One builder for HTTP, a job and an MCP tool

A capability that has more than one entry point keeps a single construction path. Each entry point
parses its own input and makes one call.

```ts
// modules/conventions/wiring.ts
export function buildConventionService(c: Container) { /* new ConventionService({ store, resolveLlm, repoIntel }) */ }
export function registerConventionJobs(c: Container, s: ConventionService) {
  c.jobs.register(CONVENTIONS_EXTRACT_JOB_KIND, (p) => s.extract(ExtractPayload.parse(p)));
}

// modules/conventions/routes.ts (HTTP)
const service = buildConventionService(app.container);
registerConventionJobs(app.container, service);
app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.requestExtraction(workspaceId, req.params.id); // the service calls its injected `enqueue` dependency
});

// an MCP tool (another entry point, its own bootstrap builds the container)
const service = buildConventionService(container);
server.tool('list_conventions', ListInput, async (input) => service.listForRepo(input.workspaceId, input.repoId));
```
