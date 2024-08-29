import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

let startButton;
let language1Select;
let language2Select;
let transcribedTextElement;
let statusDiv;
let mediaRecorder;
let stream;
let isRecording = false;
let live; // Deepgram live client
let silenceTimer;

const SILENCE_THRESHOLD = 1000; // 1 second of silence to trigger processing

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

    const disclaimerPopup = document.getElementById('disclaimerPopup');
    const understandCheckbox = document.getElementById('understandCheckbox');
    const acceptButton = document.getElementById('acceptButton');

    disclaimerPopup.style.display = 'block';

    understandCheckbox.addEventListener('change', function() {
        acceptButton.disabled = !this.checked;
    });

    acceptButton.addEventListener('click', function() {
        disclaimerPopup.style.display = 'none';
        startButton.disabled = false;
    });

    startButton.disabled = true;
    startButton.onclick = toggleConversation;
});

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}

function toggleConversation() {
    if (isRecording) {
        stopConversation();
    } else {
        startConversation();
    }
}

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
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && live) {
                live.send(event.data); // Send audio data to Deepgram WebSocket
            }
        };

        // Initialize Deepgram client for live transcription
        const deepgram = createClient(process.env.DEEPGRAM_API_KEY); // Backend environment variable access
        live = deepgram.listen.live({ model: 'nova-2' });

        live.on(LiveTranscriptionEvents.Open, () => {
            console.log('WebSocket connection opened');
        });

        live.on(LiveTranscriptionEvents.Transcript, (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript) {
                transcribedTextElement.textContent += transcript + ' ';
                processTranscription(transcript, language1, language2);
            }
        });

        live.on(LiveTranscriptionEvents.Error, (error) => {
            console.error('Transcription error:', error);
            updateStatus(`Transcription error: ${error.message}`);
        });

        mediaRecorder.start(100); // Capture in smaller chunks
        isRecording = true;
        updateStatus(`Conversation started between ${ISOToLanguage[language1]} and ${ISOToLanguage[language2]}`);
        startButton.textContent = 'Stop Conversation';

        stream.getTracks()[0].addEventListener('ended', stopConversation);

    } catch (error) {
        updateStatus(`Error: ${error.message}`);
    }
}

function stopConversation() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    
    if (live) {
        live.finish(); // Close the WebSocket connection
    }

    clearTimeout(silenceTimer);
    isRecording = false;
    mediaRecorder = null;
    stream = null;
    audioChunks = [];
    
    updateStatus('Conversation stopped');
    startButton.textContent = 'Start Conversation';
}

async function processTranscription(transcribedText, language1, language2) {
    try {
        let detectedLanguage = await detectLanguage(transcribedText);

        if (detectedLanguage !== language1 && detectedLanguage !== language2) {
            throw new Error('Detected language does not match either of the selected languages');
        }

        let targetLanguage = (detectedLanguage === language1) ? language2 : language1;
        let translatedText = await translateText(transcribedText, detectedLanguage, targetLanguage);
        await generateSpeech(translatedText, targetLanguage);

    } catch (error) {
        updateStatus(`Error processing transcription: ${error.message}`);
    }
}

async function detectLanguage(text) {
    try {
        console.log('Detecting language for:', text);
        const response = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'detectLanguage',
                data: { text: text }
            })
        });

        if (!response.ok) {
            throw new Error(`Language detection failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Detected language:', data.detectedLanguage);
        return data.detectedLanguage;
    } catch (error) {
        console.error('Language detection error:', error);
        updateStatus(`Language detection error: ${error.message}`);
        throw error;
    }
}

async function translateText(text, sourceLanguage, targetLanguage) {
    try {
        const response = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'translate',
                data: {
                    text: text,
                    sourceLanguage: ISOToLanguage[sourceLanguage] || sourceLanguage,
                    targetLanguage: ISOToLanguage[targetLanguage]
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Translation failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        let translatedText = data.translatedText;

        const doubleCheckResponse = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'validateTranslation',
                data: {
                    originalText: text,
                    translatedText: translatedText,
                    sourceLanguage: ISOToLanguage[sourceLanguage] || sourceLanguage,
                    targetLanguage: ISOToLanguage[targetLanguage]
                }
            })
        });

        if (!doubleCheckResponse.ok) {
            throw new Error(`Translation validation failed: ${doubleCheckResponse.status} ${doubleCheckResponse.statusText}`);
        }

        const doubleCheckData = await doubleCheckResponse.json();
        translatedText = doubleCheckData.validatedTranslation;

        updateStatus(`Translated: ${translatedText}`);
        return translatedText;
    } catch (error) {
        console.error('Translation error:', error);
        updateStatus(`Translation error: ${error.message}`);
        throw error;
    }
}

async function generateSpeech(text, language) {
    try {
        const response = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'generateSpeech',
                data: {
                    text: text,
                    language: language,
                    voice: 'alloy'
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Speech generation failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Received audio data:', data.audio.substring(0, 100) + '...');

        if (!data.audio) {
            throw new Error('No audio data received from the server');
        }

        const audioBlob = base64ToBlob(data.audio, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        await audio.play();

        updateStatus(`Speech generated and playing`);
    } catch (error) {
        console.error('Speech generation error:', error);
        updateStatus(`Speech generation error: ${error.message}`);
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}
