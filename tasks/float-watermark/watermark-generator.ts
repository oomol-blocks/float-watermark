import { WatermarkConfig, VideoInfo, Rectangle, MotionParameters } from './types';

export class WatermarkGenerator {
  static generateFloatingWatermarkFilter(config: WatermarkConfig, videoInfo?: VideoInfo): string {
    const filters: string[] = [];

    // Estimate text size to avoid overlap
    const estimatedTextWidth = config.fontSize * config.text.length * 0.6;
    const estimatedTextHeight = config.fontSize * 1.2;

    // Store allocated areas to avoid overlap
    const occupiedAreas: Rectangle[] = [];

    for (let i = 0; i < config.count; i++) {
      const motionParams = WatermarkGenerator.generateMotionParameters(i);
      const { centerXPercent, centerYPercent, amplitudePercent } = WatermarkGenerator.calculatePosition(
        i, estimatedTextWidth, estimatedTextHeight, config, videoInfo, occupiedAreas
      );

      const { xExpression, yExpression } = WatermarkGenerator.generateMotionExpressions(
        motionParams, centerXPercent, centerYPercent, amplitudePercent, config
      );

      const watermarkFilter = WatermarkGenerator.buildWatermarkFilter(
        config, xExpression, yExpression
      );

      filters.push(watermarkFilter);

      console.log(`Watermark ${i + 1}: Center position (${(centerXPercent * 100).toFixed(1)}%, ${(centerYPercent * 100).toFixed(1)}%)`);
    }

    return filters.join(',');
  }

  private static generateMotionParameters(index: number): MotionParameters {
    const phaseOffset = (index * Math.PI * 2) / Math.max(index, 1);
    const randomSeed = Math.random() * Math.PI * 2;
    const seedX = index * 1.618 + randomSeed;
    const seedY = index * 2.414 + randomSeed * 0.7;

    return {
      phaseOffset,
      randomSeed,
      seedX,
      seedY,
      randomDirectionX: Math.random() > 0.5 ? 1 : -1,
      randomDirectionY: Math.random() > 0.5 ? 1 : -1,
      randomSpeedX: 0.3 + Math.random() * 0.4,
      randomSpeedY: 0.3 + Math.random() * 0.4,
      randomAmplitudeX: 0.8 + Math.random() * 0.4,
      randomAmplitudeY: 0.8 + Math.random() * 0.4
    };
  }

  private static calculatePosition(
    index: number,
    estimatedTextWidth: number,
    estimatedTextHeight: number,
    config: WatermarkConfig,
    videoInfo?: VideoInfo,
    occupiedAreas: Rectangle[] = []
  ): { centerXPercent: number; centerYPercent: number; amplitudePercent: number } {
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

      console.log(`Watermark ${index + 1}: Estimated text size ${estimatedTextWidth}x${estimatedTextHeight}px`);
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
        console.log(`Watermark ${index + 1}: Exceeded maximum attempts, using current position`);
        break;
      }

    } while (WatermarkGenerator.checkOverlap(centerXPercent, centerYPercent, amplitudePercent, estimatedTextWidth, estimatedTextHeight, occupiedAreas, videoInfo));

    // Record current watermark occupied area
    const occupiedWidth = videoInfo ? (estimatedTextWidth + config.amplitude * 2) / videoInfo.width : 0.2;
    const occupiedHeight = videoInfo ? (estimatedTextHeight + config.amplitude * 2) / videoInfo.height : 0.15;

    occupiedAreas.push({
      x: centerXPercent - occupiedWidth / 2,
      y: centerYPercent - occupiedHeight / 2,
      width: occupiedWidth,
      height: occupiedHeight
    });

    return { centerXPercent, centerYPercent, amplitudePercent };
  }

  private static generateMotionExpressions(
    motionParams: MotionParameters,
    centerXPercent: number,
    centerYPercent: number,
    amplitudePercent: number,
    config: WatermarkConfig
  ): { xExpression: string; yExpression: string } {
    const {
      phaseOffset, seedX, seedY, randomDirectionX, randomDirectionY,
      randomSpeedX, randomSpeedY, randomAmplitudeX, randomAmplitudeY
    } = motionParams;

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

    return { xExpression, yExpression };
  }

  private static buildWatermarkFilter(
    config: WatermarkConfig,
    xExpression: string,
    yExpression: string
  ): string {
    // Determine display text
    let displayText = config.text;
    if (config.includeTime) {
      displayText = `${config.text} %{localtime:%H\\:%M\\:%S}`;
    }

    // Font settings
    const fontSettings = config.fontFamily ? `:fontfile='${config.fontFamily}'` : '';

    // Build single watermark filter
    return `drawtext=text='${displayText}':x='${xExpression}':y='${yExpression}':fontsize=${config.fontSize}:fontcolor=${config.color}@${config.opacity}:shadowcolor=black@0.4:shadowx=1:shadowy=1${fontSettings}`;
  }

  private static checkOverlap(
    centerX: number,
    centerY: number,
    amplitude: number,
    textWidth: number,
    textHeight: number,
    occupiedAreas: Rectangle[],
    videoInfo?: VideoInfo
  ): boolean {
    // If no occupied areas, return false directly
    if (occupiedAreas.length === 0) {
      return false;
    }

    // Calculate current watermark occupied area
    const currentWidth = videoInfo ? (textWidth + amplitude * 2) / videoInfo.width : 0.2;
    const currentHeight = videoInfo ? (textHeight + amplitude * 2) / videoInfo.height : 0.15;

    const currentArea: Rectangle = {
      x: centerX - currentWidth / 2,
      y: centerY - currentHeight / 2,
      width: currentWidth,
      height: currentHeight
    };

    // Check overlap with existing areas
    for (const area of occupiedAreas) {
      if (WatermarkGenerator.isRectangleOverlap(currentArea, area)) {
        return true;
      }
    }

    return false;
  }

  private static isRectangleOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
    // Conditions for two rectangles not overlapping: rect1 is to the right of rect2 or rect1 is to the left of rect2 or rect1 is below rect2 or rect1 is above rect2
    return !(
      rect1.x >= rect2.x + rect2.width ||
      rect2.x >= rect1.x + rect1.width ||
      rect1.y >= rect2.y + rect2.height ||
      rect2.y >= rect1.y + rect1.height
    );
  }
}