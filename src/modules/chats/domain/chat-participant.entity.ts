import { ChatParticipantRole } from './chat-visibility.enum';

export class ChatParticipant {
  public readonly role: ChatParticipantRole = ChatParticipantRole.MEMBER;

  constructor(
    public readonly id: string,
    public readonly chatId: string,
    public readonly userId: string,
    public readonly joinedAt: Date,
    role?: ChatParticipantRole,
  ) {
    if (role) {
      this.role = role;
    }
  }

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
      props.joinedAt ?? new Date(),
      props.role ?? ChatParticipantRole.MEMBER,
    );
  }
}
