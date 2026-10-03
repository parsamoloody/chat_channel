import { Controller, Get } from '@nestjs/common';

@Controller('api/v1/health')
export class AppController {
  @Get()
  healthCheck() {
    return {
      status: 'ok',
      service: 'hidden-chat-bot',
      timestamp: new Date().toISOString(),
    };
  }
}
