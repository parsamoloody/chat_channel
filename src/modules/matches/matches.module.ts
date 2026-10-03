import { Module } from '@nestjs/common';
import { MATCH_REPOSITORY } from './domain/match.repository.interface';
import { PrismaMatchRepository } from './infrastructure/prisma-match.repository';
import { ResolveMatchContextUseCase } from './application/resolve-match-context.use-case';

@Module({
  providers: [
    {
      provide: MATCH_REPOSITORY,
      useClass: PrismaMatchRepository,
    },
    ResolveMatchContextUseCase,
  ],
  exports: [MATCH_REPOSITORY, ResolveMatchContextUseCase],
})
export class MatchesModule {}
