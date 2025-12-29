const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// SERVIMOS LA CARPETA ACTUAL (RAÍZ) COMO ESTÁTICA
app.use(express.static(__dirname));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint para convertir Texto a Audio
app.post('/api/read', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Falta el texto' });
        }

        // Configuración para RapidAPI / ElevenLabs
        const options = {
            method: 'POST',
            url: 'https://elevenlabs-api1.p.rapidapi.com/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', // Voz: Rachel
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'elevenlabs-api1.p.rapidapi.com',
                'x-rapidapi-key': process.env.ELEVEN_API_KEY
            },
            data: {
                text: text,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            responseType: 'arraybuffer' // Crucial para recibir audio
        };

        console.log("Generando audio para:", text.substring(0, 20) + "...");
        const response = await axios.request(options);

        res.set('Content-Type', 'audio/mpeg');
        res.send(response.data);

    } catch (error) {
        console.error('Error en API ElevenLabs:', error.message);
        if(error.response) console.error(error.response.data);
        res.status(500).json({ error: 'Error al generar el audio' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en: http://localhost:${PORT}`);
});
