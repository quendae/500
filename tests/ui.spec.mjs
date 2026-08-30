import { test, expect } from '@playwright/test';
const sizes=[{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:844,height:390}];
async function assertNoPageErrors(page,errors){await page.waitForTimeout(50);expect(errors,errors.join('\n\n')).toEqual([])}
for(const viewport of sizes){
  test(`single-player layout ${viewport.width}x${viewport.height}`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
    await page.setViewportSize(viewport);await page.goto('/');await assertNoPageErrors(page,errors);
    await expect(page.locator('#mainMenu')).toBeVisible();await page.selectOption('#singlePlayers','7');await page.click('#singleButton');
    await expect(page.locator('.table-stage')).toBeVisible();await expect(page.locator('#hand')).toBeVisible();await expect(page.locator('#menuButton')).toBeVisible();
    await page.waitForTimeout(700);
    const metrics=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hand:document.querySelector('#hand')?.getBoundingClientRect(),table:document.querySelector('.table-stage')?.getBoundingClientRect()}));
    expect(metrics.sw).toBeLessThanOrEqual(metrics.cw+2);expect(metrics.hand.width).toBeGreaterThan(150);expect(metrics.table.width).toBeGreaterThan(300);
  });
}
test('rules modal and core controls are reachable',async({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));await page.goto('/');await assertNoPageErrors(page,errors);await page.click('#menuRulesButton');await expect(page.locator('#genericModal')).toBeVisible();await expect(page.locator('#genericModalCard')).toContainText('Jak grać');});
