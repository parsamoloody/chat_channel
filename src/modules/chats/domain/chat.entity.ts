import { ChatVisibility } from './chat-visibility.enum';

export class Chat {
  constructor(
    public readonly id: string,
    public readonly matchId: string | null,
    public readonly visibility: ChatVisibility,
    public readonly title: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

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
      props.visibility ?? ChatVisibility.HIDDEN,
      props.title ?? null,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
  }

  public isHidden(): boolean {
    return this.visibility === ChatVisibility.HIDDEN;
  }
}
