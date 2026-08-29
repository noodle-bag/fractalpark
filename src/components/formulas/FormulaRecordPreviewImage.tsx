'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface FormulaRecordPreviewImageProps {
  readonly alt: string;
  readonly fallbackSrc: string;
  readonly height: number;
  readonly src: string;
  readonly width: number;
}

export function FormulaRecordPreviewImage({
  alt,
  fallbackSrc,
  height,
  src,
  width,
}: FormulaRecordPreviewImageProps) {
  const [activeSrc, setActiveSrc] = useState(src);
  useEffect(() => {
    setActiveSrc(src);
  }, [src]);

  return (
    <>
      <span className="formula-record-master-preview contents">
        <Image
          alt={alt}
          className="aspect-[8/5] h-auto w-full"
          decoding="async"
          height={height}
          loading="lazy"
          onError={() => {
            if (activeSrc !== fallbackSrc) setActiveSrc(fallbackSrc);
          }}
          sizes="(min-width: 1024px) 45vw, 100vw"
          src={activeSrc}
          width={width}
        />
      </span>
      <noscript>
        <style>{'.formula-record-master-preview{display:none!important}'}</style>
        <Image
          alt={alt}
          className="aspect-[8/5] h-auto w-full"
          data-testid="formula-record-no-js-fallback"
          height={height}
          loading="lazy"
          src={fallbackSrc}
          unoptimized
          width={width}
        />
      </noscript>
    </>
  );
}
