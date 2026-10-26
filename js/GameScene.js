const W = 768,
    H = 1024;
const TILE_SHEET_COLUMNS = 10;

// Curated first-row frames avoid the generated sheets' uneven row boundaries.
const TILE_THEMES = [
    { key: "toys", level: 3, x: [0, 98, 196, 294, 392, 490, 588, 686, 784], height: 140 },
    { key: "pets", level: 5, x: [0, 98, 196, 294, 392, 490, 588, 686, 784], height: 140 },
    { key: "food", level: 7, x: [0, 148, 296, 444, 593, 741, 889, 1037, 1186], height: 217 },
    { key: "christmas", level: 9, x: [0, 145, 287, 430, 574, 719, 862, 1007, 1152], height: 223 },
    { key: "nature", level: 11, x: [0, 142, 287, 431, 576, 728, 869, 1012, 1158], height: 216 },
    { key: "music", level: 13, x: [0, 143, 283, 441, 584, 736, 883, 1040, 1186], height: 217 },
];

export class GameScene extends Phaser.Scene {
    constructor() {
        super("Game");
        this.tiles = [];
        this.selected = null;
        this.history = [];
        this.lastFlippedTile = null;
        this.rack = [];
        this.settledStars = [];
        this.lastEncouragement = "";
        const savedLevel = Number(localStorage.getItem("sereneLevel"));
        this.level = Number.isSafeInteger(savedLevel) && savedLevel > 0 ? savedLevel : 1;
        this.tileW = 60;
        this.tileH = 80;
        this.sx = 47;
        this.sy = 57;
    }

    preload() {
        this.load.image("tile-sheet", "../assets/images/tile_spritesheet.png");
        TILE_THEMES.forEach(({ key }) => {
            this.load.image(`theme-${key}`, `../assets/images/themes/tile_spritesheet_${key}.png`);
        });
    }

    create() {
        if (!this.textures.exists("tile-back")) {
            const back = this.make.graphics({ x: 0, y: 0, add: false });
            back.fillStyle(0x292050).fillRoundedRect(0, 0, 98, 140, 12);
            back.fillStyle(0x6551a4).fillRoundedRect(2, 1, 94, 133, 11);
            back.fillStyle(0x8070bf).fillRoundedRect(6, 5, 86, 124, 9);
            back.fillStyle(0x6250a0).fillRoundedRect(10, 9, 78, 116, 7);
            back.lineStyle(2, 0xc2b2e5, 0.7).strokeRoundedRect(9, 8, 80, 119, 8);
            back.lineStyle(1, 0xb4a2db, 0.3);
            for (let y = 25; y < 120; y += 18) {
                back.lineBetween(16, y, 49, y - 12);
                back.lineBetween(49, y - 12, 82, y);
            }
            back.generateTexture("tile-back", 98, 140);
            back.destroy();
        }
        // Exclude sheet seams from the sampled area when tiles are scaled.
        const classic = this.textures.get("tile-sheet");
        for (let frame = 0; frame < 50; frame++) {
            if (!classic.has(frame)) {
                classic.add(frame, 0,
                    (frame % TILE_SHEET_COLUMNS) * 98 + 2,
                    Math.floor(frame / TILE_SHEET_COLUMNS) * 140 + 1,
                    94, 138);
            }
        }
        TILE_THEMES.forEach(({ key, x, height }) => {
            if (!this.textures.exists(`theme-${key}`)) return;
            const texture = this.textures.get(`theme-${key}`);
            for (let frame = 0; frame < x.length - 1; frame++) {
                if (!texture.has(frame)) {
                    texture.add(frame, 0, x[frame] + 3, 3,
                        x[frame + 1] - x[frame] - 6, height - 6);
                }
            }
        });
        this.backdrop();
        this.header();
        this.createRack();
        this.controls();
        this.startLevel();
        this.layoutResponsive(this.scale.gameSize);
        this.scale.on("resize", this.layoutResponsive, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off("resize", this.layoutResponsive, this);
        });
    }

    frameForFace(face) {
        if (face.s === "theme") return face.n;
        if (face.s === "char") return face.n - 1;
        if (face.s === "dot") return TILE_SHEET_COLUMNS + face.n - 1;
        if (face.s === "bam") return TILE_SHEET_COLUMNS * 2 + face.n - 1;
        if (face.s === "flower") return TILE_SHEET_COLUMNS * 4 + face.n - 1;
        if (face.s === "season") return TILE_SHEET_COLUMNS * 3 + face.n + 7;

        const honorColumns = {
            east: 0,
            south: 1,
            west: 2,
            north: 3,
            red: 4,
            green: 5,
            white: 6,
        };

        return TILE_SHEET_COLUMNS * 3 + honorColumns[face.key];
    }

    matchIdentity(face) {
        return `${this.textureForFace(face)}:${this.frameForFace(face)}`;
    }

    textureForFace(face) {
        return face.s === "theme" ? `theme-${face.theme}` : "tile-sheet";
    }

    levelSettings() {
        const tileCount = Math.min(144, 24 + (this.level - 1) * 8);
        const themes = TILE_THEMES.filter(
            ({ key, level }) => this.level >= level && this.textures.exists(`theme-${key}`),
        );
        const themePairs = themes.length
            ? Math.min(Math.floor(tileCount / 8), this.level - 2)
            : 0;
        return { tileCount, themes, themePairs };
    }

    bonusArtworkIdentity(face) {
        // The sheet repeats some botanical artwork across the flower and season
        // rows. These aliases make those visually duplicated tiles match.
        if (face.s === "flower" && face.n === 1) return "plum-blossom";
        if (face.s === "season" && face.n === 1) return "plum-blossom";
        if (face.s === "flower" && face.n === 3) return "chrysanthemum";
        if (face.s === "season" && face.n === 3) return "chrysanthemum";
        return null;
    }

    tilesMatch(firstTile, secondTile) {
        const first = firstTile.face;
        const second = secondTile.face;
        const firstArtwork = this.bonusArtworkIdentity(first);
        const secondArtwork = this.bonusArtworkIdentity(second);

        if (firstArtwork && firstArtwork === secondArtwork) return true;
        if (first.s === "flower" && second.s === "flower") return true;
        if (first.s === "season" && second.s === "season") return true;

        return this.matchIdentity(first) === this.matchIdentity(second);
    }

    backdrop() {
        this.cameras.main.setBackgroundColor("#063b34");

        // Keep the area outside the responsive tabletop dark.
        this.add
            .graphics()
            .setDepth(-30)
            .fillStyle(0x052f2d, 1)
            .fillRect(-4096, -4096, 8192, 8192);

        // Redrawn on resize to fill the landscape space between the sidebars.
        this.landscapeTabletop = this.add.graphics().setDepth(-21);

        const g = this.add.graphics().setDepth(-20);

        // Deep emerald satin, brightest at the upper-left like the reference.
        g.fillGradientStyle(0x0b9b68, 0x073e39, 0x08724f, 0x032c2d, 1);
        g.fillRect(0, 94, W, 812);

        // Broad, translucent fabric folds.
        g.fillStyle(0xffffff, 0.035);
        g.fillTriangle(0, 94, 250, 94, 28, 906);
        g.fillTriangle(140, 94, 355, 94, 270, 906);
        g.fillStyle(0x001c1c, 0.075);
        g.fillTriangle(310, 94, 510, 94, 620, 906);
        g.fillTriangle(610, 94, 768, 94, 730, 906);

        // Fine horizontal weave.
        g.fillStyle(0xb6ead2, 0.018);
        for (let y = 104; y < 900; y += 19) {
            g.fillRect(0, y, W, 1);
        }

        // Recessed decorative tabletop frame.
        g.lineStyle(6, 0x012d29, 0.2);
        g.strokeRoundedRect(25, 134, 718, 712, 25);
        g.lineStyle(2, 0x49a57d, 0.17);
        g.strokeRoundedRect(30, 139, 708, 702, 22);
        g.lineStyle(1, 0xb5dfba, 0.1);
        g.strokeRoundedRect(35, 144, 698, 692, 19);

        // Large, quiet medallion beneath the tiles.
        g.lineStyle(15, 0x003a31, 0.09);
        g.strokeCircle(W / 2, 507, 104);
        g.lineStyle(8, 0x44a074, 0.055);
        g.strokeCircle(W / 2, 507, 78);
        g.fillStyle(0x00372f, 0.075);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            g.fillCircle(
                W / 2 + Math.cos(angle) * 68,
                507 + Math.sin(angle) * 68,
                22,
            );
        }
        g.fillCircle(W / 2, 507, 34);

        this.drawTableCorner(g, 55, 165, 1, 1);
        this.drawTableCorner(g, W - 55, 165, -1, 1);
        this.drawTableCorner(g, 55, 812, 1, -1);
        this.drawTableCorner(g, W - 55, 812, -1, -1);

        // Uneven ink-brush transition at the foot of the table.
        g.fillStyle(0x001b1b, 0.48);
        g.fillPoints(
            [
                new Phaser.Geom.Point(0, 865),
                new Phaser.Geom.Point(70, 857),
                new Phaser.Geom.Point(145, 867),
                new Phaser.Geom.Point(225, 852),
                new Phaser.Geom.Point(318, 862),
                new Phaser.Geom.Point(410, 851),
                new Phaser.Geom.Point(510, 864),
                new Phaser.Geom.Point(610, 853),
                new Phaser.Geom.Point(700, 866),
                new Phaser.Geom.Point(768, 858),
                new Phaser.Geom.Point(768, 906),
                new Phaser.Geom.Point(0, 906),
            ],
            true,
        );
        g.fillStyle(0x001111, 0.3);
        g.fillRect(52, 879, 650, 13);
        g.fillRect(105, 898, 520, 8);
    }

    drawTableCorner(g, x, y, directionX, directionY) {
        const dx = directionX;
        const dy = directionY;

        g.lineStyle(3, 0x003d33, 0.14);
        g.strokeCircle(x, y, 9);
        g.strokeCircle(x + 14 * dx, y, 8);
        g.strokeCircle(x, y + 14 * dy, 8);
        g.strokeCircle(x + 12 * dx, y + 12 * dy, 7);
        g.lineBetween(x + 18 * dx, y + 3 * dy, x + 44 * dx, y + 3 * dy);
        g.lineBetween(x + 3 * dx, y + 18 * dy, x + 3 * dx, y + 44 * dy);

        g.lineStyle(2, 0x76b18a, 0.1);
        g.lineBetween(x + 28 * dx, y + 3 * dy, x + 38 * dx, y + 13 * dy);
        g.lineBetween(x + 3 * dx, y + 28 * dy, x + 13 * dx, y + 38 * dy);
    }
    header() {
        this.headerBackground = this.add
            .rectangle(-4096, 0, 8192, 94, 0xf8f4e9, 0.98)
            .setOrigin(0)
            .setDepth(1e4);
        this.headerDivider = this.add
            .rectangle(-4096, 93, 8192, 2, 0x5c7e62, 0.22)
            .setOrigin(0)
            .setDepth(10001);
        const style = { fontFamily: "Arial", color: "#33553d", fontStyle: "bold" };
        this.levelText = this.add
            .text(36, 39, "", { ...style, fontSize: "26px" })
            .setDepth(10002);
        this.scoreText = this.add
            .text(W / 2, 21, "", { ...style, fontSize: "36px" })
            .setOrigin(0.5, 0)
            .setDepth(10002);
        this.scoreLabel = this.add
            .text(W / 2, 68, "SCORE", {
                fontFamily: "Arial",
                fontSize: "15px",
                color: "#708273",
                letterSpacing: 2,
            })
            .setOrigin(0.5, 0)
            .setDepth(10002);
        this.matchText = this.add
            .text(628, 36, "", { ...style, fontSize: "19px", align: "center" })
            .setOrigin(0.5, 0)
            .setDepth(10002);
        this.menuButton = this.add.container(721, 57).setDepth(10004);
        const hit = this.add
            .circle(0, 0, 31, 0xffffff, 0.01)
            .setInteractive({ useHandCursor: true });
        const bars = this.add.graphics().lineStyle(4, 0x42634a);
        [-10, 0, 10].forEach((y) => bars.lineBetween(-13, y, 13, y));
        this.menuButton.add([hit, bars]);
        hit.on("pointerdown", () => this.toggleMenu());
    }

    createRack() {
        this.rackLayer = this.add.container(0, 0).setDepth(12000);

        const shadow = this.add
            .rectangle(W / 2, 178, 310, 98, 0x173c2a, 0.28)
            .setStrokeStyle(2, 0x315b41, 0.45);
        const tray = this.add
            .rectangle(W / 2, 172, 310, 98, 0x315e43, 0.96)
            .setStrokeStyle(3, 0xe5d69d, 0.8);
        const lip = this.add.rectangle(W / 2, 220, 318, 13, 0x173f2b, 0.96);
        const label = this.add
            .text(W / 2, 219, "MATCH RACK", {
                fontFamily: "Arial",
                fontSize: "10px",
                color: "#dfead9",
                letterSpacing: 2,
            })
            .setOrigin(0.5);

        this.rackSlots = [];
        for (let index = 0; index < 4; index++) {
            const slot = this.add
                .rectangle(this.rackX(index), 172, 64, 82, 0x163a29, 0.7)
                .setStrokeStyle(2, 0x719276, 0.7);
            this.rackSlots.push(slot);
        }

        this.rackLayer.add([shadow, tray, lip, label, ...this.rackSlots]);
    }

    rackX(index) {
        return W / 2 + (index - 1.5) * 68;
    }
    controls() {
        this.controlBackground = this.add
            .rectangle(-4096, 906, 8192, 118, 0xf9f5eb, 0.98)
            .setOrigin(0)
            .setDepth(1e4);
        this.shuffleBtn = this.control(234, 947, "shuffle", "Shuffle", () =>
            this.shuffle(),
        );
        this.hintBtn = this.control(384, 947, "hint", "Hint", () => this.hint());
        this.undoBtn = this.control(534, 947, "undo", "Undo", () => this.undo());
    }

    layoutResponsive(gameSize) {
        const screenWidth = gameSize?.width || this.scale.width;
        const screenHeight = gameSize?.height || this.scale.height;
        const isLandscape = screenWidth > screenHeight;

        const zoom = isLandscape
            ? Math.min(Math.max(0.25, (screenWidth - 220) / W), screenHeight / 900)
            : Math.min(screenWidth / W, screenHeight / H);

        const visibleWidth = screenWidth / zoom;
        const visibleHeight = screenHeight / zoom;
        const left = W / 2 - visibleWidth / 2;
        const right = W / 2 + visibleWidth / 2;
        const top = H / 2 - visibleHeight / 2;
        const bottom = H / 2 + visibleHeight / 2;

        this.cameras.main.setZoom(zoom);
        this.cameras.main.centerOn(W / 2, H / 2);

        if (!isLandscape) {
            this.landscapeTabletop.clear();
            this.rackOffsetY = top + 106 - 123;
            this.rackLayer.setY(this.rackOffsetY);
            this.rack.forEach((entry, index) => {
                entry.display.setPosition(this.rackX(index), 172 + this.rackOffsetY);
            });
            this.headerBackground
                .setPosition(left, top)
                .setDisplaySize(visibleWidth, 94);
            this.headerDivider
                .setPosition(left, top + 93)
                .setDisplaySize(visibleWidth, 2);
            this.levelText.setOrigin(0, 0).setPosition(36, top + 39);
            this.scoreText.setOrigin(0.5, 0).setPosition(W / 2, top + 21);
            this.scoreLabel.setOrigin(0.5, 0).setPosition(W / 2, top + 68);
            this.matchText.setOrigin(0.5, 0).setPosition(628, top + 36);
            this.menuButton.setPosition(721, top + 57);

            this.controlBackground
                .setPosition(left, bottom - 118)
                .setDisplaySize(visibleWidth, 118);
            this.shuffleBtn.c.setPosition(234, bottom - 77).setScale(1);
            this.hintBtn.c.setPosition(384, bottom - 77).setScale(1);
            this.undoBtn.c.setPosition(534, bottom - 77).setScale(1);
            this.applyBoardLayout(false, top, bottom, left, right);
            return;
        }

        const sidebarWidth = 170;
        const leftCenter = left + sidebarWidth / 2;
        const rightCenter = right - sidebarWidth / 2;

        this.drawLandscapeTabletop(
            left + sidebarWidth,
            right - sidebarWidth,
            top,
            bottom,
        );

        // The rack artwork begins at local y=123. Align it to the visible top.
        this.rackOffsetY = top + 8 - 123;
        this.rackLayer.setY(this.rackOffsetY);
        this.rack.forEach((entry, index) => {
            entry.display.setPosition(
                this.rackX(index),
                172 + this.rackOffsetY,
            );
        });

        this.headerBackground
            .setPosition(left, top)
            .setDisplaySize(sidebarWidth, visibleHeight);
        this.headerDivider
            .setPosition(left + sidebarWidth - 2, top)
            .setDisplaySize(2, visibleHeight);
        this.menuButton.setPosition(leftCenter, top + 55);
        this.levelText
            .setOrigin(0.5)
            .setPosition(leftCenter, top + 145);
        this.scoreText
            .setOrigin(0.5)
            .setPosition(leftCenter, top + 245);
        this.scoreLabel
            .setOrigin(0.5)
            .setPosition(leftCenter, top + 285);
        this.matchText
            .setOrigin(0.5)
            .setPosition(leftCenter, top + 385);

        this.controlBackground
            .setPosition(right - sidebarWidth, top)
            .setDisplaySize(sidebarWidth, visibleHeight);
        this.shuffleBtn.c.setPosition(rightCenter, top + 220).setScale(1);
        this.hintBtn.c.setPosition(rightCenter, top + 450).setScale(1);
        this.undoBtn.c.setPosition(rightCenter, top + 680).setScale(1);
        this.applyBoardLayout(true, top, bottom, left + sidebarWidth, right - sidebarWidth);
    }

    drawLandscapeTabletop(left, right, top, bottom) {
        const g = this.landscapeTabletop;
        const width = right - left;
        const height = bottom - top;

        g.clear();
        g.fillGradientStyle(0x0b9b68, 0x073e39, 0x08724f, 0x032c2d, 1);
        g.fillRect(left, top, width, height);

        // Continue the soft fabric treatment across the expanded area.
        g.fillStyle(0xffffff, 0.025);
        g.fillTriangle(left, top, left + width * 0.34, top, left + width * 0.08, bottom);
        g.fillStyle(0x001c1c, 0.055);
        g.fillTriangle(
            left + width * 0.62,
            top,
            right,
            top,
            right - width * 0.08,
            bottom,
        );

        g.fillStyle(0xb6ead2, 0.018);
        for (let y = top + 10; y < bottom; y += 19) {
            g.fillRect(left, y, width, 1);
        }
    }

    applyBoardLayout(isLandscape, top, bottom, left = 0, right = W) {
        if (!this.tiles.length) return;

        // Fit the complete deal, including removed tiles, so matching and undo
        // never cause the board to jump. Reserve room for the rack and controls.
        const padding = 16;
        const targetTop = top + (isLandscape ? 128 : 226);
        const targetBottom = bottom - (isLandscape ? padding : 134);
        const width = right - left - padding * 2;
        const height = targetBottom - targetTop;
        const points = this.tiles.map(({ p }) => ({
            x: (p.c - 5.5) * 60 + p.l * 4,
            y: p.r * 78 - p.l * 5,
        }));
        const minX = Math.min(...points.map((p) => p.x));
        const maxX = Math.max(...points.map((p) => p.x));
        const minY = Math.min(...points.map((p) => p.y));
        const maxY = Math.max(...points.map((p) => p.y));
        // Include the lower edge, shadow, and the hint's 10% enlargement.
        this.boardTileScale = Math.min(
            width / (maxX - minX + 80),
            height / (maxY - minY + 108),
        );
        const scale = this.boardTileScale;
        // Use spare space for separation without breaking the stacked layout.
        const spreadX = maxX === minX ? 1 : Math.min(1.1,
            (width / scale - 80) / (maxX - minX));
        const spreadY = maxY === minY ? 1 : Math.min(1.1,
            (height / scale - 108) / (maxY - minY));
        this.tiles.forEach((tile, index) => {
            const point = points[index];
            const x = (left + right) / 2 +
                (point.x - (minX + maxX) / 2) * scale * spreadX;
            const y = (targetTop + targetBottom) / 2 - 3 * scale +
                (point.y - (minY + maxY) / 2) * scale * spreadY;
            tile.c.setPosition(x, y).setScale(scale)
                .setDepth(tile.p.l * 1000 + y);
        });
    }

    control(x, y, icon, label, fn) {
        const c = this.add.container(x, y).setDepth(10002),
            shadow = this.add.circle(0, 4, 36, 0x173a27, 0.15),
            circle = this.add
                .circle(0, 0, 36, 0xffffff)
                .setStrokeStyle(2, 0xd7ded3)
                .setInteractive({ useHandCursor: true }),
            g = this.add.graphics().lineStyle(4, 0x3f6748);
        if (icon === "hint") {
            g.strokeCircle(0, -5, 13)
                .lineBetween(-7, 8, -7, 13)
                .lineBetween(7, 8, 7, 13)
                .lineBetween(-7, 13, 7, 13)
                .lineBetween(-4, 19, 4, 19);
        } else if (icon === "undo") {
            g.beginPath()
                .arc(2, 2, 16, 3.85, 1.3)
                .strokePath()
                .lineBetween(-17, -11, -17, 5)
                .lineBetween(-17, -11, -2, -11);
        } else {
            g.lineBetween(-17, -12, -7, -12)
                .lineBetween(-7, -12, 9, 11)
                .lineBetween(9, 11, 18, 11)
                .lineBetween(11, 4, 18, 11)
                .lineBetween(11, 18, 18, 11)
                .lineBetween(-17, 13, -8, 13)
                .lineBetween(-8, 13, -2, 4)
                .lineBetween(1, -3, 8, -12)
                .lineBetween(8, -12, 18, -12)
                .lineBetween(11, -19, 18, -12)
                .lineBetween(11, -5, 18, -12);
        }
        const cap = this.add
            .text(0, 48, label, {
                fontFamily: "Arial",
                fontSize: "18px",
                color: "#405947",
                fontStyle: "bold",
            })
            .setOrigin(0.5),
            badge = this.add
                .circle(29, -27, 15, 0xdb6958)
                .setStrokeStyle(2, 0xf9f5eb),
            count = this.add
                .text(29, -27, "", {
                    fontFamily: "Arial",
                    fontSize: "16px",
                    color: "#fff",
                    fontStyle: "bold",
                })
                .setOrigin(0.5);
        c.add([shadow, circle, g, cap, badge, count]);
        circle.on("pointerdown", () => {
            this.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true });
            fn();
        });
        return { c, badge, count };
    }
    startLevel() {
        this.closeRackFullDialog();
        this.closeMenu();
        this.clearHint();
        this.tiles.forEach((t) => {
            this.tweens.killTweensOf(t.c);
            t.c.destroy(true);
        });
        this.rack.forEach((entry) => {
            this.tweens.killTweensOf(entry.display);
            entry.display.destroy(true);
        });
        this.settledStars.forEach((star) => star.destroy());
        this.tiles = [];
        this.rack = [];
        this.settledStars = [];
        this.selected = null;
        this.history = [];
        this.score = 0;
        this.matches = 0;
        this.hints = 3;
        this.shuffles = 3;
        const settings = this.levelSettings();
        const pos = this.layout(settings.tileCount),
            deck = this.deck(settings);
        Phaser.Utils.Array.Shuffle(deck);
        pos.forEach((p, i) => this.createTile(p, deck[i], i));
        this.remaining = pos.length;
        this.updateFree();
        const covered = Phaser.Utils.Array.Shuffle(this.tiles.filter((tile) => !tile.free));
        covered.slice(0, Math.min(covered.length, Math.floor(pos.length / 5))).forEach((tile) => {
            tile.faceDown = true;
            this.draw(tile);
        });
        this.ensureMove();
        this.hud();
        this.layoutResponsive(this.scale.gameSize);
    }
    layout(tileCount = this.levelSettings().tileCount) {
        const candidates = [];
        [[7, 8, 2.5, -0.5], [6, 7, 3, 0], [5, 6, 3.5, 0.5], [4, 4, 4, 1.5]]
            .forEach(([cols, rows, x, y], l) => {
                for (let r = 0; r < rows; r++)
                    for (let c = 0; c < cols; c++) candidates.push({ l, c: x + c, r: y + r });
            });
        const priority = (p) => (p.c - 5.5) ** 2 + (p.r - 3) ** 2 + p.l * 1.5;
        candidates.sort((a, b) => priority(a) - priority(b));
        const placed = [];
        while (placed.length < tileCount && candidates.length) {
            // An upper tile is added only after every tile supporting it exists.
            const index = candidates.findIndex((p) => p.l === 0 ||
                !candidates.some((other) => other.l === p.l - 1 &&
                    Math.abs(other.c - p.c) < 0.78 && Math.abs(other.r - p.r) < 0.78));
            placed.push(candidates.splice(index, 1)[0]);
        }
        return placed;
    }
    deck(settings = this.levelSettings()) {
        const d = [];
        ["dot", "bam", "char"].forEach((s) => {
            for (let n = 1; n <= 9; n++)
                for (let i = 0; i < 4; i++) d.push({ key: s + n, s, n });
        });
        [
            ["east", "東", "#216443"],
            ["south", "南", "#216443"],
            ["west", "西", "#216443"],
            ["north", "北", "#216443"],
            ["red", "中", "#b94d43"],
            ["green", "發", "#247052"],
            ["white", "□", "#51719c"],
        ].forEach(([key, glyph, color]) => {
            for (let i = 0; i < 4; i++) d.push({ key, s: "honor", glyph, color });
        });
        ["梅", "蘭", "菊", "竹"].forEach((glyph, i) =>
            d.push({ key: "flowers", s: "flower", glyph, n: i + 1 }),
        );
        ["春", "夏", "秋", "冬"].forEach((glyph, i) =>
            d.push({ key: "seasons", s: "season", glyph, n: i + 1 }),
        );
        // Build complete pairs so every board size remains matchable.
        const faces = [...new Map(d.map((face) => [this.matchIdentity(face), face])).values()];
        Phaser.Utils.Array.Shuffle(faces);
        const result = [];
        const classicPairs = settings.tileCount / 2 - settings.themePairs;
        for (let i = 0; i < classicPairs; i++) {
            const face = faces[i % faces.length];
            result.push({ ...face }, { ...face });
        }
        // Start with the newly unlocked theme, then rotate through older themes.
        for (let i = 0; i < settings.themePairs; i++) {
            const theme = settings.themes[settings.themes.length - 1 - i % settings.themes.length];
            const n = Phaser.Math.Between(0, theme.x.length - 2);
            const face = { s: "theme", theme: theme.key, n, key: `${theme.key}-${n}` };
            result.push({ ...face }, { ...face });
        }
        return result;
    }
    bx(c, l) {
        return W / 2 + (c - 5.5) * this.sx + l * 4;
    }
    by(r, l) {
        return 300 + r * this.sy - l * 5;
    }
    createTile(p, face, id) {
        const c = this.add
            .container(this.bx(p.c, p.l), this.by(p.r, p.l))
            .setDepth(p.l * 1000 + this.by(p.r, p.l)),
            shadow = this.add.ellipse(6, 11, 60, 76, 0x10291c, 0.3),
            lowerEdge = this.add
                .image(0, 7, this.textureForFace(face), this.frameForFace(face))
                .setDisplaySize(62, 82)
                .setTint(0x476d50),
            sprite = this.add
                .image(0, -2, this.textureForFace(face), this.frameForFace(face))
                .setDisplaySize(62, 82),
            shine = this.add
                .rectangle(0, 0, this.tileW - 2, this.tileH - 2, 0xffffff, 0)
                .setStrokeStyle(0, 0xffffff, 0);
        c.add([shadow, lowerEdge, sprite, shine])
            .setSize(62, 82)
            .setInteractive(
                new Phaser.Geom.Rectangle(0, 0, 62, 82),
                Phaser.Geom.Rectangle.Contains,
            );
        const t = {
            id,
            p,
            face,
            c,
            lowerEdge,
            sprite,
            shine,
            removed: false,
            free: false,
            faceDown: false,
        };
        this.draw(t);
        c.on("pointerdown", () => this.click(t));
        c.on("pointerover", () => {
            if (t.free && t !== this.selected) sprite.setTint(0xfff1c9);
        });
        c.on("pointerout", () => {
            if (!t.removed && t !== this.selected) sprite.clearTint();
        });
        this.tiles.push(t);
    }
    draw(t) {
        const texture = t.faceDown ? "tile-back" : this.textureForFace(t.face);
        const frame = t.faceDown ? undefined : this.frameForFace(t.face);
        t.sprite.setTexture(texture, frame).setDisplaySize(62, 82);
        t.lowerEdge.setTexture(texture, frame).setDisplaySize(62, 82);
    }
    click(t) {
        if (t.removed || this.tiles.some((tile) => tile.flipping) || this.rackFullDialog) return;

        this.clearHint();
        this.updateFree();

        if (!t.free) {
            this.toast("That tile is blocked");
            this.tweens.add({
                targets: t.c,
                x: t.c.x + 3,
                duration: 45,
                yoyo: true,
                repeat: 3,
            });
            return;
        }

        if (t.faceDown) {
            this.flipTile(t);
            return;
        }

        if (this.collectFlippedPair(t)) return;
        this.lastFlippedTile = null;

        const matchIndex = this.rack.findIndex((entry) =>
            this.tilesMatch(entry.tile, t),
        );

        if (matchIndex === -1 && this.rack.length >= 4) {
            this.showRackFullDialog();
            return;
        }

        this.moveTileToRack(t, matchIndex);
    }

    createRackDisplay(tile) {
        const frame = this.frameForFace(tile.face);
        const display = this.add
            .container(tile.c.x, tile.c.y)
            .setDepth(12005)
            .setScale(1);

        const shadow = this.add.ellipse(5, 9, 60, 76, 0x10291c, 0.35);
        const lowerEdge = this.add
            .image(0, 6, this.textureForFace(tile.face), frame)
            .setDisplaySize(62, 82)
            .setTint(0x416349);
        const sprite = this.add
            .image(0, -2, this.textureForFace(tile.face), frame)
            .setDisplaySize(62, 82);

        display.add([shadow, lowerEdge, sprite]);
        return { display, sprite };
    }

    collectFlippedPair(tile) {
        const flipped = this.lastFlippedTile;
        if (!flipped || flipped === tile || flipped.removed || !flipped.free ||
            flipped.faceDown || flipped.flipping || tile.removed || !tile.free ||
            tile.faceDown || tile.flipping || this.rackFullDialog || this.rack.length >= 4 ||
            !this.tilesMatch(flipped, tile)) return false;
        this.lastFlippedTile = null;
        const partnerIndex = this.rack.length;
        // Queue both before checking fullness; the pair can then resolve normally.
        this.moveTileToRack(flipped, -1, true);
        this.moveTileToRack(tile, partnerIndex);
        return true;
    }

    moveTileToRack(tile, matchIndex, deferFullCheck = false) {
        if (this.lastFlippedTile === tile) this.lastFlippedTile = null;
        tile.removed = true;
        tile.inRack = true;
        tile.c.disableInteractive();

        const rackDisplay = this.createRackDisplay(tile);
        const entry = {
            tile,
            display: rackDisplay.display,
            sprite: rackDisplay.sprite,
        };

        if (matchIndex >= 0) {
            const partner = this.rack[matchIndex];
            this.rack.splice(matchIndex + 1, 0, entry);
            this.reflowRack();

            this.time.delayedCall(390, () => {
                this.resolveRackMatch(partner, entry);
            });
        } else {
            this.rack.push(entry);
            this.reflowRack();
        }

        this.tweens.add({
            targets: tile.c,
            alpha: 0,
            scale: (this.boardTileScale || 1) * 0.82,
            duration: 150,
            onComplete: () =>
                tile.c
                    .setVisible(false)
                    .setAlpha(1)
                    .setScale(this.boardTileScale || 1),
        });

        this.updateFree();

        if (!deferFullCheck) this.showRackFullDialog();
    }

    flipTile(tile) {
        if (!tile.free || !tile.faceDown || tile.flipping || tile.removed) return;
        tile.flipping = true;
        this.tweens.killTweensOf(tile.c);
        this.tweens.add({
            targets: tile.c,
            scaleX: 0,
            duration: 140,
            ease: "Sine.easeIn",
            onComplete: () => {
                tile.faceDown = false;
                this.draw(tile);
                this.tweens.add({
                    targets: tile.c,
                    scaleX: this.boardTileScale || 1,
                    duration: 160,
                    ease: "Sine.easeOut",
                    onComplete: () => {
                        tile.flipping = false;
                        this.updateFree();
                        if (this.collectFlippedPair(tile)) return;
                        const matchIndex = this.rack.findIndex((entry) =>
                            this.tilesMatch(entry.tile, tile));
                        if (matchIndex >= 0 && tile.free && !tile.removed && !this.rackFullDialog) {
                            this.lastFlippedTile = null;
                            this.moveTileToRack(tile, matchIndex);
                            return;
                        }
                        this.lastFlippedTile = tile;
                        this.check();
                    },
                });
            },
        });
    }

    closeRackFullDialog() {
        this.rackFullDialog?.destroy(true);
        this.rackFullDialog = null;
    }

    showRackFullDialog() {
        if (this.rackFullDialog || this.rack.length < 4) return;
        // Let pairs already travelling into the rack finish resolving first.
        if (this.rack.some((entry, i) => this.rack.slice(i + 1).some(
            (other) => this.tilesMatch(entry.tile, other.tile),
        ))) return;
        this.clearHint();
        const dialog = this.add.container(W / 2, H / 2).setDepth(25000);
        this.rackFullDialog = dialog;
        const shade = this.add.rectangle(0, 0, 8192, 8192, 0x102d27, 0.72)
            .setInteractive();
        const card = this.add.rectangle(0, 0, 460, 370, 0xfffbef)
            .setStrokeStyle(3, 0xe5ca79);
        const title = this.add.text(0, -125, "Rack full", {
            fontFamily: "Georgia", fontSize: "38px", color: "#315a3e",
        }).setOrigin(0.5);
        const copy = this.add.text(0, -55,
            "Revive to empty the rack and reshuffle.\nKeep your score and continue playing.", {
                fontFamily: "Arial", fontSize: "20px", color: "#617066",
                align: "center", lineSpacing: 8,
            }).setOrigin(0.5);
        dialog.add([shade, card, title, copy]);
        const button = (y, label, color, action) => {
            const background = this.add.rectangle(0, y, 340, 58, color)
                .setInteractive({ useHandCursor: true });
            const text = this.add.text(0, y, label, {
                fontFamily: "Arial", fontSize: "24px", color: "#ffffff",
            }).setOrigin(0.5);
            background.on("pointerdown", () => {
                if (this.rackFullDialog !== dialog) return;
                action();
            });
            dialog.add([background, text]);
        };
        button(35, "Revive", 0x4f845d, () => this.revive());
        button(112, "Reset Level", 0x8a6454, () => this.startLevel());
    }

    revive() {
        this.closeRackFullDialog();
        this.clearHint();
        this.rack.splice(0).forEach(({ tile, display }) => {
            this.tweens.killTweensOf(tile.c);
            this.tweens.killTweensOf(display);
            display.destroy(true);
            tile.removed = false;
            tile.inRack = false;
            tile.c.setVisible(true).setAlpha(1).setScale(this.boardTileScale || 1)
                .setInteractive(new Phaser.Geom.Rectangle(0, 0, 62, 82),
                    Phaser.Geom.Rectangle.Contains);
        });
        this.shuffle(true);
    }

    reflowRack() {
        this.rack.forEach((entry, index) => {
            this.tweens.add({
                targets: entry.display,
                x: this.rackX(index),
                y: 172 + (this.rackOffsetY || 0),
                scale: 0.92,
                duration: 280,
                ease: "Back.easeOut",
            });
        });
    }

    resolveRackMatch(firstEntry, secondEntry) {
        if (
            !this.rack.includes(firstEntry) ||
            !this.rack.includes(secondEntry)
        ) {
            return;
        }

        const burstX = (firstEntry.display.x + secondEntry.display.x) / 2;
        const burstY = (firstEntry.display.y + secondEntry.display.y) / 2;
        const firstTile = firstEntry.tile;
        const secondTile = secondEntry.tile;
        const earned = 200 + Math.max(firstTile.p.l, secondTile.p.l) * 40;

        this.rack = this.rack.filter(
            (entry) => entry !== firstEntry && entry !== secondEntry,
        );

        firstTile.inRack = false;
        secondTile.inRack = false;
        this.score += earned;
        this.matches++;
        this.remaining -= 2;
        this.history.push({ a: firstTile, b: secondTile, earned });

        this.tweens.add({
            targets: [firstEntry.display, secondEntry.display],
            scale: 1.2,
            alpha: 0,
            duration: 220,
            ease: "Back.easeIn",
            onComplete: () => {
                firstEntry.display.destroy(true);
                secondEntry.display.destroy(true);
            },
        });

        this.floatScore(burstX, burstY + 45, earned);
        this.burstStars(burstX, burstY, earned);
        this.showEncouragement();
        this.reflowRack();
        this.updateFree();
        this.hud();
        this.showRackFullDialog();
        this.check();
    }

    burstStars(x, y, earned = 200) {
        const colors = [
            "#ffffff",
            "#fff36b",
            "#ffd21f",
            "#8fffff",
            "#ff9ff3",
            "#baff72",
        ];

        const matchQuality = Math.max(0, Math.round((earned - 200) / 40));
        const starCount = 68 + matchQuality * 16;

        for (let index = 0; index < starCount; index++) {
            const star = this.add
                .text(x, y, "★", {
                    fontFamily: "Arial",
                    fontSize: Phaser.Math.Between(10, 22) + "px",
                    color: colors[index % colors.length],
                    stroke: "#ffffff",
                    strokeThickness: 2,
                })
                .setOrigin(0.5)
                .setDepth(15000)
                .setAngle(Phaser.Math.Between(-90, 90))
                .setBlendMode(Phaser.BlendModes.ADD);

            this.settledStars.push(star);
            if (this.settledStars.length > 280) {
                this.settledStars.shift().destroy();
            }

            const launchAngle =
                (index / starCount) * Math.PI * 2 +
                Phaser.Math.FloatBetween(-0.12, 0.12);
            const launchSpeed = Phaser.Math.FloatBetween(0.18, 0.32);
            const initialVelocityX = Math.cos(launchAngle) * launchSpeed;
            const verticalDirection = Math.sin(launchAngle);
            const verticalBoost = verticalDirection < 0 ? 1.7 : 0.75;
            const initialVelocityY =
                verticalDirection * launchSpeed * verticalBoost;
            const spinDirection = Phaser.Math.Between(0, 1) ? 1 : -1;
            const launchDuration = Phaser.Math.Between(750, 1050);
            const flightDuration = Phaser.Math.Between(1900, 2500);
            const totalSpin = spinDirection * Phaser.Math.Between(540, 1440);
            const landingX = Phaser.Math.Clamp(
                x + initialVelocityX * flightDuration,
                12,
                W - 12,
            );
            const landingY = H - Phaser.Math.Between(6, 28);
            const velocityX = (landingX - x) / flightDuration;
            const gravity =
                (2 *
                    (landingY -
                        y -
                        initialVelocityY * flightDuration)) /
                (flightDuration * flightDuration);
            const startAngle = star.angle;
            const peakScale = Phaser.Math.FloatBetween(0.8, 1.45);
            const landingScale = Phaser.Math.FloatBetween(0.35, 0.75);

            star.setScale(0.2);

            const trail = this.add
                .rectangle(
                    x,
                    y,
                    Phaser.Math.Between(18, 34),
                    Phaser.Math.Between(1, 3),
                    Phaser.Display.Color.HexStringToColor(
                        colors[index % colors.length],
                    ).color,
                    0.9,
                )
                .setOrigin(0.9, 0.5)
                .setRotation(launchAngle)
                .setDepth(14999)
                .setBlendMode(Phaser.BlendModes.ADD);

            this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: launchDuration,
                ease: "Linear",
                onUpdate: (tween) => {
                    const elapsed = tween.getValue() * launchDuration;
                    trail.x = x + velocityX * elapsed;
                    trail.y =
                        y +
                        initialVelocityY * elapsed +
                        0.5 * gravity * elapsed * elapsed;
                    trail.rotation = Math.atan2(
                        initialVelocityY + gravity * elapsed,
                        velocityX,
                    );
                    trail.scaleX = Phaser.Math.Linear(1, 1.8, tween.getValue());
                    trail.alpha = 1 - tween.getValue();
                },
                onComplete: () => trail.destroy(),
            });

            this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: flightDuration,
                ease: "Linear",
                onUpdate: (tween) => {
                    if (!star.active) return;
                    const progress = tween.getValue();
                    const elapsed = progress * flightDuration;
                    star.x = x + velocityX * elapsed;
                    star.y =
                        y +
                        initialVelocityY * elapsed +
                        0.5 * gravity * elapsed * elapsed;
                    star.angle = startAngle + totalSpin * progress;
                    star.scale =
                        progress < 0.18
                            ? Phaser.Math.Linear(
                                0.2,
                                peakScale,
                                progress / 0.18,
                            )
                            : Phaser.Math.Linear(
                                peakScale,
                                landingScale,
                                (progress - 0.18) / 0.82,
                            );
                },
                onComplete: () => {
                    if (star.active) star.setPosition(landingX, landingY);
                },
            });
        }

        const rays = this.add.graphics().setPosition(x, y).setDepth(15002);
        rays.lineStyle(5, 0xffffff, 1);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            rays.lineBetween(
                Math.cos(angle) * 12,
                Math.sin(angle) * 12,
                Math.cos(angle) * 78,
                Math.sin(angle) * 78,
            );
        }
        rays.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
            targets: rays,
            scale: 1.45,
            alpha: 0,
            duration: 240,
            ease: "Cubic.easeOut",
            onComplete: () => rays.destroy(),
        });

        const flash = this.add
            .circle(x, y, 24, 0xffffff, 1)
            .setDepth(15001)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets: flash,
            scale: 4,
            alpha: 0,
            duration: 170,
            onComplete: () => flash.destroy(),
        });

        [0, 90].forEach((delay, index) => {
            const ring = this.add
                .circle(x, y, 22, 0xffffff, 0)
                .setStrokeStyle(5 - index, index ? 0xffdf3d : 0xffffff, 1)
                .setDepth(15003)
                .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
                targets: ring,
                scale: 4.8 + index,
                alpha: 0,
                delay,
                duration: 520,
                ease: "Cubic.easeOut",
                onComplete: () => ring.destroy(),
            });
        });
    }

    showEncouragement() {
        const messages = [
            "GOOD EYE!",
            "EXCELLENT!",
            "GREAT MATCH!",
            "BRILLIANT!",
            "NICE ONE!",
            "WELL SPOTTED!",
            "FANTASTIC!",
            "KEEP IT UP!",
        ];
        const choices = messages.filter(
            (message) => message !== this.lastEncouragement,
        );
        const message = Phaser.Utils.Array.GetRandom(choices);
        this.lastEncouragement = message;

        const glow = this.add
            .text(W / 2, 250, message, {
                fontFamily: "Arial Black, Arial",
                fontSize: "34px",
                color: "#fff36b",
                fontStyle: "bold",
                stroke: "#ffffff",
                strokeThickness: 7,
                shadow: {
                    offsetX: 0,
                    offsetY: 4,
                    color: "#0b3f2a",
                    blur: 8,
                    fill: true,
                },
            })
            .setOrigin(0.5)
            .setDepth(16000)
            .setScale(0.35)
            .setAlpha(0);

        this.tweens.add({
            targets: glow,
            scale: 1.08,
            alpha: 1,
            duration: 260,
            ease: "Back.easeOut",
            onComplete: () => {
                this.tweens.add({
                    targets: glow,
                    y: 220,
                    alpha: 0,
                    scale: 1.18,
                    delay: 650,
                    duration: 420,
                    ease: "Sine.easeIn",
                    onComplete: () => glow.destroy(),
                });
            },
        });
    }

    select(t) {
        this.click(t);
    }

    clearSelection() {
        this.selected = null;
        this.lastFlippedTile = null;
    }
    floatScore(x, y, n) {
        const q = this.add
            .text(x, y, "+" + n, {
                fontFamily: "Arial",
                fontSize: "22px",
                color: "#fff7bf",
                fontStyle: "bold",
                stroke: "#416a4d",
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(9000);
        this.tweens.add({
            targets: q,
            y: y - 45,
            alpha: 0,
            duration: 700,
            onComplete: () => q.destroy(),
        });
    }
    updateFree() {
        const alive = this.tiles.filter((t) => !t.removed);
        alive.forEach((t) => {
            t.free =
                !alive.some(
                    (o) =>
                        o !== t &&
                        o.p.l > t.p.l &&
                        Math.abs(o.p.c - t.p.c) < 0.78 &&
                        Math.abs(o.p.r - t.p.r) < 0.78,
                ) &&
                (this.sideOpen(t, alive, -1) || this.sideOpen(t, alive, 1));
            t.c.setAlpha(1);
        });
    }
    sideOpen(t, alive, d) {
        return !alive.some(
            (o) =>
                o !== t &&
                o.p.l === t.p.l &&
                d * (o.p.c - t.p.c) > 0.6 &&
                d * (o.p.c - t.p.c) < 1.4 &&
                Math.abs(o.p.r - t.p.r) < 0.62,
        );
    }
    pairs() {
        const freeTiles = this.tiles.filter((tile) =>
            !tile.removed && tile.free && !tile.faceDown && !tile.flipping);
        const matchingPairs = [];

        for (let first = 0; first < freeTiles.length; first++) {
            for (let second = first + 1; second < freeTiles.length; second++) {
                if (this.tilesMatch(freeTiles[first], freeTiles[second])) {
                    matchingPairs.push([freeTiles[first], freeTiles[second]]);
                }
            }
        }

        return matchingPairs;
    }
    hint() {
        if (this.tiles.some((tile) => tile.flipping)) return;
        if (this.hints <= 0 || !this.remaining) return this.toast("No hints left");
        this.clearSelection();
        this.clearHint();
        this.updateFree();
        const rackMatch = this.tiles.find(
            (tile) =>
                !tile.removed &&
                tile.free &&
                !tile.faceDown &&
                this.rack.some((entry) => this.tilesMatch(entry.tile, tile)),
        );
        const groups = this.pairs();
        if (!rackMatch && !groups.length)
            return this.toast(this.tiles.some((tile) => !tile.removed && tile.free && tile.faceDown)
                ? "Turn over a free tile first" : "No matches — try Shuffle");
        this.hints--;
        this.hud();
        const pair = rackMatch
            ? [rackMatch]
            : Phaser.Utils.Array.GetRandom(groups).slice(0, 2);
        const token = ++this.hintToken;
        this.hinted = pair;

        if (rackMatch) {
            const rackEntry = this.rack.find((entry) =>
                this.tilesMatch(entry.tile, rackMatch),
            );
            this.hintedRack = [rackEntry];
            rackEntry.sprite.setTint(0xcfffd2);
            this.tweens.add({
                targets: rackEntry.display,
                scale: 1.05,
                duration: 280,
                yoyo: true,
                repeat: 2,
            });
        }

        pair.forEach((t) => {
            t.sprite.setTint(0xcfffd2);
            t.shine.setStrokeStyle(4, 0xf7bd4f);
            this.tweens.add({
                targets: t.c,
                scale: (this.boardTileScale || 1) * 1.1,
                duration: 280,
                yoyo: true,
                repeat: 2,
            });
        });
        this.time.delayedCall(1800, () => {
            if (token === this.hintToken) this.clearHint();
        });
    }
    clearHint() {
        this.hintToken = (this.hintToken || 0) + 1;
        (this.hinted || []).forEach((t) => {
            if (!t.removed && t !== this.selected) {
                t.sprite.clearTint();
                t.shine.setStrokeStyle(0, 0xffffff, 0);
                t.c.setScale(this.boardTileScale || 1);
            }
        });
        (this.hintedRack || []).forEach((entry) => {
            if (entry.display.active) {
                entry.sprite.clearTint();
                entry.display.setScale(0.92);
            }
        });
        this.hinted = [];
        this.hintedRack = [];
    }
    shuffle(free = false) {
        if (this.tiles.some((tile) => tile.flipping)) return;
        if (!free && this.shuffles <= 0) return this.toast("No shuffles left");
        if (this.remaining < 2) return;
        this.clearSelection();
        this.clearHint();
        if (!free) this.shuffles--;
        const alive = this.tiles.filter((t) => !t.removed),
            faces = Phaser.Utils.Array.Shuffle(alive.map((t) => t.face));
        alive.forEach((t, i) => {
            t.face = faces[i];
            this.draw(t);
            t.c.setAlpha(0);
        });
        this.tweens.add({
            targets: alive.map((t) => t.c),
            alpha: 1,
            duration: 280,
        });
        this.updateFree();
        this.ensureMove();
        this.hud();
        if (!free) this.toast("Tiles shuffled");
    }
    ensureMove() {
        this.updateFree();
        if (this.tiles.some((tile) => !tile.removed && tile.free && (tile.faceDown || tile.flipping))) return;
        let n = 0;
        while (!this.pairs().length && n++ < 40) {
            const a = this.tiles.filter((t) => !t.removed),
                f = Phaser.Utils.Array.Shuffle(a.map((t) => t.face));
            a.forEach((t, i) => {
                t.face = f[i];
                this.draw(t);
            });
        }
    }
    undo() {
        if (this.tiles.some((tile) => tile.flipping)) return;
        this.clearSelection();
        this.clearHint();

        if (this.rack.length) {
            const entry = this.rack.pop();
            const tile = entry.tile;
            tile.removed = false;
            tile.inRack = false;
            tile.c
                .setVisible(true)
                .setAlpha(1)
                .setScale((this.boardTileScale || 1) * 0.65)
                .setInteractive(
                    new Phaser.Geom.Rectangle(0, 0, 62, 82),
                    Phaser.Geom.Rectangle.Contains,
                );
            entry.display.destroy(true);
            this.tweens.add({
                targets: tile.c,
                scale: this.boardTileScale || 1,
                duration: 180,
                ease: "Back.easeOut",
            });
            this.reflowRack();
            this.updateFree();
            return;
        }

        const m = this.history.pop();
        if (!m) return this.toast("Nothing to undo");
        [m.a, m.b].forEach((t) => {
            t.removed = false;
            t.c
                .setVisible(true)
                .setAlpha(1)
                .setScale((this.boardTileScale || 1) * 0.65)
                .setInteractive(
                    new Phaser.Geom.Rectangle(0, 0, 62, 82),
                    Phaser.Geom.Rectangle.Contains,
                );
        });
        this.tweens.add({
            targets: [m.a.c, m.b.c],
            scale: this.boardTileScale || 1,
            duration: 180,
            ease: "Back.easeOut",
        });
        this.remaining += 2;
        this.matches--;
        this.score = Math.max(0, this.score - m.earned);
        this.updateFree();
        this.hud();
    }
    check() {
        if (!this.remaining) return this.win();
        if (this.tiles.some((tile) => !tile.removed && tile.free && (tile.faceDown || tile.flipping))) return;
        const hasRackMatch = this.tiles.some(
            (tile) =>
                !tile.removed &&
                tile.free &&
                !tile.faceDown &&
                this.rack.some((entry) => this.tilesMatch(entry.tile, tile)),
        );
        if (!this.pairs().length && !hasRackMatch)
            this.time.delayedCall(250, () => this.toast("No matches — use Shuffle"));
    }
    win() {
        const o = this.add.container().setDepth(2e4),
            shade = this.add
                .rectangle(-4096, -4096, 8192, 8192, 0x173c2a, 0.58)
                .setOrigin(0),
            card = this.add
                .rectangle(W / 2, 490, 500, 430, 0xfffbef)
                .setStrokeStyle(4, 0xe5ca79),
            star = this.add
                .text(W / 2, 350, "★", { fontSize: "90px", color: "#e7b84b" })
                .setOrigin(0.5),
            title = this.add
                .text(W / 2, 445, "Wonderful!", {
                    fontFamily: "Georgia",
                    fontSize: "46px",
                    color: "#315a3e",
                    fontStyle: "bold",
                })
                .setOrigin(0.5),
            copy = this.add
                .text(
                    W / 2,
                    520,
                    `Level ${this.level} complete\nScore  ${this.score.toLocaleString()}`,
                    {
                        fontFamily: "Arial",
                        fontSize: "24px",
                        color: "#617066",
                        align: "center",
                        lineSpacing: 12,
                    },
                )
                .setOrigin(0.5),
            next = this.add
                .rectangle(W / 2, 640, 310, 70, 0x4f845d)
                .setInteractive({ useHandCursor: true }),
            nt = this.add
                .text(W / 2, 640, "Next Level", {
                    fontFamily: "Arial",
                    fontSize: "26px",
                    color: "#fff",
                    fontStyle: "bold",
                })
                .setOrigin(0.5);
        o.add([shade, card, star, title, copy, next, nt])
            .setScale(0.75)
            .setAlpha(0);
        this.tweens.add({
            targets: o,
            scale: 1,
            alpha: 1,
            duration: 300,
            ease: "Back.easeOut",
        });
        next.on("pointerdown", () => {
            this.level++;
            localStorage.setItem("sereneLevel", this.level);
            o.destroy(true);
            this.startLevel();
        });
    }
    toggleMenu() {
        if (this.menu) return this.closeMenu();
        const c = this.add.container().setDepth(15e3),
            shade = this.add
                .rectangle(-4096, -4096, 8192, 8192, 0x18392a, 0.35)
                .setOrigin(0)
                .setInteractive(),
            panel = this.add
                .rectangle(590, 172, 310, 196, 0xfffbf1)
                .setStrokeStyle(2, 0xd5dfd2),
            title = this.add.text(474, 108, "Game", {
                fontSize: "21px",
                color: "#6c7a70",
                fontStyle: "bold",
            }),
            restart = this.add
                .text(474, 157, "↻   Restart level", {
                    fontSize: "24px",
                    color: "#315a3e",
                })
                .setInteractive({ useHandCursor: true }),
            resume = this.add
                .text(474, 211, "▶   Resume", { fontSize: "24px", color: "#315a3e" })
                .setInteractive({ useHandCursor: true });
        c.add([shade, panel, title, restart, resume]);
        this.menu = c;
        shade.on("pointerdown", () => this.closeMenu());
        resume.on("pointerdown", () => this.closeMenu());
        restart.on("pointerdown", () => {
            this.closeMenu();
            this.startLevel();
        });
    }
    closeMenu() {
        if (this.menu) {
            this.menu.destroy(true);
            this.menu = null;
        }
    }
    toast(msg) {
        if (this.toastBox) this.toastBox.destroy(true);
        const toastY = 820;
        const c = this.add.container(W / 2, toastY).setDepth(18e3),
            box = this.add.rectangle(
                0,
                0,
                Math.max(260, msg.length * 13 + 48),
                54,
                0x284d36,
                0.94,
            ),
            txt = this.add
                .text(0, 0, msg, {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    color: "#fff",
                })
                .setOrigin(0.5);
        c.add([box, txt]).setAlpha(0).setScale(0.9);
        this.toastBox = c;
        this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 130 });
        this.time.delayedCall(1300, () => {
            if (c.active)
                this.tweens.add({
                    targets: c,
                    alpha: 0,
                    y: toastY - 15,
                    duration: 180,
                    onComplete: () => c.destroy(true),
                });
        });
    }
    hud() {
        this.levelText.setText("Level " + this.level);
        this.scoreText.setText(this.score.toLocaleString());
        this.matchText.setText(`${this.matches}\nMATCHES`);
        this.shuffleBtn.count.setText(this.shuffles);
        this.hintBtn.count.setText(this.hints);
        this.undoBtn.count.setText("∞");
        this.shuffleBtn.badge.setFillStyle(this.shuffles ? 0xdb6958 : 0x9b9b92);
        this.hintBtn.badge.setFillStyle(this.hints ? 0xdb6958 : 0x9b9b92);
    }
}
