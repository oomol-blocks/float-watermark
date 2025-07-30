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

// 水印配置接口
export interface WatermarkConfig {
  text: string;             // 水印文字
  fontSize: number;         // 字体大小 12-72
  color: string;            // 颜色 'white', 'black', 'red', 'yellow' 等
  opacity: number;          // 透明度 0.1-1.0
  speed: number;            // 移动速度 0.1-5.0
  amplitude: number;        // 飘动幅度 10-200
  count: number;            // 水印数量 1-10
  fontFamily?: string;      // 字体文件路径（可选）
  includeTime?: boolean;    // 是否包含时间戳
}

export class FloatingWatermarkProcessor {
  public async processVideo(
    inputPath: string,
    outputPath: string,
    config: WatermarkConfig
  ): Promise<void> {

    // 验证输入文件
    try {
      await fs.access(inputPath);
    } catch {
      throw new Error(`输入文件不存在: ${inputPath}`);
    }

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在，忽略错误
    }

    // 验证配置
    this.validateConfig(config);

    const args = await this.buildFFmpegArgs(inputPath, outputPath, config);
    await this.runFFmpegCommand(args);

    console.log(`✓ 视频处理完成: ${outputPath}`);
  }

  private async buildFFmpegArgs(
    inputPath: string,
    outputPath: string,
    config: WatermarkConfig
  ): Promise<string[]> {
    // 获取视频分辨率
    const videoInfo = await this.getVideoInfo(inputPath);

    // 生成飘动水印滤镜
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

    // 预估文字尺寸，用于避免重叠
    const estimatedTextWidth = config.fontSize * config.text.length * 0.6;
    const estimatedTextHeight = config.fontSize * 1.2;

    // 存储已分配的区域，避免重叠
    const occupiedAreas: Array<{ x: number, y: number, width: number, height: number }> = [];

    for (let i = 0; i < config.count; i++) {
      // 为每个水印生成不同的相位和种子
      const phaseOffset = (i * Math.PI * 2) / config.count;
      const randomSeed = Math.random() * Math.PI * 2;
      const seedX = i * 1.618 + randomSeed;
      const seedY = i * 2.414 + randomSeed * 0.7;

      // 随机飘动方向和速度变化
      const randomDirectionX = Math.random() > 0.5 ? 1 : -1;
      const randomDirectionY = Math.random() > 0.5 ? 1 : -1;
      const randomSpeedX = 0.3 + Math.random() * 0.4; // (0.3-0.7)
      const randomSpeedY = 0.3 + Math.random() * 0.4; // (0.3-0.7)
      const randomAmplitudeX = 0.8 + Math.random() * 0.4; // (0.8-1.2)
      const randomAmplitudeY = 0.8 + Math.random() * 0.4; // (0.8-1.2)

      // 计算安全边距和飘动范围
      let amplitudePercent = 0.05; // 默认5%的飘动范围
      let safeMarginXPercent = 0.05; // 默认5%的边距
      let safeMarginYPercent = 0.05;

      if (videoInfo) {
        const { width, height } = videoInfo;

        // 将amplitude像素值转换为屏幕百分比
        amplitudePercent = config.amplitude / Math.min(width, height);
        amplitudePercent = Math.min(amplitudePercent, 0.15); // 最大不超过15%

        // 计算文字安全边距
        safeMarginXPercent = (estimatedTextWidth + config.amplitude + 20) / width;
        safeMarginYPercent = (estimatedTextHeight + config.amplitude + 20) / height;

        console.log(`水印${i + 1}: 预估文字尺寸 ${estimatedTextWidth}x${estimatedTextHeight}px`);
        console.log(`飘动幅度: ${config.amplitude}px = ${(amplitudePercent * 100).toFixed(1)}%`);
      }

      // 随机选择屏幕中心位置，确保不重叠且不超出边界
      let centerXPercent: number;
      let centerYPercent: number;
      let attempts = 0;
      const maxAttempts = 50;

      do {
        // 在安全区域内随机选择中心点
        centerXPercent = safeMarginXPercent + Math.random() * (1 - 2 * safeMarginXPercent);
        centerYPercent = safeMarginYPercent + Math.random() * (1 - 2 * safeMarginYPercent);

        attempts++;

        // 如果尝试次数过多，就不再检查重叠，直接使用当前位置
        if (attempts >= maxAttempts) {
          console.log(`水印${i + 1}: 超过最大尝试次数，使用当前位置`);
          break;
        }

      } while (this.checkOverlap(centerXPercent, centerYPercent, amplitudePercent, estimatedTextWidth, estimatedTextHeight, occupiedAreas, videoInfo));

      // 记录当前水印占用的区域
      const occupiedWidth = videoInfo ? (estimatedTextWidth + config.amplitude * 2) / videoInfo.width : 0.2;
      const occupiedHeight = videoInfo ? (estimatedTextHeight + config.amplitude * 2) / videoInfo.height : 0.15;

      occupiedAreas.push({
        x: centerXPercent - occupiedWidth / 2,
        y: centerYPercent - occupiedHeight / 2,
        width: occupiedWidth,
        height: occupiedHeight
      });

      // 随机运动模式：水平、竖直、或复合运动
      const motionType = Math.random();
      let xExpression: string;
      let yExpression: string;

      if (motionType < 0.3) {
        // 30% 概率：主要水平运动
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX}*t+${phaseOffset}+${seedX})+w*${amplitudePercent * 0.2 * randomAmplitudeX}*sin(${config.speed * randomSpeedX * 1.7}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * 0.1 * randomAmplitudeY}*${randomDirectionY}*sin(${config.speed * randomSpeedY * 2.1}*t+${seedY})`;
      } else if (motionType < 0.6) {
        // 30% 概率：主要竖直运动  
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * 0.1 * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX * 1.9}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * randomAmplitudeY}*${randomDirectionY}*sin(${config.speed * randomSpeedY}*t+${phaseOffset}+${seedY})+h*${amplitudePercent * 0.3 * randomAmplitudeY}*sin(${config.speed * randomSpeedY * 1.4}*t+${seedY})`;
      } else {
        // 40% 概率：复合运动（椭圆轨迹）
        xExpression = `w*${centerXPercent}+w*${amplitudePercent * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX}*t+${phaseOffset}+${seedX})+w*${amplitudePercent * 0.3 * randomAmplitudeX}*${randomDirectionX}*sin(${config.speed * randomSpeedX * 1.7}*t+${seedX})`;
        yExpression = `h*${centerYPercent}+h*${amplitudePercent * randomAmplitudeY}*${randomDirectionY}*cos(${config.speed * randomSpeedY * 0.8}*t+${phaseOffset}+${seedY})+h*${amplitudePercent * 0.4 * randomAmplitudeY}*${randomDirectionY}*cos(${config.speed * randomSpeedY * 1.3}*t+${seedY})`;
      }

      // 决定显示文本
      let displayText = config.text;
      if (config.includeTime) {
        displayText = `${config.text} %{localtime:%H\\:%M\\:%S}`;
      }

      // 字体设置
      const fontSettings = config.fontFamily ? `:fontfile='${config.fontFamily}'` : '';

      // 构建单个水印滤镜
      const watermarkFilter = `drawtext=text='${displayText}':x='${xExpression}':y='${yExpression}':fontsize=${config.fontSize}:fontcolor=${config.color}@${config.opacity}:shadowcolor=black@0.4:shadowx=1:shadowy=1${fontSettings}`;

      filters.push(watermarkFilter);

      console.log(`水印${i + 1}: 中心位置 (${(centerXPercent * 100).toFixed(1)}%, ${(centerYPercent * 100).toFixed(1)}%)`);
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
    // 如果没有已占用区域，直接返回false
    if (occupiedAreas.length === 0) {
      return false;
    }

    // 计算当前水印的占用区域
    const currentWidth = videoInfo ? (textWidth + amplitude * 2) / videoInfo.width : 0.2;
    const currentHeight = videoInfo ? (textHeight + amplitude * 2) / videoInfo.height : 0.15;

    const currentArea = {
      x: centerX - currentWidth / 2,
      y: centerY - currentHeight / 2,
      width: currentWidth,
      height: currentHeight
    };

    // 检查与已有区域是否重叠
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
    // 两个矩形不重叠的条件：rect1在rect2的右边 或 rect1在rect2的左边 或 rect1在rect2的下方 或 rect1在rect2的上方
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

        // 解析进度信息
        const progressMatch = dataStr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (progressMatch) {
          const [, hours, minutes, seconds] = progressMatch;
          console.log(`处理时间: ${hours}:${minutes}:${seconds}`);
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

  // 添加获取视频信息的方法
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
      console.warn(`获取视频信息失败，使用默认值: ${error.message}`);
      return { width: 1920, height: 1080, duration: 0 };
    }
  }

  private runFFprobeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(ffprobe, args);
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
      errors.push('水印文本不能为空');
    }

    if (config.fontSize < 8 || config.fontSize > 72) {
      errors.push('字体大小应在 8-72 之间');
    }

    if (config.opacity < 0.1 || config.opacity > 1.0) {
      errors.push('透明度应在 0.1-1.0 之间');
    }

    if (config.speed < 0.1 || config.speed > 5.0) {
      errors.push('移动速度应在 0.1-5.0 之间');
    }

    if (config.amplitude < 10 || config.amplitude > 200) {
      errors.push('飘动幅度应在 10-200 之间');
    }

    if (config.count < 1 || config.count > 10) {
      errors.push('水印数量应在 1-10 之间');
    }

    if (errors.length > 0) {
      throw new Error(`配置错误: ${errors.join(', ')}`);
    }
  }
}
