import { Module } from '@nestjs/common';

import { AftershockAnalysisService } from './aftershock-analysis.service';

@Module({
  providers: [AftershockAnalysisService],
  exports: [AftershockAnalysisService],
})
export class AftershockAnalysisModule {}
