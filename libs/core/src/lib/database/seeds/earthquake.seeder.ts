import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { EarthquakeEntity } from '../entities';

export default class EarthquakeSeeder implements Seeder {
  async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {   
    const earthquakeFactory = factoryManager.get(EarthquakeEntity);
    const earthquakeRepository = dataSource.getRepository(EarthquakeEntity);

    const earthquakes = await earthquakeFactory.saveMany(20000);

    await earthquakeRepository.save(earthquakes);
    console.log("\nEarthquakes successfully created\n")
  }
}