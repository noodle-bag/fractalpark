import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CLOUD_SERVER_ONLY_VARIABLES,
  CloudConfigError,
  getCronSecret,
  getRateLimitHmacKey,
  getSessionEncryptionKey,
  getSmtpConfig,
  getSupabaseConfig,
  isArtworkEmailBackupEnabled,
  isCreationCloudEnabled,
} from '@/lib/cloud/config';

const CLOUD_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
  'CRON_SECRET',
  'FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED',
  'FRACTALPARK_SMTP_HOST',
  'FRACTALPARK_SMTP_PORT',
  'FRACTALPARK_SMTP_USER',
  'FRACTALPARK_SMTP_PASSWORD',
  'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

const savedEnv = new Map<string, string | undefined>();

function clearCloudEnv(): void {
  for (const name of CLOUD_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
}

function enableCompleteCloudEnv(): void {
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 's'.repeat(32);
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'r'.repeat(32);
  process.env.CRON_SECRET = 'cron-test-secret';
}

beforeEach(() => {
  clearCloudEnv();
});

afterEach(() => {
  for (const name of CLOUD_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
  savedEnv.clear();
});

describe('isCreationCloudEnabled', () => {
  it('is off when the variable is missing', () => {
    expect(isCreationCloudEnabled()).toBe(false);
  });

  it.each(['1', 'TRUE', 'True', 'yes', 'on', ' true', 'true '])(
    'is off for the non-exact value %j',
    (value) => {
      process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = value;
      expect(isCreationCloudEnabled()).toBe(false);
    },
  );

  it('is on only for the exact string "true"', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    expect(isCreationCloudEnabled()).toBe(true);
  });
});

describe('isArtworkEmailBackupEnabled', () => {
  it('is off when the cloud loop is off, even if the backup flag is true', () => {
    process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED = 'true';
    expect(isArtworkEmailBackupEnabled()).toBe(false);
  });

  it('is on only when both switches are exactly true', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    expect(isArtworkEmailBackupEnabled()).toBe(false);
    process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED = 'true';
    expect(isArtworkEmailBackupEnabled()).toBe(true);
  });
});

describe('getSupabaseConfig', () => {
  it('throws cloud_disabled when the switch is off', () => {
    expect(() => getSupabaseConfig()).toThrowError(CloudConfigError);
    try {
      getSupabaseConfig();
    } catch (error) {
      expect((error as CloudConfigError).code).toBe('cloud_disabled');
    }
  });

  it('throws cloud_config_missing naming only the missing variable', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    try {
      getSupabaseConfig();
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as CloudConfigError;
      expect(err.code).toBe('cloud_config_missing');
      expect(err.message).toContain('SUPABASE_PUBLISHABLE_KEY');
      expect(err.message).not.toContain('https://example.supabase.co');
    }
  });

  it('rejects a non-https SUPABASE_URL', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.SUPABASE_URL = 'http://insecure.example.com';
    try {
      getSupabaseConfig();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CloudConfigError).code).toBe('cloud_config_invalid');
    }
  });

  it('rejects malformed and empty-host https URLs', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    for (const bad of ['https:// ', 'https://', 'not a url']) {
      process.env.SUPABASE_URL = bad;
      try {
        getSupabaseConfig();
        expect.unreachable(`should have thrown for ${bad}`);
      } catch (error) {
        expect((error as CloudConfigError).code).toBe('cloud_config_invalid');
      }
    }
  });

  it('treats whitespace-only values as missing', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.SUPABASE_URL = '   ';
    try {
      getSupabaseConfig();
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as CloudConfigError;
      expect(err.code).toBe('cloud_config_missing');
      expect(err.message).toContain('SUPABASE_URL');
      expect(err.message).not.toContain('   "');
    }
  });

  it('returns the config when the environment is complete', () => {
    enableCompleteCloudEnv();
    const config = getSupabaseConfig();
    expect(config.url).toBe('https://example.supabase.co');
    expect(config.publishableKey).toBe('publishable-test-key');
    expect(config.serviceRoleKey).toBe('service-role-test-key');
  });

  it('never falls back to NEXT_PUBLIC_ variants', () => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://leak.example.com';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
    expect(() => getSupabaseConfig()).toThrowError(CloudConfigError);
  });
});

describe('secret-bearing getters', () => {
  it('rejects a short session encryption key', () => {
    enableCompleteCloudEnv();
    process.env.FRACTALPARK_SESSION_ENCRYPTION_KEY = 'short';
    expect(() => getSessionEncryptionKey()).toThrowError(CloudConfigError);
  });

  it('rejects a short rate-limit HMAC key', () => {
    enableCompleteCloudEnv();
    process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'short';
    expect(() => getRateLimitHmacKey()).toThrowError(CloudConfigError);
  });

  it('returns keys when valid', () => {
    enableCompleteCloudEnv();
    expect(getSessionEncryptionKey()).toBe('s'.repeat(32));
    expect(getRateLimitHmacKey()).toBe('r'.repeat(32));
    expect(getCronSecret()).toBe('cron-test-secret');
  });

  it('throws cloud_disabled for secret getters when the switch is off', () => {
    expect(() => getSessionEncryptionKey()).toThrowError(CloudConfigError);
    expect(() => getRateLimitHmacKey()).toThrowError(CloudConfigError);
    expect(() => getCronSecret()).toThrowError(CloudConfigError);
  });
});

describe('getSmtpConfig', () => {
  it('throws cloud_disabled when backup email is off', () => {
    enableCompleteCloudEnv();
    try {
      getSmtpConfig();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CloudConfigError).code).toBe('cloud_disabled');
    }
  });

  it('parses the port and rejects invalid ports', () => {
    enableCompleteCloudEnv();
    process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED = 'true';
    process.env.FRACTALPARK_SMTP_HOST = 'smtp.example.com';
    process.env.FRACTALPARK_SMTP_PORT = '465';
    process.env.FRACTALPARK_SMTP_USER = 'user@example.com';
    process.env.FRACTALPARK_SMTP_PASSWORD = 'secret';
    expect(getSmtpConfig().port).toBe(465);

    for (const bad of ['not-a-port', '465abc', '465.9', ' 465', '0', '65536']) {
      process.env.FRACTALPARK_SMTP_PORT = bad;
      try {
        getSmtpConfig();
        expect.unreachable(`should have thrown for ${bad}`);
      } catch (error) {
        expect((error as CloudConfigError).code).toBe('cloud_config_invalid');
      }
    }
  });
});

describe('CLOUD_SERVER_ONLY_VARIABLES', () => {
  it('contains no NEXT_PUBLIC_ variable', () => {
    for (const name of CLOUD_SERVER_ONLY_VARIABLES) {
      expect(name.startsWith('NEXT_PUBLIC_')).toBe(false);
    }
  });
});
