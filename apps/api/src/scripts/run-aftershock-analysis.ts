import * as path from 'path';

import { AftershockAnalysisService } from '../aftershock-analysis/aftershock-analysis.service';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const ASSETS_DIR = path.join(WORKSPACE_ROOT, 'apps/web/src/assets');

const params = {
  csvPath: path.join(ASSETS_DIR, 'full_earthquakes_code.csv'),
  forceThreshold: 12.5,
  mainEdgesOutputPath: path.join(ASSETS_DIR, 'earthquake-main-edges.csv'),
  aftershockEdgesOutputPath: path.join(ASSETS_DIR, 'earthquake-aftershock-edges.csv'),
};

async function main() {
  console.log('=== Aftershock Analysis Runner ===');
  console.log(`Input CSV:       ${params.csvPath}`);
  console.log(`Force threshold: ${params.forceThreshold}`);
  console.log(`Main edges out:  ${params.mainEdgesOutputPath}`);
  console.log(`Aftershock out:  ${params.aftershockEdgesOutputPath}`);
  console.log('');

  const service = new AftershockAnalysisService();
  const result = await service.analyze(params);

  console.log('');
  console.log('=== Results ===');
  console.log(`Main events:       ${result.mainEventsCount}`);
  console.log(`Main edges:        ${result.mainEdgesCount}`);
  console.log(`Aftershocks:       ${result.aftershocksCount}`);
  console.log(`Aftershock edges:  ${result.aftershockEdgesCount}`);
  console.log(`Duration:          ${result.durationMs.toFixed(1)} ms`);
  console.log(`Output files:`);
  console.log(`  ${result.mainEdgesPath}`);
  console.log(`  ${result.aftershockEdgesPath}`);
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
