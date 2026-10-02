# 排球动作参考与关键帧

本次保留程序化人物，按真实动作阶段重新制作关键帧与约束；不是动捕数据，也不是某位运动员的逐帧复制。模型角度、时长及支撑间距属于排练参数。

|参考|用于核对的特征|模型关键帧|
|---|---|---|
|[USA Volleyball / Courtney Thompson 二传教学](https://usavolleyball.org/video/usav-skill-video-setting/)|作为二传手型与举手时机的视觉核对入口；该页面文字未提供完整视频逐帧数据|提前举手、额前接触、短暂缓冲、伸肘送球|
|[USYVL Curriculum Handbook](https://usyvl.org/wp-content/uploads/2024/08/USYVL-Curriculum-Handbook-Spring-2024.pdf)|额前手型、手随球形；首步调整，末两步衔接|接触前保持弧形手、最后右—左两步|
|[USA Volleyball: Pro Tips for Attacking](https://usavolleyball.org/resource/pro-tips-for-attacking-middle-blockers-and-beach/)|由慢到快、倒数第二步加速、末步并步起跳|调整→跨步与双臂后摆→制动蹬伸|
|[Reeser et al. 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC3445065/)|图1区分助跑、引臂、加速与随挥；肩外旋到内旋、肘伸展|离地上摆→开胸引臂→肘领先加速→触球→随挥|
|[Wada et al. 2003](https://www.jstage.jst.go.jp/article/jsvr/5/1/5_1/_article/-char/en)|躯干扭转与前屈共同参与扣球，肩部沿挥臂方向持续运动|骨盆先转、胸肩后转、随挥前屈|

默认二传出手为0.60秒，接触窗口0.51–0.60秒；接触之前手在额前等待，球仍在接近。高出手使用抛物线跳传，低出手屈膝。正背传共享准备动作，最后阶段改变出手方向。

攻手相位以实际起跳、触球、落地时刻为锚点。旋转只影响骨架，不改变空中水平动量。脚步记录落脚、离脚与支撑区间；同一组足迹用于绘制、动画及后排起跳检查。

`motion-review.html` 是本地开发核对页，使用生产人物组件，提供正面、侧面、背面、动作阶段和慢放控制。改前/改后截图存放于 `artifacts/motion-review/`。参考数据不随应用联网加载。
