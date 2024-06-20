import { Injectable } from '@nestjs/common';
import { Earthquake, getDateFromRusFormat } from '@study/shared';

@Injectable()
export class AppService {
  csvFileToArray(data: string): Earthquake[] {
    const csvHeader = data.slice(0, data.indexOf("\r\n")).split(";");
    const csvRows = data.slice(data.indexOf("\r\n") + 2).split("\r\n");

    return csvRows.map((item) => {
      const values = item.split(";");
      const obj: Earthquake = csvHeader.reduce((object: any, header, index) => {
        object[header] = values[index];
        return object;
      }, {});

      return {
        ...obj,
        hasChildren: false,
        relationsCount: 1,
      };
    });
  }
}
