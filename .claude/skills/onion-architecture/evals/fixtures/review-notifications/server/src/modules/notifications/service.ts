import { WebClient } from '@slack/web-api';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { formatSummary } from './domain.js';
import type { ReviewSummaryInput } from './types.js';

export class NotificationsService {
  private slack?: WebClient;

  constructor(
    private container: Container,
    private reviews: Pick<ReviewRepository, 'getRunWithFindings'>,
  ) {}

  async notifyReviewFinished(workspaceId: string, runId: string): Promise<{ sent: boolean }> {
    const run = await this.reviews.getRunWithFindings(workspaceId, runId);
    if (!run) throw new NotFoundError('Review run not found');

    const channel = this.container.config.slackChannel;
    if (!channel) return { sent: false };

    const input: ReviewSummaryInput = {
      repo: `${run.repoOwner}/${run.repoName}`,
      prNumber: run.prNumber,
      prTitle: run.prTitle,
      agentName: run.agentName,
      findings: run.findings.map((f) => ({ severity: f.severity, title: f.title, file: f.file, line: f.line })),
    };
    const message = formatSummary(input);

    const client = await this.client();
    await client.chat.postMessage({ channel, text: message.text, blocks: message.blocks });
    return { sent: true };
  }

  private async client(): Promise<WebClient> {
    if (!this.slack) {
      const token = await this.container.secrets.get('SLACK_BOT_TOKEN');
      this.slack = new WebClient(token);
    }
    return this.slack;
  }
}
