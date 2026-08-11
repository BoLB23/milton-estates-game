import Phaser from "phaser";
import type { PlayerProfile } from "../game/types";
import { PLAYER_BODY_TEXTURE_KEY } from "./characterAssets";

export interface PlayerAvatarPreviewOptions {
  x: number;
  y: number;
  scale?: number;
  depth?: number;
  frame?: number;
  profile?: PlayerProfile;
}

/** One logical player sprite shared by gameplay and front-end previews. */
export class PlayerAvatar {
  private constructor(
    private readonly body: Phaser.GameObjects.Sprite,
    private readonly ownsBody: boolean,
  ) {}

  public static attachToGameplaySprite(_scene: Phaser.Scene, body: Phaser.GameObjects.Sprite, profile?: PlayerProfile): PlayerAvatar {
    const avatar = new PlayerAvatar(body, false);
    avatar.setProfile(profile);
    return avatar;
  }

  public static createPreview(scene: Phaser.Scene, options: PlayerAvatarPreviewOptions): PlayerAvatar {
    const body = scene.add.sprite(options.x, options.y, PLAYER_BODY_TEXTURE_KEY, options.frame ?? 0)
      .setOrigin(0.5, 0.9)
      .setScale(options.scale ?? 1)
      .setDepth(options.depth ?? 0);
    const avatar = new PlayerAvatar(body, true);
    avatar.setProfile(options.profile);
    return avatar;
  }

  public getRenderSprites(): readonly Phaser.GameObjects.Sprite[] {
    return [this.body];
  }

  public getBody(): Phaser.GameObjects.Sprite { return this.body; }

  public play(key: string, ignoreIfPlaying = true): void {
    this.body.anims.play(key, ignoreIfPlaying);
  }

  public setProfile(_profile?: PlayerProfile): void {
    // The supplied atlas contains complete characters plus separate wardrobe
    // reference cutouts; it is not a registration-aligned layer atlas. Keep
    // the valid composed body visible until true same-frame layers are added.
  }

  /** Retained for callers that synchronize after teleports or visibility changes. */
  public syncFromBody(): void {}

  public destroy(): void {
    if (this.ownsBody) this.body.destroy();
  }
}
