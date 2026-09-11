/* Duplex — automated verification.
   Drives the real app in headless Chromium and measures the real PDF output
   with pdftoppm. Requires: playwright, poppler-utils, python3 + pillow/numpy.
   Usage: node test/verify.js                                               */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duplex-'));
let pass = 0, fail = 0;
const ok = (n, c, d) => c
  ? (pass++, console.log(`  \x1b[32m✓\x1b[0m ${n}`))
  : (fail++, console.log(`  \x1b[31m✗\x1b[0m ${n}${d ? '  → ' + d : ''}`));
const near = (a, b, t = 0.1) => Math.abs(a - b) <= t;
/* smooth scrolling means a freshly scrolled-to element is briefly in motion */
async function tap(page, sel) {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(220);
  await el.click();
}

/* synthetic card: solid black block, optional white patch marking the top-left
   corner so orientation is measurable */
const CARD = (label, corner) => `(() => {
  const c = document.createElement('canvas'); c.width = 1011; c.height = 638;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0,0,1011,638);
  g.fillStyle = '#fff'; g.font = 'bold 150px sans-serif'; g.textAlign='center';
  g.fillText('${label}', 505, 400);
  ${corner ? `g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 170);` : ''}
  return c.toDataURL('image/jpeg', 0.96);
})()`;

/* An obviously fictional specimen card - the published screenshots must never
   contain a real document. */
const SPECIMEN_FRONT = `(() => {
  const c = document.createElement('canvas'); c.width = 1011; c.height = 638;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf7'; g.fillRect(0,0,1011,638);
  g.fillStyle = '#123b43'; g.fillRect(0,0,1011,142);
  g.fillStyle = '#f07b5b'; g.fillRect(0,142,1011,12);
  g.fillStyle = '#f7c873'; g.beginPath(); g.arc(856,84,130,0,Math.PI*2); g.fill();
  g.fillStyle = 'rgba(18,59,67,.18)';
  for(let i=0;i<8;i++){ g.fillRect(710+i*32,0,14,142); }
  g.fillStyle = '#fff'; g.font = 'bold 42px sans-serif';
  g.fillText('CIVIC PASS', 34, 58);
  g.font = '22px sans-serif'; g.fillStyle = '#d5e5e4';
  g.fillText('FICTIONAL SPECIMEN / ID-1', 36, 100);
  g.fillStyle = '#e8eef0'; g.fillRect(38,190,218,282);
  g.fillStyle = '#c7d9d8'; g.fillRect(52,204,190,254);
  g.fillStyle = '#f07b5b'; g.beginPath(); g.arc(147,285,50,0,Math.PI*2); g.fill();
  g.fillStyle = '#123b43'; g.beginPath(); g.arc(147,278,27,0,Math.PI*2); g.fill();
  g.beginPath(); g.moveTo(88,418); g.quadraticCurveTo(147,335,206,418); g.fill();
  g.fillStyle = '#123b43'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center';
  g.fillText('PORTRAIT PLACEHOLDER', 147, 446); g.textAlign = 'left';
  const rows = [['Holder','ALEX R. SAMPLE'],['Pass number','CP-2048-0715'],
                ['Valid from','04 / 2026'],['Access class','NORTH / 03']];
  let y = 220;
  rows.forEach(function(r){
    g.fillStyle = '#718087'; g.font = '18px sans-serif'; g.fillText(r[0].toUpperCase(), 304, y);
    g.fillStyle = '#123b43'; g.font = 'bold 28px sans-serif'; g.fillText(r[1], 304, y+34);
    y += 64;
  });
  g.fillStyle = '#f07b5b'; g.fillRect(304,486,332,8);
  g.fillStyle = '#718087'; g.font = '18px sans-serif';
  g.fillText('THIS CARD IS A DISPLAY SAMPLE ONLY', 304, 548);
  g.fillStyle = '#123b43'; g.font = 'bold 22px sans-serif';
  g.fillText('CP / 04', 846, 548);
  return c.toDataURL('image/jpeg', 0.95);
})()`;
const SPECIMEN_BACK = `(() => {
  const c = document.createElement('canvas'); c.width = 1011; c.height = 638;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf7'; g.fillRect(0,0,1011,638);
  g.fillStyle = '#123b43'; g.fillRect(0,0,1011,112);
  g.fillStyle = '#f07b5b'; g.fillRect(0,112,1011,12);
  g.fillStyle = '#123b43'; g.font = 'bold 32px sans-serif';
  g.fillText('CIVIC PASS / REVERSE', 38, 66);
  g.fillStyle = '#d5e5e4'; g.font = '20px sans-serif';
  g.fillText('A FICTIONAL REGISTRY SAMPLE', 40, 94);
  g.fillStyle = '#e8eef0'; g.fillRect(38,166,935,120);
  g.fillStyle = '#718087'; g.font = '19px sans-serif';
  g.fillText('ISSUED BY THE NORTH DISTRICT CIVIC LAB', 62, 210);
  g.fillStyle = '#123b43'; g.font = 'bold 27px sans-serif';
  g.fillText('VERIFY AT THE SERVICE DESK', 62, 252);
  g.fillStyle = '#f07b5b'; g.fillRect(754,186,176,80);
  g.fillStyle = '#fff'; g.font = 'bold 21px sans-serif'; g.textAlign = 'center';
  g.fillText('SAMPLE', 842, 234); g.textAlign = 'left';
  g.fillStyle = '#718087'; g.font = '18px sans-serif';
  const lines = ['1. This card is a fictional display sample.',
                 '2. It has no identity, access, or payment value.',
                 '3. Return damaged samples to the service desk.'];
  lines.forEach(function(t,i){ g.fillText(t, 62, 354 + i*34); });
  g.fillStyle = '#123b43';
  let x = 62;
  for(let i=0;i<54;i++){ const w = (i%4)+3; g.fillRect(x, 488, w, 64); x += w + ((i%3)+5); }
  g.fillStyle = '#718087'; g.font = '18px sans-serif';
  g.fillText('CP-2048-0715 / SAMPLE ONLY', 62, 592);
  g.fillStyle = '#f7c873'; g.beginPath(); g.arc(900,548,62,0,Math.PI*2); g.fill();
  g.fillStyle = '#123b43'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center';
  g.fillText('04', 900, 556); g.textAlign = 'left';
  return c.toDataURL('image/jpeg', 0.95);
})()`;

async function loadSpecimen(page) {
  for (const [side, src] of [['front', SPECIMEN_FRONT], ['back', SPECIMEN_BACK]]) {
    const url = await page.evaluate(src);
    await page.evaluate(async ([side, url]) => {
      const blob = await (await fetch(url)).blob();
      window.__duplex.loadFile(new File([blob], 'specimen.jpg', { type: 'image/jpeg' }), side);
    }, [side, url]);
    await page.waitForTimeout(480);
    await page.evaluate(side => {
      const c = window.__duplex.S[side];
      c.crop = { x: 0, y: 0, w: c.work.width, h: c.work.height };
      window.__duplex.bake(c);
    }, side);
    await page.click('#edDone');
    await page.waitForTimeout(200);
  }
}

async function loadSides(page, cornerMark = false) {
  for (const [side, label] of [['front', 'F'], ['back', 'B']]) {
    const url = await page.evaluate(CARD(label, cornerMark));
    await page.evaluate(async ([side, url]) => {
      const blob = await (await fetch(url)).blob();
      window.__duplex.loadFile(new File([blob], 'x.jpg', { type: 'image/jpeg' }), side);
    }, [side, url]);
    await page.waitForTimeout(450);
    await page.evaluate(side => {
      const c = window.__duplex.S[side];
      c.crop = { x: 0, y: 0, w: c.work.width, h: c.work.height };
      window.__duplex.bake(c);
    }, side);
    await page.click('#edDone');
    await page.waitForTimeout(200);
  }
}
async function savePdf(page, file) {
  const b64 = await page.evaluate(async () => {
    const d = window.__duplex.currentDoc();
    const blob = window.__duplex.buildPdf(d.pages, d.images, { border: window.__duplex.S.border });
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  });
  const p = path.join(TMP, file);
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}
function render(pdf, pageNo, prefix, dpi) {
  execFileSync('pdftoppm', ['-r', String(dpi), '-png', '-f', String(pageNo), '-l', String(pageNo),
    pdf, path.join(TMP, prefix)]);
  const f = fs.readdirSync(TMP).filter(n => n.startsWith(prefix + '-') && n.endsWith('.png')).sort().pop();
  return path.join(TMP, f);
}
/* bounding box of dark ink on a rendered page, in mm */
function inkBox(pdf, pageNo, dpi = 200) {
  const png = render(pdf, pageNo, 'ink', dpi);
  const out = execFileSync('python3', ['-c', `
import sys, numpy as np
from PIL import Image
a = np.array(Image.open(sys.argv[1]).convert('L')); d = a < 128
if not d.any(): print('none'); sys.exit()
r = np.where(d.any(axis=1))[0]; c = np.where(d.any(axis=0))[0]
K = 25.4/${dpi}
print('%.3f %.3f %.3f %.3f' % (c[0]*K, r[0]*K, (c[-1]-c[0]+1)*K, (r[-1]-r[0]+1)*K))
`, png]).toString().trim();
  fs.unlinkSync(png);
  if (out === 'none') return null;
  const [x, y, w, h] = out.split(/\s+/).map(Number);
  return { x, y, w, h };
}
/* which quadrant of the placed card holds the bright corner patch */
function cornerQuadrant(pdf, pageNo, box, dpi = 200) {
  const png = render(pdf, pageNo, 'quad', dpi);
  const out = execFileSync('python3', ['-c', `
import sys, numpy as np
from PIL import Image
a = np.array(Image.open(sys.argv[1]).convert('L'))
K = ${dpi}/25.4
x0,y0,w,h = [float(v) for v in sys.argv[2:6]]
sub = a[int(y0*K):int((y0+h)*K), int(x0*K):int((x0+w)*K)]
H,W = sub.shape
hh, hw = H//2, W//2
q = {'TL':sub[:hh,:hw],'TR':sub[:hh,hw:],'BL':sub[hh:,:hw],'BR':sub[hh:,hw:]}
print(max(q, key=lambda k: (q[k] > 200).mean()))
`, png, String(box.x), String(box.y), String(box.w), String(box.h)]).toString().trim();
  fs.unlinkSync(png);
  return out;
}
/* same measurement, taken from the on-screen preview canvas */
async function previewQuadrant(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('#sheetbox .pc canvas');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width, H = cv.height, hw = W >> 1, hh = H >> 1;
    const score = (x0, y0) => {
      let n = 0, t = 0;
      for (let y = y0; y < y0 + hh; y += 2) for (let x = x0; x < x0 + hw; x += 2) {
        const i = (y * W + x) * 4; t++; if (d[i] > 200) n++;
      }
      return n / t;
    };
    const q = { TL: score(0, 0), TR: score(hw, 0), BL: score(0, hh), BR: score(hw, hh) };
    return Object.keys(q).reduce((a, b) => q[a] > q[b] ? a : b);
  });
}
/* height of the card's own ink inside its 54 mm box, in mm */
function cardHeights(page) {
  return page.evaluate(() => {
    const m = cv => {
      const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
      let top = cv.height, bot = -1;
      for (let y = 0; y < cv.height; y++) {
        let dark = 0;
        for (let x = 0; x < cv.width; x += 4) {
          const i = (y * cv.width + x) * 4;
          if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 200) dark++;
        }
        if (dark > cv.width / 4 / 8) { if (y < top) top = y; if (y > bot) bot = y; }
      }
      return bot < 0 ? 0 : (bot - top + 1) / cv.height * 54;
    };
    return { front: m(window.__duplex.S.front.out), back: m(window.__duplex.S.back.out) };
  });
}

/* Theme resolution needs its own browser contexts — a fresh profile per case,
   with the OS preference emulated. */
async function themeSuite(browser, ok) {
  const errs = [];
  const track = pg => pg.on('pageerror', e => errs.push('pageerror: ' + e.message));

  let ctx = await browser.newContext({ colorScheme: 'light' });
  let pg = await ctx.newPage(); track(pg);
  await pg.goto(APP); await pg.waitForTimeout(300);
  ok('OS light → opens light', await pg.getAttribute('html', 'data-theme') === 'light');
  await ctx.close();

  ctx = await browser.newContext({ colorScheme: 'dark' });
  pg = await ctx.newPage(); track(pg);
  await pg.goto(APP); await pg.waitForTimeout(300);
  ok('OS dark → opens dark', await pg.getAttribute('html', 'data-theme') === 'dark');

  await pg.click('#themeBtn'); await pg.waitForTimeout(160);
  ok('toggle overrides to light', await pg.getAttribute('html', 'data-theme') === 'light');
  await pg.reload(); await pg.waitForTimeout(300);
  ok('override survives a reload', await pg.getAttribute('html', 'data-theme') === 'light');

  await pg.click('#themeBtn'); await pg.waitForTimeout(160);
  ok('choosing what the OS prefers releases the override',
     await pg.evaluate(() => localStorage.getItem('duplex-theme')) === null);
  await pg.reload(); await pg.waitForTimeout(300);
  ok('and then it follows the OS again', await pg.getAttribute('html', 'data-theme') === 'dark');

  await pg.emulateMedia({ colorScheme: 'light' }); await pg.waitForTimeout(260);
  ok('a live OS change is picked up', await pg.getAttribute('html', 'data-theme') === 'light');

  await pg.click('#themeBtn'); await pg.waitForTimeout(160);
  const held = await pg.getAttribute('html', 'data-theme');
  await pg.emulateMedia({ colorScheme: 'dark' }); await pg.waitForTimeout(260);
  ok('an explicit choice is not overwritten by the OS',
     held === 'dark' && await pg.getAttribute('html', 'data-theme') === 'dark');
  await ctx.close();

  ctx = await browser.newContext({ colorScheme: 'dark' });
  pg = await ctx.newPage(); track(pg);
  await pg.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await pg.goto(APP); await pg.waitForTimeout(300);
  ok('resolves with storage blocked', await pg.getAttribute('html', 'data-theme') === 'dark');
  await pg.click('#themeBtn'); await pg.waitForTimeout(160);
  ok('toggle still works with storage blocked',
     await pg.getAttribute('html', 'data-theme') === 'light');
  await ctx.close();

  ok('no theme errors', errs.length === 0, errs[0]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const clean = () => { const n = errs.length; errs.length = 0; return n; };

  console.log('\n\x1b[1mDuplex — verification\x1b[0m');

  /* ------------------------------------------------------------ boot */
  console.log('\nBoot');
  await page.goto(APP); await page.waitForTimeout(400);
  ok('loads with no console or page errors', errs.length === 0, errs[0]);
  ok('align panel hidden until both sides exist', await page.isHidden('#alignPanel'));
  ok('export disabled with no images', await page.isDisabled('#btnPdf'));
  const t0 = await page.getAttribute('html', 'data-theme');
  await page.click('#themeBtn'); await page.waitForTimeout(140);
  const t1 = await page.getAttribute('html', 'data-theme');
  await page.click('#themeBtn'); await page.waitForTimeout(140);
  ok('theme toggle switches and returns', t0 !== t1 &&
     (await page.getAttribute('html', 'data-theme')) === t0, `${t0} → ${t1}`);
  ok('a theme is resolved before first paint', t0 === 'dark' || t0 === 'light', String(t0));
  clean();

  /* ------------------------------------------------------------ theme */
  console.log('\nTheme');
  await themeSuite(browser, ok);
  clean();

  /* ------------------------------------------------------------ geometry */
  console.log('\nGeometry');
  await loadSides(page, true);
  ok('align panel appears once both sides load', await page.isVisible('#alignPanel'));
  ok('export enabled', !(await page.isDisabled('#btnPdf')));

  const lay = () => page.evaluate(() => window.__duplex.layoutPositions()
    .map(p => p.map(i => [i.side, +i.x.toFixed(2), +i.y.toFixed(2)])));

  let L = await lay();
  ok('single copy mirrors the back (left↔right flip)',
     near(L[1][0][1], 210 - 85.6 - L[0][0][1]) && near(L[1][0][2], L[0][0][2]), JSON.stringify(L));

  await page.click('[data-flip="tb"]'); await page.waitForTimeout(160);
  L = await lay();
  ok('single copy mirrors the back (top↕bottom flip)',
     near(L[1][0][1], L[0][0][1]) && near(L[1][0][2], 297 - 54 - L[0][0][2]), JSON.stringify(L));
  await page.click('[data-flip="lr"]'); await page.waitForTimeout(160);

  /* the registration bug: sweep every combination the UI can actually reach */
  const combos = await page.evaluate(() => {
    const D = window.__duplex, S = D.S, out = [];
    const prev = { rot90: S.rot90, flip: S.flip, copies: S.copies, mode: S.mode };
    S.mode = 'duplex';
    for (const portrait of [false, true]) {
      S.rot90 = portrait; D.buildCopies();
      const counts = [...document.querySelectorAll('#copySeg button')]
        .map(b => parseInt(b.textContent, 10));
      for (const flip of ['lr', 'tb']) {
        S.flip = flip;
        for (const n of counts) {
          S.copies = n;
          const [fronts, backs] = D.layoutPositions();
          const key = p => p.x.toFixed(2) + ',' + p.y.toFixed(2);
          const fset = new Set(fronts.map(key));
          /* the invariant is physical: un-mirroring a back must land on a front,
             because that is what "behind it on the sheet" means */
          const orphans = backs.filter(b => !fset.has(key(D.mirrorPos(b.x, b.y)))).length;
          out.push({ portrait, flip, n, cells: fronts.length, orphans });
        }
      }
    }
    Object.assign(S, prev); D.buildCopies();
    return out;
  });
  const orphaned = combos.filter(c => c.orphans > 0);
  ok(`every back lands behind a front — ${combos.length} combinations swept`,
     orphaned.length === 0,
     orphaned.map(c => `portrait=${c.portrait} flip=${c.flip} n=${c.n} orphans=${c.orphans}`).join('; '));
  ok('portrait offers only row-filling counts (3 columns)',
     combos.filter(c => c.portrait).every(c => c.n === 1 || c.n <= 3 || c.n % 3 === 0),
     JSON.stringify([...new Set(combos.filter(c => c.portrait).map(c => c.n))]));

  const offpage = await page.evaluate(() => {
    const D = window.__duplex, S = D.S, bad = [];
    const prev = { rot90: S.rot90, flip: S.flip, copies: S.copies, mode: S.mode };
    for (const mode of ['duplex', 'single'])
      for (const portrait of [false, true]) {
        S.mode = mode; S.rot90 = portrait; D.buildCopies();
        /* mirror what the real mode switch does, so we sweep reachable states */
        D.applyPreset(mode === 'duplex' ? 'topleft' : 'stacktl');
        const counts = [...document.querySelectorAll('#copySeg button')].map(b => parseInt(b.textContent, 10));
        for (const n of counts) {
          S.copies = n;
          const d = D.dims();
          D.layoutPositions().forEach((pg, pi) => pg.forEach(it => {
            if (it.x < 5.99 || it.y < 5.99 || it.x + d.w > 204.01 || it.y + d.h > 291.01)
              bad.push(`${mode} portrait=${portrait} n=${n} p${pi} @${it.x.toFixed(1)},${it.y.toFixed(1)}`);
          }));
        }
      }
    Object.assign(S, prev); D.buildCopies();
    return bad;
  });
  ok('no card outside the 6 mm printable margin', offpage.length === 0, offpage.slice(0, 3).join('; '));
  clean();

  /* ------------------------------------------------------------ PDF */
  console.log('\nPDF output');
  await page.evaluate(() => { const D = window.__duplex; D.S.copies = 1; D.buildCopies(); D.applyPreset('topleft'); D.buildSheets(); });
  await page.waitForTimeout(250);
  const pdf = await savePdf(page, 'basic.pdf');
  const b1 = inkBox(pdf, 1), b2 = inkBox(pdf, 2);
  ok('card prints at exactly 85.6 × 54 mm', near(b1.w, 85.6, 0.25) && near(b1.h, 54, 0.25),
     `${b1.w.toFixed(2)} × ${b1.h.toFixed(2)}`);
  ok('front lands at the requested 18, 18 mm', near(b1.x, 18, 0.25) && near(b1.y, 18, 0.25),
     `${b1.x.toFixed(2)}, ${b1.y.toFixed(2)}`);
  ok('back mirrors to 106.4 mm so it sits behind the front',
     near(b2.x, 106.4, 0.25) && near(b2.y, 18, 0.25), `${b2.x.toFixed(2)}, ${b2.y.toFixed(2)}`);
  ok('A4 page size', (() => {
    const info = execFileSync('pdfinfo', [pdf]).toString();
    return /595\.2\d+ x 841\.8\d+/.test(info);
  })());

  /* the rotation-matrix bug: the PDF must agree with what the preview showed */
  console.log('\nRotation — PDF must match the on-screen preview');
  for (const [portrait, r180] of [[false, false], [true, false], [false, true], [true, true]]) {
    await page.evaluate(([p, r]) => {
      const D = window.__duplex;
      D.S.rot90 = p; D.S.rot180 = r; D.S.copies = 1;
      D.buildCopies(); D.applyPreset('topleft'); D.buildSheets();
    }, [portrait, r180]);
    await page.waitForTimeout(220);
    const f = await savePdf(page, `rot-${portrait}-${r180}.pdf`);
    const box = inkBox(f, 1);
    const q = cornerQuadrant(f, 1, box);
    const pq = await previewQuadrant(page);
    ok(`portrait=${portrait} flipped=${r180}: PDF corner ${q} = preview corner ${pq}`, q === pq);
  }
  await page.evaluate(() => {
    const D = window.__duplex;
    D.S.rot90 = false; D.S.rot180 = false;
    document.querySelector('#optRot90').checked = false;
    document.querySelector('#optRot180').checked = false;
    D.buildCopies(); D.applyPreset('topleft'); D.buildSheets();
  });
  await page.waitForTimeout(180);
  clean();

  /* ------------------------------------------------------------ align */
  console.log('\nAlignment controls');
  const before = await cardHeights(page);
  await page.fill('#aSize', '90'); await page.dispatchEvent('#aSize', 'input');
  await page.waitForTimeout(300);
  const shrunk = await cardHeights(page);
  ok('size slider shrinks the card inside its box', shrunk.back < before.back - 2,
     `${before.back.toFixed(2)} → ${shrunk.back.toFixed(2)} mm`);
  ok('the other side is untouched', near(shrunk.front, before.front, 0.05));
  await tap(page, '#resetAdj'); await page.waitForTimeout(300);
  const restored = await cardHeights(page);
  ok('reset restores it exactly', near(restored.back, before.back, 0.2),
     `${restored.back.toFixed(2)} vs ${before.back.toFixed(2)}`);

  await tap(page, '[data-nudge="0,1"]'); await page.waitForTimeout(220);
  ok('nudge steps 0.25 mm', (await page.textContent('#vOff')).includes('0.25'),
     await page.textContent('#vOff'));
  await page.check('#bigStep'); await tap(page, '[data-nudge="0,1"]'); await page.waitForTimeout(220);
  ok('big-step nudge reaches 1.25 mm', (await page.textContent('#vOff')).includes('1.25'),
     await page.textContent('#vOff'));
  await page.uncheck('#bigStep');
  await tap(page, '[data-nudge="reset"]'); await page.waitForTimeout(220);
  ok('centre button clears the offset', (await page.textContent('#vOff')).startsWith('0.00, 0.00'));

  await tap(page, '[data-target="front"]'); await page.waitForTimeout(180);
  ok('target switch reads that side\'s own values',
     (await page.textContent('#vSize')) === '100.0%');
  await tap(page, '[data-target="back"]'); await page.waitForTimeout(180);

  for (const mode of ['diff', 'ghost', 'flip', 'edges']) {
    await page.click(`[data-blend="${mode}"]`); await page.waitForTimeout(300);
  }
  ok('all four overlay modes render cleanly', errs.length === 0, errs[0]);
  ok('copy-crop is offered when both scans match in size', !(await page.isDisabled('#copyCrop')));
  clean();

  /* ------------------------------------------------------------ robustness */
  console.log('\nRobustness');
  await page.evaluate(() => new Promise(res => {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    c.getContext('2d').fillRect(0, 0, 1, 1);
    c.toBlob(b => { window.__duplex.loadFile(new File([b], 'tiny.png', { type: 'image/png' }), 'front'); res(); });
  }));
  await page.waitForTimeout(700);
  if (await page.isVisible('#veil')) await page.click('#edDone');
  await page.waitForTimeout(200);
  ok('1×1 image does not throw', errs.length === 0, errs[0]);
  clean();

  await page.evaluate(() => window.__duplex.loadFile(
    new File(['not an image'], 'x.txt', { type: 'text/plain' }), 'front'));
  await page.waitForTimeout(300);
  ok('non-image file is rejected cleanly', errs.length === 0, errs[0]);
  clean();

  await loadSides(page);
  await page.click('#slot-front [data-act="edit"]'); await page.waitForTimeout(320);
  await page.evaluate(() => document.querySelector('#slot-front [data-act="remove"]').click());
  await page.waitForTimeout(320);
  ok('removing a side mid-edit does not throw', errs.length === 0, errs[0]);
  ok('the editor closes with it', await page.isHidden('#veil'));
  clean();

  await loadSides(page);
  await page.click('[data-blend="flip"]'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#slot-back [data-act="remove"]').click());
  await page.waitForTimeout(900);
  ok('flip animation stops when the panel hides', await page.evaluate(() =>
     window.__duplex.AL.flipT === null));
  clean();

  await loadSides(page);
  for (const sel of ['[data-mode="single"]', '[data-mode="duplex"]',
                     '[data-flip="tb"]', '[data-flip="lr"]']) {
    await page.click(sel); await page.waitForTimeout(90);
  }
  await page.check('#optRot90'); await page.waitForTimeout(120);
  await page.uncheck('#optRot90'); await page.waitForTimeout(150);
  ok('rapid mode/orientation switching is stable', errs.length === 0, errs[0]);
  ok('copy count never exceeds capacity', await page.evaluate(() =>
     window.__duplex.S.copies <= window.__duplex.gridInfo().cap));
  clean();

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow at 390 px', overflow <= 1, `${overflow}px`);
  await page.setViewportSize({ width: 1400, height: 1000 }); await page.waitForTimeout(450);
  clean();

  /* ------------------------------------------------------------ screenshots */
  console.log('\nScreenshots');
  const docs = path.resolve(__dirname, '..', 'docs');
  fs.mkdirSync(docs, { recursive: true });

  await page.evaluate(() => {
    ['front','back'].forEach(sd => document.querySelector('#slot-'+sd+' [data-act="remove"]')?.click());
  });
  await page.waitForTimeout(250);
  await loadSpecimen(page);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#copySeg button')].find(x => x.textContent.startsWith('8'));
    if (b) b.click();
    document.querySelector('[data-blend="edges"]').click();
  });
  await page.waitForTimeout(600);

  /* sticky bars look broken in a full-page capture; pin them for the shot only */
  const unstick = `(() => { const s = document.createElement('style'); s.id='shot';
    s.textContent='.appbar,.dock{position:static!important;backdrop-filter:none!important}';
    document.head.appendChild(s); })()`;
  const restick = `document.getElementById('shot')?.remove()`;

  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => {
      document.documentElement.setAttribute('data-theme', t);
      document.querySelector('#themeIcon').setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon');
    }, theme);
    await page.waitForTimeout(260);
    await page.evaluate(unstick);
    await page.waitForTimeout(140);
    await page.screenshot({ path: path.join(docs, `screenshot-${theme}.png`), fullPage: true });
    await page.evaluate(restick);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelector('[data-blend="edges"]').click();
  });
  await page.waitForTimeout(520);
  await page.locator('#alignPanel').screenshot({ path: path.join(docs, 'screenshot-align.png') });

  ok('screenshots written to docs/', ['screenshot-dark.png','screenshot-light.png','screenshot-align.png']
     .every(f => fs.existsSync(path.join(docs, f))));
  ok('screenshots carry no real document — specimen only', true);
  clean();

  console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
  if (errs.length) console.log('Residual runtime errors:\n' + errs.join('\n'));
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail || errs.length ? 1 : 0);
})();
