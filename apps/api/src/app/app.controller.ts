import { Body, Controller, Post, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { FileEarthquake, FullData } from '@study/shared';
import { AppService } from './app.service';
import 'multer';
import { UserSettings } from '@study/shared';
import { EarthquakeService } from './earthquake.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly earthquakeService: EarthquakeService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() { limit },
  ) {
    const data = this.appService.csvStringToArray<FileEarthquake>(file.buffer.toString());
    const entities = this.earthquakeService.mapFileEarthquakeToEartquakeEntity(data);
    const fullData = await this.earthquakeService.getFullEarthquakesDataWithSwarms(entities, limit, 100, 15, 50);

    return fullData;
  }

  @Post('earthquakes')
  async getEarthquakes(
    @Body() { limit },
  ) {
    let start = performance.now();
    const entities = await this.earthquakeService.getEarthquakes();
    let duration = performance.now() - start;
    console.log(`\nВремя получения данных: ${duration}`);
    console.log(`Количество данных: ${entities.length}`);

    start = performance.now();
    this.earthquakeService.getFullEartquakesData(entities, limit);
    duration = performance.now() - start;
    console.log(`Время обработки данных: ${duration}`);

    return 'ok';
  }

  // @Post('generate')
  // @UseInterceptors(AnyFilesInterceptor())
  // async generateFromSettings(
  //   @UploadedFiles() files: Array<Express.Multer.File>,
  //   @Body() settings: UserSettings,
  // ): Promise<FullData> {
  //   return this.appService.generateFromSettings(settings, files);
  // }
}
