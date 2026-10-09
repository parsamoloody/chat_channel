import { Controller, Get, Post, Body, Param, Query, UseGuards, Inject } from '@nestjs/common';
import { AdminApiKeyGuard } from '../../../shared/presentation/guards/auth.guard';
import { AdminListHiddenChatsUseCase } from '../application/admin-list-hidden-chats.use-case';
import { AdminInspectChatUseCase } from '../application/admin-inspect-chat.use-case';
import { AdminListReferralsUseCase } from '../application/admin-list-referrals.use-case';
import { AdminCreateMatchUseCase, AdminCreateMatchInput } from '../application/admin-create-match.use-case';
import { AdminGetMatchUseCase } from '../application/admin-get-match.use-case';
import { AdminListMatchesUseCase } from '../application/admin-list-matches.use-case';
import { ExternalMatchPoolService } from '../../matches/application/external-match-pool.service';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../../messages/domain/message.repository.interface';

@Controller('api/v1/admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(
    private readonly adminListHiddenChatsUseCase: AdminListHiddenChatsUseCase,
    private readonly adminInspectChatUseCase: AdminInspectChatUseCase,
    private readonly adminListReferralsUseCase: AdminListReferralsUseCase,
    private readonly adminCreateMatchUseCase: AdminCreateMatchUseCase,
    private readonly adminGetMatchUseCase: AdminGetMatchUseCase,
    private readonly adminListMatchesUseCase: AdminListMatchesUseCase,
    private readonly matchPoolService: ExternalMatchPoolService,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  /**
   * API: Create externalMatchId(s)
   */
  @Post(['match-ids', 'external-matches', 'external-match-ids'])
  async createMatchId(@Body() body: { externalMatchId?: string; count?: number }) {
    const result = await this.matchPoolService.createMatchId(body);
    return { data: result };
  }

  /**
   * API: List externalMatchIds with status and pagination
   */
  @Get(['match-ids', 'external-matches', 'external-match-ids'])
  async listMatchIds(
    @Query('status') status?: 'AVAILABLE' | 'USED' | 'ALL',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.matchPoolService.listMatchIds({
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return result;
  }

  @Post('matches')
  async createMatch(@Body() body: AdminCreateMatchInput) {
    const result = await this.adminCreateMatchUseCase.execute(body);
    return { data: result };
  }

  @Get('matches')
  async listMatches(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.adminListMatchesUseCase.execute({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      status,
    });
    return { data: result.matches, total: result.total };
  }

  @Get('matches/:matchId')
  async getMatch(@Param('matchId') matchId: string) {
    const result = await this.adminGetMatchUseCase.execute(matchId);
    return { data: result };
  }

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
