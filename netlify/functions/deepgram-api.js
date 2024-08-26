const fetch = require('node-fetch');

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

if (!deepgramApiKey) {
  throw new Error('DEEPGRAM_API_KEY environment variable is not set.');
}

exports.handler = async function(event, context) {
  const { action, data } = JSON.parse(event.body);

  try {
    const actionHandlers = {
      transcribe: transcribeAudio,
      detectContinuousSpeech: detectContinuousSpeech,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      throw new Error('Invalid action');
    }

    const result = await handler(data);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function deepgramApiRequest(payload) {
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepgramApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function transcribeAudio(base64Audio) {
  const data = await deepgramApiRequest({
    audio: base64Audio,
    encoding: 'linear16',
    sample_rate: 16000,
    language: 'en-US',
    model: 'general',
    punctuation: true,
  });

  return { text: data.results.channels[0].alternatives[0].transcript };
}

async function detectContinuousSpeech(base64Audio) {
  const data = await deepgramApiRequest({
    audio: base64Audio,
    encoding: 'linear16',
    sample_rate: 16000,
    language: 'en-US',
    model: 'general',
    detect_language: true,
    diarize: true,
    utterances: true,
  });

  const utterances = data.results.utterances.map((utterance) => ({
    start: utterance.start,
    end: utterance.end,
    transcript: utterance.transcript,
  }));

  return { utterances };
}

