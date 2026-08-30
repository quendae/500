import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createDeck, meldOptions, executePlayerAction, assertCardConservation, publicStateForSeat } from '../src/engine.js';

const card=(rank,suit='H',id=`x-${suit}-${rank}`)=>({id,rank,suit,joker:false,deck:0});
const joker=(id='j')=>({id,rank:'JOKER',suit:null,joker:true,deck:0});

test('deck size scales at five players',()=>{ assert.equal(createDeck(4).length,54); assert.equal(createDeck(5).length,108); });
test('deal uses 13 cards heads-up and 7 otherwise',()=>{ assert.equal(createGame({playerCount:2}).players[0].hand.length,13); assert.equal(createGame({playerCount:7}).players[0].hand.length,7); });
test('set rejects duplicate suits with multiple decks',()=>{ assert.equal(meldOptions([card('9','H','a'),card('9','H','b'),card('9','S','c')]).some(o=>o.kind==='set'),false); });
test('ace can be low or high but no wrap',()=>{
  assert.ok(meldOptions([card('A','D','a'),card('2','D','b'),card('3','D','c')]).some(o=>o.key.startsWith('run')));
  assert.ok(meldOptions([card('Q','C','a'),card('K','C','b'),card('A','C','c')]).some(o=>o.key.startsWith('run')));
  assert.equal(meldOptions([card('K','S','a'),card('A','S','b'),card('2','S','c')]).some(o=>o.kind==='run'),false);
});
test('joker produces explicit run alternatives',()=>{ const opts=meldOptions([card('9','C','a'),joker('j1'),joker('j2')]); assert.ok(opts.filter(o=>o.kind==='run').length>=3); assert.ok(opts.some(o=>o.kind==='set')); });
test('deep discard pickup requires deepest card to be melded',()=>{
  const s=createGame({playerCount:2});
  const p=s.players[s.currentPlayer];
  s.discard=[card('4','C','d1'),card('Q','S','d2')];
  p.hand=[card('4','D','h1'),card('4','H','h2'),card('8','C','h3')];
  s.phase='draw';
  executePlayerAction(s,s.currentPlayer,'draw-discard',{index:0});
  assert.equal(s.pendingPickup.cardId,'d1');
  assert.throws(()=>executePlayerAction(s,s.currentPlayer,'discard',{cardId:'h3'}),/MUST_USE_PICKUP_CARD/);
  const ids=['d1','h1','h2'];
  const opt=meldOptions(ids.map(id=>p.hand.find(c=>c.id===id))).find(o=>o.kind==='set');
  executePlayerAction(s,s.currentPlayer,'meld',{cardIds:ids,optionKey:opt.key});
  assert.equal(s.pendingPickup,null);
});
test('seat filtered state hides hands and stock identities',()=>{ const s=createGame({playerCount:3}); const v=publicStateForSeat(s,1); assert.equal(v.players[1].hand[0].hidden,undefined); assert.equal(v.players[0].hand[0].hidden,true); assert.equal(v.stock[0].hidden,true); });
test('card conservation on fresh games',()=>{ for(let n=2;n<=7;n++) assert.equal(assertCardConservation(createGame({playerCount:n})),true); });
