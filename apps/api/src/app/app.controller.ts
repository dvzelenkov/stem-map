import { Body, Controller, Post } from '@nestjs/common';
import { GeospatialService } from '../geospatial/geospatial.service';
import { ClusterPolygonsRequest } from '../geospatial/geospatial.types';

@Controller()
export class AppController {
  constructor(
    private readonly geospatialService: GeospatialService,
  ) {}

  @Post('trunk-map/clusters')
  buildTrunkMapClusters(@Body() body: ClusterPolygonsRequest) {
    return this.geospatialService.clusterAndBuildPolygons(
      body?.points ?? [],
      body?.options
    );
  }
}
