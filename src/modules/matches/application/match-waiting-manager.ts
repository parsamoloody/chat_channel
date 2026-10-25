import { Logger } from '../../../shared/infrastructure/logger';

export interface WaitingUser {
  userId: string;
  telegramUserId: string;
  matchKey: string;
  createdAt: Date;
}

export class MatchWaitingManager {
  private readonly logger = new Logger(MatchWaitingManager.name);
  private readonly keyToUser = new Map<string, WaitingUser>(); // normalized matchKey -> WaitingUser
  private readonly userToKey = new Map<string, string>(); // userId -> normalized matchKey

  private normalizeKey(rawKey: string): string {
    return rawKey.trim().replace(/^(ref_|match_)/, '');
  }

  getWaitingUser(matchKey: string): WaitingUser | undefined {
    const key = this.normalizeKey(matchKey);
    return this.keyToUser.get(key);
  }

  addWaitingUser(matchKey: string, userId: string, telegramUserId: string): void {
    const key = this.normalizeKey(matchKey);

    // If user was previously waiting on another key, remove the old key
    const oldKey = this.userToKey.get(userId);
    if (oldKey && oldKey !== key) {
      this.keyToUser.delete(oldKey);
    }

    const item: WaitingUser = {
      userId,
      telegramUserId,
      matchKey: key,
      createdAt: new Date(),
    };

    this.keyToUser.set(key, item);
    this.userToKey.set(userId, key);
    this.logger.log(`User ${userId} (tg: ${telegramUserId}) is waiting for partner on matchKey '${key}'`);
  }

  removeWaitingUser(matchKey: string): void {
    const key = this.normalizeKey(matchKey);
    const item = this.keyToUser.get(key);
    if (item) {
      this.userToKey.delete(item.userId);
      this.keyToUser.delete(key);
      this.logger.log(`Cleared waiting entry for matchKey '${key}' (user: ${item.userId})`);
    }
  }

  removeUser(userId: string): void {
    const key = this.userToKey.get(userId);
    if (key) {
      this.keyToUser.delete(key);
      this.userToKey.delete(userId);
    }
  }

  clear(): void {
    this.keyToUser.clear();
    this.userToKey.clear();
  }

  size(): number {
    return this.keyToUser.size;
  }
}
