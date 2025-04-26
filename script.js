const video = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvas = canvasElement.getContext('2d');
const resultContainer = document.getElementById('result-container');
const invoiceNumberEl = document.getElementById('invoice-number');
const invoiceDateEl = document.getElementById('invoice-date');
const randomCodeEl = document.getElementById('random-code');
const totalAmountEl = document.getElementById('total-amount');
// const rawDataEl = document.getElementById('raw-data'); // 可選：顯示原始資料

const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValueSpan = document.getElementById('zoom-value');

let stream = null;
let scanning = false;
let currentTrack = null;
let capabilities = null; // 保存相機能力

// --- 相機與掃描控制 ---

async function startScan() {
    try {
        // 請求後置鏡頭 ('environment')
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment'
                // 可以嘗試加入 width/height 限制來影響畫質或效能
                // width: { ideal: 1280 },
                // height: { ideal: 720 }
            }
        });
        video.srcObject = stream;
        video.setAttribute("playsinline", true); // iOS 需要
        await video.play();

        currentTrack = stream.getVideoTracks()[0];
        capabilities = currentTrack.getCapabilities ? currentTrack.getCapabilities() : null; // 獲取相機能力

        // 檢查是否支援 Zoom
        if (capabilities && capabilities.zoom) {
            zoomSlider.min = capabilities.zoom.min || 1;
            zoomSlider.max = capabilities.zoom.max || 5; // 預設最大 5x
            zoomSlider.step = capabilities.zoom.step || 0.1;
            zoomSlider.disabled = false;
            setZoom(parseFloat(zoomSlider.value)); // 設定初始 Zoom
        } else {
            console.warn("此裝置/瀏覽器不支援 Zoom 控制");
            zoomSlider.disabled = true;
            zoomValueSpan.textContent = '不支援';
        }


        scanning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        requestAnimationFrame(tick); // 開始掃描迴圈
        console.log("相機已啟動");

    } catch (err) {
        console.error("無法啟動相機:", err);
        alert(`無法啟動相機: ${err.message}\n請確認已授權相機權限，並使用 https 連線。`);
        startButton.disabled = false;
        stopButton.disabled = true;
    }
}

function stopScan() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
        currentTrack = null;
        capabilities = null;
    }
    scanning = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    zoomSlider.disabled = true; // 停止時禁用 Zoom 控制
    console.log("相機已停止");
}

startButton.addEventListener('click', startScan);
stopButton.addEventListener('click', stopScan);

// --- Zoom 控制 ---
zoomSlider.addEventListener('input', () => {
    const zoomLevel = parseFloat(zoomSlider.value);
    setZoom(zoomLevel);
});

function setZoom(value) {
    if (currentTrack && capabilities && capabilities.zoom) {
        try {
            // 使用 applyConstraints 來設定 Zoom
            currentTrack.applyConstraints({ advanced: [{ zoom: value }] })
                .then(() => {
                    zoomValueSpan.textContent = `${value.toFixed(1)}x`;
                    console.log(`Zoom 設定為: ${value}`);
                })
                .catch(err => {
                    console.error("設定 Zoom 失敗:", err);
                });
        } catch (err) {
            console.error("設定 Zoom 時發生錯誤:", err);
        }
    } else if (!capabilities || !capabilities.zoom) {
        // console.warn("嘗試設定 Zoom，但目前裝置不支援。");
    }
}


// --- QR Code 掃描迴圈 ---
function tick() {
    if (!scanning || video.readyState !== video.HAVE_ENOUGH_DATA) {
        // 如果停止掃描或影像尚未準備好，則不繼續
        return;
    }

    // 設定 canvas 尺寸與 video 匹配
    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    // 將 video 當前畫面繪製到 canvas 上
    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

    // 從 canvas 獲取影像數據
    const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);

    // 使用 jsQR 解碼
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert", // 發票 QR Code 通常不需要反轉嘗試
    });

    if (code && code.data) {
        // 偵測到 QR Code
        console.log("偵測到 QR Code:", code.data);
        // rawDataEl.textContent = code.data; // 顯示原始資料

        // --- 解析台灣電子發票 QR Code ---
        // 注意：這需要根據財政部公布的格式來解析，格式可能會微調
        // 通常前 77 個字元包含基本資訊
        // https://www.einvoice.nat.gov.tw/home/DownLoad?fileName=1530170647551_0.pdf (參考文件可能過期，需找最新)
        const qrData = code.data;

        if (qrData.length >= 77) { // 基本長度檢查
            try {
                const invoiceNum = qrData.substring(0, 10); // 發票號碼 (10碼)
                const invoiceDateStr = qrData.substring(10, 17); // 發票日期 (民國年月日 YYYMMDD)
                const randomCode = qrData.substring(17, 21); // 隨機碼 (4碼)
                // 金額是 16 進位，需要轉換
                // const salesAmountHex = qrData.substring(21, 29); // 銷售額 (8碼 Hex)
                const totalAmountHex = qrData.substring(29, 37); // 總金額 (8碼 Hex)
                // const buyerBAN = qrData.substring(37, 45); // 買方統編 (8碼)
                // const sellerBAN = qrData.substring(45, 53); // 賣方統編 (8碼)
                // const encryptedData = qrData.substring(53); // 加密區段及其他

                // 轉換日期格式 (民國轉西元)
                const yearCE = parseInt(invoiceDateStr.substring(0, 3), 10) + 1911;
                const month = invoiceDateStr.substring(3, 5);
                const day = invoiceDateStr.substring(5, 7);
                const formattedDate = `${yearCE}-${month}-${day}`;

                // 轉換總金額 (Hex to Decimal)
                const totalAmountDec = parseInt(totalAmountHex, 16);

                // 驗證發票號碼格式 (簡單檢查：2個英文字母 + 8個數字)
                if (/^[A-Z]{2}\d{8}$/.test(invoiceNum)) {
                    // 更新畫面顯示
                    invoiceNumberEl.textContent = invoiceNum;
                    invoiceDateEl.textContent = formattedDate;
                    randomCodeEl.textContent = randomCode;
                    totalAmountEl.textContent = totalAmountDec;

                    // 成功解析後可以考慮停止掃描或給予提示音
                    // stopScan(); // 例如：找到就停止
                    // playBeepSound(); // 需要額外實現播放聲音的函數

                } else {
                    console.log("偵測到的 QR Code 格式不符 (發票號碼格式錯誤)");
                    // 可以選擇清除上次結果或顯示提示
                }

            } catch (parseError) {
                console.error("解析發票 QR Code 出錯:", parseError);
                // 清除結果或顯示錯誤
                invoiceNumberEl.textContent = '-';
                invoiceDateEl.textContent = '-';
                randomCodeEl.textContent = '-';
                totalAmountEl.textContent = '-';
            }

        } else {
            console.log("偵測到的 QR Code 長度不足，可能不是發票");
            // 可以選擇清除上次結果或顯示提示
        }
    } else {
        // 未偵測到 QR Code
        // console.log("未偵測到 QR Code..."); // 持續掃描中，可以不用印出
    }

    // 持續呼叫下一幀進行掃描
    if (scanning) {
        requestAnimationFrame(tick);
    }
}

// 初始化：頁面載入時禁用停止按鈕和 Zoom 滑桿
stopButton.disabled = true;
zoomSlider.disabled = true;
zoomValueSpan.textContent = 'N/A'; // 初始顯示 N/A 或 1.0x

// (可選) 頁面載入時自動請求權限或提示使用者點擊按鈕
// alert("請點擊 '開始掃描' 按鈕並允許相機權限。");