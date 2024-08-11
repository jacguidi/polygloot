let startButton;
let language1Select;
let language2Select;
let transcribedTextElement;
let statusDiv;
let mediaRecorder;
let audioChunks = [];
let speechEvents;
let stream;

const languageToISO = {
    "English": "en",
    "Italian": "it",
    "French": "fr",
    "Turkish": "tr"
};

const ISOToLanguage = {
    "en": "English",
    "it": "Italian",
    "fr": "French",
    "tr": "Turkish"
};

const apiKey = 'sk-zxcqqFnSQPWTEaDuB4FoStpw4dT2IFyHj4vcbzezh0T3BlbkFJ9JLiYWus8qrxjFMP39C7uOeP5kK9OsXbMy5VXMEbYA'; // Replace with your actual OpenAI API key

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
        
        let isRecording = false;

        speechEvents.on('speaking', function() {
            if (!isRecording) {
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    await processAudio(audioBlob, language1, language2);
                };
                mediaRecorder.start();
                audioChunks = [];
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
                }, 1500);
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
    speechEvents = null;
    stream = null;
    audioChunks = [];
    
    // Update status and button
    updateStatus('Conversation stopped');
    startButton.textContent = 'Start Conversation';
    startButton.onclick = startConversation;
}

async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}. ${errorBody}`);
        }

        const data = await response.json();
        updateStatus(`Transcribed: ${data.text}`);
        document.getElementById('transcribedText').textContent = data.text;
        
        return data.text;
    } catch (error) {
        console.error('Transcription error:', error);
        updateStatus(`Transcription error: ${error.message}`);
        throw error;
    }
}

async function detectLanguage(text) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are a language detection tool. Respond only with the ISO 639-1 code of the language of the given text.' },
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Language detection failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim().toLowerCase();
}

async function processAudio(audioBlob, language1, language2) {
    try {
        // Transcribe the audio without assuming a specific language
        let transcribedText = await transcribeAudio(audioBlob);
        
        // Immediately detect the language of the transcription
        let detectedLanguage = await detectLanguage(transcribedText);

        // Ensure that the detected language is either language1 or language2
        if (detectedLanguage !== language1 && detectedLanguage !== language2) {
            throw new Error('Detected language does not match either of the selected languages');
        }

        // Set the target language based on the detected language
        let targetLanguage = (detectedLanguage === language1) ? language2 : language1;

        // Continue with translation and speech generation
        const translatedText = await translateText(transcribedText, detectedLanguage, targetLanguage);
        await generateSpeech(translatedText, targetLanguage);

    } catch (error) {
        updateStatus(`Error processing audio: ${error.message}`);
    }
}

async function translateText(text, sourceLanguage, targetLanguage) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: `You are a professional translator. Translate the following text from ${ISOToLanguage[sourceLanguage] || sourceLanguage} to ${ISOToLanguage[targetLanguage]}. Translate only the provided text, do not add any additional content or commentary.` },
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Translation failed: ${response.statusText}`);
    }

   const data = await response.json();
    let translatedText = data.choices[0].message.content;

    // Double-check the translation
    const doubleCheckResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: `You are a translation validator. Compare the original text and its translation. If the translation contains any additional content not present in the original, remove it. Only return the corrected translation.` },
                { role: 'user', content: `Original (${ISOToLanguage[sourceLanguage] || sourceLanguage}): ${text}\nTranslation (${ISOToLanguage[targetLanguage]}): ${translatedText}` }
            ]
        })
    });

    if (!doubleCheckResponse.ok) {
        throw new Error(`Translation validation failed: ${doubleCheckResponse.statusText}`);
    }

    const doubleCheckData = await doubleCheckResponse.json();
    translatedText = doubleCheckData.choices[0].message.content;

    updateStatus(`Translated: ${translatedText}`);
    return translatedText;
}

async function generateSpeech(text, language) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: 'alloy', // You can change this to other available voices
            language: language
        })
    });

    if (!response.ok) {
        throw new Error(`Speech generation failed: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
    
}

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}
