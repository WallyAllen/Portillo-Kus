// Playwright + axe reales. Los archivos de evidencia se guardan fuera del repo.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at=arg.indexOf('=');return [arg.slice(0,at),arg.slice(at+1)];
}));
const toolsRequire = createRequire(path.resolve(args['--tools'] || '.', 'package.json'));
const playwrightRequire = args['--playwright'] ? createRequire(path.resolve(args['--playwright'],'package.json')) : toolsRequire;
const {chromium} = playwrightRequire('playwright');
const output = path.resolve(args['--output'] || 'artifacts/browser');
const base = args['--url'] || 'http://localhost:8537/';
const langs = (args['--langs'] || 'es,en,pt').split(',');
const widths = (args['--widths'] || '375,390,1440').split(',').map(Number);
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:args['--chrome'],args:['--no-sandbox']});
  try {
    for(const lang of langs){
      for(const width of widths){
        const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
        const page=await context.newPage();
        const consoleErrors=[],requestFailures=[],requests=[];
        page.on('pageerror',error=>consoleErrors.push(error.message));
        page.on('requestfailed',request=>requestFailures.push({url:request.url(),failure:request.failure()}));
        page.on('request',request=>requests.push(request.url()));
        const privacy={es:'privacidad/',en:'en/privacy/',pt:'pt/privacidade/'};
        const route=args['--privacy']==='true'?privacy[lang]:(lang==='es'?'':`${lang}/`);
        const url=new URL(route,base).href;
        const response=await page.goto(url,{waitUntil:'networkidle'});
        await page.evaluate(()=>document.fonts.ready);
        await page.screenshot({path:path.join(output,`${lang}-${width}-hero.png`)});
        // Hacer visibles reveals y disparar lazy images a lo largo de toda la página.
        for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=700){
          await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(70);
        }
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.waitForTimeout(250);
        await page.addScriptTag({path:toolsRequire.resolve('axe-core/axe.min.js')});
        const axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
        await page.screenshot({path:path.join(output,`${lang}-${width}-full.png`),fullPage:true});
        const audit=await page.evaluate(()=>{
          function selector(el){return el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className && typeof el.className==='string'?'.'+el.className.trim().replace(/\s+/g,'.'):'');}
          function visible(el){const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility==='visible'&&r.width>0&&r.height>0&&!el.closest('[inert]');}
          const headings=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(el=>({level:Number(el.tagName[1]),text:el.textContent.trim()}));
          const targets=Array.from(document.querySelectorAll('a,button,input,select,textarea,[tabindex="0"]')).filter(visible).map(el=>{
            const r=el.getBoundingClientRect();return {selector:selector(el),text:el.textContent.trim().slice(0,80),width:r.width,height:r.height};
          });
          const images=Array.from(document.images).map(img=>({src:img.currentSrc,alt:img.getAttribute('alt'),width:img.getAttribute('width'),height:img.getAttribute('height'),complete:img.complete&&img.naturalWidth>0,loading:img.loading,fetchpriority:img.getAttribute('fetchpriority')}));
          const text=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
          while(walker.nextNode()){
            const node=walker.currentNode,el=node.parentElement;
            if(!node.textContent.trim()||['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)||!visible(el))continue;
            let opacity=1;for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)opacity*=Number(getComputedStyle(ancestor).opacity);
            if(opacity===0)continue;
            const range=document.createRange();range.selectNodeContents(node);
            const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(r=>({x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}));
            const style=getComputedStyle(el);
            text.push({selector:selector(el),text:node.textContent.trim().slice(0,120),color:style.color,opacity,fontSize:parseFloat(style.fontSize),fontWeight:Number(style.fontWeight),fontStyle:style.fontStyle,fontFamily:style.fontFamily,rects});
          }
          const fonts=Array.from(document.fonts).map(font=>({family:font.family,style:font.style,weight:font.weight,status:font.status}));
          return {headings,targets,images,text,fonts,overflow:document.documentElement.scrollWidth>innerWidth,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
        });
        const focus=[];
        // Verificar foco real por teclado, sin seleccionar programáticamente los controles.
        await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
        for(let tab=0;tab<Math.min(audit.targets.length+2,100);tab++){
          await page.keyboard.press('Tab');
          focus.push(await page.evaluate(()=>{
            const el=document.activeElement,s=getComputedStyle(el),r=el.getBoundingClientRect();
            return {tag:el.tagName,text:el.textContent.trim().slice(0,50),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,visible:el.matches(':focus-visible'),x:r.x,y:r.y};
          }));
        }
        await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('.carousel').forEach(el=>el.scrollLeft=0);});
        await page.addStyleTag({content:'* { -webkit-text-fill-color: transparent !important; text-shadow:none !important; }'});
        const background_screenshot=`${lang}-${width}-background.png`;
        await page.screenshot({path:path.join(output,background_screenshot),fullPage:true});
        const record={lang,width,url,status:response.status(),...audit,focus,consoleErrors,requestFailures,requests,background_screenshot,axe:{version:axe.testEngine.version,violations:axe.violations,incomplete:axe.incomplete,passes:axe.passes.length}};
        fs.writeFileSync(path.join(output,`${lang}-${width}.json`),JSON.stringify(record,null,2));
        // El carrusel recorta cartas: capturarlas una por una cubre TODAS sus fotos.
        const cards=await page.locator('.area-card').all();
        for(let index=0;index<cards.length;index++){
          const card=cards[index];await card.scrollIntoViewIfNeeded();
          const cardText=await card.evaluate(root=>{
            const origin=root.getBoundingClientRect(),text=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
            while(walker.nextNode()){
              const node=walker.currentNode,el=node.parentElement;if(!node.textContent.trim())continue;
              const style=getComputedStyle(el);if(style.visibility!=='visible')continue;
              let opacity=1;for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)opacity*=Number(getComputedStyle(ancestor).opacity);
              const range=document.createRange();range.selectNodeContents(node);
              const rects=Array.from(range.getClientRects()).filter(r=>r.width&&r.height).map(r=>({x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height}));
              text.push({selector:el.tagName.toLowerCase()+'.'+el.className,text:node.textContent.trim().slice(0,120),color:style.color,opacity,fontSize:parseFloat(style.fontSize),fontWeight:Number(style.fontWeight),fontFamily:style.fontFamily,rects});
            }return text;
          });
          const screenshot=`${lang}-${width}-card-${index+1}-background.png`;
          await card.screenshot({path:path.join(output,screenshot)});
          fs.writeFileSync(path.join(output,`${lang}-${width}-card-${index+1}.json`),JSON.stringify({text:cardText,background_screenshot:screenshot},null,2));
        }
        console.log(JSON.stringify({lang,width,status:record.status,axe:axe.violations.map(v=>v.id),overflow:audit.overflow,smallTargets:audit.targets.filter(t=>t.width<44||t.height<44).length,consoleErrors:consoleErrors.length}));
        await context.close();
      }
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
