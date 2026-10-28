const W = 768,
  H = 1024;

export class SplashScene extends Phaser.Scene {
  constructor() {
    super("SplashScene");
  }

  preload() {
    this.load.image("maxjong-splash", "../assets/images/splash-maxjong.png");
  }

  create() {
    this.cameras.main.setBackgroundColor("#032c27");

    this.add
      .image(W / 2, H / 2, "maxjong-splash")
      .setDisplaySize(W, H);

    const shade = this.add.graphics();
    shade.fillGradientStyle(0x001712, 0x001712, 0x001712, 0x001712, 0, 0, 0.88, 0.88);
    shade.fillRect(0, 820, W, 204);

    const buttonGlow = this.add
      .ellipse(W / 2, 930, 330, 82, 0xffd84c, 0.18)
      .setBlendMode(Phaser.BlendModes.ADD);
    const button = this.add
      .rectangle(W / 2, 925, 292, 68, 0x0b6548, 0.96)
      .setStrokeStyle(3, 0xf2cf63, 1)
      .setInteractive({ useHandCursor: true });
    const prompt = this.add
      .text(W / 2, 925, "TAP TO PLAY", {
        fontFamily: "Arial Black, Arial",
        fontSize: "25px",
        color: "#fff5c4",
        fontStyle: "bold",
        letterSpacing: 2,
        shadow: {
          offsetX: 0,
          offsetY: 3,
          color: "#001e16",
          blur: 4,
          fill: true,
        },
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: [buttonGlow, button, prompt],
      scale: 1.04,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    for (let index = 0; index < 12; index++) {
      const sparkle = this.add
        .text(
          Phaser.Math.Between(45, W - 45),
          Phaser.Math.Between(810, 990),
          "✦",
          {
            fontSize: Phaser.Math.Between(11, 22) + "px",
            color: index % 2 ? "#fff5ad" : "#ffffff",
          },
        )
        .setOrigin(0.5)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: sparkle,
        alpha: 0.15,
        scale: 0.45,
        duration: Phaser.Math.Between(650, 1300),
        delay: Phaser.Math.Between(0, 700),
        yoyo: true,
        repeat: -1,
      });
    }

    let starting = false;
    const startGame = () => {
      if (starting) return;
      starting = true;
      button.disableInteractive();
      this.cameras.main.fadeOut(350, 3, 32, 23);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("Game");
      });
    };

    button.on("pointerdown", startGame);
    this.input.keyboard?.once("keydown", startGame);

    this.layoutSplash(this.scale.gameSize);
    this.scale.on("resize", this.layoutSplash, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layoutSplash, this);
    });
  }

  layoutSplash(gameSize) {
    const width = gameSize?.width || this.scale.width;
    const height = gameSize?.height || this.scale.height;
    const zoom = Math.min(width / W, height / H);
    // Update the viewport before centering, including during orientation changes.
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(W / 2, H / 2);
  }
}

