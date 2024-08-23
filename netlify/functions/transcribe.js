const axios = require('axios');

exports.handler = async (event) => {
  console.log('Function invoked');

  try {
    // Log the incoming request
    console.log('Request body:', event.body);

    // Parse the incoming request body
    const { audioData } = JSON.parse(event.body);

    // Make sure we have the OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is missing');
    }

    // Make the request to OpenAI API
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        file: audioData,
        model: 'whisper-1',
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    // Log the OpenAI API response
    console.log('OpenAI API response:', response.data);

    // Return the transcription
    return {
      statusCode: 200,
      body: JSON.stringify({ transcription: response.data.text }),
    };
  } catch (error) {
    // Log any errors
    console.error('Error:', error.message);
    console.error('Error stack:', error.stack);

    // If we have an axios error, log the response
    if (error.response) {
      console.error('Error response:', error.response.data);
    }

    // Return an error response
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An error occurred during transcription' }),
    };
  }
};
