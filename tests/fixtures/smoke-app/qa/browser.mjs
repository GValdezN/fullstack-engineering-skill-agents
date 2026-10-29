import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://web:3000');
 await page.getByLabel('Nota',{exact:true}).fill(process.env.CASE_TEXT);
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('listitem').filter({hasText:process.env.CASE_TEXT}).waitFor();
 await page.reload();
 await page.getByRole('listitem').filter({hasText:process.env.CASE_TEXT}).waitFor();
 const response=await page.request.get('http://web:3000/api/notes');
 assert.equal(response.status(),200);
 assert.equal((await response.json()).filter(x=>x.text===process.env.CASE_TEXT).length,1);
 console.log('PASS: browser -> Next.js -> API -> PostgreSQL; reload preserves note');
}finally{await browser.close()}
