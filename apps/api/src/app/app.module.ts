import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from '@study/core';
import { AppService } from './app.service';
import config from './configuration/config';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [config] }),
    CoreModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
