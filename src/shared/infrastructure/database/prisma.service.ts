import { PrismaClient } from '@prisma/client';
import { Logger } from '../logger';

export class PrismaService extends PrismaClient {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
    });
  }

  async connect(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async disconnect(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
