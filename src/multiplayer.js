const RTC_CONFIG={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
const SIGNAL_TIMEOUT=12000;
const ALLOWED_ACTIONS=new Set(['draw-stock','draw-discard','meld','layoff','discard','end-stock']);

export function createMultiplayer(callbacks={}){
  const modal=document.getElementById('multiplayerModal');
  const mp={role:null,room:'',auth:'',hostToken:'',nick:'',seat:null,inGame:false,paused:false,playerCount:4,
    peers:new Map(),guestPc:null,guestChannel:null,signalSocket:null,names:Array(7).fill(''),bots:new Map(),defaultBotDifficulty:'normal',lastRevision:0,remoteSnapshot:null};

  const api={open,leave,isActive:()=>!!mp.role,isHost:()=>mp.role==='host',isGuest:()=>mp.role==='guest',isInGame:()=>mp.inGame,
    localSeat:()=>mp.seat??0,sendAction,broadcastState,afterHostAction,debug:()=>mp};

  modal.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-mp-action]'); if(!btn)return;
    const action=btn.dataset.mpAction;
    try{
      if(action==='close'){ if(!mp.role) hide(); else if(!mp.inGame) await leave(); return; }
      if(action==='create') return await createRoom();
      if(action==='join') return await joinRoom();
      if(action==='copy') return await navigator.clipboard?.writeText(mp.room);
      if(action==='leave') return await leave();
      if(action==='start') return startHostGame();
      if(action==='add-bot'){ const seat=Number(btn.dataset.seat); if(freeSeat(seat)){mp.bots.set(seat,mp.defaultBotDifficulty);syncLobby();} }
      if(action==='remove-bot'){ mp.bots.delete(Number(btn.dataset.seat));syncLobby(); }
      if(action==='fill-bots'){ for(let s=1;s<mp.playerCount;s++) if(freeSeat(s)) mp.bots.set(s,mp.defaultBotDifficulty);syncLobby(); }
    }catch(err){ setStatus(humanError(err),true); }
  });
  modal.addEventListener('change',e=>{
    if(e.target.id==='mpPlayerCount'){
      const next=Number(e.target.value); const occupied=[...mp.peers.values()].filter(p=>p.pc?.connectionState!=='closed').map(p=>p.seat).filter(Number.isInteger);
      if(occupied.some(s=>s>=next)||[...mp.bots.keys()].some(s=>s>=next)){e.target.value=mp.playerCount;setStatus('Najpierw zwolnij miejsca poza nowym limitem.',true);return;}
      mp.playerCount=next; syncLobby();
    }
    if(e.target.id==='mpDefaultBotDifficulty'){mp.defaultBotDifficulty=e.target.value;}
    if(e.target.matches('[data-bot-difficulty]')){const seat=Number(e.target.dataset.botDifficulty);if(mp.bots.has(seat)){mp.bots.set(seat,e.target.value);syncLobby();}}
  });

  function open(){ modal.classList.remove('hidden'); render(); }
  function hide(){ modal.classList.add('hidden'); }
  function render(){ modal.innerHTML=mp.role?lobbyMarkup():setupMarkup(); }
  function setupMarkup(){return `<section class="modal-card mp-card"><header class="modal-head"><div><div class="eyebrow">PRYWATNY MULTIPLAYER ONLINE</div><h2>Multiplayer P2P</h2></div><button class="modal-close" data-mp-action="close">×</button></header>
    <p class="mp-lead">Utwórz prywatny pokój lub dołącz kodem. Po zestawieniu połączenia rozgrywka idzie bezpośrednio przez WebRTC.</p>
    <div class="mp-notice">Gospodarz jest autorytatywny: tasuje, waliduje ruchy, prowadzi boty i wysyła każdemu graczowi tylko informacje, które wolno mu zobaczyć.</div>
    <div class="mp-grid">
      <section class="mp-section"><h3>Utwórz pokój</h3>${field('Nick','mpHostNick','Gracz 1')}${passwordField('Hasło opcjonalne','mpHostPassword')}<div class="mp-config"><label class="mp-field"><span>Miejsca</span><select id="mpCreatePlayers">${optsPlayers(4)}</select></label><label class="mp-field"><span>Boty</span><select id="mpCreateDifficulty">${optsDiff('normal')}</select></label></div><button class="action primary" data-mp-action="create">Utwórz pokój</button></section>
      <section class="mp-section"><h3>Dołącz</h3>${field('Nick','mpGuestNick','Gracz 2')}${field('Kod pokoju','mpRoomCode','ABCD-EFGH')}${passwordField('Hasło','mpGuestPassword')}<button class="action primary" data-mp-action="join">Dołącz</button></section>
    </div><p id="mpStatus" class="mp-status"></p></section>`}
  function field(label,id,placeholder){return `<label class="mp-field"><span>${label}</span><input id="${id}" maxlength="20" placeholder="${placeholder}"></label>`}
  function passwordField(label,id){return `<label class="mp-field"><span>${label}</span><input id="${id}" type="password" maxlength="64" autocomplete="off"></label>`}
  function optsPlayers(selected){return Array.from({length:6},(_,i)=>i+2).map(n=>`<option ${n===selected?'selected':''}>${n}</option>`).join('')}
  function optsDiff(selected){return [['easy','Spokojny'],['normal','Normalny'],['hard','Mocny']].map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('')}

  function lobbyMarkup(){const snap=mp.role==='guest'&&mp.remoteSnapshot?mp.remoteSnapshot:lobbySnapshot();const isHost=mp.role==='host';return `<section class="modal-card mp-card"><header class="modal-head"><div><div class="eyebrow">${isHost?'GOSPODARZ':'GOŚĆ'} · PRYWATNY STÓŁ</div><h2>Lobby Remika 500</h2></div><button class="modal-close" data-mp-action="close">×</button></header>
    <div class="room-summary"><div><div class="room-code">${esc(mp.room)}</div><div class="room-meta">${mp.inGame?'Gra trwa':'Połączenie P2P · '+snap.playerCount+' miejsc'}</div></div><button class="action ghost copy-button" data-mp-action="copy">Kopiuj kod</button></div>
    ${isHost&&!mp.inGame?`<div class="mp-config"><label class="mp-field"><span>Liczba miejsc</span><select id="mpPlayerCount">${optsPlayers(mp.playerCount)}</select></label><label class="mp-field"><span>Domyślny poziom botów</span><select id="mpDefaultBotDifficulty">${optsDiff(mp.defaultBotDifficulty)}</select></label></div>`:''}
    <div class="lobby-seats">${snap.seats.map(seatMarkup).join('')}</div>
    <p class="mp-status ${mp.paused?'error':''}">${mp.paused?'Gra wstrzymana — utracono połączenie.':isHost?'Do startu potrzebny jest co najmniej jeden gość online; pozostałe miejsca możesz wypełnić botami.':'Połączono. Gospodarz konfiguruje stół i rozpoczyna grę.'}</p>
    <footer class="mp-footer"><button class="action ghost" data-mp-action="leave">Opuść pokój</button>${isHost&&!mp.inGame?`<button class="action" data-mp-action="fill-bots">Wypełnij botami</button><button class="action primary" data-mp-action="start" ${canStart()?'':'disabled'}>Rozpocznij grę</button>`:''}</footer></section>`}
  function seatMarkup(s){const host=mp.role==='host';let control='';if(host&&!mp.inGame&&s.seat>0){if(s.type==='bot')control=`<div><select data-bot-difficulty="${s.seat}">${optsDiff(s.difficulty)}</select> <button class="action ghost" data-mp-action="remove-bot" data-seat="${s.seat}">Usuń</button></div>`;else if(s.type==='open')control=`<button class="action ghost" data-mp-action="add-bot" data-seat="${s.seat}">Dodaj bota</button>`;}return `<div class="lobby-seat"><div class="seat-no">${s.seat+1}</div><div><strong>${esc(s.name)}</strong><small>${s.subtitle}</small></div>${control}</div>`}

  function lobbySnapshot(){
    const seats=[];for(let s=0;s<mp.playerCount;s++){
      if(s===0){seats.push({seat:s,type:'human',name:mp.names[0]||mp.nick||'Gospodarz',subtitle:'Gospodarz · połączono'});continue;}
      const peer=[...mp.peers.values()].find(p=>p.seat===s&&p.channel?.readyState==='open');
      if(peer)seats.push({seat:s,type:'human',name:peer.nick||mp.names[s]||`Gracz ${s+1}`,subtitle:'Gracz online · połączono'});
      else if(mp.bots.has(s))seats.push({seat:s,type:'bot',name:`Bot ${s}`,subtitle:`Bot gospodarza · ${diffName(mp.bots.get(s))}`,difficulty:mp.bots.get(s)});
      else seats.push({seat:s,type:'open',name:'Wolne miejsce',subtitle:'Oczekuje na gracza lub bota'});
    }return {playerCount:mp.playerCount,seats};
  }
  function diffName(v){return v==='easy'?'spokojny':v==='hard'?'mocny':'normalny'}
  function connectedGuestCount(){return [...mp.peers.values()].filter(p=>p.channel?.readyState==='open'&&p.seat<mp.playerCount).length}
  function seatReserved(seat){return [...mp.peers.values()].some(p=>p.seat===seat&&p.pc?.connectionState!=='closed')}
  function seatReadyHuman(seat){return [...mp.peers.values()].some(p=>p.seat===seat&&p.channel?.readyState==='open')}
  function freeSeat(seat){return seat>0&&seat<mp.playerCount&&!seatReserved(seat)&&!mp.bots.has(seat)}
  function canStart(){if(mp.role!=='host'||connectedGuestCount()<1)return false;for(let s=1;s<mp.playerCount;s++)if(!seatReadyHuman(s)&&!mp.bots.has(s))return false;return true}
  function syncLobby(){if(mp.role!=='host')return render();const snap=lobbySnapshot();for(const peer of mp.peers.values())send(peer.channel,{type:'lobby',snapshot:snap});render()}

  async function createRoom(){
    const nick=normalizeNick(document.getElementById('mpHostNick')?.value||'Gracz 1'); if(!validNick(nick))throw new Error('bad-nick');
    mp.playerCount=Number(document.getElementById('mpCreatePlayers')?.value||4);mp.defaultBotDifficulty=document.getElementById('mpCreateDifficulty')?.value||'normal';
    const password=document.getElementById('mpHostPassword')?.value||''; const room=randomRoom();const auth=await roomVerifier(room,password);
    setStatus('Tworzenie pokoju…');const res=await signalFetch('/api/rooms',{method:'POST',body:JSON.stringify({room,nick,auth,passwordProtected:!!password})});if(!res.ok)throw new Error(`signal-${res.status}`);const data=await res.json();
    Object.assign(mp,{role:'host',room,auth,hostToken:data.hostToken,nick,seat:0});mp.names[0]=nick;render();await openSignal('host');
  }
  async function joinRoom(){
    const nick=normalizeNick(document.getElementById('mpGuestNick')?.value||'Gracz 2');if(!validNick(nick))throw new Error('bad-nick');const room=normalizeRoom(document.getElementById('mpRoomCode')?.value);if(!room)throw new Error('bad-room');
    const password=document.getElementById('mpGuestPassword')?.value||'';const auth=await roomVerifier(room,password);Object.assign(mp,{role:'guest',room,auth,nick,seat:null});render();setStatus('Łączenie z gospodarzem…');await openSignal('guest');
  }
  async function openSignal(role){
    const url=socketUrl(mp.room);const ws=new WebSocket(url);mp.signalSocket=ws;
    return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close()}catch{};reject(new Error('timeout'))}},SIGNAL_TIMEOUT);
      ws.onopen=()=>{};ws.onmessage=async ev=>{let msg;try{msg=JSON.parse(ev.data)}catch{return}
        if(msg.type==='auth-required'){signalSend(role==='host'?{type:'authenticate',role:'host',token:mp.hostToken}:{type:'authenticate',role:'guest',auth:mp.auth,nick:mp.nick});return}
        if(msg.type==='authenticated'){if(!settled){settled=true;clearTimeout(timer);resolve()}if(role==='guest')await createGuestOffer();else{for(const g of msg.guests||[])if(g.offer)await handleHostOffer({type:'offer',guestId:g.id,nick:g.nick,sdp:g.offer});}return}
        await handleSignalMessage(msg);
      };ws.onerror=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('signal-fail'))}};ws.onclose=e=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`signal-${e.code}`))}};
    })
  }
  async function handleSignalMessage(msg){
    if(mp.role==='host'){
      if(msg.type==='offer')return handleHostOffer(msg);
      if(msg.type==='guest-left'){const peer=mp.peers.get(msg.guestId);if(peer)handlePeerClosed(msg.guestId,peer);return}
    }else{
      if(msg.type==='answer'&&mp.guestPc){mp.seat=msg.seat;await mp.guestPc.setRemoteDescription(msg.sdp);return}
      if(msg.type==='rejected'){setStatus(msg.reason==='room_full'?'Pokój jest pełny.':'Gospodarz odrzucił połączenie.',true);callbacks.onError?.(msg.reason==='room_full'?'Pokój jest pełny.':'Nie udało się dołączyć do stołu.');return}
    }
  }
  async function createGuestOffer(){
    const pc=new RTCPeerConnection(RTC_CONFIG);const channel=pc.createDataChannel('rummy500',{ordered:true});mp.guestPc=pc;mp.guestChannel=channel;setupGuestChannel(channel);pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)&&mp.inGame)connectionLost('Połączenie z gospodarzem zostało przerwane.')};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);await waitForIce(pc);signalSend({type:'offer',sdp:pc.localDescription});
  }
  async function handleHostOffer(msg){
    if(mp.peers.has(msg.guestId))return;const seat=firstFreeSeat();if(seat==null){signalSend({type:'reject',guestId:msg.guestId,reason:'room_full'});return}
    const pc=new RTCPeerConnection(RTC_CONFIG);const peer={id:msg.guestId,nick:normalizeNick(msg.nick),seat,pc,channel:null,seen:new Set()};mp.peers.set(msg.guestId,peer);mp.names[seat]=peer.nick;
    pc.ondatachannel=e=>{peer.channel=e.channel;setupHostChannel(peer)};pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState))handlePeerClosed(msg.guestId,peer)};
    await pc.setRemoteDescription(msg.sdp);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await waitForIce(pc);signalSend({type:'answer',guestId:msg.guestId,seat,sdp:pc.localDescription});render();
  }
  function firstFreeSeat(){for(let s=1;s<mp.playerCount;s++)if(freeSeat(s))return s;return null}
  function setupHostChannel(peer){const ch=peer.channel;ch.onopen=()=>{send(ch,{type:'welcome',seat:peer.seat,snapshot:lobbySnapshot()});syncLobby()};ch.onmessage=e=>handleHostData(peer,e.data);ch.onclose=()=>handlePeerClosed(peer.id,peer);ch.onerror=()=>handlePeerClosed(peer.id,peer)}
  async function handleHostData(peer,raw){let msg;try{msg=JSON.parse(raw)}catch{return}if(msg.type!=='action'||!mp.inGame||mp.paused)return;if(!ALLOWED_ACTIONS.has(msg.action)){send(peer.channel,{type:'error',message:'Niedozwolona akcja.'});return}
    const id=String(msg.id||'');if(id&&peer.seen.has(id))return;if(id){peer.seen.add(id);if(peer.seen.size>200)peer.seen.delete(peer.seen.values().next().value)}
    try{const result=await callbacks.onRemoteAction?.(peer.seat,msg.action,msg.payload||{});if(result?.ok===false){send(peer.channel,{type:'error',message:result.message||result.code||'Ruch odrzucony.'});return}afterHostAction()}catch(err){send(peer.channel,{type:'error',message:callbacks.describeError?.(err)||err.code||'Ruch odrzucony.'})}}
  function setupGuestChannel(ch){ch.onopen=()=>{setStatus('Połączono z gospodarzem.');signalSend({type:'connected'})};ch.onmessage=e=>handleGuestData(e.data);ch.onclose=()=>{if(mp.inGame)connectionLost('Połączenie z gospodarzem zostało przerwane.')};ch.onerror=()=>{if(mp.inGame)connectionLost('Błąd kanału WebRTC.')}}
  function handleGuestData(raw){let msg;try{msg=JSON.parse(raw)}catch{return}
    if(msg.type==='welcome'){mp.seat=msg.seat;applyLobbySnapshot(msg.snapshot);render();return}
    if(msg.type==='lobby'){applyLobbySnapshot(msg.snapshot);render();return}
    if(msg.type==='start'){mp.inGame=true;hide();callbacks.onGuestStart?.(mp.seat);return}
    if(msg.type==='state'){if((msg.revision||0)<=mp.lastRevision)return;mp.lastRevision=msg.revision||0;callbacks.onGuestState?.(msg.state,mp.seat);return}
    if(msg.type==='error'){callbacks.onError?.(msg.message||'Ruch odrzucony.');return}
    if(msg.type==='paused')connectionLost(msg.message||'Gra została wstrzymana.');
  }
  function applyLobbySnapshot(snap){if(!snap)return;mp.remoteSnapshot=snap;mp.playerCount=snap.playerCount||mp.playerCount;for(const s of snap.seats||[])mp.names[s.seat]=s.name||'';}

  function startHostGame(){if(!canStart())return;const names=[],types=[],botDifficulties={};for(let s=0;s<mp.playerCount;s++){if(s===0){names[s]=mp.names[0]||mp.nick;types[s]='human';continue}const peer=[...mp.peers.values()].find(p=>p.seat===s&&p.channel?.readyState==='open');if(peer){names[s]=peer.nick;types[s]='human'}else{names[s]=`Bot ${s}`;types[s]='bot';botDifficulties[s]=mp.bots.get(s)||mp.defaultBotDifficulty}}
    callbacks.onHostStart?.({playerCount:mp.playerCount,names,types,botDifficulties});mp.inGame=true;for(const peer of mp.peers.values())if(peer.channel?.readyState==='open')send(peer.channel,{type:'start'});broadcastState();signalSend({type:'close-room'});hide();
  }
  function sendAction(action,payload={}){if(mp.role!=='guest'||!mp.inGame||mp.paused)return false;if(mp.guestChannel?.readyState!=='open')return false;send(mp.guestChannel,{type:'action',id:crypto.randomUUID(),action,payload});return true}
  function afterHostAction(){if(mp.role==='host'&&mp.inGame){broadcastState();callbacks.onAfterBroadcast?.()}}
  function broadcastState(){if(mp.role!=='host'||!mp.inGame)return;const authoritative=callbacks.getState?.();if(!authoritative)return;for(const peer of mp.peers.values())if(peer.channel?.readyState==='open'){const view=callbacks.stateForSeat?.(authoritative,peer.seat);send(peer.channel,{type:'state',revision:authoritative.revision||0,state:view})}}

  function handlePeerClosed(id,peer){if(!mp.peers.has(id))return;mp.peers.delete(id);mp.names[peer.seat]='';try{peer.channel?.close()}catch{}try{peer.pc?.close()}catch{}if(mp.inGame){mp.paused=true;for(const p of mp.peers.values())send(p.channel,{type:'paused',message:'Jeden z graczy stracił połączenie.'});connectionLost(`${peer.nick||'Gracz'} opuścił stół.`)}else syncLobby()}
  function connectionLost(message){mp.paused=true;callbacks.onDisconnect?.(message);render()}
  async function leave(){
    if(mp.role==='host')signalSend({type:'close-room'});else signalSend({type:'leave'});for(const p of mp.peers.values()){try{p.channel?.close()}catch{}try{p.pc?.close()}catch{}}try{mp.guestChannel?.close()}catch{}try{mp.guestPc?.close()}catch{}try{mp.signalSocket?.close()}catch{}
    Object.assign(mp,{role:null,room:'',auth:'',hostToken:'',nick:'',seat:null,inGame:false,paused:false,playerCount:4,peers:new Map(),guestPc:null,guestChannel:null,signalSocket:null,names:Array(7).fill(''),bots:new Map(),defaultBotDifficulty:'normal',lastRevision:0,remoteSnapshot:null});hide();callbacks.onLeave?.();
  }

  function send(ch,value){try{if(ch?.readyState==='open')ch.send(JSON.stringify(value))}catch{}}
  function signalSend(value){try{if(mp.signalSocket?.readyState===WebSocket.OPEN)mp.signalSocket.send(JSON.stringify(value))}catch{}}
  function setStatus(message,error=false){const el=document.getElementById('mpStatus');if(el){el.textContent=message||'';el.classList.toggle('error',error)}}
  function humanError(err){const s=String(err?.message||err||'');if(s.includes('bad-nick'))return 'Nick musi mieć 3–20 znaków.';if(s.includes('bad-room'))return 'Wpisz pełny kod pokoju.';if(s.includes('4003'))return 'Nieprawidłowy kod pokoju lub hasło.';if(s.includes('4009')||s.includes('room_full'))return 'Pokój jest pełny.';if(s.includes('404'))return 'Pokój nie istnieje lub wygasł.';if(s.includes('timeout'))return 'Usługa sygnalizacyjna nie odpowiedziała.';return 'Nie udało się zestawić multiplayera.'}
  function normalizeNick(v){return String(v||'').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/\s+/g,' ').trim()}
  function validNick(v){const n=normalizeNick(v);return Array.from(n).length>=3&&Array.from(n).length<=20&&!/https?:|www\.|[<>@]/iu.test(n)&&/^[\p{L}\p{N} _-]+$/u.test(n)}
  function normalizeRoom(v){const raw=String(v||'').toUpperCase().replace(/[^A-Z2-9]/g,'');return raw.length===8?`${raw.slice(0,4)}-${raw.slice(4)}`:''}
  function randomRoom(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=new Uint8Array(8);crypto.getRandomValues(b);const raw=Array.from(b,x=>a[x%a.length]).join('');return `${raw.slice(0,4)}-${raw.slice(4)}`}
  async function roomVerifier(room,password){const enc=new TextEncoder();const material=await crypto.subtle.importKey('raw',enc.encode(password||''),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(`rummy500-p2p-v1|${room}`),iterations:120000,hash:'SHA-256'},material,256);return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('')}
  function signalingBase(){const c=String(document.querySelector('meta[name="rummy500-signaling-url"]')?.content||'').trim().replace(/\/$/,'');if(c)return c;return ['http:','https:'].includes(location.protocol)?location.origin:''}
  async function signalFetch(path,options={}){const base=signalingBase();if(!base)throw new Error('signaling-unavailable');const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),SIGNAL_TIMEOUT);try{return await fetch(new URL(path,base),{...options,signal:ctl.signal,headers:{'content-type':'application/json',...(options.headers||{})}})}finally{clearTimeout(timer)}}
  function socketUrl(room){const base=signalingBase();if(!base)throw new Error('signaling-unavailable');const u=new URL(`/api/rooms/${room}/socket`,base);u.protocol=u.protocol==='https:'?'wss:':'ws:';return u}
  function waitForIce(pc){if(pc.iceGatheringState==='complete')return Promise.resolve();return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;pc.removeEventListener('icegatheringstatechange',check);resolve()};const check=()=>{if(pc.iceGatheringState==='complete')finish()};pc.addEventListener('icegatheringstatechange',check);setTimeout(finish,6500)})}
  function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}
  return api;
}
