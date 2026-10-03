export class User {
  constructor(
    public readonly id: string,
    public readonly telegramUserId: string,
    public readonly username: string | null,
    public readonly firstName: string | null,
    public readonly lastName: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  public static create(props: {
    id: string;
    telegramUserId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): User {
    return new User(
      props.id,
      props.telegramUserId,
      props.username ?? null,
      props.firstName ?? null,
      props.lastName ?? null,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
  }
}
