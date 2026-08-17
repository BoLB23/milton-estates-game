import { createGamePlatformClient, type GameLabSDK, type GamePlatformClient } from "@bolb23/game-client-sdk";
import { gameEvents, EVENT } from "../game/events";
import type { MiltonCloudSave } from "../game/GameStore";
import { CloudSaveRepository } from "./CloudSaveRepository";
import { GamePlatformAdapter } from "./GamePlatformAdapter";
import { getGamePlatformApiBaseUrl } from "./config";

export const gamePlatformApiBaseUrl = getGamePlatformApiBaseUrl();
export function createGamePlatformFacade(apiBaseUrl: string, factory: typeof createGamePlatformClient = createGamePlatformClient): GamePlatformClient & GameLabSDK {
  return factory({ apiBaseUrl });
}
export const gamePlatformClient = createGamePlatformFacade(gamePlatformApiBaseUrl);
export const gamePlatform = new GamePlatformAdapter({ createClient: () => gamePlatformClient });
/** One repository is rebound on identity changes, so pending snapshots never cross accounts. */
export const miltonCloudSaves = new CloudSaveRepository<MiltonCloudSave>({ client: gamePlatformClient });

gamePlatform.subscribeIdentity((identity) => {
  if (identity.status === "authenticated") miltonCloudSaves.setAuthenticatedUser(identity.player.id);
  else if (identity.status === "unauthorized") miltonCloudSaves.clearAuthenticatedUser();
});
gamePlatform.registerAuthenticatedRecovery(() => miltonCloudSaves.recoverAfterReauthentication());
gamePlatform.subscribeRecovery((state) => gameEvents.emit(EVENT.platformRecovery, state));
miltonCloudSaves.subscribe((state) => {
  if (state.status === "unauthorized") gameEvents.emit(EVENT.platformRecovery, "session-expired");
});
