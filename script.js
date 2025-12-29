// ==========================================
// AI READER PRO - SPLIT VIEW SYNC
// ==========================================

let textChunks = []; // Array de objetos: { text: "...", page: 1 }
let currentChunkIndex = 0;
let isPlaying = false;
let pdfDoc = null; // Guardamos el documento PDF globalmente

const audioPlayer = new Audio();
audioPlayer.crossOrigin = "anonymous"; 
const previewPlayer = new Audio();

const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; 
const MAX_CHUNK_SIZE = 800; // Un poco menos para mayor precisión de página

let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; 
let audioCache = {}; 
let blobCache = {};
let availableVoices = [];

// VISUALIZADOR
let audioContext, analyser, canvas, ctx, particles = [];

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
    initParticleSystem();
    
    // Auto-Save no se ejecuta hasta cargar PDF para evitar errores de sync
});

async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': ELEVEN_API_KEY }
        });
        if(!response.ok) throw new Error("API Key error");
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
    } catch (e) { console.error(e); }
}

function clearCache() {
    audioCache = {}; blobCache = {};
    document.getElementById('btn-download-all').style.display = 'none';
}

// 2. CARGA INTELIGENTE DEL PDF (Mapeo Texto -> Página)
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Escaneando y Sincronizando...";
    
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            pdfDoc = await pdfjsLib.getDocument(typedarray).promise; // Guardar Global
            
            textChunks = []; // Reiniciar
            let totalChars = 0;

            // Recorremos página por página para saber de dónde viene el texto
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(" ") + " ";
                totalChars += pageText.length;

                // Chunking por página
                let rawSentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
                let currentBuffer = "";

                for (let sentence of rawSentences) {
                    sentence = sentence.trim();
                    if(!sentence) continue;
                    
                    if ((currentBuffer.length + sentence.length) < MAX_CHUNK_SIZE) {
                        currentBuffer += sentence + " ";
                    } else {
                        if (currentBuffer.length > 0) {
                            // AQUÍ ESTÁ LA MAGIA: Guardamos texto Y número de página
                            textChunks.push({ text: currentBuffer.trim(), page: i });
                        }
                        currentBuffer = sentence + " ";
                    }
                }
                if (currentBuffer.length > 0) {
                    textChunks.push({ text: currentBuffer.trim(), page: i });
                }
            }

            document.getElementById('char-count').innerText = totalChars.toLocaleString();
            document.getElementById('quota-info').style.display = "inline-block";
            document.getElementById('total-sentences').innerText = textChunks.length;
            
            currentChunkIndex = 0;
            renderText();
            
            // Renderizar la primera página del PDF en el visor derecho
            renderPdfPage(1);

        } catch (error) {
            console.error(error);
            alert("Error al procesar PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
});

// Renderizar lista de texto (Izquierda)
function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="sentence" onclick="jumpTo(${i})">
            <span style="opacity:0.5; font-size:0.8em">[Pg ${chunk.page}]</span> ${chunk.text}
            <a id="download-${i}" class="download-link" style="display:none">⬇️ Guardar</a>
        </div>`
    ).join("");
}

// Renderizar PDF Visual (Derecha)
let currentRenderedPage = 0;
async function renderPdfPage(pageNum) {
    if(!pdfDoc || pageNum === currentRenderedPage) return; // Evitar re-render si es la misma pág
    
    currentRenderedPage = pageNum;
    document.getElementById('pdf-page-num').innerText = pageNum;

    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('the-pdf-canvas');
    const ctx = canvas.getContext('2d');
    
    // Ajustar escala para que quepa en el contenedor
    const containerWidth = document.getElementById('pdf-canvas-container').clientWidth - 40;
    const viewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale: scale });

    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;

    const renderContext = {
        canvasContext: ctx,
        viewport: scaledViewport
    };
    await page.render(renderContext).promise;
}

// 3. REPRODUCIR Y SINCRONIZAR
async function playCurrentChunk() {
    if (!audioContext) setupAudioContext();

    if (currentChunkIndex >= textChunks.length) {
        isPlaying = false;
        updatePlayButton();
        return;
    }

    // 1. Resaltar Texto (Izquierda)
    highlightChunk(currentChunkIndex);
    
    // 2. SINCRONIZAR PDF (Derecha) - Cambiar página si es necesario
    const chunkData = textChunks[currentChunkIndex];
    renderPdfPage(chunkData.page);

    document.getElementById('current-index').innerText = currentChunkIndex + 1;

    const btn = document.getElementById('btn-play');
    btn.innerText = "CARGANDO...";

    try {
        let audioUrl;
        const cacheKey = `${currentChunkIndex}-${currentVoiceId}`;

        if (audioCache[cacheKey]) {
            audioUrl = audioCache[cacheKey];
        } else {
            // Usamos chunkData.text porque ahora es un objeto
            const blob = await fetchAudioOfficial(chunkData.text);
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
        alert(error.message);
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
    if (!response.ok) throw new Error("Error API o Sin Créditos");
    return await response.blob();
}

// ... (El resto de funciones: Download All, Visualizador de partículas) ...
// (Copiar el código de partículas y descarga unificada del script anterior aquí, son iguales)
// Solo asegurate de usar chunkData.text en los loops si usas textChunks

// Descarga Unificada (Ajustada a objetos)
document.getElementById('btn-download-all').addEventListener('click', () => {
    const blobsToMerge = [];
    for(let i = 0; i < textChunks.length; i++) {
        const key = `${i}-${currentVoiceId}`;
        if(blobCache[key]) blobsToMerge.push(blobCache[key]);
    }
    if(blobsToMerge.length === 0) return alert("Nada para descargar.");
    const mergedBlob = new Blob(blobsToMerge, { type: 'audio/mpeg' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(mergedBlob);
    a.download = `Libro_Completo.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// SISTEMA DE PARTÍCULAS (Mismo de antes)
class Particle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.color = `rgba(56, 189, 248, ${Math.random() * 0.3})`;
    }
    update(intensity) {
        this.x += this.speedX * (1 + intensity * 2);
        this.y += this.speedY * (1 + intensity * 2);
        if(this.x > canvas.width || this.x < 0) this.reset();
        if(this.y > canvas.height || this.y < 0) this.reset();
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}
function initParticleSystem() {
    canvas = document.getElementById('bg-visualizer');
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    for(let i=0; i<100; i++) particles.push(new Particle());
    animateParticles();
}
function animateParticles() {
    requestAnimationFrame(animateParticles);
    ctx.clearRect(0,0,canvas.width, canvas.height);
    let intensity = 0;
    if(isPlaying && analyser) {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        intensity = arr[10] / 255;
    }
    particles.forEach(p => { p.update(intensity); p.draw(); });
}

// Helpers UI
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
        btn.style.backgroundColor = "#fff";
        btn.style.color = "#000";
    } else {
        btn.innerText = "INICIAR";
        btn.style.backgroundColor = ""; 
        btn.style.color = "";
    }
}
function setupAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 64;
}

// Botones básicos
document.getElementById('btn-play').addEventListener('click', () => {
    if (textChunks.length === 0) return alert("Sube un PDF");
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    
    if (isPlaying) {
        isPlaying = false; audioPlayer.pause();
    } else {
        isPlaying = true;
        if(audioPlayer.paused && audioPlayer.src) audioPlayer.play();
        else playCurrentChunk();
    }
    updatePlayButton();
});
document.getElementById('btn-next').addEventListener('click', () => { currentChunkIndex++; if(isPlaying) playCurrentChunk(); });
document.getElementById('btn-prev').addEventListener('click', () => { if(currentChunkIndex > 0) currentChunkIndex--; if(isPlaying) playCurrentChunk(); });
document.getElementById('speed-select').addEventListener('change', (e) => audioPlayer.playbackRate = parseFloat(e.target.value));
window.jumpTo = (index) => { currentChunkIndex = index; isPlaying = true; playCurrentChunk(); updatePlayButton(); };
