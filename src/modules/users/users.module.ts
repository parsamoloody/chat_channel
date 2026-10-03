import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/user.repository.interface';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { FindOrCreateTelegramUserUseCase } from './application/find-or-create-telegram-user.use-case';

@Module({
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    FindOrCreateTelegramUserUseCase,
  ],
  exports: [USER_REPOSITORY, FindOrCreateTelegramUserUseCase],
})
export class UsersModule {}
