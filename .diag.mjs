import { chromium } from 'playwright';
const SP = process.argv[2];
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
for (const r of ['/login','/activate','/forgot-password']) {
  await p.goto('http://localhost:4321' + r);
  await p.waitForTimeout(6000);
  const d = await p.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g,' ').trim();
    return { debut: t.slice(0, 110), clesBrutes: (t.match(/[A-Z_]{3,}\.[A-Z_]{3,}/g) || []).slice(0,3) };
  });
  console.log(`  ${r.padEnd(18)} « ${d.debut} »`);
  if (d.clesBrutes.length) console.log(`      ⚠ clés non traduites : ${JSON.stringify(d.clesBrutes)}`);
}
await p.screenshot({ path: `${SP}/auth-final.png` });
await b.close();
