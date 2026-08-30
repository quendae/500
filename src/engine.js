export const SUITS = ['C', 'D', 'H', 'S'];
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 1]));

export class RuleError extends Error {
  constructor(code, message = code) { super(message); this.name = 'RuleError'; this.code = code; }
}

export function createDeck(playerCount, rng = Math.random) {
  const deckCount = playerCount >= 5 ? 2 : 1;
  const cards = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) for (const rank of RANKS) {
      cards.push({ id: `${d}-${suit}-${rank}`, suit, rank, deck: d, joker: false });
    }
    for (let j = 0; j < 2; j++) cards.push({ id: `${d}-JOKER-${j}`, suit: null, rank: 'JOKER', deck: d, joker: true });
  }
  return shuffle(cards, rng);
}

export function shuffle(values, rng = Math.random) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardBaseValue(card) {
  if (!card || card.hidden) return 0;
  if (card.joker || card.rank === 'A') return 15;
  if (['J','Q','K'].includes(card.rank)) return 10;
  return Number(card.rank);
}

export function createGame({ playerCount = 2, names = [], types = [], targetScore = 500, rng = Math.random, dealer = null } = {}) {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 7) throw new RuleError('BAD_PLAYER_COUNT');
  const players = Array.from({ length: playerCount }, (_, seat) => ({
    seat,
    name: names[seat] || (seat === 0 ? 'Ty' : `Gracz ${seat + 1}`),
    type: types[seat] || (seat === 0 ? 'human' : 'bot'),
    score: 0,
    hand: [],
    roundScore: 0,
  }));
  const state = {
    version: 1,
    playerCount,
    targetScore,
    players,
    dealer: Number.isInteger(dealer) ? dealer % playerCount : Math.floor(rng() * playerCount),
    currentPlayer: 0,
    stock: [],
    discard: [],
    melds: [],
    phase: 'setup',
    pendingPickup: null,
    cannotDiscardId: null,
    round: 0,
    winner: null,
    lastRound: null,
    revision: 0,
    log: [],
  };
  startRound(state, rng);
  return state;
}

export function startRound(state, rng = Math.random) {
  state.round += 1;
  state.dealer = state.round === 1 ? state.dealer : (state.dealer + 1) % state.playerCount;
  state.stock = createDeck(state.playerCount, rng);
  state.discard = [];
  state.melds = [];
  state.pendingPickup = null;
  state.cannotDiscardId = null;
  state.lastRound = null;
  state.winner = null;
  for (const p of state.players) { p.hand = []; p.roundScore = 0; }
  const handSize = state.playerCount === 2 ? 13 : 7;
  for (let n = 0; n < handSize; n++) {
    for (let offset = 1; offset <= state.playerCount; offset++) {
      const seat = (state.dealer + offset) % state.playerCount;
      state.players[seat].hand.push(state.stock.pop());
    }
  }
  state.discard.push(state.stock.pop());
  state.currentPlayer = (state.dealer + 1) % state.playerCount;
  state.phase = 'draw';
  state.log = [{ kind: 'round', text: `Runda ${state.round}` }];
  bump(state);
  return state;
}

function bump(state) { state.revision = (state.revision || 0) + 1; }
function active(state, seat) {
  if (state.phase === 'roundEnd' || state.phase === 'gameEnd') throw new RuleError('ROUND_OVER');
  if (seat !== state.currentPlayer) throw new RuleError('NOT_YOUR_TURN');
}
function findCard(hand, id) { return hand.find(c => c.id === id); }
function takeCards(hand, ids) {
  const set = new Set(ids);
  if (set.size !== ids.length) throw new RuleError('DUPLICATE_CARD');
  const cards = ids.map(id => findCard(hand, id));
  if (cards.some(c => !c)) throw new RuleError('CARD_NOT_OWNED');
  return cards;
}
function removeCards(hand, ids) {
  const set = new Set(ids);
  for (let i = hand.length - 1; i >= 0; i--) if (set.has(hand[i].id)) hand.splice(i, 1);
}

export function meldOptions(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return [];
  const options = [];
  const naturals = cards.filter(c => !c.joker);
  const jokers = cards.filter(c => c.joker);

  if (naturals.length > 0 && cards.length <= 4) {
    const rank = naturals[0].rank;
    if (naturals.every(c => c.rank === rank) && new Set(naturals.map(c => c.suit)).size === naturals.length && jokers.length <= 4 - naturals.length) {
      options.push({ key: `set:${rank}`, kind: 'set', rank, label: `${rank} × ${cards.length}` });
    }
  }

  if (naturals.length > 0) {
    const suits = new Set(naturals.map(c => c.suit));
    if (suits.size === 1) {
      const suit = naturals[0].suit;
      const n = cards.length;
      for (let start = 1; start <= 14 - n + 1; start++) {
        const sequence = Array.from({ length: n }, (_, i) => start + i);
        const needed = new Set(sequence);
        let ok = true;
        const used = new Set();
        for (const card of naturals) {
          const candidates = card.rank === 'A' ? [1, 14] : [RANK_VALUE[card.rank]];
          const match = candidates.find(v => needed.has(v) && !used.has(v));
          if (match == null) { ok = false; break; }
          used.add(match);
        }
        if (!ok || n - used.size !== jokers.length) continue;
        const missing = sequence.filter(v => !used.has(v));
        const assignment = {};
        naturals.forEach(card => {
          const candidates = card.rank === 'A' ? [1, 14] : [RANK_VALUE[card.rank]];
          assignment[card.id] = candidates.find(v => sequence.includes(v));
        });
        jokers.forEach((card, i) => { assignment[card.id] = missing[i]; });
        const label = sequence.map(rankLabel).join('–') + suitSymbol(suit);
        options.push({ key: `run:${suit}:${start}:${n}`, kind: 'run', suit, start, end: start + n - 1, assignment, label });
      }
    }
  }
  return dedupeOptions(options);
}

function dedupeOptions(options) {
  const seen = new Set();
  return options.filter(o => { if (seen.has(o.key)) return false; seen.add(o.key); return true; });
}
function rankLabel(v) { return v === 1 || v === 14 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v); }
export function suitSymbol(s) { return ({ C:'♣', D:'♦', H:'♥', S:'♠' })[s] || ''; }

export function drawStock(state, seat) {
  active(state, seat);
  if (state.phase !== 'draw') throw new RuleError('MUST_PLAY_OR_DISCARD');
  if (!state.stock.length) return finishRound(state, 'stock-empty');
  const card = state.stock.pop();
  state.players[seat].hand.push(card);
  state.phase = 'play';
  state.pendingPickup = null;
  state.cannotDiscardId = null;
  state.log.push({ kind:'draw', seat, text:`${state.players[seat].name} dobiera ze stosu.` });
  bump(state);
  return { ok:true, card };
}

export function drawDiscard(state, seat, index) {
  active(state, seat);
  if (state.phase !== 'draw') throw new RuleError('MUST_PLAY_OR_DISCARD');
  if (!Number.isInteger(index) || index < 0 || index >= state.discard.length) throw new RuleError('BAD_DISCARD_INDEX');
  const topIndex = state.discard.length - 1;
  if (index < topIndex && !legalDeepPickup(state, seat, index)) throw new RuleError('ILLEGAL_DEEP_PICKUP');
  const taken = state.discard.splice(index);
  const deepest = taken[0];
  state.players[seat].hand.push(...taken);
  state.phase = 'play';
  if (index < topIndex) {
    state.pendingPickup = { cardId: deepest.id, count: taken.length };
    state.cannotDiscardId = null;
  } else {
    state.pendingPickup = null;
    state.cannotDiscardId = deepest.id;
  }
  state.log.push({ kind:'draw-discard', seat, text:`${state.players[seat].name} zabiera ${taken.length} kart ze stosu odrzuconych.` });
  bump(state);
  return { ok:true, cards:taken, requiredCardId: state.pendingPickup?.cardId || null };
}

export function createMeld(state, seat, cardIds, optionKey = null) {
  active(state, seat);
  if (state.phase !== 'play') throw new RuleError('MUST_DRAW_FIRST');
  const cards = takeCards(state.players[seat].hand, cardIds);
  const options = meldOptions(cards);
  if (!options.length) throw new RuleError('INVALID_MELD');
  let option = optionKey ? options.find(o => o.key === optionKey) : (options.length === 1 ? options[0] : null);
  if (!option) return { ok:false, code:'AMBIGUOUS_MELD', options };
  if (state.pendingPickup && !cardIds.includes(state.pendingPickup.cardId)) throw new RuleError('MUST_USE_PICKUP_CARD');
  const entries = canonicalEntries(cards, option, seat);
  removeCards(state.players[seat].hand, cardIds);
  state.melds.push({ id:`m${state.round}-${state.revision}-${state.melds.length}`, kind:option.kind, rank:option.rank || null, suit:option.suit || null, start:option.start || null, end:option.end || null, entries, createdBy:seat });
  if (state.pendingPickup && cardIds.includes(state.pendingPickup.cardId)) state.pendingPickup = null;
  state.log.push({ kind:'meld', seat, text:`${state.players[seat].name} wykłada ${option.label}.` });
  bump(state);
  if (!state.players[seat].hand.length) return finishRound(state, 'went-out');
  return { ok:true };
}

function canonicalEntries(cards, option, seat) {
  if (option.kind === 'set') return cards.map(card => ({ card, ownerSeat:seat, representedRank: option.rank }));
  return cards.map(card => ({ card, ownerSeat:seat, representedRank: option.assignment[card.id] })).sort((a,b) => a.representedRank - b.representedRank);
}

export function layoffOptions(state, meldId, card) {
  const meld = state.melds.find(m => m.id === meldId);
  if (!meld || !card) return [];
  if (meld.kind === 'set') {
    if (meld.entries.length >= 4) return [];
    if (card.joker) return [{ key:'set-add', label:`${meld.rank}` }];
    if (card.rank !== meld.rank) return [];
    const naturalSuits = new Set(meld.entries.filter(e => !e.card.joker).map(e => e.card.suit));
    if (naturalSuits.has(card.suit)) return [];
    return [{ key:'set-add', label:`${meld.rank}` }];
  }
  const opts = [];
  if (card.joker) {
    if (meld.start > 1) opts.push({ key:'run-left', representedRank:meld.start - 1, label:`${rankLabel(meld.start - 1)}${suitSymbol(meld.suit)}` });
    if (meld.end < 14) opts.push({ key:'run-right', representedRank:meld.end + 1, label:`${rankLabel(meld.end + 1)}${suitSymbol(meld.suit)}` });
    return opts;
  }
  if (card.suit !== meld.suit) return [];
  const values = card.rank === 'A' ? [1,14] : [RANK_VALUE[card.rank]];
  if (values.includes(meld.start - 1)) opts.push({ key:'run-left', representedRank:meld.start - 1, label:`${card.rank}${suitSymbol(card.suit)}` });
  if (values.includes(meld.end + 1)) opts.push({ key:'run-right', representedRank:meld.end + 1, label:`${card.rank}${suitSymbol(card.suit)}` });
  return opts;
}

export function layOff(state, seat, cardId, meldId, optionKey = null) {
  active(state, seat);
  if (state.phase !== 'play') throw new RuleError('MUST_DRAW_FIRST');
  const hand = state.players[seat].hand;
  const card = findCard(hand, cardId);
  if (!card) throw new RuleError('CARD_NOT_OWNED');
  const meld = state.melds.find(m => m.id === meldId);
  if (!meld) throw new RuleError('MELD_NOT_FOUND');
  const options = layoffOptions(state, meldId, card);
  if (!options.length) throw new RuleError('INVALID_LAYOFF');
  let option = optionKey ? options.find(o => o.key === optionKey) : (options.length === 1 ? options[0] : null);
  if (!option) return { ok:false, code:'AMBIGUOUS_LAYOFF', options };
  if (state.pendingPickup && state.pendingPickup.cardId !== cardId) throw new RuleError('MUST_USE_PICKUP_CARD');
  removeCards(hand, [cardId]);
  const representedRank = meld.kind === 'set' ? RANK_VALUE[meld.rank] : option.representedRank;
  const entry = { card, ownerSeat:seat, representedRank };
  if (meld.kind === 'set') meld.entries.push(entry);
  else if (option.key === 'run-left') { meld.entries.unshift(entry); meld.start -= 1; }
  else { meld.entries.push(entry); meld.end += 1; }
  if (state.pendingPickup?.cardId === cardId) state.pendingPickup = null;
  state.log.push({ kind:'layoff', seat, text:`${state.players[seat].name} dokłada kartę do układu.` });
  bump(state);
  if (!hand.length) return finishRound(state, 'went-out');
  return { ok:true };
}

export function discardCard(state, seat, cardId) {
  active(state, seat);
  if (state.phase !== 'play') throw new RuleError('MUST_DRAW_FIRST');
  if (state.pendingPickup) throw new RuleError('MUST_USE_PICKUP_CARD');
  if (state.cannotDiscardId === cardId) throw new RuleError('CANNOT_REDISCARD_TOP_PICKUP');
  const hand = state.players[seat].hand;
  const card = findCard(hand, cardId);
  if (!card) throw new RuleError('CARD_NOT_OWNED');
  removeCards(hand, [cardId]);
  state.discard.push(card);
  state.log.push({ kind:'discard', seat, text:`${state.players[seat].name} odrzuca ${cardLabel(card)}.` });
  state.cannotDiscardId = null;
  state.pendingPickup = null;
  bump(state);
  if (!hand.length) return finishRound(state, 'went-out');
  advanceTurn(state);
  return { ok:true };
}

function advanceTurn(state) {
  state.currentPlayer = (state.currentPlayer + 1) % state.playerCount;
  state.phase = 'draw';
  if (!state.stock.length) {
    // The next player can still elect to use the discard pile; the UI/bot may call endRoundIfStockEmpty.
  }
  bump(state);
}

export function endRoundIfStockEmpty(state, seat) {
  active(state, seat);
  if (state.phase !== 'draw' || state.stock.length) throw new RuleError('STOCK_NOT_EMPTY');
  return finishRound(state, 'stock-empty');
}

export function finishRound(state, reason = 'went-out') {
  if (state.phase === 'roundEnd' || state.phase === 'gameEnd') return { ok:true };
  const meldedBySeat = Array(state.playerCount).fill(0);
  for (const meld of state.melds) {
    for (const entry of meld.entries) {
      let value = cardBaseValue(entry.card);
      if (!entry.card.joker && entry.card.rank === 'A' && meld.kind === 'run' && entry.representedRank === 1) value = 1;
      meldedBySeat[entry.ownerSeat] += value;
    }
  }
  const results = state.players.map((p, seat) => {
    const handPenalty = p.hand.reduce((sum,c) => sum + cardBaseValue(c), 0);
    const delta = meldedBySeat[seat] - handPenalty;
    p.roundScore = delta;
    p.score += delta;
    return { seat, melded:meldedBySeat[seat], handPenalty, delta, total:p.score };
  });
  state.lastRound = { reason, results };
  const eligible = state.players.filter(p => p.score >= state.targetScore);
  if (eligible.length) {
    const max = Math.max(...state.players.map(p => p.score));
    const leaders = state.players.filter(p => p.score === max && p.score >= state.targetScore);
    if (leaders.length === 1) { state.winner = leaders[0].seat; state.phase = 'gameEnd'; }
    else state.phase = 'roundEnd'; // tied at/above target: continue.
  } else state.phase = 'roundEnd';
  state.log.push({ kind:'score', text:'Koniec rozdania — podliczenie punktów.' });
  bump(state);
  return { ok:true, results, winner:state.winner };
}

export function executePlayerAction(state, seat, action, payload = {}, rng = Math.random) {
  switch (action) {
    case 'draw-stock': return drawStock(state, seat);
    case 'draw-discard': return drawDiscard(state, seat, payload.index);
    case 'meld': return createMeld(state, seat, payload.cardIds || [], payload.optionKey || null);
    case 'layoff': return layOff(state, seat, payload.cardId, payload.meldId, payload.optionKey || null);
    case 'discard': return discardCard(state, seat, payload.cardId);
    case 'end-stock': return endRoundIfStockEmpty(state, seat);
    case 'next-round':
      if (state.phase !== 'roundEnd') throw new RuleError('ROUND_NOT_READY');
      return { ok:true, state:startRound(state, rng) };
    default: throw new RuleError('UNKNOWN_ACTION');
  }
}

export function cardLabel(card) { return card.joker ? 'Joker' : `${card.rank}${suitSymbol(card.suit)}`; }

export function legalDeepPickup(state, seat, index) {
  if (index < 0 || index >= state.discard.length - 1) return false;
  const hand = [...state.players[seat].hand, ...state.discard.slice(index)];
  const required = state.discard[index];
  // Required card can lay off.
  for (const meld of state.melds) if (layoffOptions({ ...state, melds: state.melds }, meld.id, required).length) return true;
  // Or can be in any 3/4-card meld with cards that will be available in hand.
  const others = hand.filter(c => c.id !== required.id);
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
    if (meldOptions([required, others[i], others[j]]).length) return true;
    for (let k = j + 1; k < others.length; k++) if (meldOptions([required, others[i], others[j], others[k]]).length) return true;
  }
  return false;
}

export function publicStateForSeat(state, seat) {
  const view = structuredClone(state);
  view.players.forEach((p, s) => {
    if (s !== seat) p.hand = p.hand.map((_, i) => ({ id:`hidden-${s}-${i}`, hidden:true }));
  });
  view.stock = view.stock.map((_, i) => ({ id:`stock-${i}`, hidden:true }));
  return view;
}

export function assertCardConservation(state) {
  const ids = [];
  for (const p of state.players) for (const c of p.hand) if (!c.hidden) ids.push(c.id);
  for (const c of state.stock) if (!c.hidden) ids.push(c.id);
  for (const c of state.discard) if (!c.hidden) ids.push(c.id);
  for (const m of state.melds) for (const e of m.entries) if (!e.card.hidden) ids.push(e.card.id);
  const expected = state.playerCount >= 5 ? 108 : 54;
  if (ids.length !== expected || new Set(ids).size !== expected) throw new Error(`Card conservation failed: ${ids.length}/${new Set(ids).size}/${expected}`);
  return true;
}
