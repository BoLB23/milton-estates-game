import Phaser from "phaser";
import "./style.css";
import { audioManager } from "./audio/AudioManager";
import { BootScene } from "./scenes/BootScene";
import { CreekScene } from "./scenes/CreekScene";
import { NeighborhoodScene } from "./scenes/NeighborhoodScene";
import { MenuScene } from "./scenes/MenuScene";
import { UIScene } from "./scenes/UIScene";
import { FrontEndScene } from "./scenes/FrontEndScene";
import { InputRouterScene } from "./scenes/InputRouterScene";

const game = new Phaser.Game({
  // The browser behavior suite uses Phaser 3's Canvas backend to avoid
  // accumulating headless WebGL driver contexts across long quest runs.
  // Production remains AUTO (WebGL where available).
  type: import.meta.env.VITE_E2E_RENDERER === "canvas" ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#7fcf76",
  pixelArt: false,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, InputRouterScene, FrontEndScene, NeighborhoodScene, CreekScene, UIScene, MenuScene],
});

// Phaser owns the sole SoundManager, its AudioContext, and autoplay unlock.
audioManager.install(game.sound, game.events);
