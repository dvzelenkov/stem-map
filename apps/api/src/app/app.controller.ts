import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileEarthquake } from '@study/shared';
import { AppService } from './app.service';
import 'multer';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() { limit },
  ) {
    const data = this.appService.csvStringToArray<FileEarthquake>(file.buffer.toString());
    const entities = this.appService.mapFileEarthquakeToEartquakeEntity(data);
    const fullData = this.appService.calculateAftershocks(entities, limit);

    return fullData;
  }

  @Post('earthquakes')
  async getEarthquakes(
    @Body() { limit },
  ) {
    let start = performance.now();
    const entities = await this.appService.getEarthquakes();
    let duration = performance.now() - start;
    console.log(`\nВремя получения данных: ${duration}`);
    console.log(`Количество данных: ${entities.length}`);

    start = performance.now();
    this.appService.calculateAftershocks(entities, limit);
    duration = performance.now() - start;
    console.log(`Время обработки данных: ${duration}`);

    return 'ok';
  }
}
