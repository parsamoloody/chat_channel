import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UserAuthGuard } from '../../../shared/presentation/guards/auth.guard';
import { SendMessageUseCase } from '../application/send-message.use-case';
import { GetChatMessagesUseCase } from '../application/get-chat-messages.use-case';

export class SendMessageDto {
  content!: string;
}

@Controller('api/v1/chats/:chatId/messages')
@UseGuards(UserAuthGuard)
export class MessagesController {
  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly getChatMessagesUseCase: GetChatMessagesUseCase,
  ) {}

  @Get()
  async getMessages(
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Req() req?: any,
  ) {
    const userId = req.user.id;
    const result = await this.getChatMessagesUseCase.execute({
      chatId,
      requestingUserId: userId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return { data: result.messages, total: result.total };
  }

  @Post()
  async sendMessage(
    @Param('chatId') chatId: string,
    @Body() body: SendMessageDto,
    @Req() req?: any,
  ) {
    const userId = req.user.id;
    const message = await this.sendMessageUseCase.execute({
      chatId,
      senderId: userId,
      content: body.content,
    });
    return { data: message };
  }
}
