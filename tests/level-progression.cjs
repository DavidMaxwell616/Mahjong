const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({
    localStorage: { getItem: () => null },
    Phaser: {
        Scene: class {},
        Utils: { Array: { Shuffle: (items) => items.reverse() } },
        Math: { Between: (min) => min },
    },
});
const source = fs.readFileSync("js/GameScene.js", "utf8");
vm.runInContext(source.replace("export class GameScene", "class GameScene") +
    "\nglobalThis.GameScene = GameScene;", context);
const scene = new context.GameScene();
scene.textures = { exists: () => true };

for (let level = 1; level <= 100; level++) {
    scene.level = level;
    const settings = scene.levelSettings();
    const positions = scene.layout();
    const deck = scene.deck();
    assert.equal(settings.tileCount, Math.min(144, 24 + (level - 1) * 8));
    assert.equal(positions.length, settings.tileCount);
    assert.equal(deck.length, positions.length);
    assert.equal(new Set(positions.map((p) => `${p.l}:${p.c}:${p.r}`)).size, positions.length);
    assert.ok(positions.some((p) => p.l > 0), "Even the first level should have overlapping layers");
    for (const [index, p] of positions.entries()) {
        if (!p.l) continue;
        assert.ok(positions.slice(0, index).some((support) => support.l === p.l - 1 &&
            Math.abs(support.c - p.c) < 0.78 && Math.abs(support.r - p.r) < 0.78));
    }
    assert.ok(positions.some((p) => scene.sideOpen({ p }, positions.map((p) => ({ p })), -1)));
    const counts = new Map();
    for (const face of deck) {
        const identity = scene.matchIdentity(face);
        counts.set(identity, (counts.get(identity) || 0) + 1);
        if (face.s === "theme") {
            assert.ok(settings.themes.some((theme) => theme.key === face.theme));
            assert.ok(face.n >= 0 && face.n < 8);
        }
    }
    for (const count of counts.values()) assert.equal(count % 2, 0);
    assert.equal(deck.filter((face) => face.s === "theme").length, settings.themePairs * 2);
    assert.ok(settings.themePairs * 2 <= settings.tileCount / 4);
}

for (const [level, theme] of [[3, "toys"], [5, "pets"], [7, "food"], [9, "christmas"], [11, "nature"], [13, "music"]]) {
    scene.level = level;
    assert.ok(scene.deck().some((face) => face.theme === theme));
}
const toy = { face: { s: "theme", theme: "toys", n: 0 } };
assert.ok(scene.tilesMatch(toy, { face: { ...toy.face } }));
assert.ok(!scene.tilesMatch(toy, { face: { s: "theme", theme: "pets", n: 0 } }));
assert.ok(!scene.tilesMatch(toy, { face: { s: "char", n: 1 } }));

// Shuffle and undo redraw existing sprites; switching textures must preserve size.
const calls = [];
const sprite = {
    setTexture(...args) { calls.push(args); return this; },
    setDisplaySize(w, h) { assert.equal(w, 62); assert.equal(h, 82); return this; },
};
scene.draw({ face: toy.face, sprite, lowerEdge: sprite });
assert.deepEqual(calls, [["theme-toys", 0], ["theme-toys", 0]]);

// Freeing a covered tile does not reveal it; only a manual flip does.
const underneath = { p: { l: 0, c: 0, r: 0 }, face: toy.face, faceDown: true,
    sprite, lowerEdge: sprite, c: { setAlpha() {} } };
const covering = { p: { l: 1, c: 0.5, r: 0.5 }, c: { setAlpha() {} } };
scene.tiles = [underneath, covering];
scene.updateFree();
assert.equal(underneath.free, false);
assert.equal(underneath.faceDown, true);
scene.draw(underneath);
assert.equal(calls.at(-1)[0], "tile-back");
covering.removed = true;
scene.updateFree();
assert.equal(underneath.free, true);
assert.equal(underneath.faceDown, true);
const flipSteps = [];
scene.tweens = { killTweensOf() {}, add(step) { flipSteps.push(step); } };
scene.check = () => {};
scene.clearHint = () => {};
scene.click(underneath);
assert.equal(flipSteps.length, 1);
assert.equal(flipSteps[0].scaleX, 0);
assert.equal(underneath.faceDown, true);
assert.equal(underneath.flipping, true);
scene.click(underneath);
assert.equal(flipSteps.length, 1, "Repeated clicks cannot start another flip");
flipSteps[0].onComplete();
assert.equal(underneath.faceDown, false);
assert.equal(calls.at(-1)[0], "theme-toys");
assert.equal(flipSteps.length, 2);
assert.equal(flipSteps[1].scaleX, 1);
flipSteps[1].onComplete();
assert.equal(underneath.flipping, false);
assert.equal(scene.rack.length, 0, "Revealing a tile does not collect it");
covering.removed = false;
scene.updateFree();
assert.equal(underneath.faceDown, false);
const hiddenMatch = { ...underneath, faceDown: true, free: true, removed: false };
scene.tiles = [{ ...underneath, free: true }, hiddenMatch];
assert.equal(scene.pairs().length, 0, "Hints cannot match hidden faces");

// Auto-collect only after the flip finishes, using the rack's current contents.
scene.tiles = [hiddenMatch];
scene.rack = [{ tile: { face: { ...hiddenMatch.face } } }];
let collected = null;
scene.moveTileToRack = (tile, index) => { collected = { tile, index }; };
flipSteps.length = 0;
scene.flipTile(hiddenMatch);
assert.equal(collected, null);
flipSteps[0].onComplete();
assert.equal(collected, null);
flipSteps[1].onComplete();
assert.equal(collected.tile, hiddenMatch);
assert.equal(collected.index, 0);

hiddenMatch.faceDown = true;
collected = null;
flipSteps.length = 0;
scene.flipTile(hiddenMatch);
flipSteps[0].onComplete();
scene.rack = []; // The potential partner has disappeared during the animation.
flipSteps[1].onComplete();
assert.equal(collected, null);

// A missing image must fall back to classic pairs, without invalid theme frames.
scene.textures.exists = () => false;
assert.equal(scene.levelSettings().themePairs, 0);
assert.equal(scene.deck().length, scene.levelSettings().tileCount);
assert.ok(scene.deck().every((face) => face.s !== "theme"));
// Revive clears the rack without spending a shuffle or changing earned progress.
context.Phaser.Geom = { Rectangle: class { static Contains() {} } };
const reviveScene = new context.GameScene();
const killed = [];
const entries = Array.from({ length: 4 }, (_, n) => ({
    tile: { removed: true, inRack: true, face: { s: "char", n: n + 1 },
        c: {
            setVisible(value) { this.visible = value; return this; },
            setAlpha() { return this; }, setScale() { return this; },
            setInteractive() { this.interactive = true; return this; },
        },
    },
    display: { destroy() { this.destroyed = true; } },
}));
reviveScene.rack = [...entries];
reviveScene.tiles = entries.map((entry) => entry.tile);
reviveScene.remaining = 4;
reviveScene.shuffles = 0;
reviveScene.score = 800;
reviveScene.matches = 4;
reviveScene.rackFullDialog = { destroy() {} };
reviveScene.tweens = { killTweensOf: (target) => killed.push(target), add() {} };
for (const method of ["clearSelection", "clearHint", "draw", "updateFree", "ensureMove", "hud", "toast"])
    reviveScene[method] = () => {};
reviveScene.revive();
assert.equal(reviveScene.rack.length, 0);
assert.equal(reviveScene.rackFullDialog, null);
assert.equal(reviveScene.shuffles, 0);
assert.equal(reviveScene.remaining, 4);
assert.equal(reviveScene.score, 800);
assert.equal(reviveScene.matches, 4);
assert.equal(killed.length, 8);
for (const { tile, display } of entries) {
    assert.equal(tile.removed, false);
    assert.equal(tile.inRack, false);
    assert.equal(tile.c.visible, true);
    assert.equal(tile.c.interactive, true);
    assert.equal(display.destroyed, true);
}
// A pending rack match must not show a failure dialog before it resolves.
reviveScene.rack = [...entries];
entries[1].tile.face = { ...entries[0].tile.face };
reviveScene.showRackFullDialog(); // No UI stub: opening a dialog here would fail.
assert.equal(reviveScene.rackFullDialog, null);
reviveScene.rack = entries.slice(0, 3);
reviveScene.showRackFullDialog();
assert.equal(reviveScene.rackFullDialog, null);
// Selecting a match for the last flipped tile queues both, even with three slots occupied.
const pairScene = new context.GameScene();
const flippedTile = { face: { s: "char", n: 1 }, free: true };
const selectedTile = { face: { s: "char", n: 1 }, free: true };
pairScene.lastFlippedTile = flippedTile;
pairScene.rack = [{}, {}, {}];
const queued = [];
pairScene.moveTileToRack = (tile, index, defer) => {
    queued.push({ tile, index, defer });
    pairScene.rack.push({ tile });
};
assert.equal(pairScene.collectFlippedPair(selectedTile), true);
assert.equal(queued.length, 2);
assert.equal(queued[0].tile, flippedTile);
assert.equal(queued[0].defer, true);
assert.equal(queued[1].tile, selectedTile);
assert.equal(queued[1].index, 3);
assert.equal(pairScene.lastFlippedTile, null);
pairScene.rack = [];
pairScene.lastFlippedTile = flippedTile;
flippedTile.free = false;
assert.equal(pairScene.collectFlippedPair(selectedTile), false);
flippedTile.free = true;
assert.equal(pairScene.collectFlippedPair(flippedTile), false);
assert.equal(pairScene.collectFlippedPair({ face: { s: "char", n: 2 }, free: true }), false);
console.log("Progression, manual flips, pair collection, revive, and pending-rack checks passed.");
