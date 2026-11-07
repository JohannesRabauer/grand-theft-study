// Procedural 12x12 season icons for the clock HUD, drawn around the graphics object's origin (centre).
const ICONS = {
  autumn(g) { // orange leaf with a stem
    g.fillStyle(0xe8731c).fillEllipse(0, -1, 9, 11);
    g.fillStyle(0xb34a0e).fillRect(-1, 3, 2, 4);
    g.lineStyle(1, 0xb34a0e).lineBetween(0, -5, 0, 3);
  },
  winter(g) { // snowflake
    g.lineStyle(1.5, 0xd8f0ff);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.lineBetween(Math.cos(a) * -6, Math.sin(a) * -6, Math.cos(a) * 6, Math.sin(a) * 6);
    }
    g.fillStyle(0xffffff).fillCircle(0, 0, 1.5);
  },
  spring(g) { // pink flower
    g.fillStyle(0xff8fb8);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      g.fillCircle(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 2.6);
    }
    g.fillStyle(0xffe14d).fillCircle(0, 0, 2.2);
  },
  summer(g) { // sun with rays
    g.lineStyle(1.5, 0xffd23a);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.lineBetween(Math.cos(a) * 4.5, Math.sin(a) * 4.5, Math.cos(a) * 6.5, Math.sin(a) * 6.5);
    }
    g.fillStyle(0xffd23a).fillCircle(0, 0, 3.6);
  }
};

export function drawSeasonIcon(g, season) {
  g.clear();
  ICONS[season](g);
}
