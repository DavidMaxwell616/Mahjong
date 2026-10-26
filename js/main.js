import { SplashScene } from "./SplashScene.js";
import { GameScene } from "./GameScene.js";

new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#6f9c72",
    render: { antialias: true, roundPixels: true },
    scale: {
        mode: Phaser.Scale.RESIZE,
    },
    scene: [SplashScene, GameScene],
});
