import * as path from 'path';
import * as fs from 'fs/promises';
import { WatermarkConfig } from './types';
import { VideoUtils } from './video-utils';
import { ConfigValidator } from './config-validator';
import { WatermarkGenerator } from './watermark-generator';

export class FloatingWatermarkProcessor {
  public async processVideo(
    inputPath: string,
    outputPath: string,
    config: WatermarkConfig
  ): Promise<void> {

    // Validate input file
    try {
      await fs.access(inputPath);
    } catch {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory may already exist, ignore error
    }

    // Validate configuration
    ConfigValidator.validateConfig(config);

    const args = await this.buildFFmpegArgs(inputPath, outputPath, config);
    await VideoUtils.runFFmpegCommand(args);

    console.log(`✓ Video processing completed: ${outputPath}`);
  }

  private async buildFFmpegArgs(
    inputPath: string,
    outputPath: string,
    config: WatermarkConfig
  ): Promise<string[]> {
    // Get video resolution
    const videoInfo = await VideoUtils.getVideoInfo(inputPath);

    // Generate floating watermark filter
    const watermarkFilter = WatermarkGenerator.generateFloatingWatermarkFilter(config, videoInfo);

    const args = [
      '-i', inputPath,
      '-vf', watermarkFilter,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'copy',
      '-y',
      outputPath
    ];

    return args;
  }
}