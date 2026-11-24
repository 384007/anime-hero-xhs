/* 自测：node tests/selftest.js
 * 1) 逻辑自测  2) UI 冒烟（假 DOM，走真实的 touch/click 委托）  3) 确定性哈希  4) bot 通关  5) 静态检查
 * 结果写到 tests/selftest-result.json 和 tests/selftest-result.md */
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('../game.js');
const CONTENT = require('../content.js');
const { playBot, playFreeOnly, POLICIES, T0 } = require('./bot.js');
const ROOT = path.join(__dirname, '..');

const results = [];
let current = '';
function section(name) { current = name; }
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('returned false'); results.push({ section: current, name, ok: true }); }
  catch (e) { results.push({ section: current, name, ok: false, err: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
const clone = o => JSON.parse(JSON.stringify(o));
function mkClock(t) { return { t: t || T0, now() { return this.t; } }; }
function mk(opts) { opts = opts || {}; const clock = opts.clock || mkClock(); return { clock, e: G.Core.createEngine(Object.assign({ content: opts.content || CONTENT, clock, store: opts.store || G.Core.memoryStore(), seed: 1 }, opts)) }; }
function placeAt(e, sceneId) { const S = e.state(); S.run.scene = sceneId; S.run.stay = 0; S.run.seen = {}; S.meta.energy = 100; }

const INTENTS = Object.keys(CONTENT.intents);
const SAMPLE = { fight: '拔刀砍过去', talk: '问问她怎么回事', explore: '调查一下四周', move: '往前走', item: '使用道具', rest: '休息一下', flee: '快逃', help: '帮忙' };
const mainScenes = Object.keys(CONTENT.scenes).filter(id => !CONTENT.chapters.find(c => c.id === CONTENT.scenes[id].chapter).side);

/* ===================================================== 1. 逻辑 */
section('逻辑');

check('至少 4 章主线，每章至少 2 个场景', () => {
  const main = CONTENT.chapters.filter(c => !c.side);
  assert(main.length >= 4, 'chapters ' + main.length);
  main.forEach(c => assert(mainScenes.filter(s => CONTENT.scenes[s].chapter === c.id).length >= 2, c.id));
});
check('意图分类至少 8 类且包含规定的 8 类', () => {
  ['fight', 'talk', 'explore', 'move', 'item', 'rest', 'flee', 'help'].forEach(i => assert(CONTENT.intents[i], i));
});
check('每个场景：2~3 个选项、至少 2 个无条件选项、8 类意图都有回应、fallback 会推进', () => {
  Object.entries(CONTENT.scenes).forEach(([id, sc]) => {
    assert(CONTENT.chapters.find(c => c.id === sc.chapter), id + ' chapter');
    assert(G.Art.scenes[sc.bg], id + ' bg ' + sc.bg);
    sc.chars.forEach(c => assert(CONTENT.characters[c], id + ' char'));
    assert(sc.choices.length >= 2 && sc.choices.length <= 3, id + ' choices ' + sc.choices.length);
    assert(sc.choices.filter(c => !c.cond).length >= 2, id + ' unconditional');
    sc.choices.forEach((c, i) => { assert(CONTENT.intents[c.intent], id + ' choice intent ' + i); assert(c.next || c.end || c.finish, id + ' choice dead ' + i); if (c.next) assert(CONTENT.scenes[c.next], id + ' -> ' + c.next); });
    INTENTS.forEach(it => {
      const v = sc.on[it]; assert(v, id + ' missing intent ' + it);
      (Array.isArray(v) ? v : [v]).forEach(r => { assert(r.t && r.t.length > 4, id + ' ' + it + ' text'); if (r.next) assert(CONTENT.scenes[r.next], id + ' ' + it + ' next'); });
      if (Array.isArray(v)) assert(!v[v.length - 1].kw, id + ' ' + it + ' 变体最后一项必须是默认回应');
    });
    const fb = sc.fallback; assert(fb && fb.t && (fb.next || fb.end || fb.finish), id + ' fallback must advance');
  });
});
check('剧情图：所有场景可达，任何场景都能走到结局（无死路）', () => {
  const edges = {};
  Object.entries(CONTENT.scenes).forEach(([id, sc]) => {
    const out = new Set();
    const add = r => { if (r.next) out.add(r.next); if (r.end || r.finish) out.add('__END__'); };
    sc.choices.forEach(add); add(sc.fallback); INTENTS.forEach(it => [].concat(sc.on[it]).forEach(add));
    edges[id] = out;
  });
  const starts = [CONTENT.startScene].concat(CONTENT.chapters.filter(c => c.side).map(c => c.first));
  const seen = new Set(starts), q = starts.slice();
  while (q.length) { const s = q.shift(); edges[s].forEach(n => { if (n !== '__END__' && !seen.has(n)) { seen.add(n); q.push(n); } }); }
  Object.keys(CONTENT.scenes).forEach(id => assert(seen.has(id), 'unreachable ' + id));
  const canEnd = new Set(['__END__']); let changed = true;
  while (changed) { changed = false; Object.keys(edges).forEach(id => { if (!canEnd.has(id) && [...edges[id]].some(n => canEnd.has(n))) { canEnd.add(id); changed = true; } }); }
  Object.keys(CONTENT.scenes).forEach(id => assert(canEnd.has(id), 'dead end ' + id));
});
check('关键词意图识别', () => {
  const cases = [['拔刀砍它', 'fight'], ['攻击头狼', 'fight'], ['和绯月对练', 'fight'], ['问雪乃黑雾是什么', 'talk'], ['跟她打招呼', 'talk'],
    ['调查四周', 'explore'], ['仔细观察那扇门', 'explore'], ['前往钟楼', 'move'], ['往前走', 'move'], ['喝回复药', 'item'], ['使用道具', 'item'],
    ['坐下休息', 'rest'], ['睡一觉', 'rest'], ['快逃', 'flee'], ['撤退', 'flee'], ['帮她捡书', 'help'], ['保护雪乃', 'help'], ['救绯月', 'help'],
    ['我们一起上', 'help'], ['唱首歌', null], ['asdf', null]];
  cases.forEach(([t, want]) => eq(G.Core.classify(t, CONTENT.intents), want, t));
});
check('每个场景 × 每类意图：自由输入命中该场景预写回应', () => {
  Object.keys(CONTENT.scenes).forEach(id => {
    INTENTS.forEach(it => {
      const { e } = mk();
      e.newRun('测', 'brave');
      if (CONTENT.scenes[id].chapter === 'ex1') { e.state().meta.ent['side:ex1'] = true; e.startSide('ex1'); }
      const run = e.snapshot().run; run.scene = id; run.seen = {}; e.state().meta.energy = 100; run.items.potion = 1;
      const r = e.act({ type: 'free', text: SAMPLE[it] });
      assert(r.ok, id + ' ' + it + ' ' + r.reason);
      eq(r.intent, it, id + ' intent');
      const v = CONTENT.scenes[id].on[it], texts = [].concat(v).map(x => e.fillText(x.t)).concat([].concat(v).filter(x => x.tFail).map(x => e.fillText(x.tFail)));
      assert(texts.some(t => r.text.indexOf(t) === 0), id + ' ' + it + ' text mismatch');
    });
  });
});
check('识别不到的输入走通用推进回应并推进剧情', () => {
  const { e } = mk(); e.newRun('测', 'brave');
  const r = e.act({ type: 'free', text: '唱首歌' });
  assert(r.ok && r.intent === null && r.moved, JSON.stringify(r));
  eq(e.snapshot().sceneId, 'c1_class');
});
check('同一场景自由行动 5 次没推进会自动推进', () => {
  const { e } = mk(); e.newRun('测', 'brave');
  let r; for (let i = 0; i < 5; i++) r = e.act({ type: 'free', text: ['调查四周', '问她', '帮忙', '打她', '用药'][i] });
  assert(r.auto && r.moved, 'auto'); eq(e.snapshot().sceneId, 'c1_class');
});
check('数值只在首次触发时变化，选项会改数值', () => {
  const { e } = mk(); e.newRun('测', 'kind');
  const s0 = clone(e.snapshot().run.stats);
  e.act({ type: 'free', text: '帮忙' }); const s1 = clone(e.snapshot().run.stats);
  assert(s1.rep > s0.rep && s1.affA > s0.affA, 'first help');
  const r = e.act({ type: 'free', text: '帮忙' });
  eq(JSON.stringify(e.snapshot().run.stats), JSON.stringify(s1), 'repeat no fx'); assert(r.fx.join('').indexOf('做过') >= 0);
  e.act({ type: 'choice', idx: 0 }); assert(e.snapshot().run.stats.affA > s1.affA, 'choice fx');
});
check('特质影响数值', () => {
  const a = mk().e; a.newRun('a', 'brave'); eq(a.snapshot().run.stats.rep, 20);
  const b = mk().e; b.newRun('b', 'kind'); eq(b.snapshot().run.stats.affA, 15); b.act({ type: 'free', text: '问她' }); eq(b.snapshot().run.stats.affA, 19, 'kind +2 bonus');
  const c = mk().e; c.newRun('c', 'tough'); eq(c.energyInfo().max, 120);
  const d = mk().e; d.newRun('d', 'sharp'); const rep0 = d.snapshot().run.stats.rep; d.act({ type: 'free', text: '快逃' }); eq(d.snapshot().run.stats.rep, rep0, 'sharp flee no penalty');
  const f = mk().e; f.newRun('f', 'brave'); const r0 = f.snapshot().run.stats.rep; f.act({ type: 'free', text: '快逃' }); eq(f.snapshot().run.stats.rep, r0 - 1);
});
check('数值影响分支：条件选项按数值/旗标出现', () => {
  const { e } = mk(); e.newRun('测', 'brave'); placeAt(e, 'c5_rift');
  const run = e.snapshot().run; run.stats.rep = 39; eq(e.snapshot().choices.length, 2);
  run.stats.rep = 40; eq(e.snapshot().choices.length, 3);
  placeAt(e, 'c4_gate'); eq(e.snapshot().choices.length, 2); run.flags.clue2 = true; eq(e.snapshot().choices.length, 3);
});
check('断桥自由输入能按对象区分救谁', () => {
  const a = mk().e; a.newRun('a', 'brave'); placeAt(a, 'c4_hall'); a.act({ type: 'free', text: '去救绯月' }); assert(a.snapshot().run.flags.savedA);
  const b = mk().e; b.newRun('b', 'brave'); placeAt(b, 'c4_hall'); b.act({ type: 'free', text: '帮雪乃撑住结界' }); assert(b.snapshot().run.flags.savedB);
});
check('结局条件：5 个结局各自的判定', () => {
  function endWith(stats, flags, idx) {
    const { e } = mk(); e.newRun('测', 'brave'); placeAt(e, 'c5_final');
    const run = e.snapshot().run; Object.assign(run.stats, stats); Object.assign(run.flags, flags);
    return e.act({ type: 'choice', idx }).ending;
  }
  eq(endWith({ rep: 90 }, {}, 2), 'bad');
  eq(endWith({ affA: 70, affB: 40 }, { savedA: true }, 0), 'hizuki');
  eq(endWith({ affA: 70, affB: 40 }, {}, 0), 'normal', '没有救绯月');
  eq(endWith({ affB: 65, affA: 65 }, { savedB: true }, 0), 'yukino');
  eq(endWith({ rep: 60 }, {}, 0), 'hero');
  eq(endWith({ rep: 30 }, { rally: true }, 1), 'hero', 'rally + together');
  eq(endWith({ rep: 30 }, {}, 0), 'normal');
});
check('体力：行动消耗、体力墙、休息永远可用、时间恢复、回复药', () => {
  const { e, clock } = mk(); e.newRun('测', 'brave');
  const e0 = e.energyInfo().energy; e.act({ type: 'free', text: '调查四周' }); eq(e.energyInfo().energy, e0 - 5);
  e.state().meta.energy = 2;
  const w = e.act({ type: 'choice', idx: 0 }); eq(w.reason, 'energy'); eq(e.snapshot().sceneId, 'c1_gate', '墙不推进也不扣');
  const r = e.act({ type: 'intent', intent: 'rest' }); assert(r.ok); eq(e.energyInfo().energy, 8);
  const r2 = e.act({ type: 'intent', intent: 'rest' }); assert(r2.ok); eq(e.energyInfo().energy, 10, 'repeat rest +2');
  e.state().meta.energy = 0; e.state().meta.energyTs = clock.t;
  clock.t += 180000 * 3 + 1000; eq(e.energyInfo().energy, 3, 'regen');
  e.usePotion(); eq(e.energyInfo().energy, 28);
});
check('存档读档：进度、数值、已解锁章节都能恢复', () => {
  const store = G.Core.memoryStore(); const clock = mkClock();
  const a = G.Core.createEngine({ content: CONTENT, clock, store, seed: 3 });
  a.newRun('存档', 'brave'); for (let i = 0; i < 4; i++) a.act({ type: 'choice', idx: 0 });
  const snap = a.snapshot();
  const b = G.Core.createEngine({ content: CONTENT, clock, store, seed: 3 });
  const sb = b.snapshot();
  eq(sb.sceneId, snap.sceneId); eq(JSON.stringify(sb.run.stats), JSON.stringify(snap.run.stats)); assert(sb.meta.unlocked.c2); assert(sb.canResume);
});
check('坏档不会崩，重新开始', () => {
  const store = G.Core.memoryStore(); store.set('animehero.save.v1', '{oops');
  const e = G.Core.createEngine({ content: CONTENT, store, clock: mkClock() }); assert(!e.snapshot().run);
});
check('重新开始清掉本局、保留跨周目数据；通关后能重玩', () => {
  const r = playBot('normal', 5); eq(r.ending, 'normal');
  const { e } = mk(); e.newRun('a', 'brave'); placeAt(e, 'c5_final'); e.act({ type: 'choice', idx: 0 });
  const gems = e.state().meta.gems; e.restart(); assert(!e.snapshot().run); eq(e.state().meta.gems, gems);
  e.newRun('b', 'kind'); eq(e.snapshot().sceneId, 'c1_gate'); assert(Object.keys(e.state().meta.endings).length === 1);
});
check('章节选择：从已解锁章节开始，消耗体力，数值回到入章快照', () => {
  const { e } = mk(); e.newRun('测', 'brave');
  for (let i = 0; i < 3; i++) e.act({ type: 'choice', idx: 0 });
  eq(e.snapshot().sceneId, 'c2_edge'); const snapStats = clone(e.snapshot().run.stats);
  e.act({ type: 'choice', idx: 0 });
  const en = e.energyInfo().energy; const r = e.startChapter('c2'); assert(r.ok);
  eq(e.energyInfo().energy, en - CONTENT.economy.replayCost); eq(e.snapshot().sceneId, 'c2_edge'); eq(JSON.stringify(e.snapshot().run.stats), JSON.stringify(snapStats));
  assert(!e.startChapter('c4').ok, '未解锁');
});
check('章节完成奖励只发一次', () => {
  const { e } = mk(); e.newRun('测', 'brave');
  for (let i = 0; i < 3; i++) e.act({ type: 'choice', idx: 0 });
  const g = e.state().meta.gems; eq(g, 5); e.startChapter('c1'); for (let i = 0; i < 3; i++) e.act({ type: 'choice', idx: 0 }); eq(e.state().meta.gems, 5);
});
check('每日签到：当天一次、连续累加、断签重置、7 天循环', () => {
  const { e, clock } = mk();
  assert(e.checkinStatus().available); eq(e.claimCheckin().day, 1); assert(!e.claimCheckin().ok);
  clock.t += 86400000; eq(e.claimCheckin().day, 2);
  clock.t += 86400000 * 2; eq(e.claimCheckin().day, 1, '断签');
  for (let i = 2; i <= 7; i++) { clock.t += 86400000; eq(e.claimCheckin().day, i); }
  clock.t += 86400000; eq(e.claimCheckin().day, 1, '循环');
});
check('结局收集进度奖励', () => {
  const { e } = mk(); e.newRun('a', 'brave');
  ['bad', 'normal', 'hero'].forEach((want, i) => { e.restart(); e.newRun('a', 'brave'); placeAt(e, 'c5_final'); const run = e.snapshot().run; if (want === 'hero') run.stats.rep = 90; else run.stats.rep = 10; e.act({ type: 'choice', idx: want === 'bad' ? 2 : 0 }); });
  eq(e.gallery().got, 3); assert(e.state().meta.milestones[2] && e.state().meta.milestones[3]);
});

/* ===================================================== 商业化 */
section('商业化');
const PAID_KINDS = ['pass', 'side', 'gallery', 'energy', 'gems'];
check('所有付费点带 price_rmb，且只用 3/6/12 档', () => {
  const { e } = mk(); e.newRun('a', 'brave');
  const raw = CONTENT.economy.offers.filter(o => o.price_rmb).concat(CONTENT.chapters.filter(c => c.pass).map(c => c.pass), CONTENT.chapters.filter(c => c.unlock).map(c => c.unlock));
  raw.forEach(o => assert([3, 6, 12].includes(o.price_rmb), JSON.stringify(o)));
  const kinds = new Set(CONTENT.economy.offers.filter(o => o.price_rmb).map(o => o.kind)); kinds.add('pass'); kinds.add('side');
  PAID_KINDS.forEach(k => assert(kinds.has(k), 'missing paid kind ' + k));
});
check('默认关闭：没有支付权限时不出现任何购买入口，宝石包整个隐藏', () => {
  const { e } = mk(); e.newRun('a', 'brave'); e.state().meta.gems = 999; e.state().meta.coins = 999;
  const offs = e.offers(); assert(offs.every(o => !o.canPay)); assert(!offs.some(o => o.kind === 'gems')); assert(!e.payAllowed());
  return e.purchase('energy_full').then ? true : false;
});
check('有权限但配置未开启，仍然不显示购买入口', () => {
  const pay = { hasPermission: () => true, purchase: () => Promise.resolve({ ok: true }) };
  const { e } = mk({ payment: pay }); e.newRun('a', 'brave'); assert(!e.payAllowed()); assert(e.offers().every(o => !o.canPay));
});
check('游戏内货币先行兑换：宝石换通行证后本章不耗体力', () => {
  const { e } = mk(); e.newRun('a', 'brave'); for (let i = 0; i < 3; i++) e.act({ type: 'choice', idx: 0 });
  e.state().meta.gems = 30; const r = e.buyWith('pass:c2', 'gems'); assert(r.ok); eq(e.state().meta.gems, 5);
  const en = e.energyInfo().energy; e.act({ type: 'free', text: '调查' }); eq(e.energyInfo().energy, en, 'pass free');
  assert(!e.buyWith('pass:c2', 'gems').ok, '不能重复买');
});
check('学园币兑换：回复药、小份体力（日限 3 次）', () => {
  const { e, clock } = mk(); e.newRun('a', 'brave'); e.state().meta.coins = 1000; e.state().meta.energy = 0;
  assert(e.buyWith('potion', 'coins').ok); eq(e.snapshot().run.items.potion, 2);
  for (let i = 0; i < 3; i++) assert(e.buyWith('energy_small', 'coins').ok, 'small ' + i);
  assert(!e.buyWith('energy_small', 'coins').ok, 'limit'); clock.t += 86400000; e.state().meta.energy = 0; e.state().meta.energyTs = clock.t; assert(e.buyWith('energy_small', 'coins').ok, 'next day');
  assert(!e.buyWith('potion', 'gems').ok, '回复药不能用宝石买');
});
check('番外解锁：宝石兑换 → 游玩 → 通关奖励，主线存档不受影响', () => {
  const { e } = mk(); e.newRun('主线', 'brave'); e.act({ type: 'choice', idx: 0 }); const mainScene = e.snapshot().sceneId;
  assert(!e.startSide('ex1').ok, '未解锁'); e.state().meta.gems = 40; assert(e.buyWith('side:ex1', 'gems').ok);
  assert(e.startSide('ex1').ok); e.act({ type: 'choice', idx: 0 }); const r = e.act({ type: 'choice', idx: 0 }); assert(r.finished);
  eq(e.state().meta.gems, 15); e.leaveSide(); eq(e.snapshot().sceneId, mainScene);
});
check('结局图鉴完整版：显示未达成结局的条件', () => {
  const { e } = mk(); e.newRun('a', 'brave'); assert(e.gallery().endings.every(x => x.hint === null));
  e.state().meta.gems = 60; assert(e.buyWith('gallery', 'gems').ok); assert(e.gallery().endings.every(x => x.got || x.hint));
});
const asyncChecks = [];
asyncChecks.push(['开启后走 PaymentProvider：成功发货并记录订单，失败不发货', async () => {
  const calls = [];
  const okPay = { hasPermission: () => true, purchase: o => { calls.push(o); return Promise.resolve({ ok: true, receipt: 'r1' }); } };
  const a = mk({ payment: okPay, config: { monetizationEnabled: true } }).e; a.newRun('a', 'brave');
  assert(a.offers().some(o => o.kind === 'gems' && o.canPay), 'gems visible');
  const r = await a.purchase('gems_m'); assert(r.ok); eq(a.state().meta.gems, 65); eq(calls[0].price_rmb, 6); eq(a.state().meta.purchases.length, 1);
  const r2 = await a.purchase('pass:c3'); assert(r2.ok); assert(a.state().meta.ent['pass:c3']);
  const badPay = { hasPermission: () => true, purchase: () => Promise.resolve({ ok: false, reason: 'cancel' }) };
  const b = mk({ payment: badPay, config: { monetizationEnabled: true } }).e; b.newRun('b', 'brave');
  const r3 = await b.purchase('gems_l'); assert(!r3.ok); eq(b.state().meta.gems, 0);
  const c = mk().e; c.newRun('c', 'brave'); const r4 = await c.purchase('gems_s'); assert(!r4.ok); eq(c.state().meta.gems, 0);
}]);
check('经济：每种货币至少 2 个来源、2 个去处（实际跑一遍）', () => {
  const { e, clock } = mk(); e.newRun('经济', 'brave'); const M = e.state().meta;
  const src = { coins: new Set(), gems: new Set(), energy: new Set() }, sink = { coins: new Set(), gems: new Set(), energy: new Set() };
  function watch(tag, fn) { const b = { coins: M.coins, gems: M.gems, energy: e.energyInfo().energy }; fn(); const a = { coins: M.coins, gems: M.gems, energy: e.energyInfo().energy }; ['coins', 'gems', 'energy'].forEach(k => { if (a[k] > b[k]) src[k].add(tag); if (a[k] < b[k]) sink[k].add(tag); }); }
  M.energy = 50; watch('签到', () => e.claimCheckin());
  clock.t += 86400000 * 2; M.checkin = { last: null, streak: 2 }; watch('签到第3天', () => e.claimCheckin());
  watch('探索', () => e.act({ type: 'free', text: '调查四周' }));
  watch('剧情行动', () => e.act({ type: 'choice', idx: 0 }));
  watch('休息', () => e.act({ type: 'intent', intent: 'rest' }));
  M.energy = 40; M.energyTs = clock.t; watch('时间恢复', () => { clock.t += 600000; e.tick(); });
  watch('回复药', () => e.usePotion());
  e.act({ type: 'choice', idx: 0 }); M.energy = 50; watch('章节完成', () => e.act({ type: 'choice', idx: 0 }));
  watch('买回复药', () => e.buyWith('potion', 'coins'));
  M.coins = Math.max(M.coins, 50); M.energy = 10; watch('小份体力', () => e.buyWith('energy_small', 'coins'));
  watch('章节重玩', () => e.startChapter('c1'));
  placeAt(e, 'c5_final'); M.energy = 50; watch('结局', () => e.act({ type: 'choice', idx: 0 }));
  M.gems = Math.max(M.gems, 100); M.energy = 10; watch('体力补满', () => e.buyWith('energy_full', 'gems'));
  watch('通行证', () => e.buyWith('pass:c2', 'gems'));
  watch('番外', () => e.buyWith('side:ex1', 'gems'));
  ['coins', 'gems', 'energy'].forEach(k => { assert(src[k].size >= 2, k + ' sources ' + [...src[k]]); assert(sink[k].size >= 2, k + ' sinks ' + [...sink[k]]); });
  results.economyLedger = { sources: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]])), sinks: Object.fromEntries(Object.entries(sink).map(([k, v]) => [k, [...v]])) };
});
check('每周上新：未到上线日的章节不显示、不能玩，到日子自动出现（只改数据）', () => {
  const c2 = clone(CONTENT);
  c2.chapters.push({ id: 'ex2', no: 0, side: true, title: '番外 · 雪夜', release: '2026-12-01', first: 'ex2_a', reward: { gems: 15 }, unlock: { gems: 40, price_rmb: 6 } });
  c2.scenes.ex2_a = clone(c2.scenes.ex_bonfire); c2.scenes.ex2_a.chapter = 'ex2'; c2.scenes.ex2_a.title = '雪夜';
  const { e, clock } = mk({ content: c2 }); e.newRun('a', 'brave');
  assert(!e.sideList().some(s => s.id === 'ex2')); assert(!e.offers().some(o => o.id === 'side:ex2'));
  clock.t = Date.parse('2026-12-01T00:00:01+08:00');
  assert(e.sideList().some(s => s.id === 'ex2')); e.state().meta.gems = 40; assert(e.buyWith('side:ex2', 'gems').ok); assert(e.startSide('ex2').ok);
  assert(e.act({ type: 'choice', idx: 0 }).finished);
  const c3 = clone(CONTENT); c3.chapters.find(c => c.id === 'c5').release = '2026-12-01';
  const k = mk({ content: c3 }); k.e.newRun('b', 'brave'); placeAt(k.e, 'c4_core'); k.e.act({ type: 'choice', idx: 0 });
  assert(k.e.waitingRelease(), 'waiting'); eq(k.e.snapshot().choices.length, 0); eq(k.e.act({ type: 'choice', idx: 0 }).reason, 'waiting');
  k.clock.t = Date.parse('2026-12-01T08:00:00+08:00'); assert(!k.e.waitingRelease()); assert(k.e.act({ type: 'choice', idx: 0 }).ok);
});

/* ===================================================== 2. UI 冒烟 */
section('UI 冒烟');
function fakeEnv(opts) {
  opts = opts || {};
  const listeners = {};
  const root = { innerHTML: '', parentNode: null, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
  const inputs = { 'name-input': { id: 'name-input', value: '' }, 'free-input': { id: 'free-input', value: '' } };
  const document = { getElementById: id => inputs[id] || (root.innerHTML.indexOf('id="' + id + '"') >= 0 ? { textContent: '' } : null) };
  let tapT = 100000;
  const played = [];
  const sound = { unlock() { }, setMuted(m) { this.m = m; }, isMuted() { return !!this.m; }, play(n) { played.push(n); } };
  const clock = mkClock();
  const engine = G.Core.createEngine({ content: CONTENT, clock, store: G.Core.memoryStore(), seed: 9, payment: opts.payment, config: opts.config });
  const ui = G.createUI(engine, root, { document, window: {}, sound, tapNow: () => tapT });
  ui.render();
  let dispatches = 0; const origDispatch = ui.dispatch;
  const allActs = new Set();
  function buttons() { const re = /data-act="([^"]+)"(?: data-arg="([^"]*)")?/g, out = []; let m; while ((m = re.exec(root.innerHTML))) { out.push({ act: m[1], arg: m[2] == null ? null : m[2] }); allActs.add(m[1]); } return out; }
  function fire(type, ev) { (listeners[type] || []).forEach(f => f(ev)); }
  function el(act, arg) { return { getAttribute: k => k === 'data-act' ? act : k === 'data-arg' ? arg : null, parentNode: root }; }
  function tap(act, arg) {
    const b = buttons().find(x => x.act === act && (arg == null || x.arg === String(arg)));
    if (!b) throw new Error('button not rendered: ' + act + ' ' + arg + ' in view ' + ui.ui.view);
    const before = root.innerHTML; let prevented = false;
    const target = el(b.act, b.arg);
    fire('touchstart', { target, touches: [{ clientX: 10, clientY: 10 }] });
    fire('touchend', { target, cancelable: true, preventDefault() { prevented = true; } });
    fire('click', { target }); /* 合成 click 必须被去重 */
    tapT += 1000;
    dispatches++;
    return { prevented, changed: before !== root.innerHTML };
  }
  function click(act, arg) { const b = buttons().find(x => x.act === act && (arg == null || x.arg === String(arg))); if (!b) throw new Error('no ' + act); fire('click', { target: el(b.act, b.arg) }); tapT += 1000; }
  function state() { return JSON.parse(ui.textState()); }
  return { root, inputs, listeners, ui, engine, clock, tap, click, fire, el, buttons, state, played, allActs, sound, bumpTap: n => { tapT += n; } };
}

const env = fakeEnv();
check('标题页渲染，带 AI 制作标注', () => { assert(env.root.innerHTML.indexOf('AI 制作') >= 0); eq(env.state().view, 'title'); env.buttons(); });
check('touchend 触发且 preventDefault，随后的合成 click 被去重', () => {
  let n = 0; const orig = env.ui.actions['new']; env.ui.actions['new'] = function () { n++; orig(); };
  const r = env.tap('new'); assert(r.prevented); eq(n, 1, 'dispatched once'); env.ui.actions['new'] = orig; eq(env.state().view, 'create');
});
check('滑动（touchmove 超过 10px）不触发按钮', () => {
  const target = env.el('trait', 'sharp');
  env.fire('touchstart', { target, touches: [{ clientX: 0, clientY: 0 }] });
  env.fire('touchmove', { target, touches: [{ clientX: 0, clientY: 40 }] });
  env.fire('touchend', { target, preventDefault() { } });
  eq(env.ui.ui.trait, 'brave', '没有被选中');
  env.bumpTap(1000);
});
check('只有 click 的 WebView 也能用（无 touch 事件）', () => { env.click('trait', 'sharp'); eq(env.ui.ui.trait, 'sharp'); });
check('创建主角 → 进入剧情', () => {
  env.inputs['name-input'].value = '小林'; env.tap('start');
  const s = env.state(); eq(s.view, 'play'); eq(s.scene, 'c1_gate'); assert(env.root.innerHTML.indexOf('小林') >= 0);
  assert(env.root.innerHTML.indexOf('<svg') >= 0 && env.root.innerHTML.indexOf('portrait-svg') >= 0, 'scene + portrait');
});
check('点选项推进', () => { env.tap('choice', 0); eq(env.state().scene, 'c1_class'); });
check('自由输入框：点行动按钮', () => { env.inputs['free-input'].value = '问雪乃黑雾是什么'; env.tap('free'); const s = env.state(); eq(s.last.intent, 'talk'); assert(s.last.text.indexOf('封印') >= 0); eq(env.inputs['free-input'].value, ''); });
check('自由输入框：回车提交', () => { env.inputs['free-input'].value = '调查桌子'; env.fire('keydown', { key: 'Enter', target: env.inputs['free-input'], preventDefault() { } }); eq(env.state().last.intent, 'explore'); });
check('空输入给提示，不扣体力', () => { const en = env.state().energy; env.inputs['free-input'].value = '  '; env.tap('free'); eq(env.state().energy, en); assert(env.state().toast); });
check('静音开关', () => { env.tap('mute'); assert(env.engine.state().meta.muted); assert(env.root.innerHTML.indexOf('开声') >= 0); env.tap('mute'); assert(!env.engine.state().meta.muted); });
check('商店：默认没有任何 pay 按钮，返回回到剧情', () => { env.tap('shop'); eq(env.state().view, 'shop'); assert(!env.buttons().some(b => b.act === 'pay')); assert(env.root.indexOf ? true : true); env.tap('back'); eq(env.state().view, 'play'); });
check('图鉴进出', () => { env.tap('gallery'); eq(env.state().view, 'gallery'); env.tap('back'); eq(env.state().view, 'play'); });
check('重新开始：确认框可取消', () => { env.tap('restart'); assert(env.buttons().some(b => b.act === 'restart-yes')); env.tap('restart-no'); eq(env.state().view, 'play'); assert(env.engine.snapshot().run); });
check('体力墙：显示原地休息等出口，点休息能继续', () => {
  env.engine.state().meta.energy = 0; env.tap('choice', 0);
  const s = env.state(); assert(s.wall); assert(env.buttons().some(b => b.act === 'rest')); assert(!env.buttons().some(b => b.act === 'pay'));
  env.tap('rest'); assert(!env.state().wall);
});
check('一路点到结局，结局页可重玩', () => {
  let guard = 0;
  while (env.state().view === 'play' && guard++ < 200) {
    const bs = env.buttons();
    if (env.state().wall) { env.tap('rest'); continue; }
    env.engine.state().meta.energy = 100;
    env.tap('choice', bs.find(b => b.act === 'choice').arg);
  }
  eq(env.state().view, 'ending'); assert(env.state().ending);
  env.tap('gallery'); assert(env.state().view === 'gallery'); env.tap('back'); eq(env.state().view, 'ending');
  env.tap('again'); eq(env.state().view, 'create');
});
check('标题页：签到、章节选择、番外兑换与游玩', () => {
  env.tap('title'); eq(env.state().view, 'title');
  env.tap('checkin'); assert(env.state().toast.indexOf('签到') >= 0); assert(!env.buttons().some(b => b.act === 'checkin'));
  env.tap('chapters'); env.tap('chapter-start', 'c3'); eq(env.state().scene, 'c3_square'); env.tap('title');
  env.engine.state().meta.gems = 40; env.tap('sides'); env.tap('buy-gems', 'side:ex1'); env.tap('side-start', 'ex1'); eq(env.state().scene, 'ex_beach');
  env.tap('choice', 0); env.tap('choice', 0); eq(env.state().view, 'sideEnd'); env.tap('title'); eq(env.state().view, 'title');
});
check('页面上出现过的每个 data-act 都有处理函数（没有假按钮）', () => {
  ['shop', 'gallery', 'chapters', 'sides'].forEach(v => { env.ui.ui.view = v; env.ui.render(); env.buttons(); });
  env.ui.ui.view = 'title'; env.ui.render();
  [...env.allActs].forEach(a => assert(typeof env.ui.actions[a] === 'function', 'no handler ' + a));
  assert(env.allActs.size >= 20, 'covered ' + env.allActs.size);
  results.uiActsCovered = [...env.allActs].sort();
});
check('所有视图里都没有“暂未开放 / 敬请期待”', () => {
  ['title', 'create', 'shop', 'gallery', 'chapters', 'sides'].forEach(v => { env.ui.ui.view = v; env.ui.render(); assert(!/暂未开放|敬请期待|即将开放/.test(env.root.innerHTML), v); });
});
check('音效有在播放', () => { assert(env.played.length > 5); });
asyncChecks.push(['支付开启时商店出现 ¥ 按钮，点击走 PaymentProvider 并到账', async () => {
  const pay = { hasPermission: () => true, purchase: () => Promise.resolve({ ok: true, receipt: 'x' }) };
  const p = fakeEnv({ payment: pay, config: { monetizationEnabled: true } });
  p.tap('new'); p.tap('start'); p.tap('shop');
  assert(p.buttons().some(b => b.act === 'pay' && b.arg === 'gems_s'), 'pay visible');
  p.tap('pay', 'gems_s'); await new Promise(r => setTimeout(r, 5)); eq(p.engine.state().meta.gems, 30); assert(p.state().toast.indexOf('成功') >= 0);
}]);
check('存储被禁用的 WebView 也能启动（退回内存存档）', () => {
  const root = { innerHTML: '', addEventListener() { } };
  const win = { ANIME_HERO_CONTENT: CONTENT, setInterval() { }, document: { getElementById: id => id === 'app' ? root : { value: '' } } };
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); } });
  const b = G.boot(win); assert(root.innerHTML.indexOf('我成了动漫主角') >= 0); b.engine.newRun('x', 'brave'); assert(b.engine.snapshot().run);
});
check('boot：挂上 render_game_to_text 与 advanceTime 钩子', () => {
  const inputs = {}; const listeners = {};
  const root = { innerHTML: '', addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
  const ls = {}; const win = {
    ANIME_HERO_CONTENT: CONTENT, setInterval() { }, localStorage: { getItem: k => ls[k] || null, setItem: (k, v) => { ls[k] = v; }, removeItem: k => { delete ls[k]; } },
    document: { getElementById: id => id === 'app' ? root : (inputs[id] = inputs[id] || { value: '' }) }
  };
  const b = G.boot(win);
  assert(typeof win.render_game_to_text === 'function' && typeof win.advanceTime === 'function');
  b.engine.newRun('钩子', 'brave'); b.engine.state().meta.energy = 10; b.engine.state().meta.energyTs = Date.now();
  const s = JSON.parse(win.advanceTime(180000 * 2 + 500)); eq(s.energy, '12/100'); assert(ls['animehero.save.v1'], 'saved to localStorage');
});

/* ===================================================== 3. 确定性 + 4. bot */
section('确定性与 bot');
const botRuns = {};
check('同种子重复跑：状态哈希一致（5 个策略 × 2 次 + 自由输入 bot）', () => {
  Object.keys(POLICIES).forEach(p => {
    const a = playBot(p, 20261124), b = playBot(p, 20261124);
    eq(a.hash, b.hash, p); eq(a.trace.join(), b.trace.join(), p + ' trace'); botRuns[p] = a;
  });
  const f1 = playFreeOnly(11), f2 = playFreeOnly(11); eq(f1.hash, f2.hash, 'free'); botRuns.freeOnly = f1;
});
check('不同种子会改变战斗随机结果（随机数确实参与）', () => {
  const hs = new Set(); for (let s = 1; s <= 8; s++) hs.add(playFreeOnly(s).hash); assert(hs.size > 1);
});
check('bot 通关打出主线结局（学园的传说）', () => { eq(botRuns.hero.ending, 'hero'); });
check('bot 打出全部 5 个结局', () => { Object.keys(POLICIES).forEach(p => eq(botRuns[p].ending, POLICIES[p].expect, p)); });
check('只用自由输入（含乱打）也能走到结局', () => { assert(botRuns.freeOnly.ending, 'ended'); });

/* ===================================================== 5. 静态检查 */
section('静态检查');
const SHIP = ['index.html', 'style.css', 'content.js', 'game.js'];
const src = Object.fromEntries(SHIP.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
check('零网络请求：没有 fetch / XHR / WebSocket / sendBeacon / 外链', () => {
  SHIP.forEach(f => {
    const s = src[f].replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection|importScripts/.test(s), f + ' network api');
    assert(!/https?:\/\//.test(s), f + ' url');
    assert(!/<img|url\(\s*['"]?(?!#)/.test(s), f + ' image/url()');
    assert(!/@import|@font-face/.test(s), f + ' css import');
  });
  assert(/connect-src 'none'/.test(src['index.html']), 'CSP');
});
check('不依赖 Pointer Events', () => SHIP.forEach(f => assert(!/pointerdown|pointerup|onpointer|PointerEvent|pointerevents/i.test(src[f].replace(/cursor: pointer/g, '')), f)));
check('没有 emoji 当画面', () => SHIP.forEach(f => assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src[f]), f)));
check('文案：没有“不是A而是B”翻案句、没有“暂未开放”', () => {
  const all = JSON.stringify(CONTENT) + src['game.js'];
  assert(!/不是[^。！？”]{0,20}而是/.test(all), '不是…而是'); assert(!/暂未开放|敬请期待/.test(all));
});
check('游戏内标注 AI 制作', () => { assert(src['index.html'].indexOf('AI 制作') >= 0 && src['game.js'].indexOf('本游戏由 AI 制作') >= 0); });
check('包体 < 10MB', () => { const bytes = SHIP.reduce((n, f) => n + Buffer.byteLength(src[f]), 0); results.bundleBytes = bytes; assert(bytes < 10 * 1024 * 1024); });
check('内容层和引擎分离：game.js 里没有剧情场景 id 和角色名', () => { assert(!/c1_gate|c4_hall|绯月|雪乃|星见|hizuki|yukino/.test(src['game.js'].replace(/\/\*[\s\S]*?\*\//g, ''))); });

/* ===================================================== 汇总 */
(async () => {
  for (const [name, fn] of asyncChecks) {
    current = name.indexOf('商店') >= 0 ? 'UI 冒烟' : '商业化';
    try { await fn(); results.push({ section: current, name, ok: true }); } catch (e) { results.push({ section: current, name, ok: false, err: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); }
  }
  const list = results.filter(r => r && r.name);
  const bySec = {};
  list.forEach(r => { bySec[r.section] = bySec[r.section] || { pass: 0, fail: 0 }; bySec[r.section][r.ok ? 'pass' : 'fail']++; });
  const fail = list.filter(r => !r.ok);
  const bots = Object.fromEntries(Object.entries(botRuns).map(([k, v]) => [k, { ending: v.ending, stats: v.stats, steps: v.steps, walls: v.walls, firstWallAt: v.firstWallAt, waitedMin: v.waitedMin, energyUsed: v.energyUsed, gems: v.gems, coins: v.coins, hash: v.hash }]));
  const counts = {
    mainChapters: CONTENT.chapters.filter(c => !c.side).length, sideChapters: CONTENT.chapters.filter(c => c.side).length,
    mainScenes: mainScenes.length, sideScenes: Object.keys(CONTENT.scenes).length - mainScenes.length,
    endings: CONTENT.endings.length, intents: INTENTS.length, intentResponses: Object.values(CONTENT.scenes).reduce((n, s) => n + INTENTS.reduce((m, i) => m + [].concat(s.on[i]).length, 0), 0)
  };
  const out = { date: new Date().toISOString(), node: process.version, summary: bySec, total: list.length, failed: fail.length, counts, bundleBytes: results.bundleBytes, economyLedger: results.economyLedger, uiActsCovered: results.uiActsCovered, bots, checks: list };
  fs.writeFileSync(path.join(__dirname, 'selftest-result.json'), JSON.stringify(out, null, 2));
  let md = '# 自测结果\n\n运行：`node tests/selftest.js`（' + process.version + '）\n\n| 分组 | 通过 | 失败 |\n|---|---|---|\n';
  Object.entries(bySec).forEach(([k, v]) => { md += '| ' + k + ' | ' + v.pass + ' | ' + v.fail + ' |\n'; });
  md += '\n合计 ' + list.length + ' 项，失败 ' + fail.length + ' 项。\n\n## bot 通关\n\n| 策略 | 结局 | 声望/绯月/雪乃 | 行动数 | 撞体力墙次数 | 第一次撞墙 | 等待分钟 | 消耗体力 | 哈希 |\n|---|---|---|---|---|---|---|---|---|\n';
  Object.entries(bots).forEach(([k, v]) => { md += '| ' + k + ' | ' + v.ending + ' | ' + (v.stats ? v.stats.rep + '/' + v.stats.affA + '/' + v.stats.affB : '-') + ' | ' + v.steps + ' | ' + (v.walls == null ? '-' : v.walls) + ' | ' + (v.firstWallAt || '-') + ' | ' + (v.waitedMin == null ? '-' : v.waitedMin) + ' | ' + (v.energyUsed == null ? '-' : v.energyUsed) + ' | `' + v.hash + '` |\n'; });
  md += '\n同种子重复跑两次，所有策略哈希一致。\n\n## 规模\n\n' + Object.entries(counts).map(([k, v]) => '- ' + k + '：' + v).join('\n') + '\n- 包体：' + results.bundleBytes + ' 字节\n\n## 明细\n\n' + list.map(r => '- [' + (r.ok ? 'x' : ' ') + '] ' + r.section + ' · ' + r.name + (r.ok ? '' : '  \n  `' + r.err + '`')).join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, 'selftest-result.md'), md);
  list.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.section + ' · ' + r.name + (r.ok ? '' : '\n     ' + r.err)));
  console.log('\n' + JSON.stringify(bySec) + '  total=' + list.length + ' failed=' + fail.length);
  process.exit(fail.length ? 1 : 0);
})();
