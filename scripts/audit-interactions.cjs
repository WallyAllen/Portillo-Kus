// QA enfocado, sin tocar el repo. Node + Playwright externo mediante --playwright.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createRequire} = require('node:module');
const args = Object.fromEntries(process.argv.slice(2).map(a => {const i=a.indexOf('='); return [a.slice(0,i),a.slice(i+1)];}));
const runtime = createRequire(path.resolve(args['--playwright'] || process.cwd(), 'package.json'));
const {chromium} = runtime('playwright');
const output = path.resolve(args['--output'] || 'p10-focused');
fs.mkdirSync(output,{recursive:true});
const result = {started:new Date().toISOString(),checks:[],metadata:[],screenshots:[],errors:[]};
let server;
let browser;
function check(name,pass,evidence){result.checks.push({name,pass,evidence});}
async function serve(){
  const root=path.resolve(args['--dist'] || path.join(__dirname, '..', 'dist'));
  server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(args['--port']||8553),'127.0.0.1',resolve);});
  return `http://127.0.0.1:${args['--port']||8553}/`;
}
async function focusState(page){return page.evaluate(()=>{
  const el=document.activeElement;return {tag:el.tagName,id:el.id,text:el.textContent.trim().slice(0,65),inside:!!el.closest('#mobilePanel')};
});}
// El selector de escritorio es un <details>: se abre y se elige el idioma por hreflang.
async function openLanguages(page){
  if(!await page.locator('#langMenu').evaluate(el=>el.open))await page.locator('#langMenu summary').click();
}
async function clickLanguage(page,hreflang,pathname){
  await openLanguages(page);
  const link=page.locator('#langMenu .lang-switch a[hreflang="'+hreflang+'"]');
  await Promise.all([page.waitForURL(url=>url.pathname===pathname),link.click()]);
  await page.waitForLoadState('load');
}
(async()=>{
  const base=args['--url'] || await serve();result.base=base;
  browser=await chromium.launch({headless:true,executablePath:args['--chrome']||undefined});
  if(args['--screenshots-only']!=='true'){
  const desktop=await browser.newContext({viewport:{width:1440,height:950},reducedMotion:'reduce'});
  const meta=await desktop.newPage();meta.on('pageerror',e=>result.errors.push(e.message));
  for(const route of ['', 'en/', 'pt/', 'ru/', 'zh/', 'privacidad/', 'en/privacy/', 'pt/privacidade/', 'ru/privacy/', 'zh/privacy/']){
    await meta.goto(new URL(route,base).href,{waitUntil:'load'});
    const record=await meta.evaluate(()=>({url:location.href,language:document.documentElement.lang,navs:Array.from(document.querySelectorAll('nav')).map(el=>({label:el.getAttribute('aria-label'),text:el.textContent.trim().replace(/\s+/g,' ').slice(0,150)})),languageLabel:document.querySelector('.lang-switch')?.getAttribute('aria-label'),sectionNavLabels:Array.from(document.querySelectorAll('.main-nav,.mobile-panel nav:not(.lang-switch)')).map(el=>el.getAttribute('aria-label')),selectors:Array.from(document.querySelectorAll('.lang-switch')).map(el=>Array.from(el.querySelectorAll('a')).map(a=>({text:a.textContent,href:a.getAttribute('href'),current:a.getAttribute('aria-current'),class:a.className}))),disclaimer:document.querySelector('.footer-disclaimer')?.textContent.trim()}));
    result.metadata.push(record);
    check('idioma activo anunciado '+route,record.selectors.every(sel=>sel.filter(a=>a.class.includes('is-current')).every(a=>a.current==='page'||a.current==='true')),record.selectors);
    if(record.sectionNavLabels.length)check('navegacion de secciones rotulada '+route,record.sectionNavLabels.every(label=>label&&label!==record.languageLabel),record.sectionNavLabels);
    if(route.includes('privacy')||route.includes('privaci'))check('selector permanece en privacidad '+route,record.selectors.every(sel=>sel.every(a=>a.href==='#top'||/privacy|privaci/.test(a.href))),record.selectors);
  }
  await desktop.close();
  for(const route of ['', 'en/', 'pt/', 'ru/', 'zh/']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await ctx.newPage();
    await page.goto(new URL(route,base).href,{waitUntil:'load'});await page.locator('#menuOpenBtn').click();
    await page.waitForFunction(()=>document.activeElement?.id==='menuCloseBtn',null,{timeout:1000}).catch(()=>{});
    check('modal foco inicial en cerrar '+route,(await focusState(page)).id==='menuCloseBtn',await focusState(page));
    const forward=[];for(let i=0;i<14;i++){await page.keyboard.press('Tab');forward.push(await focusState(page));}
    check('modal contiene Tab '+route,forward.every(x=>x.inside),forward);
    await page.keyboard.press('Escape');check('Escape devuelve foco '+route,(await focusState(page)).id==='menuOpenBtn',await focusState(page));
    await page.locator('#menuOpenBtn').click();const backward=[];for(let i=0;i<14;i++){await page.keyboard.press('Shift+Tab');backward.push(await focusState(page));}
    check('modal contiene Shift+Tab '+route,backward.every(x=>x.inside),backward);
    await page.keyboard.press('Escape');await ctx.close();
  }
  for(const reducedMotion of ['reduce','no-preference']){
    const ctx=await browser.newContext({viewport:{width:1440,height:950},reducedMotion});const page=await ctx.newPage();
    await page.goto(new URL('#contacto',base).href,{waitUntil:'load'});
    await clickLanguage(page,'en','/en/');check('hash contacto ES a EN '+reducedMotion,new URL(page.url()).hash==='#contacto',page.url());
    await clickLanguage(page,'pt-BR','/pt/');check('hash contacto EN a PT '+reducedMotion,new URL(page.url()).hash==='#contacto',page.url());
    await clickLanguage(page,'ru','/ru/');check('hash contacto PT a RU '+reducedMotion,new URL(page.url()).hash==='#contacto',page.url());
    await clickLanguage(page,'zh-Hans','/zh/');check('hash contacto RU a ZH '+reducedMotion,new URL(page.url()).hash==='#contacto',page.url());
    await page.goto(base,{waitUntil:'load'});
    await page.evaluate(()=>{window.__languageClick=null;document.addEventListener('click',e=>{if(e.target.closest('.lang-switch a'))window.__languageClick={ctrl:e.ctrlKey,defaultPrevented:e.defaultPrevented};});});
    await openLanguages(page);
    await page.locator('#langMenu .lang-switch a[hreflang="en"]').click({modifiers:['Control']});
    const click=await page.evaluate(()=>window.__languageClick);
    check('Ctrl+click selector preservado '+reducedMotion,!!click?.ctrl&&!click.defaultPrevented,click);
    await ctx.close();
  }
  // Mapa a pedido: ningún pedido a Google antes del clic; después, iframe con foco.
  for(const route of ['', 'ru/']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await ctx.newPage();
    const google=[];page.on('request',r=>{if(/google\./.test(new URL(r.url()).hostname))google.push(r.url());});
    await page.route(/https:\/\/www\.google\.com\/maps\/embed.*/,r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>mapa</title>'}));
    await page.goto(new URL(route+'#contacto',base).href,{waitUntil:'load'});
    check('mapa sin pedidos antes del clic '+route,google.length===0,google);
    // Centrado: abajo lo tapa la barra fija de contacto.
    await page.locator('[data-map-load]').evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(300);
    await page.locator('[data-map-load]').click();
    await page.waitForSelector('#officeMap iframe',{timeout:2000}).catch(()=>{});
    const map=await page.evaluate(()=>{const f=document.querySelector('#officeMap iframe');return f&&{title:f.title,focused:document.activeElement===f,height:f.getBoundingClientRect().height};});
    check('mapa carga al pedirlo '+route,!!map&&map.focused&&map.height>=240&&!!map.title,map);
    await ctx.close();
  }
  }
  for(const width of [390,1440]){
    const ctx=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});const page=await ctx.newPage();
    await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
    const strip=page.locator('section').filter({has:page.locator('.ba-grid')});
    const bounds=await strip.evaluate(el=>({top:el.getBoundingClientRect().top+scrollY,height:el.offsetHeight}));
    for(let y=Math.max(0,bounds.top-200);y<bounds.top+bounds.height;y+=400){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}
    await strip.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.ba-grid img')).every(img=>img.complete&&img.naturalWidth>0));
    const file=path.join(output,`buenos-aires-${width}.png`);await strip.screenshot({path:file});
    result.screenshots.push({width,file,cards:await page.locator('.ba-card img').evaluateAll(imgs=>imgs.map(img=>({alt:img.alt,src:img.currentSrc,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,transform:getComputedStyle(img).transform}))) });
    const cards=await page.locator('.ba-card').all();for(let i=0;i<cards.length;i++){await cards[i].scrollIntoViewIfNeeded();await cards[i].screenshot({path:path.join(output,`ba-${width}-card-${i+1}.png`)});}
    const credit=page.locator('.ba-credit');await credit.locator('a').first().focus();await page.keyboard.press('Tab');
    const focused=await page.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {text:el.textContent,href:el.href,visible:el.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth};});
    result.screenshots.push({width,creditFocus:focused});check('credito licencia foco visible '+width,focused.visible&&focused.outlineStyle!=='none'&&focused.outlineWidth!=='0px',focused);
    await credit.screenshot({path:path.join(output,`ba-${width}-credit-focus.png`)});await ctx.close();
  }
})().catch(e=>{result.fatal=e.stack;process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  result.ended=new Date().toISOString();fs.writeFileSync(path.join(output,'focused.json'),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(output,'focused.md'),'# P10 QA enfocado\n\n'+result.checks.map(c=>`- ${c.pass?'PASS':'FAIL'}: ${c.name}`).join('\n')+'\n\n'+(result.fatal||''));
  if(result.checks.some(c=>!c.pass)||result.errors.length) process.exitCode=1;
  console.log(JSON.stringify({output,checks:result.checks.length,failed:result.checks.filter(c=>!c.pass).map(c=>c.name),fatal:result.fatal||null}));
});
