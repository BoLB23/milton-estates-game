import Phaser from "phaser";
import "./style.css";
import { audioManager } from "./audio/AudioManager";
import { BootScene } from "./scenes/BootScene";
import { CreekScene } from "./scenes/CreekScene";
import { NeighborhoodScene } from "./scenes/NeighborhoodScene";
import { MenuScene } from "./scenes/MenuScene";
import { BillyQuestScene } from "./scenes/BillyQuestScene";
import { UIScene } from "./scenes/UIScene";
import { FrontEndScene } from "./scenes/FrontEndScene";
import { InputRouterScene } from "./scenes/InputRouterScene";
import { ReidenbaughScene } from "./scenes/ReidenbaughScene";
import { StonehengeScene } from "./scenes/StonehengeScene";
import { FruitvillePikeScene } from "./scenes/FruitvillePikeScene";
import { BentCreekScene } from "./scenes/BentCreekScene";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { MickeyDragRaceScene } from "./scenes/MickeyDragRaceScene";
import { AndrewsBonfireScene } from "./scenes/AndrewsBonfireScene";
import { BadTripScene } from "./scenes/BadTripScene";
import { registerServiceWorker, setupPwaNavigation } from "./platform/pwa";

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
  scene: [
    BootScene,
    InputRouterScene,
    WelcomeScene,
    FrontEndScene,
    NeighborhoodScene,
    CreekScene,
    StonehengeScene,
    ReidenbaughScene,
    FruitvillePikeScene,
    BentCreekScene,
    MickeyDragRaceScene,
    AndrewsBonfireScene,
    BadTripScene,
    UIScene,
    MenuScene,
    BillyQuestScene,
  ],
});

// Phaser owns the sole SoundManager, its AudioContext, and autoplay unlock.
audioManager.install(game.sound, game.events);
setupPwaNavigation();
registerServiceWorker();
