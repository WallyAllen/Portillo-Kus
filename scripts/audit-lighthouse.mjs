// Herramientas de QA opcionales. No intervienen en el build de producción.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('='); return [arg.slice(0, at), arg.slice(at + 1)];
}));
const require = createRequire(path.resolve(args['--tools'] || '.', 'package.json'));
const {default: lighthouse} = await import(pathToFileURL(require.resolve('lighthouse')).href);
const chromeLauncher = await import(pathToFileURL(require.resolve('chrome-launcher')).href);
const output = path.resolve(args['--output'] || 'artifacts/lighthouse');
const base = args['--url'] || 'http://localhost:8537/';
const languages = (args['--langs'] || 'es,en,pt').split(',');
const runs = Number(args['--runs'] || 3);
fs.mkdirSync(output, {recursive:true});
const records = [];
for (const lang of languages) {
  for (let index = 1; index <= runs; index++) {
    const profile = path.join(output, `chrome-${lang}-${index}-${Date.now()}`);
    fs.mkdirSync(profile, {recursive:true});
    const chrome = await chromeLauncher.launch({chromePath:args['--chrome'],
      chromeFlags:['--headless=new', '--disable-dev-shm-usage', '--no-sandbox'],
      userDataDir:profile});
    try {
      const url = new URL(lang === 'es' ? '' : `${lang}/`, base).href;
      const result = await lighthouse(url, {port:chrome.port, logLevel:'error',
        onlyCategories:['performance','accessibility'], output:['json','html']});
      if (result.lhr.runtimeError) throw Error(JSON.stringify(result.lhr.runtimeError));
      const name = `${lang}-${index}`;
      fs.writeFileSync(path.join(output, `${name}.json`), result.report[0]);
      fs.writeFileSync(path.join(output, `${name}.html`), result.report[1]);
      const audits = result.lhr.audits;
      const record = {lang,run:index,url,version:result.lhr.lighthouseVersion,
        timestamp:result.lhr.fetchTime,settings:result.lhr.configSettings,
        performance:Math.round(result.lhr.categories.performance.score * 100),
        accessibility:Math.round(result.lhr.categories.accessibility.score * 100),
        lcp_ms:audits['largest-contentful-paint'].numericValue,
        cls:audits['cumulative-layout-shift'].numericValue,
        tbt_ms:audits['total-blocking-time'].numericValue,
        fcp_ms:audits['first-contentful-paint'].numericValue,
        failures:Object.values(audits).filter(a => a.score !== null && a.score < 1)
          .map(a => ({id:a.id,title:a.title,score:a.score}))};
      records.push(record);
      fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(records,null,2));
      console.log(JSON.stringify({...record,settings:undefined,failures:undefined}));
    } finally { await chrome.kill(); }
  }
}
