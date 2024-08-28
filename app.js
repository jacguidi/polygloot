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
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
            await processAudio(audioBlob, language1, language2);
        };

        mediaRecorder.start(1000);
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
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'general');
        formData.append('action', 'transcribe'); 

        console.log('Sending request with:', 
            Array.from(formData.entries()).map(e => `${e[0]}: ${e[1] instanceof Blob ? 'Blob' : e[1]}`));

        const response = await fetch('/.netlify/functions/deepgram-api', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}. ${errorBody}`);
        }

        const data = await response.json();
        if (data.results && data.results.channels && data.results.channels[0].alternatives) {
            const transcript = data.results.channels[0].alternatives[0].transcript;
            updateStatus(`Transcribed: ${transcript}`);
            document.getElementById('transcribedText').textContent = transcript;
            return transcript;
        } else {
            throw new Error('Unexpected response format from Deepgram API');
        }
    } catch (error) {
        console.error('Transcription error:', error);
        updateStatus(`Transcription error: ${error.message}`);
        throw error;
    }
}
