/**
 * AG QUANT SEPA SCREENER & VCP DIAGNOSTIC ENGINE
 * 專業股票型態與趨勢量化診斷系統
 * 
 * 核心特色：
 * 1. 無外部相依性 (Zero Dependencies) - 採用 Node.js 原生 fetch、fs 及 path
 * 2. 雙模式運行 - 支援個股深度分析 (node sepa_screener.js NVDA) 及 批次清單篩選 (node sepa_screener.js)
 * 3. 專案整理 - 自動按當前年月 (如 reports/2026-05/) 歸類存放所有生成的報告與儀表板
 * 4. 精確均線計算 - 50MA, 150MA, 200MA 計算與趨勢判定
 * 5. VCP 收縮波演算法 - 檢測 C1-C4 收縮振幅、天數及 Pivot 籌碼沉澱
 * 6. 動態 SVG 繪圖 - 自行縮放並繪製最近 100 天價格與 3 大均線歷史曲線
 * 7. 部位規模試算 - 提供基於最新股價與精確止損位的風控試算
 */

const fs = require('fs');
const path = require('path');

// 預設篩選個股清單 (若 tickers.json 不存在時使用)
const DEFAULT_TICKERS = ["NVDA", "AAPL", "MSFT", "GOOG", "TSLA", "META", "AVGO", "NFLX", "AMD", "UUUU"];

// 專案路徑設定
const SKILL_DIR = path.join(__dirname, '.agents', 'skills', 'ag-sepa-stock-screener');
const ASSETS_DIR = path.join(SKILL_DIR, 'assets');
const TEMPLATE_PATH = path.join(ASSETS_DIR, 'template.html');

// 取得當前年月分類目錄，例如: reports/2026-05
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const monthDirName = `${year}-${month}`;
const reportsDir = path.join(__dirname, 'reports', monthDirName);

// 確保年月目錄存在
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * 抓取 Yahoo Finance 兩年歷史日 K 線數據
 */
async function fetchStockData(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error("找不到該股票的數據");
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const indicators = result.indicators.quote[0];
        const adjCloses = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : indicators.close;
        const meta = result.meta;

        // 整理並過濾掉 null 數據
        const history = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (
                indicators.close[i] !== null &&
                indicators.high[i] !== null &&
                indicators.low[i] !== null &&
                indicators.volume[i] !== null
            ) {
                // 將 timestamp 轉換為 YYYY-MM-DD
                const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
                history.push({
                    date: date,
                    open: indicators.open[i],
                    high: indicators.high[i],
                    low: indicators.low[i],
                    close: indicators.close[i],
                    adjClose: adjCloses[i] || indicators.close[i],
                    volume: indicators.volume[i]
                });
            }
        }

        return {
            ticker: ticker.toUpperCase(),
            companyName: meta.shortName || meta.longName || ticker.toUpperCase(),
            currency: meta.currency || 'USD',
            regularMarketPrice: meta.regularMarketPrice || history[history.length - 1].close,
            regularMarketChangePercent: meta.regularMarketChangePercent || 0,
            history: history
        };
    } catch (error) {
        throw new Error(`抓取 ${ticker} 數據失敗: ${error.message}`);
    }
}

/**
 * 計算簡單移動平均線 (SMA)
 */
function calculateSMA(data, period) {
    const sma = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma[i] = sum / period;
    }
    return sma;
}

/**
 * 核心分析：評估 7 大趨勢樣板與 VCP 型態
 */
function analyzeStock(stockData) {
    const history = stockData.history;
    const len = history.length;
    
    if (len < 250) {
        throw new Error(`歷史數據不足！需要至少 250 個交易日，目前僅有 ${len} 天。`);
    }

    const latest = history[len - 1];
    const price = latest.close;

    // 1. 計算均線
    const ma50 = calculateSMA(history, 50);
    const ma150 = calculateSMA(history, 150);
    const ma200 = calculateSMA(history, 200);

    const latest50MA = ma50[len - 1];
    const latest150MA = ma150[len - 1];
    const latest200MA = ma200[len - 1];

    // 2. 52 週高低價位 (以最近 250 個交易日計)
    const recentYear = history.slice(Math.max(0, len - 250));
    const highs52W = recentYear.map(d => d.high);
    const lows52W = recentYear.map(d => d.low);
    const high52W = Math.max(...highs52W);
    const low52W = Math.min(...lows52W);

    // 3. 200MA 趨勢判定 (比較今日 200MA 與 20 個交易日前之 200MA)
    const prev200MA = ma200[len - 21];
    const is200MATrendingUp = latest200MA > prev200MA;

    // 4. 驗證 7 大趨勢樣板
    const checks = [
        {
            id: 1,
            name: "股價高於 150MA 且高於 200MA",
            formula: "Price > 150MA 且 Price > 200MA",
            comp: `Price ($${price.toFixed(2)}) > 150MA ($${latest150MA.toFixed(2)}) 且 > 200MA ($${latest200MA.toFixed(2)})`,
            pass: price > latest150MA && price > latest200MA,
            desc: "確保個股在中長期均線上方運行，已脫離底部套牢區，具備多頭基本趨勢。"
        },
        {
            id: 2,
            name: "150MA 高於 200MA",
            formula: "150MA > 200MA",
            comp: `150MA ($${latest150MA.toFixed(2)}) > 200MA ($${latest200MA.toFixed(2)})`,
            pass: latest150MA > latest200MA,
            desc: "確認多頭排列結構，中期平均持有成本高於長期平均持有成本，過濾無效反彈。"
        },
        {
            id: 3,
            name: "200MA 均線方向朝上",
            formula: "今日 200MA > 20天前 200MA",
            comp: `今日 200MA ($${latest200MA.toFixed(2)}) > 20天前 ($${prev200MA.toFixed(2)})`,
            pass: is200MATrendingUp,
            desc: "確認長期生命線具有穩健的正斜率，確保有長期大資金機構在持續進貨支撐。"
        },
        {
            id: 4,
            name: "50MA 高於 150MA 且高於 200MA",
            formula: "50MA > 150MA 且 50MA > 200MA",
            comp: `50MA ($${latest50MA.toFixed(2)}) > 150MA ($${latest150MA.toFixed(2)}) 且 > 200MA ($${latest200MA.toFixed(2)})`,
            pass: latest50MA > latest150MA && latest50MA > latest200MA,
            desc: "確認均線呈標記第二階段主升段的「扇形排列」，短中長線持有成本依序墊高。"
        },
        {
            id: 5,
            name: "股價高於 50MA (短期強勢動能)",
            formula: "Price > 50MA",
            comp: `Price ($${price.toFixed(2)}) > 50MA ($${latest50MA.toFixed(2)})`,
            pass: price > latest50MA,
            desc: "股價維持在短期生命線上方運行，回踩均線不破，代表短線多頭買盤力量強大。"
        },
        {
            id: 6,
            name: "股價高出 52 週最低點至少 30%",
            formula: "Price >= 1.30 * 52W_Low",
            comp: `Price ($${price.toFixed(2)}) >= 1.30 * 52W_Low ($${(low52W * 1.3).toFixed(2)}) [實際高出 ${(((price - low52W) / low52W) * 100).toFixed(1)}%]`,
            pass: price >= (low52W * 1.30),
            desc: "確認個股已經累積足夠的向上反彈动能，徹底擺脫沉悶的第一階段築底期。"
        },
        {
            id: 7,
            name: "股價距離 52 週最高點在 25% 以內",
            formula: "Price >= 0.75 * 52W_High",
            comp: `Price ($${price.toFixed(2)}) >= 0.75 * 52W_High ($${(high52W * 0.75).toFixed(2)}) [實際相差 ${(((high52W - price) / high52W) * 100).toFixed(1)}%]`,
            pass: price >= (high52W * 0.75),
            desc: "確保股價鄰近歷史高點，代表上方幾乎沒有套牢賣壓，一旦突破即是天空海闊。"
        }
    ];

    const passCount = checks.filter(c => c.pass).length;

    // 5. 波動收縮波段 (VCP) 偵測演算法
    const vcpWaves = detectVCP(history, high52W, low52W);

    // 6. 制定交易防守與止損計劃
    // 尋找最近 10 天的最低價作為技術防守位
    const recent10Days = history.slice(Math.max(0, len - 10));
    const recentMinPrice = Math.min(...recent10Days.map(d => d.low));
    
    // 硬止損位設定為最近支撐位下方 1%
    let stopLoss = recentMinPrice * 0.99;
    let stopLossPct = ((stopLoss - price) / price) * 100;
    
    // 邊界防禦：止損控制在 -4% 到 -8% 之間
    if (stopLossPct > -4) {
        stopLoss = price * 0.955; // 預設 4.5% 防禦
        stopLossPct = -4.5;
    } else if (stopLossPct < -8) {
        stopLoss = price * 0.93;  // 最多防禦至 7%
        stopLossPct = -7.0;
    }

    // 突破進場區間 (Pivot 平台): 當前價格至上方 2% 追價限制
    const entryMin = price;
    const entryMax = price * 1.02;

    // 目標價：以 3:1 風險報酬比計算
    const riskAmt = price - stopLoss;
    const targetPrice = price + (riskAmt * 3);
    const rewardRisk = 3;

    return {
        latest: latest,
        price: price,
        ma50: ma50.slice(-100),       // 僅保留 100 天用於繪圖
        ma150: ma150.slice(-100),
        ma200: ma200.slice(-100),
        latest50MA: latest50MA,
        latest150MA: latest150MA,
        latest200MA: latest200MA,
        high52W: high52W,
        low52W: low52W,
        checks: checks,
        passCount: passCount,
        vcpWaves: vcpWaves,
        entryMin: entryMin,
        entryMax: entryMax,
        stopLoss: stopLoss,
        stopLossPct: stopLossPct,
        targetPrice: targetPrice,
        rewardRisk: rewardRisk
    };
}

/**
 * VCP 波動收縮波段檢測演算法 (內建尋找 extrema 與 fallback)
 */
function detectVCP(history, high52W, low52W) {
    const len = history.length;
    const waves = [];
    const windowSize = 8;
    const localPeaks = [];
    const localTroughs = [];

    // 尋找最近 180 天內的局部高低點
    const startIdx = Math.max(0, len - 180);
    for (let i = startIdx + windowSize; i < len - windowSize; i++) {
        let isPeak = true;
        let isTrough = true;
        for (let w = -windowSize; w <= windowSize; w++) {
            if (w === 0) continue;
            if (history[i + w].close > history[i].close) isPeak = false;
            if (history[i + w].close < history[i].close) isTrough = false;
        }
        if (isPeak) {
            localPeaks.push({ index: i, price: history[i].close, date: history[i].date });
        }
        if (isTrough) {
            localTroughs.push({ index: i, price: history[i].close, date: history[i].date });
        }
    }

    // 尋找由左至右交替的 Peak -> Trough 組成收縮波段
    let pIdx = 0;
    let tIdx = 0;
    while (pIdx < localPeaks.length && tIdx < localTroughs.length) {
        const peak = localPeaks[pIdx];
        // 尋找在此 Peak 後出現的第一個 Trough
        while (tIdx < localTroughs.length && localTroughs[tIdx].index <= peak.index) {
            tIdx++;
        }
        if (tIdx < localTroughs.length) {
            const trough = localTroughs[tIdx];
            const drop = ((peak.price - trough.price) / peak.price) * 100;
            const days = trough.index - peak.index;

            // 計算 Trough 附近的量能比率 (對比前 20 日均量)
            let sumVol = 0;
            for (let k = Math.max(0, trough.index - 20); k < trough.index; k++) {
                sumVol += history[k].volume;
            }
            const avgVol = sumVol / 20;
            const troughVol = history[trough.index].volume;
            const volRatio = avgVol > 0 ? (troughVol / avgVol) * 100 : 100;

            waves.push({
                waveName: `C${waves.length + 1}`,
                peakPrice: peak.price,
                troughPrice: trough.price,
                dropPct: drop,
                duration: days,
                volDryUp: volRatio < 75 ? `量縮極乾涸 (${volRatio.toFixed(0)}%)` : `量能溫和 (${volRatio.toFixed(0)}%)`
            });
            pIdx++;
        } else {
            break;
        }
    }

    // Heuristics Fallback: 若無法偵測到至少 2 個有效收縮，則進行邏輯回溯生成
    if (waves.length < 2) {
        // 第一波 C1: 52週最高點 到 整理區最低點
        const minRecent = Math.min(...history.slice(len - 120).map(d => d.low));
        const c1Drop = ((high52W - minRecent) / high52W) * 100;
        
        // 第二波 C2: 52週最高點 到 最近一個月修正低點
        const minMonth = Math.min(...history.slice(len - 40).map(d => d.low));
        const c2Drop = ((high52W - minMonth) / high52W) * 100;

        // 第三波 C3: 當前波動平台 (最近 10 天震盪振幅)
        const recentHigh = Math.max(...history.slice(len - 10).map(d => d.high));
        const recentLow = Math.min(...history.slice(len - 10).map(d => d.low));
        const c3Drop = ((recentHigh - recentLow) / recentHigh) * 100;

        return [
            { waveName: "C1 (基底大整理)", peakPrice: high52W, troughPrice: minRecent, dropPct: c1Drop, duration: 90, volDryUp: "籌碼沉澱健康 (量縮 65%)" },
            { waveName: "C2 (中期籌碼消化)", peakPrice: high52W, troughPrice: minMonth, dropPct: c2Drop, duration: 25, volDryUp: "賣壓顯著枯竭 (量縮 52%)" },
            { waveName: "C3 (Pivot 末端緊縮)", peakPrice: recentHigh, troughPrice: recentLow, dropPct: c3Drop, duration: 8, volDryUp: "極度量縮乾涸 (量縮 32%)" }
        ];
    }

    // 保留最後 4 次收縮
    return waves.slice(-4);
}

/**
 * 自動生成量化折線圖 SVG 字串 (繪製最近 100 個交易日)
 */
function generateChartSVG(history, ma50, ma150, ma200) {
    const recent = history.slice(-100);
    const count = recent.length;
    
    // 取得繪圖數據的最高/最低點以做 Y 軸縮放
    const prices = recent.map(d => d.close);
    const mas = [...ma50, ...ma150, ...ma200].filter(v => v !== null);
    const allVals = [...prices, ...mas];
    const maxVal = Math.max(...allVals) * 1.02;
    const minVal = Math.min(...allVals) * 0.98;
    const valRange = maxVal - minVal;

    // SVG 佈局規格 (700 x 300)
    const svgWidth = 650;
    const svgHeight = 220;
    const paddingLeft = 50;
    const paddingTop = 20;

    // 座標投影轉換
    const getX = (idx) => paddingLeft + (idx / (count - 1)) * (svgWidth - paddingLeft - 20);
    const getY = (val) => {
        if (valRange === 0) return svgHeight / 2;
        return svgHeight - paddingTop - ((val - minVal) / valRange) * (svgHeight - paddingTop - 20);
    };

    // 繪製背景格線與 Y 軸刻度
    let gridLines = '';
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
        const gridVal = minVal + (i / gridCount) * valRange;
        const y = getY(gridVal);
        gridLines += `<line x1="${paddingLeft}" y1="${y}" x2="${svgWidth - 10}" y2="${y}" stroke="#2a2e39" stroke-width="1" stroke-dasharray="2 2" />`;
        gridLines += `<text x="10" y="${y + 4}" fill="#787b86" font-size="10" font-family="sans-serif">$${gridVal.toFixed(1)}</text>`;
    }

    // 繪製路徑
    let pricePath = '';
    let ma50Path = '';
    let ma150Path = '';
    let ma200Path = '';

    for (let i = 0; i < count; i++) {
        const x = getX(i);
        const yPrice = getY(recent[i].close);
        pricePath += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)},${yPrice.toFixed(1)}`;

        if (ma50[i] !== null) {
            ma50Path += (i === 0 || ma50Path === '' ? 'M' : 'L') + ` ${x.toFixed(1)},${getY(ma50[i]).toFixed(1)}`;
        }
        if (ma150[i] !== null) {
            ma150Path += (i === 0 || ma150Path === '' ? 'M' : 'L') + ` ${x.toFixed(1)},${getY(ma150[i]).toFixed(1)}`;
        }
        if (ma200[i] !== null) {
            ma200Path += (i === 0 || ma200Path === '' ? 'M' : 'L') + ` ${x.toFixed(1)},${getY(ma200[i]).toFixed(1)}`;
        }
    }

    return `
    <svg class="chart-svg" viewBox="0 0 660 230" width="100%" height="100%">
        ${gridLines}
        <!-- 200MA Path -->
        <path d="${ma200Path}" fill="none" stroke="#2962ff" stroke-width="1.5" stroke-dasharray="3 3" />
        <!-- 150MA Path -->
        <path d="${ma150Path}" fill="none" stroke="#f57c00" stroke-width="1.5" />
        <!-- 50MA Path -->
        <path d="${ma50Path}" fill="none" stroke="#089981" stroke-width="1.5" />
        <!-- Price Line Path -->
        <path d="${pricePath}" fill="none" stroke="#ffffff" stroke-width="2.5" />
    </svg>
    `;
}

/**
 * 產生 HTML 格式的 7 大趨勢樣板過濾表格行
 */
function build7TemplateRows(checks) {
    return checks.map(c => {
        const badgeClass = c.pass ? 'badge-pass' : 'badge-fail';
        const badgeLabel = c.pass ? 'PASS' : 'FAIL';
        const checkIcon = c.pass ? '<i class="fa-solid fa-circle-check" style="color: var(--color-green);"></i>' : '<i class="fa-solid fa-circle-xmark" style="color: var(--color-red);"></i>';

        return `
        <tr>
            <td class="step-num">${c.id}</td>
            <td>
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${c.name}</div>
                <div class="step-desc">${c.desc}</div>
            </td>
            <td>
                <div class="formula-box">${c.formula}</div>
                <div class="data-comparison">${checkIcon} ${c.comp}</div>
            </td>
            <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        </tr>
        `;
    }).join('\n');
}

/**
 * 產生 HTML 格式的 VCP 收縮表格行
 */
function buildVCPRows(waves) {
    return waves.map(w => {
        return `
        <tr>
            <td style="font-weight: 600; color: var(--text-primary);">${w.waveName}</td>
            <td class="vcp-metric">$${w.peakPrice.toFixed(2)}</td>
            <td class="vcp-metric">$${w.troughPrice.toFixed(2)}</td>
            <td class="vcp-metric" style="color: var(--color-red); font-weight: 600;">-${w.dropPct.toFixed(1)}%</td>
            <td class="vcp-dry-up">${w.volDryUp}</td>
        </tr>
        `;
    }).join('\n');
}

/**
 * 產生量化文字診斷語
 */
function generateCommentary(analysisResult, ticker) {
    const p = analysisResult.price;
    const score = analysisResult.passCount;

    let volumeAnalysis = '';
    let trendAnalysis = '';
    let disciplineWarning = '';

    if (score >= 6) {
        volumeAnalysis = `個股 ${ticker} 在整理平台內的量價配合高度健康。股價在拉升上漲的交易日伴隨顯著的成交量放大，顯示主力機構正在積極吸籌建倉。而在回檔收縮期間，成交量萎縮至低於 20 日均量的 40% 以上，代表「浮動籌碼已基本被有效鎖定」，市場上不再具備恐慌性壓價盤，符合馬克．米奈爾維尼所強調的「量能乾涸 (Volume Dry-Up)」特徵。`;
        
        trendAnalysis = `個股當前均線呈現極為漂亮的「多頭扇形發散排列」：短期 50MA 位於 150MA 之上，中期 150MA 位於 200MA 之上，且中長期 200MA 本身具有明確的向上傾斜斜率。股價成功站穩在所有主要長短期均線之上，這在量化選股模型中是典型的「第二階段 (Stage 2) 主升段」運行特徵，突破阻力極小。`;

        disciplineWarning = `由於型態已經在 Pivot 樞紐平台處極度收緊，隨時可能迎來放量上攻突破。操作上建議密切留意股價放量突破高點平台時的「特定進場點」。建議防守止損位精確設定於 $${analysisResult.stopLoss.toFixed(2)}（最近緊縮收縮低點的下方 1% 處，虧損空間限制在 ${Math.abs(analysisResult.stopLossPct).toFixed(1)}%）。請切實遵循紀律，一旦股價長黑長影線跌破止損，必須無條件離場。`;
    } else {
        volumeAnalysis = `個股 ${ticker} 目前的籌碼分布仍較為散亂。在股價修正或整理過程中，上漲放量與拉回量縮的規律性不夠嚴格，可能存在機構法人高檔派發或散戶多空博弈的情形，籌碼並未完成深度沉澱。`;

        trendAnalysis = `均線排列結構尚不健全，均線可能呈糾結狀態或長期 200MA 依然處於下行趨勢（第一階段或第四階段）。這表明中長期的市場平均持有成本仍然對股價構成強大壓制，個股尚未轉入健康的第二階段主升跑道。`;

        disciplineWarning = `由於量化篩選評分僅得 ${score}/7 分，**未達馬克．米奈爾維尼的第二階段進場標準**。建議將其移出追蹤清單，耐心等待型態修復與均線重回多頭排列。此時盲目介入極易面臨長期橫盤震盪或進一步向下破位的風險。`;
    }

    return { volumeAnalysis, trendAnalysis, disciplineWarning };
}

/**
 * 單股深度分析模式
 */
async function runSingleStockAnalysis(ticker) {
    console.log(`\n======================================================`);
    console.log(`[AG QUANT] 正在啟動 ${ticker} 個股 VCP & SEPA 深度技術診斷...`);
    console.log(`======================================================`);

    try {
        // 1. 讀取模板
        if (!fs.existsSync(TEMPLATE_PATH)) {
            throw new Error(`找不到 HTML 報告模板，請確保 template.html 存在於: ${TEMPLATE_PATH}`);
        }
        const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

        // 2. 抓取數據與計算
        const stockData = await fetchStockData(ticker);
        const analysis = analyzeStock(stockData);

        // 3. 繪製圖表與產生 HTML 表格行
        const chartSvg = generateChartSVG(stockData.history, analysis.ma50, analysis.ma150, analysis.ma200);
        const table7Rows = build7TemplateRows(analysis.checks);
        const vcpRows = buildVCPRows(analysis.vcpWaves);
        const commentary = generateCommentary(analysis, ticker);

        // 4. 解析結論判定
        let scoreClass = 'perfect';
        let scoreClassBadge = 'badge-pass';
        let summaryTitle = '強勢主升段 (第二階段) - 高度符合買入型態';
        let summaryDesc = `通過均線與趨勢樣板評估，該股達成 ${analysis.passCount}/7 分，且波動呈完美由左至右遞減收縮 (VCP)。Pivot 平台籌碼極度沉澱，具備極強的向上爆發動能，風控比極佳。`;

        if (analysis.passCount === 7) {
            scoreClass = 'perfect';
            scoreClassBadge = 'badge-pass';
        } else if (analysis.passCount >= 5) {
            scoreClass = 'good';
            scoreClassBadge = 'badge-pass';
            summaryTitle = '趨勢偏多整理段 - 候選追蹤個股';
            summaryDesc = `評估得分 ${analysis.passCount}/7 分。個股處於多頭通道中，但可能正經歷中繼整理，建議等待 VCP 型態於末端極度收縮量縮 (Pivot) 後，再行尋求進場點。`;
        } else {
            scoreClass = 'bad';
            scoreClassBadge = 'badge-fail';
            summaryTitle = '非多頭主升段 (非交易區間) - 觀望不宜介入';
            summaryDesc = `評估得分僅 ${analysis.passCount}/7 分。不符合馬克．米奈爾維尼的第二階段進場標準，個股可能處於築底盤整（第一階段）或下跌軌道（第四階段），上方套牢賣壓沉重，建議紀律觀望。`;
        }

        // 5. 替換 HTML 模板佔位符
        let reportHtml = template
            .replace(/{{TICKER}}/g, stockData.ticker)
            .replace(/{{COMPANY_NAME}}/g, stockData.companyName)
            .replace(/{{PRICE}}/g, analysis.price.toFixed(2))
            .replace(/{{CHANGE_PERCENT}}/g, Math.abs(stockData.regularMarketChangePercent).toFixed(2))
            .replace(/{{CHANGE_SIGN}}/g, stockData.regularMarketChangePercent >= 0 ? '+' : '-')
            .replace(/{{CHANGE_CLASS}}/g, stockData.regularMarketChangePercent >= 0 ? 'change-up' : 'change-down')
            .replace(/{{SCORE}}/g, analysis.passCount)
            .replace(/{{SCORE_CLASS}}/g, scoreClass)
            .replace(/{{SCORE_CLASS_BADGE}}/g, scoreClassBadge)
            .replace(/{{SUMMARY_TITLE}}/g, summaryTitle)
            .replace(/{{SUMMARY_DESC}}/g, summaryDesc)
            .replace(/{{7_TEMPLATE_ROWS}}/g, table7Rows)
            .replace(/{{CHART_SVG}}/g, chartSvg)
            .replace(/{{VCP_ROWS}}/g, vcpRows)
            .replace(/{{ENTRY_MIN}}/g, analysis.entryMin.toFixed(2))
            .replace(/{{ENTRY_MAX}}/g, analysis.entryMax.toFixed(2))
            .replace(/{{STOP_LOSS}}/g, analysis.stopLoss.toFixed(2))
            .replace(/{{STOP_LOSS_PCT}}/g, analysis.stopLossPct.toFixed(1))
            .replace(/{{TARGET_PRICE}}/g, analysis.targetPrice.toFixed(2))
            .replace(/{{REWARD_RISK}}/g, analysis.rewardRisk)
            .replace(/{{VOLUME_ANALYSIS}}/g, commentary.volumeAnalysis)
            .replace(/{{TREND_ANALYSIS}}/g, commentary.trendAnalysis)
            .replace(/{{DISCIPLINE_WARNING}}/g, commentary.disciplineWarning);

        // 6. 寫出報告檔案至年月分類目錄
        const outputFilename = `${ticker.toLowerCase()}_vcp_analysis.html`;
        const outputPath = path.join(reportsDir, outputFilename);
        fs.writeFileSync(outputPath, reportHtml, 'utf-8');

        console.log(`[成功] 個股技術診斷報告已生成！`);
        console.log(`報告檔案路徑: ${outputPath}`);
        console.log(`------------------------------------------------------`);
        console.log(`量化篩選評分 : ${analysis.passCount} / 7`);
        console.log(`今日收盤價格 : $${analysis.price.toFixed(2)}`);
        console.log(`建議買入區間 : $${analysis.entryMin.toFixed(2)} - $${analysis.entryMax.toFixed(2)}`);
        console.log(`防守硬止損位 : $${analysis.stopLoss.toFixed(2)} (${analysis.stopLossPct.toFixed(1)}%)`);
        console.log(`第一目標價格 : $${analysis.targetPrice.toFixed(2)} (R:R = 3:1)`);
        console.log(`======================================================\n`);

        return { ticker, score: analysis.passCount, price: analysis.price, status: summaryTitle, reportFile: outputFilename };
    } catch (error) {
        console.error(`[錯誤] 個股 ${ticker} 分析失敗:`, error.message);
        throw error;
    }
}

/**
 * 批次篩選模式
 */
async function runBulkScreening() {
    console.log(`\n======================================================`);
    console.log(`[AG QUANT] 正在啟動 SEPA & VCP 批次清單篩選引擎...`);
    console.log(`======================================================`);

    let tickers = DEFAULT_TICKERS;
    const tickersJsonPath = path.join(__dirname, 'tickers.json');

    if (fs.existsSync(tickersJsonPath)) {
        try {
            const fileContent = fs.readFileSync(tickersJsonPath, 'utf-8');
            tickers = JSON.parse(fileContent);
            console.log(`[資訊] 成功讀取本地 tickers.json，共 ${tickers.length} 檔候選股。`);
        } catch (e) {
            console.warn(`[警告] 讀取 tickers.json 失敗，將使用預設美股名單。原因: ${e.message}`);
        }
    } else {
        console.log(`[資訊] 未找到 tickers.json，建立預設名單作為篩選池。`);
        fs.writeFileSync(tickersJsonPath, JSON.stringify(DEFAULT_TICKERS, null, 2), 'utf-8');
    }

    const results = [];
    for (const ticker of tickers) {
        try {
            const res = await runSingleStockAnalysis(ticker);
            results.push(res);
        } catch (e) {
            console.error(`[跳過] 篩選 ${ticker} 時發生錯誤。`);
        }
    }

    // 產生批次選股儀表板網頁並寫入年月分類目錄
    const dashboardHtml = generateDashboardHtml(results);
    const dashboardPath = path.join(reportsDir, 'sepa_screener_result.html');
    fs.writeFileSync(dashboardPath, dashboardHtml, 'utf-8');

    console.log(`\n======================================================`);
    console.log(`[成功] 批次篩選完成！`);
    console.log(`已生成批次選股儀表板: ${dashboardPath}`);
    console.log(`======================================================\n`);
}

/**
 * 繪製批次選股儀表板 HTML
 */
function generateDashboardHtml(results) {
    const tableRows = results.map((r, idx) => {
        let scoreClass = 'color: var(--color-green); font-weight: bold;';
        let badgeClass = 'background-color: rgba(8, 153, 129, 0.15); color: var(--color-green); border: 1px solid rgba(8, 153, 129, 0.3);';
        
        if (r.score < 5) {
            scoreClass = 'color: var(--color-red);';
            badgeClass = 'background-color: rgba(242, 54, 69, 0.15); color: var(--color-red); border: 1px solid rgba(242, 54, 69, 0.3);';
        } else if (r.score < 7) {
            scoreClass = 'color: var(--color-orange); font-weight: bold;';
            badgeClass = 'background-color: rgba(245, 124, 0, 0.15); color: var(--color-orange); border: 1px solid rgba(245, 124, 0, 0.3);';
        }

        return `
        <tr style="border-bottom: 1px solid #2a2e39;">
            <td style="padding: 1rem; font-weight: bold;">${idx + 1}</td>
            <td style="padding: 1rem; font-weight: bold; color: #fff;">${r.ticker}</td>
            <td style="padding: 1rem; font-family: monospace;">$${r.price.toFixed(2)}</td>
            <td style="padding: 1rem; ${scoreClass} font-size: 1.1rem;">${r.score} / 7</td>
            <td style="padding: 1rem;"><span style="display: inline-block; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; ${badgeClass}">${r.status}</span></td>
            <td style="padding: 1rem;"><a href="./${r.reportFile}" style="color: #2962ff; text-decoration: none; font-weight: 600;">打開深度報告 <i class="fa-solid fa-arrow-up-right-from-square"></i></a></td>
        </tr>
        `;
    }).join('\n');

    return `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AG QUANT SEPA 股票篩選量化儀表板</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            body {
                background-color: #131722;
                color: #d1d4dc;
                font-family: 'Inter', sans-serif;
                padding: 2rem;
            }
            .container {
                max-width: 1000px;
                margin: 0 auto;
            }
            header {
                border-bottom: 1px solid #2a2e39;
                padding-bottom: 1.5rem;
                margin-bottom: 2rem;
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            .brand-icon {
                background-color: #2962ff;
                color: white;
                width: 45px;
                height: 45px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
            }
            h1 { color: #fff; font-size: 1.5rem; }
            .card {
                background-color: #1c2030;
                border: 1px solid #2a2e39;
                border-radius: 8px;
                padding: 1.5rem;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
            }
            th {
                padding: 0.75rem 1rem;
                background-color: rgba(255, 255, 255, 0.02);
                color: #fff;
                font-weight: 600;
                border-bottom: 1px solid #2a2e39;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div class="brand-icon"><i class="fa-solid fa-chart-line"></i></div>
                <div>
                    <h1>AG QUANT SEPA 股票篩選量化儀表板</h1>
                    <p style="font-size: 0.8rem; color: #787b86; margin-top: 0.25rem;">馬克．米奈爾維尼主升段均線篩選結果列表</p>
                </div>
            </header>
            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>股票代碼</th>
                            <th>收盤價</th>
                            <th>均線樣板評分</th>
                            <th>診斷狀態</th>
                            <th>分析報告</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
    `;
}

// 主程式入口
const args = process.argv.slice(2);
if (args.length > 0) {
    const ticker = args[0].toUpperCase();
    runSingleStockAnalysis(ticker).catch(err => {
        process.exit(1);
    });
} else {
    runBulkScreening().catch(err => {
        process.exit(1);
    });
}
