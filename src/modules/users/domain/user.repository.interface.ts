import { User } from './user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserData {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface UpdateUserData {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByTelegramUserId(telegramUserId: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
}
