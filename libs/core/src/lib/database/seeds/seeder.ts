import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import EarthquakeSeeder from './earthquake.seeder';
// import GroupSeeder from './group.seeder';
// import ProductSeeder from './product.seeder';

export default class MainSeeder implements Seeder {
  async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    await dataSource.query('TRUNCATE TABLE "earthquakes" CASCADE;');

    const earthquakeSeeder = new EarthquakeSeeder();

    await earthquakeSeeder.run(dataSource, factoryManager);
  }
}