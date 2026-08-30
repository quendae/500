import { cardBaseValue, executePlayerAction, legalDeepPickup, layoffOptions, meldOptions, RuleError } from './engine.js';

export function chooseBotAction(state, seat, difficulty = 'normal') {
  if (state.currentPlayer !== seat) return null;
  const player = state.players[seat];
  if (state.phase === 'draw') {
    if (!state.stock.length) {
      // Try a legal discard pickup before ending the hand.
      for (let i = 0; i < state.discard.length - 1; i++) if (legalDeepPickup(state, seat, i)) return { action:'draw-discard', payload:{ index:i } };
      const top = state.discard.at(-1);
      if (top && cardImmediatelyUseful(state, seat, top)) return { action:'draw-discard', payload:{ index:state.discard.length - 1 } };
      return { action:'end-stock', payload:{} };
    }
    const deep = bestDeepPickup(state, seat);
    if (deep != null && (difficulty !== 'easy' || Math.random() < 0.55)) return { action:'draw-discard', payload:{ index:deep } };
    const top = state.discard.at(-1);
    if (top && cardImmediatelyUseful(state, seat, top) && Math.random() < (difficulty === 'hard' ? 0.9 : 0.7)) return { action:'draw-discard', payload:{ index:state.discard.length - 1 } };
    return { action:'draw-stock', payload:{} };
  }
  if (state.phase !== 'play') return null;

  if (state.pendingPickup) {
    const forced = findMoveUsingCard(state, seat, state.pendingPickup.cardId);
    if (forced) return forced;
  }

  const lay = bestLayoff(state, seat);
  if (lay) return lay;
  const meld = bestMeld(state, seat);
  if (meld) return meld;

  const discard = chooseDiscard(state, seat);
  if (discard) return { action:'discard', payload:{ cardId:discard.id } };
  return null;
}

export function runBotTurn(state, seat, difficulty = 'normal', rng = Math.random, maxActions = 50) {
  let actions = 0;
  while (state.currentPlayer === seat && !['roundEnd','gameEnd'].includes(state.phase) && actions++ < maxActions) {
    const move = chooseBotAction(state, seat, difficulty);
    if (!move) throw new Error('Bot deadlock');
    try {
      let result = executePlayerAction(state, seat, move.action, move.payload, rng);
      if (result?.code === 'AMBIGUOUS_MELD' || result?.code === 'AMBIGUOUS_LAYOFF') {
        result = executePlayerAction(state, seat, move.action, { ...move.payload, optionKey: result.options[0].key }, rng);
      }
    } catch (err) {
      if (err instanceof RuleError) throw new Error(`Bot illegal action ${move.action}: ${err.code}`);
      throw err;
    }
  }
  if (actions >= maxActions) throw new Error('Bot action limit exceeded');
}

function bestDeepPickup(state, seat) {
  let best = null; let bestScore = -Infinity;
  for (let i = Math.max(0, state.discard.length - 18); i < state.discard.length - 1; i++) {
    if (!legalDeepPickup(state, seat, i)) continue;
    const required = state.discard[i];
    const cost = state.discard.length - i - 1;
    const score = cardBaseValue(required) * 2 - cost * 2;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function cardImmediatelyUseful(state, seat, card) {
  if (state.melds.some(m => layoffOptions(state, m.id, card).length)) return true;
  const hand = state.players[seat].hand;
  for (let i=0;i<hand.length;i++) for (let j=i+1;j<hand.length;j++) if (meldOptions([card,hand[i],hand[j]]).length) return true;
  return false;
}

function findMoveUsingCard(state, seat, cardId) {
  const hand = state.players[seat].hand;
  const card = hand.find(c => c.id === cardId);
  if (!card) return null;
  for (const meld of state.melds) {
    const options = layoffOptions(state, meld.id, card);
    if (options.length) return { action:'layoff', payload:{ cardId, meldId:meld.id, optionKey:options[0].key } };
  }
  const others = hand.filter(c => c.id !== cardId);
  let best = null; let bestValue = -1;
  for (let i=0;i<others.length;i++) for (let j=i+1;j<others.length;j++) {
    for (const combo of [[card,others[i],others[j]]]) {
      const opts = meldOptions(combo); if (opts.length) {
        const value = combo.reduce((s,c)=>s+cardBaseValue(c),0);
        if (value > bestValue) { bestValue=value; best={ action:'meld', payload:{ cardIds:combo.map(c=>c.id), optionKey:opts[0].key } }; }
      }
    }
    for (let k=j+1;k<others.length;k++) {
      const combo=[card,others[i],others[j],others[k]]; const opts=meldOptions(combo);
      if (opts.length) { const value=combo.reduce((s,c)=>s+cardBaseValue(c),0); if(value>bestValue){bestValue=value;best={action:'meld',payload:{cardIds:combo.map(c=>c.id),optionKey:opts[0].key}};} }
    }
  }
  return best;
}

function bestLayoff(state, seat) {
  const hand = state.players[seat].hand;
  let best = null; let value = -1;
  for (const card of hand) {
    for (const meld of state.melds) {
      const opts = layoffOptions(state, meld.id, card);
      if (opts.length && cardBaseValue(card) > value) { value = cardBaseValue(card); best = { action:'layoff', payload:{ cardId:card.id, meldId:meld.id, optionKey:opts[0].key } }; }
    }
  }
  return best;
}

function bestMeld(state, seat) {
  const hand = state.players[seat].hand;
  let best = null; let bestScore = -1;
  const limit = Math.min(hand.length, 18);
  for (let i=0;i<limit;i++) for (let j=i+1;j<limit;j++) for (let k=j+1;k<limit;k++) {
    let combo=[hand[i],hand[j],hand[k]]; let opts=meldOptions(combo);
    if (opts.length) { const score=combo.reduce((s,c)=>s+cardBaseValue(c),0); if(score>bestScore){bestScore=score;best={action:'meld',payload:{cardIds:combo.map(c=>c.id),optionKey:opts[0].key}};} }
    for (let l=k+1;l<limit;l++) { combo=[hand[i],hand[j],hand[k],hand[l]]; opts=meldOptions(combo); if(opts.length){const score=combo.reduce((s,c)=>s+cardBaseValue(c),0);if(score>bestScore){bestScore=score;best={action:'meld',payload:{cardIds:combo.map(c=>c.id),optionKey:opts[0].key}};}} }
  }
  return best;
}

function chooseDiscard(state, seat) {
  const hand = state.players[seat].hand;
  const candidates = hand.filter(c => c.id !== state.cannotDiscardId && c.id !== state.pendingPickup?.cardId);
  if (!candidates.length) return null;
  const utility = card => {
    let u = -cardBaseValue(card);
    if (card.joker) u += 20;
    const peers = hand.filter(c => c.id !== card.id);
    if (peers.some(c => !c.joker && !card.joker && c.rank === card.rank)) u += 8;
    if (!card.joker && peers.some(c => c.suit === card.suit && Math.abs(rankNum(c)-rankNum(card)) <= 2)) u += 5;
    return u;
  };
  return [...candidates].sort((a,b)=>utility(a)-utility(b))[0];
}
function rankNum(c){ if(c.rank==='A')return 1; if(c.rank==='J')return 11;if(c.rank==='Q')return 12;if(c.rank==='K')return 13;return Number(c.rank)||0; }
