/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game Lab API endpoint; browser authentication remains cookie-based. */
  readonly VITE_GAME_PLATFORM_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
