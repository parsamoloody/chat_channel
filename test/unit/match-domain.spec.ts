import { Match } from '../../src/modules/matches/domain/match.entity';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { Message } from '../../src/modules/messages/domain/message.entity';

describe('Domain Entities Unit Tests', () => {
  describe('Match Entity', () => {
    const user1 = 'user-uuid-1';
    const user2 = 'user-uuid-2';
    const matchKey = 'secret_key_101';

    it('should identify whether a user is a participant', () => {
      const match = Match.create({
        id: 'm1',
        matchKey,
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
        matchKey,
        user1Id: user1,
        user2Id: user2,
      });

      expect(match.getOtherParticipantId(user1)).toBe(user2);
      expect(match.getOtherParticipantId(user2)).toBe(user1);
      expect(() => match.getOtherParticipantId('intruder-user')).toThrow();
    });

    it('should correctly determine active status based on state', () => {
      const activeMatch = Match.create({
        id: 'm1',
        matchKey,
        user1Id: user1,
        user2Id: user2,
        status: MatchStatus.ACTIVE,
      });
      expect(activeMatch.isActive()).toBe(true);

      const cancelledMatch = Match.create({
        id: 'm2',
        matchKey,
        user1Id: user1,
        user2Id: user2,
        status: MatchStatus.CANCELLED,
      });
      expect(cancelledMatch.isActive()).toBe(false);
    });
  });

  describe('Chat Entity', () => {
    it('should instantiate chat entity with matchId', () => {
      const chat = Chat.create({
        id: 'c1',
        matchId: 'm1',
      });
      expect(chat.id).toBe('c1');
      expect(chat.matchId).toBe('m1');
      expect(chat.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('ChatParticipant Entity', () => {
    it('should create participant for chat and user', () => {
      const participant = ChatParticipant.create({
        id: 'cp1',
        chatId: 'c1',
        userId: 'u1',
      });
      expect(participant.id).toBe('cp1');
      expect(participant.chatId).toBe('c1');
      expect(participant.userId).toBe('u1');
    });
  });

  describe('Message Entity', () => {
    it('should create message entity', () => {
      const msg = Message.create({
        id: 'msg1',
        chatId: 'c1',
        senderId: 'u1',
        content: 'سلام، چطوری؟',
      });
      expect(msg.id).toBe('msg1');
      expect(msg.content).toBe('سلام، چطوری؟');
    });
  });
});
