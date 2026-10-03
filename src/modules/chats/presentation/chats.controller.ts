import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { UserAuthGuard } from '../../../shared/presentation/guards/auth.guard';
import { GetUserChatsUseCase } from '../application/get-user-chats.use-case';
import { GetChatDetailsUseCase } from '../application/get-chat-details.use-case';

@Controller('api/v1/chats')
@UseGuards(UserAuthGuard)
export class ChatsController {
  constructor(
    private readonly getUserChatsUseCase: GetUserChatsUseCase,
    private readonly getChatDetailsUseCase: GetChatDetailsUseCase,
  ) {}

  @Get()
  async listChats(@Req() req: any) {
    const userId = req.user.id;
    // Exclude hidden chats for standard listing
    const chats = await this.getUserChatsUseCase.execute({
      userId,
      includeHidden: false,
    });
    return { data: chats };
  }

  @Get(':chatId')
  async getChat(@Param('chatId') chatId: string, @Req() req: any) {
    const userId = req.user.id;
    const result = await this.getChatDetailsUseCase.execute({
      chatId,
      requestingUserId: userId,
    });
    return { data: result };
  }
}
