const fetch = require('node-fetch');
const formidable = require('formidable'); // Add formidable to handle form data
const fs = require('fs'); // Add fs module to read files

exports.handler = async function(event, context) {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Ensure the request is a POST request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Deepgram API key is not set' }) };
  }

  // Handle multipart form data
  if (event.headers['content-type'] && event.headers['content-type'].includes('multipart/form-data')) {
    try {
      const form = new formidable.IncomingForm();
      form.keepExtensions = true; // Keeps file extensions
      form.maxFileSize = 10 * 1024 * 1024; // Sets maximum file size to 10MB (adjust as needed)

      // Parse the form data
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
          const audioFile = files.file; // The uploaded audio file

          if (!audioFile || !action) {
            return resolve({
              statusCode: 400,
              body: JSON.stringify({ error: 'Missing action or audio file' })
            });
          }

          try {
            const audioBlob = await fs.promises.readFile(audioFile.filepath);

            // Process the audio with Deepgram
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
    console.log('Sending request to Deepgram API');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/wav', // Adjust based on your audio format
      },
      body: audioBlob,
    });

    const contentType = response.headers.get('content-type');
    console.log('Response Content-Type from Deepgram:', contentType);

    const responseBody = await response.text();
    console.log('Raw Response from Deepgram:', responseBody);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}. Response: ${responseBody}`);
    }

    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Expected JSON response but received: ${contentType}`);
    }

    try {
      return JSON.parse(responseBody);
    } catch (jsonError) {
      throw new Error(`Failed to parse JSON response: ${jsonError.message}. Response: ${responseBody}`);
    }
  } catch (error) {
    console.error('Error in sendDeepgramRequest:', error.message);
    throw error;
  }
}
