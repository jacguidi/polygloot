const { Deepgram } = require('@deepgram/sdk');
const multipart = require('parse-multipart-data');
const { Buffer } = require('buffer');

exports.handler = async function (event) {
  console.log('Received event:', JSON.stringify(event, null, 2));
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    console.error('Deepgram API key is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Deepgram API key is not set' }) };
  }

  const deepgram = new Deepgram(deepgramApiKey);

  if (event.headers['content-type'] && event.headers['content-type'].includes('multipart/form-data')) {
    try {
      console.log('Parsing multipart form data');
      const bodyBuffer = Buffer.from(event.body, 'base64');
      const boundary = multipart.getBoundary(event.headers['content-type']);
      const parts = multipart.parse(bodyBuffer, boundary);
      console.log('Parsed parts:', parts.map(part => ({ name: part.name, dataLength: part.data ? part.data.length : 0 })));
      
      let audioFile, action, model;
      for (const part of parts) {
        if (part.name === 'file') {
          audioFile = part.data;
        } else if (part.name === 'action') {
          action = part.data.toString();
        } else if (part.name === 'model') {
          model = part.data.toString();
        }
      }
      
      console.log('Audio file present:', !!audioFile);
      console.log('Action:', action);
      console.log('Model:', model);
      
      if (!audioFile || !action) {
        console.error('Missing action or audio file');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing action or audio file' })
        };
      }

      console.log('Sending request to Deepgram');
      const source = {
        buffer: audioFile,
        mimetype: 'audio/webm'
      };

      const response = await deepgram.transcription.preRecorded(source, {
        smart_format: true,
        model: model || 'nova-2',
        language: 'en-US'
      });

      console.log('Received response from Deepgram');
      return {
        statusCode: 200,
        body: JSON.stringify(response)
      };
    } catch (error) {
      console.error('Error handling multipart data:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
      };
    }
  }
  
  console.error('Unsupported Content-Type');
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unsupported Content-Type' })
  };
};
