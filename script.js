let sentences = [];

let currentIndex = 0;

let isPlaying = false;

const audioPlayer = new Audio();



// --- CONFIGURACIÓN DIRECTA (Solo para uso sin servidor) ---

const ELEVEN_API_KEY = "93e18ea0d0msh899294d3fce8356p15e3fcjsn60d8f3c9acf1"; // <--- PEGA TU CLAVE DENTRO DE LAS COMILLAS

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Voz de Rachel



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

                fullText += content.items.map(item => item.str).join(" ") + " ";

            }



            // Limpieza y segmentación

            sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

            sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);



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



// 2. RENDERIZAR TEXTO

function renderText() {

    const container = document.getElementById('text-content');

    container.innerHTML = sentences.map((s, i) => 

        `<span id="sent-${i}" class="sentence" onclick="jumpTo(${i})">${s}</span>`

    ).join(" ");

}



// 3. FUNCIÓN DE REPRODUCCIÓN (Directa a ElevenLabs)

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



    document.getElementById('current-index').innerText = currentIndex + 1;

    const btn = document.getElementById('btn-play');

    btn.innerText = "Cargando...";



    try {

        // --- LLAMADA DIRECTA A LA API (Sin pasar por server.js) ---

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {

            method: 'POST',

            headers: {

                'xi-api-key': ELEVEN_API_KEY,

                'Content-Type': 'application/json'

            },

            body: JSON.stringify({

                text: sentences[currentIndex],

                model_id: "eleven_monolingual_v1",

                voice_settings: { stability: 0.5, similarity_boost: 0.75 }

            })

        });



        if (!response.ok) {

            const errorData = await response.json();

            throw new Error(errorData.detail?.message || "Error de API");

        }



        const blob = await response.blob();

        const audioUrl = URL.createObjectURL(blob);

        

        audioPlayer.src = audioUrl;

        audioPlayer.playbackRate = parseFloat(document.getElementById('speed-select').value);

        

        audioPlayer.play();

        btn.innerText = "⏸ Pausa";



        audioPlayer.onended = () => {

            if (isPlaying) {

                currentIndex++;

                playCurrentSentence();

            }

        };



    } catch (error) {

        console.error("Error:", error);

        alert("Error: " + error.message);

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

        isPlaying = false;

        audioPlayer.pause();

    } else {

        isPlaying = true;

        if (audioPlayer.paused && audioPlayer.src) {

            audioPlayer.play();

        } else {

            playCurrentSentence();

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



window.jumpTo = (index) => {

    currentIndex = index;

    isPlaying = true;

    playCurrentSentence();

    updatePlayButton();

};



document.getElementById('theme-toggle').addEventListener('click', () => {

    document.body.classList.toggle('dark-mode');

});
