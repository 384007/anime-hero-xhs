/* 《我成了动漫主角》 game.js —— 本游戏由 AI 制作。
 * 分层（依赖只能从下往上）：
 *   1. Core        引擎核心：Rng / Cond / Intent / Store / Engine（状态机，不碰 DOM）
 *   2. Commerce    商业化层：Economy（体力、签到、货币）/ Monetization（商品、兑换、PaymentProvider）
 *   3. Present     表现层：Art（SVG）/ Sound（WebAudio）/ UI（视图、统一 tap）
 * 剧情全部来自 content.js，引擎里没有任何剧情文本。全程零网络请求。 */
(function (root) {
  'use strict';

  /* ======================================================================
   * 1. CORE
   * ==================================================================== */
  var Core = {};

  /* --- Rng：mulberry32，状态是一个 32 位整数，能存档 --- */
  Core.rngNext = function (state) {
    var t = (state + 0x6D2B79F5) | 0;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return { state: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
  };

  Core.hash = function (str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  };

  Core.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };

  /* --- Cond：声明式条件 --- */
  Core.test = function (cond, run) {
    if (!cond) return true;
    if (cond.all) { for (var i = 0; i < cond.all.length; i++) if (!Core.test(cond.all[i], run)) return false; return true; }
    if (cond.any) { for (var j = 0; j < cond.any.length; j++) if (Core.test(cond.any[j], run)) return true; return false; }
    if (cond.not) return !Core.test(cond.not, run);
    if (cond.flag) return !!(run.flags && run.flags[cond.flag]);
    if (cond.stat) {
      var a = run.stats[cond.stat] || 0;
      var b = cond.ref ? (run.stats[cond.ref] || 0) : cond.value;
      switch (cond.op) {
        case '>=': return a >= b; case '>': return a > b;
        case '<=': return a <= b; case '<': return a < b;
        case '==': return a === b; default: return false;
      }
    }
    return false;
  };

  /* --- Intent：关键词打分，关键词越长分越高，同分按声明顺序 --- */
  Core.classify = function (text, intents) {
    var t = String(text || '').toLowerCase();
    var best = null, score = 0;
    Object.keys(intents).forEach(function (id) {
      var s = 0;
      intents[id].keywords.forEach(function (k) { if (t.indexOf(k) >= 0) s += k.length; });
      if (s > score) { best = id; score = s; }
    });
    return best;
  };

  /* --- Store：存储适配器 --- */
  Core.memoryStore = function () {
    var m = {};
    return { get: function (k) { return k in m ? m[k] : null; }, set: function (k, v) { m[k] = String(v); }, remove: function (k) { delete m[k]; } };
  };
  Core.localStore = function (ls) {
    return {
      get: function (k) { try { return ls.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { ls.setItem(k, v); } catch (e) { /* 存储满或被禁用时静默 */ } },
      remove: function (k) { try { ls.removeItem(k); } catch (e) { } }
    };
  };

  var SAVE_KEY = 'animehero.save.v1';

  /* ======================================================================
   * 2. COMMERCE —— PaymentProvider 接口与桩实现
   * ==================================================================== */
  var Commerce = {};
  /* PaymentProvider 接口：
   *   hasPermission(): boolean            —— 当前环境有没有支付权限
   *   purchase({sku, price_rmb, title}): Promise<{ok, receipt?, reason?}>
   * 小红书接入支付权限后，替换成真实实现即可，引擎和 UI 不用改。 */
  Commerce.StubPaymentProvider = {
    id: 'stub',
    hasPermission: function () { return false; },
    purchase: function () { return Promise.resolve({ ok: false, reason: 'no_permission' }); }
  };

  /* ======================================================================
   * ENGINE（状态机 + 经济 + 商品，全部纯逻辑）
   * ==================================================================== */
  Core.createEngine = function (opts) {
    opts = opts || {};
    var C = opts.content;
    if (!C) throw new Error('content required');
    var E = C.economy;
    var clock = opts.clock || { now: function () { return Date.now(); } };
    var store = opts.store || Core.memoryStore();
    var payment = opts.payment || Commerce.StubPaymentProvider;
    var cfg = { monetizationEnabled: false };
    if (opts.config) for (var ck in opts.config) cfg[ck] = opts.config[ck];
    var seedSource = opts.seed != null ? (opts.seed >>> 0) : null;

    var chapterById = {};
    C.chapters.forEach(function (ch) { chapterById[ch.id] = ch; });
    var mainChapters = C.chapters.filter(function (ch) { return !ch.side; });
    var sideChapters = C.chapters.filter(function (ch) { return ch.side; });

    var S = load();
    var active = 'main';

    /* ---------- 存档 ---------- */
    function freshMeta() {
      var now = clock.now();
      return {
        energy: E.maxEnergy, energyTs: now, coins: 0, gems: 0,
        unlocked: {}, snaps: {}, cleared: {}, endings: {}, sideCleared: {},
        ent: {}, milestones: {}, checkin: { last: null, streak: 0 },
        daily: { day: null, counts: {} }, muted: false, purchases: [], lastName: ''
      };
    }
    function load() {
      var raw = store.get(SAVE_KEY);
      if (raw) {
        try {
          var d = JSON.parse(raw);
          if (d && d.meta) { var base = freshMeta(); for (var k in d.meta) base[k] = d.meta[k]; d.meta = base; return d; }
        } catch (e) { /* 坏档：重新开始 */ }
      }
      return { meta: freshMeta(), run: null, side: null };
    }
    function save() { store.set(SAVE_KEY, JSON.stringify(S)); }

    /* ---------- 工具 ---------- */
    function cur() { return active === 'side' ? S.side : S.run; }
    function traitOf(run) {
      var id = run && run.trait;
      for (var i = 0; i < C.traits.length; i++) if (C.traits[i].id === id) return C.traits[i];
      return {};
    }
    function maxEnergy() { var r = cur() || S.run; return traitOf(r).maxEnergy || E.maxEnergy; }
    function clamp(v) { return Math.max(0, Math.min(100, v)); }
    function fill(text, run) { return String(text || '').replace(/\{name\}/g, (run && run.name) || '你'); }
    function dayKey(ms) { return new Date(ms + E.tz * 3600000).toISOString().slice(0, 10); }
    function released(ch) { return clock.now() >= Date.parse(ch.release + 'T00:00:00+08:00'); }
    function rand(run) { var r = Core.rngNext(run.rng); run.rng = r.state; return r.value; }
    function sceneOf(run) { return C.scenes[run.scene]; }

    /* ---------- 体力（时间恢复） ---------- */
    function tick() {
      var m = S.meta, max = maxEnergy(), now = clock.now();
      if (m.energy >= max) { m.energyTs = now; return; }
      var gain = Math.floor((now - m.energyTs) / E.regenMs);
      if (gain > 0) {
        m.energy = Math.min(max, m.energy + gain);
        m.energyTs += gain * E.regenMs;
        if (m.energy >= max) m.energyTs = now;
      }
    }
    function addEnergy(n) {
      tick();
      var max = maxEnergy();
      S.meta.energy = Math.max(0, Math.min(max, S.meta.energy + n));
      if (S.meta.energy >= max) S.meta.energyTs = clock.now();
    }
    function energyInfo() {
      tick();
      var max = maxEnergy(), m = S.meta;
      var nextMs = m.energy >= max ? 0 : Math.max(0, E.regenMs - (clock.now() - m.energyTs));
      var fullMs = m.energy >= max ? 0 : nextMs + (max - m.energy - 1) * E.regenMs;
      return { energy: m.energy, max: max, nextMs: nextMs, fullMs: fullMs };
    }
    function dailyCount(id) {
      var today = dayKey(clock.now());
      if (S.meta.daily.day !== today) S.meta.daily = { day: today, counts: {} };
      return S.meta.daily.counts[id] || 0;
    }
    function bumpDaily(id) { dailyCount(id); S.meta.daily.counts[id] = (S.meta.daily.counts[id] || 0) + 1; }

    /* ---------- 奖励 ---------- */
    function grant(reward, out) {
      if (!reward) return;
      if (reward.coins) { S.meta.coins += reward.coins; out.push('学园币 +' + reward.coins); }
      if (reward.gems) { S.meta.gems += reward.gems; out.push('宝石 +' + reward.gems); }
      if (reward.energy) { addEnergy(reward.energy); out.push('体力 +' + reward.energy); }
      if (reward.potion) { var r = S.run || S.side; if (r) { r.items.potion = (r.items.potion || 0) + reward.potion; } else { S.meta.bankPotion = (S.meta.bankPotion || 0) + reward.potion; } out.push('回复药 +' + reward.potion); }
    }

    /* ---------- 数值效果 ---------- */
    function applyFx(run, fx, intent, out) {
      if (!fx) return;
      var tr = traitOf(run);
      Object.keys(fx).forEach(function (k) {
        var v = fx[k];
        if (k === 'rep' || k === 'affA' || k === 'affB') {
          if (k !== 'rep' && v > 0 && tr.affBonus) v += tr.affBonus;
          if (k === 'rep' && v < 0 && intent === 'flee' && tr.fleeNoPenalty) return;
          var before = run.stats[k];
          run.stats[k] = clamp(before + v);
          var d = run.stats[k] - before;
          if (d) out.push(C.statNames[k] + (d > 0 ? ' +' : ' ') + d);
        } else if (k === 'coins') { S.meta.coins = Math.max(0, S.meta.coins + v); out.push('学园币 ' + (v > 0 ? '+' : '') + v); }
        else if (k === 'energy') { addEnergy(v); out.push('体力 ' + (v > 0 ? '+' : '') + v); }
        else if (k === 'potion') { run.items.potion = Math.max(0, (run.items.potion || 0) + v); out.push('回复药 ' + (v > 0 ? '+' : '') + v); }
      });
    }
    function applyFlag(run, flag) {
      if (!flag) return;
      (Array.isArray(flag) ? flag : [flag]).forEach(function (f) { run.flags[f] = true; });
    }

    /* ---------- 章节流转 ---------- */
    function enterChapter(run, chId) {
      if (run.mode !== 'main') return;
      S.meta.unlocked[chId] = true;
      if (!S.meta.snaps[chId]) {
        S.meta.snaps[chId] = { name: run.name, trait: run.trait, stats: Core.clone(run.stats), flags: Core.clone(run.flags), items: Core.clone(run.items) };
      }
    }
    function clearChapter(run, chId, out) {
      if (run.mode !== 'main' || S.meta.cleared[chId]) return;
      S.meta.cleared[chId] = true;
      out.push('【' + chapterById[chId].title + ' 完成】');
      grant(chapterById[chId].reward, out);
    }
    function gotoScene(run, next, out) {
      var from = sceneOf(run), to = C.scenes[next];
      if (!to) throw new Error('missing scene ' + next);
      if (from && from.chapter !== to.chapter) clearChapter(run, from.chapter, out);
      run.scene = next; run.stay = 0; run.log = [];
      var ch = chapterById[to.chapter];
      if (!released(ch)) { run.waiting = ch.id; return; }
      run.waiting = null;
      if (from && from.chapter !== to.chapter) enterChapter(run, to.chapter);
    }

    function pickEnding(run) {
      for (var i = 0; i < C.endings.length; i++) if (Core.test(C.endings[i].cond, run)) return C.endings[i];
      return C.endings[C.endings.length - 1];
    }
    function finishMain(run, out) {
      var end = pickEnding(run);
      run.ended = end.id;
      clearChapter(run, sceneOf(run).chapter, out);
      if (!S.meta.endings[end.id]) {
        S.meta.endings[end.id] = clock.now();
        out.push('【新结局：' + end.title + '】');
        grant(E.endingReward || { gems: 20 }, out);
        var got = Object.keys(S.meta.endings).length;
        (C.collection || []).forEach(function (ms) {
          if (got >= ms.count && !S.meta.milestones[ms.count]) {
            S.meta.milestones[ms.count] = true;
            out.push('【结局收集 ' + ms.count + ' 个奖励】');
            grant(ms.reward, out);
          }
        });
      }
      return end;
    }
    function finishSide(run, out) {
      var chId = sceneOf(run).chapter;
      run.ended = 'side';
      if (!S.meta.sideCleared[chId]) {
        S.meta.sideCleared[chId] = clock.now();
        out.push('【' + chapterById[chId].title + ' 完成】');
        grant(chapterById[chId].reward, out);
      }
    }

    function passActive(run) { return !!S.meta.ent['pass:' + sceneOf(run).chapter]; }
    function visibleChoices(run) {
      var sc = sceneOf(run);
      return sc.choices.filter(function (c) { return Core.test(c.cond, run); });
    }
    function resolveFree(sc, intent, text) {
      var v = sc.on[intent];
      if (!v) return null;
      if (!Array.isArray(v)) return { resp: v, key: intent };
      for (var i = 0; i < v.length; i++) {
        var kw = v[i].kw;
        if (!kw) return { resp: v[i], key: intent + '#' + i };
        for (var j = 0; j < kw.length; j++) if (text.indexOf(kw[j]) >= 0) return { resp: v[i], key: intent + '#' + i };
      }
      return null;
    }

    /* ---------- 核心：一次行动 ---------- */
    function act(action) {
      var run = cur();
      if (!run || run.ended) return { ok: false, reason: 'no_run' };
      if (run.waiting) return { ok: false, reason: 'waiting' };
      var sc = sceneOf(run);
      var intent, resp, key, isChoice = false, isFallback = false, said = '';

      if (action.type === 'choice') {
        resp = visibleChoices(run)[action.idx];
        if (!resp) return { ok: false, reason: 'bad_choice' };
        intent = resp.intent; isChoice = true; said = resp.label;
      } else if (action.type === 'free' || action.type === 'intent') {
        var text = action.type === 'free' ? String(action.text || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
        if (action.type === 'free' && !text) return { ok: false, reason: 'empty' };
        intent = action.type === 'intent' ? action.intent : Core.classify(text, C.intents);
        if (!C.intents[intent]) intent = null;
        said = text || (intent ? C.intents[intent].label : '');
        var hit = intent ? resolveFree(sc, intent, text) : null;
        if (hit) { resp = hit.resp; key = hit.key; }
        else { resp = sc.fallback; key = 'fallback'; isFallback = true; }
      } else return { ok: false, reason: 'bad_action' };

      var out = [];
      var res = { ok: true, intent: isFallback ? null : intent, said: said, fx: out, sfx: 'tap' };

      /* 休息：永远免费，是体力墙的保底出口 */
      if (!isChoice && !isFallback && intent === 'rest') {
        var rk = run.scene + ':rest';
        var tr = traitOf(run), gain;
        if (!run.seen[rk]) { run.seen[rk] = true; gain = E.rest.first + (tr.restBonus || 0); applyFx(run, resp.fx, intent, out); }
        else { gain = E.rest.repeat + (tr.restBonus || 0); applyFx(run, { rep: -E.rest.repeatRepCost }, intent, out); }
        addEnergy(gain); out.push('体力 +' + gain);
        res.text = fill(resp.t, run); res.sfx = 'rest';
        pushLog(run, res); save(); return res;
      }

      var cost = resp.cost != null ? resp.cost : (isFallback ? C.fallbackCost : C.intents[intent].cost);
      if (passActive(run)) cost = 0;
      tick();
      if (S.meta.energy < cost) return { ok: false, reason: 'energy', need: cost, have: S.meta.energy };
      if (cost) S.meta.energy -= cost;

      var seenKey = run.scene + ':' + (isChoice ? 'c' + sc.choices.indexOf(resp) : key);
      var first = !run.seen[seenKey];
      run.seen[seenKey] = true;

      var text = resp.t, fx = resp.fx;
      if (!isChoice && intent === 'fight' && resp.tFail) {
        var chance = E.fight.base + (traitOf(run).fightBonus || 0) + (S.meta.energy > 50 ? E.fight.highEnergy : 0);
        if (rand(run) >= chance) { text = resp.tFail; fx = resp.fxFail; res.sfx = 'bad'; }
        else res.sfx = 'fight';
      } else if (intent === 'fight') res.sfx = 'fight';

      if (isChoice || first) {
        applyFx(run, fx, intent, out);
        applyFlag(run, resp.flag);
        var bonus = traitOf(run).bonus;
        if (bonus && bonus[intent]) applyFx(run, bonus[intent], intent, out);
      } else if (!isFallback) {
        out.push('（同样的事做过一次了，这次没什么新收获）');
      }

      if (!isChoice && intent === 'item') {
        var max = maxEnergy();
        if ((run.items.potion || 0) <= 0) out.push('背包里没有回复药了。商店可以用学园币买。');
        else if (S.meta.energy >= max) out.push('体力是满的，回复药先留着。');
        else { run.items.potion -= 1; addEnergy(E.potionEnergy); out.push('用掉 1 瓶回复药，体力 +' + E.potionEnergy); res.sfx = 'good'; }
      }

      res.text = fill(text, run);
      pushLog(run, res);

      if (resp.end) { res.ending = finishMain(run, out).id; res.sfx = 'end'; }
      else if (resp.finish) { finishSide(run, out); res.finished = true; res.sfx = 'end'; }
      else if (resp.next) { gotoScene(run, resp.next, out); res.moved = true; }
      else {
        run.stay += 1;
        if (run.stay >= E.stayLimit) {
          var fb = sc.fallback;
          res.text += '\n' + fill(fb.t, run);
          res.auto = true;
          if (fb.end) { res.ending = finishMain(run, out).id; res.sfx = 'end'; }
          else if (fb.finish) { finishSide(run, out); res.finished = true; }
          else { gotoScene(run, fb.next, out); res.moved = true; }
        }
      }
      if (res.moved) run.log = [{ said: res.said, text: res.text, fx: out.slice() }];
      run.turn += 1;
      save();
      return res;
    }
    function pushLog(run, res) {
      run.log.push({ said: res.said, text: res.text, fx: res.fx });
      if (run.log.length > 6) run.log.shift();
    }

    function usePotion() {
      var run = cur();
      if (!run || run.ended) return { ok: false, reason: 'no_run' };
      tick();
      if ((run.items.potion || 0) <= 0) return { ok: false, reason: 'no_potion' };
      if (S.meta.energy >= maxEnergy()) return { ok: false, reason: 'full' };
      run.items.potion -= 1; addEnergy(E.potionEnergy); save();
      return { ok: true, fx: ['体力 +' + E.potionEnergy] };
    }

    /* ---------- 开局 / 章节 / 番外 ---------- */
    function makeRun(mode, name, traitId, sceneId) {
      var seed = seedSource != null ? seedSource : (clock.now() >>> 0);
      if (seedSource != null) seedSource = (seedSource + 0x9E3779B9) >>> 0;
      var tr = null;
      C.traits.forEach(function (t) { if (t.id === traitId) tr = t; });
      if (!tr) tr = C.traits[0];
      var stats = Core.clone(C.baseStats);
      if (tr.start) for (var k in tr.start) stats[k] = clamp(stats[k] + tr.start[k]);
      return { mode: mode, name: name, trait: tr.id, stats: stats, flags: {}, items: Core.clone(C.startItems),
        scene: sceneId, seen: {}, stay: 0, log: [], turn: 0, rng: seed, ended: null, waiting: null };
    }
    function cleanName(name) {
      var n = String(name || '').replace(/[<>&"'`\\{}]/g, '').replace(/\s+/g, '').slice(0, 8);
      return n || '新同学';
    }
    function newRun(name, traitId) {
      name = cleanName(name);
      S.meta.lastName = name;
      S.run = makeRun('main', name, traitId, C.startScene);
      if (S.meta.bankPotion) { S.run.items.potion += S.meta.bankPotion; S.meta.bankPotion = 0; }
      active = 'main';
      var ch = chapterById[C.scenes[C.startScene].chapter];
      S.meta.unlocked[ch.id] = true;
      S.meta.snaps[ch.id] = S.meta.snaps[ch.id] || { name: name, trait: S.run.trait, stats: Core.clone(S.run.stats), flags: {}, items: Core.clone(S.run.items) };
      tick(); save();
      return S.run;
    }
    function chapterList() {
      return mainChapters.map(function (ch) {
        return { id: ch.id, no: ch.no, title: ch.title, release: ch.release, released: released(ch),
          unlocked: !!S.meta.unlocked[ch.id], cleared: !!S.meta.cleared[ch.id], hasSnap: !!S.meta.snaps[ch.id],
          pass: !!S.meta.ent['pass:' + ch.id] };
      });
    }
    function startChapter(chId) {
      var ch = chapterById[chId], snap = S.meta.snaps[chId];
      if (!ch || ch.side || !S.meta.unlocked[chId] || !snap || !released(ch)) return { ok: false, reason: 'locked' };
      tick();
      if (S.meta.energy < E.replayCost) return { ok: false, reason: 'energy', need: E.replayCost };
      S.meta.energy -= E.replayCost;
      var run = makeRun('main', snap.name, snap.trait, ch.first);
      run.stats = Core.clone(snap.stats); run.flags = Core.clone(snap.flags); run.items = Core.clone(snap.items);
      S.run = run; active = 'main'; save();
      return { ok: true };
    }
    function sideList() {
      return sideChapters.filter(released).map(function (ch) {
        return { id: ch.id, title: ch.title, release: ch.release, owned: !!S.meta.ent['side:' + ch.id], cleared: !!S.meta.sideCleared[ch.id], offerId: 'side:' + ch.id };
      });
    }
    function startSide(chId) {
      var ch = chapterById[chId];
      if (!ch || !ch.side || !released(ch) || !S.meta.ent['side:' + chId]) return { ok: false, reason: 'locked' };
      var base = S.run || { name: S.meta.lastName || '新同学', trait: C.traits[0].id };
      S.side = makeRun('side', base.name, base.trait, ch.first);
      active = 'side'; save();
      return { ok: true };
    }
    function leaveSide() { active = 'main'; if (S.side && S.side.ended) S.side = null; save(); }
    function resume() { active = 'main'; return !!(S.run && !S.run.ended); }
    function restart() { S.run = null; active = 'main'; save(); }

    /* ---------- 签到 ---------- */
    function checkinStatus() {
      var today = dayKey(clock.now());
      var c = S.meta.checkin;
      var y = dayKey(clock.now() - 86400000);
      var nextStreak = c.last === y ? (c.streak % E.checkin.length) + 1 : 1;
      return { available: c.last !== today, day: nextStreak, reward: E.checkin[nextStreak - 1], streak: c.streak, table: E.checkin };
    }
    function claimCheckin() {
      var st = checkinStatus();
      if (!st.available) return { ok: false, reason: 'claimed' };
      S.meta.checkin = { last: dayKey(clock.now()), streak: st.day };
      var out = []; grant(st.reward, out); save();
      return { ok: true, day: st.day, fx: out };
    }

    /* ---------- 商品（由内容数据生成：经济表 + 每章通行证 + 每个番外） ---------- */
    function allOffers() {
      var list = E.offers.slice();
      mainChapters.forEach(function (ch) {
        if (ch.pass && released(ch)) list.push({ id: 'pass:' + ch.id, kind: 'pass', chapter: ch.id, title: ch.title + ' 通行证', desc: '这一章里所有行动不消耗体力，永久有效。', gems: ch.pass.gems, price_rmb: ch.pass.price_rmb, sku: 'pass_' + ch.id });
      });
      sideChapters.forEach(function (ch) {
        if (ch.unlock && released(ch)) list.push({ id: 'side:' + ch.id, kind: 'side', chapter: ch.id, title: ch.title, desc: '解锁番外剧情，通关送 ' + ch.reward.gems + ' 宝石。', gems: ch.unlock.gems, price_rmb: ch.unlock.price_rmb, sku: 'side_' + ch.id });
      });
      return list;
    }
    function payAllowed() { return !!(cfg.monetizationEnabled && payment && payment.hasPermission()); }
    function owned(o) {
      if (o.kind === 'pass' || o.kind === 'side') return !!S.meta.ent[o.id];
      if (o.kind === 'gallery') return !!S.meta.ent.gallery;
      return false;
    }
    function offerView(o) {
      var limitLeft = o.dailyLimit ? o.dailyLimit - dailyCount(o.id) : Infinity;
      var full = o.kind === 'energy' && energyInfo().energy >= maxEnergy();
      var v = { id: o.id, kind: o.kind, title: o.title, desc: o.desc, price_rmb: o.price_rmb || null,
        coins: o.coins || null, gems: o.gems || null, owned: owned(o), limitLeft: limitLeft, full: full };
      var usable = !v.owned && limitLeft > 0 && !full;
      v.canCoins = usable && !!o.coins && S.meta.coins >= o.coins;
      v.canGems = usable && !!o.gems && S.meta.gems >= o.gems;
      v.canPay = usable && !!o.price_rmb && payAllowed();
      v.visible = !!(o.coins || o.gems) || v.canPay || (v.owned && !!o.price_rmb && payAllowed());
      return v;
    }
    function offers() { return allOffers().map(offerView).filter(function (v) { return v.visible; }); }
    function findOffer(id) { var l = allOffers(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
    function deliver(o, out) {
      if (o.kind === 'potion') { var r = cur() || S.run; if (r) r.items.potion = (r.items.potion || 0) + 1; else S.meta.bankPotion = (S.meta.bankPotion || 0) + 1; out.push('回复药 +1'); }
      else if (o.kind === 'energy') { var before = energyInfo().energy; if (o.amount === 'full') addEnergy(maxEnergy()); else addEnergy(o.amount); out.push('体力 +' + (S.meta.energy - before)); }
      else if (o.kind === 'pass' || o.kind === 'side') { S.meta.ent[o.id] = true; out.push('已解锁：' + o.title); }
      else if (o.kind === 'gallery') { S.meta.ent.gallery = true; out.push('已解锁：' + o.title); }
      else if (o.kind === 'gems') { S.meta.gems += o.amount; out.push('宝石 +' + o.amount); }
      if (o.dailyLimit) bumpDaily(o.id);
    }
    function buyWith(id, currency) {
      var o = findOffer(id);
      if (!o) return { ok: false, reason: 'no_offer' };
      var v = offerView(o);
      if (currency === 'coins' && !v.canCoins) return { ok: false, reason: 'cannot' };
      if (currency === 'gems' && !v.canGems) return { ok: false, reason: 'cannot' };
      if (currency !== 'coins' && currency !== 'gems') return { ok: false, reason: 'bad_currency' };
      if (currency === 'coins') S.meta.coins -= o.coins; else S.meta.gems -= o.gems;
      var out = []; deliver(o, out); save();
      return { ok: true, fx: out };
    }
    function purchase(id) {
      var o = findOffer(id);
      if (!o || !o.price_rmb) return Promise.resolve({ ok: false, reason: 'no_offer' });
      if (!offerView(o).canPay) return Promise.resolve({ ok: false, reason: 'no_permission' });
      return Promise.resolve(payment.purchase({ sku: o.sku, price_rmb: o.price_rmb, title: o.title })).then(function (r) {
        if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'failed' };
        var out = []; deliver(o, out);
        S.meta.purchases.push({ sku: o.sku, price_rmb: o.price_rmb, receipt: r.receipt || null, at: clock.now() });
        save();
        return { ok: true, fx: out };
      });
    }

    /* ---------- 图鉴 ---------- */
    function gallery() {
      var full = !!S.meta.ent.gallery;
      return {
        full: full, total: C.endings.length, got: Object.keys(S.meta.endings).length,
        milestones: (C.collection || []).map(function (m) { return { count: m.count, reward: m.reward, done: !!S.meta.milestones[m.count] }; }),
        endings: C.endings.map(function (e) {
          var got = !!S.meta.endings[e.id];
          return { id: e.id, title: got ? e.title : null, text: got ? fill(e.text, S.run || { name: S.meta.lastName }) : null, hint: (!got && full) ? e.hint : null, got: got, bg: e.bg };
        })
      };
    }

    function snapshot() {
      var run = cur();
      var sc = run ? sceneOf(run) : null;
      return {
        active: active, run: run, scene: sc, sceneId: run && run.scene,
        chapter: sc ? chapterById[sc.chapter] : null,
        choices: run && !run.ended && !run.waiting ? visibleChoices(run) : [],
        ending: run && run.ended && run.ended !== 'side' ? C.endings.filter(function (e) { return e.id === run.ended; })[0] : null,
        meta: S.meta, energy: energyInfo(), pass: run ? passActive(run) : false,
        canResume: !!(S.run && !S.run.ended)
      };
    }

    return {
      content: C, clock: clock, config: cfg,
      act: act, usePotion: usePotion, newRun: newRun, restart: restart, resume: resume,
      startChapter: startChapter, chapterList: chapterList, sideList: sideList, startSide: startSide, leaveSide: leaveSide,
      checkinStatus: checkinStatus, claimCheckin: claimCheckin,
      offers: offers, buyWith: buyWith, purchase: purchase, payAllowed: payAllowed,
      gallery: gallery, tick: tick, energyInfo: energyInfo, snapshot: snapshot, save: save,
      fillText: function (t) { return fill(t, cur() || S.run); },
      setMuted: function (m) { S.meta.muted = !!m; save(); },
      waitingRelease: function () { var r = cur(); if (r && r.waiting) { var ch = chapterById[r.waiting]; if (released(ch)) { r.waiting = null; enterChapter(r, ch.id); save(); } } return r && r.waiting ? chapterById[r.waiting] : null; },
      state: function () { return S; },
      stateHash: function () { return Core.hash(JSON.stringify(S)); }
    };
  };

  /* ======================================================================
   * 3. PRESENT —— Art：程序化 SVG
   * ==================================================================== */
  var Art = {};
  var uid = 0;
  function grad(id, a, b) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; }
  function skyBg(a, b) { var id = 'g' + (++uid); return '<defs>' + grad(id, a, b) + '</defs><rect width="360" height="220" fill="url(#' + id + ')"/>'; }
  function R(x, y, w, h, f, ex) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' + (ex || '') + '/>'; }
  function Ci(x, y, r, f, ex) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (ex || '') + '/>'; }
  function El(x, y, rx, ry, f, ex) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (ex || '') + '/>'; }
  function P(d, f, ex) { return '<path d="' + d + '" fill="' + f + '"' + (ex || '') + '/>'; }
  function pr(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); } /* 固定伪随机，保证画面每次一样 */
  function stars(n, col) { var s = ''; for (var i = 0; i < n; i++) s += Ci((pr(i) * 360).toFixed(1), (pr(i + 50) * 110).toFixed(1), (0.6 + pr(i + 99) * 1.2).toFixed(1), col || '#fff', ' opacity="' + (0.5 + pr(i + 7) * 0.5).toFixed(2) + '"'); return s; }
  function sakura(x, y) { var s = R(x - 4, y, 8, 60, '#7a4a3a'); for (var i = 0; i < 7; i++) s += Ci(x + (pr(x + i) - 0.5) * 60, y + (pr(y + i) - 0.5) * 34, 16 + pr(i + x) * 8, i % 2 ? '#ffb7d0' : '#ff9cc2'); return s; }
  function petals(n) { var s = ''; for (var i = 0; i < n; i++) s += El((pr(i + 300) * 360).toFixed(1), (pr(i + 400) * 220).toFixed(1), 3, 1.6, '#ffc4da', ' transform="rotate(' + Math.floor(pr(i) * 180) + ' ' + (pr(i + 300) * 360).toFixed(1) + ' ' + (pr(i + 400) * 220).toFixed(1) + ')"'); return s; }
  function building(dark) {
    var wall = dark ? '#2a1f2e' : '#f4efe6', win = dark ? '#ffcf5a' : '#8ec5ff';
    var s = R(50, 95, 260, 85, wall) + P('M40 98 L180 70 L320 98 Z', dark ? '#1b1320' : '#c0504d');
    for (var r = 0; r < 2; r++) for (var c = 0; c < 8; c++) if (c !== 3 && c !== 4) s += R(62 + c * 30, 108 + r * 32, 18, 20, win, dark && pr(r * 8 + c) > 0.5 ? ' opacity="0.3"' : '');
    s += R(158, 30, 44, 80, dark ? '#1b1320' : '#e9e1d2') + P('M152 32 L180 8 L208 32 Z', dark ? '#120c16' : '#8e3b3a');
    s += Ci(180, 56, 13, dark ? '#c9b8d8' : '#fff', ' stroke="#555" stroke-width="2"') + P('M180 56 L180 47 M180 56 L187 59', 'none', ' stroke="#333" stroke-width="2"');
    s += R(168, 140, 24, 40, dark ? '#120c16' : '#8b5a3c');
    return s;
  }
  function trees(y, col, n, h, off) { var s = ''; for (var i = 0; i < n; i++) { var x = i * (360 / (n - 1)) + (pr(i + off) - 0.5) * 30; var hh = h * (0.8 + pr(i + off + 9) * 0.4); s += P('M' + (x - 26) + ' ' + y + ' L' + x + ' ' + (y - hh) + ' L' + (x + 26) + ' ' + y + ' Z', col); } return s; }
  function fog(y, op) { return El(80, y, 140, 14, '#e6eef0', ' opacity="' + op + '"') + El(280, y + 10, 150, 16, '#e6eef0', ' opacity="' + op + '"'); }
  function house(x, w, h, wall, roof) { return R(x, 180 - h, w, h, wall) + P('M' + (x - 6) + ' ' + (180 - h) + ' L' + (x + w / 2) + ' ' + (180 - h - 26) + ' L' + (x + w + 6) + ' ' + (180 - h) + ' Z', roof) + R(x + w / 2 - 7, 180 - 24, 14, 24, '#5b3a29') + R(x + 8, 180 - h + 10, 12, 12, '#ffe8a3'); }
  function runes(cx, cy, r, n, col) { var s = ''; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; s += Ci((cx + Math.cos(a) * r).toFixed(1), (cy + Math.sin(a) * r).toFixed(1), 3.2, col, ' opacity="0.9"'); } return s; }

  Art.scenes = {
    academy: function () { return skyBg('#ffd6e8', '#a8d8ff') + El(90, 120, 140, 40, '#c7e3c0') + El(290, 125, 140, 40, '#b8dbb0') + building(false) + R(0, 178, 360, 42, '#9ad18b') + P('M160 220 L172 180 L188 180 L200 220 Z', '#e8d9c0') + sakura(30, 120) + sakura(330, 118) + petals(24); },
    classroom: function () {
      var s = R(0, 0, 360, 220, '#f3e7cf') + R(0, 168, 360, 52, '#b98b5e') + R(24, 30, 190, 90, '#2f5d50', ' stroke="#7a5230" stroke-width="5"');
      s += P('M50 60 Q90 40 120 70 T190 60', 'none', ' stroke="#fff" stroke-width="2" opacity="0.8"') + Ci(170, 58, 9, 'none', ' stroke="#ff8a8a" stroke-width="2"') + P('M44 100 L110 100 M44 108 L90 108', 'none', ' stroke="#fff" stroke-width="2" opacity="0.6"');
      s += R(240, 26, 100, 96, '#9ed3ff', ' stroke="#fff" stroke-width="5"') + P('M290 26 L290 122 M240 74 L340 74', 'none', ' stroke="#fff" stroke-width="4"') + sakura(310, 70).replace(/#7a4a3a/g, 'none');
      for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) s += R(30 + c * 86 + r * 12, 140 + r * 34, 64, 12, '#a0703f') + R(36 + c * 86 + r * 12, 152 + r * 34, 6, 16, '#7a5230') + R(86 + c * 86 + r * 12, 152 + r * 34, 6, 16, '#7a5230');
      return s;
    },
    training: function () {
      var s = skyBg('#bfe6ff', '#eef9ff') + El(180, 110, 220, 30, '#cde9c4') + R(0, 120, 360, 100, '#7cc36b');
      for (var i = 0; i < 12; i++) s += R(i * 32, 112, 4, 20, '#8b6a45'); s += R(0, 116, 360, 3, '#8b6a45');
      s += El(250, 180, 70, 18, 'none', ' stroke="#7fd6ff" stroke-width="3"') + El(250, 180, 50, 12, 'none', ' stroke="#7fd6ff" stroke-width="2" opacity="0.7"') + runes(250, 180, 60, 10, '#7fd6ff');
      for (var j = 0; j < 3; j++) s += R(50 + j * 50, 140, 10, 50, '#a0703f') + Ci(55 + j * 50, 136, 12, '#c49a6c') + Ci(55 + j * 50, 136, 6, '#d9534f');
      return s;
    },
    forest: function () { return skyBg('#d7ecd6', '#7aa889') + trees(140, '#5d8f6a', 9, 90, 1) + fog(120, 0.45) + trees(185, '#3f6e4d', 8, 110, 20) + R(0, 180, 360, 40, '#3b5e40') + fog(170, 0.5) + P('M150 220 Q180 190 170 180 L190 180 Q185 195 215 220 Z', '#6d8f5b') + trees(230, '#24452f', 6, 120, 40); },
    forest_night: function () {
      var s = skyBg('#0d1b2a', '#1b3a3a') + trees(150, '#14302b', 9, 100, 3) + fog(130, 0.18) + trees(200, '#0c211d', 8, 120, 30) + R(0, 195, 360, 25, '#08140f');
      for (var i = 0; i < 7; i++) { var x = 30 + i * 48 + pr(i) * 10, y = 120 + pr(i + 3) * 50; s += El(x, y, 3, 2, '#7dff8a') + El(x + 10, y, 3, 2, '#7dff8a'); }
      s += P('M120 200 Q130 150 175 145 L190 130 L198 146 Q240 150 250 200 Z', '#05080a') + El(186, 150, 4, 2.5, '#ff4d4d') + El(200, 152, 3, 2, '#ff4d4d') + El(185, 140, 60, 10, '#3a3a4a', ' opacity="0.5"') + fog(190, 0.22);
      return s;
    },
    spring: function () {
      var id = 'sp' + (++uid);
      var s = skyBg('#10302c', '#1d4a40') + trees(150, '#0f2b25', 9, 110, 5) + R(0, 140, 360, 80, '#163a30');
      s += '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="#c9fbff"/><stop offset="0.6" stop-color="#47d1e6"/><stop offset="1" stop-color="#14606b"/></radialGradient></defs>' + El(180, 175, 120, 30, 'url(#' + id + ')') + El(180, 168, 70, 12, '#e8ffff', ' opacity="0.4"');
      for (var i = 0; i < 18; i++) s += Ci((60 + pr(i) * 240).toFixed(1), (60 + pr(i + 20) * 120).toFixed(1), 1.5 + pr(i + 40) * 1.5, '#bff8ff', ' opacity="0.8"');
      return s;
    },
    town: function () {
      var s = skyBg('#ffcf9e', '#fff0d6') + El(60, 60, 30, 30, '#fff3c4', ' opacity="0.8"');
      var cols = [['#f6d5a8', '#c0504d'], ['#e8c4d8', '#5b6db5'], ['#d9e7c4', '#8b5a3c'], ['#f2e1b8', '#3c8d7a'], ['#e7d0c0', '#a04060']];
      for (var i = 0; i < 6; i++) s += house(8 + i * 60, 46, 60 + pr(i) * 30, cols[i % 5][0], cols[i % 5][1]);
      s += R(0, 180, 360, 40, '#d8c3a0') + El(180, 192, 40, 9, '#8fb8d8') + R(174, 168, 12, 22, '#bfb3a5') + Ci(180, 165, 8, '#9fd0ff');
      s += P('M0 30 Q90 50 180 30 T360 30', 'none', ' stroke="#8b5a3c" stroke-width="1.5"');
      for (var j = 0; j < 9; j++) s += P('M' + (j * 40 + 10) + ' ' + (36 + (j % 2) * 4) + ' l8 0 l-4 12 Z', ['#e74c3c', '#f1c40f', '#3498db'][j % 3]);
      return s;
    },
    tavern: function () {
      var s = R(0, 0, 360, 220, '#5a3a22') + R(0, 160, 360, 60, '#3d2616');
      for (var i = 0; i < 8; i++) s += R(i * 46, 0, 3, 160, '#4a2e1a');
      s += R(20, 40, 160, 6, '#7a5230') + R(20, 80, 160, 6, '#7a5230');
      for (var j = 0; j < 8; j++) s += R(28 + j * 19, 22, 8, 18, ['#2e8b57', '#a0522d', '#4682b4'][j % 3]) + R(30 + j * 19, 62, 7, 18, ['#8b0000', '#daa520', '#2f4f4f'][j % 3]);
      s += R(10, 120, 220, 44, '#7a4a28') + R(10, 116, 220, 8, '#9b6a3c');
      s += El(290, 175, 26, 32, '#8b5a2b') + R(264, 160, 52, 4, '#4a2e1a') + R(264, 186, 52, 4, '#4a2e1a') + El(330, 185, 18, 24, '#7a4a20');
      s += Ci(90, 18, 30, '#ffd27a', ' opacity="0.25"') + Ci(90, 18, 8, '#ffd27a') + Ci(270, 18, 30, '#ffd27a', ' opacity="0.25"') + Ci(270, 18, 8, '#ffd27a');
      return s;
    },
    town_night: function () {
      var s = skyBg('#0b1640', '#2b2f6b') + stars(40) + Ci(300, 40, 20, '#fff6d0') + Ci(308, 34, 18, '#1a2150');
      for (var i = 0; i < 6; i++) s += house(8 + i * 60, 46, 60 + pr(i) * 30, '#1d2244', '#141834').replace(/#ffe8a3/g, '#ffcf5a');
      s += R(0, 180, 360, 40, '#151a36') + P('M0 70 Q90 95 180 70 T360 70', 'none', ' stroke="#555" stroke-width="1"');
      for (var j = 0; j < 10; j++) s += Ci(j * 36 + 18, 76 + Math.sin(j) * 8, 6, j % 2 ? '#ff6b4a' : '#ffb347') + Ci(j * 36 + 18, 76 + Math.sin(j) * 8, 12, '#ff8c42', ' opacity="0.2"');
      var fx = [[90, 40, '#ff7eb6'], [200, 30, '#7fd6ff']];
      fx.forEach(function (f) { for (var k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2; s += P('M' + f[0] + ' ' + f[1] + ' L' + (f[0] + Math.cos(a) * 26).toFixed(1) + ' ' + (f[1] + Math.sin(a) * 26).toFixed(1), 'none', ' stroke="' + f[2] + '" stroke-width="2" stroke-linecap="round"'); } });
      return s;
    },
    ruins: function () {
      var s = skyBg('#9aa3ad', '#d7d2c8') + El(180, 200, 220, 40, '#8b857a');
      s += R(90, 40, 180, 150, '#8a8478') + P('M120 190 L120 100 Q180 50 240 100 L240 190 Z', '#2b2433');
      s += P('M180 60 L176 100 L184 130 L178 190', 'none', ' stroke="#a96bff" stroke-width="3"') + El(180, 130, 30, 50, '#7a3cff', ' opacity="0.25"') + runes(180, 110, 70, 12, '#c79bff');
      s += R(30, 70, 28, 120, '#a29b8d') + R(26, 64, 36, 10, '#8a8478') + R(300, 110, 28, 80, '#a29b8d') + P('M300 110 L310 96 L328 110 Z', '#a29b8d') + R(0, 190, 360, 30, '#7d776c');
      return s;
    },
    ruins_hall: function () {
      var s = skyBg('#1a1426', '#3b2a52') + R(0, 120, 360, 100, '#0a0710');
      s += El(180, 200, 160, 40, '#5a2d8c', ' opacity="0.35"') + El(180, 190, 90, 20, '#a96bff', ' opacity="0.2"');
      s += P('M0 110 L160 116 L150 132 L0 130 Z', '#6b6375') + P('M200 112 L360 106 L360 126 L212 130 Z', '#6b6375') + P('M150 132 L140 150 L160 145 Z', '#4a4452') + P('M212 130 L222 152 L204 144 Z', '#4a4452');
      for (var i = 0; i < 5; i++) s += R(20 + i * 75, 20, 16, 90, '#2b2238');
      s += El(300, 100, 34, 30, '#7fd6ff', ' opacity="0.25"') + P('M270 120 Q300 70 330 120', 'none', ' stroke="#7fd6ff" stroke-width="2" stroke-dasharray="4 3"');
      for (var j = 0; j < 6; j++) s += R(120 + pr(j) * 120, 150 + pr(j + 4) * 50, 8, 6, '#4a4452');
      return s;
    },
    ruins_core: function () {
      var id = 'rc' + (++uid);
      var s = skyBg('#120d1d', '#2a1f3d') + '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient></defs>' + Ci(180, 110, 90, 'url(#' + id + ')', ' opacity="0.5"');
      s += R(110, 160, 140, 20, '#4a4060') + R(125, 145, 110, 18, '#5a5070') + R(140, 132, 80, 15, '#6a6080') + R(0, 180, 360, 40, '#1a1428');
      s += P('M176 132 L176 70 L184 60 L186 132 Z', '#cfd6e0') + R(166, 126, 30, 6, '#8b6a45') + R(177, 132, 8, 14, '#5a3a22') + El(181, 90, 18, 40, '#2a1f3d', ' opacity="0.6"');
      s += runes(180, 150, 100, 16, '#c79bff') + stars(20, '#c79bff');
      return s;
    },
    rift: function () {
      var s = skyBg('#5b0b18', '#e0603a') + building(true);
      s += P('M180 8 L172 -10 L190 -10 Z', '#000') + P('M168 0 Q150 60 120 110 Q160 80 175 30 Z', '#0a0508', ' opacity="0.85"') + P('M192 0 Q215 70 250 110 Q205 80 186 30 Z', '#0a0508', ' opacity="0.85"') + P('M175 0 L180 20 L185 0', 'none', ' stroke="#ff4d6d" stroke-width="3"');
      s += P('M20 180 Q180 60 340 180', 'none', ' stroke="#7fd6ff" stroke-width="3" opacity="0.7"') + R(0, 178, 360, 42, '#2b1a16');
      return s;
    },
    final: function () {
      var s = skyBg('#1a0006', '#4a0a14') + stars(16, '#ff9aa8');
      for (var i = 0; i < 4; i++) s += Ci(180, 80, 30 + i * 22, 'none', ' stroke="#ff4d6d" stroke-width="1.5" opacity="' + (0.5 - i * 0.1) + '"');
      s += P('M120 200 Q110 120 150 90 Q140 50 180 30 Q220 50 210 90 Q250 120 240 200 Z', '#050003') + P('M150 95 Q100 110 70 80 Q110 120 150 115 Z', '#050003') + P('M210 95 Q260 110 290 80 Q250 120 210 115 Z', '#050003');
      s += El(168, 62, 6, 3, '#ff2244') + El(192, 62, 6, 3, '#ff2244') + R(0, 196, 360, 24, '#2a2024') + P('M0 196 L20 180 L340 180 L360 196 Z', '#3a2e32');
      return s;
    },
    beach: function () {
      var s = skyBg('#8fd3ff', '#e6f7ff') + Ci(300, 40, 22, '#fff1a8') + R(0, 110, 360, 50, '#2d9cdb') + R(0, 110, 360, 6, '#7cc8f0');
      s += P('M0 160 Q45 150 90 160 T180 160 T270 160 T360 160 L360 220 L0 220 Z', '#f5deb3') + P('M0 158 Q45 150 90 158 T180 158 T270 158 T360 158', 'none', ' stroke="#fff" stroke-width="3"');
      s += R(98, 120, 4, 70, '#8b5a3c') + P('M50 126 Q100 80 150 126 Z', '#ff6b6b') + P('M75 126 Q100 90 100 126 Z', '#fff', ' opacity="0.6"');
      s += El(250, 190, 14, 8, '#e74c3c') + El(60, 200, 8, 4, '#fff');
      return s;
    },
    bonfire: function () {
      var s = skyBg('#0a1030', '#26305e') + stars(50) + R(0, 120, 360, 40, '#14204a') + R(0, 160, 360, 60, '#5a4a3a');
      s += Ci(180, 160, 60, '#ff9a3c', ' opacity="0.18"') + P('M150 190 L210 190 L196 180 L164 180 Z', '#5a3a22');
      s += P('M160 182 Q165 140 180 120 Q195 140 200 182 Z', '#ff6b2c') + P('M168 182 Q172 150 180 136 Q188 150 192 182 Z', '#ffc93c') + P('M174 182 Q178 160 180 152 Q182 160 186 182 Z', '#fff3b0');
      for (var i = 0; i < 8; i++) s += Ci(170 + pr(i) * 20, 110 - pr(i + 9) * 50, 1.5, '#ffcf5a');
      return s;
    }
  };

  Art.scene = function (bg) {
    var fn = Art.scenes[bg] || Art.scenes.academy;
    return '<svg class="scene-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="场景">' + fn() + '</svg>';
  };

  Art.portrait = function (ch, mood) {
    var h = ch.hair, hd = ch.hairDark, e = ch.eye, o = ch.outfit, a = ch.accent, skin = '#ffe3d3', line = '#4a2a2a';
    var smile = mood === 'smile';
    var s = '<svg class="portrait-svg" viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + ch.name + '">';
    if (ch.style === 'ponytail') s += P('M86 30 Q120 40 112 90 Q108 120 96 140 Q100 100 88 70 Z', hd) + P('M30 40 Q26 90 34 110 L86 110 Q94 90 90 40 Z', hd);
    else s += P('M24 50 Q20 100 30 112 L90 112 Q100 100 96 50 Q90 18 60 18 Q30 18 24 50 Z', hd);
    s += P('M20 160 Q22 122 60 116 Q98 122 100 160 Z', o) + P('M46 118 L60 140 L74 118 Z', '#fff') + P('M54 128 L60 138 L66 128 L60 124 Z', a) + R(52, 98, 16, 20, skin);
    if (ch.style === 'ponytail') s += R(92, 96, 6, 60, '#6b4a2a', ' transform="rotate(25 95 126)"') + R(86, 92, 18, 5, a, ' transform="rotate(25 95 94)"');
    else s += P('M24 122 Q60 112 96 122 L100 134 Q60 124 20 134 Z', '#2a2240');
    s += El(60, 64, 30, 34, skin);
    var eyeY = 68;
    [[47, -1], [73, 1]].forEach(function (p) {
      var x = p[0];
      s += El(x, eyeY, 8.5, 10.5, '#fff') + El(x, eyeY + 1, 7, 9, e) + El(x, eyeY + 2.5, 3.4, 5, '#1a1020') + Ci(x - 2.5, eyeY - 3, 2.6, '#fff') + Ci(x + 2.5, eyeY + 5, 1.2, '#fff');
      s += P('M' + (x - 9.5) + ' ' + (eyeY - 6) + ' Q' + x + ' ' + (eyeY - 13) + ' ' + (x + 9.5) + ' ' + (eyeY - 6), 'none', ' stroke="' + line + '" stroke-width="2.4" stroke-linecap="round"');
      s += P('M' + (x - 6) + ' ' + (eyeY - 15) + ' Q' + x + ' ' + (eyeY - 18) + ' ' + (x + 6) + ' ' + (eyeY - 15.5), 'none', ' stroke="' + line + '" stroke-width="1.5" stroke-linecap="round" opacity="0.8"');
    });
    if (smile) s += P('M52 84 Q60 92 68 84', 'none', ' stroke="' + line + '" stroke-width="2" stroke-linecap="round"') + El(40, 80, 6, 3, '#ff8fa3', ' opacity="0.5"') + El(80, 80, 6, 3, '#ff8fa3', ' opacity="0.5"');
    else s += P('M55 86 L65 86', 'none', ' stroke="' + line + '" stroke-width="2" stroke-linecap="round"');
    if (ch.style === 'ponytail') s += P('M28 58 Q26 24 60 20 Q96 22 92 58 L84 46 L78 58 L70 40 L62 54 L54 38 L46 54 L40 42 L34 60 Z', h) + R(84, 26, 10, 8, a, ' rx="2"');
    else s += P('M26 70 Q22 26 60 22 Q98 26 94 70 L88 54 L82 66 L74 46 L66 60 L58 44 L50 60 L42 48 L36 64 L30 56 Z', h) + P('M84 34 l3 6 l6 1 l-4.5 4 l1.2 6 l-5.7 -3 l-5.7 3 l1.2 -6 l-4.5 -4 l6 -1 Z', a);
    return s + '</svg>';
  };

  /* ======================================================================
   * Sound：WebAudio 合成
   * ==================================================================== */
  function createSound(win) {
    var ctx = null, muted = false;
    var notes = { tap: [[660, 0.05]], good: [[523, 0.08], [659, 0.08], [784, 0.12]], bad: [[300, 0.12], [220, 0.18]], fight: [[180, 0.06], [140, 0.1]], rest: [[440, 0.15], [392, 0.2]], end: [[523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.3]] };
    return {
      unlock: function () {
        if (ctx || !win) return;
        var AC = win.AudioContext || win.webkitAudioContext;
        if (!AC) return;
        try { ctx = new AC(); } catch (e) { ctx = null; }
      },
      setMuted: function (m) { muted = !!m; },
      isMuted: function () { return muted; },
      play: function (name) {
        if (muted || !ctx) return;
        try {
          if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
          var t = ctx.currentTime, seq = notes[name] || notes.tap;
          seq.forEach(function (n) {
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.type = name === 'fight' || name === 'bad' ? 'square' : 'triangle';
            o.frequency.setValueAtTime(n[0], t);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1]);
            o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + n[1] + 0.02);
            t += n[1] * 0.9;
          });
        } catch (e) { /* 音频失败不影响游戏 */ }
      }
    };
  }

  /* ======================================================================
   * UI：视图 + 统一 tap（touchend + click 去重，不用 Pointer Events）
   * ==================================================================== */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function btn(act, label, arg, cls) { return '<button type="button" class="btn ' + (cls || '') + '" data-act="' + act + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : '') + '>' + label + '</button>'; }
  function mmss(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
  function hm(ms) { var m = Math.ceil(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分' : m + ' 分钟'; }
  function rewardText(r) { var a = []; if (r.coins) a.push('学园币+' + r.coins); if (r.gems) a.push('宝石+' + r.gems); if (r.energy) a.push('体力+' + r.energy); if (r.potion) a.push('回复药+' + r.potion); return a.join(' '); }

  function bindTap(rootEl, onAct, tapNow) {
    var sx = 0, sy = 0, moved = false, lastTouch = -10000;
    function findAct(t) {
      while (t && t !== rootEl) { if (t.getAttribute && t.getAttribute('data-act')) return t; t = t.parentNode; }
      return null;
    }
    rootEl.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0]; moved = false;
      if (t) { sx = t.clientX; sy = t.clientY; }
    }, { passive: true });
    rootEl.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0];
      if (t && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)) moved = true;
    }, { passive: true });
    rootEl.addEventListener('touchend', function (e) {
      var el = findAct(e.target);
      if (!el || moved) return;
      lastTouch = tapNow();
      if (e.cancelable !== false && e.preventDefault) e.preventDefault();
      onAct(el);
    }, { passive: false });
    rootEl.addEventListener('click', function (e) {
      var el = findAct(e.target);
      if (!el) return;
      if (tapNow() - lastTouch < 700) return; /* touchend 已经处理过，忽略随后的合成 click */
      onAct(el);
    });
  }

  function createUI(engine, rootEl, env) {
    var doc = env.document, win = env.window;
    var C = engine.content;
    var sound = env.sound || createSound(win);
    var ui = { view: 'title', ret: 'title', toast: '', wall: null, trait: C.traits[0].id, confirm: null, lastResult: null, nameDraft: '' };
    sound.setMuted(engine.state().meta.muted);

    function toast(msg) { ui.toast = msg; }
    function go(v) { if (v === 'shop' || v === 'gallery') ui.ret = (ui.view === 'shop' || ui.view === 'gallery') ? ui.ret : ui.view; ui.view = v; ui.confirm = null; }
    function afterAct(r) {
      if (!r.ok) {
        if (r.reason === 'energy') { ui.wall = { need: r.need }; sound.play('bad'); }
        else if (r.reason === 'empty') toast('先写下你想做什么。');
        return;
      }
      ui.wall = null; ui.lastResult = r;
      sound.play(r.sfx || 'tap');
      if (r.ending) ui.view = 'ending';
      else if (r.finished) ui.view = 'sideEnd';
    }

    /* 动作表：每个 data-act 都必须在这里，自测会检查 */
    var actions = {
      'new': function () { ui.nameDraft = engine.state().meta.lastName || ''; go('create'); },
      'resume': function () { if (engine.resume()) { ui.lastResult = null; go('play'); } },
      'trait': function (id) { var inp = doc.getElementById('name-input'); if (inp) ui.nameDraft = inp.value; ui.trait = id; },
      'start': function () {
        var inp = doc.getElementById('name-input');
        engine.newRun(inp ? inp.value : ui.nameDraft, ui.trait);
        ui.lastResult = null; ui.wall = null; go('play'); sound.play('good');
      },
      'choice': function (i) { afterAct(engine.act({ type: 'choice', idx: Number(i) })); },
      'free': function () {
        var inp = doc.getElementById('free-input');
        var text = inp ? inp.value : '';
        var r = engine.act({ type: 'free', text: text });
        afterAct(r);
        if (r.ok && inp) inp.value = '';
      },
      'rest': function () { afterAct(engine.act({ type: 'intent', intent: 'rest' })); },
      'potion': function () { var r = engine.usePotion(); if (r.ok) { ui.wall = null; toast('用掉 1 瓶回复药，' + r.fx.join(' ')); sound.play('good'); } },
      'shop': function () { go('shop'); },
      'gallery': function () { go('gallery'); },
      'chapters': function () { go('chapters'); },
      'sides': function () { go('sides'); },
      'back': function () { var v = ui.ret || 'title'; if (v === 'play' && !engine.snapshot().run) v = 'title'; ui.view = v; ui.ret = 'title'; },
      'title': function () { if (engine.snapshot().active === 'side') engine.leaveSide(); go('title'); },
      'mute': function () { var m = !sound.isMuted(); sound.setMuted(m); engine.setMuted(m); if (!m) sound.play('tap'); },
      'restart': function () { ui.confirm = 'restart'; },
      'restart-yes': function () { engine.restart(); ui.confirm = null; ui.lastResult = null; ui.nameDraft = engine.state().meta.lastName || ''; go('create'); },
      'restart-no': function () { ui.confirm = null; },
      'checkin': function () { var r = engine.claimCheckin(); if (r.ok) { toast('签到第 ' + r.day + ' 天：' + r.fx.join(' ')); sound.play('good'); } },
      'buy-coins': function (id) { var r = engine.buyWith(id, 'coins'); if (r.ok) { toast(r.fx.join(' ')); sound.play('good'); ui.wall = null; } },
      'buy-gems': function (id) { var r = engine.buyWith(id, 'gems'); if (r.ok) { toast(r.fx.join(' ')); sound.play('good'); ui.wall = null; } },
      'pay': function (id) {
        engine.purchase(id).then(function (r) { toast(r.ok ? '购买成功：' + r.fx.join(' ') : '支付没有完成，没有扣费。'); if (r.ok) ui.wall = null; render(); });
      },
      'chapter-start': function (id) { var r = engine.startChapter(id); if (r.ok) { ui.lastResult = null; ui.wall = null; go('play'); sound.play('good'); } },
      'side-start': function (id) { var r = engine.startSide(id); if (r.ok) { ui.lastResult = null; ui.wall = null; go('play'); sound.play('good'); } },
      'again': function () { engine.restart(); ui.nameDraft = engine.state().meta.lastName || ''; ui.lastResult = null; go('create'); }
    };

    /* ---------- 视图 ---------- */
    function topbar() {
      var sn = engine.snapshot(), en = sn.energy, m = sn.meta;
      return '<div class="topbar">' +
        '<span class="pill energy">体力 <b id="energy-val">' + en.energy + '/' + en.max + '</b><small id="regen">' + (en.nextMs ? ' +1 ' + mmss(en.nextMs) : ' 已满') + '</small></span>' +
        '<span class="pill">学园币 <b>' + m.coins + '</b></span><span class="pill gem">宝石 <b>' + m.gems + '</b></span>' +
        btn('mute', sound.isMuted() ? '开声' : '静音', null, 'mini') + '</div>' +
        (ui.toast ? '<div class="toast">' + esc(ui.toast) + '</div>' : '');
    }
    function footer() { return '<div class="ai-note">本游戏由 AI 制作 · 剧情由本地剧情引擎生成，全程不联网</div>'; }
    function artWithChars(bg, chars, run) {
      var s = '<div class="art">' + Art.scene(bg);
      (chars || []).forEach(function (id, i) {
        var ch = C.characters[id];
        var aff = run ? run.stats[ch.stat] : 50;
        s += '<div class="portrait ' + (chars.length === 1 ? 'solo' : (i === 0 ? 'left' : 'right')) + '">' + Art.portrait(ch, aff >= 40 ? 'smile' : 'normal') + '<span class="nametag">' + ch.name + '</span></div>';
      });
      return s + '</div>';
    }

    function viewTitle() {
      var sn = engine.snapshot(), ci = engine.checkinStatus();
      var chs = engine.chapterList(), sides = engine.sideList();
      var latest = C.chapters.filter(function (c) { return Date.parse(c.release + 'T00:00:00+08:00') <= engine.clock.now(); }).sort(function (a, b) { return a.release < b.release ? 1 : -1; })[0];
      var upcoming = C.chapters.filter(function (c) { return Date.parse(c.release + 'T00:00:00+08:00') > engine.clock.now(); });
      var s = topbar() + artWithChars(C.ui.titleBg, C.ui.titleChars, null) +
        '<h1 class="logo">我成了动漫主角</h1><p class="sub">异世界学园冒险 · 你说什么，剧情就往哪走</p><div class="menu">';
      if (sn.canResume) s += btn('resume', '继续冒险', null, 'primary');
      s += btn('new', sn.canResume ? '新的冒险' : '开始冒险', null, sn.canResume ? '' : 'primary');
      if (ci.available) s += btn('checkin', '每日签到 · 第 ' + ci.day + ' 天（' + rewardText(ci.reward) + '）', null, 'gold');
      if (chs.some(function (c) { return c.unlocked; })) s += btn('chapters', '章节选择');
      if (sides.length) s += btn('sides', '番外篇');
      s += btn('shop', '商店') + btn('gallery', '结局图鉴 ' + engine.gallery().got + '/' + C.endings.length) + '</div>';
      s += '<div class="news">每周二上新' + (latest ? ' · 本周新增：' + esc(latest.title) : '') + (upcoming.length ? ' · 下一次更新：' + esc(upcoming[0].title) + '（' + upcoming[0].release + '）' : '') + '</div>';
      s += '<div class="checkin-row">' + ci.table.map(function (r, i) { return '<span class="ck' + (i < ci.streak && !ci.available ? ' done' : '') + (i < ci.day - 1 && ci.available ? ' done' : '') + '">第' + (i + 1) + '天<br>' + rewardText(r) + '</span>'; }).join('') + '</div>';
      return '<div class="screen title-screen">' + s + footer() + '</div>';
    }

    function viewCreate() {
      var s = topbar() + '<h2>创建你的主角</h2><label class="field">名字（最多 8 个字）<input id="name-input" type="text" maxlength="8" autocomplete="off" value="' + esc(ui.nameDraft) + '" placeholder="新同学"></label><h3>选一个特质</h3><div class="traits">';
      C.traits.forEach(function (t) { s += '<button type="button" class="trait' + (ui.trait === t.id ? ' on' : '') + '" data-act="trait" data-arg="' + t.id + '"><b>' + t.name + '</b><span>' + esc(t.desc) + '</span></button>'; });
      s += '</div>' + btn('start', esc(C.ui.startLabel), null, 'primary wide') + btn('title', '返回', null, 'ghost');
      return '<div class="screen">' + s + footer() + '</div>';
    }

    function bars(run) {
      function bar(label, v, cls) { return '<div class="bar ' + cls + '"><span>' + label + ' ' + v + '</span><i style="width:' + v + '%"></i></div>'; }
      var s = bar(C.statNames.rep, run.stats.rep, 'rep');
      Object.keys(C.characters).forEach(function (id, i) { var ch = C.characters[id]; s += bar(ch.name, run.stats[ch.stat], i ? 'b' : 'a'); });
      return '<div class="bars">' + s + '</div>';
    }

    function wallPanel(sn) {
      var en = sn.energy, ch = sn.chapter, s = '<div class="wall"><b>体力不够了（需要 ' + ui.wall.need + '，现在 ' + en.energy + '）</b>';
      s += '<p>' + (en.nextMs ? '每 3 分钟恢复 1 点，下一点 ' + mmss(en.nextMs) + ' 后到账，回满约 ' + hm(en.fullMs) + '。' : '') + '原地休息不花体力，随时可以。</p><div class="wall-btns">';
      s += btn('rest', '原地休息');
      if ((sn.run.items.potion || 0) > 0) s += btn('potion', '喝回复药（剩 ' + sn.run.items.potion + '）');
      var offs = engine.offers();
      offs.forEach(function (o) {
        var rel = o.kind === 'energy' || (o.kind === 'pass' && ch && o.id === 'pass:' + ch.id);
        if (!rel || o.owned) return;
        if (o.canCoins) s += btn('buy-coins', o.title + '（' + o.coins + ' 学园币）', o.id);
        if (o.canGems) s += btn('buy-gems', o.title + '（' + o.gems + ' 宝石）', o.id);
        if (o.canPay) s += btn('pay', o.title + '（¥' + o.price_rmb + '）', o.id, 'gold');
      });
      return s + '</div></div>';
    }

    function viewPlay() {
      var sn = engine.snapshot(), run = sn.run;
      if (!run) { ui.view = 'title'; return viewTitle(); }
      var waiting = engine.waitingRelease();
      var sc = sn.scene;
      var s = topbar() + artWithChars(sc.bg, sc.chars, run);
      s += '<div class="tag">' + esc(sn.chapter.title) + ' · ' + esc(sc.title) + (sn.pass ? ' <em>通行证生效：不耗体力</em>' : '') + '</div>';
      if (waiting) {
        s += '<div class="story"><p>' + esc(waiting.title) + ' 将在 ' + waiting.release + ' 上线，到时打开游戏就能接着玩。存档已保存。</p></div>' + '<div class="choices">' + btn('title', '回到标题', null, 'primary') + '</div>';
        return '<div class="screen play">' + s + footer() + '</div>';
      }
      s += '<div class="story">';
      if (!ui.lastResult || ui.lastResult.moved || !run.log.length) {
        if (ui.lastResult && ui.lastResult.moved) s += '<div class="resp"><p class="you">你：' + esc(ui.lastResult.said) + '</p><p>' + esc(ui.lastResult.text).replace(/\n/g, '<br>') + '</p>' + (ui.lastResult.fx.length ? '<p class="fx">' + esc(ui.lastResult.fx.join('  ')) + '</p>' : '') + '</div>';
        s += '<p class="scene-text">' + esc(engine.fillText(sc.text)) + '</p>';
      } else {
        s += '<p class="scene-text dim">' + esc(engine.fillText(sc.text)) + '</p>';
        run.log.slice(-3).forEach(function (l) { s += '<div class="resp"><p class="you">你：' + esc(l.said) + '</p><p>' + esc(l.text).replace(/\n/g, '<br>') + '</p>' + (l.fx && l.fx.length ? '<p class="fx">' + esc(l.fx.join('  ')) + '</p>' : '') + '</div>'; });
      }
      s += '</div>' + bars(run);
      if (ui.wall) s += wallPanel(sn);
      s += '<div class="choices">';
      sn.choices.forEach(function (c, i) {
        var cost = sn.pass ? 0 : (C.intents[c.intent] ? C.intents[c.intent].cost : C.fallbackCost);
        s += '<button type="button" class="btn choice" data-act="choice" data-arg="' + i + '">' + esc(c.label) + '<small>' + C.intents[c.intent].label + (cost ? ' · 体力 ' + cost : '') + '</small></button>';
      });
      s += '</div><div class="free"><input id="free-input" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="' + esc(C.ui.inputHint) + '">' + btn('free', '行动', null, 'primary') + '</div>';
      s += '<div class="hint">能识别：战斗 对话 探索 移动 道具 休息 逃跑 帮助。写别的也行，剧情会照常往下走。</div>';
      s += '<div class="nav">' + btn('rest', '休息', null, 'mini') + ((run.items.potion || 0) > 0 ? btn('potion', '回复药×' + run.items.potion, null, 'mini') : '<span class="pill">回复药×0</span>') + btn('shop', '商店', null, 'mini') + btn('gallery', '图鉴', null, 'mini') + btn('title', '标题', null, 'mini') + (sn.active === 'main' ? btn('restart', '重新开始', null, 'mini') : '') + '</div>';
      if (ui.confirm === 'restart') s += '<div class="confirm"><p>重新开始会清掉当前这一局的进度。已解锁的章节、结局、学园币和宝石都会保留。</p>' + btn('restart-yes', '确定重新开始', null, 'danger') + btn('restart-no', '取消') + '</div>';
      return '<div class="screen play">' + s + footer() + '</div>';
    }

    function viewEnding() {
      var sn = engine.snapshot(), e = sn.ending;
      if (!e) { ui.view = 'title'; return viewTitle(); }
      var r = ui.lastResult || { fx: [] };
      var s = topbar() + artWithChars(e.bg, e.chars || [], sn.run) + '<div class="ending"><small>结局 ' + (C.endings.indexOf(e) + 1) + '/' + C.endings.length + '</small><h2>' + esc(e.title) + '</h2>' +
        (r.text ? '<p class="dim">' + esc(r.text) + '</p>' : '') + '<p>' + esc(engine.fillText(e.text)) + '</p>' + (r.fx && r.fx.length ? '<p class="fx">' + esc(r.fx.join('  ')) + '</p>' : '') + '</div>';
      s += '<div class="menu">' + btn('again', '再玩一次，冲别的结局', null, 'primary') + btn('gallery', '查看结局图鉴') + btn('title', '回到标题') + '</div>';
      return '<div class="screen">' + s + footer() + '</div>';
    }

    function viewSideEnd() {
      var r = ui.lastResult || { fx: [] }, sn0 = engine.snapshot();
      var s = topbar() + artWithChars((sn0.scene || {}).bg || C.ui.titleBg, (sn0.scene || {}).chars || [], null) + '<div class="ending"><h2>番外完</h2><p>' + esc(r.text || '') + '</p>' + (r.fx.length ? '<p class="fx">' + esc(r.fx.join('  ')) + '</p>' : '') + '</div><div class="menu">' + btn('title', '回到标题', null, 'primary') + '</div>';
      return '<div class="screen">' + s + footer() + '</div>';
    }

    function offerButtons(o) {
      if (o.owned) return '<span class="owned">已拥有</span>';
      var b = '';
      if (o.canCoins) b += btn('buy-coins', o.coins + ' 学园币兑换', o.id);
      if (o.canGems) b += btn('buy-gems', o.gems + ' 宝石兑换', o.id);
      if (o.canPay) b += btn('pay', '¥' + o.price_rmb + ' 购买', o.id, 'gold');
      if (!b) {
        var why = [];
        if (o.full) why.push('体力已满');
        else if (o.limitLeft <= 0) why.push('今天的次数用完了，明天再来');
        else { if (o.coins) why.push('需要 ' + o.coins + ' 学园币'); if (o.gems) why.push('需要 ' + o.gems + ' 宝石'); }
        b = '<span class="need">' + why.join('，') + '</span>';
      }
      return b;
    }
    function viewShop() {
      var s = topbar() + '<h2>商店</h2><p class="dim">学园币靠推进剧情、探索、签到获得；宝石靠完成章节、收集结局、签到获得。</p>';
      if (!engine.payAllowed()) s += '<p class="dim small">当前版本只能用游戏内货币兑换。</p>';
      engine.offers().forEach(function (o) {
        s += '<div class="offer"><div><b>' + esc(o.title) + '</b><p>' + esc(o.desc) + '</p></div><div class="offer-btns">' + offerButtons(o) + '</div></div>';
      });
      s += btn('back', '返回', null, 'ghost wide');
      return '<div class="screen">' + s + footer() + '</div>';
    }
    function viewGallery() {
      var g = engine.gallery();
      var s = topbar() + '<h2>结局图鉴 ' + g.got + '/' + g.total + '</h2><div class="progress"><i style="width:' + Math.round(g.got / g.total * 100) + '%"></i></div>';
      s += '<div class="milestones">' + g.milestones.map(function (m) { return '<span class="' + (m.done ? 'done' : '') + '">收集 ' + m.count + ' 个：' + rewardText(m.reward) + (m.done ? ' 已领' : '') + '</span>'; }).join('') + '</div>';
      g.endings.forEach(function (e, i) {
        s += '<div class="end-card' + (e.got ? ' got' : '') + '"><b>结局 ' + (i + 1) + ' · ' + (e.got ? esc(e.title) : '？？？') + '</b>' +
          (e.got ? '<p>' + esc(e.text) + '</p>' : '<p class="dim">' + (e.hint ? '达成条件：' + esc(e.hint) : '还没达成。完整版图鉴会显示达成条件。') + '</p>') + '</div>';
      });
      if (!g.full) {
        var o = engine.offers().filter(function (x) { return x.id === 'gallery'; })[0];
        if (o) s += '<div class="offer"><div><b>' + esc(o.title) + '</b><p>' + esc(o.desc) + '</p></div><div class="offer-btns">' + offerButtons(o) + '</div></div>';
      }
      s += btn('back', '返回', null, 'ghost wide');
      return '<div class="screen">' + s + footer() + '</div>';
    }
    function viewChapters() {
      var en = engine.energyInfo(), cost = C.economy.replayCost;
      var s = topbar() + '<h2>章节选择</h2><p class="dim">从已解锁的章节重新开始，数值回到进入这一章时的样子。每次消耗 ' + cost + ' 体力。</p>';
      engine.chapterList().forEach(function (c) {
        s += '<div class="offer"><div><b>' + esc(c.title) + '</b><p>' + (c.cleared ? '已完成' : (c.unlocked ? '已解锁' : '推进主线后解锁')) + (c.pass ? ' · 已有通行证' : '') + '</p></div><div class="offer-btns">';
        if (c.unlocked && c.hasSnap && c.released) s += en.energy >= cost ? btn('chapter-start', '从这章开始', c.id) : '<span class="need">体力不足，' + mmss(en.nextMs) + ' 后 +1</span>';
        s += '</div></div>';
      });
      s += btn('title', '返回', null, 'ghost wide');
      return '<div class="screen">' + s + footer() + '</div>';
    }
    function viewSides() {
      var s = topbar() + '<h2>番外篇</h2><p class="dim">番外是独立的小故事，不影响主线存档。</p>';
      var offs = engine.offers();
      engine.sideList().forEach(function (sd) {
        s += '<div class="offer"><div><b>' + esc(sd.title) + '</b><p>' + (sd.cleared ? '已通关' : (sd.owned ? '已解锁' : '需要解锁')) + ' · ' + sd.release + ' 上线</p></div><div class="offer-btns">';
        if (sd.owned) s += btn('side-start', sd.cleared ? '再玩一次' : '开始', sd.id, 'primary');
        else { var o = offs.filter(function (x) { return x.id === sd.offerId; })[0]; if (o) s += offerButtons(o); }
        s += '</div></div>';
      });
      s += btn('title', '返回', null, 'ghost wide');
      return '<div class="screen">' + s + footer() + '</div>';
    }

    var views = { title: viewTitle, create: viewCreate, play: viewPlay, ending: viewEnding, sideEnd: viewSideEnd, shop: viewShop, gallery: viewGallery, chapters: viewChapters, sides: viewSides };
    function render() {
      engine.tick();
      rootEl.innerHTML = (views[ui.view] || viewTitle)();
    }
    function dispatch(act, arg) {
      var fn = actions[act];
      if (!fn) return false;
      sound.unlock();
      if (act !== 'mute' && act !== 'trait') ui.toast = '';
      fn(arg);
      render();
      return true;
    }

    bindTap(rootEl, function (el) { dispatch(el.getAttribute('data-act'), el.getAttribute('data-arg')); }, env.tapNow || function () { return Date.now(); });
    rootEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target) return;
      if (e.target.id === 'free-input') { if (e.preventDefault) e.preventDefault(); dispatch('free'); }
      else if (e.target.id === 'name-input') { if (e.preventDefault) e.preventDefault(); dispatch('start'); }
    });

    function textState() {
      var sn = engine.snapshot();
      var html = rootEl.innerHTML || '';
      var buttons = [], re = /data-act="([^"]+)"(?: data-arg="([^"]*)")?[^>]*>([^<]*)/g, m;
      while ((m = re.exec(html))) buttons.push({ act: m[1], arg: m[2] == null ? null : m[2], label: m[3] });
      return JSON.stringify({
        view: ui.view, scene: sn.sceneId, sceneTitle: sn.scene ? sn.scene.title : null,
        chapter: sn.chapter ? sn.chapter.title : null, stats: sn.run ? sn.run.stats : null,
        energy: sn.energy.energy + '/' + sn.energy.max, coins: sn.meta.coins, gems: sn.meta.gems,
        ending: sn.run && sn.run.ended, wall: !!ui.wall, toast: ui.toast,
        last: ui.lastResult ? { said: ui.lastResult.said, intent: ui.lastResult.intent, text: ui.lastResult.text } : null,
        buttons: buttons
      });
    }

    return { render: render, dispatch: dispatch, actions: actions, ui: ui, textState: textState, sound: sound };
  }

  /* ======================================================================
   * BOOT（浏览器）
   * ==================================================================== */
  function safeStore(win) {
    /* 有的 WebView 禁用存储，读 localStorage 属性本身就会抛错，这时退回内存存档 */
    try { var ls = win.localStorage; var k = '__animehero_probe__'; ls.setItem(k, '1'); ls.removeItem(k); return Core.localStore(ls); }
    catch (e) { return Core.memoryStore(); }
  }
  function boot(win) {
    var doc = win.document;
    var offset = 0;
    var clock = { now: function () { return Date.now() + offset; } };
    var engine = Core.createEngine({ content: win.ANIME_HERO_CONTENT, clock: clock, store: safeStore(win), payment: win.XHS_PAYMENT_PROVIDER || Commerce.StubPaymentProvider, config: win.ANIME_HERO_CONFIG || {} });
    var rootEl = doc.getElementById('app');
    var view = createUI(engine, rootEl, { document: doc, window: win });
    view.render();
    win.render_game_to_text = view.textState;
    win.advanceTime = function (ms) { offset += Number(ms) || 0; engine.tick(); view.render(); return view.textState(); };
    win.setInterval(function () {
      var en = engine.energyInfo();
      var a = doc.getElementById('energy-val'), b = doc.getElementById('regen');
      if (a) a.textContent = en.energy + '/' + en.max;
      if (b) b.textContent = en.nextMs ? ' +1 ' + mmss(en.nextMs) : ' 已满';
    }, 1000);
    return { engine: engine, view: view };
  }

  var api = { Core: Core, Commerce: Commerce, Art: Art, createUI: createUI, createSound: createSound, bindTap: bindTap, boot: boot };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.AnimeHero = api;
    if (root.document && root.ANIME_HERO_CONTENT && !root.__ANIME_HERO_NO_BOOT__) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { boot(root); });
      else boot(root);
    }
  }
})(typeof window !== 'undefined' ? window : this);
