import * as ffmpeg from "@ffmpeg-installer/ffmpeg";
import * as ffprobe from "@ffprobe-installer/ffprobe";
import { spawn } from 'child_process';
import { VideoInfo } from './types';

export class VideoUtils {
  static async getVideoInfo(inputPath: string): Promise<VideoInfo> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'v:0',
      inputPath
    ];

    try {
      const output = await VideoUtils.runFFprobeCommand(args);
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

  static runFFmpegCommand(args: string[]): Promise<void> {
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

  private static runFFprobeCommand(args: string[]): Promise<string> {
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
}