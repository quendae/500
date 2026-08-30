import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, executePlayerAction, assertCardConservation } from '../src/engine.js';
import { chooseBotAction } from '../src/bots.js';

function seeded(seed){ let x=seed>>>0; return ()=>{ x=(1664525*x+1013904223)>>>0; return x/4294967296; }; }

function playGame(playerCount, seed){
  const rng=seeded(seed);
  const s=createGame({playerCount,types:Array(playerCount).fill('bot'),names:Array.from({length:playerCount},(_,i)=>`Bot ${i+1}`),rng});
  let actions=0, rounds=0;
  while(s.phase!=='gameEnd' && actions<30000 && rounds<80){
    if(s.phase==='roundEnd'){ rounds++; executePlayerAction(s,s.currentPlayer,'next-round',{},rng); continue; }
    const seat=s.currentPlayer;
    const move=chooseBotAction(s,seat,'hard',rng);
    assert.ok(move,`no move p${playerCount} seat${seat} phase${s.phase}`);
    let r=executePlayerAction(s,seat,move.action,move.payload,rng);
    if(r?.code?.startsWith('AMBIGUOUS_')) r=executePlayerAction(s,seat,move.action,{...move.payload,optionKey:r.options[0].key},rng);
    actions++;
    if(actions%25===0) assertCardConservation(s);
  }
  assert.equal(s.phase,'gameEnd',`game did not finish: p=${playerCount} actions=${actions} rounds=${rounds}`);
  assert.ok(s.players[s.winner].score>=500);
  assertCardConservation(s);
}

test('bot simulations finish for 2-7 players',()=>{
  for(let n=2;n<=7;n++) for(let i=1;i<=4;i++) playGame(n,1000+n*100+i);
});
