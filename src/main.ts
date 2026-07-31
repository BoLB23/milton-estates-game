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
import { ReidenbaughRoadScene } from "./scenes/ReidenbaughRoadScene";
import { ReidenbaughScene } from "./scenes/ReidenbaughScene";
import { WelcomeScene } from "./scenes/WelcomeScene";

const game = new Phaser.Game({
  // The browser behavior suite uses Canvas to avoid
  // accumulating headless WebGL driver contexts across long quest runs.
  // Production and ordinary development require WebGL.
  type: import.meta.env.VITE_E2E_RENDERER === "canvas" ? Phaser.CANVAS : Phaser.WEBGL,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#7fcf76",
  pixelArt: false,
  roundPixels: true,
  render: { stencil: false },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, InputRouterScene, WelcomeScene, FrontEndScene, NeighborhoodScene, CreekScene, ReidenbaughRoadScene, ReidenbaughScene, UIScene, MenuScene],
});

// Phaser owns the sole SoundManager, its AudioContext, and autoplay unlock.
audioManager.install(game.sound, game.events);
