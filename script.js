let sentences = [];
let currentIndex = 0;
let isPlaying = false;
const audioPlayer = new Audio();

// 1. CARGA Y PROCESAMIENTO DEL PDF
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('text-content').innerHTML = "⏳ Procesando archivo...";
    
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                // Une las palabras y añade un espacio
                fullText += content.items.map(item => item.str).join(" ") + " ";
            }

            // Separar por oraciones usando Regex (puntos, signos exclamación/interrogación)
            sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
            
            // Limpiar espacios extra
            sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);

            // Actualizar contadores
            document.getElementById('total-sentences').innerText = sentences.length;
            currentIndex = 0;
            
            renderText();
        } catch (error) {
            console.error(error);
            alert("Error al leer el PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
});

// 2. RENDERIZAR TEXTO EN PANTALLA
function renderText() {
    const container = document.getElementById('text-content');
    container.innerHTML = sentences.map((s, i) => 
        `<span id="sent-${i}" class="sentence" onclick="jumpTo(${i})">${s}</span>`
    ).join(" ");
}

// 3. FUNCIÓN PRINCIPAL DE REPRODUCCIÓN
async function playCurrentSentence() {
    if (currentIndex >= sentences.length) {
        isPlaying = false;
        updatePlayButton();
        return;
    }

    // Resaltado visual
    document.querySelectorAll('.sentence').forEach(el => el.classList.remove('active'));
    const currentEl = document.getElementById(`sent-${currentIndex}`);
    if (currentEl) {
        currentEl.classList.add('active');
        currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Actualizar contador
    document.getElementById('current-index').innerText = currentIndex + 1;

    // Pedir audio al backend
    try {
        const btn = document.getElementById('btn-play');
        btn.innerText = "Cargando...";
        
        const response = await fetch('/api/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sentences[currentIndex] })
        });

        if (!response.ok) throw new Error("Error en servidor");

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        
        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = parseFloat(document.getElementById('speed-select').value);
        
        // Cuando el audio esté listo para sonar
        audioPlayer.play();
        btn.innerText = "⏸ Pausa";

        // Al terminar, ir a la siguiente
        audioPlayer.onended = () => {
            if (isPlaying) {
                currentIndex++;
                playCurrentSentence();
            }
        };

    } catch (error) {
        console.error(error);
        isPlaying = false;
        updatePlayButton();
    }
}

// 4. CONTROLES
function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    btn.innerText = isPlaying ? "⏸ Pausa" : "▶ Reproducir";
}

document.getElementById('btn-play').addEventListener('click', () => {
    if (sentences.length === 0) return alert("Sube un PDF primero");
    
    if (isPlaying) {
        // Pausar
        isPlaying = false;
        audioPlayer.pause();
    } else {
        // Reproducir
        isPlaying = true;
        if (audioPlayer.paused && audioPlayer.src) {
            audioPlayer.play(); // Reanudar si ya hay audio cargado
        } else {
            playCurrentSentence(); // Cargar nuevo si no hay
        }
    }
    updatePlayButton();
});

document.getElementById('btn-next').addEventListener('click', () => {
    currentIndex++;
    if(isPlaying) playCurrentSentence();
});

document.getElementById('btn-prev').addEventListener('click', () => {
    if(currentIndex > 0) currentIndex--;
    if(isPlaying) playCurrentSentence();
});

document.getElementById('speed-select').addEventListener('change', (e) => {
    audioPlayer.playbackRate = parseFloat(e.target.value);
});

// Función para saltar al hacer click en el texto
window.jumpTo = (index) => {
    currentIndex = index;
    isPlaying = true;
    playCurrentSentence();
    updatePlayButton();
};

// 5. MODO OSCURO
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});
