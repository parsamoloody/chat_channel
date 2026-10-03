import { ChatParticipantRole } from './chat-visibility.enum';

export class ChatParticipant {
  constructor(
    public readonly id: string,
    public readonly chatId: string,
    public readonly userId: string,
    public readonly role: ChatParticipantRole,
    public readonly joinedAt: Date,
  ) {}

  public static create(props: {
    id: string;
    chatId: string;
    userId: string;
    role?: ChatParticipantRole;
    joinedAt?: Date;
  }): ChatParticipant {
    return new ChatParticipant(
      props.id,
      props.chatId,
      props.userId,
      props.role ?? ChatParticipantRole.MEMBER,
      props.joinedAt ?? new Date(),
    );
  }
}
