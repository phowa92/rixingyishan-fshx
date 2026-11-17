import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const project=join(dirname(fileURLToPath(import.meta.url)),'..');

test('所有页面复用同一内容哈希资源且构建产物不含原始大图', () => {
  const output=mkdtempSync(join(tmpdir(),'fshx-build-'));
  try {
    const run=spawnSync(process.execPath,['scripts/build.mjs','--out',output],{cwd:project,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const pages=['index','submit','records','complete','admin'].map(name=>readFileSync(join(output,`${name}.html`),'utf8'));
    const cssPaths=pages.map(page=>page.match(/href="(\/style-[a-f0-9]+\.css)"/)?.[1]);
    const jsPaths=pages.map(page=>page.match(/src="(\/app-[a-f0-9]+\.js)"/)?.[1]);
    assert.equal(new Set(cssPaths).size,1);
    assert.equal(new Set(jsPaths).size,1);
    assert.ok(cssPaths[0]&&jsPaths[0]);
    const css=readFileSync(join(output,cssPaths[0].slice(1)),'utf8');
    assert.doesNotMatch(css,/@import\s+url\(['"]?https?:\/\//i,'首屏样式不应依赖外部字体服务');
    const hero=css.match(/url\(['"]?(\/hero-ocean-[a-f0-9]+\.jpg)['"]?\)/)?.[1];
    assert.ok(hero);
    assert.ok(existsSync(join(output,hero.slice(1))));
    assert.ok(readFileSync(join(output,hero.slice(1))).length<=200_000,'欢迎页图片应小于 0.2 MB');
    assert.ok(!existsSync(join(output,'hero-ocean.png')));
    const headers=readFileSync(join(output,'_headers'),'utf8');
    assert.ok(headers.includes(`${hero}
  Cache-Control: public, max-age=31536000, immutable`));
    assert.ok(headers.includes('Cache-Control: public, max-age=0, must-revalidate'));
  } finally { rmSync(output,{recursive:true,force:true}); }
});


test('CSS 或 JS 改版会更新对应地址并保留其他资源地址', async () => {
  const fixture=mkdtempSync(join(tmpdir(),'fshx-version-'));
  try {
    const {mkdirSync,copyFileSync,writeFileSync}=await import('node:fs');
    mkdirSync(join(fixture,'scripts'));mkdirSync(join(fixture,'public'));mkdirSync(join(fixture,'assets'));
    copyFileSync(join(project,'scripts/build.mjs'),join(fixture,'scripts/build.mjs'));
    writeFileSync(join(fixture,'package.json'),'{"type":"module"}');
    for(const page of ['index','submit','records','complete','admin'])copyFileSync(join(project,'public',page+'.html'),join(fixture,'public',page+'.html'));
    copyFileSync(join(project,'public/style.css'),join(fixture,'public/style.css'));
    copyFileSync(join(project,'public/app.js'),join(fixture,'public/app.js'));
    copyFileSync(join(project,'assets/hero-ocean.jpg'),join(fixture,'assets/hero-ocean.jpg'));
    const run=()=>{const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:fixture,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)};
    const before=run();
    writeFileSync(join(fixture,'public/style.css'),readFileSync(join(fixture,'public/style.css'),'utf8')+'\n/* next style version */');
    const cssChanged=run();
    assert.notEqual(cssChanged.cssFile,before.cssFile);
    assert.equal(cssChanged.jsFile,before.jsFile);
    assert.equal(cssChanged.heroFile,before.heroFile);
    writeFileSync(join(fixture,'public/app.js'),readFileSync(join(fixture,'public/app.js'),'utf8')+'\n// next script version');
    const jsChanged=run();
    assert.notEqual(jsChanged.jsFile,before.jsFile);
    assert.equal(jsChanged.cssFile,cssChanged.cssFile);
  } finally {rmSync(fixture,{recursive:true,force:true});}
});
