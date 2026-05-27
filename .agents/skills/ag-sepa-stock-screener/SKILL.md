---
name: ag-sepa-stock-screener
description: "馬克．米奈爾維尼 SEPA 與 VCP 股票篩選與量化分析技能。包含無相依性 Node.js 雙模式篩選腳本運行、7大均線趨勢樣板過濾、VCP定量與定性圖表診斷、以及部位規模與風險防守計畫制定。"
version: 2.0.0
metadata:
  repo: AG-Stock-Analysis
  scope: stock-selection
  compatibility: antigravity
  source: .agents/skills/ag-sepa-stock-screener/SKILL.md
---

# AG SEPA Stock Screener & VCP Diagnostic Manual

此 Skill 用於指導 AI 代理（Agent）利用交易大師馬克．米奈爾維尼（Mark Minervini）的 **SEPA（特定進場點分析）** 與 **VCP（波動收縮型態）** 技術框架，對個股進行深度量價特徵篩選、型態診斷與嚴格的防守交易部位規劃。

---

## 技能目錄結構 (Progressive Architecture)

本技能採用模組化架構，將繁複的背景心法與報表模板抽離，以維持主體 Context 視窗的高效與精簡：

```
ag-sepa-stock-screener/
├── SKILL.md (本手冊 - 指令與工作流)
├── scripts/
│   └── sepa_screener.js (分析引擎 - 抓取資料、運算 MA、過濾 7 大指標與 VCP 收縮)
├── references/
│   └── vcp_sepa_rules.md (專業知識庫 - 7 大均線原理、VCP 籌碼學與部位暴露原則)
└── assets/
    └── template.html (報表模板 - TradingView 風格的高對比、資訊極致清晰網頁模板)
```

> [!NOTE]
> 關於馬克．米奈爾維尼系統中 Stage 2 主升段判定、均線多頭物理意義及 VCP 收縮波的詳細籌碼學背景，請隨時查閱知識庫：[vcp_sepa_rules.md](file:///.agents/skills/ag-sepa-stock-screener/references/vcp_sepa_rules.md)

---

## 核心工作流程 (Execution Workflow)

當使用者提出股票分析需求時，AI 代理必須依照以下步驟執行：

### 步驟 1：執行自動化量化診斷 (Run Quant Engine)

優先調用專案根目錄（或技能 `scripts/`）下的 Node.js 分析腳本。此腳本會直接抓取 Yahoo Finance 的即時 2 年期日 K 線數據進行精確計算。

* **單股深度技術診斷**：
  當使用者要求分析特定股票（如 `NVDA` 或 `TSLA`）時：
  ```powershell
  node sepa_screener.js <TICKER>
  ```
  *該指令會在根目錄自動生成 `<ticker>_vcp_analysis.html`，內含極致清晰的診斷數據、SVG 折線圖及部位風險計算器。*

* **批次清單篩選**：
  當使用者要求對一組股票進行選股篩選時：
  1. 編輯根目錄下的 `tickers.json`，將目標股票代碼寫入陣列中（例如：`["NVDA", "AAPL", "AMD"]`）。
  2. 執行無參數篩選指令：
     ```powershell
     node sepa_screener.js
     ```
  *該指令會對清單中的每一隻個股運行深度分析，並生成 `sepa_screener_result.html` 儀表板，提供完整的篩選結果與各股報告連結。*

### 步驟 2：解析數據與解說過濾細節

執行完畢後，AI 代理必須向使用者回報篩選細節。基於「資訊極致清晰」的原則，必須條列出以下關鍵維度：

1. **7 大指標過濾判定**：明確指出該股在 7 個篩選步驟中，哪些通過 (PASS)，哪些未通過 (FAIL)。展示實際數值（例如：`股價 $215.33 > 50MA $201.20`），並簡述該步驟如何將不符合 Stage 2 的死水股過濾掉。
2. **VCP 收縮波表格化解說**：列出偵測到的 C1 至 C4 收縮特徵，指出高低點數值、波段振幅收縮百分比，以及在 Pivot Point（突破樞紐點）是否出現成交量乾涸（Volume Dry-up）。
3. **部位風險管理與戰術計劃**：
   * **建議買入區間**：突破 Pivot 平台時的價格範圍。
   * **精確防守點**：最近收縮低點下方的硬止損價格（嚴格控制在 4% ~ 8% 內）。
   * **互動式部位規模計算器**：提醒使用者生成的 HTML 報告中附帶「互動式計算器」，只要輸入總帳戶資金與承受風險比例（如 1%），即可自動算出應買入股數與配置權重。

---

## AI 代理輸出規範 (Agent Presentation Rules)

在回覆使用者時，AI 代理應展現出嚴謹、專業的量化交易員素質：

1. **語言與語氣**：使用 **繁體中文 (Traditional Chinese)** 進行回覆。語氣應客觀、理性、遵守交易紀律。使用金融術語（如：主升段、籌碼沉澱、 Pivot 突破、防守止損位）。
2. **防守紀律重於一切**：始終提醒使用者「硬性止損控制在 4% ~ 8%」以及「部位分批漸進式暴露」的重要性。
3. **無模糊空間**：不要給出虛擬的分析數值。若 Yahoo Finance API 限制或數據不足，應如實引導使用者檢查代碼或重試，而非胡亂拼湊數據。
