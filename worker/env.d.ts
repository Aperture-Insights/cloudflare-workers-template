interface Env {
  ASSETS: Fetcher;
  AUTH_MODE?: string;
  AUTH_SESSION_HOURS?: string;
  STAGING_PASSWORD?: string;
}

// Workers-specific API missing from the generated runtime types.
interface SubtleCrypto {
  timingSafeEqual(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean;
}
