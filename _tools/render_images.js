/* Renders the share image and the icons from the logo files, so they can be
   remade after a logo or headline change.

     og.jpg               1200 by 630 share image: masthead, headline, the
                          three free promises, the mark on a sand panel
     icon-32.png          tab icon, from favicon.svg
     apple-touch-icon.png 180 square, coral mark on deep ink
     icon-512.png         512 square, the same (also the schema logo)
     favicon.ico          16, 32 and 48 pixel copies of favicon.svg

   Needs Google Chrome and `npm install` in _tools once.
   Run:  node _tools/render_images.js            writes into assets/img and the root
         node _tools/render_images.js --out DIR  writes everything into DIR to compare first
   After a change, bump the ?v= on the icon links in every page's head so
   browsers fetch the new icon. */
"use strict";
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : null;
const dest = (rel) => OUT ? path.join(OUT, path.basename(rel)) : path.join(ROOT, rel);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/<\?xml[^>]*>/, "");
const font = (file) => "data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, "assets/fonts", file)).toString("base64");

// The site's own font files, inlined so the render needs no network.
const FONTS = `
  @font-face { font-family: "Source Serif 4"; font-weight: 400 700; src: url(${font("source-serif-4-normal-latin.woff2")}) format("woff2"); }
  @font-face { font-family: "Source Serif 4"; font-style: italic; font-weight: 400 600; src: url(${font("source-serif-4-italic-latin.woff2")}) format("woff2"); }
  @font-face { font-family: "Source Sans 3"; font-weight: 400 700; src: url(${font("source-sans-3-normal-latin.woff2")}) format("woff2"); }`;

function ogPage() {
  const logo = read("assets/img/brand/logo-horizontal-on-light.svg");
  const icon = read("assets/img/brand/icon-deep.svg");
  return `<!doctype html><html><head><style>${FONTS}
    *{box-sizing:border-box}
    body{margin:0;width:1200px;height:630px;background:#fbf8f2;color:#0d2230;font-family:"Source Sans 3",sans-serif;overflow:hidden;position:relative}
    .top{position:absolute;left:0;right:0;top:0;height:10px;background:#0d2230}
    .brand{position:absolute;left:72px;top:56px;width:330px}
    .brand svg{display:block;width:100%;height:auto}
    .rule{position:absolute;left:72px;right:72px;top:120px;border-top:1px solid #0d2230;border-bottom:1px solid #0d2230;height:4px}
    .eyebrow{position:absolute;left:72px;top:168px;margin:0;font-size:22px;font-weight:600;color:#b23c1c}
    h1{position:absolute;left:72px;top:204px;width:690px;margin:0;font:600 66px/1.08 "Source Serif 4",serif;letter-spacing:-.01em}
    .assure{position:absolute;left:72px;bottom:162px;margin:0;padding:0;list-style:none;display:flex;gap:34px;font-size:24px;font-weight:600;color:#33444d}
    .assure li{display:flex;align-items:center;gap:12px}
    .assure li:before{content:"";width:10px;height:10px;background:#d4512f;transform:rotate(45deg)}
    .foot{position:absolute;left:72px;right:72px;top:506px;border-top:1px solid #cfc5b0;padding-top:22px;display:flex;justify-content:space-between;font-size:22px;color:#4a5a63}
    .foot b{color:#0d2230;font-weight:600}
    .panel{position:absolute;right:72px;top:168px;width:270px;height:300px;background:#efe7d6;border-top:6px solid #0d2230;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
    .panel .mark{width:120px;height:120px}
    .panel .mark svg{width:100%;height:100%}
    .panel p{margin:0;text-align:center;font:italic 400 20px/1.35 "Source Serif 4",serif;color:#33444d;padding:0 30px}
  </style></head><body>
  <div class="top"></div>
  <div class="brand">${logo}</div>
  <div class="rule"></div>
  <p class="eyebrow">A free public reference for Hawaii rental owners</p>
  <h1>What your Hawaii rental owes, and when it's due.</h1>
  <ul class="assure"><li>Free to use</li><li>No email or account</li><li>Nothing you enter is saved</li></ul>
  <div class="foot"><b>hawaiirentaltax.com</b><span>Based on HRS chapters 237 and 237D</span></div>
  <div class="panel"><div class="mark">${icon}</div><p>Every return and due date for the year ahead</p></div>
  </body></html>`;
}

// An .ico holding PNG images, one directory entry per size.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p[1])]);
}

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  async function shot(w, h, html, opts) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const buf = await p.screenshot(Object.assign({ type: "png" }, opts || {}));
    await p.close();
    return Buffer.from(buf);
  }
  const fav = read("favicon.svg");
  const coral = read("assets/img/brand/icon-coral.svg");
  const favAt = (n) => `<body style="margin:0">${fav.replace("<svg ", `<svg width="${n}" height="${n}" `)}</body>`;

  fs.writeFileSync(dest("assets/img/og.jpg"), await shot(1200, 630, ogPage(), { type: "jpeg", quality: 88 }));
  fs.writeFileSync(dest("assets/img/icon-32.png"), await shot(32, 32, favAt(32), { omitBackground: true }));
  for (const [size, file] of [[180, "apple-touch-icon.png"], [512, "icon-512.png"]]) {
    const inner = Math.round(size * 0.66);
    fs.writeFileSync(dest("assets/img/" + file), await shot(size, size,
      `<body style="margin:0;width:${size}px;height:${size}px;background:#0d2230;display:grid;place-items:center"><div style="width:${inner}px;height:${inner}px">${coral.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body>`));
  }
  const sizes = [];
  for (const n of [16, 32, 48]) sizes.push([n, await shot(n, n, favAt(n), { omitBackground: true })]);
  fs.writeFileSync(dest("favicon.ico"), ico(sizes));
  await browser.close();
  console.log(`Rendered og.jpg, icon-32.png, apple-touch-icon.png, icon-512.png and favicon.ico${OUT ? " into " + OUT : ""}`);
})().catch(e => { console.error(e); process.exit(1); });
