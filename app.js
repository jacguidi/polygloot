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
            if (!isRecording) {
                // Start a new recording and include the pre-buffered audio
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [...preBuffer]; // Start with pre-buffered audio

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    await (audioBlob, language1, language2);
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

        // Reset the audioChunks for the next turn
        audioChunks = [];

    } catch (error) {
        updateStatus(`Error processing audio: ${error.message}`);
    }
}

async function transcribeAudio(base64Audio) {
    try {
        // Make a request to the Netlify serverless function to handle the transcription
        const response = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'transcribe',
                data: base64Audio
            })
        });

        if (!response.ok) {
            const errorResponse = await response.text();
            console.error(`Transcription API Error: ${errorResponse}`);
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return { text: data.text };
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

// Helper function to convert Blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function detectLanguage(text) {
    try {
        const response = await fetch('/.netlify/functions/openai-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'detectLanguage',
                data: text
            })
        });

        if (!response.ok) {
            throw new Error(`Language detection failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
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

        // Double-check the translation
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

// Add this helper function to convert base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}
