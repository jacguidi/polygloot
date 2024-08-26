let startButton;
let language1Select;
let language2Select;
let transcribedTextElement;
let statusDiv;
let mediaRecorder;
let audioChunks = [];
let stream;

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
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await processAudio(audioBlob, language1, language2);
        };

        mediaRecorder.start();
        updateStatus(`Conversation started between ${ISOToLanguage[language1]} and ${ISOToLanguage[language2]}`);
        startButton.textContent = 'Stop Conversation';
        startButton.onclick = stopConversation;

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
    
    mediaRecorder = null;
    stream = null;
    audioChunks = [];
    
    updateStatus('Conversation stopped');
    startButton.textContent = 'Start Conversation';
    startButton.onclick = startConversation;
}

async function transcribeAudio(audioBlob) {
    try {
        const response = await fetch('/.netlify/functions/deepgram-api', {
            method: 'POST',
            headers: {
                'Content-Type': audioBlob.type || 'audio/wav', // Dynamically set Content-Type
            },
            body: audioBlob // Send the Blob directly
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}. ${errorBody}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            updateStatus(`Transcribed: ${data.text}`);
            document.getElementById('transcribedText').textContent = data.text;
            return data.text;
        } else {
            const errorBody = await response.text();
            throw new Error(`Unexpected response format: ${contentType}. ${errorBody}`);
        }
    } catch (error) {
        console.error('Transcription error:', error);
        updateStatus(`Transcription error: ${error.message}`);
        throw error;
    }
}

async function processAudio(audioBlob, language1, language2) {
    try {
        let transcribedText = await transcribeAudio(audioBlob);
        let detectedLanguage = await detectLanguage(transcribedText);

        if (detectedLanguage !== language1 && detectedLanguage !== language2) {
            throw new Error('Detected language does not match either of the selected languages');
        }

        let targetLanguage = (detectedLanguage === language1) ? language2 : language1;
        let translatedText = await translateText(transcribedText, detectedLanguage, targetLanguage);
        await generateSpeech(translatedText, targetLanguage);

    } catch (error) {
        updateStatus(`Error processing audio: ${error.message}`);
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

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}
