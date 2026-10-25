import { PrismaClient } from '@prisma/client';
import { Message } from '../domain/message.entity';
import { IMessageRepository, CreateMessageData } from '../domain/message.repository.interface';

export class PrismaMessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateMessageData): Promise<Message> {
    const record = await this.prisma.message.create({
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        content: data.content,
      },
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<Message | null> {
    const record = await this.prisma.message.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByChatId(
    chatId: string,
    limit: number,
    offset: number,
  ): Promise<{ messages: Message[]; total: number }> {
    const [records, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { chatId },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({
        where: { chatId },
      }),
    ]);

    return {
      messages: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  private toDomain(record: {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    createdAt: Date;
  }): Message {
    return Message.create({
      id: record.id,
      chatId: record.chatId,
      senderId: record.senderId,
      content: record.content,
      createdAt: record.createdAt,
    });
  }
}
