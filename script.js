// ==========================================
// AI READER - ELEGANT EDITION (OPTIMIZED)
// ==========================================

let textChunks = []; 
let currentChunkIndex = 0;
let isPlaying = false;
let pdfDoc = null; 
let currentRenderedPage = 0;

const audioPlayer = new Audio();
audioPlayer.crossOrigin = "anonymous"; 
const previewPlayer = new Audio();

const ELEVEN_API_KEY = "sk_ed46d0e013173c119ba69a8024a7f1d7c84c031d7b65d5e1"; 
// OPTIMIZACIÓN: Bloques grandes para ahorrar peticiones
const MAX_CHUNK_SIZE = 1000; 

let currentVoiceId = "21m00Tcm4TlvDq8ikWAM"; 
let audioCache = {}; 
let blobCache = {};
let availableVoices = [];

// VISUALIZADOR
let audioContext, analyser, canvas, ctx, particles = [];

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', async () => {
    await loadVoices();
    initParticleSystem(); // Partículas elegantes de fondo

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

// 2. CARGA PDF OPTIMIZADA (Filtro de basura)
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Preparando documento...";
    
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
                    
                    // OPTIMIZACIÓN: Ignorar basura corta
                    if (sentence.length < 4 && !isNaN(sentence)) continue; 

                    if ((currentBuffer.length + sentence.length) < MAX_CHUNK_SIZE) {
                        currentBuffer += sentence + " ";
                    } else {
                        if (currentBuffer.length > 10) { // Solo bloques con contenido real
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
            <span style="opacity:0.6; font-size:0.7em; font-weight:600; color:var(--accent-color); text-transform:uppercase; letter-spacing:1px;">PÁGINA ${chunk.page}</span><br>
            ${chunk.text}
            <br><a id="download-${i}" class="download-link" style="display:none">⬇️ Guardar Audio</a>
        </div>`
    ).join("");
}

async function renderPdfPage(pageNum, forceRender = false) {
    if(!pdfDoc || (pageNum === currentRenderedPage && !forceRender)) return;
    currentRenderedPage = pageNum;
    document.getElementById('pdf-page-num').innerText =
