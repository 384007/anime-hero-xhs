# 设计

## 文件与分层
| 文件 | 层 | 内容 |
|---|---|---|
| content.js | 内容层 | 角色、特质、意图关键词、章节、场景、结局、经济数值、签到表、商品。纯数据。 |
| game.js | 引擎核心 | Rng（mulberry32）、Cond（声明式条件求值）、Intent（关键词打分分类）、Store（存储适配器）、Engine（状态机） |
| game.js | 商业化层 | Economy（体力恢复、签到、日限额、货币增减）、Monetization（商品视图、货币兑换、PaymentProvider 购买） |
| game.js | 表现层 | Art（SVG 场景/立绘）、Sound（WebAudio）、UI（视图渲染、统一 tap 委托） |
| index.html / style.css | 表现层 | 外壳、CSP、样式 |

依赖方向：表现层 → 商业化层 → 引擎核心 → 内容数据。引擎不读 DOM，可在 Node 里跑。

## 内容数据格式
```js
scenes: {
  c1_gate: {
    chapter: 1, bg: 'academy', chars: ['hizuki'], title, text,
    choices: [{ label, intent, t, fx, next | end | finish, cond }],
    on: { fight: {t, fx, next?, tFail?, fxFail?} | [{kw:[...], ...}, {...}], talk, explore, move, item, rest, flee, help },
    fallback: { t, fx?, next | end | finish }
  }
}
chapters: [{ id, title, release: 'YYYY-MM-DD', first, reward, pass: {gems, price_rmb}, side?, unlock? }]
endings: [{ id, title, text, hint, bg, cond }]  // 按顺序求值，第一个满足的结局生效
```
条件：`{stat, op, value|ref}`、`{flag}`、`{all:[]}`、`{any:[]}`、`{not:{}}`。

## 状态机
- `meta`（跨周目）：体力、学园币、宝石、已解锁章节、章节快照、结局记录、权益、签到、日限额、静音。
- `run`（单周目）：名字、特质、数值、场景、旗标、道具、已触发记录、停留计数、随机数状态。
- `side`：番外篇单独一条 run，不影响主线存档。

行动流程：解析（选项或自由输入分类）→ 体力检查（有本章通行证则免费）→ 扣体力 → 首次触发才给数值 → 道具/休息/战斗随机 → 跳转或停留（停留 5 次自动推进）→ 存档。

## 防死路
1. 每个场景 fallback 必须推进（测试校验）。
2. 休息永远免费可用，是体力墙的保底出口。
3. 每个场景至少 2 个无条件选项。
4. 未上线章节显示上线日期，只给“回到标题”按钮。

## 触控
根节点事件委托：touchstart 记坐标，touchmove 超 10px 视为滑动，touchend 触发并记时间，700ms 内的 click 忽略。只认 `data-act` 元素，每个 `data-act` 必须在动作表里有处理函数（测试校验）。

## 测试钩子
- `window.render_game_to_text()`：返回当前视图、数值、可点按钮的 JSON。
- `window.advanceTime(ms)`：推进游戏时钟，触发体力恢复。
- 引擎接受注入的 clock、store、payment、seed。
