# CONTRACTS — 模块契约（第一版）

本文档锁定坐标系、数据类型与模块边界，改代码前先读这里。

## 1. 坐标系（逻辑坐标 = 世界坐标，单位：米）

- **网面**：`x = 0`；**我方半场** `x ∈ [0, 9]`（`x = 9` 为我方底线），对方半场 `x ∈ [-9, 0)`。
- **横向**：`z ∈ [0, 9]`。面向网（-x 方向）观察时，观察者右侧为 `-z`。
- **竖直**：`y` 向上，地面 `y = 0`。网高 `2.43`（男子），进攻线距网 `3`。
- **号位**：前排左→右 `4-3-2`，后排左→右 `5-6-1`（即 4 号位在 `x<3 && z>6`）。
- 纯函数层（`src/logic/`）只接受逻辑坐标；渲染层直接使用同一坐标（无镜像变换）。

## 2. 分层

```
src/logic/        纯函数：court(常量/号位)、trajectory(抛物线求解)、presets(风格模板+评分)
                  —— 不依赖 React/three，全部可 vitest 测试
src/store/        zustand：sceneStore(球员/参数/画质主题 + 导入导出)、uiStore(相机模式/预设/拖拽)
src/features/setplay/
  animation.ts    非响应式播放时钟（playback 单例）+ 相位计算 + ballWorld 共享向量
  useSolution.ts  由 store 参数求解当前轨迹（UI 与 3D 共用的唯一入口）
  scene/          three/R3F 组件：Court、Net、Characters(+poses)、Ball、
                  TrajectoryLine、TargetHandle、CameraRig、textures(程序化贴图)、dragManager
  ui/             面板：ControlPanel、RouteList、PlaybackBar、PovHud
```

## 3. 轨迹模型

二传球 = 重力抛物线（`g = 9.81`，无空气阻力），由出手点 `S`、击球点 `E` 加**一个**约束完全确定：

- `solveByApex(S, E, H)`：弧顶绝对高度 H（闭式解，要求 `H > max(Sy, Ey)`）
- `solveByTime(S, E, T)`：飞行时间 T（唯一解）
- `solveBySpeed(S, E, v0, arc)`：初速度 v0（低弧/高弧两解，扫描+二分求 T）

派生量：`flightT / speed / elevDeg(出手仰角) / dirDeg(0°=朝网) / apexY / netClearance(球路穿网时高于网带的余量，不穿网为 null)`。

## 4. 推荐方案评分（presets.ts）

每风格 = 若干变体（A快/短平快/背飞…）× 弧顶档位，逐个 `solveByApex` 求解后打分（0–100）：

| 分项 | 权重 | 满分条件 |
|---|---|---|
| 离网距离 | 0.3 | 前排 `[0.5, 1.2]m`；后排进攻 `[3.3, 7.2]m`，区间外线性衰减 |
| 攻手到位 | 0.3 | 攻手 4.5m/s + 0.25s 准备 ≤ 0.85×飞行时间 |
| 出手仰角 | 0.2 | `[22°, 58°]` |
| 弧线安全 | 0.2 | 弧顶 `[2.6, 5.2]m`；穿网时余量 ≥ 0.2m（<0.05m 直接剔除） |

每风格取 Top3。

## 4b. 传球质量检查（quality.ts，实时体检）

`evaluateQuality(ctx)` 对**当前**方案（非推荐候选）逐项评估，输出 `items[]` + 综合分 + 等级（ok/warn/bad）。警示色：🟢 ok `#7ce6a5` / 🟡 warn `#ffc83d` / 🔴 bad `#ff7a6e`。

| key | 指标 | 标准 | 红色条件 |
|---|---|---|---|
| rule | 规则违例 | 自由人不得进攻；后排队员前场起跳扣高于网的球=违例 | 触发任一违例 |
| offnet | 离网距离 | 前排 [0.5,1.2] / 负节奏 [2.2,4.6] / 后排攻 [3.3,7.2] | 贴网 <0.3m 或远超上限 +0.8m |
| timing | 人球节奏 | Δ = 飞行时间 −（0.25 反应 + 助跑/4.5m·s + 0.18 起跳） | Δ<0（球到人未到）；等球超风格上限（t1 0.15/t2 0.4/t3 0.8/neg 1.2/back 0.4）为黄 |
| contact | 击球高度 vs 摸高 | 摸高 = 站立举手 + 弹跳（S 3.05/OH·OP 3.20/MB 3.35） | > 摸高+0.05；<2.3 或前排 ≤2.53 为黄 |
| apex | 弧顶 vs 节奏 | t1 2.55–2.95 / t2 3.0–3.6 / t3 3.5–4.5 / neg 4.4–5.4 / back 2.7–3.5 | 域外为黄 |
| clearance | 击飞过网余量 | ≥0.25 绿 | <0.12 红 |
| release | 出手高度 | 2.05–2.50（额前上方） | <2.05 或 >2.6 黄 |
| span | 二传—目标距离 | 0.8–7m | 界外为黄 |

呈现：`scene/QualityOverlays.tsx`（离网距离尺+理想区色带、击球高度尺+摸高环、弧顶标签、人球标签+助跑虚线、过网余量标签，受 `uiStore.showQuality` 控制）+ ControlPanel"传球质量检查"清单 + TargetHandle 环色联动。面板与 3D 共用 `useQuality()`。

## 5. 播放时间轴（animation.ts）

一个循环 = `hold(0.6s 二传举球) + flightT(传球) + attackT(扣球飞向对方场地) + tail(0.7s 落地定格)`。
`playback` 为非响应式单例，3D 组件在 useFrame 读写，UI 用 rAF 轮询——**不要**把每帧状态放进 zustand。
`PlaybackClock` 在帧优先级 -2 推进时钟，`Ball` 在 -1 更新球位置，人物与相机随后采样；循环跨界保留余时，改变路线或攻手站位后重新开始。
攻手动作由 `scene/attackerMotion.ts` 按绝对播放时间直接采样：世界坐标根节点沿助跑方向移动，独立朝向节点转身，起跳顶点与传球终点同一时刻。击球时身体位置和跳高由实际右臂关节位置反推，使右手掌与球面接触。起跳点为 `contactRoot - airVelocity × riseT`，落地点为 `contactRoot + airVelocity × fallT`；离地至落地水平速度保持恒定，转体不改变水平动量，落地后 0.2s 匀减速制动。地面助跑采用 Hermite 位移，离地前速度与腾空速度连续。快球允许在 hold 阶段提前助跑。
上升/下降均采用 `g=9.81m/s²` 的抛物线，`riseT = fallT = sqrt(2 × jumpH / g)`，击球位于跳跃顶点；随挥姿态不覆盖腾空高度，落地后才屈膝缓冲。

### 腾空水平速度的依据与模型取值

- Chen & Huang，*Kinematical Analysis of Female Volleyball Spike*，ISBS 2008，表 1：[论文原文](https://ojs.ub.uni-konstanz.de/cpa/article/view/1952/1820)。6 名高中女排冠军队球员，前排离地水平速度 `1.32±0.16m/s`，后排 `2.26±0.25m/s`；对应助跑水平速度为 `2.13±0.38` 与 `2.99±0.29m/s`。助跑速度与离地速度不可混用。
- Huang、Liu、Sheu，*Kinematic Analysis of the Volleyball Back Row Jump Spike*，表 2：[论文原文](https://ojs.ub.uni-konstanz.de/cpa/article/view/4049/3748)。8 名高水平男排球员，双脚后排离地水平速度 `2.21±0.33m/s`（n=4），单脚为 `3.23±0.42m/s`（n=4）。当前模型使用双脚起跳。
- 据此选择前排 **1.3m/s**、后排 **2.2m/s** 作为排练默认值（目标离网 ≥3m 时使用后排参数）。这是小样本研究支持的模型默认值，不是全体运动员的统一标准，未按性别、角色或个人起跳能力标定。
- 极短助跑按可用距离降低离地速度；贴网球按落地及制动后的网前 0.25m 余量，在离地前降低水平速度。降低后的速度仍在整个腾空阶段保持恒定，不通过空中停顿或位置钳制避网。质量图例中的助跑线终点为实际起跳点，并显示当前腾空水平速度。
暂停、变速和进度拖动不引入人物姿态延迟；球拖尾同样按时间重采样。播放栏的“击球瞬间”按钮精确定位到 `hold + flightT`。

## 6. 相机

- 轨道模式：drei OrbitControls + 4 预设机位（coach/baseline/side/top），nonce 重触发阻尼过渡，用户操作即打断。
- 二传 POV：眼睛 = 二传位置 + 1.78m；飞行中看球（`ballWorld`），静止看目标点；拖拽环视（yaw/pitch 偏移），`F` 回正，`Esc` 退出；进出各 0.7s 平滑过渡。
- 3D 物体拖拽（球员/目标环）：`dragManager.beginGroundDrag` 手动射线投到 y=0 平面，拖拽期间置 `uiStore.dragging` 暂停轨道控制。

## 7. 视觉资产

全部程序化生成（`scene/textures.ts`），无外部资源依赖：地板（蓝地胶/木纹双主题）、排球 18 片三色贴图、网孔、号码、标志杆条纹、背景渐变。人物为程序化关节小人（poses.ts 姿态库）。画质切换影响：反射地板、SoftShadows、dpr。

## 8. 扩展预留

- GLB 真人模型：替换 `Characters.tsx` 内部实现即可，对外接口（位置/朝向/姿态名）不变。
- 自由曲线编辑 / 多段时间轴：在 `trajectory.ts` 之外新增曲线模块，`presets.ts` 评分逻辑可复用。
