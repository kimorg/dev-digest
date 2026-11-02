/** Application: the five use cases behind the tools. Holds no HTTP or MCP knowledge. */
import { ToolError } from './errors.js';
import {
  pickLatestResult,
  toAgentList,
  toConventionsResult,
  toReviewResult,
  toRunningResult,
} from './format.js';
import type { DevDigestApi } from './ports.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { runAndWait } from './run-and-wait.js';
import type { AgentSummary, ConventionsResult, ReviewResult, RunningResult } from './types.js';

export interface ServiceOptions {
  api: DevDigestApi;
  runTimeoutMs: number;
  pollMs: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

export class DevDigestService {
  private readonly api: DevDigestApi;
  private readonly runTimeoutMs: number;
  private readonly pollMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  constructor(options: ServiceOptions) {
    this.api = options.api;
    this.runTimeoutMs = options.runTimeoutMs;
    this.pollMs = options.pollMs;
    this.sleep = options.sleep ?? abortableSleep;
    this.now = options.now ?? Date.now;
  }

  async listAgents(): Promise<{ agents: AgentSummary[] }> {
    return toAgentList(await this.api.listAgents());
  }

  async runAgentOnPr(
    repoName: string,
    pr: number,
    agentIdent: string,
    signal?: AbortSignal,
  ): Promise<ReviewResult | RunningResult> {
    const repo = await resolveRepo(this.api, repoName);
    const pull = await resolvePull(this.api, repo, pr);
    const agent = await resolveAgent(this.api, agentIdent);

    const outcome = await runAndWait(
      {
        api: this.api,
        sleep: this.sleep,
        now: this.now,
        timeoutMs: this.runTimeoutMs,
        pollMs: this.pollMs,
        ...(signal ? { signal } : {}),
      },
      pull.id,
      agent,
    );

    if (outcome.kind === 'running') {
      const seconds = Math.round(this.runTimeoutMs / 1000);
      return toRunningResult(
        outcome.runId,
        `Still running after ${seconds} s — call get_findings(repo, pr, agent) in ~30 s; calling run_agent_on_pr again only re-attaches.`,
      );
    }
    return toReviewResult(outcome.review, { repo: repo.full_name, pr, agent: agent.name });
  }

  async getFindings(
    repoName: string,
    pr: number,
    agentIdent: string,
  ): Promise<ReviewResult | RunningResult> {
    const repo = await resolveRepo(this.api, repoName);
    const pull = await resolvePull(this.api, repo, pr);
    const agent = await resolveAgent(this.api, agentIdent);
    const [runs, reviews] = await Promise.all([
      this.api.listRuns(pull.id),
      this.api.listReviews(pull.id),
    ]);

    const latest = pickLatestResult(runs, reviews, agent.id);
    if (latest.kind === 'running') {
      return toRunningResult(latest.runId, 'Run is still in progress — call get_findings again in ~30 s.');
    }
    if (latest.kind === 'none') {
      throw new ToolError(
        `No review of PR #${pr} by ${agent.name} yet — call run_agent_on_pr (costs LLM credits).${
          latest.lastError ? ` Last run failed: ${latest.lastError}` : ''
        }`,
      );
    }
    return toReviewResult(
      latest.review,
      { repo: repo.full_name, pr, agent: agent.name },
      latest.note,
    );
  }

  async getConventions(repoName: string): Promise<ConventionsResult> {
    const repo = await resolveRepo(this.api, repoName);
    const data = await this.api.getConventions(repo.id);
    if (!data.scan) {
      throw new ToolError(
        `No conventions scan for ${repo.full_name} yet — run "Extract conventions" in the DevDigest UI; this tool does not start scans.`,
      );
    }
    if (data.scan.status === 'failed') {
      throw new ToolError(
        `The last conventions scan for ${repo.full_name} failed: ${data.scan.error ?? 'no error recorded'}. Re-run "Extract conventions" in the DevDigest UI.`,
      );
    }
    return toConventionsResult(repo.full_name, data);
  }
}
