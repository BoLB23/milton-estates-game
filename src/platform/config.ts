/**
 * The deployed game supplies VITE_GAME_PLATFORM_API_BASE_URL at build time.
 * Keep the local endpoint as the fallback so ordinary `vite` development can
 * exercise Game Lab without a checked-in environment file.
 */
export const GAME_PLATFORM_LOCAL_API_BASE_URL = "http://localhost:8001/api/v1";
const GAME_PLATFORM_PRODUCTION_API_BASE_URL = "https://games.bolblab.org/api/v1";

export function getGamePlatformApiBaseUrl(env: Pick<ImportMetaEnv, "VITE_GAME_PLATFORM_API_BASE_URL" | "PROD"> = import.meta.env): string {
  return env.VITE_GAME_PLATFORM_API_BASE_URL?.trim()
    || (env.PROD ? GAME_PLATFORM_PRODUCTION_API_BASE_URL : GAME_PLATFORM_LOCAL_API_BASE_URL);
}
