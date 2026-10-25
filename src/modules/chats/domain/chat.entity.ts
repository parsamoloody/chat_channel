import { ChatVisibility } from './chat-visibility.enum';

export class Chat {
  public readonly visibility: ChatVisibility = ChatVisibility.HIDDEN;

  constructor(
    public readonly id: string,
    public readonly matchId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    visibility?: ChatVisibility,
  ) {
    if (visibility) {
      this.visibility = visibility;
    }
  }

  public isHidden(): boolean {
    return this.visibility === ChatVisibility.HIDDEN;
  }

  public static create(props: {
    id: string;
    matchId?: string | null;
    visibility?: ChatVisibility;
    title?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): Chat {
    return new Chat(
      props.id,
      props.matchId ?? null,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
      props.visibility ?? ChatVisibility.HIDDEN,
    );
  }
}
