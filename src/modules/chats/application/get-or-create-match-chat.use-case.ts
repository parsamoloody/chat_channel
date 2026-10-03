import { Injectable, Inject, Logger } from '@nestjs/common';
import { IChatRepository, CHAT_REPOSITORY, ChatWithParticipants } from '../domain/chat.repository.interface';
import { ChatVisibility } from '../domain/chat-visibility.enum';

export interface GetOrCreateMatchChatInput {
  matchId: string;
  participantUserIds: string[];
  title?: string | null;
}

@Injectable()
export class GetOrCreateMatchChatUseCase {
  private readonly logger = new Logger(GetOrCreateMatchChatUseCase.name);

  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: GetOrCreateMatchChatInput): Promise<ChatWithParticipants> {
    // 1. Check if chat already exists for this match
    const existing = await this.chatRepository.findByMatchId(input.matchId);
    if (existing) {
      this.logger.log(`Found existing hidden chat ${existing.chat.id} for match ${input.matchId}`);
      return existing;
    }

    // 2. Create new hidden chat atomically with both participants
    this.logger.log(
      `Creating new hidden chat for match ${input.matchId} with participants: ${input.participantUserIds.join(', ')}`,
    );

    return await this.chatRepository.createWithParticipants({
      matchId: input.matchId,
      visibility: ChatVisibility.HIDDEN,
      title: input.title ?? 'Match Chat',
      participantUserIds: input.participantUserIds,
    });
  }
}
