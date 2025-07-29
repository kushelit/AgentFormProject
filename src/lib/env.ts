export const ENV_MODE = process.env.ENV_MODE || 'local';

export const isProd = ENV_MODE === 'production';
export const isTest = ENV_MODE === 'test';
export const isLocal = ENV_MODE === 'local';

export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
export const GROW_BASE_URL = process.env.GROW_BASE_URL || 'https://sandbox.meshulam.co.il/api/light/server/1.0';

export const GROW_USER_ID = process.env.GROW_USER_ID!;
export const GROW_PAGE_CODE = process.env.GROW_PAGE_CODE!;
