import { Injectable, Inject, Logger } from '@nestjs/common';
import { User } from '../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../domain/user.repository.interface';

export interface TelegramUserProfileInput {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

@Injectable()
export class FindOrCreateTelegramUserUseCase {
  private readonly logger = new Logger(FindOrCreateTelegramUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: TelegramUserProfileInput): Promise<User> {
    const existing = await this.userRepository.findByTelegramUserId(input.telegramUserId);

    if (existing) {
      // Check if profile updated in Telegram
      const hasChanged =
        existing.username !== (input.username ?? null) ||
        existing.firstName !== (input.firstName ?? null) ||
        existing.lastName !== (input.lastName ?? null);

      if (hasChanged) {
        this.logger.log(`Updating profile for user ${existing.id} (telegram: ${input.telegramUserId})`);
        return this.userRepository.update(existing.id, {
          username: input.username,
          firstName: input.firstName,
          lastName: input.lastName,
        });
      }

      return existing;
    }

    try {
      this.logger.log(`Creating new user for telegram id: ${input.telegramUserId}`);
      return await this.userRepository.create({
        telegramUserId: input.telegramUserId,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    } catch (error: any) {
      // Handle race condition: another concurrent request created the user
      const raceExisting = await this.userRepository.findByTelegramUserId(input.telegramUserId);
      if (raceExisting) {
        return raceExisting;
      }
      throw error;
    }
  }
}
