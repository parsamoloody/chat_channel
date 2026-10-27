import { Logger } from '../../../shared/infrastructure/logger';
import { getEnvConfig } from '../../../shared/infrastructure/config/env.config';
import { REPLY_TEXTS } from '../constants/reply-texts';

export type TimeUnit = 'sec' | 'min' | 'hour' | 'day';

export interface ParsedTimeUnit {
  windowMs: number;
  unitLabel: string;
  normalizedUnit: TimeUnit;
}

export interface MediaRateLimiterConfig {
  rateLimitEnabled: boolean;
  fileSizeLimitEnabled: boolean;
  maxCount: number;
  unit: string;
  period: number;
  windowMs: number;
  unitLabel: string;
  maxFileSizeMB: number;
  maxFileSizeBytes: number;
}

export function parseTimeUnit(unit: string, period = 1): ParsedTimeUnit {
  const normalized = (unit || '').trim().toLowerCase();
  const safePeriod = Math.max(1, Math.floor(period));

  switch (normalized) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return {
        windowMs: safePeriod * 1000,
        unitLabel: safePeriod === 1 ? '۱ ثانیه' : `${safePeriod} ثانیه`,
        normalizedUnit: 'sec',
      };
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return {
        windowMs: safePeriod * 60 * 1000,
        unitLabel: safePeriod === 1 ? '۱ دقیقه' : `${safePeriod} دقیقه`,
        normalizedUnit: 'min',
      };
    case 'd':
    case 'day':
    case 'days':
      return {
        windowMs: safePeriod * 24 * 60 * 60 * 1000,
        unitLabel: safePeriod === 1 ? '۱ روز' : `${safePeriod} روز`,
        normalizedUnit: 'day',
      };
    case 'h':
    case 'hr':
    case 'hour':
    case 'hours':
    default:
      return {
        windowMs: safePeriod * 60 * 60 * 1000,
        unitLabel: safePeriod === 1 ? '۱ ساعت' : `${safePeriod} ساعت`,
        normalizedUnit: 'hour',
      };
  }
}

export class MediaRateLimiterService {
  private readonly logger = new Logger(MediaRateLimiterService.name);
  private readonly userUploads = new Map<string, number[]>();
  private customConfig?: Partial<MediaRateLimiterConfig>;

  constructor() {}

  /**
   * Set custom configuration (primarily for unit/integration tests).
   */
  public setCustomConfig(config?: Partial<MediaRateLimiterConfig>): void {
    this.customConfig = config;
  }

  /**
   * Resolve current rate limit and size limit configuration from env (or custom overrides).
   */
  public getConfig(): MediaRateLimiterConfig {
    if (this.customConfig) {
      const rateLimitEnabled = this.customConfig.rateLimitEnabled ?? false;
      const fileSizeLimitEnabled = this.customConfig.fileSizeLimitEnabled ?? false;
      const maxCount = this.customConfig.maxCount ?? 10;
      const unit = this.customConfig.unit ?? 'hour';
      const period = this.customConfig.period ?? 1;
      const parsedUnit = parseTimeUnit(unit, period);
      const windowMs = this.customConfig.windowMs ?? parsedUnit.windowMs;
      const unitLabel = this.customConfig.unitLabel ?? parsedUnit.unitLabel;
      const maxFileSizeMB = this.customConfig.maxFileSizeMB ?? 5;
      const maxFileSizeBytes = this.customConfig.maxFileSizeBytes ?? maxFileSizeMB * 1024 * 1024;

      return {
        rateLimitEnabled,
        fileSizeLimitEnabled,
        maxCount,
        unit,
        period,
        windowMs,
        unitLabel,
        maxFileSizeMB,
        maxFileSizeBytes,
      };
    }

    let envConfig: any;
    try {
      envConfig = getEnvConfig();
    } catch {
      envConfig = {
        MEDIA_RATE_LIMIT_ENABLED: false,
        MEDIA_FILE_SIZE_LIMIT_ENABLED: false,
        MEDIA_RATE_LIMIT_COUNT: 10,
        MEDIA_RATE_LIMIT_UNIT: 'hour',
        MEDIA_RATE_LIMIT_PERIOD: 1,
        MEDIA_MAX_FILE_SIZE_MB: 5,
      };
    }

    const rateLimitEnabled = envConfig.MEDIA_RATE_LIMIT_ENABLED === true;
    const fileSizeLimitEnabled = envConfig.MEDIA_FILE_SIZE_LIMIT_ENABLED === true;
    const maxCount = Number(envConfig.MEDIA_RATE_LIMIT_COUNT) || 10;
    const unit = String(envConfig.MEDIA_RATE_LIMIT_UNIT || 'hour');
    const period = Number(envConfig.MEDIA_RATE_LIMIT_PERIOD) || 1;
    const parsedUnit = parseTimeUnit(unit, period);
    const maxFileSizeMB = Number(envConfig.MEDIA_MAX_FILE_SIZE_MB) || 5;
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

    return {
      rateLimitEnabled,
      fileSizeLimitEnabled,
      maxCount,
      unit,
      period,
      windowMs: parsedUnit.windowMs,
      unitLabel: parsedUnit.unitLabel,
      maxFileSizeMB,
      maxFileSizeBytes,
    };
  }

  /**
   * Checks if an incoming media file size violates the configured maximum file size limit.
   */
  public checkFileSize(fileSizeBytes?: number): { allowed: boolean; message?: string } {
    if (fileSizeBytes === undefined || fileSizeBytes === null) {
      return { allowed: true };
    }

    const { fileSizeLimitEnabled, maxFileSizeMB, maxFileSizeBytes } = this.getConfig();
    if (!fileSizeLimitEnabled) {
      return { allowed: true };
    }

    if (fileSizeBytes > maxFileSizeBytes) {
      this.logger.warn(
        `Media file size rejected: ${fileSizeBytes} bytes exceeds limit of ${maxFileSizeBytes} bytes (${maxFileSizeMB}MB)`,
      );
      return {
        allowed: false,
        message: REPLY_TEXTS.MEDIA_FILE_TOO_LARGE(maxFileSizeMB),
      };
    }

    return { allowed: true };
  }

  /**
   * Checks if a user has exceeded the media upload rate limit within the configured time window.
   */
  public checkRateLimit(
    userId: string,
    now = Date.now(),
  ): {
    allowed: boolean;
    currentCount: number;
    maxCount: number;
    unitLabel: string;
    retryAfterMs?: number;
    message?: string;
  } {
    const { rateLimitEnabled, maxCount, windowMs, unitLabel } = this.getConfig();

    if (!rateLimitEnabled) {
      return {
        allowed: true,
        currentCount: 0,
        maxCount,
        unitLabel,
      };
    }

    const history = this.userUploads.get(userId) || [];
    // Keep only timestamps within the sliding window
    const validHistory = history.filter((ts) => now - ts < windowMs);
    this.userUploads.set(userId, validHistory);

    if (validHistory.length >= maxCount) {
      const oldest = validHistory[0];
      const retryAfterMs = Math.max(0, oldest + windowMs - now);

      this.logger.warn(
        `User ${userId} reached media rate limit (${validHistory.length}/${maxCount} in ${unitLabel})`,
      );

      return {
        allowed: false,
        currentCount: validHistory.length,
        maxCount,
        unitLabel,
        retryAfterMs,
        message: REPLY_TEXTS.MEDIA_RATE_LIMIT_EXCEEDED(maxCount, unitLabel),
      };
    }

    return {
      allowed: true,
      currentCount: validHistory.length,
      maxCount,
      unitLabel,
    };
  }

  /**
   * Records a successful media upload for a user in the sliding window.
   */
  public recordUpload(userId: string, timestamp = Date.now()): void {
    const history = this.userUploads.get(userId) || [];
    history.push(timestamp);
    this.userUploads.set(userId, history);
  }

  /**
   * Reset the rate limit history for a specific user, or for all users.
   */
  public reset(userId?: string): void {
    if (userId) {
      this.userUploads.delete(userId);
    } else {
      this.userUploads.clear();
    }
  }
}
