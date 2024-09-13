const fetch = require('node-fetch');
const FormData = require('form-data');

const apiKey = process.env.OPENAI_API_KEY;

exports.handler = async function(event, context) {
  const { action, data } = JSON.parse(event.body);

  try {
    let result;
    switch (action) {
      case 'transcribe':
        result = await transcribeAudio(data);
        break;
      case 'detectLanguage':
        result = await detectLanguage(data);
        break;
      case 'translate':
        result = await translateText(data.text, data.sourceLanguage, data.targetLanguage);
        break;
      case 'validateTranslation':
        result = await validateTranslation(data.originalText, data.translatedText, data.sourceLanguage, data.targetLanguage);
        break;
      case 'generateSpeech':
        result = await generateSpeech(data.text, data.language, data.voice);
        break;
      default:
        throw new Error('Invalid action');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error in handler:', error);
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
    const errorText = await response.text();
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}. ${errorText}`);
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
    const errorText = await response.text();
    throw new Error(`Language detection failed: ${response.status} ${response.statusText}. ${errorText}`);
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
    const errorText = await response.text();
    throw new Error(`Translation failed: ${response.status} ${response.statusText}. ${errorText}`);
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
    const errorText = await response.text();
    throw new Error(`Translation validation failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  const data = await response.json();
  return { validatedTranslation: data.choices[0].message.content };
}

async function generateSpeech(text, language, voice) {
  try {
    // Adjust the language code if necessary
    const languageCode = getOpenAILanguageCode(language);

    // Prepare the request payload
    const payload = {
      input: {
        text: text
      },
      voice: {
        language_code: languageCode,
        name: voice || getDefaultVoiceName(languageCode),
        ssml_gender: 'NEUTRAL'
      },
      audio_config: {
        audio_encoding: 'LINEAR16' // WAV format
      }
    };

    // Call OpenAI's Text-to-Speech API
    const response = await fetch('https://api.openai.com/v1/audio/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Speech generation failed: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const data = await response.json();

    // The API returns audio content in base64
    const base64Audio = data.audio_content;

    return { audio: base64Audio };
  } catch (error) {
    console.error('Error generating speech:', error);
    throw new Error(`Speech generation failed: ${error.message}`);
  }
}

// Helper function to map ISO codes to OpenAI language codes
function getOpenAILanguageCode(isoCode) {
  const languageMap = {
    'en': 'en-US',
    'it': 'it-IT',
    'fr': 'fr-FR',
    'tr': 'tr-TR',
    'es': 'es-ES'
  };
  return languageMap[isoCode] || 'en-US';
}

// Helper function to get default voice names
function getDefaultVoiceName(languageCode) {
  const voiceMap = {
    'en-US': 'en-US-Standard-D',
    'it-IT': 'it-IT-Standard-A',
    'fr-FR': 'fr-FR-Standard-A',
    'tr-TR': 'tr-TR-Standard-A',
    'es-ES': 'es-ES-Standard-A'
  };
  return voiceMap[languageCode] || 'en-US-Standard-D';
}
