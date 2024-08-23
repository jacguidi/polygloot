// Initialize state variables
let isRecording = false;
let recognitionStream;
let language1 = 'en'; // Default language 1 (English)
let language2 = 'es'; // Default language 2 (Spanish)

// Get references to DOM elements
const understandCheckbox = document.getElementById('understandCheckbox');
const acceptButton = document.getElementById('acceptButton');
const disclaimerPopup = document.getElementById('disclaimerPopup');
const startButton = document.getElementById('startButton');
const status = document.getElementById('status');
const transcribedText = document.getElementById('transcribedText');

// Setup event listeners
document.getElementById('language1').addEventListener('change', (e) => language1 = mapLanguageCode(e.target.value));
document.getElementById('language2').addEventListener('change', (e) => language2 = mapLanguageCode(e.target.value));

// Enable "Start Chatting" button when checkbox is checked
understandCheckbox.addEventListener('change', function() {
    acceptButton.disabled = !this.checked;
});

// Handle the click event on the "Start Chatting" button in the disclaimer
acceptButton.addEventListener('click', function() {
    disclaimerPopup.style.display = 'none';
    startButton.disabled = false;
});

// Make the disclaimer popup appear when the page loads
window.onload = function() {
    disclaimerPopup.style.display = 'flex';
    startButton.disabled = true;
};

// Handle the click event on the main "Start the Conversation" button
startButton.addEventListener('click', startConversation);

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

    const response = await fetch('/.netlify/functions/detect-language', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    return data.language; // Returns the detected language code
}

// Function to transcribe audio using OpenAI API
async function transcribeAudio(audioBlob, detectedLanguage) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', detectedLanguage);

    const response = await fetch('/.netlify/functions/transcribe', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    return data.transcription;
}

// Function to translate text using OpenAI API
async function translateText(text, detectedLanguage) {
    // Determine target language based on detected language
    const targetLanguage = detectedLanguage === language1 ? language2 : language1;

    const response = await fetch('/.netlify/functions/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            targetLanguage: targetLanguage
        })
    });

    const data = await response.json();
    return data.translation;
}

// Function to update the status on the UI
function updateStatus(message) {
    status.innerText = message;
}

// Function to display the transcribed and translated text
function displayTranscription(text) {
    transcribedText.innerText = text;
}
