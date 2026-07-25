/* ===================================
   DOM ELEMENT REFERENCES
   Selects HTML elements for manipulation
   =================================== */
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

/* ===================================
   STATE VARIABLES
   Track application state and user interactions
   =================================== */
let lastDetected = '';              // Stores the last barcode detected (prevents duplicates)
let confirmCounter = 0;             // Counter to confirm same barcode detected twice
let currentBarcode = '';            // Stores the current barcode being processed
let isModalOpen = false;            // Flag to check if modal dialog is currently open
let barcodeCount = 0;               // Counter for total barcodes scanned

/* ===================================
   AUDIO CONTEXT & SPEECH SYNTHESIS
   Initialize audio and speech capabilities
   =================================== */
const synth = window.speechSynthesis;  // Web Speech API for reading barcodes aloud
let audioContext = null;               // Audio context for playing beep sounds

/* ===================================
   AUDIO BEEP FUNCTION - PART 1
   Initialize AudioContext if not already created
   Used to play confirmation beep when barcode detected
   =================================== */
function playBeep() {
    // Create audio context on first use (required by browsers)
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume audio context if suspended (required by browser autoplay policies)
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            playBeepSound();
        });
    } else {
        // If not suspended, play the beep immediately
        playBeepSound();
    }
}

/* ===================================
   AUDIO BEEP FUNCTION - PART 2
   Creates and plays the actual beep sound
   Uses Web Audio API to generate square wave tone
   =================================== */
function playBeepSound() {
    // Create oscillator (tone generator)
    const oscillator = audioContext.createOscillator();
    // Create gain node (volume control)
    const gainNode = audioContext.createGain();
    
    // Connect oscillator -> gain -> speakers
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Configure the beep sound
    oscillator.type = 'square';                                    // Square wave tone (harsh beep)
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime); // 1000 Hz frequency
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);   // 10% volume (quiet)
    
    // Play the beep
    oscillator.start();
    // Stop after 100 milliseconds
    setTimeout(() => {
        oscillator.stop();
    }, 100);
}

/* ===================================
   SPEECH SYNTHESIS FUNCTION
   Reads barcode digits aloud using text-to-speech
   Speaks each digit individually with delays between them
   =================================== */
function speakBarcode(barcode) {
    // Check if speech is already in progress
    if (synth.speaking) {
        console.log("Speech synthesis is already in progress.");
        return;
    }
    
    // Split barcode into individual digits
    const digits = barcode.split('');
    // 400ms delay between each digit (allows time to listen)
    const delayBetweenDigits = 400;
    
    // Get available voices on the device
    const voices = synth.getVoices();
    
    // Try to find a female voice for better clarity
    const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes("female") || 
        voice.lang.startsWith("en") && voice.name.toLowerCase().includes("woman")
    );
    
    // Speak each digit with delay
    digits.forEach((digit, index) => {
        setTimeout(() => {
            // Create utterance for this digit
            const utterance = new SpeechSynthesisUtterance(digit);
            utterance.rate = 1.1;                    // Speak slightly faster than normal
            if (femaleVoice) utterance.voice = femaleVoice;  // Use female voice if available
            synth.speak(utterance);
        }, index * delayBetweenDigits);  // Delay each digit
    });
}

/* ===================================
   BARCODE TYPE DETECTION FUNCTION
   Determines barcode format based on length
   Returns standardized barcode type name
   =================================== */
function getBarcodeType(barcode) {
    const length = barcode.length;
    
    // Check barcode length and prefix to identify type
    if (length === 12) return 'UPC-A';           // 12 digits = Universal Product Code A
    if (length === 6) return 'UPC-E';            // 6 digits = Universal Product Code E
    if (length === 13) {
        if (barcode.startsWith('978') || barcode.startsWith('979')) return 'ISBN';  // Book ISBN
        if (barcode.startsWith('45') || barcode.startsWith('49')) return 'JAN-13';  // Japanese barcode
        return 'EAN-13';                          // 13 digits = European Article Number 13
    }
    if (length === 8) return 'EAN-8';            // 8 digits = European Article Number 8
    if (length === 10) return 'ISSN';            // 10 digits = International Serial Standard Number
    
    return 'Unknown';                             // Unrecognized format
}

/* ===================================
   BARCODE VALIDATION FUNCTION
   Verifies barcode format is correct for its type
   Returns true if valid, false if invalid
   =================================== */
function validateBarcode(barcode) {
    // Check if barcode exists and is a string
    if (!barcode || typeof barcode !== 'string') return false;
    
    const length = barcode.length;
    
    // Define validation rules for each barcode type
    const typeChecks = {
        'UPC-A': length === 12 && /^\d{12}$/.test(barcode),                                    // 12 digits, all numbers
        'UPC-E': length === 6 && /^\d{6}$/.test(barcode),                                      // 6 digits, all numbers
        'EAN-13': length === 13 && /^\d{13}$/.test(barcode),                                   // 13 digits, all numbers
        'EAN-8': length === 8 && /^\d{8}$/.test(barcode),                                      // 8 digits, all numbers
        'ISBN': length === 13 && /^\d{13}$/.test(barcode) && (barcode.startsWith('978') || barcode.startsWith('979')),  // 13 digits starting with 978 or 979
        'JAN-13': length === 13 && /^\d{13}$/.test(barcode) && (barcode.startsWith('45') || barcode.startsWith('49')), // 13 digits starting with 45 or 49
        'ISSN': length === 10 && /^\d{10}$/.test(barcode)                                      // 10 digits, all numbers
    };
    
    // Return true if barcode matches ANY type validation
    return Object.values(typeChecks).some(check => check);
}

/* ===================================
   CAMERA INITIALIZATION & SCANNER SETUP
   Main function to start camera and barcode detection
   Uses Quagga library for barcode detection
   =================================== */
async function initializeCameraAndScanner() {
    try {
        // Hide the "Start Scanning" button
        initializeButton.style.display = 'none';
        
        // Show loading animation
        initializingText.style.display = 'block';
        dotsContainer.style.display = 'flex';

        /* ===================================
           REQUEST CAMERA PERMISSIONS & SETUP
           =================================== */
        // Get list of all media devices (cameras, microphones, etc.)
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Try to find the back/rear camera (preferred for barcode scanning)
        const backCamera = devices.find(
            device => device.kind === "videoinput" && device.label.toLowerCase().includes("back")
        );

        // Set camera constraints (resolution and device preference)
        const constraints = backCamera
            ? { video: { deviceId: { exact: backCamera.deviceId }, width: 1280, height: 720 } }
            : { video: { facingMode: "environment", width: 1280, height: 720 } };  // Fall back to environment mode

        // Request camera access from user
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;  // Connect camera stream to video element

        /* ===================================
           QUAGGA BARCODE SCANNER INITIALIZATION
           Configures the barcode detection library
           =================================== */
        Quagga.init({
            // Input stream settings
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: videoElement,                    // Where to display camera feed
                constraints,
                singleChannel: false
            },
            
            // Decoder settings - which barcode types to detect
            decoder: {
                readers: [
                    "upc_reader",                         // UPC barcodes
                    "upc_e_reader",                       // UPC-E barcodes
                    "ean_reader",                         // EAN barcodes
                    "ean_8_reader",                       // EAN-8 barcodes
                    "code_128_reader"                     // Code 128 barcodes
                ],
                multiple: false                          // Only detect one barcode at a time
            },
            
            // Locator settings - how to find barcodes in image
            locator: {
                patchSize: "medium",                      // Size of search area
                halfSample: true,                         // Use half resolution for speed
                refine: true                              // Refine detection accuracy
            },
            
            // Performance settings
            numOfWorkers: navigator.hardwareConcurrency || 4,  // Use multiple CPU cores
            frequency: 20,                                     // Check for barcodes 20 times per second
            locate: true                                       // Attempt to locate barcode in image
            
        }, function (err) {
            // Callback function after initialization
            if (err) {
                console.error("Quagga initialization failed:", err);
                outputElement.textContent = "Error initializing barcode scanner.";
                outputElement.classList.add("error");
                return;
            }
            
            // Start scanning
            Quagga.start();
            // Hide loading animation
            initializingText.style.display = 'none';
            dotsContainer.style.display = 'none';
            outputElement.textContent = "Point your camera at barcodes.";
        });

        /* ===================================
           QUAGGA PROCESSING CALLBACK
           Called for each frame processed by scanner
           =================================== */
        Quagga.onProcessed(function(result) {
            if (result && result.box) {
                // Optional: Could add visual feedback here if needed
                // Currently not used, but available for future enhancements
            }
        });

        /* ===================================
           QUAGGA BARCODE DETECTION CALLBACK
           Main detection handler - called when barcode found
           =================================== */
        Quagga.onDetected((data) => {
            // Don't process if modal is already open
            if (isModalOpen) return;

            // Extract barcode value from detection result
            const code = data.codeResult.code;
            
            // Validate the barcode format
            if (!validateBarcode(code)) {
                console.log("Invalid barcode detected:", code);
                return;
            }

            /* ===================================
               DUPLICATE DETECTION PREVENTION
               Requires same barcode detected twice
               Before processing (reduces false positives)
               =================================== */
            if (lastDetected === code) {
                // Same barcode detected again
                confirmCounter++;
                // If detected 2 times, it's confirmed
                if (confirmCounter >= 2) {
                    confirmCounter = 0;
                    processBarcode(code);
                }
            } else {
                // Different barcode detected
                lastDetected = code;
                confirmCounter = 1;  // Reset counter
            }
        });

    } catch (error) {
        console.error("Error accessing camera or initializing scanner:", error);
        outputElement.textContent = "Error accessing the camera or initializing scanner.";
        outputElement.classList.add("error");
    }
}

/* ===================================
   PROCESS BARCODE FUNCTION
   Handles confirmed barcode detection
   Opens modal dialog for user confirmation
   =================================== */
async function processBarcode(barcode) {
    currentBarcode = barcode;
    await showModal(barcode);
}

/* ===================================
   SHOW MODAL FUNCTION
   Displays confirmation dialog to user
   Shows detected barcode and action options
   =================================== */
async function showModal(barcode) {
    // Play beep sound immediately when barcode detected
    playBeep();
    
    // Display the detected barcode value in modal
    detectedBarcodeElement.textContent = barcode;
    
    // Detect and display barcode type and digit count
    const barcodeType = getBarcodeType(barcode);
    const barcodeDigits = barcode ? barcode.length : 0;
    barcodeInfoElement.textContent = `${barcodeType} (${barcodeDigits} digits)`;
    
    // Show modal dialog and overlay
    modal.style.display = 'block';
    modalOverlay.style.display = 'block';
    
    // Dim the video feed to focus attention on modal
    videoElement.classList.add('dimmed');
    
    // Set flag so we don't process new barcodes while modal open
    isModalOpen = true;
    
    // Hide manual entry field (show only on demand)
    manualEntryElement.style.display = 'none';
}

/* ===================================
   HIDE MODAL FUNCTION
   Closes confirmation dialog
   Restores video to normal brightness
   =================================== */
function hideModal() {
    modal.style.display = 'none';
    modalOverlay.style.display = 'none';
    videoElement.classList.remove('dimmed');
    isModalOpen = false;
}

/* ===================================
   CONFIRM BARCODE BUTTON
   User confirmed the scanned barcode is correct
   Adds to list and closes modal
   =================================== */
function confirmBarcode() {
    updateUIWithBarcode(currentBarcode);
    hideModal();
}

/* ===================================
   RESCAN BARCODE BUTTON
   User says barcode was wrong
   Closes modal to scan again
   =================================== */
function rescanBarcode() {
    hideModal();
}

/* ===================================
   ENTER MANUALLY BUTTON
   Shows manual entry input field
   Allows user to type barcode if scan fails
   =================================== */
function enterManually() {
    manualEntryElement.style.display = 'block';
}

/* ===================================
   SUBMIT MANUAL BARCODE FUNCTION
   Processes manually typed barcode
   Validates and adds to list
   =================================== */
function submitManualBarcode() {
    // Get barcode value from input field
    const manualBarcode = manualBarcodeInput.value;
    
    // Only proceed if input field has a value
    if (manualBarcode) {
        updateUIWithBarcode(manualBarcode);
        playBeep();  // Play confirmation beep
        manualBarcodeInput.value = '';  // Clear input field
        hideModal();
    }
}

/* ===================================
   CANCEL BARCODE BUTTON
   User cancelled the barcode dialog
   Closes modal without saving
   =================================== */
function cancelBarcode() {
    hideModal();
}

/* ===================================
   READ BARCODE BUTTON
   Speaks the barcode digits aloud
   Uses text-to-speech for accessibility
   =================================== */
function readBarcode() {
    speakBarcode(currentBarcode);
}

/* ===================================
   UPDATE UI WITH BARCODE FUNCTION
   Core function to add barcode to table and update display
   Updates counter, table, and latest barcode text
   =================================== */
function updateUIWithBarcode(barcode) {
    // Update latest barcode display at top
    latestBarcodeElement.textContent = barcode ? `Latest Scanned: ${barcode}` : "Latest Scanned: (Empty)";
    
    // Determine the barcode type
    const barcodeType = getBarcodeType(barcode);
    
    // Insert new row at top of table (index 0 = first row)
    const newRow = barcodeListElement.insertRow(0);
    
    // Add barcode value to first column
    const valueCell = newRow.insertCell(0);
    // Add barcode type to second column
    const typeCell = newRow.insertCell(1);
    
    // Set cell values
    valueCell.textContent = barcode || "";
    typeCell.textContent = barcodeType;
    
    // Increment total barcode counter
    barcodeCount++;
    countNumberElement.textContent = barcodeCount;
    
    /* ===================================
       ANIMATE COUNT BADGE
       Removes pop animation and re-adds it to trigger
       Creates visual feedback of count increase
       =================================== */
    countNumberElement.classList.remove('pop');
    setTimeout(() => {
        countNumberElement.classList.add('pop');
    }, 10);  // 10ms delay ensures animation triggers
    
    // Show save CSV button if we have scanned barcodes
    if (barcodeListElement.rows.length > 0) {
        saveCsvButton.style.display = 'block';
    }
}

/* ===================================
   ADD EMPTY BARCODE FUNCTION
   User clicked "Add Empty Barcode" button
   Adds placeholder entry when no barcode found
   =================================== */
function addEmptyBarcode() {
    // Add special marker for empty/not found barcode
    updateUIWithBarcode('NO_BARCODE-00000000');
    playBeep();  // Play confirmation beep
}

/* ===================================
   GET CURRENT DATE TIME FUNCTION
   Generates timestamp string for file naming
   Format: YYYY-MM-DD_PM/AMHHMMSS
   =================================== */
function getCurrentDateTime() {
    const now = new Date();
    
    // Extract date components
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');  // Month is 0-indexed, so add 1
    const day = String(now.getDate()).padStart(2, '0');
    
    // Extract time components
    const hours = String(now.getHours() % 12 || 12).padStart(2, '0');  // Convert to 12-hour format
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    
    // Return formatted timestamp
    return `${year}-${month}-${day}_${ampm}${hours}${minutes}${seconds}`;
}

/* ===================================
   DOWNLOAD CSV FUNCTION
   Exports all scanned barcodes to CSV file
   Collects barcodes and creates downloadable file
   =================================== */
function downloadCSV() {
    // Prompt user for store name
    const storeName = prompt("Please enter the store name:");
    
    // Cancel if user doesn't provide store name
    if (!storeName) {
        alert("Store name is required to save the CSV file.");
        return;
    }
    
    /* ===================================
       COLLECT BARCODES FROM TABLE
       Extracts barcode values from table rows
       =================================== */
    const barcodes = [];
    const rows = barcodeListElement.getElementsByTagName('tr');
    
    // Loop through each row in the table
    for (let i = 0; i < rows.length; i++) {
        // Get barcode value from first column (index 0)
        const barcode = rows[i].getElementsByTagName('td')[0].textContent;
        barcodes.push(barcode);
    }
    
    /* ===================================
       CREATE CSV CONTENT
       Joins barcodes with newlines
       CSV format: one barcode per line
       =================================== */
    const csvContent = "data:text/csv;charset=utf-8," + barcodes.join("\n");
    const encodedUri = encodeURI(csvContent);
    
    /* ===================================
       CREATE & TRIGGER DOWNLOAD
       Creates temporary link and clicks it
       Browser downloads file to user's computer
       =================================== */
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Filename format: StoreName_YYYY-MM-DD_PMHHMMSS.csv
    link.setAttribute("download", `${storeName}_${getCurrentDateTime()}.csv`);
    
    document.body.appendChild(link);
    link.click();  // Trigger download
    document.body.removeChild(link);  // Clean up
}

/* ===================================
   EVENT LISTENER ATTACHMENTS
   Connects buttons to their handler functions
   =================================== */

// Start scanning button
initializeButton.addEventListener('click', initializeCameraAndScanner);

// Save CSV button
saveCsvButton.addEventListener('click', downloadCSV);

// Add empty barcode button
addEmptyBarcodeButton.addEventListener('click', addEmptyBarcode);
