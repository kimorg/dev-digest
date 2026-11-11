import type {
  AgentContextResult,
  ContextFileResult,
  ContextListResult,
  ContextPathsResult,
  SpecRef,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_CONTEXT_DOCS, MAX_CONTEXT_PATHS } from './constants.js';
import {
  ContextDocNotFoundError,
  ContextDocTooLargeError,
  DuplicateContextPathError,
  InvalidContextPathError,
  RepoNotClonedError,
  TooManyContextDocsError,
  classifyContextPath,
  mergeContextPaths,
  validateContextPath,
} from './domain.js';
import { toSkillContextPathsDto } from './helpers.js';
import type { ContextDocSource, ProjectContextStore } from './ports.js';
import type {
  ContextRepo,
  ProjectContext,
  ProjectContextRun,
  ScannedDocument,
} from './types.js';

const SCAN_READ_BATCH = 16;

/**
 * Project context use cases: list / rescan the repo's markdown docs, manage
 * agent and skill attachments, and resolve the docs a review run injects.
 */
export class ProjectContextService implements ProjectContext {
  /** In-flight scans per repo: concurrent rescans share one scan (EC-7). */
  private scans = new Map<string, Promise<void>>();

  constructor(
    private store: ProjectContextStore,
    private source: ContextDocSource,
    private countTokens: (text: string) => number,
    private now: () => Date = () => new Date(),
  ) {}

  // ---- Repo documents ------------------------------------------------------

  async list(workspaceId: string, repoId: string): Promise<ContextListResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!(await this.hasClone(repo))) return noCloneResult();
    if (!(await this.store.getScan(repo.id))) await this.scanOnce(repo);
    return this.buildList(workspaceId, repo.id);
  }

  async rescan(workspaceId: string, repoId: string): Promise<ContextListResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!(await this.hasClone(repo))) throw new RepoNotClonedError();
    await this.scanOnce(repo);
    return this.buildList(workspaceId, repo.id);
  }

  async getFile(workspaceId: string, repoId: string, path: string): Promise<ContextFileResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const type = validateContextPath(path) ? classifyContextPath(path) : null;
    if (!type) throw new InvalidContextPathError(path);
    if (!(await this.hasClone(repo))) throw new RepoNotClonedError();
    const read = await this.source.read(repo.clonePath!, path);
    if (read.status === 'unsafe') throw new InvalidContextPathError(path);
    if (read.status === 'missing') throw new ContextDocNotFoundError(path);
    if (read.status === 'too_large') throw new ContextDocTooLargeError(path);
    return {
      path,
      type,
      size_bytes: read.sizeBytes,
      tokens: this.countTokens(read.content),
      content: read.content,
    };
  }

  // ---- Attachments ---------------------------------------------------------

  async getAgentContext(
    workspaceId: string,
    agentId: string,
    opts: { includeSkills: boolean },
  ): Promise<AgentContextResult> {
    const paths = await this.store.getAgentPaths(workspaceId, agentId);
    if (!paths) throw new NotFoundError('Agent not found');
    if (!opts.includeSkills) return { paths };
    const entries = await this.store.listEnabledSkillContextForAgent(agentId);
    return { paths, skills: entries.map(toSkillContextPathsDto) };
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextPathsResult> {
    assertAttachable(paths);
    const saved = await this.store.setAgentPaths(workspaceId, agentId, paths);
    if (!saved) throw new NotFoundError('Agent not found');
    return { paths: saved };
  }

  async getSkillContext(workspaceId: string, skillId: string): Promise<ContextPathsResult> {
    const paths = await this.store.getSkillPaths(workspaceId, skillId);
    if (!paths) throw new NotFoundError('Skill not found');
    return { paths };
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextPathsResult> {
    assertAttachable(paths);
    const saved = await this.store.setSkillPaths(workspaceId, skillId, paths);
    if (!saved) throw new NotFoundError('Skill not found');
    return { paths: saved };
  }

  // ---- Review run ----------------------------------------------------------

  async resolveForRun(
    workspaceId: string,
    repo: ContextRepo,
    agentId: string,
    log: (message: string) => void,
  ): Promise<ProjectContextRun> {
    const none: ProjectContextRun = { docs: [], refs: null };
    const agentPaths = (await this.store.getAgentPaths(workspaceId, agentId)) ?? [];
    const skills = await this.store.listEnabledSkillContextForAgent(agentId);
    const merged = mergeContextPaths(agentPaths, skills);
    if (merged.length === 0) return none;

    if (!(await this.hasClone(repo))) {
      log('Specs: repo not cloned — context skipped');
      return none;
    }

    const docs: ProjectContextRun['docs'] = [];
    const refs: SpecRef[] = [];
    let total = 0;
    for (const m of merged) {
      const read = await this.source.read(repo.clonePath!, m.path);
      if (read.status === 'missing' || read.status === 'unsafe') {
        log(`Specs: skipped ${m.path} — not found in repo clone`);
        continue;
      }
      if (read.status === 'too_large') {
        log(`Specs: skipped ${m.path} — too large`);
        continue;
      }
      if (read.content.trim() === '') {
        log(`Specs: skipped ${m.path} — empty`);
        continue;
      }
      const tokens = this.countTokens(read.content);
      total += tokens;
      docs.push({ path: m.path, content: read.content });
      refs.push({
        path: m.path,
        type: classifyContextPath(m.path) ?? 'docs',
        tokens,
        source: m.source,
        skill_id: m.skillId,
      });
    }
    if (docs.length === 0) return none;
    log(`Specs: ${docs.length} context doc(s) attached to prompt (~${total} tokens)`);
    return { docs, refs };
  }

  // ---- Internals -----------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepo> {
    const repo = await this.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async hasClone(repo: ContextRepo): Promise<boolean> {
    return !!repo.clonePath && (await this.source.exists(repo.clonePath));
  }

  private scanOnce(repo: ContextRepo): Promise<void> {
    const running = this.scans.get(repo.id);
    if (running) return running;
    const p = this.scan(repo).finally(() => this.scans.delete(repo.id));
    this.scans.set(repo.id, p);
    return p;
  }

  private async scan(repo: ContextRepo): Promise<void> {
    const root = repo.clonePath!;
    const found = await this.source.list(root);
    const candidates = found
      .flatMap((f) => {
        const type = classifyContextPath(f.path);
        return type ? [{ ...f, type }] : [];
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const truncated = candidates.length > MAX_CONTEXT_DOCS;
    const kept = candidates.slice(0, MAX_CONTEXT_DOCS);

    const docs: ScannedDocument[] = [];
    for (let i = 0; i < kept.length; i += SCAN_READ_BATCH) {
      const batch = await Promise.all(
        kept.slice(i, i + SCAN_READ_BATCH).map(async (f): Promise<ScannedDocument | null> => {
          const read = await this.source.read(root, f.path);
          if (read.status === 'missing' || read.status === 'unsafe') return null;
          if (read.status === 'too_large') {
            return { path: f.path, type: f.type, sizeBytes: read.sizeBytes, tokens: 0, tooLarge: true };
          }
          return {
            path: f.path,
            type: f.type,
            sizeBytes: read.sizeBytes,
            tokens: this.countTokens(read.content),
            tooLarge: false,
          };
        }),
      );
      for (const d of batch) if (d) docs.push(d);
    }
    await this.store.replaceScan(repo.id, docs, this.now(), truncated);
  }

  private async buildList(workspaceId: string, repoId: string): Promise<ContextListResult> {
    const scan = await this.store.getScan(repoId);
    const documents = await this.store.listDocumentsForRepo(workspaceId, repoId);
    return {
      status: 'ok',
      scanned_at: scan ? scan.scannedAt.toISOString() : null,
      truncated: scan?.truncated ?? false,
      total_tokens: documents.reduce((sum, d) => sum + d.tokens, 0),
      documents,
    };
  }
}

function noCloneResult(): ContextListResult {
  return { status: 'no_clone', scanned_at: null, truncated: false, total_tokens: 0, documents: [] };
}

/** Count, then duplicates, then each path — all before anything is written. */
function assertAttachable(paths: string[]): void {
  if (paths.length > MAX_CONTEXT_PATHS) throw new TooManyContextDocsError(MAX_CONTEXT_PATHS);
  const seen = new Set<string>();
  for (const p of paths) {
    if (seen.has(p)) throw new DuplicateContextPathError(p);
    seen.add(p);
  }
  for (const p of paths) if (!validateContextPath(p)) throw new InvalidContextPathError(p);
}
