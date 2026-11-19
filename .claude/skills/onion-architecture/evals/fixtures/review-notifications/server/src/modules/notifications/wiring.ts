import { z } from 'zod';
import type { Container } from '../../platform/container.js';
import { ReviewRepository } from '../reviews/repository.js';
import { NOTIFY_REVIEW_JOB } from './constants.js';
import { NotificationsService } from './service.js';

const NotifyReviewPayload = z.object({ workspaceId: z.string().uuid(), runId: z.string().uuid() });

export function buildNotificationsService(container: Container): NotificationsService {
  return new NotificationsService(container, new ReviewRepository(container.db));
}

export function registerNotificationJobs(container: Container, service: NotificationsService): void {
  container.jobs.register(NOTIFY_REVIEW_JOB, async (payload: unknown) => {
    const { workspaceId, runId } = NotifyReviewPayload.parse(payload);
    await service.notifyReviewFinished(workspaceId, runId);
  });
}
