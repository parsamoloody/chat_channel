import { Chat } from './chat.entity';
import { ChatParticipant } from './chat-participant.entity';
import { ChatVisibility } from './chat-visibility.enum';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface CreateChatWithParticipantsData {
  matchId?: string | null;
  visibility?: ChatVisibility;
  title?: string | null;
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
  findUserChats(userId: string, includeHidden: boolean): Promise<Chat[]>;
  findAllHiddenChats(limit: number, offset: number): Promise<{ chats: ChatWithParticipants[]; total: number }>;
}
