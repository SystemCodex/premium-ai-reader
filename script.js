// ==========================================
// LÓGICA DEL LECTOR (API OFICIAL + MODELO V2)
// ==========================================

// 1. VARIABLES DE ESTADO
let textChunks = [];
let currentChunkIndex = 0;
let isPlaying = false;
const audioPlayer = new Audio();
const previewPlayer = new Audio();

// 2. CONFIGURACIÓN (CLAVE SK OFICIAL)
// Asegúrate de que esta sea tu clave "sk_..." correcta
const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; 

const MAX_CHUNK_SIZE = 1000; // Tamaño de bloque para ahorrar
let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Voz inicial (Rachel)
let audioCache = {}; // Memoria para no gastar créditos doble
let availableVoices = [];

// 3. INICIALIZAR: CARGAR VOCES AL ABRIR
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
});

async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        // Conexión a API OFICIAL
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': ELEVEN_API_KEY }
        });
        
        if(!response.ok) throw new Error("Fallo de autenticación");
        
        const data = await response.json();
        availableVoices = data.voices;
        select.innerHTML = ''; 

        // Llenar selector
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name;
            if (voice.voice_id === currentVoiceId) option.selected = true;
            select.appendChild(option);
        });

        // Cambio de voz
        select.addEventListener('change', (e) => {
            currentVoiceId = e.target.value;
            clearCache(); // Limpiar caché de audios viejos
            console.log("Voz cambiada a:", e.target.options[e.target.selectedIndex].text);
        });

    } catch (error) {
        console.error(error);
        select.innerHTML = '<option>❌ Clave Incorrecta</option>';
        alert("Error: Tu API Key parece inválida o no tiene permisos.");
    }
}

// 4. PRE-ESCUCHA GRATUITA
document.getElementById('btn-preview-voice').addEventListener('click', () => {
    const selectedId = document.getElementById('voice-select').value;
    const voiceData = availableVoices.find(v => v.voice_id === selectedId);

    if (voiceData && voiceData.preview_url) {
        previewPlayer.src = voiceData.preview_url;
        previewPlayer.play();
    } else {
        alert("Esta voz no tiene vista previa.");
    }
});

function clearCache() {
    audioCache = {};
    console.log("Memoria limpiada.");
}

// 5. CARGAR PDF Y AGRUPAR (Chunking)
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Analizando documento...";
    
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

            // Algoritmo de agrupación inteligente
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
            alert("Error al leer el PDF (Quizás está protegido o es una imagen).");
        }
    };
    reader.readAsArrayBuffer(file);
});

// 6. RENDERIZAR EN PANTALLA
function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="sentence" onclick="jumpTo(${i})">
            ${chunk}
        </div>`
    ).join("");
}

// 7. REPRODUCCIÓN PRINCIPAL
async function playCurrentChunk() {
    if (currentChunkIndex >= textChunks.length) {
        isPlaying = false;
        updatePlayButton();
        return;
    }

    highlightChunk(currentChunkIndex);
    document.getElementById('current-index').innerText = currentChunkIndex + 1;
    
    const btn = document.getElementById('btn-play');
    btn.innerText = "Cargando...";

    try {
        let audioUrl;
        const cacheKey = `${currentChunkIndex}-${currentVoiceId}`;

        // VERIFICAR MEMORIA (Ahorro)
        if (audioCache[cacheKey]) {
            console.log("💰 Usando memoria (Gratis)");
            audioUrl = audioCache[cacheKey];
        } else {
            console.log(`📡 Generando bloque ${currentChunkIndex + 1}...`);
            audioUrl = await fetchAudioOfficial(textChunks[currentChunkIndex]);
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
        console.error("Error:", error);
        isPlaying = false;
        updatePlayButton();
        alert("Error de API: " + error.message);
    }
}

// CONEXIÓN OFICIAL (TEXT-TO-SPEECH)
async function fetchAudioOfficial(textToRead) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVEN_API_KEY, // Header oficial
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: textToRead,
            // CAMBIO IMPORTANTE: Usamos el modelo V2 Multilingüe que sí es gratis
            model_id: "eleven_multilingual_v2", 
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        if (err.detail && err.detail.status === "quota_exceeded") {
            throw new Error("Se acabaron tus créditos gratuitos del mes.");
        }
        throw new Error(err.detail?.message || "Error desconocido");
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

// --- UTILIDADES VISUALES ---
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
