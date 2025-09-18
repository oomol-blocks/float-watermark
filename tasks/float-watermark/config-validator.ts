import { WatermarkConfig } from './types';

export class ConfigValidator {
  static validateConfig(config: WatermarkConfig): void {
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