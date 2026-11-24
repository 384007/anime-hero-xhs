/* 《我成了动漫主角》内容数据层。只有数据，没有逻辑。
 * 加新章节：在 chapters 里加一项、在 scenes 里加对应场景，上一章最后一个场景的 next 指向新章第一个场景即可。
 * 本游戏由 AI 制作。 */
(function (root) {
  var CONTENT = {
    version: '1.0.0',
    title: '我成了动漫主角',
    startScene: 'c1_gate',
    baseStats: { rep: 10, affA: 10, affB: 10 },
    startItems: { potion: 1 },
    statNames: { rep: '声望', affA: '绯月好感', affB: '雪乃好感' },
    ui: { titleBg: 'academy', titleChars: ['hizuki', 'yukino'], inputHint: '自己写行动，比如：调查四周 / 问雪乃 / 拔刀', startLabel: '进入星见学园' },

    characters: {
      hizuki: { name: '绯月', role: '剑术社社长', stat: 'affA', style: 'ponytail',
        hair: '#d8344a', hairDark: '#8e1a2c', eye: '#c0392b', outfit: '#2c3e66', accent: '#f1c40f' },
      yukino: { name: '雪乃', role: '图书委员 · 魔法师', stat: 'affB', style: 'bob',
        hair: '#cfd8ea', hairDark: '#8c9bb8', eye: '#3a7bd5', outfit: '#3b2f5c', accent: '#7fd6ff' }
    },

    traits: [
      { id: 'brave', name: '热血', desc: '起步声望 +10，打架更容易赢，赢了多拿声望。', start: { rep: 10 }, bonus: { fight: { rep: 2 } }, fightBonus: 0.15 },
      { id: 'kind', name: '温柔', desc: '两人起步好感 +5，每次好感上涨再多 2 点。', start: { affA: 5, affB: 5 }, affBonus: 2 },
      { id: 'sharp', name: '机敏', desc: '探索时常捡到学园币，逃跑不掉声望。', bonus: { explore: { coins: 5 } }, fleeNoPenalty: true },
      { id: 'tough', name: '坚韧', desc: '体力上限 120，休息多回 3 点体力。', maxEnergy: 120, restBonus: 3 }
    ],

    /* 意图：声明顺序就是同分时的优先级。cost 为体力消耗。 */
    intents: {
      flee:    { label: '逃跑', cost: 4, keywords: ['逃跑', '逃走', '快逃', '逃', '撤退', '撤', '溜走', '溜', '躲起来', '躲', '后退', '闪人', '离开这'] },
      fight:   { label: '战斗', cost: 8, keywords: ['攻击', '战斗', '拔刀', '拔剑', '挥剑', '挥刀', '出手', '迎战', '干掉', '击败', '打败', '动手', '决斗', '对练', '挑战', '砍', '斩', '刺', '揍', '打', '踢', '杀'] },
      help:    { label: '帮助', cost: 5, keywords: ['帮忙', '帮助', '帮', '救', '保护', '照顾', '安慰', '合作', '一起', '支援', '治疗', '扶', '鼓励', '交朋友', '分享', '送给'] },
      item:    { label: '道具', cost: 0, keywords: ['使用', '道具', '药水', '回复药', '喝药', '吃药', '背包', '掏出', '拿出', '用药', '药', '喝'] },
      rest:    { label: '休息', cost: 0, keywords: ['休息', '睡觉', '睡', '坐下', '歇', '躺', '喘口气', '发呆', '打盹', '冥想', '放松'] },
      talk:    { label: '对话', cost: 4, keywords: ['打招呼', '搭话', '询问', '请教', '交谈', '聊天', '聊', '问', '说', '谈', '告诉', '叫住', '回答', '你好', '喊'] },
      explore: { label: '探索', cost: 5, keywords: ['调查', '观察', '检查', '探索', '搜索', '搜', '找', '看看', '看', '翻', '研究', '四处', '打量', '侦查', '摸'] },
      move:    { label: '移动', cost: 5, keywords: ['前往', '出发', '进入', '跑去', '走过去', '过去', '回到', '跟上', '上楼', '下楼', '去', '走', '往', '进'] }
    },
    fallbackCost: 4,

    /* ---------------- 章节（每周二上新，release 是上线日期，北京时间） ---------------- */
    chapters: [
      { id: 'c1', no: 1, title: '第一章 · 入学日', release: '2026-10-27', first: 'c1_gate', reward: { coins: 40, gems: 5, energy: 10 } },
      { id: 'c2', no: 2, title: '第二章 · 迷雾森林', release: '2026-11-03', first: 'c2_edge', reward: { coins: 40, gems: 5, energy: 10 }, pass: { gems: 25, price_rmb: 3 } },
      { id: 'c3', no: 3, title: '第三章 · 风见镇', release: '2026-11-10', first: 'c3_square', reward: { coins: 40, gems: 5, energy: 10 }, pass: { gems: 25, price_rmb: 3 } },
      { id: 'c4', no: 4, title: '第四章 · 古代遗迹', release: '2026-11-17', first: 'c4_gate', reward: { coins: 40, gems: 5, energy: 10 }, pass: { gems: 25, price_rmb: 3 } },
      { id: 'c5', no: 5, title: '第五章 · 钟楼决战', release: '2026-11-17', first: 'c5_rift', reward: { coins: 60, gems: 10, energy: 10 }, pass: { gems: 25, price_rmb: 3 } },
      { id: 'ex1', no: 0, side: true, title: '番外 · 海边合宿', release: '2026-11-24', first: 'ex_beach', reward: { coins: 50, gems: 15 }, unlock: { gems: 40, price_rmb: 6 } }
    ],

    /* ---------------- 结局：按顺序判断，第一个满足的生效 ---------------- */
    endings: [
      { id: 'bad', title: '黑雾之下', bg: 'final', chars: [], hint: '在最后关头转身离开。',
        cond: { flag: 'fled' },
        text: '你逃下了钟楼。身后的钟声停了，黑雾一点点漫过整座学园，也漫过了回家的路。很多年以后，这个世界的人还在讲一个故事：有个外来的学生曾经站在钟楼顶上，最后转身走了。' },
      { id: 'hizuki', chars: ['hizuki', 'yukino'], title: '并肩的剑', bg: 'training', hint: '在断桥上拉住她的手，并且她最信任你。（绯月好感 60 以上且高于雪乃）',
        cond: { all: [{ flag: 'savedA' }, { stat: 'affA', op: '>=', value: 60 }, { stat: 'affA', op: '>', ref: 'affB' }] },
        text: '最后一击，绯月和你握着同一把剑。黑雾散开的时候，她哥哥的断剑碎成了光。毕业那天，剑术社门口换了一块新牌子：社长 绯月，副社长 {name}。她说，以后拦新生的活儿归你了。' },
      { id: 'yukino', chars: ['hizuki', 'yukino'], title: '星空下的约定', bg: 'town_night', hint: '在断桥上帮她撑住结界，并且她最信任你。（雪乃好感 60 以上且不低于绯月）',
        cond: { all: [{ flag: 'savedB' }, { stat: 'affB', op: '>=', value: 60 }, { stat: 'affB', op: '>=', ref: 'affA' }] },
        text: '雪乃把封印咒语的最后一句留给你来念。你念完，钟楼上的裂缝合上了，天上的星星一颗颗亮起来。后来每年星祭，钟楼顶上都有两个人在看星星。她说，回家的办法她会帮你找，找到之前，你先留在这里。' },
      { id: 'hero', chars: ['hizuki', 'yukino'], title: '学园的传说', bg: 'academy', hint: '让全校都认识你（声望 60 以上），或者召集全校后和伙伴一起出手。',
        cond: { any: [{ stat: 'rep', op: '>=', value: 60 }, { all: [{ flag: 'rally' }, { flag: 'together' }] }] },
        text: '全校的人都看见了：{name} 劈开黑雾，把领主重新关回了封印里。钟楼下的石碑上多了一个名字，就刻在三百年前那位勇者旁边。新生入学时，绯月会指着石碑说：这是我们学园的人。' },
      { id: 'normal', chars: ['hizuki', 'yukino'], title: '平凡的毕业', bg: 'classroom', hint: '打赢最终战就能看到。',
        cond: null,
        text: '你们赢了，赢得很狼狈。黑雾散了，学园修了三个月才修好。你没成为传说，石碑上也没有你的名字。不过每天早上走过樱花大道，总有人跟你打招呼：早啊，{name}。' }
    ],
    collection: [
      { count: 2, reward: { gems: 10 } },
      { count: 3, reward: { gems: 20 } },
      { count: 5, reward: { gems: 50, coins: 100 } }
    ],

    /* ---------------- 经济 ---------------- */
    economy: {
      maxEnergy: 100,
      regenMs: 180000,          // 每 3 分钟恢复 1 点
      rest: { first: 6, repeat: 2, repeatRepCost: 1 },
      potionEnergy: 25,
      stayLimit: 5,             // 同一场景停留 5 次自由行动后自动推进
      replayCost: 10,           // 从章节选择重玩一章消耗的体力
      fight: { base: 0.6, highEnergy: 0.1 },
      tz: 8,
      checkin: [
        { coins: 30, energy: 30 }, { coins: 40 }, { gems: 5 }, { coins: 60, potion: 1 },
        { energy: 60 }, { coins: 80 }, { gems: 20 }
      ],
      offers: [
        { id: 'potion', kind: 'potion', title: '回复药', desc: '使用后体力 +25。', coins: 30 },
        { id: 'energy_small', kind: 'energy', amount: 25, title: '小份体力', desc: '体力 +25，每天限 3 次。', coins: 50, dailyLimit: 3 },
        { id: 'energy_full', kind: 'energy', amount: 'full', title: '体力补满', desc: '体力直接回满。', gems: 15, price_rmb: 3, sku: 'energy_full_3' },
        { id: 'gallery', kind: 'gallery', title: '结局图鉴 · 完整版', desc: '显示所有未达成结局的达成条件，可重读已达成结局。', gems: 60, price_rmb: 12, sku: 'gallery_12' },
        { id: 'gems_s', kind: 'gems', amount: 30, title: '宝石 × 30', desc: '用于兑换通行证、番外和体力。', price_rmb: 3, sku: 'gems_30' },
        { id: 'gems_m', kind: 'gems', amount: 65, title: '宝石 × 65', desc: '比小包多送 5 颗。', price_rmb: 6, sku: 'gems_65' },
        { id: 'gems_l', kind: 'gems', amount: 140, title: '宝石 × 140', desc: '比小包多送 20 颗。', price_rmb: 12, sku: 'gems_140' }
      ]
    },

    /* ---------------- 场景 ---------------- */
    scenes: {
      /* ===== 第一章 ===== */
      c1_gate: {
        chapter: 'c1', bg: 'academy', chars: ['hizuki'], title: '樱花大道',
        text: '{name}，你睁开眼的时候，正站在一条樱花大道上。身上穿着没见过的制服，口袋里有一张写着你名字的入学通知：星见学园。校门口，一个扎红色马尾的女生拿着木刀，把新生一个个拦下。“我是剑术社社长绯月。进门之前，先接我一招，这是老规矩。”',
        choices: [
          { label: '接下这一招', intent: 'fight', t: '你抬手架住木刀，震得手发麻，脚下没退半步。绯月挑了挑眉：“还行，进去吧。”', fx: { rep: 5, affA: 5 }, next: 'c1_class' },
          { label: '先问问这规矩是谁定的', intent: 'talk', t: '绯月愣了一下，笑出声：“我定的。好吧，你是第一个敢问的。”她收起木刀，给你指了教室的方向。', fx: { affA: 3 }, next: 'c1_class' },
          { label: '从旁边的侧门绕进去', intent: 'move', t: '你贴着围墙绕到侧门，顺利溜了进去。身后传来绯月的喊声：“喂！那个新生！”', fx: { rep: -2 }, next: 'c1_class' }
        ],
        on: {
          fight: { t: '你没等她出招，先冲了上去。木刀停在你额头前一寸，绯月说：“胆子不小，就是太急。”', fx: { affA: 2, rep: 1 } },
          talk: { t: '你问她这是哪里。绯月说：“星见学园，培养冒险者的地方。你连这都不知道？转学生吧。”', fx: { affA: 2 } },
          explore: { t: '你看了看四周。校舍后面有座钟楼，更远的地方是一片发暗的森林，林子上空飘着一层灰黑色的雾。你在樱花树下捡到几枚硬币。', fx: { coins: 5 } },
          move: { t: '你径直往校舍走去。绯月没拦你，只是在后面盯着你看了很久。', next: 'c1_class' },
          item: { t: '你摸了摸口袋，除了入学通知，还有一个贴着学园标签的小药瓶。' },
          rest: { t: '你在樱花树下坐了一会儿，脑子慢慢清楚了：这里真的是另一个世界。' },
          flee: { t: '你转身想走，才发现来时的路被一层雾挡住了，只好又回到校门口。', fx: { rep: -1 } },
          help: { t: '有个新生被木刀吓得腿软，你扶他站起来，替他说了句好话。绯月看了你一眼，放他过去了。', fx: { rep: 3, affA: 2 } }
        },
        fallback: { t: '你在校门口犹豫了一会儿，最后还是跟着人群走进了学园。', next: 'c1_class' }
      },

      c1_class: {
        chapter: 'c1', bg: 'classroom', chars: ['yukino'], title: '一年 A 班',
        text: '教室里，班主任把一张地图钉在黑板上：“北边的迷雾森林这几天冒出了黑雾魔物，一年级要组队去调查。”你旁边坐着一个银色短发的女生，正低头看一本很厚的魔导书。她的名牌上写着：雪乃。',
        choices: [
          { label: '跟雪乃打个招呼', intent: 'talk', t: '“你好，我是{name}。”雪乃抬头看了你两秒：“你身上的魔力很奇怪，和这里的人都不一样。”', fx: { affB: 5 }, next: 'c1_field' },
          { label: '举手说自己愿意带队', intent: 'help', t: '全班都看向你。班主任点点头，把调查小队的名单交给了你。雪乃在旁边小声说：“我也去。”', fx: { rep: 5, affB: 2 }, next: 'c1_field' },
          { label: '下课后去仔细看那张地图', intent: 'explore', t: '你在地图上找到森林深处画着一个圈，旁边写着“旧泉”，还有一条没标名字的小路。你把路线抄了下来。', fx: { rep: 2 }, flag: 'map', next: 'c1_field' }
        ],
        on: {
          fight: { t: '你把课本卷成筒，敲了一下前排打瞌睡的同学。全班都笑了，班主任没笑。', fx: { rep: -1 } },
          talk: { t: '你问雪乃黑雾是什么。她翻到书里的一页：“古书上说，是封印松动的时候漏出来的东西。”', fx: { affB: 3 } },
          explore: { t: '你翻了翻桌肚，找到上一届学生留下的笔记，里面画着森林里魔狼的弱点：怕强光。', flag: 'wolfhint' },
          move: { t: '你跟着下课的人流去了训练场。', next: 'c1_field' },
          item: { t: '你把背包放在桌上翻了翻。雪乃瞥了一眼：“学园配的初级药，省着用。”' },
          rest: { t: '你趴在桌上睡了一小会儿。醒来时，雪乃在你的笔记本上写了一行字：上课别睡。', fx: { affB: 1 } },
          flee: { t: '你想翘课，刚走到门口就被班主任叫住：“{name}，回来坐好。”', fx: { rep: -2 } },
          help: { t: '雪乃的书掉在地上，你帮她捡起来，顺手把折了的书角抚平。她小声说了句谢谢。', fx: { affB: 3 } }
        },
        fallback: { t: '下课铃响了，你跟着大家去训练场上实战课。', next: 'c1_field' }
      },

      c1_field: {
        chapter: 'c1', bg: 'training', chars: ['hizuki', 'yukino'], title: '训练场',
        text: '训练场上，一年级在练基本功。绯月是今天的助教，雪乃在场边画魔法阵。教官喊：“明天出发去森林。今天谁练得最好，谁当先锋。”',
        choices: [
          { label: '找绯月对练', intent: 'fight', t: '你和绯月对了二十招，最后被她一刀拍在肩上。她收刀说：“明天你走我旁边。”', fx: { affA: 5, rep: 3 }, next: 'c2_edge' },
          { label: '请雪乃教你一个照明魔法', intent: 'talk', t: '雪乃教得很耐心。你试到第七次，指尖终于亮起一个小光球。她点头：“够用了。”', fx: { affB: 5 }, flag: 'light', next: 'c2_edge' },
          { label: '帮教官搬训练器材', intent: 'help', t: '你搬完一整车木桩，教官拍拍你的背：“踏实。先锋给你了。”', fx: { rep: 5 }, next: 'c2_edge' }
        ],
        on: {
          fight: { t: '你对着木桩练了一下午，手上磨出两个泡，出刀倒是快了不少。', fx: { rep: 2 } },
          talk: { t: '你问绯月为什么总拦新生。她说：“看看谁敢接招。敢接的人，上了战场才靠得住。”', fx: { affA: 3 } },
          explore: { t: '你绕着训练场走了一圈，在器材室角落找到一瓶落了灰的回复药。', fx: { potion: 1 } },
          move: { t: '天黑了，你回宿舍收拾行李，准备明天出发。', next: 'c2_edge' },
          item: { t: '你坐在场边打开背包，清点明天要带的东西。' },
          rest: { t: '你躺在草地上看云。绯月走过来踢了踢你的鞋：“明天别迟到。”', fx: { affA: 1 } },
          flee: { t: '你想偷懒溜走，被教官当场抓住，罚跑了十圈。', fx: { rep: -2 } },
          help: { t: '你帮雪乃把魔法阵画完最后一笔，阵纹亮了一下。她看了看你，没说话，嘴角弯了一点。', fx: { affB: 3 } }
        },
        fallback: { t: '练习结束，教官宣布明天出发。你回去睡了个好觉。', next: 'c2_edge' }
      },

      /* ===== 第二章 ===== */
      c2_edge: {
        chapter: 'c2', bg: 'forest', chars: ['hizuki', 'yukino'], title: '森林入口',
        text: '迷雾森林的入口，树干上缠着灰色的雾。小队四个人，绯月走在最前面，雪乃举着法杖照路。前面是个岔路口：一条路宽，一条路窄，窄路上有新鲜的爪印。',
        choices: [
          { label: '走宽路', intent: 'move', t: '宽路好走，就是绕得远。走到傍晚，你们才听见狼嚎。', fx: {}, next: 'c2_deep' },
          { label: '顺着爪印走窄路', intent: 'explore', t: '你蹲下看了看爪印，是一群狼，刚过去不久。绯月说：“跟上去，趁它们还没把我们围住。”', fx: { rep: 3, affA: 2 }, next: 'c2_deep' },
          { label: '按抄下来的地图走近路', intent: 'move', cond: { flag: 'map' }, t: '你掏出抄好的路线，带大家走了近路。雪乃凑过来看：“你什么时候抄的？画得挺清楚。”', fx: { rep: 3, affB: 3 }, next: 'c2_deep' }
        ],
        on: {
          fight: { t: '你一刀劈开挡路的藤蔓，藤蔓后面窜出一只灰兔，把大家吓了一跳。', fx: { rep: 1 } },
          talk: { t: '你问雪乃雾里能不能用魔法。她说：“能用，但雾会吸走一部分，要多花力气。”', fx: { affB: 2 } },
          explore: { t: '你在树根底下发现几枚古代银币，上面刻着的纹样和学园钟楼上的一样。', fx: { coins: 15 } },
          move: { t: '你招呼大家往林子里走。', next: 'c2_deep' },
          item: { t: '你检查了一遍背包里的补给。' },
          rest: { t: '你们在入口吃了干粮。绯月把她那份肉干分了你一半。', fx: { affA: 2 } },
          flee: { t: '你提议先回去报告，绯月瞪了你一眼：“还没进去就回去？”', fx: { rep: -2, affA: -2 } },
          help: { t: '队里的小个子同学背包太重，你帮他背了一半。', fx: { rep: 2 } }
        },
        fallback: { t: '你们商量了一会儿，决定继续往森林深处走。', next: 'c2_deep' }
      },

      c2_deep: {
        chapter: 'c2', bg: 'forest_night', chars: ['hizuki', 'yukino'], title: '狼群',
        text: '林子深处，七八双绿眼睛在雾里亮了起来。魔狼把你们围住了。领头那只比马还大，身上一直往外冒黑雾。',
        choices: [
          { label: '拔刀正面迎上去', intent: 'fight', t: '你和绯月背靠背，砍倒了三只。头狼扑过来时，绯月替你挡了一下，手臂被抓出了血。', fx: { rep: 6, affA: 4 }, next: 'c2_spring' },
          { label: '挡在前面掩护雪乃施法', intent: 'help', t: '你挡在雪乃身前，她念完咒语，一道白光把狼群逼退。她喘着气说：“你挡得很稳。”', fx: { affB: 6, rep: 3 }, next: 'c2_spring' },
          { label: '放出光球吓退狼群', intent: 'explore', cond: { any: [{ flag: 'light' }, { flag: 'wolfhint' }] }, t: '你想起狼怕强光，抬手放出光球。狼群一阵骚动，夹着尾巴退进了雾里，一个人都没受伤。', fx: { rep: 8 }, next: 'c2_spring' }
        ],
        on: {
          fight: { t: '你冲向最近的一只狼，一刀砍中它的前腿，它夹着尾巴逃了。', fx: { rep: 3 }, tFail: '你扑了个空，被狼尾扫倒在地。绯月一把把你拽了起来：“别逞强！”', fxFail: { energy: -5 } },
          talk: { t: '你冲着头狼喊，问它从哪里来。它当然没回答，但停下来看了你一眼，眼睛里有一点红光。' },
          explore: { t: '你注意到头狼脖子上挂着一块石片，上面的纹样在发光。混战里那块石片掉了下来，你捡到了。', flag: 'shard' },
          move: { t: '你带着大家边打边往东边退，那边隐约有水声。', next: 'c2_spring' },
          item: { t: '你在狼群中间飞快地翻背包。' },
          rest: { t: '这里根本没法休息，你只能靠着树干缓了几口气。' },
          flee: { t: '你喊大家撤。一路跑到水声传来的地方，狼群没有追过来。', fx: { rep: -3 }, next: 'c2_spring' },
          help: { t: '一个同学的披风被狼咬住了，你冲过去割断披风，把他拉了回来。', fx: { rep: 4 } }
        },
        fallback: { t: '混战中你们冲出了包围，朝有水声的方向跑去。', next: 'c2_spring' }
      },

      c2_spring: {
        chapter: 'c2', bg: 'spring', chars: ['yukino'], title: '旧泉',
        text: '甩开狼群后，你们找到一眼发着蓝光的泉水。泉边蜷着一个长尖耳朵的小孩，腿上有伤，身上沾着黑雾。雪乃说：“是森林精灵。黑雾就是从这片林子北边冒出来的。”',
        choices: [
          { label: '用泉水给小精灵治伤', intent: 'help', t: '你捧水洗掉他伤口上的黑雾，伤口慢慢合上了。小精灵送你一片会发光的叶子：“拿着，镇上的人认得它。”', fx: { rep: 5, coins: 20 }, next: 'c3_square' },
          { label: '问小精灵黑雾从哪来', intent: 'talk', t: '小精灵指着北边：“山后面的旧遗迹，门开了一条缝。去风见镇找老书店的店主，他知道怎么进去。”', fx: { affB: 2 }, flag: 'clue1', next: 'c3_square' }
        ],
        on: {
          fight: { t: '你朝泉水里晃动的影子挥了一刀，水花溅了雪乃一身。她没说话，只是看着你。', fx: { affB: -2 } },
          talk: { t: '你问雪乃精灵说的话能不能信。她说：“书上写精灵不会说谎。我也信他。”', fx: { affB: 2 } },
          explore: { t: '你在泉底摸到一块刻着符文的石片，凉凉的，还在微微发亮。', fx: { coins: 10 }, flag: 'shard' },
          move: { t: '你们沿着小精灵指的方向走出森林，远处能看到一座小镇。', next: 'c3_square' },
          item: { t: '你在泉边打开背包，看看还剩什么。' },
          rest: { t: '泉水边很安静。你洗了把脸，累了一天的身子轻松了不少。', fx: { energy: 3 } },
          flee: { t: '你想赶紧离开这片林子，小精灵拉住你的袖子：“等等，你们会迷路的。”' },
          help: { t: '你把自己的干粮分给小精灵，他吃得很香，雪乃在旁边看着笑了。', fx: { rep: 2, affB: 2 } }
        },
        fallback: { t: '歇了一会儿，你们带着小精灵给的消息走出了森林。', next: 'c3_square' }
      },

      /* ===== 第三章 ===== */
      c3_square: {
        chapter: 'c3', bg: 'town', chars: ['hizuki'], title: '风见镇广场',
        text: '风见镇是森林外最近的小镇。广场上有集市，冒险者公会门口贴满了委托单。绯月一路上都在看武器店的橱窗。',
        choices: [
          { label: '接一张讨伐魔物的委托', intent: 'fight', t: '你们清掉了镇外仓库里的三只黑雾鼠。公会给了赏金，镇上的人开始叫你“学园来的那个”。', fx: { rep: 5, coins: 30 }, next: 'c3_tavern' },
          { label: '陪绯月去逛武器店', intent: 'help', t: '绯月在一把剑前站了很久，最后没买。她说：“走吧，钱要留着买药。”你记下了那把剑的名字。', fx: { affA: 6 }, next: 'c3_tavern' },
          { label: '找人打听遗迹的消息', intent: 'talk', t: '卖菜的大婶说，老书店的店主年轻时进过遗迹，每天晚上都会去酒馆坐坐。', flag: 'clue2', next: 'c3_tavern' }
        ],
        on: {
          fight: { t: '有个冒险者在广场上吹牛，你跟他比掰手腕。', fx: { rep: 2 }, tFail: '你和吹牛的冒险者比掰手腕，输了，围观的人哈哈大笑。', fxFail: { rep: -1 } },
          talk: { t: '你问绯月为什么想当冒险者。她说：“我哥进了遗迹，再没回来。”说完她就不吭声了。', fx: { affA: 3 }, flag: 'brother' },
          explore: { t: '你在公会的旧告示栏里找到一张褪色的寻人启事，画像上的少年，眉眼很像绯月。', fx: { coins: 5 }, flag: 'brother' },
          move: { t: '天快黑了，你们去酒馆找地方吃饭。', next: 'c3_tavern' },
          item: { t: '你在集市边上打开背包，盘算还缺什么。' },
          rest: { t: '你在喷泉边坐下，喂了一会儿鸽子。' },
          flee: { t: '集市人太多，你挤出人群躲进小巷，结果在巷口正好看到了酒馆的招牌。', next: 'c3_tavern' },
          help: { t: '一个老奶奶的菜车翻了，你帮她把菜一棵棵捡回去。她塞给你几枚铜币。', fx: { rep: 2, coins: 10 } }
        },
        fallback: { t: '逛完集市，你们去酒馆打听消息。', next: 'c3_tavern' }
      },

      c3_tavern: {
        chapter: 'c3', bg: 'tavern', chars: ['yukino'], title: '酒馆',
        text: '酒馆里很热闹。角落里坐着老书店的店主，面前摊着一本旧书。吧台那边，一个醉汉正冲着女招待嚷嚷。雪乃拉了拉你的袖子，让你看那本书的封面：上面画着遗迹的大门。',
        choices: [
          { label: '上前制止醉汉', intent: 'fight', t: '你一把按住醉汉的手腕，他挣了两下没挣开，酒醒了一半，灰溜溜地走了。女招待请你们喝了果汁。', fx: { rep: 4, affA: 2 }, next: 'c3_night' },
          { label: '和雪乃一起去请教店主', intent: 'talk', t: '店主给你们看书里的一页：遗迹大门的符文要按星座顺序点亮。雪乃把顺序一笔一笔抄进了笔记。', fx: { affB: 6 }, flag: 'clue2', next: 'c3_night' }
        ],
        on: {
          fight: { t: '你一拳砸在桌上，想吓住醉汉，结果把自己的杯子震翻了。', fx: { rep: -1 } },
          talk: { t: '你和店主聊起遗迹。他说：“里面的东西会挑人。你心里放不下谁，它就拿谁来试你。”', flag: 'clue2' },
          explore: { t: '你偷看了一眼店主的书，里面夹着一张遗迹内部的草图，画着一座很长的石桥。', flag: 'clue2' },
          move: { t: '吃完饭，你出门透气。镇上正在准备晚上的祭典。', next: 'c3_night' },
          item: { t: '你在桌子底下悄悄打开背包。' },
          rest: { t: '你在酒馆二楼要了个房间，睡了一觉。' },
          flee: { t: '醉汉朝你们这桌走过来，你拉着雪乃从后门溜了。', fx: { rep: -1, affB: 1 }, next: 'c3_night' },
          help: { t: '你帮女招待把醉汉弄翻的桌子扶起来，又把碎杯子扫干净。', fx: { rep: 2 } }
        },
        fallback: { t: '夜深了，你们离开酒馆。外面传来祭典的鼓声。', next: 'c3_night' }
      },

      c3_night: {
        chapter: 'c3', bg: 'town_night', chars: ['hizuki', 'yukino'], title: '星祭之夜',
        text: '今晚是风见镇的星祭。广场上挂满了灯笼，烟花一会儿就要放了。绯月说她要去屋顶上等烟花，雪乃说她要去钟楼观星。两个人走之前，都看了你一眼。',
        choices: [
          { label: '去屋顶找绯月', intent: 'talk', t: '绯月坐在屋檐上，递给你一串烤年糕。烟花炸开的时候，她说：“进了遗迹，你别走在我前面。”', fx: { affA: 8 }, next: 'c4_gate' },
          { label: '去钟楼找雪乃', intent: 'talk', t: '雪乃指给你看天上的星座，正好是遗迹大门的符文顺序。她说：“明天，我想走在你旁边。”', fx: { affB: 8 }, next: 'c4_gate' },
          { label: '一个人在镇上巡夜', intent: 'help', t: '你在镇外巡了一圈，抓住两只想趁祭典偷粮的黑雾鼠。第二天一早，镇长亲自来道谢。', fx: { rep: 6 }, next: 'c4_gate' }
        ],
        on: {
          fight: { t: '你拿烟花筒当剑挥了两下，被一群小孩追着要你再来一次。', fx: { rep: 1 } },
          talk: { t: '卖灯笼的大叔说，星祭是为了纪念三百年前封印遗迹的勇者。“听说那个勇者也是从别的地方来的。”', fx: { rep: 1 } },
          explore: { t: '你在灯笼下面捡到一个小孩丢的护身符，帮他找到了妈妈。妈妈塞给你几枚铜币。', fx: { coins: 5 } },
          move: { t: '烟花放完，你回旅馆睡觉。明天就去遗迹。', next: 'c4_gate' },
          item: { t: '你在灯笼底下打开背包，为明天做准备。' },
          rest: { t: '你在长椅上看了一场烟花，什么都没想。' },
          flee: { t: '人太多了，你躲回旅馆，听着外面的烟花声睡着了。', next: 'c4_gate' },
          help: { t: '你帮祭典的工作人员把灯笼挂上了最高的那根杆子。', fx: { rep: 3 } }
        },
        fallback: { t: '星祭结束了。第二天一早，你们出发去遗迹。', next: 'c4_gate' }
      },

      /* ===== 第四章 ===== */
      c4_gate: {
        chapter: 'c4', bg: 'ruins', chars: ['hizuki', 'yukino'], title: '遗迹大门',
        text: '遗迹的大门有三层楼高，门上刻着十二个符文。门中间有一道裂缝，黑雾正从缝里一点点往外渗。',
        choices: [
          { label: '一个一个试符文', intent: 'explore', t: '你试了半个小时，门终于开了，手上被符文烫出好几个红印子。', fx: { rep: 2, energy: -5 }, next: 'c4_hall' },
          { label: '和绯月一起把门撞开', intent: 'fight', t: '你和绯月一起撞门，门轴发出一声巨响，开了。回声在遗迹里传了很久。', fx: { affA: 3, rep: 1 }, next: 'c4_hall' },
          { label: '按星座顺序点亮符文', intent: 'explore', cond: { flag: 'clue2' }, t: '雪乃念出星座的名字，你一个个按下去。大门没出一点声音就开了，连灰都没落。', fx: { rep: 5, affB: 3 }, next: 'c4_hall' }
        ],
        on: {
          fight: { t: '你对着门上的黑雾挥了一刀，雾被劈开，又慢慢合上了。' },
          talk: { t: '你问雪乃看不看得懂符文。她说：“能看懂一半，另一半要靠你。”', fx: { affB: 2 } },
          explore: { t: '你在门边的石缝里找到一瓶前人留下的药，封口还完好。', fx: { potion: 1 } },
          move: { t: '你推了推大门旁边的小侧门，居然推开了。', next: 'c4_hall' },
          item: { t: '你在大门前打开背包，检查药还够不够。' },
          rest: { t: '你们在大门前扎营，轮流守夜。' },
          flee: { t: '你往后退了几步，一脚踩中机关，地面一沉，三个人一起滑进了遗迹。', fx: { rep: -1 }, next: 'c4_hall' },
          help: { t: '绯月盯着大门看了很久。你走过去拍了拍她的肩，她低声说：“我哥当年就是从这扇门进去的。”', fx: { affA: 3 }, flag: 'brother' }
        },
        fallback: { t: '你们研究了一阵，大门自己开了一道够人通过的缝。', next: 'c4_hall' }
      },

      c4_hall: {
        chapter: 'c4', bg: 'ruins_hall', chars: ['hizuki', 'yukino'], title: '断桥',
        text: '大厅中间是一座石桥，桥下黑得看不到底。走到一半，桥从中间断开了。绯月在左边那截往下滑，雪乃在右边撑起结界，结界正在一点点裂开。你只来得及去一边。',
        choices: [
          { label: '冲过去拉住绯月', intent: 'help', t: '你扑过去抓住绯月的手，两个人一起吊在桥边。她咬着牙爬上来，第一句话是：“笨蛋，你也会掉下去的。”她一直没松开你的手。', fx: { affA: 15 }, flag: 'savedA', next: 'c4_core' },
          { label: '跑过去帮雪乃撑住结界', intent: 'help', t: '你把手按在结界上，把自己的魔力全送了进去。结界稳住了。雪乃回头看你，眼睛有点红：“你的魔力……很暖。”', fx: { affB: 15 }, flag: 'savedB', next: 'c4_core' },
          { label: '大喊让两人都往中间跳', intent: 'talk', t: '你喊了一声“跳！”两个人同时朝你跳过来。你一手拉一个，三个人摔成一团。没人受伤，可谁也顾不上说话。', fx: { rep: 5, affA: 3, affB: 3 }, next: 'c4_core' }
        ],
        on: {
          fight: { t: '你一刀砍断缠在桥上的黑雾触手。桥晃了一下，暂时没再往下塌。', fx: { rep: 2 } },
          talk: { t: '你冲两边喊：“撑住！”绯月回了句“废话”，雪乃没出声，她在专心撑结界。' },
          explore: { t: '你往桥下看了一眼。黑雾里好像有一双眼睛，也在看你。' },
          move: { t: '你往桥的另一头冲，身后的石头一块块往下掉。等你站稳回头，她们两个都自己爬了上来。', next: 'c4_core' },
          item: { t: '你一边稳住身子，一边去够背包。' },
          rest: { t: '现在哪有工夫休息。你深吸一口气，让自己先冷静下来。' },
          flee: { t: '你转身往回跑，身后传来石桥断裂的声音。等你回头，她们两个都自己爬上来了，看你的眼神有点冷。', fx: { rep: -3, affA: -5, affB: -5 }, next: 'c4_core' },
          help: [
            { kw: ['绯月', '左'], t: '你喊着绯月的名字冲过去，抓住了她的手腕，把她拖回了桥面。她喘着气说：“……谢了。”', fx: { affA: 15 }, flag: 'savedA', next: 'c4_core' },
            { kw: ['雪乃', '右', '结界'], t: '你冲到雪乃身边，和她一起按住结界。裂纹停住了，她轻声说：“我就知道你会来。”', fx: { affB: 15 }, flag: 'savedB', next: 'c4_core' },
            { t: '你想两边都顾上，结果哪边都没够着。绯月自己抓住了桥边的石头，雪乃自己稳住了结界。', fx: { rep: 1 }, next: 'c4_core' }
          ]
        },
        fallback: { t: '你还没想好，桥已经塌完了。等回过神来，三个人都摔到了下一层，各自擦破了皮，谁也没顾上谁。', next: 'c4_core' }
      },

      c4_core: {
        chapter: 'c4', bg: 'ruins_core', chars: ['hizuki', 'yukino'], title: '封印石台',
        text: '遗迹最深处是一座石台，石台上插着一把断剑，剑身缠满了黑雾。石台边刻着一行字：封印裂了，要有人把它重新合上。你口袋里的碎片在发烫。',
        choices: [
          { label: '拔出断剑', intent: 'fight', t: '你握住剑柄，黑雾顺着手臂往上爬。你没松手，剑被拔了出来，地面开始震动。头顶裂开了，你看到了学园的天空。', fx: { rep: 5 }, next: 'c5_rift' },
          { label: '让雪乃先读石台上的字', intent: 'talk', t: '雪乃读完，脸色发白：“封印的另一头连着学园的钟楼。黑雾领主要从那里出来。”', fx: { affB: 3 }, next: 'c5_rift' },
          { label: '告诉绯月剑柄上刻着的名字', intent: 'talk', cond: { flag: 'brother' }, t: '剑柄上刻着的，是绯月哥哥的名字。绯月把断剑抱在怀里，过了很久才开口：“他守到了最后。我也会。”', fx: { affA: 8 }, next: 'c5_rift' }
        ],
        on: {
          fight: { t: '你对着石台上的黑雾挥剑，雾散开了一瞬，露出下面刻着的一幅勇者画像。', fx: { rep: 1 } },
          talk: { t: '你问她们怕不怕。绯月说怕，雪乃也说怕。然后三个人都笑了。', fx: { affA: 2, affB: 2 } },
          explore: { t: '你在石台底下摸到最后一块碎片，碎片一碰到你口袋里的那块，就粘在了一起。', fx: { rep: 2 }, flag: 'shard' },
          move: { t: '地面一震，一股力量托着你们往上升，眼前一黑。', next: 'c5_rift' },
          item: { t: '你靠着石台打开背包。' },
          rest: { t: '你们靠着石台坐了一会儿，谁都没说话。' },
          flee: { t: '你想原路返回，可是来时的路已经塌了。唯一的出口在头顶上。', next: 'c5_rift' },
          help: { t: '你给绯月包扎了手臂上的伤，那是在森林里替你挡狼时留下的。', fx: { affA: 3 } }
        },
        fallback: { t: '石台突然亮了起来，把你们送了出去。', next: 'c5_rift' }
      },

      /* ===== 第五章 ===== */
      c5_rift: {
        chapter: 'c5', bg: 'rift', chars: ['hizuki', 'yukino'], title: '黑雾压城',
        text: '你们回到学园时，钟楼顶上裂开了一道口子，黑雾像瀑布一样往下灌。同学们躲在校舍里，老师们在操场上撑着结界，眼看就要撑不住了。',
        choices: [
          { label: '直接冲上钟楼', intent: 'move', t: '你一路砍开黑雾冲上楼梯，绯月和雪乃跟在后面。钟楼顶上，有个东西在等你。', fx: { rep: 3 }, next: 'c5_final' },
          { label: '先帮老师们稳住结界', intent: 'help', t: '你帮老师们把结界补好，操场上的学生终于撤了出来。教官冲你喊：“快去，这里交给我们！”', fx: { rep: 6 }, next: 'c5_final' },
          { label: '站上讲台，喊全校一起上', intent: 'talk', cond: { stat: 'rep', op: '>=', value: 40 }, t: '你站上讲台喊了一声。先是剑术社，然后是魔法社，最后整个一年级都拿起了武器。黑雾被逼退了一大截。', fx: { rep: 10 }, flag: 'rally', next: 'c5_final' }
        ],
        on: {
          fight: { t: '你砍散了一团冲向校舍的黑雾，窗户后面传来一阵欢呼。', fx: { rep: 3 } },
          talk: { t: '你问教官领主到底是什么。教官说：“三百年前被封进遗迹的东西。上一次，是一个外来的勇者把它关回去的。”' },
          explore: { t: '你抬头看钟楼上的大钟。指针停在了你来到这个世界的那一刻。' },
          move: { t: '你冲向钟楼。', next: 'c5_final' },
          item: { t: '你躲在校舍走廊里，飞快地翻开背包。' },
          rest: { t: '你在走廊里喘了口气，一个低年级学生给你递了瓶水。' },
          flee: { t: '你往校门跑，跑到樱花大道时停了下来。身后是学园。你转身跑了回去。', fx: { rep: -2 }, next: 'c5_final' },
          help: { t: '你把困在教室里的几个学生带到了安全的地方。', fx: { rep: 4 } }
        },
        fallback: { t: '黑雾越来越浓。你决定去钟楼顶上做个了断。', next: 'c5_final' }
      },

      c5_final: {
        chapter: 'c5', bg: 'final', chars: ['hizuki', 'yukino'], title: '钟楼之顶',
        text: '钟楼顶上，黑雾聚成一个高大的人影。它的声音直接在你脑子里响起：“外来者，又是你们。上一个也像你这样站在这里。”它抬起手，整座学园都暗了下去。',
        choices: [
          { label: '正面迎战', intent: 'fight', t: '你握紧剑冲了上去。', end: true },
          { label: '和绯月、雪乃一起出手', intent: 'help', t: '你回头看了看两个伙伴，三个人同时出手。', flag: 'together', end: true },
          { label: '转身逃走', intent: 'flee', t: '你往后退了一步，又退了一步，然后转身跑下了楼梯。', flag: 'fled', end: true }
        ],
        on: {
          fight: { t: '你握紧剑冲了上去。', end: true },
          talk: { t: '你问它为什么非要出来。它说：“被关了三百年，换你也想出来。”说完，它又抬起了手。' },
          explore: { t: '你看到黑雾正中间有一点光，那是封印的核心。你记住了它的位置。', fx: { rep: 2 } },
          move: { t: '你往前走了一步，站到了两个伙伴前面。', fx: { rep: 1 } },
          item: { t: '大战之前，你最后一次打开背包。' },
          rest: { t: '风很大。你闭上眼深呼吸，心跳慢慢平下来。' },
          flee: { t: '你往后退了一步，又退了一步，然后转身跑下了楼梯。', flag: 'fled', end: true },
          help: { t: '你回头看了看两个伙伴，三个人同时出手。', flag: 'together', end: true }
        },
        fallback: { t: '已经没有退路了，你迎了上去。', end: true }
      },

      /* ===== 番外 ===== */
      ex_beach: {
        chapter: 'ex1', bg: 'beach', chars: ['hizuki', 'yukino'], title: '海边合宿',
        text: '期末考完，剑术社和魔法社一起去海边合宿。绯月一下车就冲进了海里，雪乃撑着伞坐在沙滩上看书。教官宣布：“下午的训练是抓螃蟹。”',
        choices: [
          { label: '跟绯月比赛游泳', intent: 'fight', t: '你们游到浮标再游回来，绯月赢了半个身位，得意得不得了。', fx: { affA: 5 }, next: 'ex_bonfire' },
          { label: '坐到雪乃的伞下陪她看书', intent: 'talk', t: '雪乃把书往你这边挪了挪。书里讲的是海妖的传说，她看得很认真，时不时念一句给你听。', fx: { affB: 5 }, next: 'ex_bonfire' },
          { label: '认真抓螃蟹', intent: 'explore', t: '你抓了满满一桶螃蟹，晚饭有着落了。教官给你记了一功。', fx: { rep: 3, coins: 20 }, next: 'ex_bonfire' }
        ],
        on: {
          fight: { t: '你和一只大螃蟹对峙了半天，最后被它夹住了手指。', fx: { rep: 1 } },
          talk: { t: '你问教官为什么训练是抓螃蟹。教官说：“练眼力。还有，晚饭要吃。”' },
          explore: { t: '你在礁石缝里找到一个漂亮的海螺，贴到耳边能听见海浪声。', fx: { coins: 5 } },
          move: { t: '你沿着沙滩走到礁石那边，太阳开始往下落了。', next: 'ex_bonfire' },
          item: { t: '你在沙滩上打开背包，里面进了不少沙子。' },
          rest: { t: '你躺在沙滩上晒太阳，差点睡着。' },
          flee: { t: '一个浪打过来，你拔腿就跑，还是被浇了一身。绯月在水里笑得直不起腰。', fx: { affA: 1 } },
          help: { t: '你帮雪乃把被风吹歪的伞重新插好。', fx: { affB: 2 } }
        },
        fallback: { t: '玩了一下午，天黑了，大家开始生火。', next: 'ex_bonfire' }
      },

      ex_bonfire: {
        chapter: 'ex1', bg: 'bonfire', chars: ['hizuki', 'yukino'], title: '篝火晚会',
        text: '晚上，大家在沙滩上点起篝火。螃蟹烤好了，有人在弹琴。绯月和雪乃坐在火堆两边，中间正好空着一个位置。',
        choices: [
          { label: '坐到中间', intent: 'talk', t: '你一坐下，两个人同时往你手里塞了一只螃蟹。大家都笑了。', fx: { affA: 3, affB: 3 }, finish: true },
          { label: '去海边捡贝壳送给她们', intent: 'help', t: '你捡了两枚贝壳，一枚红的给绯月，一枚白的给雪乃。她们都收进了口袋。', fx: { rep: 2, affA: 2, affB: 2 }, finish: true }
        ],
        on: {
          fight: { t: '你和剑术社的人比赛掰螃蟹腿，赢了一盘。', fx: { rep: 1 } },
          talk: { t: '你问绯月和雪乃以前认不认识。绯月说：“一年级就同班，她总嫌我吵。”雪乃说：“现在也嫌。”' },
          explore: { t: '你抬头看天。海边的星星比学园多得多。' },
          move: { t: '你绕着篝火走了一圈，给每个人都添了一块柴。', fx: { rep: 1 } },
          item: { t: '你把背包里剩下的零食都拿出来分了。' },
          rest: { t: '你靠着一截浮木，听着海浪和琴声。' },
          flee: { t: '有人起哄让你唱歌，你想溜，被绯月一把拉了回来。', fx: { affA: 1 } },
          help: { t: '你帮着烤螃蟹，手被熏得黑乎乎的。', fx: { rep: 1 } }
        },
        fallback: { t: '篝火慢慢小了下去，合宿的第一天就这样过完了。', finish: true }
      }
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = CONTENT;
  else root.ANIME_HERO_CONTENT = CONTENT;
})(typeof window !== 'undefined' ? window : this);
