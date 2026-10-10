import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UserActiveChatService implements OnModuleInit {
  private readonly logger = new Logger(UserActiveChatService.name);
  private readonly activeChats = new Map<string, string>(); // userId -> chatId
  private readonly terminatedChats = new Set<string>(); // chatId
  private readonly storageFilePath = path.resolve(process.cwd(), '.active_chats.json');

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async onModuleInit() {
    this.loadStateFromFile();
    if (this.prisma) {
      await this.syncWithDatabase();
    }
  }

  private loadStateFromFile() {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const content = fs.readFileSync(this.storageFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [userId, chatId] of Object.entries(parsed)) {
            if (typeof chatId === 'string') {
              this.activeChats.set(userId, chatId);
            }
          }
          this.logger.log(`Loaded ${this.activeChats.size} active chat session(s) from persistence file`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not load active chat storage file: ${err.message}`);
    }
  }

  private async syncWithDatabase() {
    try {
      if (!this.prisma) return;
      const users = await this.prisma.user.findMany({
        where: { activeChatId: { not: null } },
        select: { id: true, activeChatId: true },
      });
      for (const u of users) {
        if (u.activeChatId) {
          this.activeChats.set(u.id, u.activeChatId);
        }
      }
      this.logger.log(`Synced ${users.length} active chat session(s) from database`);
      this.persistStateToFile();
    } catch (err: any) {
      this.logger.warn(`Could not sync active chats from database: ${err.message}`);
    }
  }

  private persistStateToFile() {
    try {
      const data: Record<string, string> = {};
      for (const [userId, chatId] of this.activeChats.entries()) {
        data[userId] = chatId;
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.warn(`Could not persist active chat storage file: ${err.message}`);
    }
  }

  setActiveChat(userId: string, chatId: string): void {
    this.activeChats.set(userId, chatId);
    this.persistStateToFile();

    if (this.prisma) {
      this.prisma.user
        .update({
          where: { id: userId },
          data: { activeChatId: chatId },
        })
        .catch((err) => {
          this.logger.warn(`Could not persist activeChatId to database for user ${userId}: ${err.message}`);
        });
    }
  }

  getActiveChat(userId: string): string | undefined {
    return this.activeChats.get(userId);
  }

  clearActiveChat(userId: string): void {
    this.activeChats.delete(userId);
    this.persistStateToFile();

    if (this.prisma) {
      this.prisma.user
        .update({
          where: { id: userId },
          data: { activeChatId: null },
        })
        .catch(() => {});
    }
  }

  markChatTerminated(chatId: string): void {
    this.terminatedChats.add(chatId);
    for (const [userId, cId] of this.activeChats.entries()) {
      if (cId === chatId) {
        this.clearActiveChat(userId);
      }
    }
  }

  isChatTerminated(chatId: string): boolean {
    return this.terminatedChats.has(chatId);
  }

  clearAll(): void {
    this.activeChats.clear();
    this.terminatedChats.clear();
    this.persistStateToFile();
  }
}
