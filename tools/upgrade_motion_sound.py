from pathlib import Path
import subprocess


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch target not found: {label}')
    return text.replace(old, new, 1)


app_path = Path('src/app.js')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "let state=null,visibleState=null,localSeat=0,mode='idle',sortMode='suit',selected=new Set(),botDifficultyBySeat={},botTimer=null,shownRoundKey='';",
    "let state=null,visibleState=null,localSeat=0,mode='idle',sortMode='suit',selected=new Set(),botDifficultyBySeat={},botTimer=null,shownRoundKey='',soundEnabled=readSoundSetting(),audioCtx=null,noiseBuffer=null,fxSnapshot=null,renderFx=null;",
    'state variables',
)

errors_marker = "const ERRORS={NOT_YOUR_TURN:'To nie jest Twoja tura.',MUST_DRAW_FIRST:'Najpierw dobierz kartę.',MUST_PLAY_OR_DISCARD:'Najpierw zakończ bieżącą turę.',INVALID_MELD:'Te karty nie tworzą prawidłowego układu.',INVALID_LAYOFF:'Tej karty nie można dołożyć do wybranego układu.',MUST_USE_PICKUP_CARD:'Najgłębsza karta zabrana ze stosu odrzuconych musi zostać natychmiast wyłożona.',CANNOT_REDISCARD_TOP_PICKUP:'Nie możesz od razu odrzucić tej samej karty zabranej z wierzchu stosu.',ILLEGAL_DEEP_PICKUP:'Nie możesz zabrać tych kart — najgłębszej wybranej karty nie da się od razu wyłożyć.',CARD_NOT_OWNED:'Nie masz tej karty.',STOCK_NOT_EMPTY:'Stos dobierania nie jest pusty.'};"
audio_helpers = r'''

function readSoundSetting(){try{return localStorage.getItem('rummy500-sound')!=='off'}catch{return true}}
function saveSoundSetting(){try{localStorage.setItem('rummy500-sound',soundEnabled?'on':'off')}catch{}}
function updateSoundButton(){const b=$('#soundButton');if(!b)return;b.textContent=soundEnabled?'🔊':'🔇';b.title=soundEnabled?'Dźwięki: włączone':'Dźwięki: wyłączone';b.setAttribute('aria-pressed',String(soundEnabled));b.classList.toggle('muted',!soundEnabled)}
function unlockAudio(){if(!soundEnabled)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;try{if(!audioCtx)audioCtx=new AC();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{})}catch{}}
function audioTone(freq,duration=0.08,gain=0.025,type='sine',delay=0,endFreq=null){if(!audioCtx||audioCtx.state!=='running')return;const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),t+duration);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t+duration);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+duration+0.02)}
function audioNoise(duration=0.09,gain=0.018,delay=0,frequency=1300){if(!audioCtx||audioCtx.state!=='running')return;if(!noiseBuffer){noiseBuffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*.28),audioCtx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)}const t=audioCtx.currentTime+delay,s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=noiseBuffer;f.type='bandpass';f.frequency.value=frequency;f.Q.value=.75;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+duration);s.connect(f).connect(g).connect(audioCtx.destination);s.start(t);s.stop(t+duration+.02)}
function sfx(name){if(!soundEnabled)return;unlockAudio();if(!audioCtx||audioCtx.state!=='running')return;switch(name){case 'select':audioTone(720,.035,.012,'sine');break;case 'toggle':audioTone(540,.05,.018,'sine');audioTone(760,.06,.014,'sine',.035);break;case 'draw':audioNoise(.11,.021,0,1500);audioTone(360,.1,.016,'triangle',.015,520);break;case 'discard':audioNoise(.055,.024,0,850);audioTone(150,.075,.022,'triangle',0,95);break;case 'meld':audioTone(520,.11,.021,'sine');audioTone(660,.12,.019,'sine',.055);audioTone(880,.14,.016,'sine',.105);break;case 'turn':audioTone(620,.06,.016,'sine');break;case 'round':audioTone(420,.12,.018,'triangle');audioTone(560,.14,.018,'triangle',.08);break;case 'win':audioTone(440,.15,.02,'triangle');audioTone(554,.17,.02,'triangle',.09);audioTone(659,.22,.021,'triangle',.18);break;case 'deal':audioNoise(.14,.014,0,1650);audioTone(310,.07,.012,'triangle',.02,390);audioTone(390,.07,.011,'triangle',.11,480);break}}
'''
app = replace_once(app, errors_marker, errors_marker + audio_helpers, 'audio helpers')

app = replace_once(
    app,
    "$('#singleButton').addEventListener('click',startSingle);\n$('#multiplayerButton').addEventListener('click',()=>multiplayer.open());",
    "document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});\n$('#soundButton').addEventListener('click',()=>{const next=!soundEnabled;if(!next)sfx('toggle');soundEnabled=next;saveSoundSetting();updateSoundButton();if(next){unlockAudio();sfx('toggle')}});\n$('#singleButton').addEventListener('click',startSingle);\n$('#multiplayerButton').addEventListener('click',()=>multiplayer.open());",
    'sound controls',
)

app = replace_once(
    app,
    "handEl.addEventListener('click',e=>{const card=e.target.closest('[data-card-id]');if(!card)return;const id=card.dataset.cardId;if(selected.has(id))selected.delete(id);else selected.add(id);render()});",
    "handEl.addEventListener('click',e=>{const card=e.target.closest('[data-card-id]');if(!card)return;const id=card.dataset.cardId;if(selected.has(id))selected.delete(id);else selected.add(id);sfx('select');render()});",
    'selection sound',
)

app = replace_once(
    app,
    "mode='multi-host';localSeat=0;botDifficultyBySeat=cfg.botDifficulties||{};state=createGame({playerCount:cfg.playerCount,names:cfg.names,types:cfg.types,targetScore:500});visibleState=null;selected.clear();closeMenu();render();scheduleAuthority();",
    "mode='multi-host';localSeat=0;botDifficultyBySeat=cfg.botDifficulties||{};state=createGame({playerCount:cfg.playerCount,names:cfg.names,types:cfg.types,targetScore:500});visibleState=null;selected.clear();fxSnapshot=null;unlockAudio();closeMenu();render();scheduleAuthority();",
    'host start fx reset',
)
app = replace_once(
    app,
    "onGuestStart:seat=>{mode='multi-guest';localSeat=seat;state=null;visibleState=null;selected.clear();closeMenu();render();},",
    "onGuestStart:seat=>{mode='multi-guest';localSeat=seat;state=null;visibleState=null;selected.clear();fxSnapshot=null;closeMenu();render();},",
    'guest start fx reset',
)

app = replace_once(
    app,
    "state=createGame({playerCount,names,types,targetScore:500});visibleState=null;localSeat=0;mode='single';selected.clear();shownRoundKey='';closeMenu();render();scheduleAuthority();",
    "state=createGame({playerCount,names,types,targetScore:500});visibleState=null;localSeat=0;mode='single';selected.clear();shownRoundKey='';fxSnapshot=null;unlockAudio();closeMenu();render();scheduleAuthority();",
    'single start fx reset',
)

old_render = """function render(){
  const view=getView();renderMode();if(!view){renderEmpty();return}renderHud(view);renderPlayers(view);renderCenter(view);renderHand(view);renderPanel(view);renderRoundModal(view);
}
"""
new_render = """function render(){
  const view=getView();renderFx=view?visualDiff(view):null;renderMode();if(!view){renderEmpty();fxSnapshot=null;renderFx=null;return}renderHud(view);renderPlayers(view);renderCenter(view);renderHand(view);renderPanel(view);renderRoundModal(view);finishVisualFx(view,renderFx);fxSnapshot=snapshotFx(view);renderFx=null;
}
function snapshotFx(v){return{revision:v.revision,round:v.round,phase:v.phase,currentPlayer:v.currentPlayer,stockCount:v.stock.length,handIds:(v.players[localSeat]?.hand||[]).map(c=>c.id),discardCount:v.discard.length,discardTop:v.discard.at(-1)?.id||null,meldCounts:Object.fromEntries(v.melds.map(m=>[m.id,m.entries.length]))}}
function visualDiff(v){const handIds=(v.players[localSeat]?.hand||[]).map(c=>c.id);if(!fxSnapshot||fxSnapshot.round!==v.round)return{initial:true,newHandIds:new Set(handIds),discardChanged:false,meldIds:new Set(v.melds.map(m=>m.id)),turnChanged:false,stockChanged:false,roundEnded:false};if(fxSnapshot.revision===v.revision)return{initial:false,newHandIds:new Set(),discardChanged:false,meldIds:new Set(),turnChanged:false,stockChanged:false,roundEnded:false};const previousHand=new Set(fxSnapshot.handIds),newHandIds=new Set(handIds.filter(id=>!previousHand.has(id))),discardTop=v.discard.at(-1)?.id||null,meldIds=new Set();for(const m of v.melds)if(fxSnapshot.meldCounts[m.id]!==m.entries.length)meldIds.add(m.id);return{initial:false,newHandIds,discardChanged:v.discard.length!==fxSnapshot.discardCount||discardTop!==fxSnapshot.discardTop,meldIds,turnChanged:v.currentPlayer!==fxSnapshot.currentPlayer,stockChanged:v.stock.length!==fxSnapshot.stockCount,roundEnded:fxSnapshot.phase!==v.phase&&['roundEnd','gameEnd'].includes(v.phase)}}
function pulseClass(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),420)}
function finishVisualFx(v,fx){if(!fx)return;if(fx.stockChanged)pulseClass($('#stockPile'),'fx-stock-pulse');if(fx.initial&&fx.newHandIds.size)sfx('deal');else if(fx.roundEnded)sfx(v.phase==='gameEnd'?'win':'round');else if(fx.meldIds.size)sfx('meld');else if(fx.newHandIds.size)sfx('draw');else if(fx.discardChanged)sfx('discard');else if(fx.turnChanged&&v.currentPlayer===localSeat)sfx('turn')}
"""
app = replace_once(app, old_render, new_render, 'render fx pipeline')

app = replace_once(
    app,
    "discardEl.innerHTML=v.discard.map((c,i)=>cardHTML(c,{discardIndex:i,clickable:localTurn&&v.phase==='draw'})).join('');requestAnimationFrame(()=>{discardEl.scrollLeft=discardEl.scrollWidth});",
    "discardEl.innerHTML=v.discard.map((c,i)=>cardHTML(c,{discardIndex:i,clickable:localTurn&&v.phase==='draw',extraClass:renderFx?.discardChanged&&i===v.discard.length-1?'fx-discard-in':''})).join('');requestAnimationFrame(()=>{discardEl.scrollLeft=discardEl.scrollWidth});",
    'discard animation',
)

old_meld = "function meldHTML(v,m){return `<div class=\"meld\" data-meld-id=\"${m.id}\"><div class=\"meld-head\"><span>${m.kind==='set'?'GRUPA':'SEKWENS'}</span><span>${esc(v.players[m.createdBy]?.name||'')}</span></div><div class=\"meld-cards\">${m.entries.map(e=>cardHTML(e.card,{small:true,owner:e.ownerSeat,jokerMap:e.card.joker&&m.kind==='run'?rankFromNum(e.representedRank)+suitSymbol(m.suit):''})).join('')}</div></div>`}"
new_meld = "function meldHTML(v,m){const fresh=renderFx?.meldIds?.has(m.id);return `<div class=\"meld ${fresh?'fx-meld-in':''}\" data-meld-id=\"${m.id}\"><div class=\"meld-head\"><span>${m.kind==='set'?'GRUPA':'SEKWENS'}</span><span>${esc(v.players[m.createdBy]?.name||'')}</span></div><div class=\"meld-cards\">${m.entries.map(e=>cardHTML(e.card,{small:true,owner:e.ownerSeat,extraClass:fresh?'fx-meld-card':'',jokerMap:e.card.joker&&m.kind==='run'?rankFromNum(e.representedRank)+suitSymbol(m.suit):''})).join('')}</div></div>`}"
app = replace_once(app, old_meld, new_meld, 'meld animation')

old_hand = "const p=v.players[localSeat];if(!p){handEl.innerHTML='';return}const cards=sortCards([...p.hand]);const n=cards.length;handEl.innerHTML=cards.map((c,i)=>{const rot=Math.max(-10,Math.min(10,(i-(n-1)/2)*1.25));const drop=Math.abs(i-(n-1)/2)*.45;return cardHTML(c,{hand:true,selected:selected.has(c.id),required:v.pendingPickup?.cardId===c.id,style:`--rot:${rot}deg;--drop:${drop}px`})}).join('');"
new_hand = "const p=v.players[localSeat];if(!p){handEl.innerHTML='';return}const cards=sortCards([...p.hand]);const n=cards.length;handEl.innerHTML=cards.map((c,i)=>{const rot=Math.max(-10,Math.min(10,(i-(n-1)/2)*1.25)),drop=Math.abs(i-(n-1)/2)*.45,incoming=renderFx?.newHandIds?.has(c.id),delay=renderFx?.initial?Math.min(i,12)*28:0;return cardHTML(c,{hand:true,selected:selected.has(c.id),required:v.pendingPickup?.cardId===c.id,extraClass:incoming?'fx-hand-in':'',style:`--rot:${rot}deg;--drop:${drop}px;--enter-delay:${delay}ms`})}).join('');"
app = replace_once(app, old_hand, new_hand, 'hand animation')

app = replace_once(
    app,
    "const stateCls=[o.hand?'selectable':'',o.selected?'selected':'',o.required?'required':''].join(' ');",
    "const stateCls=[o.hand?'selectable':'',o.selected?'selected':'',o.required?'required':'',o.extraClass||''].join(' ');",
    'card class extension',
)

app = replace_once(
    app,
    "async function returnToMenu(leaveNetwork){clearTimeout(botTimer);if(leaveNetwork&&multiplayer.isActive())await multiplayer.leave();state=null;visibleState=null;mode='idle';localSeat=0;selected.clear();botDifficultyBySeat={};shownRoundKey='';$('#disconnectOverlay').classList.add('hidden');$('#genericModal').classList.add('hidden');openMenu();render()}",
    "async function returnToMenu(leaveNetwork){clearTimeout(botTimer);if(leaveNetwork&&multiplayer.isActive())await multiplayer.leave();state=null;visibleState=null;mode='idle';localSeat=0;selected.clear();botDifficultyBySeat={};shownRoundKey='';fxSnapshot=null;$('#disconnectOverlay').classList.add('hidden');$('#genericModal').classList.add('hidden');openMenu();render()}",
    'menu fx reset',
)
app = replace_once(app, '\nrender();', '\nupdateSoundButton();\nrender();', 'initial sound state')
app_path.write_text(app, encoding='utf-8')

index_path = Path('index.html')
html = index_path.read_text(encoding='utf-8')
html = replace_once(
    html,
    '<div class="top-actions">\n        <button class="icon-button" id="rulesButton" title="Zasady">?</button>',
    '<div class="top-actions">\n        <button class="icon-button" id="soundButton" title="Dźwięki: włączone" aria-label="Włącz lub wyłącz dźwięki" aria-pressed="true">🔊</button>\n        <button class="icon-button" id="rulesButton" title="Zasady">?</button>',
    'sound button html',
)

motion_css = r'''
/* Motion, feedback and hand/button clearance */
.hand{--hand-lift:-14px;padding-bottom:14px}.hand .card{transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + var(--hand-lift)));will-change:transform,filter}.hand .card.selectable:hover{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 15px));filter:drop-shadow(0 0 9px rgba(215,180,94,.58))}.hand .card.selected{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 21px));outline:3px solid var(--gold);outline-offset:2px}.action-dock{position:relative;z-index:20;margin-top:10px}.icon-button.muted{opacity:.58;filter:saturate(.55)}.action:active,.menu-button:active,.icon-button:active{transform:translateY(1px) scale(.98)}
.fx-hand-in{animation:fxHandIn .34s cubic-bezier(.18,.82,.26,1.08) both;animation-delay:var(--enter-delay,0ms)}.fx-discard-in{animation:fxDiscardIn .3s cubic-bezier(.2,.8,.25,1.05) both}.fx-meld-in{animation:fxMeldIn .32s cubic-bezier(.16,.84,.28,1.1) both}.fx-meld-card{animation:fxMeldCard .32s cubic-bezier(.2,.82,.26,1.08) both}.fx-stock-pulse{animation:fxStockPulse .32s ease-out}.turn-message.hot{box-shadow:0 0 0 1px rgba(215,180,94,.08),0 5px 18px rgba(0,0,0,.16)}
@keyframes fxHandIn{0%{opacity:0;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + 58px)) scale(.82)}70%{opacity:1;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + var(--hand-lift) - 5px)) scale(1.02)}100%{opacity:1;transform:rotate(var(--rot,0deg)) translateY(calc(var(--drop,0px) + var(--hand-lift))) scale(1)}}
@keyframes fxDiscardIn{0%{opacity:0;transform:translate(54px,-42px) rotate(10deg) scale(.82)}72%{opacity:1;transform:translate(-3px,2px) rotate(-1deg) scale(1.02)}100%{opacity:1;transform:none}}
@keyframes fxMeldIn{0%{opacity:.35;transform:scale(.9)}70%{transform:scale(1.025)}100%{opacity:1;transform:scale(1)}}
@keyframes fxMeldCard{0%{opacity:0;transform:translateY(24px) scale(.85)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes fxStockPulse{0%{transform:scale(1)}45%{transform:translateY(-4px) scale(1.035);filter:brightness(1.14)}100%{transform:scale(1);filter:none}}
@media(max-width:760px){.hand{--hand-lift:-10px;padding-bottom:10px}.hand .card.selectable:hover{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 11px))}.hand .card.selected{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 16px))}.action-dock{margin-top:8px}}
@media(max-height:480px) and (orientation:landscape){.hand{--hand-lift:-7px;padding-bottom:4px}.hand .card.selectable:hover{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 7px))}.hand .card.selected{transform:rotate(var(--rot,0deg)) translateY(calc(var(--hand-lift) - 10px))}}
'''
html = replace_once(html, '@media(prefers-reduced-motion:reduce){', motion_css + '\n@media(prefers-reduced-motion:reduce){', 'motion css')
index_path.write_text(html, encoding='utf-8')

test_path = Path('tests/ui.spec.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    "const metrics=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hand:document.querySelector('#hand')?.getBoundingClientRect(),table:document.querySelector('.table-stage')?.getBoundingClientRect()}));\n    expect(metrics.sw).toBeLessThanOrEqual(metrics.cw+2);expect(metrics.hand.width).toBeGreaterThan(150);expect(metrics.table.width).toBeGreaterThan(300);",
    "const metrics=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#hand .card')],dock=document.querySelector('.action-dock');return{sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hand:document.querySelector('#hand')?.getBoundingClientRect(),table:document.querySelector('.table-stage')?.getBoundingClientRect(),cardBottom:Math.max(0,...cards.map(card=>card.getBoundingClientRect().bottom)),dockTop:dock?.getBoundingClientRect().top}});\n    expect(metrics.sw).toBeLessThanOrEqual(metrics.cw+2);expect(metrics.hand.width).toBeGreaterThan(150);expect(metrics.table.width).toBeGreaterThan(300);expect(metrics.cardBottom).toBeLessThanOrEqual(metrics.dockTop+1);",
    'button clearance test',
)
tests += "\ntest('sound toggle is available and persistent in UI',async({page})=>{await page.goto('/');const button=page.locator('#soundButton');await expect(button).toBeVisible();await expect(button).toHaveAttribute('aria-pressed','true');await button.click();await expect(button).toHaveAttribute('aria-pressed','false');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');});\n"
test_path.write_text(tests, encoding='utf-8')

subprocess.run(['npx', 'esbuild', 'src/app.js', '--bundle', '--format=iife', '--target=es2020', '--minify', '--outfile=/tmp/rummy500-bundle.js'], check=True)
html = index_path.read_text(encoding='utf-8')
js = Path('/tmp/rummy500-bundle.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
start = html.find('<script id="rummy500-app">')
if start < 0:
    raise SystemExit('Inline app marker missing')
end = html.find('</script>', start)
if end < 0:
    raise SystemExit('Inline app close missing')
html = html[:start] + '<script id="rummy500-app">\n' + js + '\n</script>' + html[end + 9:]
if 'src/app.js' in html:
    raise SystemExit('External app reference leaked into standalone HTML')
index_path.write_text(html, encoding='utf-8')
