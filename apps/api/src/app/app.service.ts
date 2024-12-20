import { Injectable } from '@nestjs/common';
import { EarthquakeEntity } from '@study/core';
import { DataSource } from 'typeorm';
import dbscan from '@cdxoo/dbscan';

import {
  Aftershock,
  Earthquake,
  SwarmEarthquake,
  EarthquakeSwarms,
  FileEarthquake,
  FullEarthquakesData,
  FullEarthquakesDataWithSwarms,
  NestedEarthquake,
  RelationData,
  convexHull,
  getContourPoints,
  getDateFromRusFormat,
  getKmBetweenCoordinates,
  getPercentageValue,
  parseDaysToMs,
  parseMsToDays,
} from '@study/shared';

@Injectable()
export class AppService {
  constructor(private dataSource: DataSource) {}

  async getEarthquakes(): Promise<EarthquakeEntity[]> {
    const earthquakeRepository = this.dataSource.getRepository(EarthquakeEntity);

    return await earthquakeRepository.find();
  }

  csvStringToArray<T>(data: string): T[] {
    const csvHeader = data.slice(0, data.indexOf("\r\n")).split(";");
    const csvRows = data.slice(data.indexOf("\r\n") + 2).split("\r\n");

    return csvRows.map((item) => {
      const values = item.split(";");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: T = csvHeader.reduce((object: any, header, index) => {
        object[header] = values[index];
        return object;
      }, {});

      return obj;
    });
  }

  mapFileEarthquakeToEartquakeEntity(data: FileEarthquake[]): EarthquakeEntity[] {
    const entities: EarthquakeEntity[] = [];

    for (const value of data) {
      try {
        if (value.id)
        entities.push({
          id: +value.id,
          longitude: +value.longitude,
          latitude: +value.latitude,
          force: +value.force,
          date: getDateFromRusFormat(value.date),
        });
      // eslint-disable-next-line no-empty
      } catch {}
    }

    return entities;
  }

  mapEarthquakeEntityToEarthquake(
    entity: EarthquakeEntity,
    relationsCount: number,
  ): Earthquake {
    return {
      ...entity,
      id: `${entity.id}`,
      relationsCount,
    };
  }

  mapEarthquakeEntityToAftershock(
    entity: EarthquakeEntity,
    relationsCount: number,
    parentId: string,
  ): Aftershock {
    return {
      ...this.mapEarthquakeEntityToEarthquake(entity, relationsCount),
      parentId,
    };
  }

  getFullEarthquakesDataWithSwarms(
    earthquakes: EarthquakeEntity[],
    limit: number,
    maxDistanceInKm: number,
    timeIntervalInDays: number,
    sensivity: number,
  ): FullEarthquakesDataWithSwarms {
    const { backgrounds, ...mainEartquakesData } = this.getFullEartquakesData(earthquakes, limit);
    
    console.log(backgrounds.length);

    const swarms = this.calculateEarthquakeSwarms(
      backgrounds,
      maxDistanceInKm,
      timeIntervalInDays,
      sensivity,
    );

    return {
      ...mainEartquakesData,
      ...swarms,
    };
  }

  getFullEartquakesData(earthquakes: EarthquakeEntity[], limit: number): FullEarthquakesData {
    const sortEartquakes = earthquakes.sort((a, b) => a.date.getTime() - b.date.getTime());
    const startDate = sortEartquakes[0].date;
    const endDate = sortEartquakes[sortEartquakes.length - 1].date;

    const mains: Earthquake[] = [];

    for (let index = 0; index < earthquakes.length; index++) {
      const element = earthquakes[index];

      if (element.force >= limit) {
        earthquakes.splice(index, 1);
        mains.push(
          this.mapEarthquakeEntityToEarthquake(element, 2)
        );
      }
    }

    const nestedMainMarks: NestedEarthquake[] = [];
    const aftershocks: Aftershock[] = [];
    const mainTimelines: RelationData[] = [];
    const aftershockTimelines: RelationData[] = [];

    for (let index = 0; index < mains.length; index++) {
      const mainEarthquake = mains[index];
      const nextMainEarthquake = mains[index + 1];
      
      if (nextMainEarthquake) {
        mainTimelines.push({
          sourceId: mainEarthquake.id,
          targetId: nextMainEarthquake.id,
          sourcePosition: [mainEarthquake.longitude, mainEarthquake.latitude, 10000],
          targetPosition: [nextMainEarthquake.longitude, nextMainEarthquake.latitude, 10000],
          sourceDate: mainEarthquake.date,
          targetDate: nextMainEarthquake.date,
        });
      }

      let rMax = 3.5 * Math.pow(10, (1 / 3) * (mainEarthquake.force - 11));
      rMax = rMax > 1000 ? 1000 : Math.ceil(rMax);
      const tMax = mainEarthquake.force < 14.5 ? Math.pow(10, 0.033 * mainEarthquake.force + 0.19) : Math.pow(10, 0.17 * mainEarthquake.force - 1.8);
      const maxDate = new Date(mainEarthquake.date);
      maxDate.setMonth(maxDate.getMonth() + Math.ceil(tMax));

      for (const earthquake of earthquakes) {
        if (
          earthquake.date.getTime() >= mainEarthquake.date.getTime() &&
          earthquake.date.getTime() <= maxDate.getTime() &&
          getKmBetweenCoordinates(
            mainEarthquake,
            earthquake,
          ) <= rMax
        ) {
          nestedMainMarks.push(mainEarthquake);
          earthquakes.splice(index, 1);
          aftershocks.push(
            this.mapEarthquakeEntityToAftershock(earthquake, 1, mainEarthquake.id)
          );

          aftershockTimelines.push({
            sourceId: mainEarthquake.id,
            targetId: `${earthquake.id}`,
            sourcePosition: [earthquake.longitude, earthquake.latitude, 5000],
            targetPosition: [mainEarthquake.longitude, mainEarthquake.latitude, 5000],
            sourceDate: mainEarthquake.date,
            targetDate: earthquake.date,
          });
        }
      }
    }

    return {
      mains,
      aftershocks,
      mainTimelines,
      aftershockTimelines,
      nestedMainMarks,
      startDate,
      endDate,
      backgrounds: earthquakes.map(
        earthquake => this.mapEarthquakeEntityToEarthquake(earthquake, 1)
      ),
    };
  }

  calculateEarthquakeSwarms(
    earthquakes: Earthquake[],
    maxDistanceInKm: number,
    timeIntervalInDays: number,
    sensivity: number,
  ): EarthquakeSwarms {
    earthquakes = [
      ...earthquakes.slice(0, 2000),
      // ...earthquakes.slice(4000, 4500),
      // ...earthquakes.slice(8000, 8500),
      // ...earthquakes.slice(12000, 12500),
    ];
    console.log(earthquakes.length);
    maxDistanceInKm = 10;
    sensivity = 10;
    timeIntervalInDays = 15;
    const epsilon = maxDistanceInKm * 1000 + timeIntervalInDays;
    const minimumPoints = 5;

    console.log(minimumPoints);

    const distanceFunction = (a: Earthquake, b: Earthquake): number => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return Math.abs(getKmBetweenCoordinates(a, b) * 1000 + parseMsToDays(dateDiff));
    };

    const start = performance.now();

    const { clusters, noise } = dbscan<Earthquake>({
      dataset: earthquakes,
      epsilon,
      minimumPoints,
      distanceFunction,
    });

    console.log(clusters.length);

    const duration = performance.now() - start;
    console.log('finished');
    console.log(`\nВремя получения кластеров: ${duration}`);

    const mapIndexesToEartquakes = (indexes: number[], clusterId =''): SwarmEarthquake[] => {
      return indexes.map(index => ({
        ...earthquakes[index],
        parentId: clusterId,
      }));
    };

    return {
      contours: clusters.map((cluster, index) => {
        const earthquakes = mapIndexesToEartquakes(cluster);
        const points = convexHull(earthquakes);
        if (points.length <= 1) return [];
        return [
          ...points,
          points[0],
        ];
      }),
      swarms: clusters.map((cluster, index) => 
        earthquakes = mapIndexesToEartquakes(cluster, `swarm-${index}`)
      ),
      backgrounds: mapIndexesToEartquakes(noise),
    }
  }
}
