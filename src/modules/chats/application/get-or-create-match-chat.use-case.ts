import { Logger } from '../../../shared/infrastructure/logger';
import { IChatRepository, ChatWithParticipants } from '../domain/chat.repository.interface';

export interface GetOrCreateMatchChatInput {
  matchId: string;
  participantUserIds: string[];
  title?: string | null;
}

export class GetOrCreateMatchChatUseCase {
  private readonly logger = new Logger(GetOrCreateMatchChatUseCase.name);

  constructor(private readonly chatRepository: IChatRepository) {}

  async execute(input: GetOrCreateMatchChatInput): Promise<ChatWithParticipants> {
    // 1. Check if chat already exists for this match
    const existing = await this.chatRepository.findByMatchId(input.matchId);
    if (existing) {
      this.logger.log(`Found existing chat ${existing.chat.id} for match ${input.matchId}`);
      return existing;
    }

    // 2. Create new chat atomically with both participants
    this.logger.log(
      `Creating new chat for match ${input.matchId} with participants: ${input.participantUserIds.join(', ')}`,
    );

    return await this.chatRepository.createWithParticipants({
      matchId: input.matchId,
      participantUserIds: input.participantUserIds,
    });
  }
}
