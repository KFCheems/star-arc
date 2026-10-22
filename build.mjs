// 星弧 STAR ARC — build.
//   node build.mjs            → dist/web, dist/wechat, dist/douyin
//   node build.mjs --watch    → rebuild on change
import * as esbuild from 'esbuild';
import { mkdir, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const root = process.cwd();
const dist = path.join(root, 'dist');

const GAME_JSON = {
  deviceOrientation: 'portrait',
  showStatusBar: false,
  networkTimeout: { request: 15000, connectSocket: 15000, uploadFile: 15000, downloadFile: 15000 },
};

const PROJECT_WECHAT = {
  description: '星弧 STAR ARC — 单指轨道街机',
  setting: { urlCheck: false, es6: true, enhance: true, minified: false, postcss: false },
  compileType: 'game',
  libVersion: '3.5.6',
  appid: 'touristappid',
  projectname: 'star-arc',
  simulatorType: 'game',
  condition: {},
};

const PROJECT_DOUYIN = {
  description: '星弧 STAR ARC — 单指轨道街机',
  setting: { urlCheck: false, es6: true, minified: false },
  compileType: 'game',
  appid: 'testappid',
  projectname: 'star-arc',
};

const ENTRY = `require('./game.js');\n`;

async function copyAssets(from, to) {
  if (!existsSync(from)) return;
  await mkdir(to, { recursive: true });
  for (const f of await readdir(from)) {
    await cp(path.join(from, f), path.join(to, f), { recursive: true });
  }
}

async function buildOnce() {
  await rm(dist, { recursive: true, force: true });

  const common = {
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    target: ['es2017'],
    platform: 'browser',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: '/* 星弧 STAR ARC · MIT · by KFCheems */' },
  };

  // ---------------- web
  const webDir = path.join(dist, 'web');
  await mkdir(webDir, { recursive: true });
  await esbuild.build({ ...common, outfile: path.join(webDir, 'game.js'), minify: true });
  await writeFile(
    path.join(webDir, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#04030C">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>星弧 STAR ARC</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#04030C;overflow:hidden;
    -webkit-tap-highlight-color:transparent;overscroll-behavior:none;}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}
  canvas{display:block;touch-action:none;max-height:100vh;}
  #rot{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
    color:#F8F3E7;font:500 15px/1.6 "PingFang SC",sans-serif;text-align:center;
    background:#04030C;z-index:9;}
</style>
</head>
<body>
<div id="wrap"><canvas id="c"></canvas></div>
<script>
  // Runs BEFORE the game boots: boot() reads the wrapper size, so the
  // letterbox has to be in place already. 0.62 is the widest a portrait
  // play field is allowed to look on a desktop or tablet screen.
  (function(){
    var wrap=document.getElementById('wrap');
    function fit(){
      var w=Math.min(window.innerWidth,720), h=window.innerHeight;
      var maxW=Math.round(h*0.62);
      if(w>maxW) w=maxW;
      wrap.style.width=w+'px'; wrap.style.height=h+'px';
    }
    fit();
    // Re-fit on real viewport changes only. Sizing the wrapper can itself fire
    // a resize event, so guard on the viewport actually having changed.
    var lastW=window.innerWidth, lastH=window.innerHeight;
    window.addEventListener('resize',function(){
      if(window.innerWidth===lastW && window.innerHeight===lastH) return;
      lastW=window.innerWidth; lastH=window.innerHeight;
      fit();
      // the canvas is sized at boot, so a genuine viewport change needs a reload
      setTimeout(function(){location.reload();},40);
    });
  })();
</script>
<script src="./game.js"></script>
</body>
</html>
`,
  );
  await writeFile(path.join(webDir, '.nojekyll'), '');

  // ---------------- mini game targets
  for (const [name, project] of [
    ['wechat', PROJECT_WECHAT],
    ['douyin', PROJECT_DOUYIN],
  ]) {
    const dir = path.join(dist, name);
    await mkdir(dir, { recursive: true });
    await esbuild.build({
      ...common,
      outfile: path.join(dir, 'game.js'),
      minify: true,
      // mini-game runtimes are stricter; no dynamic eval, keep it plain ES2017
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    await writeFile(path.join(dir, 'game.json'), JSON.stringify(GAME_JSON, null, 2));
    await writeFile(path.join(dir, 'project.config.json'), JSON.stringify(project, null, 2));
    await copyAssets(path.join(root, 'assets/store'), dir);
    // keep a second entry name some hosts look for
    await writeFile(path.join(dir, 'index.js'), ENTRY);
  }

  // ---------------- publish assets for store listing
  await copyAssets(path.join(root, 'assets/store'), path.join(dist, 'store'));

  const sizes = [];
  for (const t of ['web', 'wechat', 'douyin']) {
    const f = path.join(dist, t, 'game.js');
    if (existsSync(f)) {
      const { statSync } = await import('node:fs');
      sizes.push(`${t}: ${(statSync(f).size / 1024).toFixed(1)} KB`);
    }
  }
  console.log('build ok  ·  ' + sizes.join('  ·  '));
}

if (watch) {
  await buildOnce();
  const { watch: fsWatch } = await import('node:fs');
  let timer = null;
  fsWatch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildOnce().catch((e) => console.error(e.message)), 120);
  });
  console.log('watching src/ ...');
} else {
  await buildOnce();
}
