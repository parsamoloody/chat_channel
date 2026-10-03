export class Message {
  constructor(
    public readonly id: string,
    public readonly chatId: string,
    public readonly senderId: string,
    public readonly content: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  public static create(props: {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Message {
    return new Message(
      props.id,
      props.chatId,
      props.senderId,
      props.content,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
  }
}
