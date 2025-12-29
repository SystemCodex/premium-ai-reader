// ==========================================
// AI READER PRO - LÓGICA COMPLETA
// ==========================================

let textChunks = [];
let currentChunkIndex = 0;
let isPlaying = false;
const audioPlayer = new Audio();
// Permitir que el canvas lea el audio
audioPlayer.crossOrigin = "anonymous"; 
const previewPlayer = new Audio();

// --- CONFIGURACIÓN ---
const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; 
const MAX_CHUNK_SIZE = 1000; 

let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; 
let audioCache = {}; // Cache de URLs
let blobCache = {};  // Cache de Archivos físicos (para descarga)
let availableVoices = [];

// VARIABLES DEL VISUALIZADOR
let audioContext;
let analyser;
let source;
let canvas, ctx;
let animationId;

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
    initVisualizer(); // Preparar canvas
    
    // Auto-Save: Recuperar índice
    const savedIndex = localStorage.getItem('lastChunkIndex');
    if(savedIndex) console.log("Progreso previo detectado:", savedIndex);
});

async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': ELEVEN_API_KEY }
        });
        
        if(!response.ok) throw new Error("API Key inválida");
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
        });
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option>Error de conexión</option>';
    }
}

document.getElementById('btn-preview-voice').addEventListener('click', () => {
    const selectedId = document.getElementById('voice-select').value;
    const voiceData = availableVoices.find(v => v.voice_id === selectedId);
    if (voiceData?.preview_url) {
        previewPlayer.src = voiceData.preview_url;
        previewPlayer.play();
    } else {
        alert("Sin vista previa.");
    }
});

function clearCache() {
    audioCache = {};
    blobCache = {};
    document.getElementById('btn-download-all').style.display = 'none';
}

// 2. CARGA PDF
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Procesando para lectura confortable...";
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

            // Contador de caracteres
            const totalChars = fullText.length;
            document.getElementById('char-count').innerText = totalChars.toLocaleString();
            document.getElementById('quota-info').style.display = "inline-block";

            // Chunking
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
            
            // Reiniciar progreso
            currentChunkIndex = 0;
            localStorage.setItem('lastChunkIndex', 0);

            renderText();
            clearCache();
            
        } catch (error) {
            console.error(error);
            alert("Error al leer PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
});

function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="sentence" onclick="jumpTo(${i})">
            ${chunk}
            <a id="download-${i}" class="download-link" style="display:none">⬇️ Guardar Bloque</a>
        </div>`
    ).join("");
}

// 3. REPRODUCIR
async function playCurrentChunk() {
    // Iniciar contexto de audio para el visualizador si no existe
    if (!audioContext) setupAudioContext();

    if (currentChunkIndex >= textChunks.length) {
        isPlaying = false;
        updatePlayButton();
        cancelAnimationFrame(animationId);
        drawIdleVisualizer();
        return;
    }

    highlightChunk(currentChunkIndex);
    document.getElementById('current-index').innerText = currentChunkIndex + 1;
    localStorage.setItem('lastChunkIndex', currentChunkIndex); // Auto-Save

    const btn = document.getElementById('btn-play');
    btn.innerText = "CARGANDO...";

    try {
        let audioUrl;
        const cacheKey = `${currentChunkIndex}-${currentVoiceId}`;

        if (audioCache[cacheKey]) {
            audioUrl = audioCache[cacheKey];
        } else {
            const blob = await fetchAudioOfficial(textChunks[currentChunkIndex]);
            blobCache[cacheKey] = blob;
            audioUrl = URL.createObjectURL(blob);
            audioCache[cacheKey] = audioUrl;
        }
        
        enableDownloadLink(currentChunkIndex, audioUrl);
        if(Object.keys(blobCache).length > 0) {
            document.getElementById('btn-download-all').style.display = 'inline-block';
        }

        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = parseFloat(document.getElementById('speed-select').value);
        
        await audioPlayer.play();
        btn.innerText = "PAUSA";
        
        // Arrancar visualizador
        visualize();

        audioPlayer.onended = () => {
            if (isPlaying) {
                currentChunkIndex++;
                playCurrentChunk();
            } else {
                cancelAnimationFrame(animationId);
                drawIdleVisualizer();
            }
        };

    } catch (error) {
        console.error("Error:", error);
        isPlaying = false;
        updatePlayButton();
        alert("Error: " + error.message);
    }
}

async function fetchAudioOfficial(textToRead) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVEN_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: textToRead,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        if (err.detail && err.detail.status === "quota_exceeded") throw new Error("Sin créditos.");
        throw new Error(err.detail?.message || "Error");
    }
    return await response.blob();
}

// 4. DESCARGA UNIFICADA
document.getElementById('btn-download-all').addEventListener('click', () => {
    const blobsToMerge = [];
    for(let i = 0; i < textChunks.length; i++) {
        const key = `${i}-${currentVoiceId}`;
        if(blobCache[key]) blobsToMerge.push(blobCache[key]);
    }
    if(blobsToMerge.length === 0) return alert("Nada para descargar aún.");

    const mergedBlob = new Blob(blobsToMerge, { type: 'audio/mpeg' });
    const mergedUrl = URL.createObjectURL(mergedBlob);
    const a = document.createElement('a');
    a.href = mergedUrl;
    a.download = `Audiolibro_Completo.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// ==========================================
// 5. VISUALIZADOR DE AUDIO (CANVAS)
// ==========================================
function initVisualizer() {
    canvas = document.getElementById('audio-visualizer');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    drawIdleVisualizer();
}

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function setupAudioContext() {
    // Crear contexto (requiere gesto de usuario previo, que es el click en play)
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 256;
}

function visualize() {
    if (!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const centerY = canvas.height / 2;

    function renderFrame() {
        if (!isPlaying) return;
        animationId = requestAnimationFrame(renderFrame);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Línea de onda
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#38bdf8'; // Color Accent
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * (canvas.height / 3.5)) + (centerY - 25); // Posicionar

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
        }
        
        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        // Partículas (reaccionan a bajos)
        const bass = dataArray[5]; 
        if (bass > 140) { // Umbral de bajos
            ctx.beginPath();
            const pX = Math.random() * canvas.width;
            const pY = centerY + (Math.random() * 40 - 20);
            const size = Math.random() * 3;
            ctx.arc(pX, pY, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 189, 248, ${Math.random() * 0.8})`;
            ctx.fill();
        }
    }
    renderFrame();
}

function drawIdleVisualizer() {
    if(!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.strokeStyle = '#334155'; // Línea recta gris
    ctx.lineWidth = 1;
    ctx.stroke();
}

// HELPERS UI
function highlightChunk(index) {
    document.querySelectorAll('.sentence').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`chunk-${index}`);
    if (el) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function enableDownloadLink(index, url) {
    const link = document.getElementById(`download-${index}`);
    if(link) {
        link.href = url;
        link.download = `bloque_${index}.mp3`;
        link.style.display = "inline-block";
    }
}

function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    if(isPlaying) {
        btn.innerText = "PAUSA";
        btn.style.backgroundColor = "#e2e8f0";
        btn.style.color = "#0f172a";
    } else {
        btn.innerText = "REPRODUCIR";
        btn.style.backgroundColor = "#38bdf8";
    }
}

// LISTENERS
document.getElementById('btn-play').addEventListener('click', () => {
    if (textChunks.length === 0) return alert("Sube un PDF");
    
    // Reactivar AudioContext si estaba suspendido (política de navegadores)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (isPlaying) {
        isPlaying = false;
        audioPlayer.pause();
        cancelAnimationFrame(animationId);
        drawIdleVisualizer();
    } else {
        isPlaying = true;
        if (audioPlayer.paused && audioPlayer.src) {
            audioPlayer.play();
            visualize();
        } else {
            playCurrentChunk();
        }
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
