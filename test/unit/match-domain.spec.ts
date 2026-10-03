import { Match } from '../../src/modules/matches/domain/match.entity';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatVisibility } from '../../src/modules/chats/domain/chat-visibility.enum';

describe('Domain Entities Unit Tests', () => {
  describe('Match Entity', () => {
    const user1 = 'user-uuid-1';
    const user2 = 'user-uuid-2';
    const externalId = 'match_101';

    it('should identify whether a user is a participant', () => {
      const match = Match.create({
        id: 'm1',
        externalMatchId: externalId,
        user1Id: user1,
        user2Id: user2,
      });

      expect(match.isParticipant(user1)).toBe(true);
      expect(match.isParticipant(user2)).toBe(true);
      expect(match.isParticipant('intruder-user')).toBe(false);
    });

    it('should correctly return the other participant', () => {
      const match = Match.create({
        id: 'm1',
        externalMatchId: externalId,
        user1Id: user1,
        user2Id: user2,
      });

      expect(match.getOtherParticipantId(user1)).toBe(user2);
      expect(match.getOtherParticipantId(user2)).toBe(user1);
      expect(() => match.getOtherParticipantId('intruder-user')).toThrow();
    });

    it('should correctly determine active status based on state and expiration', () => {
      const activeMatch = Match.create({
        id: 'm1',
        externalMatchId: externalId,
        user1Id: user1,
        user2Id: user2,
        status: MatchStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60000), // 1 min in future
      });
      expect(activeMatch.isActive()).toBe(true);

      const expiredMatch = Match.create({
        id: 'm2',
        externalMatchId: externalId,
        user1Id: user1,
        user2Id: user2,
        status: MatchStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 60000), // 1 min in past
      });
      expect(expiredMatch.isActive()).toBe(false);

      const cancelledMatch = Match.create({
        id: 'm3',
        externalMatchId: externalId,
        user1Id: user1,
        user2Id: user2,
        status: MatchStatus.CANCELLED,
      });
      expect(cancelledMatch.isActive()).toBe(false);
    });
  });

  describe('Chat Entity', () => {
    it('should default visibility to HIDDEN for matched chats', () => {
      const chat = Chat.create({
        id: 'c1',
        matchId: 'm1',
      });
      expect(chat.visibility).toBe(ChatVisibility.HIDDEN);
      expect(chat.isHidden()).toBe(true);
    });

    it('should respect PUBLIC and PRIVATE visibility', () => {
      const publicChat = Chat.create({
        id: 'c2',
        visibility: ChatVisibility.PUBLIC,
      });
      expect(publicChat.isHidden()).toBe(false);

      const privateChat = Chat.create({
        id: 'c3',
        visibility: ChatVisibility.PRIVATE,
      });
      expect(privateChat.isHidden()).toBe(false);
    });
  });
});
