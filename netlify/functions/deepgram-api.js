const fetch = require('node-fetch');
const multipart = require('parse-multipart-data');
const { Buffer } = require('buffer');

exports.handler = async function (event) {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Deepgram API key is not set' }) };
  }

  if (event.headers['content-type'] && event.headers['content-type'].includes('multipart/form-data')) {
    try {
      const bodyBuffer = Buffer.from(event.body, 'base64');
      const boundary = multipart.getBoundary(event.headers['content-type']);
      const parts = multipart.parse(bodyBuffer, boundary);

      let audioFile, action;
      for (const part of parts) {
        if (part.name === 'file') {
          audioFile = part.data;
        } else if (part.name === 'action') {
          action = part.data.toString();
        }
      }

      if (!audioFile || !action) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing action or audio file' })
        };
      }

      const result = await sendDeepgramRequest(audioFile, deepgramApiKey);
      return {
        statusCode: 200,
        body: JSON.stringify(result)
      };
    } catch (error) {
      console.error('Error handling multipart data:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      };
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unsupported Content-Type' })
  };
};

async function sendDeepgramRequest(audioBlob, deepgramApiKey) {
  const url = 'https://api.deepgram.com/v1/listen';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/wav', 
      },
      body: audioBlob,
    });
    const contentType = response.headers.get('content-type');
    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}. Response: ${responseBody}`);
    }
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Expected JSON response but received: ${contentType}`);
    }
    return JSON.parse(responseBody);
  } catch (error) {
    console.error('Error in sendDeepgramRequest:', error.message);
    throw error;
  }
}
