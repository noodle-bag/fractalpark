import type { FractalParams } from '../types';
import type { FractalPlugin } from '../plugins/types';

export interface FractalRenderWorkerRequest {
  type: 'render';
  requestId: number;
  generation: number;
  width: number;
  height: number;
  params: FractalParams;
  plugins: FractalPlugin[];
}

export interface FractalRenderWorkerFrame {
  type: 'frame';
  requestId: number;
  generation: number;
  formulaId: string;
  bitmap: ImageBitmap;
}

export interface FractalRenderWorkerError {
  type: 'error';
  requestId: number;
  generation: number;
  message: string;
}

export type FractalRenderWorkerResponse =
  | FractalRenderWorkerFrame
  | FractalRenderWorkerError;
