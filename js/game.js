class Minesweeper {
    constructor() {
        /* ============== Socket.IO インスタンス ============== */
        this.socket = io();      // 自動接続

        /* ============== ゲーム状態プロパティ ============== */
        this.board        = [];
        this.gameStarted  = false;
        this.playerId     = null;   
        this.playerName   = '';
        this.roomCode     = null;
        this.isHost       = false;
        this.players      = new Map();
        this.totalRevealed= 0;
        this.activeTab    = 'chat';
        this.boundSocketHandlers = new Map();
        this.timerInterval = null;
        this.timerValue    = 0;
        this._pendingUpdates = [];  
        this._rafId          = null;
        /* ---------------------------------------------------- */

        /* ============== DOM 要素 ============== */
        this.joinSection         = document.getElementById('join-section');
        this.roomInfo            = document.getElementById('room-info');
        this.boardElement        = document.getElementById('game-board');
        this.difficultySelect    = document.getElementById('difficulty');
        this.newGameButton       = document.getElementById('new-game');
        this.timerElement        = document.getElementById('timer');
        this.minesLeftElement    = document.getElementById('mines-left');
        this.overlay             = document.getElementById('game-overlay');
        this.overlayIcon         = document.getElementById('overlay-icon');
        this.overlayMessage      = document.getElementById('overlay-message');
        this.overlayCloseButton  = document.getElementById('overlay-close');
        this.playerListElement   = document.querySelector('#player-list .players');
        this.chatMessages        = document.getElementById('chat-messages');
        this.gameLogMessages     = document.getElementById('game-log-messages');
        this.chatInput           = document.getElementById('chat-message');
        this.sendMessageButton   = document.getElementById('send-message');
        this.playerNameInput     = document.getElementById('player-name');
        this.joinPlayerNameInput = document.getElementById('join-player-name');
        this.roomCodeInput       = document.getElementById('room-code');
        this.createRoomButton    = document.getElementById('create-room');
        this.joinRoomButton      = document.getElementById('join-room');
        this.currentRoomCode     = document.getElementById('current-room-code');
        this.copyRoomCodeButton  = document.getElementById('copy-room-code');
        this.gameStatus          = document.getElementById('game-status');
        this.playerCount         = document.getElementById('player-count');

        /* ============== タブ要素 ============== */
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels  = {
            chat: document.getElementById('chat-panel'),
            log : document.getElementById('log-panel')
        };

        /* ============== 初期 UI 設定 ============== */
        this.difficultySelect.disabled = true;
        this.newGameButton.disabled    = true;
        this.chatInput.disabled        = true;
        this.sendMessageButton.disabled= true;
        this.playerNameInput.focus();

        this.setupEventListeners();
        this.setupSocketListeners();
    }

    /* ============================================================
     * イベントリスナー設定
     * ========================================================== */
    setupEventListeners() {
        /* タブ切り替え */
        this.tabButtons.forEach(btn =>
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab))
        );

        /* オーバーレイ閉じる */
        this.overlayCloseButton.addEventListener('click', () => this.hideOverlay());

        /* ルーム作成 */
        this.createRoomButton.addEventListener('click', () => this.createRoom());
        this.playerNameInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.createRoom();
        });

        /* ルーム参加 */
        this.joinRoomButton.addEventListener('click', () => this.joinRoom());
        this.roomCodeInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.joinRoom();
        });

        /* ルームコードコピー */
        this.copyRoomCodeButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.roomCode).then(() => {
                const oldHTML = this.copyRoomCodeButton.innerHTML;
                this.copyRoomCodeButton.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => this.copyRoomCodeButton.innerHTML = oldHTML, 2000);
            });
        });

        /* ゲームコントロール */
        this.difficultySelect.addEventListener('change', () => {
            if (this.gameStarted && this.isHost)
                this.socket.emit('newGame', this.difficultySelect.value);
        });
        this.newGameButton.addEventListener('click', () => {
            if (this.isHost)
                this.socket.emit('newGame', this.difficultySelect.value);
        });

        /* チャット */
        this.sendMessageButton.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        window.addEventListener('beforeunload', e => {
            if (this.playerId) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /* ============================================================
     * Socket.IO リスナー設定
     * ========================================================== */
    setupSocketListeners() {
        const addHandler = (event, handler) => {
            this.boundSocketHandlers.set(event, handler);
            this.socket.on(event, handler);
        };

        /* ---------- ❶ connect：再接続対策 ---------- */
        addHandler('connect', () => {
            const previousId = this.playerId;
            this.playerId = this.socket.id;        // 常に最新の id を保持

            // 既にルームに入っていて id が変わった → 再入室要求
            if (this.roomCode && previousId && previousId !== this.playerId) {
                this.socket.emit('rejoinRoom', {
                    roomCode: this.roomCode,
                    oldId   : previousId
                });
            }
        });

        /* ---------- 既存イベント ---------- */
        addHandler('roomCreated', ({ roomCode }) => {
            this.enterRoom(roomCode, true);
        });

        addHandler('roomJoined', ({ roomCode }) => {
            this.enterRoom(roomCode, false);
        });

        addHandler('roomError', error => {
            alert(error);
        });

        addHandler('gameState', (state) => {
            console.log('Received game state:', {
                gameStarted   : state.gameStarted,
                playerCount   : state.players.length,
                hasCurrentGame: !!state.currentGame
            });

            this.gameStarted = state.gameStarted || false;

            /* プレイヤー情報同期 */
            const oldPlayers = new Map(this.players);
            this.players = new Map();
            let currentHost = Array.from(oldPlayers.values()).find(p => p.isHost);

            state.players.forEach(p => {
                const player = { ...p };
                if (p.id === this.playerId) {
                    player.isHost = this.isHost;
                } else if (currentHost && p.id === currentHost.id) {
                    player.isHost = true;
                } else if (!currentHost && oldPlayers.size === 0 && this.players.size === 0) {
                    player.isHost = true;
                    currentHost = player;
                }
                this.players.set(p.id, player);
            });

            if (state.currentGame) {
                this.initializeBoard(state.currentGame);
                this.gameStarted = true;

                if (state.currentGame.board) {
                    for (let i = 0; i < this.rows; i++) {
                        for (let j = 0; j < this.cols; j++) {
                            const cell = state.currentGame.board[i][j];
                            if (cell.revealed || cell.flagged) {
                                this.board[i][j] = { ...cell };
                                this.updateCell(i, j, this.players.get(cell.lastClickedBy));
                            }
                        }
                    }
                }
                this.totalRevealed = state.currentGame.totalRevealed || 0;
                this.updateMinesLeft();
            }

            this.updatePlayerList();
            this.updateRoomStatus(state);
        });

        addHandler('playerJoined', (player) => {
            this.players.set(player.id, player);
            this.updatePlayerList();
            this.updatePlayerCount();
            this.addGameLog('システム', `${player.name} が参加しました`);
        });

        addHandler('playerLeft', (playerId) => {
            const player = this.players.get(playerId);
            if (player) {
                this.addGameLog('システム', `${player.name} が退出しました`);
                this.players.delete(playerId);
                this.updatePlayerList();
                this.updatePlayerCount();

                if (player.isHost && this.players.size > 0) {
                    const newHost = Array.from(this.players.values())[0];
                    if (newHost.id === this.playerId) {
                        this.isHost = true;
                        this.difficultySelect.disabled = false;
                        this.newGameButton.disabled    = false;
                        this.addGameLog('システム', 'あなたが新しいホストになりました');
                    }
                }
            }
        });

        addHandler('gameStarted', (config) => {
            this.gameStarted   = true;
            this.totalRevealed = 0;
            this.initializeBoard(config);
            this.addGameLog('システム', '新しいゲームが開始されました！');
            this.gameStatus.textContent = 'プレイ中';
            this.startTimer();
        });

        addHandler('cellsRevealed', ({ cells, playerId }) => {
            const player = this.players.get(playerId);
        
            cells.forEach(({ row, col, cell }) => {
                if (!this.board[row][col].revealed && cell.revealed) this.totalRevealed++;
                this.board[row][col] = cell;
                this._pendingUpdates.push({ row, col, player });
            });
            if (!this._rafId) {
                this._rafId = requestAnimationFrame(() => {
                    this._pendingUpdates.forEach(({ row, col, player }) => {
                        this.updateCell(row, col, player);
                    });
                    this._pendingUpdates.length = 0;
                    this._rafId = null;
                });
            }
        
            
            const totalCells = this.rows * this.cols;
            const safeCells  = totalCells - this.mines;
            const progress   = Math.floor((this.totalRevealed / safeCells) * 100);
            this.addGameLog('進捗', `${progress}% (${this.totalRevealed}/${safeCells}マス)`);
        });
        

        addHandler('flagToggled', ({ row, col, flagged, playerId }) => {
            const player = this.players.get(playerId);
            this.board[row][col].flagged = flagged;
            this.updateCell(row, col, player);
            this.updateMinesLeft();
            this.addGameLog('アクション',
                `${player.name} が (${row+1}, ${col+1}) に${flagged ? '旗を立てました' : '旗を外しました'}`
            );
        });

        addHandler('gameOver', ({ won }) => {
            this.gameStarted = false;
            this.gameStatus.textContent = '待機中';
            this.stopTimer();
            const message = won
                ? 'チーム勝利！おめでとうございます！🎉'
                : 'ゲームオーバー... みんなで次は頑張ろう！';
            this.addGameLog('システム', message);
            this.showOverlay(won);
        });

        addHandler('chatMessage', (data) => {
            this.addChatMessage(data);
        });
    }

    /* ============================================================
     * タブ切り替え
     * ========================================================== */
    switchTab(tabName) {
        if (tabName === this.activeTab) return;

        this.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        Object.entries(this.tabPanels).forEach(([name, panel]) =>
            panel.classList.toggle('active', name === tabName)
        );

        this.activeTab = tabName;
    }

    /* ============================================================
     * タイマー
     * ========================================================== */
    startTimer() {
        this.stopTimer();
        this.timerValue = 0;
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.timerValue++;
            this.updateTimerDisplay();
        }, 1000);
    }
    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
    }
    updateTimerDisplay() {
        const m = Math.floor(this.timerValue / 60);
        const s = this.timerValue % 60;
        this.timerElement.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    /* ============================================================
     * ルーム関連
     * ========================================================== */
    createRoom() {
        const name = this.playerNameInput.value.trim();
        if (!name) {
            alert('プレイヤー名を入力してください');
            this.playerNameInput.focus();
            return;
        }
        this.playerName = name;
        this.socket.emit('createRoom', name);
    }

    joinRoom() {
        const name = this.joinPlayerNameInput.value.trim();
        const roomCode = this.roomCodeInput.value.trim();
        if (!name) {
            alert('プレイヤー名を入力してください');
            this.joinPlayerNameInput.focus();
            return;
        }
        if (!roomCode) {
            alert('ルームコードを入力してください');
            this.roomCodeInput.focus();
            return;
        }
        this.playerName = name;
        this.socket.emit('joinRoom', { name, roomCode });
    }

    enterRoom(roomCode, isHost=false) {
        this.roomCode = roomCode;
        this.isHost   = isHost;
        this.playerId = this.socket.id;   

        if (this.joinSection) this.joinSection.style.display = 'none';
        if (this.roomInfo)    this.roomInfo.style.display = 'block';
        if (this.currentRoomCode) this.currentRoomCode.textContent = roomCode;

        this.players.set(this.playerId, {
            id    : this.playerId,
            name  : this.playerName,
            isHost: isHost,
            color : this.getPlayerColor(this.playerId)
        });
        this.updatePlayerList();

        this.chatInput.disabled       = false;
        this.sendMessageButton.disabled = false;

        if (isHost) {
            this.difficultySelect.disabled = false;
            this.newGameButton.disabled    = false;
            this.addGameLog('システム', 'ルームのホストになりました');
        } else {
            this.addGameLog('システム', 'ルームに参加しました');
        }
    }

    /* ============================================================
     * プレイヤー色
     * ========================================================== */
    getPlayerColor(playerId) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'
        ];
        const idx = Array.from(this.players.keys()).indexOf(playerId);
        return colors[idx % colors.length];
    }

    /* ============================================================
     * 盤面生成 / 更新
     * ========================================================== */
    initializeBoard({ rows, cols, mines }) {
        this.rows  = rows;
        this.cols  = cols;
        this.mines = mines;
        this.board = [];

        /* 旧セルをすべて remove */
        const old = this.boardElement.children;
        for (let i = old.length - 1; i >= 0; i--) {
            const cell = old[i];
            cell.removeEventListener('click', cell._clickHandler);
            cell.removeEventListener('contextmenu', cell._contextHandler);
            cell.remove();
        }

        this.boardElement.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
        this.cellElements = [];

        for (let r = 0; r < rows; r++) {
            this.board[r] = [];
            this.cellElements[r] = [];
            for (let c = 0; c < cols; c++) {
                this.board[r][c] = {
                    mine     : false,
                    revealed : false,
                    flagged  : false,
                    count    : 0
                };
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;

                cell._clickHandler    = e => this.handleClick(e, r, c);
                cell._contextHandler  = e => this.handleRightClick(e, r, c);

                cell.addEventListener('click', cell._clickHandler);
                cell.addEventListener('contextmenu', cell._contextHandler);

                this.boardElement.appendChild(cell);
                this.cellElements[r][c] = cell;
            }
        }
        this.updateMinesLeft();
    }

    handleClick(_, row, col) {
        if (!this.gameStarted || !this.playerId) return;
        if (!this.board[row][col].flagged)
            this.socket.emit('revealCell', { row, col });
    }

    handleRightClick(event, row, col) {
        event.preventDefault();
        if (!this.gameStarted || !this.playerId) return;
        if (!this.board[row][col].revealed)
            this.socket.emit('toggleFlag', { row, col });
    }

    updateCell(row, col, player) {
        const el   = this.cellElements[row][col];
        const data = this.board[row][col];
    
        el.className = 'cell';
        el.textContent = '';
        el.style.borderBottom = '';
    
        if (data.revealed) {
            el.classList.add('revealed');
            if (data.mine) {
                el.classList.add('mine');
                el.textContent = '💣';
            } else if (data.count > 0) {
                el.textContent = data.count;
            }
            if (player) el.style.borderBottom = `3px solid ${player.color}`;
        } else if (data.flagged) {
            el.classList.add('flagged');
            el.textContent = '🚩';
        }
    }    

    updateMinesLeft() {
        let flagged = 0;
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.board[r][c].flagged) flagged++;
        this.minesLeftElement.textContent = String(this.mines - flagged).padStart(3,'0');
    }

    updateRoomStatus() {
        this.playerCount.textContent = `${this.players.size}/8`;
        this.gameStatus.textContent  = this.gameStarted ? 'プレイ中' : '待機中';
    }

    updatePlayerList() {
        if (!this.playerListElement) {
            console.error('Player list element not found');
            return;
        }

        const frag = document.createDocumentFragment();
        Array.from(this.players.values()).forEach(p => {
            const div = document.createElement('div');
            div.className = `player-item${p.id === this.playerId ? ' current-player' : ''}`;
            div.innerHTML = `
                <div class="player-info">
                    <span class="player-color" style="background-color:${p.color}"></span>
                    <span class="player-name">${p.name}${p.id === this.playerId ? ' (あなた)' : ''}</span>
                </div>
                <span class="player-status ${
                    p.isHost || (p.id === this.playerId && this.isHost) ? 'host'
                    : this.gameStarted ? 'playing' : 'waiting'
                }">
                    ${p.isHost || (p.id === this.playerId && this.isHost) ? 'ホスト'
                      : this.gameStarted ? 'プレイ中' : '待機中'}
                </span>`;
            frag.appendChild(div);
        });

        requestAnimationFrame(() => {
            this.playerListElement.innerHTML = '';
            this.playerListElement.appendChild(frag);
            this.updatePlayerCount();
        });
    }

    updatePlayerCount() {
        this.playerCount.textContent = `${this.players.size}/8`;
    }

    /* ============================================================
     * チャット & ログ
     * ========================================================== */
    addGameLog(type, msg) {
        const div = document.createElement('div');
        div.className = `log-message ${type.toLowerCase()}`;
        const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        div.innerHTML = `<span class="message-time">${time}</span> ${msg}`;
        this.gameLogMessages.appendChild(div);
        this.gameLogMessages.scrollTop = this.gameLogMessages.scrollHeight;
    }

    sendChatMessage() {
        const msg = this.chatInput.value.trim();
        if (msg && this.playerId) {
            this.socket.emit('chatMessage', msg);
            this.chatInput.value = '';
        }
    }

    addChatMessage(data) {
        const div = document.createElement('div');
        div.className = 'chat-message';
        if (data.system) {
            div.innerHTML = `<span class="system-message">${data.message}</span>`;
        } else {
            const t = new Date(data.timestamp)
                .toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            div.innerHTML = `
                <span class="message-time">${t}</span>
                <span class="message-name" style="color:${data.player.color}">${data.player.name}:</span>
                <span class="message-text">${data.message}</span>`;
        }
        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /* ============================================================
     * オーバーレイ
     * ========================================================== */
    showOverlay(won) {
        this.overlay.classList.remove('success','fail');
        this.overlay.classList.add(won ? 'success' : 'fail');
        this.overlayIcon.innerHTML = won ? '🎉' : '💣';

        if (won) {
            const m = Math.floor(this.timerValue / 60);
            const s = this.timerValue % 60;
            this.overlayMessage.textContent =
                `チーム勝利！おめでとうございます！\nクリアタイム: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        } else {
            this.overlayMessage.textContent = 'ゲームオーバー... みんなで次は頑張ろう！';
        }

        requestAnimationFrame(() => {
            this.overlay.style.display = 'flex';
            requestAnimationFrame(() => this.overlay.classList.add('visible'));
        });
    }
    hideOverlay() {
        this.overlay.classList.remove('visible');
        setTimeout(() => this.overlay.style.display = 'none', 300);
    }

    /* ============================================================
     * クリーンアップ
     * ========================================================== */
    dispose() {
        this.stopTimer();
        this.boundSocketHandlers.forEach((h, ev) => this.socket.off(ev, h));
        this.boundSocketHandlers.clear();

        if (this.cellElements) {
            this.cellElements.forEach(row => row.forEach(cell => {
                cell.removeEventListener('click', cell._clickHandler);
                cell.removeEventListener('contextmenu', cell._contextHandler);
            }));
        }

        this.socket.disconnect();
        this.boardElement = this.playerListElement = this.chatMessages =
        this.gameLogMessages = this.cellElements = null;
    }
}

/* ============================================================
 * グローバル初期化
 * ========================================================== */
let game;
window.addEventListener('load', () => { game = new Minesweeper(); });
window.addEventListener('unload', () => { if (game) { game.dispose(); game = null; } });
