import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaService } from './shared/infrastructure/database/prisma.service';
import { Logger } from './shared/infrastructure/logger';
import { getEnvConfig } from './shared/infrastructure/config/env.config';
import { PrismaUserRepository } from './modules/users/infrastructure/prisma-user.repository';
import { PrismaMatchRepository } from './modules/matches/infrastructure/prisma-match.repository';
import { PrismaChatRepository } from './modules/chats/infrastructure/prisma-chat.repository';
import { PrismaMessageRepository } from './modules/messages/infrastructure/prisma-message.repository';
import { UserActiveChatService } from './modules/chats/application/user-active-chat.service';
import { MatchWaitingManager } from './modules/matches/application/match-waiting-manager';
import { FindOrCreateTelegramUserUseCase } from './modules/users/application/find-or-create-telegram-user.use-case';
import { HandleTelegramStartUseCase } from './modules/telegram/application/handle-telegram-start.use-case';
import { SendMessageUseCase } from './modules/messages/application/send-message.use-case';
import { HandleTelegramMessageUseCase } from './modules/telegram/application/handle-telegram-message.use-case';
import { GetUserActiveChatPartnerUseCase } from './modules/chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from './modules/chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from './modules/chats/application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from './modules/chats/application/terminate-chat.use-case';
import { TelegramBotService } from './modules/telegram/infrastructure/telegram-bot.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const config = getEnvConfig();

  logger.log(`Initializing Chat Bot (environment: ${config.NODE_ENV})...`);

  // 1. Database
  const prisma = new PrismaService();
  await prisma.connect();

  // 2. Repositories
  const userRepo = new PrismaUserRepository(prisma);
  const matchRepo = new PrismaMatchRepository(prisma);
  const chatRepo = new PrismaChatRepository(prisma);
  const messageRepo = new PrismaMessageRepository(prisma);

  // 3. State & Memory Managers
  const userActiveChatService = new UserActiveChatService(prisma);
  await userActiveChatService.init();

  const matchWaitingManager = new MatchWaitingManager();

  // 4. Use Cases
  const findOrCreateUserUseCase = new FindOrCreateTelegramUserUseCase(userRepo);
  const handleStartUseCase = new HandleTelegramStartUseCase(
    findOrCreateUserUseCase,
    matchRepo,
    chatRepo,
    matchWaitingManager,
    userActiveChatService,
  );

  const sendMessageUseCase = new SendMessageUseCase(messageRepo, chatRepo);
  const handleMessageUseCase = new HandleTelegramMessageUseCase(
    userRepo,
    chatRepo,
    sendMessageUseCase,
    userActiveChatService,
  );

  const getUserActiveChatPartnerUseCase = new GetUserActiveChatPartnerUseCase(
    userRepo,
    chatRepo,
    userActiveChatService,
    matchRepo,
  );
  const getUserChatListUseCase = new GetUserChatListUseCase(
    userRepo,
    chatRepo,
    userActiveChatService,
    matchRepo,
  );
  const switchUserActiveChatUseCase = new SwitchUserActiveChatUseCase(
    userRepo,
    chatRepo,
    userActiveChatService,
  );
  const terminateChatUseCase = new TerminateChatUseCase(
    userRepo,
    chatRepo,
    matchRepo,
    userActiveChatService,
  );

  // 5. Bot Service
  const botService = new TelegramBotService({
    handleStartUseCase,
    handleMessageUseCase,
    getUserActiveChatPartnerUseCase,
    getUserChatListUseCase,
    switchUserActiveChatUseCase,
    terminateChatUseCase,
    userRepository: userRepo,
    messageRepository: messageRepo,
    userActiveChatService,
    botToken: config.TELEGRAM_BOT_TOKEN,
  });

  await botService.start();
  logger.log('Chat Bot successfully started!');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Shutting down gracefully...`);
    await botService.stop();
    await prisma.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
