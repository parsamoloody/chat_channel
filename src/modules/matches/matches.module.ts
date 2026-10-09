import { Module } from '@nestjs/common';
import { MATCH_REPOSITORY } from './domain/match.repository.interface';
import { PrismaMatchRepository } from './infrastructure/prisma-match.repository';
import { ResolveMatchContextUseCase } from './application/resolve-match-context.use-case';
import { ExternalMatchPoolService } from './application/external-match-pool.service';

@Module({
  providers: [
    {
      provide: MATCH_REPOSITORY,
      useClass: PrismaMatchRepository,
    },
    ResolveMatchContextUseCase,
    ExternalMatchPoolService,
  ],
  exports: [MATCH_REPOSITORY, ResolveMatchContextUseCase, ExternalMatchPoolService],
})
export class MatchesModule {}
