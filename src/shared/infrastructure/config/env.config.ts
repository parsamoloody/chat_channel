import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TELEGRAM_POLLING: z.string().optional().default('true'),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .optional()
    .default('your_bot_username')
    .transform((val) => val.trim().replace(/^@/, '') || 'your_bot_username'),
  MEDIA_RATE_LIMIT_ENABLED: z
    .preprocess(
      (val) => {
        const raw = val ?? process.env.RATE_LIMIT_ENABLED;
        if (raw === undefined || raw === null || raw === '') return false;
        if (typeof raw === 'boolean') return raw;
        const str = String(raw).trim().toLowerCase();
        return str === 'true' || str === '1' || str === 'yes';
      },
      z.boolean(),
    )
    .default(false),
  MEDIA_FILE_SIZE_LIMIT_ENABLED: z
    .preprocess(
      (val) => {
        const raw = val ?? process.env.FILE_SIZE_LIMIT_ENABLED;
        if (raw === undefined || raw === null || raw === '') return false;
        if (typeof raw === 'boolean') return raw;
        const str = String(raw).trim().toLowerCase();
        return str === 'true' || str === '1' || str === 'yes';
      },
      z.boolean(),
    )
    .default(false),
  MEDIA_RATE_LIMIT_COUNT: z
    .preprocess(
      (val) => val ?? process.env.MEDIA_LIMIT_COUNT,
      z.coerce.number().positive(),
    )
    .default(10),
  MEDIA_RATE_LIMIT_UNIT: z
    .preprocess(
      (val) => val ?? process.env.MEDIA_LIMIT_UNIT,
      z.string(),
    )
    .default('hour'),
  MEDIA_RATE_LIMIT_PERIOD: z.coerce.number().positive().default(1),
  MEDIA_MAX_FILE_SIZE_MB: z
    .preprocess(
      (val) =>
        val ??
        process.env.MAX_MEDIA_SIZE_MB ??
        process.env.MEDIA_SIZE_LIMIT_MB ??
        process.env.MEDIA_MAX_SIZE_MB,
      z.coerce.number().positive(),
    )
    .default(5),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!parsedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const errorMsg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Environment configuration error: ${errorMsg}`);
    }
    parsedEnv = result.data;
  }
  return parsedEnv;
}

export function resetEnvConfig(): void {
  parsedEnv = null;
}

export function setBotUsername(username: string): void {
  const clean = username.trim().replace(/^@/, '');
  if (clean) {
    const config = getEnvConfig();
    config.TELEGRAM_BOT_USERNAME = clean;
  }
}
