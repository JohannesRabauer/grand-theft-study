// Procedural art of the Sport minigame's gym, in the hi-res style of scenes/HiResArt.js: every texture is drawn on a grid
// `scale` times finer (2 on Medium and High, 1 on Low) and shown at 1/scale, so it stays crisp on the UI camera. Made
// once per page (the textures live in the global manager); the tile textures repeat as TileSprites.
const PARQUET = ['#c8944e', '#bc8744', '#d19c58'];

function make(scene, scale, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, Math.round(w * scale), Math.round(h * scale));
  const c = tex.getContext();
  c.scale(scale, scale);
  draw(c, (col, x, y, rw, rh) => { c.fillStyle = col; c.fillRect(x, y, rw, rh); });
  tex.refresh();
}

// Seeded jitter so the tiles do not look like a grid.
function noise(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function makeSportArt(scene, scale, { laneW, beamWidth }) {
  if (scene.textures.exists('sport-floor')) return;
  const mk = (key, w, h, draw) => make(scene, scale, key, w, h, draw);

  mk('sport-floor', 32, 32, (c, px) => {
    const r = noise(7);
    for (let i = 0; i < 4; i++) {
      px(PARQUET[i % 3], i * 8, 0, 8, 32);
      px('#8a5d2c', i * 8, 0, 1, 32);
      const joint = Math.floor(r() * 24) + 4;
      px('#8a5d2c', i * 8, joint, 8, 1);
      px('#d9a965', i * 8 + 3, joint + 4, 2, 1);
    }
  });

  mk('sport-track', 16, 32, (c, px) => {
    const r = noise(3);
    px('#b5432f', 0, 0, 16, 32);
    for (let i = 0; i < 26; i++) px(r() < 0.5 ? '#c4533b' : '#a23a29', Math.floor(r() * 16), Math.floor(r() * 32), 1, 1);
    px('#9a3626', 0, 31, 16, 1);
  });

  mk('sport-mat', 16, 16, (c, px) => {
    px('#3f6fbf', 0, 0, 16, 16);
    px('#5b88d6', 1, 1, 14, 1);
    px('#2f5599', 0, 15, 16, 1);
    px('#2f5599', 15, 0, 1, 16);
    px('#6d97de', 4, 5, 1, 1);
    px('#6d97de', 11, 10, 1, 1);
  });

  mk('sport-bars', 28, 32, (c, px) => {
    px('#3d4b61', 0, 0, 28, 32);
    px('#2c3649', 27, 0, 1, 32);
    for (const x of [3, 23]) { px('#e3b86b', x, 0, 3, 32); px('#9c7637', x + 2, 0, 1, 32); }
    for (let y = 2; y < 32; y += 8) { px('#f4d58f', 3, y, 23, 2); px('#9c7637', 3, y + 2, 23, 1); }
  });

  mk('sport-beam', beamWidth, 16, (c, px) => {
    px('#7a5328', 0, 0, beamWidth, 16);
    px('#d9a45a', 2, 0, beamWidth - 4, 16);
    px('#e8b970', 4, 0, 2, 16);
    px('#c28f47', beamWidth / 2 - 1, 3, 1, 9);
    px('#c28f47', beamWidth / 2 + 5, 8, 1, 7);
  });

  mk('sport-checker', 8, 8, (c, px) => {
    px('#f4f4f4', 0, 0, 8, 8);
    px('#202028', 0, 0, 4, 4);
    px('#202028', 4, 4, 4, 4);
  });

  mk('sport-cone', 14, 18, (c, px) => {
    px('rgba(0,0,0,0.25)', 1, 15, 12, 3);
    px('#e8590c', 5, 2, 4, 3);
    px('#ff7a1f', 4, 5, 6, 3);
    px('#f6f6f6', 4, 8, 6, 2);
    px('#e8590c', 3, 10, 8, 3);
    px('#c24407', 1, 13, 12, 2);
  });
  mk('sport-cone-down', 18, 12, (c, px) => {
    px('rgba(0,0,0,0.25)', 1, 8, 16, 3);
    px('#ff7a1f', 2, 3, 6, 6);
    px('#f6f6f6', 8, 3, 2, 6);
    px('#e8590c', 10, 2, 6, 8);
    px('#c24407', 14, 2, 2, 8);
  });

  mk('sport-hurdle', laneW, 16, (c, px) => {
    px('rgba(0,0,0,0.22)', 6, 12, laneW - 12, 4);
    for (const x of [6, laneW - 9]) { px('#d8d8e0', x, 2, 3, 13); px('#8b8b99', x + 2, 2, 1, 13); }
    for (let x = 6; x < laneW - 6; x += 10) px(Math.floor(x / 10) % 2 ? '#f6f6f6' : '#e03b3b', x, 3, Math.min(10, laneW - 6 - x), 4);
    px('#8b2020', 6, 7, laneW - 12, 1);
  });
  mk('sport-hurdle-down', laneW, 16, (c, px) => {
    px('rgba(0,0,0,0.22)', 4, 11, laneW - 8, 4);
    px('#d8d8e0', 4, 9, 3, 4);
    px('#d8d8e0', laneW - 9, 12, 3, 3);
    for (let x = 10; x < laneW - 10; x += 10) px(Math.floor(x / 10) % 2 ? '#f6f6f6' : '#e03b3b', x, 10, Math.min(10, laneW - 10 - x), 4);
  });

  const flag = (key, col, dark) => mk(key, 12, 26, (c, px) => {
    px('rgba(0,0,0,0.25)', 1, 23, 10, 3);
    px('#d8d8e0', 2, 2, 2, 22);
    px(col, 4, 3, 7, 3);
    px(col, 4, 6, 5, 3);
    px(dark, 4, 9, 3, 2);
  });
  flag('sport-flag', '#ffd23f', '#c9a21a');
  flag('sport-flag-done', '#5fd16a', '#2f8f3a');

  mk('sport-shadow', 16, 6, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(8, 3, 7, 2.5, 0, 0, Math.PI * 2);
    c.fill();
  });
}
