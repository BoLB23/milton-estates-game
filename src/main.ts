import Phaser from "phaser";
import "./style.css";
import { BootScene } from "./scenes/BootScene";
import { CreekScene } from "./scenes/CreekScene";
import { NeighborhoodScene } from "./scenes/NeighborhoodScene";
import { MenuScene } from "./scenes/MenuScene";
import { UIScene } from "./scenes/UIScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#7fcf76",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, NeighborhoodScene, CreekScene, UIScene, MenuScene],
});
