import { Logger } from '../../../shared/infrastructure/logger';
import { FindOrCreateTelegramUserUseCase } from '../../users/application/find-or-create-telegram-user.use-case';
import { IMatchRepository } from '../../matches/domain/match.repository.interface';
import { IChatRepository } from '../../chats/domain/chat.repository.interface';
import { MatchWaitingManager } from '../../matches/application/match-waiting-manager';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { User } from '../../users/domain/user.entity';

export interface HandleTelegramStartInput {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  startPayload?: string | null;
}

export type TelegramStartStatus =
  | 'ORGANIC'
  | 'WAITING'
  | 'ALREADY_WAITING'
  | 'CONNECTED'
  | 'INVALID_KEY';

export interface HandleTelegramStartOutput {
  status: TelegramStartStatus;
  message: string;
  user: User;
  chatId?: string;
  matchedWithUserId?: string;
  notifyPartnerTelegramUserId?: string;
}

export class HandleTelegramStartUseCase {
  private readonly logger = new Logger(HandleTelegramStartUseCase.name);

  constructor(
    private readonly findOrCreateUserUseCase: FindOrCreateTelegramUserUseCase,
    private readonly matchRepository: IMatchRepository,
    private readonly chatRepository: IChatRepository,
    private readonly matchWaitingManager: MatchWaitingManager,
    private readonly userActiveChatService?: UserActiveChatService,
  ) {}

  async execute(input: HandleTelegramStartInput): Promise<HandleTelegramStartOutput> {
    this.logger.log(
      `telegram.start.received: telegramUserId=${input.telegramUserId} payload=${input.startPayload ?? '<none>'}`,
    );

    // 1. Find or create user
    const user = await this.findOrCreateUserUseCase.execute({
      telegramUserId: input.telegramUserId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    // 2. Check startPayload
    if (!input.startPayload || input.startPayload.trim() === '') {
      this.logger.log(`User ${user.id} entered organically without match key`);
      return {
        status: 'ORGANIC',
        message: 'خوش آمدید! برای شروع چت ناشناس، لطفاً از طریق لینک یا کلید همسان‌سازی وارد شوید.',
        user,
      };
    }

    // 3. Normalize matchKey
    const rawKey = input.startPayload.trim();
    const matchKey = rawKey.replace(/^(ref_|match_)/, '');

    if (!matchKey) {
      return {
        status: 'ORGANIC',
        message: 'خوش آمدید! برای شروع چت ناشناس، لطفاً از طریق لینک یا کلید همسان‌سازی وارد شوید.',
        user,
      };
    }

    // 4. Check if matchKey already exists in DB
    // "but afte create chat for two people, save the match key in db to af third body start with same match key, ivalid key"
    const existingMatch = await this.matchRepository.findByMatchKey(matchKey);
    if (existingMatch) {
      this.logger.warn(`Match key '${matchKey}' already used/exists in database`);
      return {
        status: 'INVALID_KEY',
        message: '❌ این کلید نامعتبر است یا قبلاً استفاده شده است.',
        user,
      };
    }

    // 5. Not in DB -> check in-memory waiting queue
    // "if two people start match with same match key, create chat, not check from db"
    const waitingUser = this.matchWaitingManager.getWaitingUser(matchKey);

    if (!waitingUser) {
      // First person to arrive with this key -> wait in memory
      this.matchWaitingManager.addWaitingUser(matchKey, user.id, user.telegramUserId);
      return {
        status: 'WAITING',
        message:
          '⏳ شما با موفقیت به این کلید گفتگو متصل شدید!\n\nدر انتظار پیوستن هم‌صحبت شما... به محض اینکه طرف مقابل هم با همین کلید وارد شود، چت آغاز خواهد شد.',
        user,
      };
    }

    if (waitingUser.userId === user.id) {
      // Same user arrived again with the same key
      return {
        status: 'ALREADY_WAITING',
        message: '⏳ شما در انتظار ورود هم‌صحبت خود با این کلید هستید.',
        user,
      };
    }

    // A different user arrived with the same matchKey!
    // Two people have started with the same key -> Create chat & save in DB!
    this.matchWaitingManager.removeWaitingUser(matchKey);

    // Save match in DB to ensure third user cannot reuse it
    const match = await this.matchRepository.create({
      matchKey,
      user1Id: waitingUser.userId,
      user2Id: user.id,
    });

    // Create chat in DB with both participants
    const chatResult = await this.chatRepository.createWithParticipants({
      matchId: match.id,
      participantUserIds: [waitingUser.userId, user.id],
    });

    if (this.userActiveChatService) {
      this.userActiveChatService.setActiveChat(user.id, chatResult.chat.id);
      this.userActiveChatService.setActiveChat(waitingUser.userId, chatResult.chat.id);
    }

    this.logger.log(
      `Match completed for key '${matchKey}': users ${waitingUser.userId} and ${user.id}, chatId=${chatResult.chat.id}`,
    );

    return {
      status: 'CONNECTED',
      message:
        '🎉 هم‌صحبت شما منتظر شما بود! چت خصوصی شما آغاز شد. اکنون هر پیامی ارسال کنید به صورت مستقیم برای او ارسال می‌شود.',
      user,
      chatId: chatResult.chat.id,
      matchedWithUserId: waitingUser.userId,
      notifyPartnerTelegramUserId: waitingUser.telegramUserId,
    };
  }
}
