import {
  createGamePlatformClient,
  type GameLabSDK,
  type GamePlatformClient as GameLabPlatformClient,
  type GamePlatformClientOptions,
} from "@bolb23/game-client-sdk";
import { GamePlatformAdapter } from "./GamePlatformAdapter";
import type {
  GamePlatformClient,
  GamePlatformPlayer,
  GameSaveClient,
  GamePlatformSession,
} from "./GamePlatformAdapter";
import { getGamePlatformApiBaseUrl } from "./config";
import { CloudSaveRepository } from "./CloudSaveRepository";
import type { MiltonCloudSave } from "../game/GameStore";

/**
 * Composition root for the optional Game Lab boundary. The SDK owns browser
 * credentialed cookies; no token is accepted or stored here or in Milton's
 * LocalStorage implementation.
 */
export const gamePlatformApiBaseUrl = getGamePlatformApiBaseUrl();

type GameLabSdkFactory = (options: GamePlatformClientOptions) => GameLabSDK & {
  leaderboards: Pick<GameLabPlatformClient["leaderboards"], "get">;
};

/**
 * Translate the SDK's player/session shapes at the integration boundary.
 * The session-handle map keeps SDK methods out of Phaser scenes and prevents a
 * stale adapter session from addressing an unrelated SDK handle.
 */
export function createGamePlatformFacade(
  apiBaseUrl: string,
  createSdkClient: GameLabSdkFactory = createGamePlatformClient,
): GamePlatformClient {
  const sdk = createSdkClient({ apiBaseUrl });
  const sessionHandles = new Map<string, Awaited<ReturnType<GameLabSDK["startGameSession"]>>>();

  return {
    async getCurrentPlayer(): Promise<GamePlatformPlayer> {
      const player = await sdk.getCurrentPlayer();
      return { id: player.userId, ...player };
    },

    async startGameSession(gameId: string): Promise<GamePlatformSession> {
      const handle = await sdk.startGameSession(gameId);
      sessionHandles.set(handle.sessionId, handle);
      return { id: handle.sessionId };
    },

    async heartbeatGameSession(session: GamePlatformSession): Promise<void> {
      await sessionHandles.get(session.id)?.heartbeat();
    },

    async endGameSession(session: GamePlatformSession): Promise<void> {
      const handle = sessionHandles.get(session.id);
      if (!handle) return;
      sessionHandles.delete(session.id);
      await handle.end();
    },

    leaderboards: {
      async submit(gameId: string, leaderboardKey: string, value: number): Promise<void> {
        await sdk.submitLeaderboardEntry(gameId, { leaderboardKey, value });
      },
      async get(leaderboardKey: string, gameId: string, limit: number) {
        const result = await sdk.leaderboards.get(leaderboardKey, gameId, limit);
        return { entries: result.entries.map((entry) => ({
          userId: entry.user_id,
          nickname: entry.nickname || entry.display_name,
          value: entry.value,
          rank: entry.rank,
        })) };
      },
    },

    saves: sdk.saves as GameSaveClient,
  };
}

const platformFacade = createGamePlatformFacade(gamePlatformApiBaseUrl);

export const gamePlatform = new GamePlatformAdapter({ createClient: () => platformFacade });

/** One repository per authenticated browser player; slots remain server-owned. */
export const miltonCloudSaves = new CloudSaveRepository<MiltonCloudSave>({ client: platformFacade });
