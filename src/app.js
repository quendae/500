import { createGame, executePlayerAction, meldOptions, layoffOptions, publicStateForSeat, cardLabel, suitSymbol, RuleError } from './engine.js';
import { chooseBotAction } from './bots.js';
import { createMultiplayer } from './multiplayer.js';

let state=null,visibleState=null,localSeat=0,mode='idle',sortMode='suit',selected=new Set(),botDifficultyBySeat={},botTimer=null,shownRoundKey='',soundEnabled=readSoundSetting(),audioCtx=null,noiseBuffer=null,fxSnapshot=null,renderFx=null;
const $=s=>document.querySelector(s);
const handEl=$('#hand'), discardEl=$('#discardFan'), meldsEl=$('#melds'), opponentsEl=$('#opponents');

const ERRORS={NOT_YOUR_TURN:'To nie jest Twoja tura.',MUST_DRAW_FIRST:'Najpierw dobierz kartę.',MUST_PLAY_OR_DISCARD:'Najpierw zakończ bieżącą turę.',INVALID_MELD:'Te karty nie tworzą prawidłowego układu.',INVALID_LAYOFF:'Tej karty nie można dołożyć do wybranego układu.',MUST_USE_PICKUP_CARD:'Najgłębsza karta zabrana ze stosu odrzuconych musi zostać natychmiast wyłożona.',CANNOT_REDISCARD_TOP_PICKUP:'Nie możesz od razu odrzucić tej samej karty zabranej z wierzchu stosu.',ILLEGAL_DEEP_PICKUP:'Nie możesz zabrać tych kart — najgłębszej wybranej karty nie da się od razu wyłożyć.',CARD_NOT_OWNED:'Nie masz tej karty.',STOCK_NOT_EMPTY:'Stos dobierania nie jest pusty.'};

function readSoundSetting(){try{return localStorage.getItem('rummy500-sound')!=='off'}catch{return true}}
function saveSoundSetting(){try{localStorage.setItem('rummy500-sound',soundEnabled?'on':'off')}catch{}}
function updateSoundButton(){const b=$('#soundButton');if(!b)return;b.textContent=soundEnabled?'🔊':'🔇';b.title=soundEnabled?'Dźwięki: włączone':'Dźwięki: wyłączone';b.setAttribute('aria-pressed',String(soundEnabled));b.classList.toggle('muted',!soundEnabled)}
function unlockAudio(){if(!soundEnabled)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;try{if(!audioCtx)audioCtx=new AC();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{})}catch{}}
function audioTone(freq,duration=0.08,gain=0.025,type='sine',delay=0,endFreq=null){if(!audioCtx||audioCtx.state!=='running')return;const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),t+duration);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t+duration);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+duration+0.02)}
function audioNoise(duration=0.09,gain=0.018,delay=0,frequency=1300){if(!audioCtx||audioCtx.state!=='running')return;if(!noiseBuffer){noiseBuffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*.28),audioCtx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)}const t=audioCtx.currentTime+delay,s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=noiseBuffer;f.type='bandpass';f.frequency.value=frequency;f.Q.value=.75;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+duration);s.connect(f).connect(g).connect(audioCtx.destination);s.start(t);s.stop(t+duration+.02)}
function sfx(name){if(!soundEnabled)return;unlockAudio();if(!audioCtx||audioCtx.state!=='running')return;switch(name){case 'select':audioTone(720,.035,.012,'sine');break;case 'toggle':audioTone(540,.05,.018,'sine');audioTone(760,.06,.014,'sine',.035);break;case 'draw':audioNoise(.11,.021,0,1500);audioTone(360,.1,.016,'triangle',.015,520);break;case 'discard':audioNoise(.055,.024,0,850);audioTone(150,.075,.022,'triangle',0,95);break;case 'meld':audioTone(520,.11,.021,'sine');audioTone(660,.12,.019,'sine',.055);audioTone(880,.14,.016,'sine',.105);break;case 'turn':audioTone(620,.06,.016,'sine');break;case 'round':audioTone(420,.12,.018,'triangle');audioTone(560,.14,.018,'triangle',.08);break;case 'win':audioTone(440,.15,.02,'triangle');audioTone(554,.17,.02,'triangle',.09);audioTone(659,.22,.021,'triangle',.18);break;case 'deal':audioNoise(.14,.014,0,1650);audioTone(310,.07,.012,'triangle',.02,390);audioTone(390,.07,.011,'triangle',.11,480);break}}

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



const multiplayer=createMultiplayer({
  getState:()=>state,
  stateForSeat:(s,seat)=>publicStateForSeat(s,seat),
  onHostStart:cfg=>{
    mode='multi-host';localSeat=0;botDifficultyBySeat=cfg.botDifficulties||{};state=createGame({playerCount:cfg.playerCount,names:cfg.names,types:cfg.types,targetScore:500});visibleState=null;selected.clear();fxSnapshot=null;unlockAudio();closeMenu();render();scheduleAuthority();
  },
  onGuestStart:seat=>{mode='multi-guest';localSeat=seat;state=null;visibleState=null;selected.clear();fxSnapshot=null;closeMenu();render();},
  onGuestState:(view,seat)=>{mode='multi-guest';localSeat=seat;visibleState=view;selected.forEach(id=>{if(!view.players[seat]?.hand.some(c=>c.id===id))selected.delete(id)});closeMenu();render();},
  onRemoteAction:(seat,action,payload)=>{if(!state)return {ok:false,code:'NO_GAME'};const r=executePlayerAction(state,seat,action,payload);render();return r;},
  onAfterBroadcast:()=>scheduleAuthority(),
  onError:msg=>toast(msg),
  describeError:err=>describeError(err),
  onDisconnect:msg=>showDisconnect(msg),
  onLeave:()=>returnToMenu(false)
});

document.addEventListener('pointerdown',unlockAudio,{once:true,capture:true});
$('#soundButton').addEventListener('click',()=>{const next=!soundEnabled;if(!next)sfx('toggle');soundEnabled=next;saveSoundSetting();updateSoundButton();if(next){unlockAudio();sfx('toggle')}});
$('#continueButton').addEventListener('click',continueGame);
$('#singleButton').addEventListener('click',startSingle);
$('#multiplayerButton').addEventListener('click',async()=>{if(multiplayer.isActive())await multiplayer.leave();state=null;visibleState=null;mode='idle';selected.clear();clearTimeout(botTimer);multiplayer.open()});
$('#menuRulesButton').addEventListener('click',showRules);
$('#rulesButton').addEventListener('click',showRules);
$('#menuButton').addEventListener('click',pauseToMenu);
$('#disconnectMenuButton').addEventListener('click',async()=>{await multiplayer.leave();$('#disconnectOverlay').classList.add('hidden');returnToMenu(false)});
$('#stockPile').addEventListener('click',()=>perform('draw-stock'));
$('#endStockButton').addEventListener('click',()=>perform('end-stock'));
$('#meldButton').addEventListener('click',meldSelected);
$('#discardButton').addEventListener('click',discardSelected);
$('#clearSelectionButton').addEventListener('click',()=>{selected.clear();render()});
$('#sortButton').addEventListener('click',()=>{sortMode=sortMode==='suit'?'rank':'suit';render()});

discardEl.addEventListener('click',e=>{const card=e.target.closest('[data-discard-index]');if(card)perform('draw-discard',{index:Number(card.dataset.discardIndex)})});
handEl.addEventListener('click',e=>{const card=e.target.closest('[data-card-id]');if(!card)return;const id=card.dataset.cardId;if(selected.has(id))selected.delete(id);else selected.add(id);sfx('select');render()});
meldsEl.addEventListener('click',async e=>{const m=e.target.closest('[data-meld-id]');if(!m||selected.size!==1)return;const view=getView();if(!view)return;const card=view.players[localSeat]?.hand.find(c=>c.id===[...selected][0]);if(!card)return;const opts=layoffOptions(view,m.dataset.meldId,card);if(!opts.length){toast('Tej karty nie można dołożyć do tego układu.');return}const option=opts.length===1?opts[0]:await chooseOption('Gdzie ma trafić karta?',opts);if(!option)return;perform('layoff',{cardId:card.id,meldId:m.dataset.meldId,optionKey:option.key})});

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-page').forEach(x=>x.classList.remove('active'));$(`#panel${cap(btn.dataset.tab)}`).classList.add('active')}));

$('#genericModal').addEventListener('click',async e=>{
  if(e.target===e.currentTarget||e.target.closest('[data-modal-close]'))closeGeneric();
  if(e.target.closest('[data-next-round]')){const o=$('#genericModal');delete o.dataset.locked;o.classList.add('hidden');shownRoundKey='';await perform('next-round')}
  if(e.target.closest('[data-new-game]')){closeGeneric();returnToMenu(true)}
});

async function startSingle(){
  if(multiplayer.isActive())await multiplayer.leave();
  const playerCount=Number($('#singlePlayers').value),difficulty=$('#botDifficulty').value;const names=['Ty',...Array.from({length:playerCount-1},(_,i)=>`Bot ${i+1}`)];const types=['human',...Array(playerCount-1).fill('bot')];botDifficultyBySeat=Object.fromEntries(Array.from({length:playerCount-1},(_,i)=>[i+1,difficulty]));
  state=createGame({playerCount,names,types,targetScore:500});visibleState=null;localSeat=0;mode='single';selected.clear();shownRoundKey='';fxSnapshot=null;unlockAudio();closeMenu();render();scheduleAuthority();
}

function getView(){return mode==='multi-guest'?visibleState:state}
function isAuthority(){return mode==='single'||mode==='multi-host'}
function canLocalAct(view=getView()){return !!view&&view.currentPlayer===localSeat&&!['roundEnd','gameEnd'].includes(view.phase)&&!(multiplayer.debug().paused)}

async function perform(action,payload={}){
  const view=getView();if(!view&&action!=='next-round')return;
  if(mode==='multi-guest'){
    if(action==='next-round')return toast('Nowe rozdanie uruchamia gospodarz.');
    if(!multiplayer.sendAction(action,payload))toast('Kanał z gospodarzem nie jest gotowy.');return;
  }
  if(!state)return;
  try{
    const result=executePlayerAction(state,localSeat,action,payload);
    if(result?.ok===false){toast(result.code||'Ruch wymaga dodatkowego wyboru.');return result}
    selected.clear();render();
    if(mode==='multi-host')multiplayer.afterHostAction();else scheduleAuthority();
    return result;
  }catch(err){toast(describeError(err));return {ok:false,error:err}}
}

async function meldSelected(){
  const view=getView();if(!view||selected.size<3)return toast('Zaznacz co najmniej 3 karty.');const hand=view.players[localSeat]?.hand||[];const cards=[...selected].map(id=>hand.find(c=>c.id===id)).filter(Boolean);const options=meldOptions(cards);if(!options.length)return toast('Zaznaczone karty nie tworzą układu.');const option=options.length===1?options[0]:await chooseOption('Wybierz interpretację układu',options);if(!option)return;perform('meld',{cardIds:cards.map(c=>c.id),optionKey:option.key});
}
function discardSelected(){if(selected.size!==1)return toast('Zaznacz dokładnie jedną kartę do odrzucenia.');perform('discard',{cardId:[...selected][0]})}

function scheduleAuthority(){
  clearTimeout(botTimer);if(!isAuthority()||!state||['roundEnd','gameEnd'].includes(state.phase))return;const p=state.players[state.currentPlayer];if(p?.type!=='bot')return;
  botTimer=setTimeout(()=>{
    try{const seat=state.currentPlayer,move=chooseBotAction(state,seat,botDifficultyBySeat[seat]||'normal');if(!move)throw new Error('Bot nie znalazł ruchu.');let r=executePlayerAction(state,seat,move.action,move.payload);if(r?.code?.startsWith('AMBIGUOUS_'))r=executePlayerAction(state,seat,move.action,{...move.payload,optionKey:r.options[0].key});render();if(mode==='multi-host')multiplayer.afterHostAction();else scheduleAuthority();}
    catch(err){console.error(err);toast(`Błąd bota: ${describeError(err)}`)}
  },720);
}

function render(){
  const view=getView();renderFx=view?visualDiff(view):null;renderMode();if(!view){renderEmpty();fxSnapshot=null;renderFx=null;updateContinueButton();return}renderHud(view);renderPlayers(view);renderCenter(view);renderHand(view);renderPanel(view);renderRoundModal(view);animateTransfers(view,renderFx);finishVisualFx(view,renderFx);fxSnapshot=snapshotFx(view);saveSession();updateContinueButton();renderFx=null;
}
function snapshotFx(v){return{revision:v.revision,round:v.round,phase:v.phase,currentPlayer:v.currentPlayer,stockCount:v.stock.length,handIds:(v.players[localSeat]?.hand||[]).map(c=>c.id),discardCount:v.discard.length,discardTop:v.discard.at(-1)?.id||null,meldCounts:Object.fromEntries(v.melds.map(m=>[m.id,m.entries.length]))}}
function visualDiff(v){const handIds=(v.players[localSeat]?.hand||[]).map(c=>c.id);if(!fxSnapshot||fxSnapshot.round!==v.round)return{initial:true,newHandIds:new Set(handIds),discardChanged:false,meldIds:new Set(v.melds.map(m=>m.id)),turnChanged:false,stockChanged:false,roundEnded:false};if(fxSnapshot.revision===v.revision)return{initial:false,newHandIds:new Set(),discardChanged:false,meldIds:new Set(),turnChanged:false,stockChanged:false,roundEnded:false};const previousHand=new Set(fxSnapshot.handIds),newHandIds=new Set(handIds.filter(id=>!previousHand.has(id))),discardTop=v.discard.at(-1)?.id||null,meldIds=new Set();for(const m of v.melds)if(fxSnapshot.meldCounts[m.id]!==m.entries.length)meldIds.add(m.id);return{initial:false,newHandIds,discardChanged:v.discard.length!==fxSnapshot.discardCount||discardTop!==fxSnapshot.discardTop,meldIds,turnChanged:v.currentPlayer!==fxSnapshot.currentPlayer,stockChanged:v.stock.length!==fxSnapshot.stockCount,roundEnded:fxSnapshot.phase!==v.phase&&['roundEnd','gameEnd'].includes(v.phase)}}
function pulseClass(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),760)}
function finishVisualFx(v,fx){if(!fx)return;if(fx.stockChanged)pulseClass($('#stockPile'),'fx-stock-pulse');if(fx.initial&&fx.newHandIds.size)sfx('deal');else if(fx.roundEnded)sfx(v.phase==='gameEnd'?'win':'round');else if(fx.meldIds.size)sfx('meld');else if(fx.newHandIds.size)sfx('draw');else if(fx.discardChanged)sfx('discard');else if(fx.turnChanged&&v.currentPlayer===localSeat)sfx('turn')}
function renderMode(){$('#modeBadge').textContent=mode==='single'?'SINGLE':mode==='multi-host'?'ONLINE · HOST':mode==='multi-guest'?'ONLINE · GOŚĆ':'OFFLINE'}
function renderEmpty(){$('#hudStats').innerHTML='';opponentsEl.innerHTML='';handEl.innerHTML='';discardEl.innerHTML='';meldsEl.innerHTML='<div class="status-card"><p>Oczekiwanie na stan gry…</p></div>';$('#localPlayerPlate').innerHTML='';$('#turnMessage').textContent='Łączenie ze stołem…'}
function renderHud(v){const phase=phaseName(v.phase);$('#hudStats').innerHTML=[['ROZDANIE',v.round],['FAZA',phase],['STOS',v.stock.length],['CEL',`${v.targetScore} pkt`]].map(([l,val],i)=>`<div class="hud-stat ${i===1?'active':''}"><small>${l}</small><b>${val}</b></div>`).join('')}
function phaseName(p){return p==='draw'?'Dobieranie':p==='play'?'Wykładanie':p==='roundEnd'?'Koniec rozdania':p==='gameEnd'?'Koniec gry':'Przygotowanie'}
function renderPlayers(v){
  const seats=[];for(let i=1;i<v.playerCount;i++)seats.push((localSeat+i)%v.playerCount);opponentsEl.innerHTML=seats.map(seat=>plate(v.players[seat],v.currentPlayer===seat,false)).join('');$('#localPlayerPlate').innerHTML=plateInner(v.players[localSeat],v.currentPlayer===localSeat,true);$('#localPlayerPlate').classList.toggle('active',v.currentPlayer===localSeat)
}
function plate(p,active,local){return `<div class="player-plate ${active?'active':''}">${plateInner(p,active,local)}</div>`}
function plateInner(p,active,local){if(!p)return '';const count=p.hand?.length||0;return `<div class="plate-top"><span class="avatar">${esc(initials(p.name))}</span><span class="name">${esc(p.name)}</span><span class="plate-score">${p.score} pkt</span></div><small>${local?'Twój fotel':p.type==='bot'?'Bot':'Gracz'} · ${count} kart</small>${local?'':`<div class="mini-hand">${Array.from({length:Math.min(count,7)},()=>'<i class="mini-back"></i>').join('')}<span class="card-count">${count>7?`+${count-7}`:''}</span></div>`}`}
function renderCenter(v){
  $('#stockCount').textContent=`${v.stock.length} kart`;const localTurn=canLocalAct(v);$('#stockPile').disabled=!(localTurn&&v.phase==='draw'&&v.stock.length);$('#endStockButton').classList.toggle('hidden',!(localTurn&&v.phase==='draw'&&!v.stock.length));
  discardEl.innerHTML=v.discard.map((c,i)=>cardHTML(c,{discardIndex:i,clickable:localTurn&&v.phase==='draw',extraClass:renderFx?.discardChanged&&i===v.discard.length-1?'fx-discard-in':''})).join('');requestAnimationFrame(()=>{discardEl.scrollLeft=discardEl.scrollWidth});
  meldsEl.innerHTML=v.melds.length?v.melds.map(m=>meldHTML(v,m)).join(''):'<div class="status-card"><p>Brak układów. Set: 3–4 karty tej samej rangi. Sekwens: min. 3 kolejne karty jednego koloru.</p></div>';
}
function meldHTML(v,m){const fresh=renderFx?.meldIds?.has(m.id);return `<div class="meld ${fresh?'fx-meld-in':''}" data-meld-id="${m.id}"><div class="meld-head"><span>${m.kind==='set'?'GRUPA':'SEKWENS'}</span><span>${esc(v.players[m.createdBy]?.name||'')}</span></div><div class="meld-cards">${m.entries.map(e=>cardHTML(e.card,{small:true,owner:e.ownerSeat,extraClass:fresh?'fx-meld-card':'',jokerMap:e.card.joker&&m.kind==='run'?rankFromNum(e.representedRank)+suitSymbol(m.suit):''})).join('')}</div></div>`}
function renderHand(v){
  const p=v.players[localSeat];if(!p){handEl.innerHTML='';return}const cards=sortCards([...p.hand]);const n=cards.length;handEl.innerHTML=cards.map((c,i)=>{const rot=Math.max(-10,Math.min(10,(i-(n-1)/2)*1.25)),drop=Math.abs(i-(n-1)/2)*.45,incoming=renderFx?.newHandIds?.has(c.id),delay=renderFx?.initial?Math.min(i,12)*28:0;return cardHTML(c,{hand:true,selected:selected.has(c.id),required:v.pendingPickup?.cardId===c.id,extraClass:incoming?'fx-hand-in':'',style:`--rot:${rot}deg;--drop:${drop}px;--enter-delay:${delay}ms`})}).join('');
  const active=canLocalAct(v),play=active&&v.phase==='play';$('#meldButton').disabled=!(play&&selected.size>=3);$('#discardButton').disabled=!(play&&selected.size===1&&!v.pendingPickup);$('#clearSelectionButton').disabled=!selected.size;$('#sortButton').textContent=`Sortuj: ${sortMode==='suit'?'kolor':'ranga'}`;
  let message;if(v.phase==='roundEnd'||v.phase==='gameEnd')message='Rozdanie zakończone.';else if(v.currentPlayer!==localSeat)message=`Ruch: ${v.players[v.currentPlayer]?.name}`;else if(v.phase==='draw')message=v.stock.length?'Dobierz ze stosu albo z odrzuconych.':'Stos pusty — dobierz z odrzuconych albo zakończ rozdanie.';else if(v.pendingPickup)message=`Wyłóż oznaczoną kartę (${cardLabel(p.hand.find(c=>c.id===v.pendingPickup.cardId))}).`;else message='Możesz wykładać, dokładać do układów lub odrzucić kartę.';$('#turnMessage').textContent=message;$('#turnMessage').classList.toggle('hot',v.currentPlayer===localSeat)
}
function renderPanel(v){
  const p=v.players[v.currentPlayer];let title='Oczekiwanie',text='';if(v.phase==='draw'){title=`${p?.name}: dobieranie`;text='Można dobrać kartę z zakrytego stosu albo wybraną kartę ze stosu odrzuconych. Przy doborze z głębi trzeba natychmiast wyłożyć najgłębszą zabraną kartę.'}else if(v.phase==='play'){title=`${p?.name}: wykładanie`;text=v.pendingPickup?'Najgłębsza zabrana karta musi teraz wejść do nowego lub istniejącego układu.':'Po dobraniu można tworzyć układy i dokładać karty. Turę kończy odrzucenie jednej karty.'}else{text='Rozdanie zostało zakończone i podliczone.'}
  $('#panelTurn').innerHTML=`<div class="status-card"><div class="eyebrow">AKTUALNA TURA</div><strong>${esc(title)}</strong><p>${esc(text)}</p></div><div class="status-card"><div class="eyebrow">PODPOWIEDŹ</div><p>Zaznacz 3+ karty i wybierz „Wyłóż”. Aby dołożyć pojedynczą kartę, zaznacz ją i kliknij wybrany układ na stole.</p></div>`;
  $('#panelScore').innerHTML=v.players.map((x,i)=>`<div class="score-row ${i===v.currentPlayer?'active':''}"><span>${esc(x.name)}</span><span>${x.score} pkt</span></div>`).join('');
  $('#panelLog').innerHTML=[...v.log].slice(-80).reverse().map(x=>`<div class="log-item">${esc(x.text)}</div>`).join('');
}
function renderRoundModal(v){if(!['roundEnd','gameEnd'].includes(v.phase)||!v.lastRound)return;const key=`${v.round}:${v.phase}:${v.revision}`;if(shownRoundKey===key)return;shownRoundKey=key;const winner=v.phase==='gameEnd'?v.players[v.winner]:null;const rows=v.lastRound.results.map(r=>`<tr><td>${esc(v.players[r.seat].name)}</td><td>+${r.melded}</td><td>−${r.handPenalty}</td><td class="${r.delta>=0?'positive':'negative'}">${r.delta>=0?'+':''}${r.delta}</td><td>${r.total}</td></tr>`).join('');const guest=mode==='multi-guest';openGeneric(`<div class="eyebrow">${winner?'KONIEC GRY':'KONIEC ROZDANIA'}</div><h2>${winner?`${esc(winner.name)} wygrywa!`:`Rozdanie ${v.round} podliczone`}</h2><table class="round-table"><thead><tr><th>Gracz</th><th>Wyłożone</th><th>Ręka</th><th>Runda</th><th>Razem</th></tr></thead><tbody>${rows}</tbody></table>${winner?'<button class="action primary" data-new-game>Nowa gra</button>':guest?'<p>Oczekiwanie, aż gospodarz rozpocznie kolejne rozdanie.</p>':'<button class="action primary" data-next-round>Następne rozdanie</button>'}`,false)}

function cardHTML(c,o={}){if(!c||c.hidden)return `<div class="card-back" ${o.style?`style="${o.style}"`:''}></div>`;const cls=c.joker?'joker':c.suit==='H'?'red':c.suit==='D'?'blue':c.suit==='C'?'green':'';const attrs=[o.hand?`data-card-id="${c.id}"`:'',Number.isInteger(o.discardIndex)?`data-discard-index="${o.discardIndex}"`:'',o.style?`style="${o.style}"`:''].filter(Boolean).join(' ');const stateCls=[o.hand?'selectable':'',o.selected?'selected':'',o.required?'required':'',o.extraClass||''].join(' ');if(c.joker)return `<div class="card ${cls} ${stateCls}" ${attrs}><div class="rank">★</div><div class="pip">J</div><div class="bottom-corner">★</div>${o.jokerMap?`<span class="joker-map">${esc(o.jokerMap)}</span>`:''}${o.owner!=null?'<i class="owner-dot"></i>':''}</div>`;const sym=suitSymbol(c.suit);return `<div class="card ${cls} ${stateCls}" ${attrs}><div><div class="rank">${c.rank}</div><div class="corner">${sym}</div></div><div class="pip">${sym}</div><div class="bottom-corner"><div class="rank">${c.rank}</div><div class="corner">${sym}</div></div>${o.owner!=null?'<i class="owner-dot"></i>':''}</div>`}
function sortCards(cards){const suitOrder={C:0,D:1,H:2,S:3};const rankOrder={A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13,JOKER:99};return cards.sort((a,b)=>sortMode==='suit'?((suitOrder[a.suit]??9)-(suitOrder[b.suit]??9)||rankOrder[a.rank]-rankOrder[b.rank]):(rankOrder[a.rank]-rankOrder[b.rank]||(suitOrder[a.suit]??9)-(suitOrder[b.suit]??9)))}

function showRules(){openGeneric(`<header class="modal-head"><div><div class="eyebrow">ZASADY STOŁU</div><h2>Jak grać w Remika 500</h2></div><button class="modal-close" data-modal-close>×</button></header><ol class="rules-list"><li>Gra dla 2–7 osób. Przy 2 graczach rozdaje się po 13 kart, przy 3+ po 7.</li><li>Twórz <b>grupy</b> 3–4 kart tej samej rangi albo <b>sekwensy</b> co najmniej 3 kolejnych kart jednego koloru. As może być niski lub wysoki, ale bez zawijania K–A–2.</li><li>Jokery są dzikie i przy wyłożeniu otrzymują stałe znaczenie. Gdy interpretacji jest kilka, gra poprosi o wybór.</li><li>Na początku tury dobierz z zakrytego stosu albo ze stosu odrzuconych. Możesz sięgnąć w głąb, ale bierzesz także wszystkie karty leżące nad wybraną i musisz natychmiast wyłożyć tę najgłębszą.</li><li>Możesz dokładać karty do własnych i cudzych układów; punkty za dokładane karty zostają przy graczu, który je dołożył.</li><li>Turę kończy odrzucenie. Jeśli dobrałeś tylko wierzchnią kartę odrzuconych, nie możesz jej natychmiast odrzucić z powrotem.</li><li>Punkty: 2–10 według wartości, J/Q/K po 10, As i Joker po 15; niski As w sekwensie A–2–3… jest wart 1. Od wyłożonych punktów odejmuje się wartość kart pozostałych w ręce.</li><li>Partia kończy się po rozdaniu, w którym ktoś osiągnie co najmniej 500; wygrywa najwyższy wynik. Remis na prowadzeniu oznacza kolejne rozdanie.</li></ol><p><small>Wersja stołowa używa wariantu bez dodatkowej reakcji „Rummy!” poza normalną kolejnością tur.</small></p>`)}
function chooseOption(title,options){return new Promise(resolve=>{const overlay=$('#genericModal'),card=$('#genericModalCard');overlay.classList.remove('hidden');card.innerHTML=`<div class="eyebrow">WYBÓR UKŁADU</div><h2>${esc(title)}</h2><p>Joker może reprezentować różne karty. Wybierz interpretację, która ma zostać zapamiętana.</p><div class="choice-grid">${options.map((o,i)=>`<button class="action ${i===0?'primary':''}" data-choice="${esc(o.key)}">${esc(o.label)}</button>`).join('')}</div><button class="action ghost" data-choice-cancel>Anuluj</button>`;const handler=e=>{const b=e.target.closest('[data-choice],[data-choice-cancel]');if(!b)return;overlay.removeEventListener('click',handler);overlay.classList.add('hidden');resolve(b.dataset.choice?options.find(o=>o.key===b.dataset.choice):null)};overlay.addEventListener('click',handler)})}
function openGeneric(html,closable=true){const o=$('#genericModal');$('#genericModalCard').innerHTML=html;o.classList.remove('hidden');if(!closable)o.dataset.locked='1';else delete o.dataset.locked}
function closeGeneric(){const o=$('#genericModal');if(o.dataset.locked==='1')return;o.classList.add('hidden')}
function showDisconnect(msg){$('#disconnectText').textContent=msg;$('#disconnectOverlay').classList.remove('hidden')}
function closeMenu(){$('#mainMenu').classList.remove('open');$('#mainMenu').classList.add('hidden')}
function openMenu(){$('#mainMenu').classList.remove('hidden');$('#mainMenu').classList.add('open');updateContinueButton()}
async function returnToMenu(leaveNetwork){clearTimeout(botTimer);if(leaveNetwork&&multiplayer.isActive())await multiplayer.leave();state=null;visibleState=null;mode='idle';localSeat=0;selected.clear();botDifficultyBySeat={};shownRoundKey='';fxSnapshot=null;$('#disconnectOverlay').classList.add('hidden');$('#genericModal').classList.add('hidden');openMenu();render()}
function describeError(err){if(err instanceof RuleError)return ERRORS[err.code]||err.code;return ERRORS[err?.code]||String(err?.message||err||'Nieprawidłowy ruch.')}
let toastTimer;function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function rankFromNum(n){return n===1||n===14?'A':n===11?'J':n===12?'Q':n===13?'K':String(n)}

updateSoundButton();
updateContinueButton();
render();
