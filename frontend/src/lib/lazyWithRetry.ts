import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type ModuleWithDefault<T extends ComponentType<any>> = {
  default: T;
};

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "ChunkLoadError",
  "Loading chunk",
];

function isChunkLoadError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);

  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<ModuleWithDefault<T>>,
  retryKey: string,
): LazyExoticComponent<T> {
  const storageKey = `nova:lazy-retry:${retryKey}`;

  return lazy(async () => {
    try {
      const module = await importer();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(storageKey);
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        const hasRetried = window.sessionStorage.getItem(storageKey) === "1";
        if (!hasRetried) {
          window.sessionStorage.setItem(storageKey, "1");
          window.location.reload();
          return new Promise<ModuleWithDefault<T>>(() => {});
        }
      }

      throw error;
    }
  });
}