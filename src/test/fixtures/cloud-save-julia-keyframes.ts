import { urlStateToDocument } from '@/engine/document-adapter';
import type { FractalDocument } from '@/engine/document';
import { decodeParams } from '@/lib/url-params';

export const PUBLISHED_JULIA_KEYFRAME_FORMULA_ID =
  '3a83800c-4a44-5e61-9651-d3d5adb71213';
export const HELD_STANDARD_FORMULA_ID =
  'df663e75-a1ab-5eb2-a710-d0e9b466fa9c';

export const PUBLISHED_JULIA_KEYFRAME_QUERY =
  'cx=-0.0000079880&cy=0.4206591613&z=8964.18&iter=150&julia=1&jre=-0.118506&jim=0.925781&fm=3a83800c-4a44-5e61-9651-d3d5adb71213&pal=0&kf=-0.0771952845%2C0.2354508236%2C0.37%2C0.0000%7C-0.0000079880%2C0.4206591613%2C8964.18%2C0.0000';

export function publishedJuliaKeyframeDocument(): FractalDocument {
  return urlStateToDocument(
    decodeParams(new URLSearchParams(PUBLISHED_JULIA_KEYFRAME_QUERY)),
  );
}
