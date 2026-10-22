# 星弧 · STAR ARC

> 按住环绕，松手疾行。在金色弧上脱手的那一瞬，就是全部的意义。

一个单指操作的轨道街机小游戏。**微信小游戏 / 抖音小游戏 / 网页** 同一份代码，零素材依赖，全部程序化生成。包体约 **64 KB**。

![cover](assets/store/cover.png)

---

## 玩法

只有两个动作：**按住** 和 **松开**。

| 动作 | 结果 |
| --- | --- |
| 按住 | 环绕离你最近的星，安全，但会消耗这颗星的燃料 |
| 松开 | 沿切线飞出。这是唯一能得分的状态，也是唯一会死的状态 |
| 在**金色弧**上松开 | **PERFECT** — 连击 +1、倍率提升、冲击波清屏、速度加成 |
| 撞到边框 | 反弹。不死，但连击清零 |
| 撞到碎星 | 唯一的死法 |

核心张力：**你永远不会被强制推进，所以每一次死亡都是自己的选择**。星星的燃料会烧完，所以你不能一直躲着；连击需要连续完美才能维持，所以你也不能一直保守。

### 设计上的三个关键决定

1. **飞行不是弹道，是引力弧**。松手后光点会朝向最近的星弯曲。这让"飞得到下一颗星"永远成立，从而把死亡原因完全收敛到碎星上——一个玩家完全可以读懂、并且可以归因于自己的威胁。
2. **边框是墙，不是悬崖**。撞墙只扣连击。这条改动把早期版本 1.3 秒的平均存活时间提高到了 20 秒以上，同时保留了撞墙的痛感。
3. **预测线**。飞行时会画出你接下来 0.8 秒的真实轨迹（用与主循环完全相同的转向公式模拟），所以"松开"是一个可以学习的技巧，而不是盲赌。

---

## 运行

```bash
npm install
npm run build      # → dist/web, dist/wechat, dist/douyin
npm run serve      # 构建并启动 http://127.0.0.1:8123/
npm run dev        # 监听 src/ 自动重建
```

### 微信小游戏

1. 打开微信开发者工具 → 小游戏 → 导入项目 → 目录选 `dist/wechat`
2. AppID 填自己的，或先用测试号
3. 编译即可运行

### 抖音小游戏

1. 抖音开发者工具 → 导入 → 目录选 `dist/douyin`
2. 填入 AppID 后编译

`dist/wechat` 与 `dist/douyin` 都自带 `game.js`、`game.json`、`project.config.json`，
并且 `game.json` 已锁定竖屏、关闭状态栏。

---

## 文件结构

```
src/
  main.js      启动、主循环、帧调度、暂停、平台生命周期
  platform.js  wx / tt / 浏览器 三端适配：画布、输入、存储、震动、分享、音频上下文
  world.js     全部游戏逻辑：轨道、发射、共振弧、碎星、难度曲线、吸引模式
  render.js    渲染：星云背景烘焙、星体、碎星、预测线与全部特效
  ui.js        场景：标题、教程提示、HUD、结算、按钮
  audio.js     程序化音频：合成器、混响、随强度变化的音乐
  gfx.js       绘图原语：光晕、四芒星、圆角矩形、字距排版
  sprites.js   发光精灵缓存（把逐帧径向渐变烘焙成贴图）
  const.js     所有手感常量集中在这里
  palette.js   调色板
  utils.js     数学与颜色工具
tools/
  serve.mjs    本地静态服务器
  shoot.mjs    Playwright 自动驾驶 + 截图 + 控制台错误检查
build.mjs      esbuild 构建三个目标平台
```

### 关于性能

移动端 canvas 的主要开销是**每帧重建径向渐变**。所以：

- 所有发光都走 `sprites.js` 的贴图缓存（按尺寸分桶 + 颜色缓存），`drawImage` 比 `createRadialGradient` 便宜一个数量级
- 星云背景、网格、颗粒在启动时烘焙进离屏画布，之后每帧只 `drawImage` 一次
- 粒子有硬上限（460），环形与弹字在生命周期结束后回收
- 帧率上限 60，`dt` 被 clamp 到 50ms，切后台回来不会瞬移

---

## 音频

**没有任何音频文件。** 所有声音都是运行时合成的：

- 混响用 `createConvolver` + 程序生成的脉冲响应
- 音阶是五声音阶，所以随机生成的琶音永远协和
- 音乐密度、BPM、滤波器截止频率都由当前连击数和难度实时驱动——打得越凶，音乐越紧

---

## 美术

- 商店图标与封面：AI 生成（见 `assets/store/`）
- **游戏内所有画面都是程序绘制的**，没有任何位图素材，所以包体极小、任意分辨率都锐利，也不存在素材授权问题

---

## 平台说明

| | 微信 | 抖音 | 网页 |
| --- | --- | --- | --- |
| 画布 | `wx.createCanvas` | `tt.createCanvas` | `<canvas>` |
| 输入 | `wx.onTouch*` | `tt.onTouch*` | Pointer + Touch + Space |
| 存储 | `getStorageSync` | `tt.getStorageSync` | `localStorage` |
| 震动 | `vibrateShort` | `vibrateShort` | `navigator.vibrate` |
| 分享 | `shareAppMessage` | `tt.shareAppMessage` | Web Share / 剪贴板 |

`share.png` 会被小游戏分享卡片引用，所以 `assets/store/cover.png` 同时被复制进
`dist/wechat` 与 `dist/douyin`。若要把分享图换成 5:4 的卡片图，替换该文件即可。

> 上架前记得：把 `project.config.json` 里的 `appid` 换成自己的；微信需要在小程序后台配置小游戏类目并提交审核；抖音需要在开放平台创建小游戏应用。隐私政策与用户协议按各自平台要求准备。

---

## 自动化测试

```bash
npm run build && node tools/serve.mjs &
node tools/shoot.mjs
```

`tools/shoot.mjs` 会用 Playwright 真实按住/松开模拟一个会玩的人，跑完整局，
截图到 `shots/`，并断言控制台零报错。这是每次改动手感的回归检查。

---

## License

MIT © KFCheems
