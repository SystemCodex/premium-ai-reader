// ==========================================
// AI READER PRO - SPLIT VIEW & SYNC SYSTEM
// ==========================================

// --- ESTADO GLOBAL ---
let pdfDoc = null;             // Objeto PDF cargado
let currentPdfPage = 1;        // Página visual actual
let textChunks = [];           // Array de { text: string, page: number }
let currentChunkIndex = 0;
let isPlaying = false;

// Audio
const audioPlayer = new Audio();
audioPlayer.crossOrigin = "anonymous";
const previewPlayer = new Audio();

// Config API
const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; // Tu clave
let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; 

// Cache para evitar re-generar audio
let audioCache = {}; 
let blobCache = {};

// Visualizador
let audioContext, analyser, source, canvas, ctx;
let particles = [];

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
    initParticleSystem();
});

async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': ELEVEN_API_KEY }
        });
        const data = await response.json();
        select.innerHTML = '';
        data.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name;
            if (voice.voice_id === currentVoiceId) option.selected = true;
            select.appendChild(option);
        });
        select.addEventListener('change', (e) => { currentVoiceId = e.target.value; audioCache = {}; });
    } catch (e) { console.error(e); }
}

// ==========================================
// 2. PROCESAMIENTO DEL PDF (TEXTO + VISUAL)
// ==========================================
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('status-indicator').innerText = "Procesando PDF...";
    
    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        
        // 1. Cargar Documento PDF Global
        pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
        
        // 2. Extraer Texto y Mapear Páginas
        textChunks = [];
        const MAX_CHUNK_SIZE = 800;

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const content = await page.getTextContent();
            
            // Unir texto de la página
            const pageText = content.items.map(item => item.str).join(" ");
            
            // Dividir en oraciones
            let rawSentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
            
            // Agrupar oraciones en chunks y asignarles el número de página
            let currentBuffer = "";
            for (let sentence of rawSentences) {
                sentence = sentence.trim();
                if (!sentence) continue;
                
                if ((currentBuffer.length + sentence.length) < MAX_CHUNK_SIZE) {
                    currentBuffer += sentence + " ";
                } else {
                    textChunks.push({ text: currentBuffer.trim(), page: pageNum });
                    currentBuffer = sentence + " ";
                }
            }
            if (currentBuffer.length > 0) {
                textChunks.push({ text: currentBuffer.trim(), page: pageNum });
            }
        }

        // 3. Renderizar UI
        renderTextPanel();
        currentChunkIndex = 0;
        
        // Renderizar visualmente la página 1 en el panel derecho
        renderPDFPage(1);

        document.getElementById('status-indicator').innerText = "Listo para leer";
        document.getElementById('current-progress').innerText = `1 / ${textChunks.length}`;
    };
    fileReader.readAsArrayBuffer(file);
});

// Renderizar la lista de frases a la izquierda
function renderTextPanel() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="chunk" onclick="jumpTo(${i})">
            <div style="font-size:0.7rem; color:var(--accent); margin-bottom:5px;">PÁGINA ${chunk.page}</div>
            ${chunk.text}
        </div>`
    ).join("");
}

// Renderizar el PDF real a la derecha (Canvas)
async function renderPDFPage(num) {
    if(!pdfDoc) return;
    currentPdfPage = num;
    document.getElementById('pdf-page-num').innerText = num;

    const page = await pdfDoc.getPage(num);
    const canvasPdf = document.getElementById('the-pdf-canvas');
    const ctxPdf = canvasPdf.getContext('2d');

    // Ajustar escala al ancho del contenedor
    const wrapper = document.querySelector('.pdf-wrapper');
    const viewport = page.getViewport({ scale: 1.5 }); // Escala base
    
    // Ajustar responsivo
    canvasPdf.height = viewport.height;
    canvasPdf.width = viewport.width;

    const renderContext = {
        canvasContext: ctxPdf,
        viewport: viewport
    };
    await page.render(renderContext).promise;
}

// ==========================================
// 3. REPRODUCCIÓN Y SINCRONIZACIÓN
// ==========================================
async function playCurrentChunk() {
    if (!audioContext) setupAudioContext();
    if (currentChunkIndex >= textChunks.length) { isPlaying = false; updatePlayBtn(); return; }

    const chunkData = textChunks[currentChunkIndex];
    
    // --- LÓGICA DE SINCRONIZACIÓN VISUAL ---
    highlightChunk(currentChunkIndex);
    
    // Si la página del chunk actual es diferente a la que estamos viendo, cambiarla
    if (chunkData.page !== currentPdfPage) {
        renderPDFPage(chunkData.page);
    }
    // ---------------------------------------

    document.getElementById('current-progress').innerText = `${currentChunkIndex + 1} / ${textChunks.length}`;
    
    const btn = document.getElementById('btn-play');
    btn.innerText = "CARGANDO...";

    try {
        let audioUrl;
        const cacheKey = `${currentChunkIndex}-${currentVoiceId}`;

        if (audioCache[cacheKey]) {
            audioUrl = audioCache[cacheKey];
        } else {
            const blob = await fetchAudioOfficial(chunkData.text);
            blobCache[cacheKey] = blob;
            audioUrl = URL.createObjectURL(blob);
            audioCache[cacheKey] = audioUrl;
        }

        if(Object.keys(blobCache).length > 0) document.getElementById('btn-download-all').style.display = 'inline-block';

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
        console.error(error);
        isPlaying = false;
        updatePlayBtn();
    }
}

// Llamada a API ElevenLabs
async function fetchAudioOfficial(text) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });
    if (!response.ok) throw new Error("Error API");
    return await response.blob();
}

// ==========================================
// 4. VISUALIZADOR DE PARTÍCULAS (FONDO)
// ==========================================
class Particle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.baseSize = this.size;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.color = `rgba(0, 242, 255, ${Math.random() * 0.3 + 0.1})`;
    }
    update(intensity) {
        // Movimiento reactivo
        this.x += this.speedX * (1 + intensity * 5);
        this.y += this.speedY * (1 + intensity * 5);
        
        // Brillo reactivo
        if (intensity > 0.1) {
            this.size = this.baseSize + (intensity * 4);
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#00f2ff";
        } else {
            this.size = this.baseSize;
            ctx.shadowBlur = 0;
        }

        if (this.x > canvas.width || this.x < 0 || this.y > canvas.height || this.y < 0) this.reset();
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
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    for(let i=0; i<100; i++) particles.push(new Particle());
    animate();
}

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function setupAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 64;
}

function animate() {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let intensity = 0;
    if (isPlaying && analyser) {
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buffer);
        intensity = (buffer.reduce((a,b)=>a+b) / buffer.length) / 255;
    }

    particles.forEach(p => { p.update(intensity); p.draw(); });
}

// ==========================================
// CONTROLES UI
// ==========================================
function highlightChunk(index) {
    document.querySelectorAll('.chunk').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`chunk-${index}`);
    if (el) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updatePlayBtn() {
    const btn = document.getElementById('btn-play');
    btn.innerText = isPlaying ? "PAUSA" : "REPRODUCIR";
}

document.getElementById('btn-play').addEventListener('click', () => {
    if(textChunks.length === 0) return alert("Carga un PDF primero");
    if(audioContext && audioContext.state === 'suspended') audioContext.resume();
    
    if(isPlaying) {
        isPlaying = false;
        audioPlayer.pause();
        updatePlayBtn();
    } else {
        isPlaying = true;
        if(audioPlayer.src && audioPlayer.paused) audioPlayer.play();
        else playCurrentChunk();
        updatePlayBtn();
    }
});

document.getElementById('btn-next').addEventListener('click', () => { currentChunkIndex++; if(isPlaying) playCurrentChunk(); });
document.getElementById('btn-prev').addEventListener('click', () => { if(currentChunkIndex > 0) currentChunkIndex--; if(isPlaying) playCurrentChunk(); });
document.getElementById('speed-select').addEventListener('change', (e) => audioPlayer.playbackRate = e.target.value);
document.getElementById('btn-download-all').addEventListener('click', () => {
    // Lógica simple de descarga
    alert("Descargando compilación... (Simulado)");
});

window.jumpTo = (i) => { currentChunkIndex = i; isPlaying = true; playCurrentChunk(); updatePlayBtn(); };
