/**
 * Environment variable validation schemas and utilities.
 * Provides runtime validation for required environment variables with descriptive error messages.
 */

export type EnvValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type EnvSchema = {
  [key: string]: {
    required: boolean;
    description: string;
    validate?: (value: string) => boolean | string;
  };
};

/**
 * Validates environment variables against a schema.
 */
export function validateEnv(schema: EnvSchema, env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, config] of Object.entries(schema)) {
    const value = env[key];

    if (!value || value.trim() === '') {
      if (config.required) {
        errors.push(`Missing required environment variable: ${key}\n  Description: ${config.description}`);
      }
      continue;
    }

    if (config.validate) {
      const validationResult = config.validate(value);
      if (validationResult !== true) {
        const message = typeof validationResult === 'string' ? validationResult : `Invalid value for ${key}`;
        errors.push(`${key}: ${message}\n  Description: ${config.description}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates URL format
 */
export function validateUrl(value: string): boolean | string {
  try {
    new URL(value);
    return true;
  } catch {
    return 'Must be a valid URL';
  }
}

/**
 * Validates that value is not empty
 */
export function validateNonEmpty(value: string): boolean | string {
  return value.trim().length > 0 || 'Must not be empty';
}

/**
 * Validates boolean string
 */
export function validateBoolean(value: string): boolean | string {
  const normalized = value.toLowerCase().trim();
  return ['true', 'false', '1', '0', 'yes', 'no'].includes(normalized) || 'Must be a boolean value';
}

/**
 * Customer Web App environment schema
 */
export const customerWebEnvSchema: EnvSchema = {
  // Supabase (required for production)
  SUPABASE_URL: {
    required: true,
    description: 'Supabase project URL',
    validate: validateUrl
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    required: false,
    description: 'Supabase service role key (server-side only, required if not using mock data)'
  },
  SUPABASE_ANON_KEY: {
    required: false,
    description: 'Supabase anonymous key (for client-side auth, required if not using mock data)'
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    required: false,
    description: 'Public Supabase URL for browser client (required for auth)',
    validate: validateUrl
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    required: false,
    description: 'Public Supabase anonymous key for browser client (required for auth)'
  },
  NEXT_PUBLIC_USE_MOCK_DATA: {
    required: false,
    description: 'Use mock data instead of Supabase (development only)',
    validate: validateBoolean
  },
  // Square
  SQUARE_ACCESS_TOKEN: {
    required: false,
    description: 'Square API access token (required for Square integration)'
  },
  SQUARE_ENVIRONMENT: {
    required: false,
    description: 'Square environment: "sandbox" or "production" (default: sandbox)'
  },
  SQUARE_WEBHOOK_SIGNATURE_KEY: {
    required: false,
    description: 'Square webhook HMAC-SHA256 signature key (required in production)'
  },
  SQUARE_WEBHOOK_URL: {
    required: false,
    description: 'Square webhook notification URL (required in production)',
    validate: validateUrl
  },
  // Vendor configuration
  DEFAULT_VENDOR_SLUG: {
    required: false,
    description: 'Default vendor slug for local development'
  },
  DEFAULT_VENDOR_NAME: {
    required: false,
    description: 'Default vendor display name'
  },
  DEFAULT_VENDOR_ID: {
    required: false,
    description: 'Default vendor ID'
  },
  SQUARE_LOCATION_ID: {
    required: false,
    description: 'Square location ID (required when using mock data)'
  },
  DEFAULT_VENDOR_SQUARE_CREDENTIAL_REF: {
    required: false,
    description: 'Square credential reference for default vendor'
  },
  // Optional features
  NEXT_PUBLIC_APPLE_SIGNIN: {
    required: false,
    description: 'Enable Apple Sign In (true/false)',
    validate: validateBoolean
  }
};

/**
 * Vendor Admin Web App environment schema
 */
export const vendorAdminWebEnvSchema: EnvSchema = {
  ...customerWebEnvSchema
  // Same as customer-web for now
};

/**
 * Customer Mobile App environment schema
 */
export const customerMobileEnvSchema: EnvSchema = {
  EXPO_PUBLIC_CUSTOMER_WEB_URL: {
    required: false,
    description: 'Customer web app URL (if different from default)',
    validate: validateUrl
  },
  EXPO_PUBLIC_DEFAULT_VENDOR_SLUG: {
    required: false,
    description: 'Default vendor slug',
    validate: validateNonEmpty
  },
  EXPO_PUBLIC_API_BASE_URL: {
    required: false,
    description: 'API base URL (if different from customer web URL)',
    validate: validateUrl
  },
  EXPO_PUBLIC_EXPO_PROJECT_ID: {
    required: false,
    description: 'Expo project ID for push notifications'
  }
};

/**
 * Vendor Ops Mobile App environment schema
 */
export const vendorOpsMobileEnvSchema: EnvSchema = {
  EXPO_PUBLIC_VENDOR_SLUG: {
    required: false,
    description: 'Vendor slug for this ops app',
    validate: validateNonEmpty
  },
  EXPO_PUBLIC_API_BASE_URL: {
    required: false,
    description: 'API base URL',
    validate: validateUrl
  },
  EXPO_ACCESS_TOKEN: {
    required: false,
    description: 'Expo access token for push notifications'
  }
};

/**
 * Validates environment variables and throws if invalid.
 * Call this at app startup to fail fast with descriptive errors.
 */
export function validateEnvOrThrow(
  schema: EnvSchema,
  appName: string,
  env: Record<string, string | undefined> = process.env
): void {
  const result = validateEnv(schema, env);

  if (result.warnings.length > 0) {
    console.warn(`[${appName}] Environment variable warnings:`);
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  if (!result.valid) {
    const errorMessage = [
      `[${appName}] Environment variable validation failed:`,
      '',
      ...result.errors.map((error) => `  ${error}`),
      '',
      'Please check your .env file or environment configuration.'
    ].join('\n');

    throw new Error(errorMessage);
  }
}

/**
 * Validates environment variables in production mode only.
 * In development, logs warnings instead of throwing.
 */
export function validateEnvProduction(
  schema: EnvSchema,
  appName: string,
  env: Record<string, string | undefined> = process.env
): void {
  const isProduction = env.NODE_ENV === 'production' || env.NEXT_PUBLIC_NODE_ENV === 'production';
  
  if (isProduction) {
    validateEnvOrThrow(schema, appName, env);
  } else {
    const result = validateEnv(schema, env);
    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.warn(`[${appName}] Environment variable issues (development mode):`);
      result.errors.forEach((error) => console.warn(`  ⚠️  ${error}`));
      result.warnings.forEach((warning) => console.warn(`  ⚠️  ${warning}`));
    }
  }
}

