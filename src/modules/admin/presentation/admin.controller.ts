import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../../../shared/presentation/guards/auth.guard';
import { AdminListHiddenChatsUseCase } from '../application/admin-list-hidden-chats.use-case';
import { AdminInspectChatUseCase } from '../application/admin-inspect-chat.use-case';
import { AdminListReferralsUseCase } from '../application/admin-list-referrals.use-case';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../../messages/domain/message.repository.interface';
import { Inject } from '@nestjs/common';

@Controller('api/v1/admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(
    private readonly adminListHiddenChatsUseCase: AdminListHiddenChatsUseCase,
    private readonly adminInspectChatUseCase: AdminInspectChatUseCase,
    private readonly adminListReferralsUseCase: AdminListReferralsUseCase,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  @Get('chats')
  async listHiddenChats(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.adminListHiddenChatsUseCase.execute({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { data: result.chats, total: result.total };
  }

  @Get('chats/:chatId')
  async inspectChat(@Param('chatId') chatId: string) {
    const result = await this.adminInspectChatUseCase.execute(chatId);
    return { data: result };
  }

  @Get('chats/:chatId/messages')
  async inspectChatMessages(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const result = await this.messageRepository.findByChatId(chatId, parsedLimit, parsedOffset);
    return { data: result.messages, total: result.total };
  }

  @Get('referrals')
  async listReferrals(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.adminListReferralsUseCase.execute({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { data: result.referrals, total: result.total };
  }
}
