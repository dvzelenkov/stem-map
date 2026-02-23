import { Injectable } from '@nestjs/common';
import { BedData, FullData, GeoData, mapCoordinatesToNumbers, RelationData, StemData } from '@study/shared';
import { UserSettings, UserSettingsWithFiles } from '@study/shared';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private dataSource: DataSource) {}

  csvStringToArray<T = any>(data: string): T[] {
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

  // generateFromSettings(
  //   settings: UserSettings,
  //   files: Array<Express.Multer.File>,
  // ): FullData {
  //   const stems: { [id: string]: StemData[] };
  //   const marks: { [id: string]: GeoData[] };
  //   const relations: { [id: string]: RelationData[] };
  //   const beds: { [id: string]: BedData[] };

  //   let curFileId = 0;

  //   settings.stems.forEach(stem => {
  //     stems[stem.id] = this.csvStringToArray(stem.file);
  //   });

  //   return {
  //     stems,
  //     marks,
  //     relations,
  //     beds,
  //   };
  // }

  getRelationFromStems(sorce: StemData, target: StemData): RelationData {
    return {
      sourceId: sorce.id,
      targetId: target.id,
      sourcePosition: mapCoordinatesToNumbers({
        longitude: sorce.longitude,
        latitude: sorce.latitude,
      }, 5000),
      targetPosition: mapCoordinatesToNumbers({
        longitude: target.longitude,
        latitude: target.latitude,
      }, 5000),
      sourceDate: sorce.date,
      targetDate: target.date,
    };
  }
}
