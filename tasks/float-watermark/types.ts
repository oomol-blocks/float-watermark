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

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MotionParameters {
  phaseOffset: number;
  randomSeed: number;
  seedX: number;
  seedY: number;
  randomDirectionX: number;
  randomDirectionY: number;
  randomSpeedX: number;
  randomSpeedY: number;
  randomAmplitudeX: number;
  randomAmplitudeY: number;
}