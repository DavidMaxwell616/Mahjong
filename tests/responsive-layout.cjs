const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({
    localStorage: { getItem: () => null },
    Phaser: { Scene: class {} },
});
vm.runInContext(fs.readFileSync('js/GameScene.js', 'utf8')
    .replace('export class GameScene', 'class GameScene') +
    '\nglobalThis.GameScene = GameScene;', context);
const scene = new context.GameScene();
for (const [w, h] of [[320, 568], [390, 844], [430, 932], [568, 320], [844, 390], [932, 430], [768, 1024]]) {
    const landscape = w > h;
    const zoom = landscape
        ? Math.min(Math.max(0.25, (w - 220) / 768), h / 900)
        : Math.min(w / 768, h / 1024);
    const top = 512 - h / zoom / 2;
    const bottom = 512 + h / zoom / 2;
    const left = 384 - w / zoom / 2 + (landscape ? 170 : 0);
    const right = 768 - left;
    for (const count of [24, 32, 64, 96, 144]) {
        scene.tiles = scene.layout(count).map(p => ({ p, c: {
            setPosition(x, y) { this.x = x; this.y = y; return this; },
            setScale(scale) { this.scale = scale; return this; },
            setDepth() { return this; },
        } }));
        scene.applyBoardLayout(landscape, top, bottom, left, right);
        for (const { c } of scene.tiles) {
            const s = c.scale;
            assert.ok(s > 0);
            assert.ok(c.x - 34.1 * s >= left, `${w}x${h}: left edge`);
            assert.ok(c.x + 39.6 * s <= right, `${w}x${h}: right edge`);
            assert.ok(c.y - 47.3 * s >= top + (landscape ? 112 : 210), `${w}x${h}: rack`);
            assert.ok(c.y + 53.9 * s <= bottom - (landscape ? 0 : 118), `${w}x${h}: controls`);
        }
        if (count === 24) assert.ok(scene.boardTileScale > (landscape ? 1.14 : 1));
        const before = scene.tiles.map(t => [t.c.x, t.c.y, t.c.scale]);
        scene.tiles[0].removed = true;
        scene.applyBoardLayout(landscape, top, bottom, left, right);
        assert.deepEqual(scene.tiles.map(t => [t.c.x, t.c.y, t.c.scale]), before);
    }
}
console.log('Responsive board bounds and stable spacing passed.');
