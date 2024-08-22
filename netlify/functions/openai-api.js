const fetch = require('node-fetch');
const FormData = require('form-data');

const apiKey = process.env.OPENAI_API_KEY;

exports.handler = async function(event, context) {
  const { action, data } = JSON.parse(event.body);

  try {
    let result;
    console.log(`Processing action: ${action}`); // Log the action being processed
    
    switch (action) {
      case 'transcribe':
        console.log("Action: Transcribe Audio");
        result = await transcribeAudio(data);
        break;
      case 'detectLanguage':
        console.log("Action: Detect Language");
        result = await detectLanguage(data);
        break;
      case 'translate':
        console.log("Action: Translate Text");
        result = await translateText(data.text, data.sourceLanguage, data.targetLanguage);
        break;
      case 'validateTranslation':
        console.log("Action: Validate Translation");
        result = await validateTranslation(data.originalText, data.translatedText, data.sourceLanguage, data.targetLanguage);
        break;
      case 'generateSpeech':
        console.log("Action: Generate Speech");
        result = await generateSpeech(data.text, data.language, data.voice);
        break;
      default:
        throw new Error('Invalid action');
    }

    console.log("Result:", result); // Log the result of the action

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error("Error occurred:", error.message); // Log the error message
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function transcribeAudio(base64Audio) {
  const formData = new FormData();
  const buffer = Buffer.from(base64Audio, 'base64');
  formData.append('file', buffer, { filename: 'audio.wav' });
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { text: data.text };
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
