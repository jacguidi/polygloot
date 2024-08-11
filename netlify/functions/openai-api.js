const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const { action, data } = JSON.parse(event.body);
  const apiKey = process.env.OPENAI_API_KEY;

  let response;
  try {
    switch (action) {
      case 'transcribe':
        response = await transcribeAudio(data, apiKey);
        break;
      case 'detectLanguage':
        response = await detectLanguage(data, apiKey);
        break;
      case 'translate':
        response = await translateText(data.text, data.sourceLanguage, data.targetLanguage, apiKey);
        break;
      case 'generateSpeech':
        response = await generateSpeech(data.text, data.language, apiKey);
        break;
      default:
        throw new Error('Invalid action');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function transcribeAudio(audioBlob, apiKey) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function detectLanguage(text, apiKey) {
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

async function translateText(text, sourceLanguage, targetLanguage, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}.` },
        { role: 'user', content: text }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Translation failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateSpeech(text, language, apiKey) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'alloy',
      language: language
    })
  });

  if (!response.ok) {
    throw new Error(`Speech generation failed: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}
