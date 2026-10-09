import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getEnvConfig } from '../../infrastructure/config/env.config';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-admin-key'] ||
      request.headers['x-api-key'] ||
      request.headers['api-key'] ||
      this.extractBearer(request.headers['authorization']);

    const validKey = getEnvConfig().ADMIN_API_KEY;
    if (!apiKey || apiKey !== validKey) {
      throw new UnauthorizedException('Invalid or missing Admin API Key');
    }

    return true;
  }

  private extractBearer(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7).trim();
  }
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];

    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('Missing x-user-id authentication header');
    }

    // Attach authenticated user to request context
    request.user = { id: userId };
    return true;
  }
}
