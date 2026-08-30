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
    const metrics=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#hand .card')],dock=document.querySelector('.action-dock');return{sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hand:document.querySelector('#hand')?.getBoundingClientRect(),table:document.querySelector('.table-stage')?.getBoundingClientRect(),cardBottom:Math.max(0,...cards.map(card=>card.getBoundingClientRect().bottom)),dockTop:dock?.getBoundingClientRect().top}});
    expect(metrics.sw).toBeLessThanOrEqual(metrics.cw+2);expect(metrics.hand.width).toBeGreaterThan(150);expect(metrics.table.width).toBeGreaterThan(300);expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.dockTop+1);
  });
}
test('rules modal and core controls are reachable',async({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));await page.goto('/');await assertNoPageErrors(page,errors);await page.click('#menuRulesButton');await expect(page.locator('#genericModal')).toBeVisible();await expect(page.locator('#genericModalCard')).toContainText('Jak grać');});

test('sound toggle is available and persistent in UI',async({page})=>{const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));await page.goto('/');await page.click('#singleButton');await assertNoPageErrors(page,errors);const button=page.locator('#soundButton');await expect(button).toBeVisible();await expect(button).toHaveAttribute('aria-pressed','true');await button.click();await expect(button).toHaveAttribute('aria-pressed','false');await page.reload();await page.click('#singleButton');await expect(page.locator('#soundButton')).toHaveAttribute('aria-pressed','false');await page.locator('#soundButton').click();await expect(page.locator('#soundButton')).toHaveAttribute('aria-pressed','true');});


test('menu can resume an in-memory single-player game',async({page})=>{await page.goto('/');await page.click('#singleButton');await expect(page.locator('#hand .card').first()).toBeVisible();const before=await page.locator('#hudStats').innerText();await page.click('#menuButton');await expect(page.locator('#mainMenu')).toBeVisible();await expect(page.locator('#continueButton')).toBeVisible();await page.click('#continueButton');await expect(page.locator('#mainMenu')).toBeHidden();await expect(page.locator('#hudStats')).toHaveText(before);});

test('single-player session survives reload and can be continued',async({page})=>{await page.goto('/');await page.click('#singleButton');await expect(page.locator('#hand .card').first()).toBeVisible();await page.click('#menuButton');await page.reload();await expect(page.locator('#continueButton')).toBeVisible();await expect(page.locator('#continueInfo')).toContainText('Zapis lokalny');await page.click('#continueButton');await expect(page.locator('#mainMenu')).toBeHidden();await expect(page.locator('#modeBadge')).toHaveText('SINGLE');await expect(page.locator('#hand .card').first()).toBeVisible();});
