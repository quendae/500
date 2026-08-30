from pathlib import Path
import subprocess


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

app_path=Path('src/app.js')
app=app_path.read_text(encoding='utf-8')

# session helpers after sound helpers
anchor="function sfx(name){if(!soundEnabled)return;unlockAudio();if(!audioCtx||audioCtx.state!=='running')return;switch(name){case 'select':audioTone(720,.035,.012,'sine');break;case 'toggle':audioTone(540,.05,.018,'sine');audioTone(760,.06,.014,'sine',.035);break;case 'draw':audioNoise(.11,.021,0,1500);audioTone(360,.1,.016,'triangle',.015,520);break;case 'discard':audioNoise(.055,.024,0,850);audioTone(150,.075,.022,'triangle',0,95);break;case 'meld':audioTone(520,.11,.021,'sine');audioTone(660,.12,.019,'sine',.055);audioTone(880,.14,.016,'sine',.105);break;case 'turn':audioTone(620,.06,.016,'sine');break;case 'round':audioTone(420,.12,.018,'triangle');audioTone(560,.14,.018,'triangle',.08);break;case 'win':audioTone(440,.15,.02,'triangle');audioTone(554,.17,.02,'triangle',.09);audioTone(659,.22,.021,'triangle',.18);break;case 'deal':audioNoise(.14,.014,0,1650);audioTone(310,.07,.012,'triangle',.02,390);audioTone(390,.07,.011,'triangle',.11,480);break}}"
helpers=r'''

const SAVE_KEY='rummy500-single-save-v1';
function savedSession(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;const save=JSON.parse(raw);if(save?.version!==1||save?.mode!=='single'||!save.state||!Array.isArray(save.state.players)||save.state.playerCount<2||save.state.playerCount>7)return null;return save}catch{return null}}
function saveSession(){if(mode!=='single'||!state)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,mode:'single',savedAt:Date.now(),state,botDifficultyBySeat,sortMode}))}catch{}}
function clearSavedSession(){try{localStorage.removeItem(SAVE_KEY)}catch{}}
function hasLiveGame(){return mode!=='idle'&&!!getView()}
function updateContinueButton(){const b=$('#continueButton'),info=$('#continueInfo');if(!b)return;const live=hasLiveGame(),save=!live?savedSession():null,available=live||!!save;b.classList.toggle('hidden',!available);if(info){info.classList.toggle('hidden',!available);if(live)info.textContent=mode==='single'?'Bieżąca gra jest wstrzymana.':'Połączenie ze stołem pozostaje aktywne.';else if(save){const d=new Date(save.savedAt);info.textContent=`Zapis lokalny · ${save.state.playerCount} graczy · runda ${save.state.round} · ${d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})}`}}}
function pauseToMenu(){clearTimeout(botTimer);openMenu();updateContinueButton()}
function continueGame(){const live=hasLiveGame();if(!live){const save=savedSession();if(!save)return;state=save.state;visibleState=null;localSeat=0;mode='single';botDifficultyBySeat=save.botDifficultyBySeat||{};sortMode=save.sortMode||'suit';selected.clear();shownRoundKey='';fxSnapshot=null;unlockAudio();render()}closeMenu();scheduleAuthority()}
function reducedMotion(){return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function motionGhost(fromEl,toEl,{delay=0,face=true,duration=720}={}){if(reducedMotion()||!fromEl||!toEl)return;const a=fromEl.getBoundingClientRect(),b=toEl.getBoundingClientRect();if(!a.width||!b.width)return;const ghost=toEl.cloneNode(true);ghost.removeAttribute('data-card-id');ghost.removeAttribute('data-discard-index');ghost.classList.remove('fx-hand-in','fx-discard-in','fx-meld-card','selected','required','selectable');ghost.classList.add('motion-ghost');if(!face){ghost.className='card-back motion-ghost'}Object.assign(ghost.style,{position:'fixed',left:`${b.left}px`,top:`${b.top}px`,width:`${b.width}px`,height:`${b.height}px`,margin:'0',zIndex:'180',pointerEvents:'none',transformOrigin:'50% 50%'});document.body.appendChild(ghost);const dx=(a.left+a.width/2)-(b.left+b.width/2),dy=(a.top+a.height/2)-(b.top+b.height/2);ghost.animate([{opacity:.25,transform:`translate(${dx}px,${dy}px) rotate(-14deg) scale(.72)`},{opacity:1,offset:.72,transform:'translate(0,0) rotate(2deg) scale(1.04)'},{opacity:1,transform:'translate(0,0) rotate(0deg) scale(1)'}],{duration,delay,easing:'cubic-bezier(.18,.78,.22,1)',fill:'both'}).finished.finally(()=>ghost.remove())}
function animateTransfers(v,fx){if(!fx||reducedMotion())return;requestAnimationFrame(()=>{const newCards=[...fx.newHandIds].map(id=>handEl.querySelector(`[data-card-id="${CSS.escape(id)}"]`)).filter(Boolean);if(newCards.length){const source=fx.stockChanged?$('#stockPile'):discardEl;newCards.forEach((card,i)=>motionGhost(source,card,{delay:i*90,face:true,duration:760}))}if(fx.discardChanged&&!newCards.length){const target=discardEl.lastElementChild,source=handEl;motionGhost(source,target,{duration:700,face:true})}if(fx.meldIds.size){let i=0;for(const id of fx.meldIds){const target=meldsEl.querySelector(`[data-meld-id="${CSS.escape(id)}"] .card`);motionGhost(handEl,target,{delay:i++*100,duration:760,face:true})}}})}
'''
app=rep(app,anchor,anchor+helpers,'session/motion helpers')

app=rep(app,"$('#singleButton').addEventListener('click',startSingle);\n$('#multiplayerButton').addEventListener('click',()=>multiplayer.open());", "$('#continueButton').addEventListener('click',continueGame);\n$('#singleButton').addEventListener('click',startSingle);\n$('#multiplayerButton').addEventListener('click',async()=>{if(multiplayer.isActive())await multiplayer.leave();state=null;visibleState=null;mode='idle';selected.clear();clearTimeout(botTimer);multiplayer.open()});", 'menu listeners')
app=rep(app,"$('#menuButton').addEventListener('click',()=>returnToMenu(true));", "$('#menuButton').addEventListener('click',pauseToMenu);", 'menu pause behavior')

app=rep(app,"function startSingle(){\n  const playerCount=Number($('#singlePlayers').value),difficulty=$('#botDifficulty').value;", "async function startSingle(){\n  if(multiplayer.isActive())await multiplayer.leave();\n  const playerCount=Number($('#singlePlayers').value),difficulty=$('#botDifficulty').value;", 'startSingle async leave')

app=rep(app,"  },260);", "  },720);", 'bot animation pacing')

old_render="function render(){\n  const view=getView();renderFx=view?visualDiff(view):null;renderMode();if(!view){renderEmpty();fxSnapshot=null;renderFx=null;return}renderHud(view);renderPlayers(view);renderCenter(view);renderHand(view);renderPanel(view);renderRoundModal(view);finishVisualFx(view,renderFx);fxSnapshot=snapshotFx(view);renderFx=null;\n}"
new_render="function render(){\n  const view=getView();renderFx=view?visualDiff(view):null;renderMode();if(!view){renderEmpty();fxSnapshot=null;renderFx=null;updateContinueButton();return}renderHud(view);renderPlayers(view);renderCenter(view);renderHand(view);renderPanel(view);renderRoundModal(view);animateTransfers(view,renderFx);finishVisualFx(view,renderFx);fxSnapshot=snapshotFx(view);saveSession();updateContinueButton();renderFx=null;\n}"
app=rep(app,old_render,new_render,'render persistence and transfers')

app=rep(app,"function pulseClass(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),420)}", "function pulseClass(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),760)}", 'pulse duration')

app=rep(app,"function closeMenu(){$('#mainMenu').classList.remove('open');$('#mainMenu').classList.add('hidden')}\nfunction openMenu(){$('#mainMenu').classList.remove('hidden');$('#mainMenu').classList.add('open')}", "function closeMenu(){$('#mainMenu').classList.remove('open');$('#mainMenu').classList.add('hidden')}\nfunction openMenu(){$('#mainMenu').classList.remove('hidden');$('#mainMenu').classList.add('open');updateContinueButton()}", 'menu update continue')

app=rep(app,"updateSoundButton();\nrender();", "updateSoundButton();\nupdateContinueButton();\nrender();", 'initial continue')
app_path.write_text(app,encoding='utf-8')

# HTML/CSS and standalone bundle
idx=Path('index.html')
html=idx.read_text(encoding='utf-8')
html=rep(html,"        <div class=\"menu-buttons\">\n          <button id=\"singleButton\"", "        <p id=\"continueInfo\" class=\"continue-info hidden\"></p>\n        <div class=\"menu-buttons\">\n          <button id=\"continueButton\" class=\"menu-button primary continue-button hidden\"><b>▶</b><span>Kontynuuj</span><i>›</i></button>\n          <button id=\"singleButton\"", 'continue menu HTML')

css_add=r'''
/* Session resume + clearly visible card motion */
.continue-info{margin:10px 0 12px!important;padding:8px 10px;border:1px solid rgba(215,180,94,.28);border-radius:10px;background:rgba(215,180,94,.07);color:#d7ccb0!important;font-size:11px!important}.continue-button{box-shadow:0 0 0 1px rgba(241,215,130,.18),0 10px 24px rgba(189,145,55,.16)}
.motion-ghost{filter:drop-shadow(0 16px 16px rgba(0,0,0,.38));will-change:transform,opacity}.fx-hand-in{animation-duration:.64s!important}.fx-discard-in{animation-duration:.62s!important}.fx-meld-in,.fx-meld-card{animation-duration:.58s!important}.fx-stock-pulse{animation-duration:.52s!important}
@keyframes fxHandIn{0%{opacity:0;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + 88px)) scale(.68)}58%{opacity:1;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + var(--hand-lift) - 9px)) scale(1.055)}100%{opacity:1;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + var(--hand-lift))) scale(1)}}
@keyframes fxDiscardIn{0%{opacity:0;transform:translate(92px,-72px) rotate(18deg) scale(.7)}65%{opacity:1;transform:translate(-5px,4px) rotate(-3deg) scale(1.05)}100%{opacity:1;transform:none}}
@keyframes fxMeldIn{0%{opacity:.15;transform:scale(.78)}62%{opacity:1;transform:scale(1.055)}100%{opacity:1;transform:scale(1)}}
@keyframes fxMeldCard{0%{opacity:0;transform:translateY(48px) rotate(-8deg) scale(.72)}70%{opacity:1;transform:translateY(-3px) rotate(1deg) scale(1.04)}100%{opacity:1;transform:none}}
'''
html=rep(html,'\n@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n\n  </style>', '\n'+css_add+'\n@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n\n  </style>', 'CSS motion additions')

# Build updated bundle from source and replace standalone script
subprocess.run(['npx','esbuild','src/app.js','--bundle','--format=iife','--target=es2022','--minify','--outfile=/tmp/rummy500-bundle.js'],check=True)
bundle=Path('/tmp/rummy500-bundle.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')
start=html.index('  <script id="rummy500-app">')
end=html.index('</script>',start)+len('</script>')
html=html[:start]+'  <script id="rummy500-app">\n'+bundle+'\n  </script>'+html[end:]
idx.write_text(html,encoding='utf-8')

# tests
tp=Path('tests/ui.spec.mjs')
t=tp.read_text(encoding='utf-8')
extra=r'''

test('menu can resume an in-memory single-player game',async({page})=>{await page.goto('/');await page.click('#singleButton');await expect(page.locator('#hand .card').first()).toBeVisible();const before=await page.locator('#hudStats').innerText();await page.click('#menuButton');await expect(page.locator('#mainMenu')).toBeVisible();await expect(page.locator('#continueButton')).toBeVisible();await page.click('#continueButton');await expect(page.locator('#mainMenu')).toBeHidden();await expect(page.locator('#hudStats')).toHaveText(before);});

test('single-player session survives reload and can be continued',async({page})=>{await page.goto('/');await page.click('#singleButton');await expect(page.locator('#hand .card').first()).toBeVisible();await page.click('#menuButton');await page.reload();await expect(page.locator('#continueButton')).toBeVisible();await expect(page.locator('#continueInfo')).toContainText('Zapis lokalny');await page.click('#continueButton');await expect(page.locator('#mainMenu')).toBeHidden();await expect(page.locator('#modeBadge')).toHaveText('SINGLE');await expect(page.locator('#hand .card').first()).toBeVisible();});
'''
if 'session survives reload' not in t:
    t+=extra
tp.write_text(t,encoding='utf-8')

# Sanity: standalone has no module src refs
if 'src/app.js' in html or '<link rel="stylesheet"' in html:
    raise SystemExit('standalone regression')
print('patched resume + motion')
