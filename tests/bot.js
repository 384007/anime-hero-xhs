/* 自动通关 bot：用引擎 API 玩完整局，按策略冲不同结局。时间用脚本时钟，结果可复现。 */
'use strict';
const G = require('../game.js');
const CONTENT = require('../content.js');

const T0 = Date.parse('2026-11-24T10:00:00+08:00');

function sumFx(c, w) { const f = c.fx || {}; return (f.rep || 0) * (w.rep || 0) + (f.affA || 0) * (w.affA || 0) + (f.affB || 0) * (w.affB || 0); }
function bestBy(w, prefer) {
  return function (sn) {
    let best = 0, bs = -Infinity;
    sn.choices.forEach((c, i) => {
      let s = sumFx(c, w);
      if (prefer && c.flag && prefer[c.flag] != null) s += prefer[c.flag];
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  };
}
function finalPick(intent) { return sn => Math.max(0, sn.choices.findIndex(c => c.intent === intent)); }

const POLICIES = {
  hero: { trait: 'brave', free: ['帮助身边的人', '调查四周'], pick: bestBy({ rep: 1 }, { rally: 50 }), final: finalPick('help'), expect: 'hero' },
  hizuki: { trait: 'kind', free: ['和绯月聊聊', '帮帮绯月'], pick: bestBy({ affA: 3, rep: 0.2, affB: -1 }, { savedA: 100 }), final: finalPick('fight'), expect: 'hizuki' },
  yukino: { trait: 'kind', free: ['和雪乃聊聊', '去帮雪乃'], pick: bestBy({ affB: 3, rep: 0.2, affA: -1 }, { savedB: 100 }), final: finalPick('fight'), expect: 'yukino' },
  normal: { trait: 'sharp', free: [], pick: bestBy({ rep: -1, affA: -1, affB: -1 }), final: finalPick('fight'), expect: 'normal' },
  bad: { trait: 'tough', free: ['四处看看'], pick: () => 0, final: finalPick('flee'), expect: 'bad' }
};

function playBot(policyName, seed, opts) {
  opts = opts || {};
  const pol = POLICIES[policyName];
  const clock = { t: T0, now() { return this.t; } };
  const store = G.Core.memoryStore();
  const e = G.Core.createEngine({ content: opts.content || CONTENT, clock, store, seed });
  e.newRun('机器人' + policyName, pol.trait);
  const visits = {};
  const trace = [];
  let steps = 0, walls = 0, waitedMs = 0, energyUsed = 0, firstWallAt = null;
  while (steps < 500) {
    const sn = e.snapshot();
    if (sn.run.ended) break;
    clock.t += 20000;
    const sid = sn.sceneId, n = visits[sid] || 0;
    let action;
    if (n < pol.free.length) action = { type: 'free', text: pol.free[n] };
    else action = { type: 'choice', idx: sid === 'c5_final' ? pol.final(sn) : pol.pick(sn) };
    const before = e.energyInfo().energy;
    const r = e.act(action);
    if (!r.ok) {
      if (r.reason !== 'energy') throw new Error('bot stuck: ' + r.reason + ' at ' + sid);
      walls++; if (firstWallAt == null) firstWallAt = sid;
      clock.t += 30 * 60000; waitedMs += 30 * 60000; /* 等体力恢复，不去刷休息，免得掉声望 */
      continue;
    }
    energyUsed += Math.max(0, before - e.energyInfo().energy);
    visits[sid] = n + 1;
    trace.push(sid + '|' + (action.text || ('#' + action.idx)) + '|' + (r.intent || 'fallback'));
    steps++;
  }
  const S = e.state();
  return { policy: policyName, seed, ending: S.run.ended, expect: pol.expect, stats: S.run.stats, steps, walls, firstWallAt,
    waitedMin: waitedMs / 60000, energyUsed, coins: S.meta.coins, gems: S.meta.gems, hash: e.stateHash(), trace };
}

/* 随机自由输入 bot：只打字，不点选项，证明光靠自由输入也能打到结局 */
function playFreeOnly(seed) {
  const pool = ['攻击', '和她说话', '调查一下', '往前走', '用药', '休息一下', '快逃', '帮忙', '唱首歌', '嗯……', '发个呆', 'asdf'];
  const clock = { t: T0, now() { return this.t; } };
  const e = G.Core.createEngine({ content: CONTENT, clock, store: G.Core.memoryStore(), seed });
  e.newRun('自由', 'tough');
  let s = seed >>> 0, steps = 0;
  while (steps < 800 && !e.state().run.ended) {
    const r1 = G.Core.rngNext(s); s = r1.state;
    clock.t += 60000;
    const r = e.act({ type: 'free', text: pool[Math.floor(r1.value * pool.length)] });
    if (!r.ok && r.reason === 'energy') { e.act({ type: 'intent', intent: 'rest' }); clock.t += 600000; }
    steps++;
  }
  return { ending: e.state().run.ended, steps, hash: e.stateHash() };
}

module.exports = { playBot, playFreeOnly, POLICIES, T0 };

if (require.main === module) {
  Object.keys(POLICIES).forEach(p => { const r = playBot(p, 42); delete r.trace; console.log(JSON.stringify(r)); });
  console.log(JSON.stringify(playFreeOnly(7)));
}
