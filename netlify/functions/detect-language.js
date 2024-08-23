const axios = require('axios');

exports.handler = async function(event) {
    const formData = new FormData();
    formData.append('file', event.body.file, 'audio.webm');

    const response = await axios.post('https://api.openai.com/v1/audio/detect-language', formData, {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'multipart/form-data'
        }
    });

    return {
        statusCode: 200,
        body: JSON.stringify({ language: response.data.language })
    };
};
