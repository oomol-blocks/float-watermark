//#region generated meta
type Inputs = {
  media: string;
  text: string;
  outputDir: string;
  count: number;
  color: string;
  opacity: number;
  fontSize: number;
};
type Outputs = {
  media: string;
};
//#endregion

import type { Context } from "@oomol/types/oocana";
import * as path from 'path';
import * as fs from 'fs/promises';
import * as ffmpeg from "@ffmpeg-installer/ffmpeg";
import * as ffprobe from "@ffprobe-installer/ffprobe";
import { spawn } from 'child_process';

export default async function (
  params: Inputs,
  context: Context<Inputs, Outputs>
): Promise<Partial<Outputs> | undefined | void> {
  const { media, text, color, opacity, fontSize, count, outputDir } = params;

  const inputFileName = path.basename(media, path.extname(media));
  const inputExtension = path.extname(media);
  const outputPath = path.join(outputDir, `${inputFileName}_watermarked${inputExtension}`);

  const config = {
    text, fontSize, color, opacity, count,
    speed: 2,
    amplitude: 60,
    includeTime: false
  }

  const processor = new FloatingWatermarkProcessor();
  await processor.processVideo(media, outputPath, config);
  return {
    media: outputPath
  }
};

// Watermark configuration interface
export interface WatermarkConfig {
  text: string;             // Watermark text
  fontSize: number;         // Font size 12-72
  color: string;            // Color 'white', 'black', 'red', 'yellow' etc
  opacity: number;          // Opacity 0.1-1.0
  speed: number;            // Movement speed 0.1-5.0
  amplitude: number;        // Float amplitude 10-200
  count: number;            // Watermark count 1-10
  fontFamily?: string;      // Font file path (optional)
  includeTime?: boolean;    // Include timestamp
}

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
    this.validateConfig(config);

    const args = await this.buildFFmpegArgs(inputPath, outputPath, config);
    await this.runFFmpegCommand(args);

    console.log(`✓ Video processing completed: ${outputPath}`);
  }

  private async buildFFmpegArgs(
    inputPath: string,
    outputPath: string,
    config: WatermarkConfig
  ): Promise<string[]> {
    // Get video resolution
    const videoInfo = await this.getVideoInfo(inputPath);

    // Generate floating watermark filter
    const watermarkFilter = this.generateFloatingWatermarkFilter(config, videoInfo);

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

  private generateFloatingWatermarkFilter(config: WatermarkConfig, videoInfo?: { width: number; height: number }): string {
    const filters: string[] = [];

    // Estimate text size to avoid overlap
    const estimatedTextWidth = config.fontSize * config.text.length * 0.6;
    const estimatedTextHeight = config.fontSize * 1.2;

    // Store allocated areas to avoid overlap
    const occupiedAreas: Array<{ x: number, y: number, width: number, height: number }> = [];

    for (let i = 0; i < config.count; i++) {
      // Generate different phase and seed for each watermark
      const phaseOffset = (i * Math.PI * 2) / config.count;
      const randomSeed = Math.random() * Math.PI * 2;
      const seedX = i * 1.618 + randomSeed;
      const seedY = i * 2.414 + randomSeed * 0.7;

      // Random floating direction and speed variation
      const randomDirectionX = Math.random() > 0.5 ? 1 : -1;
      const randomDirectionY = Math.random() > 0.5 ? 1 : -1;
      const randomSpeedX = 0.3 + Math.random() * 0.4; // (0.3-0.7)
      const randomSpeedY = 0.3 + Math.random() * 0.4; // (0.3-0.7)
      const randomAmplitudeX = 0.8 + Math.random() * 0.4; // (0.8-1.2)
      const randomAmplitudeY = 0.8 + Math.random() * 0.4; // (0.8-1.2)

      // Calculate safe margins and floating range
      let amplitudePercent = 0.05; // Default 5% floating range
      let safeMarginXPercent = 0.05; // Default 5% margin
      let safeMarginYPercent = 0.05;

      if (videoInfo) {
        const { width, height } = videoInfo;

        // Convert amplitude pixel value to screen percentage
        amplitudePercent = config.amplitude / Math.min(width, height);
        amplitudePercent = Math.min(amplitudePercent, 0.15); // Maximum 15%

        // Calculate text safe margins
        safeMarginXPercent = (estimatedTextWidth + config.amplitude + 20) / width;
        safeMarginYPercent = (estimatedTextHeight + config.amplitude + 20) / height;

        console.log(`Watermark ${i + 1}: Estimated text size ${estimatedTextWidth}x${estimatedTextHeight}px`);
        console.log(`Float amplitude: ${config.amplitude}px = ${(amplitudePercent * 100).toFixed(1)}%`);
      }

      // Randomly select screen center position, ensure no overlap and within bounds
      let centerXPercent: number;
      let centerYPercent: number;
      let attempts = 0;
      const maxAttempts = 50;

      do {
        // Randomly select center point within safe area
        centerXPercent = safeMarginXPercent + Math.random() * (1 - 2 * safeMarginXPercent);
        centerYPercent = safeMarginYPercent + Math.random() * (1 - 2 * safeMarginYPercent);

        attempts++;

        // If too many attempts, stop checking overlap and use current position
        if (attempts >= maxAttempts) {
          console.log(`Watermark ${i + 1}: Exceeded maximum attempts, using current position`);
          break;
        }

      } while (this.checkOverlap(centerXPercent, centerYPercent, amplitudePercent, estimatedTextWidth, estimatedTextHeight, occupiedAreas, videoInfo));

      // Record current watermark occupied area
      const occupiedWidth = videoInfo ? (estimatedTextWidth + config.amplitude * 2) / videoInfo.width : 0.2;
      const occupiedHeight = videoInfo ? (estimatedTextHeight + config.amplitude * 2) / videoInfo.height : 0.15;

      occupiedAreas.push({
        x: centerXPercent - occupiedWidth / 2,
        y: centerYPercent - occupiedHeight / 2,
        width: occupiedWidth,
        height: occupiedHeight
      });

      // Random motion mode: horizontal, vertical, or composite motion
      const motionType = Math.random();
      let xExpression: string;
      let yExpression: string;

      if (motionType < 0.3) {
        // 30% probability: mainly horizontal motion
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX}*t+${phaseOffset}+${seedX})+w*${amplitudePercent * 0.2 * randomAmplitudeX}*sin(${config.speed * randomSpeedX * 1.7}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * 0.1 * randomAmplitudeY}*${randomDirectionY}*sin(${config.speed * randomSpeedY * 2.1}*t+${seedY})`;
      } else if (motionType < 0.6) {
        // 30% probability: mainly vertical motion  
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * 0.1 * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX * 1.9}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * randomAmplitudeY}*${randomDirectionY}*sin(${config.speed * randomSpeedY}*t+${phaseOffset}+${seedY})+h*${amplitudePercent * 0.3 * randomAmplitudeY}*sin(${config.speed * randomSpeedY * 1.4}*t+${seedY})`;
      } else {
        // 40% probability: composite motion (elliptical trajectory)
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX}*t+${phaseOffset}+${seedX})+w*${amplitudePercent * 0.3 * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX * 1.7}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * randomAmplitudeY}*${randomDirectionY}*cos(${config.speed * randomSpeedY * 0.8}*t+${phaseOffset}+${seedY})+h*${amplitudePercent * 0.4 * randomAmplitudeY}*${randomDirectionY}*cos(${config.speed * randomSpeedY * 1.3}*t+${seedY})`;
      }

      // Determine display text
      let displayText = config.text;
      if (config.includeTime) {
        displayText = `${config.text} %{localtime:%H\\:%M\\:%S}`;
      }

      // Font settings
      const fontSettings = config.fontFamily ? `:fontfile='${config.fontFamily}'` : '';

      // Build single watermark filter
      const watermarkFilter = `drawtext=text='${displayText}':x='${xExpression}':y='${yExpression}':fontsize=${config.fontSize}:fontcolor=${config.color}@${config.opacity}:shadowcolor=black@0.4:shadowx=1:shadowy=1${fontSettings}`;

      filters.push(watermarkFilter);

      console.log(`Watermark ${i + 1}: Center position (${(centerXPercent * 100).toFixed(1)}%, ${(centerYPercent * 100).toFixed(1)}%)`);
    }

    return filters.join(',');
  }

  private checkOverlap(
    centerX: number,
    centerY: number,
    amplitude: number,
    textWidth: number,
    textHeight: number,
    occupiedAreas: Array<{ x: number, y: number, width: number, height: number }>,
    videoInfo?: { width: number; height: number }
  ): boolean {
    // If no occupied areas, return false directly
    if (occupiedAreas.length === 0) {
      return false;
    }

    // Calculate current watermark occupied area
    const currentWidth = videoInfo ? (textWidth + amplitude * 2) / videoInfo.width : 0.2;
    const currentHeight = videoInfo ? (textHeight + amplitude * 2) / videoInfo.height : 0.15;

    const currentArea = {
      x: centerX - currentWidth / 2,
      y: centerY - currentHeight / 2,
      width: currentWidth,
      height: currentHeight
    };

    // Check overlap with existing areas
    for (const area of occupiedAreas) {
      if (this.isRectangleOverlap(currentArea, area)) {
        return true;
      }
    }

    return false;
  }

  private isRectangleOverlap(
    rect1: { x: number, y: number, width: number, height: number },
    rect2: { x: number, y: number, width: number, height: number }
  ): boolean {
    // Conditions for two rectangles not overlapping: rect1 is to the right of rect2 or rect1 is to the left of rect2 or rect1 is below rect2 or rect1 is above rect2
    return !(
      rect1.x >= rect2.x + rect2.width ||
      rect2.x >= rect1.x + rect1.width ||
      rect1.y >= rect2.y + rect2.height ||
      rect2.y >= rect1.y + rect1.height
    );
  }

  private runFFmpegCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(ffmpeg.path, args);
      let stderr = '';

      process.stdout.on('data', (data) => {
        console.log('FFmpeg stdout:', data.toString());
      });

      process.stderr.on('data', (data) => {
        const dataStr = data.toString();
        stderr += dataStr;

        // Parse progress information
        const progressMatch = dataStr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (progressMatch) {
          const [, hours, minutes, seconds] = progressMatch;
          console.log(`Processing time: ${hours}:${minutes}:${seconds}`);
        }

        console.log('FFmpeg stderr:', dataStr);
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log('FFmpeg command completed successfully');
          resolve();
        } else {
          console.error('FFmpeg command failed with code:', code);
          console.error('stderr:', stderr);
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        console.error('Failed to start FFmpeg process:', error);
        reject(error);
      });
    });
  }

  // Add method to get video information
  private async getVideoInfo(inputPath: string): Promise<{ width: number; height: number; duration: number }> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'v:0',
      inputPath
    ];

    try {
      const output = await this.runFFprobeCommand(args);
      const data = JSON.parse(output);
      const stream = data.streams[0];

      if (!stream) {
        throw new Error('No video stream found');
      }

      const width = parseInt(stream.width) || 1920;
      const height = parseInt(stream.height) || 1080;
      const duration = parseFloat(stream.duration) || 0;

      return { width, height, duration };
    } catch (error) {
      console.warn(`Failed to get video info, using default values: ${error.message}`);
      return { width: 1920, height: 1080, duration: 0 };
    }
  }

  private runFFprobeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(ffprobe.path, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`FFprobe failed: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private validateConfig(config: WatermarkConfig): void {
    const errors: string[] = [];

    if (!config.text || config.text.trim().length === 0) {
      errors.push('Watermark text cannot be empty');
    }

    if (config.fontSize < 8 || config.fontSize > 72) {
      errors.push('Font size should be between 8-72');
    }

    if (config.opacity < 0.1 || config.opacity > 1.0) {
      errors.push('Opacity should be between 0.1-1.0');
    }

    if (config.speed < 0.1 || config.speed > 5.0) {
      errors.push('Movement speed should be between 0.1-5.0');
    }

    if (config.amplitude < 10 || config.amplitude > 200) {
      errors.push('Float amplitude should be between 10-200');
    }

    if (config.count < 1 || config.count > 10) {
      errors.push('Watermark count should be between 1-10');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration error: ${errors.join(', ')}`);
    }
  }
}
