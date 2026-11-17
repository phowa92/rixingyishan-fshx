import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const project=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(project,'public');
const outArg=process.argv.indexOf('--out');
if (outArg>=0 && !process.argv[outArg+1]) throw Error('缺少构建目录');
const output=outArg<0?join(project,'dist'):resolve(process.argv[outArg+1]);
const temporary=relative(resolve(tmpdir()),output);
const safeTestOutput=outArg>=0 && temporary && !temporary.startsWith('..') && !isAbsolute(temporary) && basename(output).startsWith('fshx-build-');
if (output!==join(project,'dist') && !safeTestOutput) throw Error('无效构建目录');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,12);
const hero=readFileSync(join(project,'assets/hero-ocean.jpg'));
const heroFile=`hero-ocean-${digest(hero)}.jpg`;
writeFileSync(join(output,heroFile),hero);
const cssSource=readFileSync(join(source,'style.css'),'utf8');
if (!cssSource.includes("url('/hero-ocean.png')")) throw Error('未找到海景图引用');
const css=cssSource.replaceAll("url('/hero-ocean.png')",`url('/${heroFile}')`);
const cssFile=`style-${digest(css)}.css`;
writeFileSync(join(output,cssFile),css);
const js=readFileSync(join(source,'app.js'));
const jsFile=`app-${digest(js)}.js`;
writeFileSync(join(output,jsFile),js);
for (const page of ['index','submit','records','complete','admin']) {
  let html=readFileSync(join(source,`${page}.html`),'utf8');
  html=html.replace(/\/style\.css(?:\?[^"']*)?/g,`/${cssFile}`)
           .replace(/\/app\.js(?:\?[^"']*)?/g,`/${jsFile}`);
  if (!html.includes(`/${cssFile}`)||!html.includes(`/${jsFile}`)) throw Error(`页面资源引用缺失：${page}`);
  writeFileSync(join(output,`${page}.html`),html);
}
const immutable='Cache-Control: public, max-age=31536000, immutable';
const htmlCache='Cache-Control: public, max-age=0, must-revalidate';
const entries=[heroFile,cssFile,jsFile].map(file=>`/${file}\n  ${immutable}`).join('\n');
const htmlPaths=['/','/index.html','/submit','/submit.html','/records','/records.html','/complete','/complete.html','/admin','/admin.html'];
writeFileSync(join(output,'_headers'),`${entries}\n${htmlPaths.map(path=>`${path}\n  ${htmlCache}`).join('\n')}\n`);
console.log(JSON.stringify({heroFile,heroBytes:hero.length,cssFile,jsFile,output}));
