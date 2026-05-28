---
name: ag-sepa-analysis-reporter
description: "馬克．米奈爾維尼 SEPA 與 VCP 量化選股與專業分析報告生成技能。包含自動化量化診斷（Node.js）、7大趨勢指標校驗、VCP收縮歷程解析，並能自動按年月歸檔生成 HTML 互動報告。使用場景：(1) 使用者要求對特定股票進行 SEPA 或 VCP 分析並產出報告，(2) 批次選股篩選並建立報告，(3) 需要生成專業的交易防守與部位規模風控計劃時。"
version: 1.0.0
metadata:
  repo: AG-Stock-Analysis
  scope: stock-selection-and-reporting
  compatibility: antigravity
  source: .agents/skills/ag-sepa-analysis-reporter/SKILL.md
---

# AG SEPA Stock Screener & Report Generator Manual

此 Skill 用於指導 AI 代理（Agent）利用交易大師馬克．米奈爾維尼（Mark Minervini）的 **SEPA（特定進場點分析）** 與 **VCP（波動收縮型態）** 技術框架，對個股進行深度量價特徵篩選、型態診斷，並自動完成 **HTML 互動報告** 的生成與歸檔。

---

## 技能目錄結構 (Progressive Architecture)

本技能採用模組化架構，將背景心法與報表模板抽離，以維持主體 Context 視窗的高效與精簡：

```
ag-sepa-analysis-reporter/
├── SKILL.md (本手冊 - 指令與工作流)
├── scripts/
│   └── sepa_screener.js (分析引擎 - 抓取資料、運算 MA、過濾 7 大指標與 VCP 收縮)
├── references/
│   └── vcp_sepa_rules.md (專業知識庫 - 7 大均線原理、VCP 籌碼學與部位暴露原則)
└── assets/
    └── template.html (HTML 報表模板 - TradingView 風格的高對比網頁模板)
```

> [!NOTE]
> 關於馬克．米奈爾維尼系統中 Stage 2 主升段判定、均線多頭物理意義及 VCP 收縮波的詳細籌碼學背景，請隨時查閱知識庫：[vcp_sepa_rules.md](file:///c:/Users/Wix-E0408/Desktop/project/%E6%96%B0%E5%A2%9E%E8%B3%87%E6%96%99%E5%A4%BE/AG%20%E8%82%A1%E7%A5%A8%E5%88%86%E6%9E%90/.agents/skills/ag-sepa-analysis-reporter/references/vcp_sepa_rules.md)

---

## 核心工作流程 (Execution Workflow)

當使用者提出股票分析或產生報告需求時，AI 代理必須嚴格依照以下步驟執行：

### 步驟 1：執行自動化量化診斷 (Run Quant Engine)

優先調用專案根目錄下的 Node.js 分析腳本。此腳本會直接抓取 Yahoo Finance 的即時 2 年期日 K 線數據進行精確計算，並自動按年月歸類存放在 `reports/YYYY-MM/` 底下。

* **單股深度技術診斷模式**：
  當使用者要求分析特定股票（如 `NVDA` 或 `TSLA`）並產生報告時，於根目錄執行：
  ```powershell
  node sepa_screener.js <TICKER>
  ```
  *此指令會自動在 `reports/YYYY-MM/` 資料夾下生成 `<ticker>_vcp_analysis.html`。*

* **批次清單篩選模式**：
  當使用者要求對一組股票進行選股篩選時：
  1. 編輯根目錄下的 `tickers.json`，將目標股票代碼寫入陣列中（例如：`["NVDA", "AAPL", "AMD"]`）。
  2. 執行無參數篩選指令：
     ```powershell
     node sepa_screener.js
     ```
  *該指令會對清單中的每一隻個股運行深度分析，在年月分類資料夾下生成各自的 HTML 診斷報告，並生成 `sepa_screener_result.html` 儀表板網頁。*

---

### 步驟 2：讀取並解析量化結果

執行完畢後，AI 代理必須仔細閱讀控制台（Console）的輸出，或是讀取生成的 HTML 報告，解析出以下關鍵量化數據：
1. **收盤價** (Price) 與當日漲跌。
2. **7 大指標過濾判定** 哪些通過 (PASS)，哪些未通過 (FAIL)，以及具體的數值。
3. **VCP 收縮波特徵** (C1 - C4) 的振幅與天數，以及 Pivot 末端是否出現成交量乾涸（Volume Dry-up）。
4. **交易防守參數**：建議買入區間、精確硬止損點與止損百分比、3:1 目標價。

---

| :---: | :---: | :---: | :---: | :--- |
{{VCP_ROWS}}

---

## 🛡️ 交易防守與部位規模計劃

馬克．米奈爾維尼名言：「控制虧損是業餘與專業交易員的最大分水嶺。」進場前必須制定好精確的防守計畫。

### 1. 交易執行區間
- **建議買入區間 (Pivot 突破平台)**：**${{ENTRY_MIN}} ~ ${{ENTRY_MAX}}** (限突破當下追價 2% 內，嚴禁在高位過度追高)
- **技術防守止損點**：**${{STOP_LOSS}}** (設定於最近收縮低點下方 1% 處，控制在合理風控區)
- **單股最大承受虧損幅度**：**{{STOP_LOSS_PCT}}%** (嚴格控制在米奈爾維尼建議的 4% ~ 8% 區間)
- **第一目標價格**：**${{TARGET_PRICE}}** (按 3:1 風險報酬比計算)

### 2. 部位規模與風控配置 (Interactive Calculator Backup)
假設您的交易帳戶總資產為不同額度，且**單筆交易僅願意承受帳戶總資金 1% 的最大硬虧損風險**，對應的配置比例與買入股數試算如下：

| 帳戶總資產 (Total Capital) | 1% 最大風險承受額 | 單股防守虧損率 | 建議買入股數 (Shares) | 配置資金 (Allocation) | 帳戶權重 (Weight) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **$10,000 USD** | $100 USD | {{STOP_LOSS_PCT}}% | {{SHARES_10K}} 股 | ${{ALLOC_10K}} USD | {{WEIGHT}}% |
| **$50,000 USD** | $500 USD | {{STOP_LOSS_PCT}}% | {{SHARES_50K}} 股 | ${{ALLOC_50K}} USD | {{WEIGHT}}% |
| **$100,000 USD** | $1,000 USD | {{STOP_LOSS_PCT}}% | {{SHARES_100K}} 股 | ${{ALLOC_100K}} USD | {{WEIGHT}}% |

> [!TIP]
> **部位配置金律 (Progressive Exposure)**：
> 單一持股的最大配置上限為帳戶總資金的 **25%**。先建立第一筆試探部位，當該部位脫離成本區且產生帳面獲利時，才允許在後續的健康回踩或新平台上突破時進行加碼，切忌一次性滿倉梭哈。

---

## ✍️ 專業交易員深度量化評語

- **量價與籌碼分析**：
  {{VOLUME_COMMENTARY}}

- **均線排列與趨勢判定**：
  {{TREND_COMMENTARY}}

- **戰術執行與防守紀律**：
  {{DISCIPLINE_COMMENTARY}}

---
*報告生成時間：{{REPORT_TIME}}*
*分析系統：AG QUANT SEPA & VCP Diagnostic Engine*
```

---

### 步驟 4：向使用者回報與呈現

在聊天介面回覆使用者時，AI 代理應展現出嚴謹、專業的量化交易員素質，並遵循以下規範：

1. **語言與語氣**：使用 **繁體中文 (Traditional Chinese)** 進行回覆。語氣應客觀、理性、遵守交易紀律。
2. **輸出摘要與檔案連結**：
   - 指導使用者已成功在年月目錄中生成 HTML 與 Markdown 雙報告。
   - 給出對應的本地 clickable markdown 檔案連結與 HTML 檔案連結，例如：
     - HTML 互動報告：[nvda_vcp_analysis.html](file:///c:/Users/Wix-E0408/Desktop/project/新增資料夾/AG%20股票分析/reports/2026-05/nvda_vcp_analysis.html)
     - Markdown 報告書：[nvda_vcp_analysis.md](file:///c:/Users/Wix-E0408/Desktop/project/新增資料夾/AG%20股票分析/reports/2026-05/nvda_vcp_analysis.md)
   - 在回覆中僅列出**最核心的結論**（如得分、收盤價、買入區間、防守止損位），引導使用者打開雙報告閱讀詳細的 7 大指標與 VCP 收縮解析。避免在聊天視窗中重複冗長的報告內容。
3. **無模糊空間**：不要給出虛擬的分析數值。若 Yahoo Finance API 限制或數據不足，應如實引導使用者檢查代碼或重試，而非胡亂拼湊數據。
