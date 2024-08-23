const axios = require('axios');

exports.handler = async function(event) {
    const formData = new FormData();
    formData.append('file', event.body.file, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', event.body.language);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'multipart/form-data'
        }
    });

    return {
        statusCode: 200,
        body: JSON.stringify({ transcription: response.data.text })
    };
};
