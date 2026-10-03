import { MatchStatus } from './match-status.enum';

export class Match {
  constructor(
    public readonly id: string,
    public readonly externalMatchId: string,
    public readonly user1Id: string,
    public readonly user2Id: string,
    public readonly status: MatchStatus,
    public readonly expiresAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  public static create(props: {
    id: string;
    externalMatchId: string;
    user1Id: string;
    user2Id: string;
    status?: MatchStatus;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Match {
    return new Match(
      props.id,
      props.externalMatchId,
      props.user1Id,
      props.user2Id,
      props.status ?? MatchStatus.ACTIVE,
      props.expiresAt ?? null,
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
    if (this.status !== MatchStatus.ACTIVE) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
  }
}
