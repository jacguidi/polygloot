const fetch = require('node-fetch');
const formidable = require('formidable-serverless'); // Use formidable-serverless for Netlify
const fs = require('fs'); 

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
      const form = formidable({ multiples: true });

      return new Promise((resolve, reject) => {
        form.parse(event, async (err, fields, files) => {
          if (err) {
            console.error('Error parsing form data:', err);
            return resolve({
              statusCode: 400,
              body: JSON.stringify({ error: 'Invalid form data' })
            });
          }

          const action = fields.action;
          const audioFile = files.file; 

          if (!audioFile || !action) {
            return resolve({
              statusCode: 400,
              body: JSON.stringify({ error: 'Missing action or audio file' })
            });
          }

          try {
            const audioBlob = await fs.promises.readFile(audioFile.path);

            const result = await sendDeepgramRequest(audioBlob, deepgramApiKey);
            return resolve({
              statusCode: 200,
              body: JSON.stringify(result)
            });
          } catch (error) {
            console.error('Error processing audio:', error.message);
            return resolve({
              statusCode: 500,
              body: JSON.stringify({ error: error.message || 'Internal Server Error' })
            });
          }
        });
      });
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
