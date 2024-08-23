// Import necessary modules
const hark = require('hark');
const axios = require('axios');

// Initialize state variables
let isRecording = false;
let recognitionStream;
let language1 = 'en'; // Default language 1 (English)
let language2 = 'es'; // Default language 2 (Spanish)

// Setup event listeners for DOM elements
document.getElementById('startButton').addEventListener('click', startConversation);
document.getElementById('language1').addEventListener('change', (e) => language1 = mapLanguageCode(e.target.value));
document.getElementById('language2').addEventListener('change', (e) => language2 = mapLanguageCode(e.target.value));

// Function to map language names to language codes for OpenAI API
function mapLanguageCode(language) {
    switch(language) {
        case 'English': return 'en';
        case 'Italian': return 'it';
        case 'French': return 'fr';
        case 'Spanish': return 'es';
        case 'Turkish': return 'tr';
        default: return 'en'; // Default to English if something goes wrong
    }
}

// Get references to the checkbox and button for the disclaimer
const understandCheckbox = document.getElementById('understandCheckbox');
const acceptButton = document.getElementById('acceptButton');
const disclaimerPopup = document.getElementById('disclaimerPopup');

// Enable button when checkbox is checked
understandCheckbox.addEventListener('change', function() {
    if (this.checked) {
        acceptButton.disabled = false;
    } else {
        acceptButton.disabled = true;
    }
});

// Handle the click event on the "Start Chatting" button
acceptButton.addEventListener('click', function() {
    // Hide the popup
    disclaimerPopup.style.display = 'none';

    // Start the conversation (or any other initializations you want to trigger)
    startConversation();
});

// Optionally, you can make the popup appear when the page loads
window.onload = function() {
    disclaimerPopup.style.display = 'flex';
};

// Function to start the conversation
async function startConversation() {
    if (isRecording) return;

    isRecording = true;
    updateStatus('Listening...');

    try {
        const stream = await getUserMediaStream();
        recognitionStream = hark(stream);

        recognitionStream.on('speaking', () => {
            updateStatus('Processing...');
        });

        recognitionStream.on('stopped_speaking', async () => {
            const audioBlob = await getAudioBlob(stream);
            const detectedLanguage = await detectLanguage(audioBlob);
            const transcription = await transcribeAudio(audioBlob, detectedLanguage);
            const translation = await translateText(transcription, detectedLanguage);
            displayTranscription(translation);
            updateStatus('Listening...');
        });
    } catch (error) {
        console.error('Error during conversation:', error);
        updateStatus('Error occurred, please try again.');
        isRecording = false;
    }
}

// Function to get the user's microphone stream
async function getUserMediaStream() {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
}

// Function to convert audio stream to Blob
async function getAudioBlob(stream) {
    const mediaRecorder = new MediaRecorder(stream);
    let audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            resolve(audioBlob);
        };

        setTimeout(() => {
            mediaRecorder.stop();
        }, 4000); // Stop recording after 4 seconds
        mediaRecorder.start();
    });
}

// Function to detect language using OpenAI API (or a different service)
async function detectLanguage(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    const response = await axios.post('/.netlify/functions/detect-language', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    return response.data.language; // Returns the detected language code
}

// Function to transcribe audio using OpenAI API
async function transcribeAudio(audioBlob, detectedLanguage) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', detectedLanguage);

    const response = await axios.post('/.netlify/functions/transcribe', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    return response.data.transcription;
}

// Function to translate text using OpenAI API
async function translateText(text, detectedLanguage) {
    // Determine target language based on detected language
    const targetLanguage = detectedLanguage === language1 ? language2 : language1;

    const response = await axios.post('/.netlify/functions/translate', {
        text: text,
        targetLanguage: targetLanguage
    });

    return response.data.translation;
}

// Function to update the status on the UI
function updateStatus(status) {
    document.getElementById('status').innerText = status;
}

// Function to display the transcribed and translated text
function displayTranscription(text) {
    document.getElementById('transcribedText').innerText = text;
}
