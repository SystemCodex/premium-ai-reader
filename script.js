// ==========================================
// CONFIGURACIÓN RAPIDAPI (ELEVENLABS)
// ==========================================
const RAPIDAPI_KEY = "93e18ea0d0msh899294d3fce8356p15e3fcjsn60d8f3c9acf1"; // Tu clave
const RAPIDAPI_HOST = "elevenlabs-api1.p.rapidapi.com";

// Variables de Estado
let textChunks = [];
let currentChunkIndex = 0;
let isPlaying = false;
const audioPlayer = new Audio();
const previewPlayer = new Audio();

// Configuración de Lectura
const MAX_CHUNK_SIZE = 1000; // Caracteres por bloque
let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Voz por defecto (Rachel)
let audioCache = {}; // Memoria Caché
let availableVoices = [];

// 1. INICIALIZAR: CARGAR VOCES AL ABRIR
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
});

// Función adaptada para pedir las voces a RapidAPI
async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        const response = await fetch(`https://${RAPIDAPI_HOST}/v1/voices`, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
        });
        
        if(!response.ok) throw new Error("Error conectando con RapidAPI");
        
        const data = await response.json();
        availableVoices = data.voices;
        select.innerHTML = ''; 

        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name;
            if (voice.voice_id === currentVoiceId) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            currentVoiceId = e.target.value;
            clearCache();
            console.log("Voz cambiada a:", e.target.options[e.target.selectedIndex].text);
        });

    } catch (error) {
        console.error(error);
        select.innerHTML = '<option>Error cargando voces</option>';
    }
}

// 2. PRE-ESCUCHA GRATUITA
document.getElementById('btn-preview-voice').addEventListener('click', () => {
    const selectedId = document.getElementById('voice-select').value;
    const voiceData = availableVoices.find(v => v.voice_id === selectedId);

    if (voiceData && voiceData.preview_url) {
        previewPlayer.src = voiceData.preview_url;
        previewPlayer.play();
    } else {
        alert("Sin vista previa disponible.");
    }
});

function clearCache() {
    audioCache = {};
}

// 3. CARGAR PDF Y AGRUPAR TEXTO
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Procesando PDF vía RapidAPI...";
    
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(" ") + " ";
            }

            // Agrupación de texto (Chunks)
            let rawSentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
            textChunks = [];
            let currentBuffer = "";

            for (let sentence of rawSentences) {
                sentence = sentence.trim();
                if(!sentence) continue;

                if ((currentBuffer.length + sentence.length) < MAX_CHUNK_SIZE) {
                    currentBuffer += sentence + " ";
                } else {
                    if (currentBuffer.length > 0) textChunks.push(currentBuffer.trim());
                    currentBuffer = sentence + " ";
                }
            }
            if (currentBuffer.length > 0) textChunks.push(currentBuffer.trim());

            document.getElementById('total-sentences').innerText = textChunks.length;
            currentChunkIndex = 0;
            renderText();
            clearCache();

        } catch (error) {
            console.error(error);
            alert("Error al leer el PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
});

// 4. MOSTRAR EN PANTALLA
function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="sentence" onclick="jumpTo(${i})">
            ${chunk}
        </div>`
    ).join("");
}

// 5. REPRODUCIR (Lógica Principal)
async function playCurrentChunk() {
    if (currentChunkIndex >= textChunks.length) {
        isPlaying = false;
        updatePlayButton();
        return;
    }

    highlightChunk(currentChunkIndex);
    document.getElementById('current-index').innerText = currentChunkIndex + 1;
    
    const btn = document.getElementById('btn-play');
    btn.innerText = "Cargando audio...";

    try {
        let audioUrl;
        const cacheKey = `${currentChunkIndex}-${currentVoiceId}`;

        if (audioCache[cacheKey]) {
            console.log("💰 Usando Caché (RapidAPI)");
            audioUrl = audioCache[cacheKey];
        } else {
            console.log(`📡 Solicitando a RapidAPI bloque ${currentChunkIndex + 1}...`);
            audioUrl = await fetchAudioFromRapidAPI(textChunks[currentChunkIndex]);
            audioCache[cacheKey] = audioUrl;
        }
        
        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = parseFloat(document.getElementById('speed-select').value);
        
        await audioPlayer.play();
        btn.innerText = "⏸ Pausa";

        audioPlayer.onended = () => {
            if (isPlaying) {
                currentChunkIndex++;
                playCurrentChunk();
            }
        };

    } catch (error) {
        console.error("Error reproducción:", error);
        isPlaying = false;
        updatePlayButton();
        alert("Error: " + error.message);
    }
}

// ==========================================
// FUNCIÓN CRÍTICA: CONEXIÓN CON RAPIDAPI
// ==========================================
async function fetchAudioFromRapidAPI(textToRead) {
    // Nota: Cambiamos 'sound-generation' por 'text-to-speech' que es lo correcto para leer
    const url = `https://${RAPIDAPI_HOST}/v1/text-to-speech/${currentVoiceId}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY
        },
        body: JSON.stringify({
            text: textToRead,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Error en RapidAPI");
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

// --- UTILIDADES ---
function highlightChunk(index) {
    document.querySelectorAll('.sentence').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`chunk-${index}`);
    if (el) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    btn.innerText = isPlaying ? "⏸ Pausa" : "▶ Reproducir";
}

document.getElementById('btn-play').addEventListener('click', () => {
    if (textChunks.length === 0) return alert("Sube un PDF primero");
    if (isPlaying) {
        isPlaying = false;
        audioPlayer.pause();
    } else {
        isPlaying = true;
        if (audioPlayer.paused && audioPlayer.src) audioPlayer.play();
        else playCurrentChunk();
    }
    updatePlayButton();
});

document.getElementById('btn-next').addEventListener('click', () => {
    currentChunkIndex++;
    if(isPlaying) playCurrentChunk();
});

document.getElementById('btn-prev').addEventListener('click', () => {
    if(currentChunkIndex > 0) currentChunkIndex--;
    if(isPlaying) playCurrentChunk();
});

document.getElementById('speed-select').addEventListener('change', (e) => {
    audioPlayer.playbackRate = parseFloat(e.target.value);
});

window.jumpTo = (index) => {
    currentChunkIndex = index;
    isPlaying = true;
    playCurrentChunk();
    updatePlayButton();
};

document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});
