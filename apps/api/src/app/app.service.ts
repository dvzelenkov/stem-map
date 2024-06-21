import { Injectable } from '@nestjs/common';
import { EarthquakeEntity } from '@study/core';
import { Aftershock, Earthquake, FileEarthquake, FullEarthquakesData, RelationData, getDateFromRusFormat, getDistanceFromLatLonInKm } from '@study/shared';

@Injectable()
export class AppService {
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
        entities.push({
          id: value.id,
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

  calculateAftershocks(earthquakes: EarthquakeEntity[], limit = 14): FullEarthquakesData {
    const sortEartquakes = earthquakes.sort((a, b) => a.date.getTime() - b.date.getTime());
    const startDate = sortEartquakes[0].date;
    const endDate = sortEartquakes[sortEartquakes.length - 1].date;

    const mains: Earthquake[] = [];

    for (let index = 0; index < earthquakes.length; index++) {
      const element = earthquakes[index];

      if (element.force >= limit) {
        earthquakes.splice(index, 1);
        mains.push({
          ...element,
          relationsCount: 2,
        });
      }
    }

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
      const maxDate = mainEarthquake.date;
      maxDate.setMonth(maxDate.getMonth() + tMax);

      for (const earthquake of earthquakes) {
        if (
          earthquake.date.getTime() >= mainEarthquake.date.getTime() &&
          earthquake.date.getTime() <= maxDate.getTime() &&
          getDistanceFromLatLonInKm(
            mainEarthquake.latitude,
            mainEarthquake.longitude,
            earthquake.latitude,
            earthquake.longitude,
          ) <= rMax
        ) {
          earthquakes.splice(index, 1);
          aftershocks.push({
            ...earthquake,
            relationsCount: 1,
            parentId: mainEarthquake.id,
          });

          aftershockTimelines.push({
            sourceId: mainEarthquake.id,
            targetId: earthquake.id,
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
      startDate,
      endDate,
    };
  }
}
