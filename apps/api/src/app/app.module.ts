import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { GeospatialModule } from '../geospatial/geospatial.module';

@Module({
  imports: [
    GeospatialModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
