let startButton;
let language1Select;
let language2Select;
let transcribedTextElement;
let statusDiv;
let mediaRecorder;
let audioChunks = [];
let speechEvents;
let stream;
let continuousRecorder;
let preBuffer = [];
let preBufferDuration = 2000; // 2 seconds buffer
let preBufferSize = preBufferDuration / 100; // Calculate buffer size
let isProcessing = false; // Flag to control processing

const languageToISO = {
    "English": "en",
    "Italian": "it",
    "French": "fr",
    "Turkish": "tr",
    "Spanish": "es"
};

const ISOToLanguage = {
    "en": "English",
    "it": "Italian",
    "fr": "French",
    "tr": "Turkish",
    "es": "Spanish"
};

document.addEventListener('DOMContentLoaded', function() {
    startButton = document.getElementById('startButton');
    language1Select = document.getElementById('language1');
    language2Select = document.getElementById('language2');
    transcribedTextElement = document.getElementById('transcribedText');
    statusDiv = document.getElementById('status');

    // Disclaimer popup elements
    const disclaimerPopup = document.getElementById('disclaimerPopup');
    const understandCheckbox = document.getElementById('understandCheckbox');
    const acceptButton = document.getElementById('acceptButton');

    // Show the disclaimer popup when the page loads
    disclaimerPopup.style.display = 'block';

    // Enable/disable the accept button based on checkbox
    understandCheckbox.addEventListener('change', function() {
        acceptButton.disabled = !this.checked;
    });

    // Hide the popup when the user accepts
    acceptButton.addEventListener('click', function() {
        disclaimerPopup.style.display = 'none';
        // Now we can enable the start conversation button
        startButton.disabled = false;
    });

    // Initially disable the start conversation button
    startButton.disabled = true;
    startButton.onclick = startConversation;
});

async function startConversation() {
    if (startButton.disabled) {
        updateStatus('Please accept the disclaimer before starting the conversation.');
        return;
    }

    if (transcribedTextElement) {
        transcribedTextElement.textContent = '';
    }
    const language1 = languageToISO[language1Select.options[language1Select.selectedIndex].text];
    const language2 = languageToISO[language2Select.options[language2Select.selectedIndex].text];

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const options = {
            threshold: -45,
            interval: 50
        };
        speechEvents = hark(stream, options);

        // Create a continuous recording stream for pre-buffering
        continuousRecorder = new MediaRecorder(stream);
        continuousRecorder.ondataavailable = (event) => {
            preBuffer.push(event.data);
            if (preBuffer.length > preBufferSize) {
                preBuffer.shift(); // Keep the buffer at the desired size
            }
        };
        continuousRecorder.start(100); // Capture every 100ms

        let isRecording = false;

        speechEvents.on('speaking', function() {
            if (!isRecording && !isProcessing) { // Check if processing is ongoing
                // Start a new recording and include the pre-buffered audio
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [...preBuffer]; // Start with pre-buffered audio

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                mediaRecorder.onstop = async () => {
                    isProcessing = true; // Set processing flag
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    await processAudio(audioBlob, language1, language2);
                    isProcessing = false; // Reset processing flag after done
                    audioChunks = []; // Clear after processing
                };
                mediaRecorder.start();
                isRecording = true;
                updateStatus('Speaking detected, recording started');
            }
        });

        speechEvents.on('stopped_speaking', function() {
            if (isRecording && mediaRecorder) {
                setTimeout(() => {
                    if (isRecording && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        isRecording = false;
                        updateStatus('Speech pause detected, processing audio');
                    }
                }, 2000); // Adjusted timeout to 2 seconds
            }
        });

        updateStatus(`Conversation started between ${ISOToLanguage[language1]} and ${ISOToLanguage[language2]}`);
        startButton.textContent = 'Stop Conversation';
        startButton.onclick = stopConversation;
    } catch (error) {
        updateStatus(`Error: ${error.message}`);
    }
}

function stopConversation() {
    // Stop the media recorder if it exists
    if (mediaRecorder) {
        mediaRecorder.stop();
    }

    // Stop the continuous recorder if it exists
    if (continuousRecorder) {
        continuousRecorder.stop();
    }

    // Stop the speech events if they exist
    if (speechEvents) {
        speechEvents.stop();
    }

    // Stop all tracks in the audio stream if it exists
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    // Reset all variables
    mediaRecorder = null;
    continuousRecorder = null;
    speechEvents = null;
    stream = null;
    audioChunks = [];
    preBuffer = []; // Reset preBuffer only when the conversation stops

    // Update status and button
    updateStatus('Conversation stopped');
    startButton.textContent = 'Start Conversation';
    startButton.onclick = startConversation;
}

async function processAudio(audioBlob, language1, language2) {
    try {
        const base64Audio = await blobToBase64(audioBlob);

        console.log("Type of base64Audio:", typeof base64Audio);
        console.log("Content of base64Audio:", base64Audio);

        let transcribedText = await transcribeAudio(base64Audio);
        let detectedLanguage = await detectLanguage(transcribedText.text);

        console.log(`Detected language: ${detectedLanguage}, Language1: ${language1}, Language2: ${language2}`);

        if (detectedLanguage !== language1 && detectedLanguage !== language2) {
            updateStatus('Warning: Detected language does not match either of the selected languages. Proceeding with transcription.');
        }

        let targetLanguage = (detectedLanguage === language1) ? language2 : language1;
        const translatedText = await translateText(transcribedText.text, detectedLanguage, targetLanguage);
        await generateSpeech(translatedText, targetLanguage);

    } catch (error) {
        updateStatus(`Error processing audio: ${error.message}`);
        isProcessing = false; // Ensure flag is reset on error
    }
}

async function transcribeAudio(base64Audio) {
    try {
        // Convert base64 to binary string
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const audioBlob = new Blob([bytes.buffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');

        console.log("Transcription request payload:", formData); // Log the formData content

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData
        });

        console.log("Transcription response status:", response.status); // Log response status

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error("Transcription 
