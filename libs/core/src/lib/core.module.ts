import * as Entities from './database/entities';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { resolve } from 'path';

const BASE_DATABASE_DIR = 'libs/core/src/lib/database';

interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return {
          type: 'postgres',
          entities: Object.values(Entities),
          autoLoadEntities: true,
          migrations: [resolve(BASE_DATABASE_DIR, 'migrations', '**', '*.js')],
          migrationsRun: configService.get('environment') === 'production',
          synchronize: false,
          ...configService.get<DatabaseConfig>('core_database')
        } as TypeOrmModuleOptions;
      }
    }),
  ],
  controllers: [],
  providers: [],
  exports: []
})
export class CoreModule {}
