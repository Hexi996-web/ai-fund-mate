# History, Scenarios, and Forecast Review Implementation Plan

**Goal:** 保存不可变历史快照，在样本充足时生成可解释三情景，并在到期后复盘预测。

**Constraints:** 历史不足不生成概率；预测输入冻结；复盘不得读取预测时点之后的信息作为原始依据；本阶段不使用LLM。

1. 建立按日期内容寻址的历史快照与索引。
2. 建立最小历史门槛和趋势特征计算。
3. 建立基准、乐观、悲观情景及概率校准规则。
4. 建立预测账本、到期结果和误差复盘。
5. 发布同域`scenarios.json`与`forecast-reviews.json`并自动化。
