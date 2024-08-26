const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY; // Use uppercase for environment variables

  if (!deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set.');
  }

  let action = null;

  try {
    const requestBody = JSON.parse(event.body);
    action = requestBody.action;
    const data = requestBody.data;

    if (!data || typeof data !== 'object' || !data.audioBlob) {
      throw new Error('Invalid input data: audioBlob is required and must be an object.');
    }

    const actionHandlers = {
      transcribe: transcribeAudio,
      detectContinuousSpeech: detectContinuousSpeech,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      throw new Error('Invalid action: Action not recognized.');
    }

    const result = await handler(data, deepgramApiKey);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error processing action:', action, error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function sendDeepgramRequest(audioBlob, deepgramApiKey) {
  const contentType = audioBlob.type || 'audio/wav';

  // Ensure audioBlob is handled correctly (Buffer or Stream might be needed)
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramApiKey}`, // Corrected to use 'Token'
      'Content-Type': contentType,
    },
    body: audioBlob, 
  });

  const responseBody = await response.text(); 

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}. Response: ${responseBody}`);
  }

  try {
    return JSON.parse(responseBody);
  } catch (jsonError) {
    throw new Error(`Failed to parse JSON response: ${jsonError.message}. Response: ${responseBody}`);
  }
}

async function transcribeAudio({ audioBlob }, deepgramApiKey) {
  const data = await sendDeepgramRequest(audioBlob, deepgramApiKey);

  if (!data.results || !data.results.channels || !data.results.channels[0].alternatives[0].transcript) {
    throw new Error('Transcription failed: Invalid response format from Deepgram.');
  }

  return { text: data.results.channels[0].alternatives[0].transcript };
}

async function detectContinuousSpeech({ audioBlob }, deepgramApiKey) {
  const data = await sendDeepgramRequest(audioBlob, deepgramApiKey);

  if (!data.results || !data.results.utterances) {
    throw new Error('Continuous speech detection failed: Invalid response format from Deepgram.');
  }

  const utterances = data.results.utterances.map((utterance) => ({
    start: utterance.start,
    end: utterance.end,
    transcript: utterance.transcript,
  }));

  return { utterances };
}
