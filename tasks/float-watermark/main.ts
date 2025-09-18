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
import { FloatingWatermarkProcessor } from './watermark-processor';

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