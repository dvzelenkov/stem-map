import { resolve } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import 'dotenv/config';

const BASE_DATABASE_DIR = 'libs/core/src/lib/database';

const options: DataSourceOptions & SeederOptions = {
    type: 'postgres',
    host: process.env.DB_CORE_HOST,
    port: Number(process.env.DB_CORE_PORT),
    username: process.env.DB_CORE_USERNAME,
    password: process.env.DB_CORE_PASSWORD,
    database: process.env.DB_CORE_DATABASE,
    synchronize: false,
    entities: [
        resolve(BASE_DATABASE_DIR, 'entities', '**', '*.entity.ts'),
        resolve(BASE_DATABASE_DIR, 'entities', '**', '*.entity.js'),
    ],
    migrations: [
        resolve(BASE_DATABASE_DIR, 'migrations', '**', '*.ts'),
        resolve(BASE_DATABASE_DIR, 'migrations', '**', '*.js'),
    ],
    factories: [
        `${BASE_DATABASE_DIR}/factories/**/*.ts`,
        `${BASE_DATABASE_DIR}/factories/**/*.js`,
    ],
    seeds: [
        `${BASE_DATABASE_DIR}/seeds/**/seeder.ts`,
        `${BASE_DATABASE_DIR}/seeds/**/seeder.js`,
    ],
}

// console.log(options);

export default new DataSource(options);
