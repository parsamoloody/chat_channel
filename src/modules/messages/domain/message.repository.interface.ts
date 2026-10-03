import { Message } from './message.entity';

export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');

export interface CreateMessageData {
  chatId: string;
  senderId: string;
  content: string;
}

export interface IMessageRepository {
  create(data: CreateMessageData): Promise<Message>;
  findById(id: string): Promise<Message | null>;
  findByChatId(
    chatId: string,
    limit: number,
    offset: number,
  ): Promise<{ messages: Message[]; total: number }>;
}
