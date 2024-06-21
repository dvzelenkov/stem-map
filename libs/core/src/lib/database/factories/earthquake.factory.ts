import { setSeederFactory } from 'typeorm-extension';
import { EarthquakeEntity } from '../entities';
import { Faker } from '@faker-js/faker';

export default setSeederFactory(EarthquakeEntity, (faker: Faker) => {
  const earthquake = new EarthquakeEntity();

  earthquake.force = faker.number.float({ min: 8.6, max: 17, fractionDigits: 1 });
  earthquake.latitude = faker.number.float({ min: 48, max: 60, fractionDigits: 2 });
  earthquake.longitude = faker.number.float({ min: 99, max: 122, fractionDigits: 2 });
  earthquake.date = faker.date.between({ from: '1960-01-01T00:00:00.000Z', to: '2024-05-31T00:00:00.000Z' });

  return earthquake;
});