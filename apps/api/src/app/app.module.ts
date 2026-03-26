import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from '@study/core';
import { AppService } from './app.service';
import config from './configuration/config';
import { WebsocketGateway } from './websocket.getaway';
import { EarthquakeService } from './earthquake.service';
import { GeospatialModule } from '../geospatial/geospatial.module';
import { AftershockAnalysisModule } from '../aftershock-analysis/aftershock-analysis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [config] }),
    CoreModule,
    GeospatialModule,
    AftershockAnalysisModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    WebsocketGateway,
    EarthquakeService,
  ],
})
export class AppModule {}
