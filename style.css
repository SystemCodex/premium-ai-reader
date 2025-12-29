// ==========================================
// AI READER - ELEGANT EDITION (FULL CODE)
// ==========================================

let textChunks = []; 
let currentChunkIndex = 0;
let isPlaying = false;
let pdfDoc = null; 
let currentRenderedPage = 0;

const audioPlayer = new Audio();
audioPlayer.crossOrigin = "anonymous"; 
const previewPlayer = new Audio();

// --- CONFIGURACIÓN ---
const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; 
const MAX_CHUNK_SIZE = 1000; // Bloques grandes para optimizar peticiones

let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel por defecto
let audioCache = {}; 
let blobCache = {};
let availableVoices = [];

// VISUALIZADOR VARIABLES
let audioContext, analyser, canvas, ctx, particles = [];

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
    initParticleSystem();

    // Redimensionar PDF si cambia la ventana
    window.addEventListener('resize', () => {
        if(pdfDoc && currentRenderedPage > 0) renderPdfPage(currentRenderedPage, true);
    });
});

async function loadVoices() {
    const select = document.getElementById('voice-select');
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': ELEVEN_API_KEY }
        });
        if(!response.ok) throw new Error("Error cargando voces");
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

// 2. CARGA PDF CON OPTIMIZACIÓN DE COSTOS
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Analizando y optimizando texto...";
    
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            pdfDoc = await pdfjsLib.getDocument(typedarray).promise; 
            
            textChunks = [];
            let totalChars = 0;

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(" ") + " ";
                totalChars += pageText.length;

                let rawSentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
                let currentBuffer = "";

                for (let sentence of rawSentences) {
                    sentence = sentence.trim();
                    if(!sentence) continue;
                    
                    // OPTIMIZACIÓN: Ignorar basura (números de pág sueltos, etc)
                    if (sentence.length < 5 && !isNaN(sentence)) continue; 

                    if ((currentBuffer.length + sentence.length) < MAX_CHUNK_SIZE) {
                        currentBuffer += sentence + " ";
                    } else {
                        if (currentBuffer.length > 10) { 
                            textChunks.push({ text: currentBuffer.trim(), page: i });
                        }
                        currentBuffer = sentence + " ";
                    }
                }
                if (currentBuffer.length > 10) {
                    textChunks.push({ text: currentBuffer.trim(), page: i });
                }
            }

            document.getElementById('char-count').innerText = totalChars.toLocaleString();
            document.getElementById('quota-info').style.display = "inline-block";
            document.getElementById('total-sentences').innerText = textChunks.length;
            
            currentChunkIndex = 0;
            localStorage.setItem('lastChunkIndex', 0);
            renderText();
            renderPdfPage(1); 

        } catch (error) {
            console.error(error);
            alert("Error al procesar PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
});

function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = textChunks.map((chunk, i) => 
        `<div id="chunk-${i}" class="sentence" onclick="jumpTo(${i})">
            <span style="opacity:0.6; font-size:0.7em; font-weight:700; color:var(--accent-color); text-transform:uppercase;">PÁGINA ${chunk.page}</span><br>
            ${chunk.text}
            <br><a id="download-${i}" class="download-link" style="display:none">⬇️ Guardar Audio</a>
        </div>`
    ).join("");
}

// RENDERIZADO PDF RESPONSIVO
async function renderPdfPage(pageNum, forceRender = false) {
    if(!pdfDoc || (pageNum === currentRenderedPage && !forceRender)) return;
    currentRenderedPage = pageNum;
    document.getElementById('pdf-page-num').innerText = pageNum;

    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('the-pdf-canvas');
    const ctx = canvas.getContext('2d');
    
    // Calcular escala basada en el contenedor
    const containerWidth = document.getElementById('pdf-canvas-container').clientWidth;
    const viewportUnscaled = page.getViewport({ scale: 1 });
    const desiredWidth = containerWidth - 40; 
    // Limitamos la escala para no pixelar demasiado
    const scale = Math.min(desiredWidth / viewportUnscaled.width, 2.0); 
    
    const scaledViewport = page.getViewport({ scale: scale });
    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;

    if (window.pdfRenderTask) await window.pdfRenderTask.cancel();
    window.pdfRenderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
    await window.pdfRenderTask.promise;
}

// 3. REPRODUCIR
async function playCurrentChunk() {
    if (!audioContext) setupAudioContext();

    if (currentChunkIndex >= textChunks.length) {
        isPlaying = false;
        updatePlayButton();
        return;
    }

    highlightChunk(currentChunkIndex);
    const chunkData = textChunks[currentChunkIndex];
    
    // Sincronizar PDF derecho
    renderPdfPage(chunkData.page);

    document.getElementById('current-index').innerText = currentChunkIndex + 1;
    localStorage.setItem('lastChunkIndex', currentChunkIndex);

    const btn = document.getElementById('btn-play');
    btn.innerText = "CARGANDO...";
    btn.style.opacity = "0.7";

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
        
        enableDownloadLink(currentChunkIndex, audioUrl);
        if(Object.keys(blobCache).length > 0) {
            document.getElementById('btn-download-all').style.display = 'inline-block';
        }

        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = parseFloat(document.getElementById('speed-select').value);
        
        await audioPlayer.play();
        btn.innerText = "PAUSA";
        btn.style.opacity = "1";
        
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
        btn.innerText = "INICIAR";
        btn.style.opacity = "1";
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
    a.download = `Audiolibro_Completo.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// PARTÍCULAS ELEGANTES (Dorado/Rosa suave)
class Particle {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 6 + 2;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.speedY = Math.random() * 0.4 - 0.2;
        // Colores cálidos y elegantes con baja opacidad
        const colors = ['rgba(212, 163, 115, 0.3)', 'rgba(230, 184, 156, 0.3)', 'rgba(200, 200, 200, 0.2)'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update(intensity) {
        const speedFactor = 1 + (intensity * 3);
        this.x += this.speedX * speedFactor;
        this.y += this.speedY * speedFactor;
        
        this.currentSize = this.size + (intensity * 8); // Crecen con la voz

        if(this.x > canvas.width || this.x < 0) this.reset();
        if(this.y > canvas.height || this.y < 0) this.reset();
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
        // Glow suave
        ctx.shadowBlur = 15; ctx.shadowColor = this.color;
        ctx.fill(); ctx.shadowBlur = 0;
    }
}

function initParticleSystem() {
    canvas = document.getElementById('bg-visualizer');
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
    for(let i=0; i<60; i++) particles.push(new Particle());
    animateParticles();
}

function animateParticles() {
    requestAnimationFrame(animateParticles);
    ctx.clearRect(0,0,canvas.width, canvas.height);
    let intensity = 0;
    if(isPlaying && analyser) {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        let sum = 0; for(let i=0; i<arr.length; i++) sum += arr[i];
        intensity = (sum / arr.length) / 255;
        intensity = intensity * 0.5; // Suavizar reacción
    }
    particles.forEach(p => { p.update(intensity); p.draw(); });
}

// Helpers UI
function highlightChunk(index) {
    document.querySelectorAll('.sentence').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`chunk-${index}`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function enableDownloadLink(index, url) {
    const link = document.getElementById(`download-${index}`);
    if(link) { link.href = url; link.download = `bloque_${index}.mp3`; link.style.display = "inline-block"; }
}
function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    if(isPlaying) {
        btn.innerText = "PAUSA";
        btn.style.borderColor = "#d4a373";
        btn.style.color = "#d4a373";
    } else {
        btn.innerText = "INICIAR";
        btn.style.borderColor = "transparent";
        btn.style.color = "#fff";
    }
}
function setupAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 256;
}

// Listeners
document.getElementById('btn-play').addEventListener('click', () => {
    if (textChunks.length === 0) return alert("Sube un PDF primero");
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    if (isPlaying) { isPlaying = false; audioPlayer.pause(); } 
    else { isPlaying = true; if(audioPlayer.paused && audioPlayer.src) audioPlayer.play(); else playCurrentChunk(); }
    updatePlayButton();
});
document.getElementById('btn-next').addEventListener('click', () => { currentChunkIndex++; if(isPlaying) playCurrentChunk(); });
document.getElementById('btn-prev').addEventListener('click', () => { if(currentChunkIndex > 0) currentChunkIndex--; if(isPlaying) playCurrentChunk(); });
document.getElementById('speed-select').addEventListener('change', (e) => audioPlayer.playbackRate = parseFloat(e.target.value));
window.jumpTo = (index) => { currentChunkIndex = index; isPlaying = true; playCurrentChunk(); updatePlayButton(); };
