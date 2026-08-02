import { describe, expect, it } from 'vitest';

import { backupFilename, shouldSendBackup } from '@/lib/cloud/backup';

describe('artwork backup email chain', () => {
  it('sends only for the mode x trigger pairs the spec allows', () => {
    expect(shouldSendBackup('off', 'save')).toBe(false);
    expect(shouldSendBackup('off', 'publish')).toBe(false);
    expect(shouldSendBackup('publish_only', 'save')).toBe(false);
    expect(shouldSendBackup('publish_only', 'publish')).toBe(true);
    expect(shouldSendBackup('save_and_publish', 'save')).toBe(true);
    expect(shouldSendBackup('save_and_publish', 'publish')).toBe(true);
  });

  it('sanitizes the attachment filename and keeps the contract extension', () => {
    expect(backupFilename('My Nebula')).toBe('My Nebula.fractal.json');
    expect(backupFilename('weird<>:"/\\|?*name')).toBe('weirdname.fractal.json');
    expect(backupFilename('   ')).toBe('artwork.fractal.json');
    expect(backupFilename('深海 Spiral №7')).toBe('深海 Spiral 7.fractal.json');
    expect(backupFilename('x'.repeat(200)).endsWith('.fractal.json')).toBe(true);
    expect(backupFilename('x'.repeat(200)).length).toBeLessThanOrEqual(60 + '.fractal.json'.length);
  });
});
