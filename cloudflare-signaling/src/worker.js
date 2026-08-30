import { DurableObject } from 'cloudflare:workers';

const ROOM_TTL_MS=30*60*1000;
const ROOM_PATTERN=/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const AUTH_PATTERN=/^[a-f0-9]{64}$/;
const MAX_MESSAGE=96*1024;
const MAX_GUESTS=6;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function normalizeRoom(v){const raw=String(v||'').toUpperCase().replace(/[^A-Z2-9]/g,'');return raw.length===8?`${raw.slice(0,4)}-${raw.slice(4)}`:''}
function randomToken(bytes=24){const d=new Uint8Array(bytes);crypto.getRandomValues(d);let b='';for(const x of d)b+=String.fromCharCode(x);return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function normalizeNick(v){return String(v||'').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/\s+/g,' ').trim()}
function validNick(v){const n=normalizeNick(v),l=Array.from(n).length;return l>=3&&l<=20&&!/https?:|www\.|[<>@]/iu.test(n)&&/^[\p{L}\p{N} _-]+$/u.test(n)}
function validSdp(v,type){return v&&v.type===type&&typeof v.sdp==='string'&&v.sdp.length>20&&v.sdp.length<MAX_MESSAGE}
function sameOrigin(request){const o=request.headers.get('origin');if(!o)return true;try{return new URL(o).host===new URL(request.url).host}catch{return false}}

export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,service:'rummy500-signaling'});
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
    if(!sameOrigin(request))return json({error:'origin_not_allowed'},403);let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
    const room=normalizeRoom(body.room),nick=normalizeNick(body.nick),auth=String(body.auth||'').toLowerCase();if(!ROOM_PATTERN.test(room)||!validNick(nick)||!AUTH_PATTERN.test(auth))return json({error:'invalid_room_data'},400);
    const hostToken=randomToken(),id=env.ROOMS.idFromName(room),stub=env.ROOMS.get(id),expiresAt=Date.now()+ROOM_TTL_MS;
    const r=await stub.fetch('https://room.internal/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room,nick,auth,hostToken,passwordProtected:Boolean(body.passwordProtected),createdAt:Date.now(),expiresAt})});
    if(!r.ok)return json({error:r.status===409?'room_collision':'room_creation_failed'},r.status);return json({room,hostToken,expiresAt},201);
  }
  const m=url.pathname.match(/^\/api\/rooms\/([A-Z2-9-]+)\/socket$/i);if(m&&request.method==='GET'){
    if(!sameOrigin(request))return new Response('Origin not allowed',{status:403});if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Expected WebSocket upgrade',{status:426});const room=normalizeRoom(m[1]);if(!ROOM_PATTERN.test(room))return new Response('Invalid room',{status:400});return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(new Request('https://room.internal/socket',request));
  }
  return json({error:'not_found'},404);
}};

export class SignalingRoom extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx}
  async fetch(request){const url=new URL(request.url);if(url.pathname==='/create'&&request.method==='POST'){const old=await this.ctx.storage.get('meta');if(old&&old.expiresAt>Date.now())return new Response('Room already exists',{status:409});const meta=await request.json();await this.ctx.storage.put({meta,guests:[]});await this.ctx.storage.setAlarm(meta.expiresAt);return new Response(null,{status:204})}
    if(url.pathname!=='/socket')return new Response('Not found',{status:404});const meta=await this.ctx.storage.get('meta');if(!meta||meta.expiresAt<=Date.now())return new Response('Room expired',{status:404});if(this.ctx.getWebSockets().length>=14)return new Response('Too many connections',{status:429});const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment({role:'pending',connectedAt:Date.now()});server.send(JSON.stringify({type:'auth-required',room:meta.room}));return new Response(null,{status:101,webSocket:client})}
  sockets(role,guestId=null){return this.ctx.getWebSockets().filter(s=>{const a=s.deserializeAttachment()||{};return a.role===role&&(guestId===null||a.guestId===guestId)})}
  send(socket,msg){try{if(socket.readyState===1)socket.send(JSON.stringify(msg))}catch{}}
  sendHosts(msg){for(const s of this.sockets('host'))this.send(s,msg)}
  sendGuest(id,msg){for(const s of this.sockets('guest',id))this.send(s,msg)}
  close(socket,code,reason){try{socket.close(code,reason)}catch{}}
  async authenticate(socket,msg){const meta=await this.ctx.storage.get('meta');if(!meta||meta.expiresAt<=Date.now())return this.close(socket,4004,'Room expired');if(msg.role==='host'){if(msg.token!==meta.hostToken)return this.close(socket,4003,'Invalid host token');socket.serializeAttachment({role:'host',connectedAt:Date.now()});const guests=(await this.ctx.storage.get('guests'))||[];this.send(socket,{type:'authenticated',role:'host',room:meta.room,guests:guests.map(({id,nick,offer,connected,seat})=>({id,nick,offer,connected,seat}))});return}
    if(msg.role!=='guest'||String(msg.auth||'').toLowerCase()!==meta.auth||!validNick(msg.nick))return this.close(socket,4003,'Invalid room, password or nickname');const guests=(await this.ctx.storage.get('guests'))||[];if(guests.length>=MAX_GUESTS)return this.close(socket,4009,'Room full');const guest={id:crypto.randomUUID(),nick:normalizeNick(msg.nick),offer:null,answer:null,seat:null,connected:false,joinedAt:Date.now()};guests.push(guest);await this.ctx.storage.put('guests',guests);socket.serializeAttachment({role:'guest',guestId:guest.id,connectedAt:Date.now()});this.send(socket,{type:'authenticated',role:'guest',room:meta.room,guestId:guest.id});this.sendHosts({type:'guest-joined',guestId:guest.id,nick:guest.nick})}
  async webSocketMessage(socket,raw){const text=typeof raw==='string'?raw:new TextDecoder().decode(raw);if(text.length>MAX_MESSAGE)return this.close(socket,4009,'Message too large');let msg;try{msg=JSON.parse(text)}catch{return this.close(socket,4002,'Invalid message')}const a=socket.deserializeAttachment()||{role:'pending'};if(a.role==='pending'){if(msg.type!=='authenticate')return this.close(socket,4003,'Authentication required');return this.authenticate(socket,msg)}if(a.role==='guest')return this.handleGuest(socket,a,msg);if(a.role==='host')return this.handleHost(msg)}
  async handleGuest(socket,a,msg){let guests=(await this.ctx.storage.get('guests'))||[],i=guests.findIndex(g=>g.id===a.guestId);if(i<0)return this.close(socket,4004,'Guest session expired');if(msg.type==='offer'){if(!validSdp(msg.sdp,'offer'))return this.close(socket,4002,'Invalid offer');guests[i].offer=msg.sdp;await this.ctx.storage.put('guests',guests);this.sendHosts({type:'offer',guestId:a.guestId,nick:guests[i].nick,sdp:msg.sdp});return}if(msg.type==='connected'){guests[i].connected=true;await this.ctx.storage.put('guests',guests);this.sendHosts({type:'guest-connected',guestId:a.guestId});return}if(msg.type==='leave'){guests=guests.filter(g=>g.id!==a.guestId);await this.ctx.storage.put('guests',guests);this.sendHosts({type:'guest-left',guestId:a.guestId});this.close(socket,1000,'Left room')}}
  async handleHost(msg){if(msg.type==='answer'){if(!validSdp(msg.sdp,'answer')||!Number.isInteger(msg.seat)||msg.seat<1||msg.seat>6)return;const guests=(await this.ctx.storage.get('guests'))||[],i=guests.findIndex(g=>g.id===msg.guestId);if(i<0)return;guests[i].answer=msg.sdp;guests[i].seat=msg.seat;await this.ctx.storage.put('guests',guests);this.sendGuest(msg.guestId,{type:'answer',seat:msg.seat,sdp:msg.sdp});return}if(msg.type==='reject'){let guests=(await this.ctx.storage.get('guests'))||[];if(!guests.some(g=>g.id===msg.guestId))return;this.sendGuest(msg.guestId,{type:'rejected',reason:String(msg.reason||'room_full')});for(const s of this.sockets('guest',msg.guestId))this.close(s,4009,'Rejected by host');guests=guests.filter(g=>g.id!==msg.guestId);await this.ctx.storage.put('guests',guests);return}if(msg.type==='close-room')await this.destroy('Game started')}
  async removeDisconnected(id){let guests=(await this.ctx.storage.get('guests'))||[];const g=guests.find(x=>x.id===id);if(!g||g.connected)return;guests=guests.filter(x=>x.id!==id);await this.ctx.storage.put('guests',guests);this.sendHosts({type:'guest-left',guestId:id})}
  async webSocketClose(socket){const a=socket.deserializeAttachment()||{};if(a.role==='guest'&&a.guestId)await this.removeDisconnected(a.guestId)}
  async webSocketError(socket){const a=socket.deserializeAttachment()||{};if(a.role==='guest'&&a.guestId)await this.removeDisconnected(a.guestId)}
  async destroy(reason){for(const s of this.ctx.getWebSockets()){this.send(s,{type:'room-closed',reason});this.close(s,1000,reason)}await this.ctx.storage.deleteAll()}
  async alarm(){await this.destroy('Room expired')}
}
