const videoElement = document.getElementById('video');
const outputElement = document.getElementById('output');
const barcodeListElement = document.getElementById('barcodeList').getElementsByTagName('tbody')[0];
const latestBarcodeElement = document.getElementById('latestBarcode');
const initializeButton = document.getElementById('initializeButton');
const saveCsvButton = document.getElementById('saveCsvButton');
const addEmptyBarcodeButton = document.getElementById('addEmptyBarcodeButton');
const modal = document.getElementById('modal');
const modalOverlay = document.getElementById('modalOverlay');
const detectedBarcodeElement = document.getElementById('detectedBarcode');
const barcodeInfoElement = document.getElementById('barcodeInfo');
const manualEntryElement = document.getElementById('manualEntry');
const manualBarcodeInput = document.getElementById('manualBarcode');
const initializingText = document.getElementById('initializingText');
const dotsContainer = document.querySelector('.dots-container');
const countNumberElement = document.getElementById('countNumber');

let lastDetected = '';
let confirmCounter = 0;
let currentBarcode = '';
let isModalOpen = false;
let barcodeCount = 0;

const synth = window.speechSynthesis;
let audioContext = null;

// Debug log
console.log('App loaded. Output element:', outputElement);

// Initialize AudioContext and play beep
function playBeep() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                playBeepSound();
            });
        } else {
            playBeepSound();
        }
    } catch (error) {
        console.error('Beep error:', error);
    }
}

// Actual sound generation
function playBeepSound() {
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
        }, 100);
    } catch (error) {
        console.error('Beep sound error:', error);
    }
}

function speakBarcode(barcode) {
    if (synth.speaking) {
        console.log("Speech synthesis is already in progress.");
        return;
    }
    const digits = barcode.split('');
    const delayBetweenDigits = 400;
    const voices = synth.getVoices();
    const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes("female") || 
        voice.lang.startsWith("en") && voice.name.toLowerCase().includes("woman")
    );
    digits.forEach((digit, index) => {
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(digit);
            utterance.rate = 1.1;
            if (femaleVoice) utterance.voice = femaleVoice;
            synth.speak(utterance);
        }, index * delayBetweenDigits);
    });
}

function getBarcodeType(barcode) {
    const length = barcode.length;
    if (length === 12) return 'UPC-A';
    if (length === 6) return 'UPC-E';
    if (length === 13) {
        if (barcode.startsWith('978') || barcode.startsWith('979')) return 'ISBN';
        if (barcode.startsWith('45') || barcode.startsWith('49')) return 'JAN-13';
        return 'EAN-13';
    }
    if (length === 8) return 'EAN-8';
    if (length === 10) return 'ISSN';
    return 'Unknown';
}

function validateBarcode(barcode) {
    if (!barcode || typeof barcode !== 'string') return false;
    const length = barcode.length;
    const typeChecks = {
        'UPC-A': length === 12 && /^\d{12}$/.test(barcode),
        'UPC-E': length === 6 && /^\d{6}$/.test(barcode),
        'EAN-13': length === 13 && /^\d{13}$/.test(barcode),
        'EAN-8': length === 8 && /^\d{8}$/.test(barcode),
        'ISBN': length === 13 && /^\d{13}$/.test(barcode) && (barcode.startsWith('978') || barcode.startsWith('979')),
        'JAN-13': length === 13 && /^\d{13}$/.test(barcode) && (barcode.startsWith('45') || barcode.startsWith('49')),
        'ISSN': length === 10 && /^\d{10}$/.test(barcode)
    };
    return Object.values(typeChecks).some(check => check);
}

async function initializeCameraAndScanner() {
    try {
        console.log('Initializing camera and scanner...');
        initializeButton.style.display = 'none';
        initializingText.style.display = 'block';
        dotsContainer.style.display = 'flex';

        const devices = await navigator.mediaDevices.enumerateDevices();
        const backCamera = devices.find(
            device => device.kind === "videoinput" && device.label.toLowerCase().includes("back")
        );

        const constraints = backCamera
            ? { video: { deviceId: { exact: backCamera.deviceId }, width: 1280, height: 720 } }
            : { video: { facingMode: "environment", width: 1280, height: 720 } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: videoElement,
                constraints,
                singleChannel: false
            },
            decoder: {
                readers: [
                    "upc_reader",
                    "upc_e_reader",
                    "ean_reader",
                    "ean_8_reader",
                    "code_128_reader"
                ],
                multiple: false
            },
            locator: {
                patchSize: "medium",
                halfSample: true,
                refine: true
            },
            numOfWorkers: navigator.hardwareConcurrency || 4,
            frequency: 20,
            locate: true
        }, function (err) {
            if (err) {
                console.error("Quagga initialization failed:", err);
                if (outputElement) {
                    outputElement.textContent = "Error initializing barcode scanner.";
                    outputElement.classList.add("error");
                }
                return;
            }
            console.log('Quagga started successfully');
            Quagga.start();
            initializingText.style.display = 'none';
            dotsContainer.style.display = 'none';
            if (outputElement) {
                outputElement.textContent = "Point your camera at barcodes.";
            }
        });

        Quagga.onProcessed(function(result) {
            if (result && result.box) {
                // Optional: Could add visual feedback here if needed
            }
        });

        Quagga.onDetected((data) => {
            console.log('Barcode detected:', data.codeResult.code);
            if (isModalOpen) return;

            const code = data.codeResult.code;
            if (!validateBarcode(code)) {
                console.log("Invalid barcode detected:", code);
                return;
            }

            if (lastDetected === code) {
                confirmCounter++;
                if (confirmCounter >= 2) {
                    confirmCounter = 0;
                    processBarcode(code);
                }
            } else {
                lastDetected = code;
                confirmCounter = 1;
            }
        });

    } catch (error) {
        console.error("Error accessing camera or initializing scanner:", error);
        if (outputElement) {
            outputElement.textContent = "Error accessing the camera or initializing scanner.";
            outputElement.classList.add("error");
        }
    }
}

async function processBarcode(barcode) {
    currentBarcode = barcode;
    await showModal(barcode);
}

async function showModal(barcode) {
    playBeep();
    detectedBarcodeElement.textContent = barcode;
    const barcodeType = getBarcodeType(barcode);
    const barcodeDigits = barcode ? barcode.length : 0;
    barcodeInfoElement.textContent = `${barcodeType} (${barcodeDigits} digits)`;
    modal.style.display = 'block';
    modalOverlay.style.display = 'block';
    videoElement.classList.add('dimmed');
    isModalOpen = true;
    manualEntryElement.style.display = 'none';
}

function hideModal() {
    modal.style.display = 'none';
    modalOverlay.style.display = 'none';
    videoElement.classList.remove('dimmed');
    isModalOpen = false;
}

function confirmBarcode() {
    updateUIWithBarcode(currentBarcode);
    hideModal();
}

function rescanBarcode() {
    hideModal();
}

function enterManually() {
    manualEntryElement.style.display = 'block';
}

function submitManualBarcode() {
    const manualBarcode = manualBarcodeInput.value;
    if (manualBarcode) {
        updateUIWithBarcode(manualBarcode);
        playBeep();
        manualBarcodeInput.value = '';
        hideModal();
    }
}

function cancelBarcode() {
    hideModal();
}

function readBarcode() {
    speakBarcode(currentBarcode);
}

function updateUIWithBarcode(barcode) {
    latestBarcodeElement.textContent = barcode ? `Latest Scanned: ${barcode}` : "Latest Scanned: (Empty)";
    const barcodeType = getBarcodeType(barcode);
    const newRow = barcodeListElement.insertRow(0);
    const valueCell = newRow.insertCell(0);
    const typeCell = newRow.insertCell(1);
    valueCell.textContent = barcode || "";
    typeCell.textContent = barcodeType;
    barcodeCount++;
    countNumberElement.textContent = barcodeCount;
    countNumberElement.classList.remove('pop');
    setTimeout(() => {
        countNumberElement.classList.add('pop');
    }, 10);
    if (barcodeListElement.rows.length > 0) {
        saveCsvButton.style.display = 'block';
    }
}

function addEmptyBarcode() {
    updateUIWithBarcode('NO_BARCODE-00000000');
    playBeep();
}

function getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours() % 12 || 12).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    return `${year}-${month}-${day}_${ampm}${hours}${minutes}${seconds}`;
}

function downloadCSV() {
    const storeName = prompt("Please enter the store name:");
    if (!storeName) {
        alert("Store name is required to save the CSV file.");
        return;
    }
    const barcodes = [];
    const rows = barcodeListElement.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const barcode = rows[i].getElementsByTagName('td')[0].textContent;
        barcodes.push(barcode);
    }
    const csvContent = "data:text/csv;charset=utf-8," + barcodes.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${storeName}_${getCurrentDateTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

initializeButton.addEventListener('click', initializeCameraAndScanner);
saveCsvButton.addEventListener('click', downloadCSV);
addEmptyBarcodeButton.addEventListener('click', addEmptyBarcode);
