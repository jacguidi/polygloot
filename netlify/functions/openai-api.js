const fetch = require('node-fetch');
const FormData = require('form-data');

const apiKey = process.env.OPENAI_API_KEY;

console.log = (...args) => args.forEach(arg => console.error(typeof arg === 'object' ? JSON.stringify(arg) : arg));

exports.handler = async function(event, context) {  // Ensure the handler function is async
  console.log('Received event:', event);
  console.log('Event body:', event.body);
  
  let action, data;
  try {
    const parsedBody = JSON.parse(event.body);
    console.log('Parsed body:', parsedBody);
    action = parsedBody.action;
    data = parsedBody.data;
  } catch (error) {
    console.log('Error parsing body:', error);
    console.log('Raw body:', event.body);
    // If parsing fails, assume the body is the audio data for transcription
    action = 'transcribe';
    data = event.body;
  }

  try {
    let result;
    console.log(`Processing action: ${action}`);
    
    switch (action) {
      case 'transcribe':
        console.log("Action: Transcribe Audio");
        result = await transcribeAudio(data);  // Ensure async/await is used correctly
        break;
      // ... other cases remain the same ...
      default:
        throw new Error('Invalid action');
    }

    console.log("Result:", result);

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error("Error occurred:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function transcribeAudio(base64Audio) {  // Mark the function as async
  console.log("Starting transcription process");
  console.log("Base64 audio length:", base64Audio.length);

  const formData = new FormData();
  const buffer = Buffer.from(base64Audio, 'base64');
  formData.append('file', buffer, { filename: 'audio.wav' });
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  console.log("Transcription request payload:", formData);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {  // await used correctly
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  console.log("Transcription response status:", response.status);

  if (!response.ok) {
    const errorDetails = await response.text();
    console.error("Transcription failed details:", errorDetails);
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();  // await used correctly
  console.log("Transcription result:", data);
  return { text: data.text };
}

// Other async functions should follow the same pattern:
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
    throw new Error(`Language detection failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { detectedLanguage: data.choices[0].message.content.trim().toLowerCase() };
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
        { role: 'system', content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Translate only the provided text, do not add any additional content or commentary.` },
        { role: 'user', content: text }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Translation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { translatedText: data.choices[0].message.content };
}

async function validateTranslation(originalText, translatedText, sourceLanguage, targetLanguage) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `You are a translation validator. Compare the original text and its translation. If the translation contains any additional content not present in the original, remove it. Only return the corrected translation.` },
        { role: 'user', content: `Original (${sourceLanguage}): ${originalText}\nTranslation (${targetLanguage}): ${translatedText}` }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Translation validation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { validatedTranslation: data.choices[0].message.content };
}

async function generateSpeech(text, language, voice) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      language: language
    })
  });

  if (!response.ok) {
    throw new Error(`Speech generation failed: ${response.status} ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const base64Audio = Buffer.from(audioBuffer).toString('base64');
  return { audio: base64Audio };
}
