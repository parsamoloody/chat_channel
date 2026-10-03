import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { User } from '../domain/user.entity';
import { IUserRepository, CreateUserData, UpdateUserData } from '../domain/user.repository.interface';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTelegramUserId(telegramUserId: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { telegramUserId },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async create(data: CreateUserData): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        telegramUserId: data.telegramUserId,
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
      },
    });
    return this.toDomain(record);
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id },
      data: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return User.create({
      id: record.id,
      telegramUserId: record.telegramUserId,
      username: record.username,
      firstName: record.firstName,
      lastName: record.lastName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
