import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileEarthquake, FullEarthquakesData } from '@study/shared';
import { AppService } from './app.service';
import 'multer';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    // console.log(file.buffer.toString());
    const data = this.appService.csvStringToArray<FileEarthquake>(file.buffer.toString());
    const entities = this.appService.mapFileEarthquakeToEartquakeEntity(data);
    const fullData = this.appService.calculateAftershocks(entities);

    return fullData;
  }
}
