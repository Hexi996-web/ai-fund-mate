# Five-Evidence Scoring and Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有五主题数据快照生成可解释、可版本化、对缺失数据敏感的五证试算评分与独立置信度。

**Architecture:** 评分引擎读取同域观测、政策、基金关联和质量矩阵，以配置驱动的规则生成政策、资金、基本面、估值、产品供给分项。不可用证据为`null`，总分仅按可用权重归一；置信度独立反映完整性、来源、证据一致性和时效性。结果以同域JSON发布，不调用LLM，不生成预测。

**Tech Stack:** Python 3.12、JSON、pytest、现有静态发布管道。

## Global Constraints

- 权重固定为政策20%、资金25%、基本面20%、估值20%、产品供给15%，配置版本为`five-evidence-v1`。
- 缺失、来源不可用、解析失败不得自动计为50分。
- 少于3类独立有效证据时，总体状态必须为`insufficient_data`。
- 评分是研究机会试算，不构成投资建议或立项结论。
- 每个分项必须列出输入指标、规则、支持证据、反方证据和降级原因。
- 置信度按完整性30%、来源可靠性30%、一致性25%、时效性15%独立计算。
- 单期快照不推断趋势；需要历史变化的规则保持不可用。

---

### Task 1: Score contract and missing-data behavior

- [ ] Write failing tests for null evidence, available-weight normalization and fewer-than-three-evidence gating.
- [ ] Implement `scoring/domain.py`, `scoring/config.py` and `scoring/engine.py`.
- [ ] Run `python -m pytest tests/scoring/test_engine.py -q`.

### Task 2: Evidence rules and product-supply analysis

- [ ] Write failing tests for policy quality, observable levels and inverse product crowding.
- [ ] Implement transparent rules without inferring unavailable trends.
- [ ] Run `python -m pytest tests/scoring/test_rules.py -q`.

### Task 3: Confidence and evidence trace

- [ ] Write failing tests proving degraded coverage lowers confidence and stale inputs lower timeliness.
- [ ] Implement confidence components and trace output.
- [ ] Run `python -m pytest tests/scoring/test_confidence.py -q`.

### Task 4: Publish five-theme scores

- [ ] Write failing schema test for `public/data/five-themes/scores.json`.
- [ ] Implement `scripts/generate_five_evidence_scores.py` and scheduled workflow.
- [ ] Generate scores from the current snapshot and verify no fabricated input.

### Task 5: Full regression

- [ ] Run all Python data/scoring tests, existing Python tests, Node tests and Vite build.
- [ ] Run `git diff --check` and inspect all five score records.
