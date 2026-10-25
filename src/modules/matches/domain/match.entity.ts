import { MatchStatus } from './match-status.enum';

export class Match {
  constructor(
    public readonly id: string,
    public readonly matchKey: string,
    public readonly user1Id: string,
    public readonly user2Id: string,
    public readonly status: MatchStatus,
    public readonly createdAt: Date,
  ) {}

  public get externalMatchId(): string {
    return this.matchKey;
  }

  public static create(props: {
    id: string;
    matchKey?: string;
    externalMatchId?: string;
    user1Id: string;
    user2Id?: string | null;
    status?: MatchStatus;
    createdAt?: Date;
  }): Match {
    const key = props.matchKey ?? props.externalMatchId ?? '';
    return new Match(
      props.id,
      key,
      props.user1Id,
      props.user2Id ?? '',
      props.status ?? MatchStatus.ACTIVE,
      props.createdAt ?? new Date(),
    );
  }

  public isParticipant(userId: string): boolean {
    return this.user1Id === userId || this.user2Id === userId;
  }

  public getOtherParticipantId(userId: string): string {
    if (this.user1Id === userId) return this.user2Id;
    if (this.user2Id === userId) return this.user1Id;
    throw new Error(`User ${userId} is not a participant in match ${this.id}`);
  }

  public isActive(): boolean {
    return this.status === MatchStatus.ACTIVE;
  }
}
