import { Chat } from './chat.entity';
import { ChatParticipant } from './chat-participant.entity';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface CreateChatWithParticipantsData {
  matchId?: string | null;
  participantUserIds: string[];
}

export interface ChatWithParticipants {
  chat: Chat;
  participants: ChatParticipant[];
}

export interface IChatRepository {
  findById(id: string): Promise<Chat | null>;
  findByMatchId(matchId: string): Promise<ChatWithParticipants | null>;
  findWithParticipants(id: string): Promise<ChatWithParticipants | null>;
  createWithParticipants(data: CreateChatWithParticipantsData): Promise<ChatWithParticipants>;
  isParticipant(chatId: string, userId: string): Promise<boolean>;
  findUserChats(userId: string, includeHidden?: boolean): Promise<Chat[]>;
}
