import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { merchantSettingsRepo } from '@/app/repositories';
import { handleWixBillingWebhookEvent } from '@/app/actions/billing-webhook.action';
import { logger } from './logger';

export type WebhookJobType = 'APP_INSTALLED' | 'APP_REMOVED' | 'BILLING_EVENT';

export interface WebhookJob {
  id: string;
  type: WebhookJobType;
  instanceId: string;
  eventType: string;
  payload?: any;
  createdAt: Date;
  attempts: number;
  maxRetries: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __webhookWorkerInstance: WebhookWorker | undefined;
}

export class WebhookWorker {
  private queue: WebhookJob[] = [];
  private isProcessing = false;
  private pendingPromises: Promise<any>[] = [];

  constructor() {
    this.triggerQueueProcessing = this.triggerQueueProcessing.bind(this);
  }

  /**
   * Enqueues a webhook task for asynchronous background processing.
   * Returns immediately with the generated job ID.
   */
  public enqueue(
    jobData: Omit<WebhookJob, 'id' | 'createdAt' | 'attempts' | 'maxRetries'> & { maxRetries?: number },
  ): WebhookJob {
    const job: WebhookJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: jobData.type,
      instanceId: jobData.instanceId,
      eventType: jobData.eventType || '',
      payload: jobData.payload,
      createdAt: new Date(),
      attempts: 0,
      maxRetries: jobData.maxRetries ?? 3,
    };

    this.queue.push(job);
    logger.info('WORKER_ENQUEUED', 'Webhook task enqueued for background worker', {
      jobId: job.id,
      type: job.type,
      instanceId: job.instanceId,
      queueDepth: this.queue.length,
    });

    const executionPromise = this.triggerQueueProcessing();
    this.pendingPromises.push(executionPromise);
    executionPromise.finally(() => {
      this.pendingPromises = this.pendingPromises.filter((p) => p !== executionPromise);
    });

    return job;
  }

  /**
   * Flushes and awaits all pending background jobs.
   * Essential for unit tests to verify database side-effects deterministically.
   */
  public async drain(): Promise<void> {
    while (this.queue.length > 0 || this.pendingPromises.length > 0) {
      await Promise.all([...this.pendingPromises]);
      if (this.queue.length > 0 && !this.isProcessing) {
        await this.triggerQueueProcessing();
      }
      // Small tick to allow any queued microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async triggerQueueProcessing(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) break;
        await this.executeJobWithRetry(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJobWithRetry(job: WebhookJob): Promise<void> {
    while (job.attempts <= job.maxRetries) {
      job.attempts++;
      try {
        await this.executeJob(job);
        logger.info('WORKER_JOB_COMPLETED', 'Webhook job completed successfully', {
          jobId: job.id,
          type: job.type,
          instanceId: job.instanceId,
          attempts: job.attempts,
        });
        return;
      } catch (err: any) {
        logger.error('WORKER_JOB_ERROR', `Job attempt ${job.attempts}/${job.maxRetries + 1} failed`, {
          jobId: job.id,
          type: job.type,
          instanceId: job.instanceId,
          error: err?.message || String(err),
        });

        if (job.attempts > job.maxRetries) {
          logger.error('WORKER_JOB_EXHAUSTED', 'Job exhausted max retries, dropped from queue', {
            jobId: job.id,
            type: job.type,
            instanceId: job.instanceId,
          });
          return;
        }

        // Exponential backoff before next attempt (100ms, 200ms, 400ms...)
        const backoffMs = Math.min(1000, 100 * Math.pow(2, job.attempts - 1));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  private async executeJob(job: WebhookJob): Promise<void> {
    switch (job.type) {
      case 'APP_INSTALLED': {
        const [sub, existingSettings] = await Promise.all([
          subscriptionRepo.getOrCreateSubscription(job.instanceId),
          merchantSettingsRepo.getSettings(job.instanceId),
        ]);

        logger.info('WORKER_APP_INSTALLED', 'Merchant subscription initialized by worker', {
          instanceId: job.instanceId,
          planType: sub.planType,
          monthlyQuota: sub.monthlyQuota,
        });

        if (!existingSettings) {
          await merchantSettingsRepo.saveSettings(job.instanceId, {
            environment: 'TEST',
            defaultLabelFormat: 'PDF',
            enabledCarriers: ['USPS', 'FedEx', 'UPS', 'DHL'],
            fallbackRate: 10.0,
            defaultItemWeightOz: 16.0,
          });
          logger.info('WORKER_APP_INSTALLED', 'Default merchant settings saved by worker', {
            instanceId: job.instanceId,
          });
        }
        break;
      }

      case 'APP_REMOVED': {
        await subscriptionRepo.cancelSubscription(job.instanceId);
        logger.info('WORKER_APP_REMOVED', 'Tenant subscription cancelled by worker', {
          instanceId: job.instanceId,
        });
        break;
      }

      case 'BILLING_EVENT': {
        await handleWixBillingWebhookEvent({
          eventType: job.eventType,
          instanceId: job.instanceId,
          data: job.payload,
        });
        logger.info('WORKER_BILLING_EVENT', 'Billing event processed by worker', {
          instanceId: job.instanceId,
          eventType: job.eventType,
        });
        break;
      }

      default:
        logger.warn('WORKER_UNKNOWN_JOB', 'Unknown job type passed to worker', { job });
    }
  }
}

// Global singleton to survive HMR in development
export const webhookWorker = global.__webhookWorkerInstance || new WebhookWorker();
if (process.env.NODE_ENV !== 'production') {
  global.__webhookWorkerInstance = webhookWorker;
}
