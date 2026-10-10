import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../../chats/domain/chat.repository.interface';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { SendMessageUseCase } from '../../messages/application/send-message.use-case';
import { Message } from '../../messages/domain/message.entity';
import { Chat } from '../../chats/domain/chat.entity';

export interface HandleTelegramMessageInput {
  telegramUserId: string;
  content: string;
}

export interface HandleTelegramMessageOutput {
  success: boolean;
  message?: Message;
  chatId?: string;
  senderName?: string;
  recipientName?: string;
  recipientTelegramUserId?: string;
  isRecipientActiveInSameChat?: boolean;
  responseToSender: string;
}

@Injectable()
export class HandleTelegramMessageUseCase {
  private readonly logger = new Logger(HandleTelegramMessageUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    private readonly sendMessageUseCase: SendMessageUseCase,
    @Optional()
    private readonly userActiveChatService?: UserActiveChatService,
  ) {}

  async execute(input: HandleTelegramMessageInput): Promise<HandleTelegramMessageOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return {
        success: false,
        responseToSender: 'Please click the link from your Dating Bot first to start your chat.',
      };
    }

    // Find all chats for this user and filter for valid chats with a partner
    const allUserChats = await this.chatRepository.findUserChats(user.id, true);
    const validChats: { chat: Chat; partnerId: string }[] = [];

    for (const c of allUserChats) {
      if (this.userActiveChatService?.isChatTerminated(c.id)) {
        continue;
      }
      const fc = await this.chatRepository.findWithParticipants(c.id);
      const other = fc?.participants.find((p) => p.userId !== user.id);
      if (other) {
        validChats.push({ chat: c, partnerId: other.userId });
      }
    }

    if (validChats.length === 0) {
      return {
        success: false,
        responseToSender: 'شما در حال حاضر هیچ چت فعالی ندارید. لطفاً ابتدا از طریق لینک همسان‌سازی وارد شوید.',
      };
    }

    // Determine sender's active chat, ensuring it is a valid chat with a partner
    let activeChatId = this.userActiveChatService?.getActiveChat(user.id);
    let activeChatEntry = validChats.find((v) => v.chat.id === activeChatId);

    if (!activeChatEntry) {
      activeChatEntry = validChats[0];
      activeChatId = activeChatEntry.chat.id;
      if (this.userActiveChatService) {
        this.userActiveChatService.setActiveChat(user.id, activeChatId);
      }
    }

    const activeChat = activeChatEntry.chat;

    try {
      const savedMessage = await this.sendMessageUseCase.execute({
        chatId: activeChat.id,
        senderId: user.id,
        content: input.content,
      });

      // Find recipient user
      let recipientTelegramUserId: string | undefined;
      let recipientName: string | undefined;
      let isRecipientActiveInSameChat = true;

      const senderName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        'کاربر';

      const recipientUser = await this.userRepository.findById(activeChatEntry.partnerId);
      if (recipientUser) {
        recipientTelegramUserId = recipientUser.telegramUserId;
        recipientName =
          [recipientUser.firstName, recipientUser.lastName].filter(Boolean).join(' ') ||
          recipientUser.username ||
          'کاربر';

        // Count valid chats for recipient
        const recipientAllChats = await this.chatRepository.findUserChats(recipientUser.id, true);
        let recipientValidChatCount = 0;
        for (const rc of recipientAllChats) {
          if (this.userActiveChatService?.isChatTerminated(rc.id)) {
            continue;
          }
          const rfc = await this.chatRepository.findWithParticipants(rc.id);
          if (rfc?.participants.some((p) => p.userId !== recipientUser.id)) {
            recipientValidChatCount++;
          }
        }

        const recipientActiveChatId = this.userActiveChatService?.getActiveChat(recipientUser.id);

        if (recipientValidChatCount > 1) {
          // If recipient has more than 1 conversation:
          // They are only considered active in this chat if they currently have THIS chat selected
          if (recipientActiveChatId !== activeChat.id) {
            isRecipientActiveInSameChat = false;
          } else {
            isRecipientActiveInSameChat = true;
          }
        } else {
          // Recipient only has 1 conversation -> direct relay
          isRecipientActiveInSameChat = true;
        }
      }

      return {
        success: true,
        message: savedMessage,
        chatId: activeChat.id,
        senderName,
        recipientName,
        recipientTelegramUserId,
        isRecipientActiveInSameChat,
        responseToSender: 'Message delivered',
      };
    } catch (error: any) {
      this.logger.error(`Error sending message for telegram user ${input.telegramUserId}: ${error.message}`);
      return {
        success: false,
        responseToSender: 'Failed to deliver message. Please try again.',
      };
    }
  }
}
