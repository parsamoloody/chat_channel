import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Chat } from '../domain/chat.entity';
import { ChatParticipant } from '../domain/chat-participant.entity';
import { ChatVisibility, ChatParticipantRole } from '../domain/chat-visibility.enum';
import {
  IChatRepository,
  CreateChatWithParticipantsData,
  ChatWithParticipants,
} from '../domain/chat.repository.interface';

@Injectable()
export class PrismaChatRepository implements IChatRepository {
  private readonly logger = new Logger(PrismaChatRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Chat | null> {
    const record = await this.prisma.chat.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomainChat(record);
  }

  async findByMatchId(matchId: string): Promise<ChatWithParticipants | null> {
    const record = await this.prisma.chat.findUnique({
      where: { matchId },
      include: {
        participants: true,
      },
    });
    if (!record) return null;
    return {
      chat: this.toDomainChat(record),
      participants: record.participants.map((p) => this.toDomainParticipant(p)),
    };
  }

  async findWithParticipants(id: string): Promise<ChatWithParticipants | null> {
    const record = await this.prisma.chat.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });
    if (!record) return null;
    return {
      chat: this.toDomainChat(record),
      participants: record.participants.map((p) => this.toDomainParticipant(p)),
    };
  }

  async createWithParticipants(
    data: CreateChatWithParticipantsData,
  ): Promise<ChatWithParticipants> {
    const visibility = data.visibility ?? ChatVisibility.HIDDEN;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // If matchId is specified, check if already exists inside transaction
        if (data.matchId) {
          const existing = await tx.chat.findUnique({
            where: { matchId: data.matchId },
            include: { participants: true },
          });
          if (existing) {
            return {
              chat: this.toDomainChat(existing),
              participants: existing.participants.map((p) => this.toDomainParticipant(p)),
            };
          }
        }

        const chatRecord = await tx.chat.create({
          data: {
            matchId: data.matchId ?? null,
            visibility,
            title: data.title ?? null,
          },
        });

        // Add distinct participants
        const uniqueUserIds = Array.from(new Set(data.participantUserIds));
        const participants: ChatParticipant[] = [];

        for (const userId of uniqueUserIds) {
          const pRecord = await tx.chatParticipant.create({
            data: {
              chatId: chatRecord.id,
              userId,
              role: ChatParticipantRole.MEMBER,
            },
          });
          participants.push(this.toDomainParticipant(pRecord));
        }

        return {
          chat: this.toDomainChat(chatRecord),
          participants,
        };
      });
    } catch (error: any) {
      // Race condition fallback: if another concurrent transaction committed chat with matchId
      if (data.matchId && (error?.code === 'P2002' || error?.message?.includes('Unique constraint'))) {
        this.logger.warn(`Unique constraint caught on matchId ${data.matchId}, resolving existing chat`);
        const existing = await this.findByMatchId(data.matchId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async isParticipant(chatId: string, userId: string): Promise<boolean> {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });
    return !!participant;
  }

  async findUserChats(userId: string, includeHidden: boolean): Promise<Chat[]> {
    const whereClause: any = {
      participants: {
        some: {
          userId,
        },
      },
    };

    if (!includeHidden) {
      // Strictly exclude HIDDEN chats at database level
      whereClause.visibility = {
        not: ChatVisibility.HIDDEN,
      };
    }

    const records = await this.prisma.chat.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => this.toDomainChat(r));
  }

  async findAllHiddenChats(
    limit: number,
    offset: number,
  ): Promise<{ chats: ChatWithParticipants[]; total: number }> {
    const [records, total] = await Promise.all([
      this.prisma.chat.findMany({
        where: {
          visibility: ChatVisibility.HIDDEN,
        },
        include: {
          participants: true,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chat.count({
        where: {
          visibility: ChatVisibility.HIDDEN,
        },
      }),
    ]);

    return {
      chats: records.map((r) => ({
        chat: this.toDomainChat(r),
        participants: r.participants.map((p) => this.toDomainParticipant(p)),
      })),
      total,
    };
  }

  private toDomainChat(record: {
    id: string;
    matchId: string | null;
    visibility: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Chat {
    return Chat.create({
      id: record.id,
      matchId: record.matchId,
      visibility: record.visibility as ChatVisibility,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toDomainParticipant(record: {
    id: string;
    chatId: string;
    userId: string;
    role: string;
    joinedAt: Date;
  }): ChatParticipant {
    return ChatParticipant.create({
      id: record.id,
      chatId: record.chatId,
      userId: record.userId,
      role: record.role as ChatParticipantRole,
      joinedAt: record.joinedAt,
    });
  }
}
