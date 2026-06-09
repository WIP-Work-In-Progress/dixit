/* ==========================================================================
   DIXIT AI - GAME ENGINE (VANILLA JS WITH MULTIPLAYER SUPPORT)
   ========================================================================== */

// Keyword suggestions for classes
const KEYWORDS = {
    "animal": ["animal", "creature", "wildlife", "nature", "beast", "habitat", "zoo", "wilderness", "fauna", "pet"],
    "book": ["book", "paper", "pages", "library", "reading", "literature", "novel", "story", "knowledge", "study", "education", "encyclopedia", "poetry", "magazine", "publishing"],
    "computer": ["computer" ,"technology", "keyboard", "screen", "monitor", "mouse", "laptop", "desktop", "internet", "software", "hardware", "program", "code", "digital", "network", "data", "processor", "server", "device", "system", "electronics"],
    "dark": ["dark", "darkness", "shadow", "night", "gloom", "mystery", "eclipse", "moon", "twilight", "shade", "fog", "mist", "black", "dim", "obscure", "secret", "fear", "dusk", "midnight", "void"],
    "fire": ["fire", "flame", "burn", "heat", "ember", "blaze", "inferno", "spark", "smoke", "ash", "torch", "campfire", "bonfire", "wildfire", "ignite", "scorch", "pyre", "furnace", "molten", "glow"],
    "flora": ["flora", "plant", "flower", "leaf", "garden","botany", "nature", "green"],
    "food": ["food", "meal", "snack", "dish", "cuisine", "ingredient", "taste", "flavor", "kitchen", "recipe", "dining", "breakfast", "lunch", "dinner", "grocery", "nutrition", "cooking", "feast"],
    "sky": ["sky", "cloud", "atmosphere", "horizon", "blue", "dusk", "weather", "air", "space", "heavens", "celestial", "flight"],
    "sunny": ["sunny", "sun", "light", "bright", "warm", "day", "shine", "summer", "golden", "glow", "radiant", "beam", "sunbeam", "sunlight", "cheerful", "morning", "afternoon", "sunrise"],
    "tree": ["tree", "forest", "branch", "leaf", "trunk", "root", "bark", "wood", "timber", "sapling", "oak", "pine", "willow", "maple", "jungle", "nature", "park"],
    "watch": ["watch", "clock", "time", "hour", "minute", "second", "alarm","gear", "mechanism", "tick", "timer"],
    "winter": ["winter", "snow", "ice", "cold", "frost", "chill", "blizzard", "freeze", "snowflake", "icicle", "frozen", "white", "storm", "glacier", "wintertime", "ski", "sled"]
};

// Global game state variables
let cardsMetadata = {};
let vocabEmbeddings = {};
let deck = [];
let players = [];
let round = 1;
let storytellerIdx = 0;
let gameState = "SETUP"; // SETUP, STORYTELLER_TURN, CARDS_SUBMISSION, VOTING, SCORING, GAME_OVER

// Round variables
let currentClue = "";
let storytellerClass = "";
let storytellerCardId = "";
let submittedCards = []; // [{ playerId, cardId }]
let votes = {}; // { cardId: [playerIds] }
let winCondition = "score-30"; // or "rounds-X"

// Multiplayer variables
let isMultiplayer = false;
let isHost = false;
let myPlayerId = 0; // Host is 0, Guest clients are 1+
let roomCode = "";
let channel = null;
let maxPlayers = 4;
let numBots = 2;

// UI Elements
const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const playersList = document.getElementById("players-list");
const phaseTitle = document.getElementById("phase-title");
const phaseInstruction = document.getElementById("phase-instruction");
const boardTable = document.getElementById("board-table");
const confirmBtn = document.getElementById("confirm-btn");
const playerHand = document.getElementById("player-hand");
const gameLogs = document.getElementById("game-logs");
const debugLogContainer = document.getElementById("debug-log-container");
const toggleThoughts = document.getElementById("toggle-thoughts");

// Lobby Setup Elements
const modeSingleBtn = document.getElementById("mode-single-btn");
const modeMultiBtn = document.getElementById("mode-multi-btn");
const singleConfig = document.getElementById("single-config");
const multiConfig = document.getElementById("multi-config");
const lobbyConfig = document.getElementById("lobby-config");

const actionCreateBtn = document.getElementById("action-create-btn");
const actionJoinBtn = document.getElementById("action-join-btn");
const createRoomConfig = document.getElementById("create-room-config");
const joinRoomConfig = document.getElementById("join-room-config");

const createRoomSubmitBtn = document.getElementById("create-room-submit-btn");
const joinRoomSubmitBtn = document.getElementById("join-room-submit-btn");

// Clue Modal Elements
const clueModal = document.getElementById("clue-modal");
const clueInput = document.getElementById("clue-input");
const modalSelectedCardImg = document.getElementById("modal-selected-card-img");
const aiSuggestionsList = document.getElementById("ai-suggestions-list");
const cancelClueBtn = document.getElementById("cancel-clue-btn");
const submitClueBtn = document.getElementById("submit-clue-btn");

// Zoom Modal Elements
const zoomModal = document.getElementById("zoom-modal");
const zoomImg = document.getElementById("zoom-img");
const zoomCaption = document.getElementById("zoom-caption");
const zoomClasses = document.getElementById("zoom-classes");
const zoomMatchContainer = document.getElementById("zoom-match-container");
const zoomMatchBar = document.getElementById("zoom-match-bar");
const zoomMatchDetails = document.getElementById("zoom-match-details");
const closeZoomBtn = document.getElementById("close-zoom-btn");

// Endgame Modal Elements
const endgameModal = document.getElementById("endgame-modal");
const endgameMessage = document.getElementById("endgame-message");
const endgameTable = document.getElementById("endgame-table").querySelector("tbody");
const restartGameBtn = document.getElementById("restart-game-btn");

// Currently selected cards
let selectedHandCardId = null;
let selectedBoardCardId = null;
let tempRemovedCardId = null;
let tempRemovedCardIdx = null;

// Transformers.js pipeline in background
let extractor = null;
let modelLoading = false;

// --- NETWORK ADAPTER: BroadcastChannel -> WebSocket compatibility layer ---
class NetworkChannel {
    constructor(roomCode, backendUrl) {
        this.room = roomCode;
        this.backendUrl = backendUrl || (window.BACKEND_URL || null);
        this.ws = null;
        this.onmessage = null;
        this._retries = 0;
        this._connect();
    }

    _connect() {
        if (!this.backendUrl) {
            console.warn('No BACKEND_URL configured for NetworkChannel; falling back to in-page BroadcastChannel if available');
            try {
                this.bc = new BroadcastChannel('dixit-room-' + this.room);
                this.bc.onmessage = (ev) => { if (this.onmessage) this.onmessage({ data: ev.data }); };
            } catch (e) {
                console.error('BroadcastChannel not available and no backend provided', e);
            }
            return;
        }

        try {
            // Normalize backendUrl and build ws/wss URL correctly
            let origin = this.backendUrl.trim();
            // If user provided only host without protocol, assume https
            if (!origin.match(/^https?:\/\//)) {
                origin = 'https://' + origin;
            }
            const isSecure = origin.startsWith('https://');
            const wsProto = isSecure ? 'wss://' : 'ws://';
            // Remove any trailing slash
            origin = origin.replace(/\/+$/, '');
            const wsEndpoint = `${wsProto}${origin.replace(/^https?:\/\//, '')}/ws/${this.room}`;

            this.ws = new WebSocket(wsEndpoint);

            this.ws.onopen = () => {
                console.info('WebSocket connected to', wsEndpoint, 'room', this.room);
                this._retries = 0;
            };
            this.ws.onmessage = (ev) => {
                try {
                    const parsed = JSON.parse(ev.data);
                    if (this.onmessage) this.onmessage({ data: parsed });
                } catch (e) {
                    // If message isn't JSON, pass raw
                    if (this.onmessage) this.onmessage({ data: ev.data });
                }
            };
            this.ws.onclose = () => {
                console.warn('WebSocket closed; attempting reconnect');
                this._scheduleReconnect();
            };
            this.ws.onerror = (e) => {
                console.error('WebSocket error', e);
                // Let onclose handle reconnection
            };
        } catch (e) {
            console.error('Failed to create WebSocket', e);
            this._scheduleReconnect();
        }
    }

    _scheduleReconnect() {
        this._retries = Math.min(8, this._retries + 1);
        const backoff = Math.pow(2, this._retries) * 500; // base 500ms
        const jitter = Math.floor(Math.random() * 300);
        const wait = backoff + jitter;
        setTimeout(() => this._connect(), wait);
    }

    postMessage(obj) {
        const payload = (typeof obj === 'string') ? obj : JSON.stringify(obj);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
        } else if (this.bc) {
            this.bc.postMessage(obj);
        } else {
            console.warn('No network channel available to send message');
        }
    }

    close() {
        try {
            if (this.ws) this.ws.close();
            if (this.bc) this.bc.close();
        } catch (e) { /* ignore */ }
    }
}

// --------------------------------------------------------------------------
// 1. INITIALIZATION AND DATA LOADING
// --------------------------------------------------------------------------

async function init() {
    logSystem("Initializing game archives...");
    try {
        const backendUrl = (window.BACKEND_URL || '').trim();
        if (backendUrl) {
            logSystem("Running in BACKEND mode. Loading archives from backend at " + backendUrl);
            // Force backend-only mode: require backend to supply real model outputs
            const base = backendUrl.replace(/\/+$/, '');
            const metaRes = await fetch(base + '/api/cards_metadata');
            if (!metaRes.ok) {
                const text = await metaRes.text().catch(()=>metaRes.statusText);
                throw new Error('Failed to load cards metadata from backend: ' + metaRes.status + ' ' + text);
            }
            cardsMetadata = await metaRes.json();

            const vocabRes = await fetch(base + '/api/vocab_embeddings');
            if (!vocabRes.ok) {
                const text = await vocabRes.text().catch(()=>vocabRes.statusText);
                throw new Error('Failed to load vocab embeddings from backend: ' + vocabRes.status + ' ' + text);
            }
            vocabEmbeddings = await vocabRes.json();

            logSystem("Successfully loaded cards and vocab from backend. Backend-backed mode ON.");
        } else {
            // Developer local mode: allow loading precomputed JS or JSON for local testing
            logSystem("No BACKEND_URL configured — running in local/offline mode and using precomputed artifacts.");
            if (window.cardsMetadata && window.vocabEmbeddings) {
                cardsMetadata = window.cardsMetadata;
                vocabEmbeddings = window.vocabEmbeddings;
                logSystem("Game archives loaded directly from JS files (CORS-safe). Consider setting BACKEND_URL for production.");
            } else {
                const metadataRes = await fetch('cards_metadata.json');
                if (!metadataRes.ok) throw new Error("Could not load cards_metadata.json");
                cardsMetadata = await metadataRes.json();

                const vocabRes = await fetch('vocab_embeddings.json');
                if (!vocabRes.ok) throw new Error("Could not load vocab_embeddings.json");
                vocabEmbeddings = await vocabRes.json();
            }
        }

        logSystem(`Successfully loaded ${Object.keys(cardsMetadata).length} cards and vocabulary embeddings.`);
        setupScreen.classList.add("active");

        // Start background loading of NLP model (client-side optional)
        initTransformers();
    } catch (error) {
        console.error(error);
        // If running with BACKEND_URL and we fail, show clear message — production must have backend
        if (window.BACKEND_URL) {
            document.body.innerHTML = `
                <div style="max-width: 800px; margin: 80px auto; padding: 30px; background:#111; color:#fff; border-radius:12px; font-family:Inter, sans-serif; text-align:center;">
                    <h2 style="color:#ff7b72;">Backend Initialization Error</h2>
                    <p>Failed to load required data from the configured backend (<strong>${window.BACKEND_URL}</strong>).</p>
                    <pre style="text-align:left; display:inline-block; max-width:90%; background:#000; color:#eee; padding:12px; border-radius:8px;">${String(error).replace(/</g,'&lt;')}</pre>
                    <p style="margin-top:16px; color:#9ca3af;">Ensure your Render backend is deployed, reachable over HTTPS, and the environment variable <code>ALLOWED_ORIGINS</code> includes your GitHub Pages origin.</p>
                </div>
            `;
            return;
        }
        showCORSError();
    }
}

function showCORSError() {
    document.body.innerHTML = `
        <div style="max-width: 600px; margin: 100px auto; padding: 40px; background: rgba(30, 20, 50, 0.9); border: 2px solid #f43f5e; border-radius: 16px; font-family: sans-serif; line-height: 1.6; text-align: center; box-shadow: 0 0 30px rgba(244, 63, 94, 0.3);">
            <h1 style="color: #f43f5e; font-size: 2rem; margin-bottom: 20px;"><i class="fa-solid fa-triangle-exclamation"></i> CORS Error / Web Server Required</h1>
            <p style="color: #f3f4f6; font-size: 1.1rem; margin-bottom: 20px;">Dixit AI requires a local HTTP web server to load card databases due to browser security restrictions.</p>
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; font-family: monospace; text-align: left; color: #a7f3d0; margin-bottom: 20px;">
                # How to run a local server:<br>
                python -m http.server 8000
            </div>
            <p style="color: #9ca3af; font-size: 0.9rem;">Open your browser at <strong style="color:#fff;">http://localhost:8000</strong> to begin your journey!</p>
        </div>
    `;
}

async function initTransformers() {
    if (modelLoading || extractor) return;
    modelLoading = true;
    try {
        const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/dist@1.1.0/transformers.min.js');
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        logSystem("AI language model (all-MiniLM-L6-v2) loaded successfully. Clue interpretation active!");
    } catch (e) {
        console.warn("Transformers.js failed to load or browser blocked ES modules", e);
        logSystem("In-browser AI model unavailable. Falling back to precompiled keywords.");
    } finally {
        modelLoading = false;
    }
}

// --------------------------------------------------------------------------
// 2. HELPER AI FUNCTIONS / EMBEDDINGS
// --------------------------------------------------------------------------

// Levenshtein distance calculation (fallback)
function levenshtein(s1, s2) {
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i++) track[0][i] = i;
    for (let j = 0; j <= s2.length; j++) track[j][0] = j;
    for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    return track[s2.length][s1.length];
}

function getClosestVocabEmbedding(word) {
    let bestWord = null;
    let minDistance = Infinity;
    
    for (const vocabWord in vocabEmbeddings) {
        const dist = levenshtein(word, vocabWord);
        if (dist < minDistance) {
            minDistance = dist;
            bestWord = vocabWord;
        }
    }
    
    if (bestWord) {
        console.log(`[AI Fallback] Word '${word}' unknown. Using closest vocabulary match '${bestWord}'`);
        return vocabEmbeddings[bestWord];
    }
    return new Array(384).fill(0);
}

async function getEmbedding(text) {
    const cleaned = text.toLowerCase().trim();

    // If backend configured, always request embedding from backend (real model)
    if (window.BACKEND_URL && window.BACKEND_URL.trim()) {
        try {
            const base = window.BACKEND_URL.replace(/\/+$/, '');
            const res = await fetch(base + '/api/embed_text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleaned })
            });
            if (!res.ok) {
                console.warn('Backend embedding failed, status', res.status);
                // fallback to local methods below
            } else {
                const payload = await res.json();
                if (payload && payload.embedding) return payload.embedding;
            }
        } catch (e) {
            console.warn('Failed to fetch embedding from backend:', e);
            // continue to local fallback
        }
    }

    // 1. Check in precompiled dictionary
    if (vocabEmbeddings[cleaned]) {
        return vocabEmbeddings[cleaned];
    }

    // 2. If browser NLP model is active, extract in real-time
    if (extractor) {
        try {
            const output = await extractor(cleaned, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        } catch (e) {
            console.error("Error computing embedding client-side:", e);
        }
    }

    // 3. Fallback: closest dictionary match
    return getClosestVocabEmbedding(cleaned);
}

function calculateCardScore(cardId, storytellerClass, clueEmbedding) {
    const cardData = cardsMetadata[cardId];
    if (!cardData) return { total: 0, classScore: 0, embScore: 0 };
    
    // Classification (Keras CNN)
    let classScore = 0.0;
    const topClasses = cardData.top_classes || [];
    for (let i = 0; i < topClasses.length; i++) {
        if (topClasses[i][0] === storytellerClass) {
            if (i === 0) classScore = 0.6;
            else if (i === 1) classScore = 0.2;
            else if (i === 2) classScore = 0.1;
            break;
        }
    }
    
    // Similarity Embeddings
    let embScore = 0.0;
    if (clueEmbedding && cardData.embedding) {
        let dot = 0.0;
        for (let i = 0; i < clueEmbedding.length; i++) {
            dot += clueEmbedding[i] * cardData.embedding[i];
        }
        embScore = Math.max(0.0, Math.min(dot, 1.0)) * 0.4;
    }
    
    return {
        total: Math.min(classScore + embScore, 1.0),
        classScore: classScore,
        embScore: embScore
    };
}

// --------------------------------------------------------------------------
// 3. MULTIPLAYER LOBBY NETWORKING LOGIC
// --------------------------------------------------------------------------

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function createRoom() {
    const nameInput = document.getElementById("creator-name").value.trim() || "Host";
    maxPlayers = parseInt(document.getElementById("multi-max-players").value);
    numBots = parseInt(document.getElementById("multi-bot-count").value);
    winCondition = document.getElementById("multi-win-condition").value;
    
    roomCode = generateRoomCode();
    isMultiplayer = true;
    isHost = true;
    myPlayerId = 0;
    
    // Instantiate NetworkChannel (server-backed) or fallback to BroadcastChannel
    const backendUrl = window.BACKEND_URL || null; // set this from index.html when deploying
    channel = new NetworkChannel(roomCode, backendUrl);

    // Set up host players list (Host is Player 0)
    players = [
        { id: 0, name: nameInput, score: 0, isBot: false, hand: [] }
    ];
    
    // Add pre-selected bots to Host lists
    for (let i = 1; i <= numBots; i++) {
        players.push({ id: 100 + i, name: `Bot_${i}`, score: 0, isBot: true, hand: [] }); // Bot IDs start at 101
    }
    
    initHostListeners();
    showLobbyView();
}

function joinRoom() {
    const nameInput = document.getElementById("join-player-name").value.trim() || "Guest";
    const codeInput = document.getElementById("join-room-code").value.trim().toUpperCase();
    
    if (codeInput.length !== 4) {
        alert("Please enter a valid 4-letter Room Code!");
        return;
    }
    
    roomCode = codeInput;
    isMultiplayer = true;
    isHost = false;
    myPlayerId = 0; // Will be assigned by Host
    
    const backendUrl = window.BACKEND_URL || null;
    channel = new NetworkChannel(roomCode, backendUrl);

    initClientListeners(nameInput);
    
    // Join handshake timeout to notify client if host doesn't respond
    const joinTimeout = setTimeout(() => {
        if (myPlayerId === 0) {
            alert("Could not connect to room. Make sure the code is correct and the Host is active.");
            if (channel) channel.close();
            channel = null;
            isMultiplayer = false;
            // Go back
            lobbyConfig.style.display = "none";
            multiConfig.style.display = "block";
        }
    }, 4000);

    // Save timeout to clear it later
    window.joinHandshakeTimeout = joinTimeout;
}

function initHostListeners() {
    channel.onmessage = (event) => {
        const msg = event.data;
        
        if (msg.type === 'JOIN_REQUEST') {
            const humanPlayers = players.filter(p => !p.isBot);
            if (humanPlayers.length >= maxPlayers) {
                // Deny join if room is full
                return;
            }
            
            // Assign next free ID
            const newId = players.length;
            const newPlayer = { id: newId, name: msg.senderName, score: 0, isBot: false, hand: [] };
            players.push(newPlayer);
            
            // Send join response
            channel.postMessage({
                type: 'JOIN_RESPONSE',
                targetName: msg.senderName,
                playerId: newId,
                players: players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })),
                maxPlayers: maxPlayers,
                numBots: numBots,
                winCondition: winCondition
            });
            
            broadcastLobbyUpdate();
            
            // Check auto-start condition: if human capacity is reached
            const currentHumansCount = players.filter(p => !p.isBot).length;
            if (currentHumansCount >= maxPlayers) {
                startMultiplayerGame();
            }
        }
        else if (msg.type === 'SUBMIT_CLUE') {
            if (gameState === 'STORYTELLER_TURN' && storytellerIdx === msg.playerId) {
                currentClue = msg.clueText;
                storytellerCardId = msg.cardId;
                const meta = cardsMetadata[msg.cardId];
                storytellerClass = meta.top_classes[0][0];
                
                // Splice card from client hand
                const p = players.find(x => x.id === msg.playerId);
                if (p) {
                    const idx = p.hand.indexOf(msg.cardId);
                    if (idx !== -1) p.hand.splice(idx, 1);
                }
                
                submittedCards.push({ playerId: msg.playerId, cardId: msg.cardId });
                logSystem(`[Storyteller] Player ${p ? p.name : 'Guest'} set the clue: "${currentClue}"`);
                
                setGameState("CARDS_SUBMISSION");
                broadcastState();
            }
        }
        else if (msg.type === 'SUBMIT_CARD') {
            if (gameState === 'CARDS_SUBMISSION') {
                const p = players.find(x => x.id === msg.playerId);
                if (p) {
                    const idx = p.hand.indexOf(msg.cardId);
                    if (idx !== -1) p.hand.splice(idx, 1);
                }
                submittedCards.push({ playerId: msg.playerId, cardId: msg.cardId });
                logSystem(`[Submission] Player ${p ? p.name : 'Guest'} played a card.`);
                
                checkAllSubmissionsAndProceed();
            }
        }
        else if (msg.type === 'SUBMIT_VOTE') {
            if (gameState === 'VOTING') {
                const p = players.find(x => x.id === msg.playerId);
                if (p) {
                    p.votedCardId = msg.cardId;
                    if (!votes[msg.cardId]) votes[msg.cardId] = [];
                    votes[msg.cardId].push(msg.playerId);
                }
                logSystem(`[Voting] Player ${p ? p.name : 'Guest'} voted.`);
                
                checkAllVotesAndProceed();
            }
        }
    };
}

function initClientListeners(playerName) {
    channel.onmessage = (event) => {
        const msg = event.data;
        
        if (msg.type === 'JOIN_RESPONSE') {
            if (msg.targetName === playerName && myPlayerId === 0) {
                clearTimeout(window.joinHandshakeTimeout);
                myPlayerId = msg.playerId;
                maxPlayers = msg.maxPlayers;
                numBots = msg.numBots;
                winCondition = msg.winCondition;
                
                players = msg.players;
                showLobbyView();
            }
        }
        else if (msg.type === 'LOBBY_UPDATE') {
            players = msg.players;
            renderLobbyPlayers();
        }
        else if (msg.type === 'START_GAME') {
            players = msg.players;
            deck = msg.deck;
            storytellerIdx = msg.storytellerIdx;
            
            // Transition screen
            setupScreen.classList.remove("active");
            gameScreen.classList.add("active");
            
            logSystem("Joined multiplayer game!");
            startRound();
        }
        else if (msg.type === 'STATE_UPDATE') {
            gameState = msg.gameState;
            round = msg.round;
            storytellerIdx = msg.storytellerIdx;
            currentClue = msg.currentClue;
            storytellerClass = msg.storytellerClass;
            storytellerCardId = msg.storytellerCardId;
            submittedCards = msg.submittedCards;
            votes = msg.votes;
            players = msg.players;
            deck = { length: msg.deckCount }; // mock deck length for local checks
            
            syncClientUI();
        }
    };
    
    // Broadcast join request
    channel.postMessage({
        type: 'JOIN_REQUEST',
        senderName: playerName
    });
}

function broadcastLobbyUpdate() {
    channel.postMessage({
        type: 'LOBBY_UPDATE',
        players: players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot }))
    });
    renderLobbyPlayers();
}

function showLobbyView() {
    singleConfig.style.display = "none";
    multiConfig.style.display = "none";
    lobbyConfig.style.display = "block";
    
    document.getElementById("lobby-code-val").textContent = roomCode;
    renderLobbyPlayers();
}

function renderLobbyPlayers() {
    const list = document.getElementById("lobby-players-list");
    list.innerHTML = "";
    
    players.forEach(p => {
        const li = document.createElement("li");
        li.className = "lobby-player-row";
        
        let badge = "";
        if (p.id === 0) {
            badge = `<span class="badge-host">Host</span>`;
        } else if (p.isBot) {
            badge = `<span class="badge-bot">Bot</span>`;
        } else {
            badge = `<span class="badge-bot" style="border-color:var(--color-primary); color:var(--color-primary);">Guest</span>`;
        }
        
        li.innerHTML = `
            <span>${p.name}</span>
            ${badge}
        `;
        list.appendChild(li);
    });
    
    const humanCount = players.filter(p => !p.isBot).length;
    document.getElementById("lobby-count-val").textContent = humanCount;
    document.getElementById("lobby-max-val").textContent = maxPlayers;
    
    const actions = document.getElementById("lobby-actions");
    actions.innerHTML = "";
    
    if (isHost) {
        const startBtn = document.createElement("button");
        startBtn.className = "btn btn-primary btn-glow";
        startBtn.innerHTML = `Start Game <i class="fa-solid fa-play"></i>`;
        startBtn.onclick = startMultiplayerGame;
        actions.appendChild(startBtn);
    } else {
        const waitingText = document.createElement("p");
        waitingText.style.color = "var(--text-muted)";
        waitingText.style.fontStyle = "italic";
        waitingText.style.textAlign = "center";
        waitingText.textContent = "Waiting for host to start the game...";
        actions.appendChild(waitingText);
    }
}

function startMultiplayerGame() {
    // Generate card list
    deck = Object.keys(cardsMetadata);
    shuffle(deck);
    
    // Deal 6 cards to all players
    const CARDS_PER_PLAYER = 6;
    players.forEach(p => {
        p.hand = deck.splice(0, CARDS_PER_PLAYER);
    });
    
    // Randomize storyteller for the first round
    pickRandomStoryteller();
    
    // Signal start
    channel.postMessage({
        type: 'START_GAME',
        players: players,
        deck: deck,
        storytellerIdx: storytellerIdx
    });
    
    setupScreen.classList.remove("active");
    gameScreen.classList.add("active");
    
    logSystem("Lobby game launched!");
    startRound();
}

function broadcastState() {
    if (!isMultiplayer || !isHost) return;
    
    // Mask player IDs of submitted cards during active voting
    const clientSubmittedCards = submittedCards.map(s => {
        return {
            cardId: s.cardId,
            playerId: (gameState === "VOTING") ? null : s.playerId
        };
    });
    
    channel.postMessage({
        type: 'STATE_UPDATE',
        gameState,
        round,
        storytellerIdx,
        currentClue,
        storytellerClass,
        storytellerCardId: (gameState === "SCORING") ? storytellerCardId : null,
        submittedCards: clientSubmittedCards,
        votes: (gameState === "SCORING") ? votes : {},
        players: players,
        deckCount: deck.length
    });
}

function checkAllSubmissionsAndProceed() {
    const allSubmitted = submittedCards.length === players.length;
    if (allSubmitted) {
        setGameState("VOTING");
    } else {
        renderPlayerHand();
        renderBoardTablePlaceholder("Waiting for other players to submit cards...");
    }
    broadcastState();
}

function checkAllVotesAndProceed() {
    const votersCount = players.length - 1;
    let totalVotes = 0;
    Object.values(votes).forEach(arr => totalVotes += arr.length);
    
    if (totalVotes === votersCount) {
        setGameState("SCORING");
    } else {
        renderVotingBoard();
    }
}

// --------------------------------------------------------------------------
// 4. GAME STATE ENGINE
// --------------------------------------------------------------------------

function pickRandomStoryteller() {
    storytellerIdx = Math.floor(Math.random() * players.length);
}

function isMyTurn() {
    if (!isMultiplayer) {
        const storyteller = players[storytellerIdx];
        if (gameState === "STORYTELLER_TURN") {
            return !storyteller.isBot;
        }
        if (gameState === "CARDS_SUBMISSION") {
            return true;
        }
        if (gameState === "VOTING") {
            return storytellerIdx !== 0; // Player votes if they are not storyteller
        }
        return false;
    }
    
    // Multiplayer checks
    if (gameState === "STORYTELLER_TURN") {
        return storytellerIdx === myPlayerId;
    }
    if (gameState === "CARDS_SUBMISSION") {
        const isStoryteller = storytellerIdx === myPlayerId;
        const alreadySubmitted = submittedCards.some(s => s.playerId === myPlayerId);
        return !isStoryteller && !alreadySubmitted;
    }
    if (gameState === "VOTING") {
        const isStoryteller = storytellerIdx === myPlayerId;
        const myPlayerObj = players.find(p => p.id === myPlayerId);
        const alreadyVoted = myPlayerObj && myPlayerObj.votedCardId !== undefined;
        return !isStoryteller && !alreadyVoted;
    }
    return false;
}

function startGame() {
    const pName = document.getElementById("player-name").value.trim() || "Player";
    const botCount = parseInt(document.getElementById("bot-count").value);
    winCondition = document.getElementById("win-condition").value;
    
    isMultiplayer = false;
    isHost = false;
    myPlayerId = 0;
    
    // Create local single-player roster
    players = [
        { id: 0, name: pName, score: 0, isBot: false, hand: [] }
    ];
    for (let i = 1; i <= botCount; i++) {
        players.push({ id: i, name: `Bot_${i}`, score: 0, isBot: true, hand: [] });
    }
    
    // Shuffle deck
    deck = Object.keys(cardsMetadata);
    shuffle(deck);
    
    // Deal 6 cards
    const CARDS_PER_PLAYER = 6;
    players.forEach(p => {
        p.hand = deck.splice(0, CARDS_PER_PLAYER);
    });
    
    round = 1;
    pickRandomStoryteller(); // Randomly assign storyteller
    
    setupScreen.classList.remove("active");
    gameScreen.classList.add("active");
    
    logSystem(`Game started! Target: ${winCondition === 'score-30' ? 'Reach 30 points' : winCondition.split('-')[1] + ' rounds'}.`);
    startRound();
}

function startRound() {
    logSystem(`--- ROUND ${round} STARTED ---`);
    document.getElementById("round-num-label").textContent = `Round ${round}`;
    
    // Reset round variables
    currentClue = "";
    storytellerClass = "";
    storytellerCardId = "";
    submittedCards = [];
    votes = {};
    selectedHandCardId = null;
    selectedBoardCardId = null;
    tempRemovedCardId = null;
    tempRemovedCardIdx = null;
    
    // Setup storyteller details
    const storyteller = players[storytellerIdx];
    document.getElementById("storyteller-name-label").textContent = storyteller.name;
    document.getElementById("clue-text-label").textContent = "Waiting...";
    document.getElementById("clue-text-label").classList.remove("has-clue");
    
    updatePlayersSidebar();
    
    setGameState("STORYTELLER_TURN");
}

async function setGameState(newState) {
    gameState = newState;
    confirmBtn.classList.add("disabled");
    confirmBtn.disabled = true;
    
    const storyteller = players[storytellerIdx];
    
    if (gameState === "STORYTELLER_TURN") {
        phaseTitle.textContent = "Storyteller's Turn";
        
        if (isMultiplayer) {
            if (isHost && storyteller.isBot) {
                phaseInstruction.textContent = `Storyteller ${storyteller.name} is choosing a card and writing a clue...`;
                await runBotStoryteller(storyteller);
            } else if (storytellerIdx === myPlayerId) {
                phaseInstruction.textContent = "You are the Storyteller! Choose a card from your hand, then click confirm to write your clue.";
                renderPlayerHand();
                renderBoardTablePlaceholder("Select a card from your hand...");
            } else {
                phaseInstruction.textContent = `Storyteller ${storyteller.name} is choosing a card and writing a clue...`;
                renderPlayerHand();
                renderBoardTablePlaceholder(`Waiting for ${storyteller.name} to write clue...`);
            }
        } else {
            // Single Player
            if (storyteller.isBot) {
                phaseInstruction.textContent = `Storyteller ${storyteller.name} is choosing a card and writing a clue...`;
                await runBotStoryteller(storyteller);
            } else {
                phaseInstruction.textContent = "You are the Storyteller! Choose a card from your hand, then click confirm to write your clue.";
                renderPlayerHand();
                renderBoardTablePlaceholder("Select a card from your hand...");
            }
        }
    } 
    else if (gameState === "CARDS_SUBMISSION") {
        phaseTitle.textContent = "Card Submission";
        
        document.getElementById("clue-text-label").textContent = `"${currentClue}"`;
        document.getElementById("clue-text-label").classList.add("has-clue");
        
        const isStoryteller = storytellerIdx === myPlayerId;
        const hasSubmitted = submittedCards.some(s => s.playerId === myPlayerId);
        
        if (isStoryteller) {
            phaseInstruction.textContent = `You set the clue: "${currentClue}". Waiting for other players to submit cards...`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Other players are submitting cards...");
        } else if (hasSubmitted) {
            phaseInstruction.textContent = `You submitted your card. Waiting for other players...`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Waiting for other players to submit cards...");
        } else {
            phaseInstruction.textContent = `The Storyteller set the clue: "${currentClue}". Choose a card from your hand that matches this clue.`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Bots are choosing cards...");
        }
        
        // Host (or single player) triggers bot submissions
        if (!isMultiplayer || isHost) {
            setTimeout(() => {
                runBotsSubmission();
            }, 1500);
        }
    } 
    else if (gameState === "VOTING") {
        phaseTitle.textContent = "Voting Phase";
        
        const isStoryteller = storytellerIdx === myPlayerId;
        const myPlayerObj = players.find(p => p.id === myPlayerId);
        const hasVoted = myPlayerObj && myPlayerObj.votedCardId !== undefined;
        
        if (isStoryteller) {
            phaseInstruction.textContent = "You are the Storyteller (you cannot vote). Waiting for other players to vote...";
            renderVotingBoard();
        } else if (hasVoted) {
            phaseInstruction.textContent = "You cast your vote. Waiting for other players to finish voting...";
            renderVotingBoard();
        } else {
            phaseInstruction.textContent = `Guess which card belongs to the Storyteller (${players[storytellerIdx].name}). You cannot vote for your own card!`;
            renderVotingBoard();
        }
        
        // Host (or single player) triggers bot votes
        if (!isMultiplayer || isHost) {
            setTimeout(() => {
                runBotsVoting();
            }, 1500);
        }
    } 
    else if (gameState === "SCORING") {
        phaseTitle.textContent = "Round Summary";
        phaseInstruction.textContent = "Behold the votes and details of the AI analysis for each card.";
        
        if (!isMultiplayer || isHost) {
            calculateScores();
        }
    }
}

// --------------------------------------------------------------------------
// Bot Actions
// --------------------------------------------------------------------------
async function runBotStoryteller(bot) {
    const chosenCardIdx = Math.floor(Math.random() * bot.hand.length);
    storytellerCardId = bot.hand[chosenCardIdx];
    
    const meta = cardsMetadata[storytellerCardId];
    storytellerClass = meta.top_classes[0][0];
    
    const keywordsList = KEYWORDS[storytellerClass] || ["mystery"];
    currentClue = keywordsList[Math.floor(Math.random() * keywordsList.length)];
    
    logSystem(`[Storyteller] Bot ${bot.name} selected a card and set the clue: "${currentClue}" (Class: ${storytellerClass})`);
    
    bot.hand.splice(chosenCardIdx, 1);
    submittedCards.push({ playerId: bot.id, cardId: storytellerCardId });
    
    setTimeout(() => {
        setGameState("CARDS_SUBMISSION");
        if (isMultiplayer && isHost) broadcastState();
    }, 1500);
}

async function runBotsSubmission() {
    const storyteller = players[storytellerIdx];
    const clueEmbedding = await getEmbedding(currentClue);
    
    for (let p of players) {
        if (p.id === storyteller.id || !p.isBot) continue;
        
        let bestCardIdx = 0;
        let bestScore = -1;
        
        p.hand.forEach((cardId, idx) => {
            const scoreDetails = calculateCardScore(cardId, storytellerClass, clueEmbedding);
            if (scoreDetails.total > bestScore) {
                bestScore = scoreDetails.total;
                bestCardIdx = idx;
            }
        });
        
        const chosenCardId = p.hand[bestCardIdx];
        p.hand.splice(bestCardIdx, 1);
        submittedCards.push({ playerId: p.id, cardId: chosenCardId });
        
        logSystem(`[Submission] Bot ${p.name} played a card.`);
    }
    
    updatePlayersSidebar();
    
    if (isMultiplayer && isHost) {
        checkAllSubmissionsAndProceed();
    } else {
        const humanSubmitted = submittedCards.some(s => s.playerId === 0);
        if (storyteller.id === 0 || humanSubmitted) {
            setGameState("VOTING");
        } else {
            confirmBtn.classList.remove("disabled");
            confirmBtn.disabled = false;
            renderPlayerHand();
        }
    }
}

async function runBotsVoting() {
    const storyteller = players[storytellerIdx];
    const clueEmbedding = await getEmbedding(currentClue);
    
    players.forEach(p => {
        if (p.id === storyteller.id || !p.isBot) return;
        
        const botSubmittedCard = submittedCards.find(s => s.playerId === p.id).cardId;
        
        let bestCardId = null;
        let bestScore = -1;
        
        submittedCards.forEach(s => {
            if (s.cardId === botSubmittedCard) return;
            
            const scoreDetails = calculateCardScore(s.cardId, storytellerClass, clueEmbedding);
            if (scoreDetails.total > bestScore) {
                bestScore = scoreDetails.total;
                bestCardId = s.cardId;
            }
        });
        
        p.votedCardId = bestCardId;
        if (!votes[bestCardId]) votes[bestCardId] = [];
        votes[bestCardId].push(p.id);
        
        logSystem(`[Voting] Bot ${p.name} cast their vote.`);
    });
    
    updatePlayersSidebar();
    
    if (isMultiplayer && isHost) {
        checkAllVotesAndProceed();
    } else {
        if (storyteller.id === 0) {
            setGameState("SCORING");
        } else {
            const humanVoted = players[0].votedCardId !== undefined;
            if (humanVoted) {
                setGameState("SCORING");
            } else {
                confirmBtn.classList.add("disabled");
                confirmBtn.disabled = true;
            }
        }
    }
}

// --------------------------------------------------------------------------
// POINTS SCORING
// --------------------------------------------------------------------------
function calculateScores() {
    const storyteller = players[storytellerIdx];
    
    const storytellerVotes = votes[storytellerCardId] || [];
    const correctVoterIds = storytellerVotes;
    const numOtherPlayers = players.length - 1;
    
    let logsHtml = "";
    
    if (correctVoterIds.length === 0 || correctVoterIds.length === numOtherPlayers) {
        storyteller.roundPoints = 0;
        
        players.forEach(p => {
            if (p.id === storyteller.id) return;
            p.roundPoints = 2;
            const myCardObj = submittedCards.find(s => s.playerId === p.id);
            const myCard = myCardObj ? myCardObj.cardId : null;
            const myVotesCount = myCard ? (votes[myCard] || []).length : 0;
            p.roundPoints += myVotesCount;
        });
        
        if (correctVoterIds.length === 0) {
            logsHtml += `<p class="log-entry score-update"><i class="fa-solid fa-face-frown"></i> No one guessed the Storyteller's card! The Storyteller gets 0 pts, everyone else gets 2 pts + bonuses.</p>`;
        } else {
            logsHtml += `<p class="log-entry score-update"><i class="fa-solid fa-circle-check"></i> Everyone guessed the Storyteller's card! The Storyteller gets 0 pts, everyone else gets 2 pts + bonuses.</p>`;
        }
    } 
    else {
        storyteller.roundPoints = 3;
        
        players.forEach(p => {
            if (p.id === storyteller.id) return;
            p.roundPoints = 0;
            
            if (p.votedCardId === storytellerCardId) {
                p.roundPoints += 3;
            }
            
            const myCardObj = submittedCards.find(s => s.playerId === p.id);
            const myCard = myCardObj ? myCardObj.cardId : null;
            const myVotesCount = myCard ? (votes[myCard] || []).length : 0;
            p.roundPoints += myVotesCount;
        });
        
        logsHtml += `<p class="log-entry score-update"><i class="fa-solid fa-scale-balanced"></i> Some players guessed the Storyteller's card. The Storyteller and correct guessers receive 3 pts, others get voting bonuses.</p>`;
    }
    
    players.forEach(p => {
        p.score += p.roundPoints;
        logsHtml += `<p class="log-entry"><span class="time">[Score]</span> ${p.name}: +${p.roundPoints} pts (Total: ${p.score} pts)</p>`;
    });
    
    gameLogs.innerHTML += logsHtml;
    gameLogs.scrollTop = gameLogs.scrollHeight;
    
    renderRevealBoard();
    updatePlayersSidebar();
    
    if (isMultiplayer && isHost) {
        broadcastState();
    }
    
    if (checkEndGame()) {
        confirmBtn.innerHTML = `Finish Journey <i class="fa-solid fa-trophy"></i>`;
        confirmBtn.className = "btn btn-primary btn-glow";
        confirmBtn.disabled = false;
        confirmBtn.onclick = showEndgameModal;
    } else {
        confirmBtn.innerHTML = `Next Round <i class="fa-solid fa-arrow-right"></i>`;
        confirmBtn.className = "btn btn-primary btn-glow";
        confirmBtn.disabled = false;
        confirmBtn.onclick = () => {
            if (isMultiplayer && isHost) {
                channel.postMessage({ type: 'NEXT_ROUND' });
            }
            nextRound();
        };
    }
}

function checkEndGame() {
    if (winCondition === "score-30") {
        return players.some(p => p.score >= 30);
    } else if (winCondition.startsWith("rounds-")) {
        const maxRounds = parseInt(winCondition.split("-")[1]);
        return round >= maxRounds;
    }
    return false;
}

function nextRound() {
    // Draw back up to 6 cards (only host manages the deck)
    players.forEach(p => {
        if (deck.length > 0) {
            p.hand.push(deck.pop());
        }
    });
    
    // Rotate Storyteller randomly
    pickRandomStoryteller();
    
    confirmBtn.innerHTML = `Confirm Selection <i class="fa-solid fa-check"></i>`;
    confirmBtn.className = "btn btn-success btn-glow disabled";
    confirmBtn.disabled = true;
    confirmBtn.onclick = confirmAction;
    
    players.forEach(p => {
        delete p.votedCardId;
        delete p.roundPoints;
    });
    
    round++;
    startRound();
    
    if (isMultiplayer && isHost) {
        broadcastState();
    }
}

// --------------------------------------------------------------------------
// PLAYER INTERACTIONS
// --------------------------------------------------------------------------

function selectHandCard(cardId) {
    if (gameState !== "STORYTELLER_TURN" && gameState !== "CARDS_SUBMISSION") return;
    
    if (!isMyTurn()) return;
    
    if (selectedHandCardId === cardId) {
        selectedHandCardId = null;
        renderPlayerHand();
        confirmBtn.classList.add("disabled");
        confirmBtn.disabled = true;
        logSystem(`[Selection] Card deselected.`);
    } else {
        selectedHandCardId = cardId;
        renderPlayerHand();
        confirmBtn.classList.remove("disabled");
        confirmBtn.disabled = false;
        logSystem(`[Selection] Card selected from hand.`);
    }
}

function selectBoardCard(cardId) {
    if (gameState !== "VOTING") return;
    
    if (!isMyTurn()) return;
    
    const mySubmittedCardObj = submittedCards.find(s => s.playerId === myPlayerId);
    const mySubmittedCard = mySubmittedCardObj ? mySubmittedCardObj.cardId : null;
    if (cardId === mySubmittedCard) {
        logSystem(`[Error] You cannot vote for your own played card!`);
        return;
    }
    
    if (selectedBoardCardId === cardId) {
        selectedBoardCardId = null;
        renderVotingBoard();
        confirmBtn.classList.add("disabled");
        confirmBtn.disabled = true;
        logSystem(`[Voting] Card deselected.`);
    } else {
        selectedBoardCardId = cardId;
        renderVotingBoard();
        confirmBtn.classList.remove("disabled");
        confirmBtn.disabled = false;
        logSystem(`[Voting] Selected card as your guess.`);
    }
}

function confirmAction() {
    if (gameState === "STORYTELLER_TURN") {
        if (!selectedHandCardId) return;
        
        // Hide card locally first
        const idx = players.find(p => p.id === myPlayerId).hand.indexOf(selectedHandCardId);
        if (idx !== -1) {
            tempRemovedCardId = selectedHandCardId;
            tempRemovedCardIdx = idx;
            players.find(p => p.id === myPlayerId).hand.splice(idx, 1);
            renderPlayerHand();
        }
        
        openClueModal(tempRemovedCardId);
    } 
    else if (gameState === "CARDS_SUBMISSION") {
        if (!selectedHandCardId) return;
        
        if (isMultiplayer && !isHost) {
            channel.postMessage({
                type: 'SUBMIT_CARD',
                playerId: myPlayerId,
                cardId: selectedHandCardId
            });
            confirmBtn.classList.add("disabled");
            confirmBtn.disabled = true;
            
            // Hide card locally
            const p = players.find(x => x.id === myPlayerId);
            const idx = p.hand.indexOf(selectedHandCardId);
            if (idx !== -1) p.hand.splice(idx, 1);
            
            selectedHandCardId = null;
            renderPlayerHand();
            renderBoardTablePlaceholder("Waiting for Host to sync...");
            return;
        }
        
        // Host / Single Player submission logic
        const idx = players[0].hand.indexOf(selectedHandCardId);
        players[0].hand.splice(idx, 1);
        submittedCards.push({ playerId: 0, cardId: selectedHandCardId });
        logSystem(`[Selection] Card selection confirmed.`);
        
        selectedHandCardId = null;
        
        if (isMultiplayer && isHost) {
            checkAllSubmissionsAndProceed();
        } else {
            const allSubmitted = submittedCards.length === players.length;
            if (allSubmitted) {
                setGameState("VOTING");
            } else {
                confirmBtn.classList.add("disabled");
                confirmBtn.disabled = true;
                renderPlayerHand();
                renderBoardTablePlaceholder("Waiting for bots to submit...");
            }
        }
    } 
    else if (gameState === "VOTING") {
        if (!selectedBoardCardId) return;
        
        if (isMultiplayer && !isHost) {
            channel.postMessage({
                type: 'SUBMIT_VOTE',
                playerId: myPlayerId,
                cardId: selectedBoardCardId
            });
            confirmBtn.classList.add("disabled");
            confirmBtn.disabled = true;
            selectedBoardCardId = null;
            renderVotingBoard();
            return;
        }
        
        // Host / Single Player voting logic
        players[0].votedCardId = selectedBoardCardId;
        if (!votes[selectedBoardCardId]) votes[selectedBoardCardId] = [];
        votes[selectedBoardCardId].push(0);
        logSystem(`[Voting] Vote confirmed.`);
        
        selectedBoardCardId = null;
        
        if (isMultiplayer && isHost) {
            checkAllVotesAndProceed();
        } else {
            const votersCount = players.length - 1;
            let totalVotes = 0;
            Object.values(votes).forEach(arr => totalVotes += arr.length);
            
            if (totalVotes === votersCount) {
                setGameState("SCORING");
            } else {
                confirmBtn.classList.add("disabled");
                confirmBtn.disabled = true;
                renderVotingBoard();
            }
        }
    }
}

// --------------------------------------------------------------------------
// CLUE PROMPT MODAL
// --------------------------------------------------------------------------
function openClueModal(cardId) {
    modalSelectedCardImg.src = `generated_images/${cardId}`;
    clueInput.value = "";
    
    // AI suggestions
    const meta = cardsMetadata[cardId];
    aiSuggestionsList.innerHTML = "";
    
    if (meta && meta.top_classes) {
        meta.top_classes.forEach(([className, prob]) => {
            const wordsList = KEYWORDS[className] || [];
            const shuffledWords = [...wordsList].sort(() => 0.5 - Math.random()).slice(0, 3);
            shuffledWords.forEach(w => {
                const tag = document.createElement("span");
                tag.className = "suggest-tag";
                tag.textContent = w;
                tag.onclick = () => {
                    clueInput.value = w;
                    clueInput.focus();
                };
                aiSuggestionsList.appendChild(tag);
            });
        });
    }
    
    clueModal.classList.add("active");
    clueInput.focus();
}

function closeClueModal() {
    clueModal.classList.remove("active");
    // Restore the card locally if they cancel the modal
    if (tempRemovedCardId !== null && tempRemovedCardIdx !== null) {
        players.find(p => p.id === myPlayerId).hand.splice(tempRemovedCardIdx, 0, tempRemovedCardId);
        selectedHandCardId = tempRemovedCardId;
        tempRemovedCardId = null;
        tempRemovedCardIdx = null;
        renderPlayerHand();
    }
}

async function submitClue() {
    const clueText = clueInput.value.trim();
    if (!clueText) {
        alert("Please enter a clue!");
        return;
    }
    
    currentClue = clueText;
    const activeCardId = selectedHandCardId || tempRemovedCardId;
    
    if (isMultiplayer && !isHost) {
        channel.postMessage({
            type: 'SUBMIT_CLUE',
            playerId: myPlayerId,
            cardId: activeCardId,
            clueText: clueText
        });
        
        // Reset local trackers
        tempRemovedCardId = null;
        tempRemovedCardIdx = null;
        selectedHandCardId = null;
        closeClueModal();
        return;
    }
    
    // Host / Single Player clue submission
    const meta = cardsMetadata[activeCardId];
    storytellerClass = meta.top_classes[0][0];
    storytellerCardId = activeCardId;
    
    submittedCards.push({ playerId: 0, cardId: activeCardId });
    
    logSystem(`[Storyteller] You set the clue: "${currentClue}" (Your card: ${activeCardId}, Class: ${storytellerClass})`);
    
    // Clear temp variables
    tempRemovedCardId = null;
    tempRemovedCardIdx = null;
    selectedHandCardId = null;
    
    closeClueModal();
    
    if (isMultiplayer && isHost) broadcastState();
    
    setGameState("CARDS_SUBMISSION");
}

// --------------------------------------------------------------------------
// CLIENT SYNC UI ENGINE
// --------------------------------------------------------------------------
function syncClientUI() {
    document.getElementById("round-num-label").textContent = `Round ${round}`;
    
    const storyteller = players.find(p => p.id === storytellerIdx);
    document.getElementById("storyteller-name-label").textContent = storyteller ? storyteller.name : 'Unknown';
    
    if (currentClue) {
        document.getElementById("clue-text-label").textContent = `"${currentClue}"`;
        document.getElementById("clue-text-label").classList.add("has-clue");
    } else {
        document.getElementById("clue-text-label").textContent = "Waiting...";
        document.getElementById("clue-text-label").classList.remove("has-clue");
    }
    
    confirmBtn.classList.add("disabled");
    confirmBtn.disabled = true;
    
    if (gameState === "STORYTELLER_TURN") {
        phaseTitle.textContent = "Storyteller's Turn";
        if (storytellerIdx === myPlayerId) {
            phaseInstruction.textContent = "You are the Storyteller! Choose a card from your hand, then click confirm to write your clue.";
            renderPlayerHand();
            renderBoardTablePlaceholder("Select a card from your hand...");
        } else {
            phaseInstruction.textContent = `Storyteller ${storyteller.name} is choosing a card and writing a clue...`;
            renderPlayerHand();
            renderBoardTablePlaceholder(`Waiting for ${storyteller.name} to write clue...`);
        }
    } 
    else if (gameState === "CARDS_SUBMISSION") {
        phaseTitle.textContent = "Card Submission";
        const isStoryteller = storytellerIdx === myPlayerId;
        const hasSubmitted = submittedCards.some(s => s.playerId === myPlayerId);
        
        if (isStoryteller) {
            phaseInstruction.textContent = `You set the clue: "${currentClue}". Waiting for other players to submit cards...`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Other players are submitting cards...");
        } else if (hasSubmitted) {
            phaseInstruction.textContent = `You submitted your card. Waiting for other players...`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Waiting for other players to submit cards...");
        } else {
            phaseInstruction.textContent = `The Storyteller set the clue: "${currentClue}". Choose a card from your hand that matches this clue.`;
            renderPlayerHand();
            renderBoardTablePlaceholder("Choose a card matching the clue...");
        }
    } 
    else if (gameState === "VOTING") {
        phaseTitle.textContent = "Voting Phase";
        const isStoryteller = storytellerIdx === myPlayerId;
        const myPlayerObj = players.find(p => p.id === myPlayerId);
        const hasVoted = myPlayerObj && myPlayerObj.votedCardId !== undefined;
        
        if (isStoryteller) {
            phaseInstruction.textContent = "You are the Storyteller (you cannot vote). Waiting for other players to vote...";
            renderVotingBoard();
        } else if (hasVoted) {
            phaseInstruction.textContent = "You cast your vote. Waiting for other players to finish voting...";
            renderVotingBoard();
        } else {
            phaseInstruction.textContent = `Guess which card belongs to the Storyteller (${storyteller.name}). You cannot vote for your own card!`;
            renderVotingBoard();
        }
    } 
    else if (gameState === "SCORING") {
        phaseTitle.textContent = "Round Summary";
        phaseInstruction.textContent = "Behold the votes and details of the AI analysis for each card.";
        
        renderRevealBoard();
    }
    
    updatePlayersSidebar();
}

// --------------------------------------------------------------------------
// CARD DETAIL MODAL (ZOOM)
// --------------------------------------------------------------------------
async function zoomCard(cardId) {
    const meta = cardsMetadata[cardId];
    if (!meta) return;
    
    zoomImg.src = `generated_images/${cardId}`;
    zoomCaption.textContent = meta.caption;
    
    zoomClasses.innerHTML = "";
    meta.top_classes.forEach(([className, prob]) => {
        const pill = document.createElement("span");
        pill.className = "class-pill";
        pill.innerHTML = `${className} <span class="score">${Math.round(prob * 100)}%</span>`;
        zoomClasses.appendChild(pill);
    });
    
    if (currentClue && (gameState === "VOTING" || gameState === "SCORING")) {
        zoomMatchContainer.style.display = "block";
        const clueEmbedding = await getEmbedding(currentClue);
        const scores = calculateCardScore(cardId, storytellerClass, clueEmbedding);
        
        const percentage = Math.round(scores.total * 100);
        zoomMatchBar.style.width = `${percentage}%`;
        zoomMatchBar.textContent = `${percentage}%`;
        
        zoomMatchDetails.textContent = `Class: ${Math.round(scores.classScore * 100)}% | Semantic Similarity: ${Math.round((scores.embScore / 0.4) * 100)}%`;
    } else {
        zoomMatchContainer.style.display = "none";
    }
    
    zoomModal.classList.add("active");
}

function closeZoomModal() {
    zoomModal.classList.remove("active");
}

// --------------------------------------------------------------------------
// ENDGAME SUMMARY MODAL
// --------------------------------------------------------------------------
function showEndgameModal() {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    
    endgameMessage.innerHTML = `Player <strong style="color:var(--color-warning); font-size:1.3rem;">${winner.name}</strong> has emerged victorious with <strong>${winner.score} pts</strong>!`;
    
    endgameTable.innerHTML = "";
    sorted.forEach((p, idx) => {
        const tr = document.createElement("tr");
        if (p.id === winner.id) tr.className = "winner-row";
        
        tr.innerHTML = `
            <td><strong>${idx + 1}</strong></td>
            <td>${p.name} ${p.isBot ? '<i class="fa-solid fa-robot" style="color:var(--color-secondary)"></i>' : '<i class="fa-solid fa-user" style="color:var(--color-primary)"></i>'}</td>
            <td><strong>${p.score} pts</strong></td>
        `;
        endgameTable.appendChild(tr);
    });
    
    endgameModal.classList.add("active");
}

// --------------------------------------------------------------------------
// RENDERING AND WIDGETS
// --------------------------------------------------------------------------

function updatePlayersSidebar() {
    playersList.innerHTML = "";
    players.forEach(p => {
        const div = document.createElement("div");
        div.className = `player-item ${p.id === storytellerIdx ? 'is-storyteller' : ''}`;
        
        let statusText = "Waiting";
        if (gameState === "STORYTELLER_TURN" && p.id === storytellerIdx) {
            statusText = "Writing clue...";
            div.classList.add("active-turn");
        } else if (gameState === "CARDS_SUBMISSION") {
            const hasSubmitted = submittedCards.some(s => s.playerId === p.id);
            statusText = hasSubmitted ? "Ready" : "Choosing card...";
            if (!hasSubmitted) div.classList.add("active-turn");
        } else if (gameState === "VOTING") {
            if (p.id === storytellerIdx) {
                statusText = "Storyteller";
            } else {
                const hasVoted = p.votedCardId !== undefined;
                statusText = hasVoted ? "Voted" : "Voting...";
                if (!hasVoted) div.classList.add("active-turn");
            }
        }
        
        div.innerHTML = `
            <div class="player-avatar ${p.isBot ? 'bot' : 'human'}">
                <i class="fa-solid ${p.isBot ? 'fa-robot' : 'fa-user'}"></i>
            </div>
            <div class="player-info">
                <span class="player-name">${p.name}</span>
                <span class="player-badge">${p.id === storytellerIdx ? 'Storyteller' : statusText}</span>
            </div>
            <div class="player-score">${p.score}</div>
        `;
        playersList.appendChild(div);
    });
}

function renderPlayerHand() {
    playerHand.innerHTML = "";
    const me = players.find(p => p.id === myPlayerId);
    
    if (!me || !me.hand || me.hand.length === 0) {
        playerHand.innerHTML = `<p style="color:var(--text-muted); font-style:italic;">No cards in hand.</p>`;
        return;
    }
    
    me.hand.forEach(cardId => {
        const wrapper = document.createElement("div");
        wrapper.className = "card-wrapper";
        
        const cardDiv = document.createElement("div");
        cardDiv.className = `card ${selectedHandCardId === cardId ? 'selected' : ''}`;
        
        cardDiv.innerHTML = `
            <div class="card-face card-front">
                <img src="generated_images/${cardId}" alt="Card in hand">
            </div>
        `;
        
        // programmatically bind front click to prevent module scope limitations
        cardDiv.querySelector('.card-front').onclick = () => selectHandCard(cardId);
        
        const zoomBtn = document.createElement("button");
        zoomBtn.className = "card-zoom-btn";
        zoomBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i>`;
        zoomBtn.style.position = "absolute";
        zoomBtn.style.top = "5px";
        zoomBtn.style.right = "5px";
        zoomBtn.style.zIndex = "5";
        zoomBtn.style.background = "rgba(0,0,0,0.6)";
        zoomBtn.style.color = "#fff";
        zoomBtn.style.border = "none";
        zoomBtn.style.borderRadius = "50%";
        zoomBtn.style.width = "28px";
        zoomBtn.style.height = "28px";
        zoomBtn.style.cursor = "pointer";
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            zoomCard(cardId);
        };
        
        cardDiv.appendChild(zoomBtn);
        wrapper.appendChild(cardDiv);
        playerHand.appendChild(wrapper);
    });
}

function renderBoardTablePlaceholder(message) {
    boardTable.className = "board-table empty";
    boardTable.innerHTML = `
        <div class="table-placeholder">
            <i class="fa-solid fa-hourglass-half fa-spin" style="color:var(--color-secondary)"></i>
            <p>${message}</p>
        </div>
    `;
}

// Render voting board
function renderVotingBoard() {
    boardTable.className = "board-table";
    boardTable.innerHTML = "";
    
    const sortedSubmissions = [...submittedCards].sort((a, b) => a.cardId.localeCompare(b.cardId));
    
    sortedSubmissions.forEach(sub => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-card-container";
        
        const isMyCard = sub.playerId === myPlayerId;
        const isSelected = selectedBoardCardId === sub.cardId;
        
        const cardDiv = document.createElement("div");
        cardDiv.className = `card ${isSelected ? 'selected' : ''}`;
        
        cardDiv.innerHTML = `
            <div class="card-face card-front">
                <img src="generated_images/${sub.cardId}" alt="Card on table">
            </div>
        `;
        
        // programmatically bind front click to prevent module scope limitations
        cardDiv.querySelector('.card-front').onclick = () => selectBoardCard(sub.cardId);
        
        const zoomBtn = document.createElement("button");
        zoomBtn.className = "card-zoom-btn";
        zoomBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i>`;
        zoomBtn.style.position = "absolute";
        zoomBtn.style.top = "5px";
        zoomBtn.style.right = "5px";
        zoomBtn.style.zIndex = "5";
        zoomBtn.style.background = "rgba(0,0,0,0.6)";
        zoomBtn.style.color = "#fff";
        zoomBtn.style.border = "none";
        zoomBtn.style.borderRadius = "50%";
        zoomBtn.style.width = "28px";
        zoomBtn.style.height = "28px";
        zoomBtn.style.cursor = "pointer";
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            zoomCard(sub.cardId);
        };
        cardDiv.appendChild(zoomBtn);
        
        const label = document.createElement("span");
        label.className = "owner-badge";
        label.textContent = isMyCard ? "Your Card" : "Revealed";
        
        wrapper.appendChild(cardDiv);
        wrapper.appendChild(label);
        boardTable.appendChild(wrapper);
    });
    
    renderDebugPanel();
}

// Render revealed board with owners and vote tallies
function renderRevealBoard() {
    boardTable.className = "board-table";
    boardTable.innerHTML = "";
    
    const sortedSubmissions = [...submittedCards].sort((a, b) => a.cardId.localeCompare(b.cardId));
    
    sortedSubmissions.forEach(sub => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-card-container";
        
        const owner = players.find(p => p.id === sub.playerId);
        const cardVotes = votes[sub.cardId] || [];
        
        const cardDiv = document.createElement("div");
        const isStorytellerCard = sub.cardId === storytellerCardId;
        cardDiv.className = `card no-hover ${isStorytellerCard ? 'selected' : ''}`;
        
        cardDiv.innerHTML = `
            <div class="card-face card-front">
                <img src="generated_images/${sub.cardId}" alt="Card">
            </div>
        `;
        
        const zoomBtn = document.createElement("button");
        zoomBtn.className = "card-zoom-btn";
        zoomBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i>`;
        zoomBtn.style.position = "absolute";
        zoomBtn.style.top = "5px";
        zoomBtn.style.right = "5px";
        zoomBtn.style.zIndex = "5";
        zoomBtn.style.background = "rgba(0,0,0,0.6)";
        zoomBtn.style.color = "#fff";
        zoomBtn.style.border = "none";
        zoomBtn.style.borderRadius = "50%";
        zoomBtn.style.width = "28px";
        zoomBtn.style.height = "28px";
        zoomBtn.style.cursor = "pointer";
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            zoomCard(sub.cardId);
        };
        cardDiv.appendChild(zoomBtn);
        
        const ownerLabel = document.createElement("span");
        ownerLabel.className = `owner-badge ${isStorytellerCard ? 'is-storyteller' : ''}`;
        ownerLabel.textContent = `${owner ? owner.name : 'Guest'} ${isStorytellerCard ? '(Storyteller)' : ''}`;
        
        const votesBadges = document.createElement("div");
        votesBadges.className = "votes-badges";
        
        cardVotes.forEach(voterId => {
            const voter = players.find(p => p.id === voterId);
            const badge = document.createElement("span");
            badge.className = "vote-badge";
            badge.innerHTML = `<i class="fa-solid fa-thumbs-up"></i> ${voter ? voter.name : 'Guest'}`;
            votesBadges.appendChild(badge);
        });
        
        wrapper.appendChild(cardDiv);
        wrapper.appendChild(ownerLabel);
        wrapper.appendChild(votesBadges);
        boardTable.appendChild(wrapper);
    });
    
    renderDebugPanel();
}

// Render bot analysis thoughts debug panel
async function renderDebugPanel() {
    if (!toggleThoughts.checked) {
        debugLogContainer.innerHTML = `
            <div class="debug-welcome">
                <i class="fa-solid fa-eye-slash"></i>
                <p>Bot analysis is hidden. Turn on the switch above to display.</p>
            </div>
        `;
        return;
    }
    
    if (!currentClue || submittedCards.length === 0) {
        debugLogContainer.innerHTML = `
            <div class="debug-welcome">
                <i class="fa-solid fa-circle-info"></i>
                <p>AI analysis will appear here during card submission and voting phases.</p>
            </div>
        `;
        return;
    }
    
    debugLogContainer.innerHTML = `<p style="color:var(--color-secondary); font-weight:600; margin-bottom:10px;">Clue match analysis: "${currentClue}"</p>`;
    
    const clueEmbedding = await getEmbedding(currentClue);
    
    submittedCards.forEach(sub => {
        const owner = players.find(p => p.id === sub.playerId);
        const cardData = cardsMetadata[sub.cardId];
        if (!cardData) return;
        
        const scoreDetails = calculateCardScore(sub.cardId, storytellerClass, clueEmbedding);
        
        const div = document.createElement("div");
        div.className = "debug-card-analysis";
        
        const classStrings = cardData.top_classes.map(([cl, sc]) => `${cl} (${Math.round(sc*100)}%)`).join(', ');
        
        div.innerHTML = `
            <div class="debug-card-title">${owner ? owner.name : 'Guest'} - ${sub.cardId}</div>
            <div class="debug-caption">"<strong>BLIP Description:</strong> ${cardData.caption}"</div>
            <div class="debug-stats">
                <span><i class="fa-solid fa-tags"></i> Keras Top Classes: ${classStrings}</span>
                <span><i class="fa-solid fa-chart-simple"></i> Overall match: <strong class="debug-score">${Math.round(scoreDetails.total * 100)}%</strong></span>
                <span style="font-size:0.75rem; color:var(--text-muted);">↳ (Keras Class Score: ${Math.round(scoreDetails.classScore * 100)}% + NLP Embedding Score: ${Math.round((scoreDetails.embScore / 0.4) * 100)}%)</span>
            </div>
        `;
        debugLogContainer.appendChild(div);
    });
}

// --------------------------------------------------------------------------
// 5. SYSTEM LOGGER
// --------------------------------------------------------------------------

function logSystem(message) {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const p = document.createElement("p");
    p.className = "log-entry system";
    p.innerHTML = `<span class="time">[${time}]</span> ${message}`;
    gameLogs.appendChild(p);
    gameLogs.scrollTop = gameLogs.scrollHeight;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// --------------------------------------------------------------------------
// PROGRAMMATIC EVENT LISTENERS & BINDINGS
// --------------------------------------------------------------------------

// Mode toggles
modeSingleBtn.onclick = () => {
    modeSingleBtn.className = "btn btn-primary btn-glow active";
    modeMultiBtn.className = "btn btn-secondary";
    singleConfig.style.display = "block";
    multiConfig.style.display = "none";
    lobbyConfig.style.display = "none";
};

modeMultiBtn.onclick = () => {
    modeMultiBtn.className = "btn btn-primary btn-glow active";
    modeSingleBtn.className = "btn btn-secondary";
    singleConfig.style.display = "none";
    multiConfig.style.display = "block";
    lobbyConfig.style.display = "none";
};

// Create / Join Actions
actionCreateBtn.onclick = () => {
    actionCreateBtn.className = "btn btn-primary btn-glow active";
    actionJoinBtn.className = "btn btn-secondary";
    createRoomConfig.style.display = "block";
    joinRoomConfig.style.display = "none";
};

actionJoinBtn.onclick = () => {
    actionJoinBtn.className = "btn btn-primary btn-glow active";
    actionCreateBtn.className = "btn btn-secondary";
    createRoomConfig.style.display = "none";
    joinRoomConfig.style.display = "block";
};

// Submit lobby requests
createRoomSubmitBtn.onclick = createRoom;
joinRoomSubmitBtn.onclick = joinRoom;

document.getElementById("start-game-btn").onclick = startGame;
confirmBtn.onclick = confirmAction;

cancelClueBtn.onclick = closeClueModal;
submitClueBtn.onclick = submitClue;
closeZoomBtn.onclick = closeZoomModal;
restartGameBtn.onclick = () => {
    endgameModal.classList.remove("active");
    if (isMultiplayer) {
        if ( isHost) {
            startGame(); // restart multiplayer context (can re-deal)
        }
    } else {
        startGame();
    }
};

toggleThoughts.onchange = renderDebugPanel;

// Clue Modal input submit on Enter
clueInput.onkeydown = (e) => {
    if (e.key === "Enter") {
        submitClue();
    }
};

// Modal close on clicking overlay backdrop
window.onclick = (e) => {
    if (e.target === clueModal) closeClueModal();
    if (e.target === zoomModal) closeZoomModal();
};

// Launch application
init();
export {};
