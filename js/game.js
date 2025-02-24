class Minesweeper {
    constructor() {
        this.socket = io();
        this.board = [];
        this.gameStarted = false;
        this.playerId = null;
        this.playerName = '';
        this.roomCode = null;
        this.isHost = false;
        this.players = new Map();
        this.totalRevealed = 0;
        this.activeTab = 'chat';
        this.boundSocketHandlers = new Map();
        this.timerInterval = null;
        this.timerValue = 0;

        // DOM要素
        this.joinSection = document.getElementById('join-section');
        this.roomInfo = document.getElementById('room-info');
        this.boardElement = document.getElementById('game-board');
        this.difficultySelect = document.getElementById('difficulty');
        this.newGameButton = document.getElementById('new-game');
        this.timerElement = document.getElementById('timer');
        this.minesLeftElement = document.getElementById('mines-left');
        this.overlay = document.getElementById('game-overlay');
        this.overlayIcon = document.getElementById('overlay-icon');
        this.overlayMessage = document.getElementById('overlay-message');
        this.overlayCloseButton = document.getElementById('overlay-close');
        this.playerListElement = document.querySelector('#player-list .players');
        this.chatMessages = document.getElementById('chat-messages');
        this.gameLogMessages = document.getElementById('game-log-messages');
        this.chatInput = document.getElementById('chat-message');
        this.sendMessageButton = document.getElementById('send-message');
        this.playerNameInput = document.getElementById('player-name');
        this.joinPlayerNameInput = document.getElementById('join-player-name');
        this.roomCodeInput = document.getElementById('room-code');
        this.createRoomButton = document.getElementById('create-room');
        this.joinRoomButton = document.getElementById('join-room');
        this.currentRoomCode = document.getElementById('current-room-code');
        this.copyRoomCodeButton = document.getElementById('copy-room-code');
        this.gameStatus = document.getElementById('game-status');
        this.playerCount = document.getElementById('player-count');
        
        // タブ要素
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabPanels = {
            chat: document.getElementById('chat-panel'),
            log: document.getElementById('log-panel')
        };

        // 初期状態ではゲーム関連のコントロールを無効化
        this.difficultySelect.disabled = true;
        this.newGameButton.disabled = true;
        this.chatInput.disabled = true;
        this.sendMessageButton.disabled = true;

        // プレイヤー名入力フォームにフォーカス
        this.playerNameInput.focus();
        
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    setupEventListeners() {
        // タブ切り替え
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // オーバーレイを閉じる
        this.overlayCloseButton.addEventListener('click', () => {
            this.hideOverlay();
        });

        // ルーム作成
        this.createRoomButton.addEventListener('click', () => this.createRoom());
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });

        // 既存ルームへの参加
        this.joinRoomButton.addEventListener('click', () => this.joinRoom());
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // ルームコードのコピー
        this.copyRoomCodeButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.roomCode).then(() => {
                const originalText = this.copyRoomCodeButton.innerHTML;
                this.copyRoomCodeButton.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    this.copyRoomCodeButton.innerHTML = originalText;
                }, 2000);
            });
        });

        // ゲームコントロール
        this.difficultySelect.addEventListener('change', () => {
            if (this.gameStarted && this.isHost) {
                this.socket.emit('newGame', this.difficultySelect.value);
            }
        });

        this.newGameButton.addEventListener('click', () => {
            if (this.isHost) {
                this.socket.emit('newGame', this.difficultySelect.value);
            }
        });

        // チャット
        this.sendMessageButton.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // ページ離脱時の警告
        window.addEventListener('beforeunload', (e) => {
            if (this.playerId) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    switchTab(tabName) {
        if (tabName === this.activeTab) return;

        // タブボタンの切り替え
        this.tabButtons.forEach(button => {
            if (button.dataset.tab === tabName) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // タブパネルの切り替え
        Object.entries(this.tabPanels).forEach(([name, panel]) => {
            if (name === tabName) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        this.activeTab = tabName;
    }

    startTimer() {
        this.stopTimer(); // 既存のタイマーがあれば停止
        this.timerValue = 0;
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.timerValue++;
            this.updateTimerDisplay();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timerValue / 60);
        const seconds = this.timerValue % 60;
        this.timerElement.textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    createRoom() {
        const name = this.playerNameInput.value.trim();
        if (name) {
            this.playerName = name;
            this.socket.emit('createRoom', name);
        } else {
            alert('プレイヤー名を入力してください');
            this.playerNameInput.focus();
        }
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

    enterRoom(roomCode, isHost = false) {
        this.roomCode = roomCode;
        this.isHost = isHost;
        this.playerId = this.socket.id;

        // UIの更新
        if (this.joinSection) {
            this.joinSection.style.display = 'none';
        }
        if (this.roomInfo) {
            this.roomInfo.style.display = 'block';
        }
        if (this.currentRoomCode) {
            this.currentRoomCode.textContent = roomCode;
        }

        // プレイヤー情報の更新を強制
        this.players.set(this.playerId, {
            id: this.playerId,
            name: this.playerName,
            isHost: isHost,
            color: this.getPlayerColor(this.playerId)
        });
        this.updatePlayerList();

        // コントロールの有効化
        if (this.chatInput) {
            this.chatInput.disabled = false;
        }
        if (this.sendMessageButton) {
            this.sendMessageButton.disabled = false;
        }
        
        if (isHost) {
            if (this.difficultySelect) {
                this.difficultySelect.disabled = false;
            }
            if (this.newGameButton) {
                this.newGameButton.disabled = false;
            }
            this.addGameLog('システム', 'ルームのホストになりました');
        } else {
            this.addGameLog('システム', 'ルームに参加しました');
        }
    }

    getPlayerColor(playerId) {
        // プレイヤーごとに固有の色を生成
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'
        ];
        const index = Array.from(this.players.keys()).indexOf(playerId);
        return colors[index % colors.length];
    }

    setupSocketListeners() {
        const addHandler = (event, handler) => {
            this.boundSocketHandlers.set(event, handler);
            this.socket.on(event, handler);
        };

        addHandler('roomCreated', ({ roomCode }) => {
            this.enterRoom(roomCode, true);
        });

        addHandler('roomJoined', ({ roomCode }) => {
            this.enterRoom(roomCode, false);
        });

        addHandler('roomError', (error) => {
            alert(error);
        });

        addHandler('gameState', (state) => {
            console.log('Received game state:', {
                gameStarted: state.gameStarted,
                playerCount: state.players.length,
                hasCurrentGame: !!state.currentGame
            });

            // ゲーム状態の同期
            this.gameStarted = state.gameStarted || false;

            // プレイヤー情報の同期
            const oldPlayers = new Map(this.players);
            this.players = new Map();
            
            // 既存のホストを特定
            let currentHost = Array.from(oldPlayers.values()).find(p => p.isHost);
            
            // 新しいプレイヤー情報を設定
            state.players.forEach(p => {
                const player = { ...p };
                
                if (p.id === this.playerId) {
                    player.isHost = this.isHost;
                }
                else if (currentHost && p.id === currentHost.id) {
                    player.isHost = true;
                }
                else if (!currentHost && oldPlayers.size === 0 && this.players.size === 0) {
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
                        this.newGameButton.disabled = false;
                        this.addGameLog('システム', 'あなたが新しいホストになりました');
                    }
                }
            }
        });

        addHandler('gameStarted', (config) => {
            this.gameStarted = true;
            this.totalRevealed = 0;
            this.initializeBoard(config);
            this.addGameLog('システム', '新しいゲームが開始されました！');
            this.gameStatus.textContent = 'プレイ中';
            this.startTimer();
        });

        addHandler('cellsRevealed', ({ cells, playerId }) => {
            const player = this.players.get(playerId);
            cells.forEach(({ row, col, cell }) => {
                if (!this.board[row][col].revealed && cell.revealed) {
                    this.totalRevealed++;
                }
                this.board[row][col] = cell;
                this.updateCell(row, col, player);
            });

            const totalCells = this.rows * this.cols;
            const safeCells = totalCells - this.mines;
            const progress = Math.floor((this.totalRevealed / safeCells) * 100);
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
            
            const message = won ?
                'チーム勝利！おめでとうございます！🎉' :
                'ゲームオーバー... みんなで次は頑張ろう！';
            
            this.addGameLog('システム', message);
            this.showOverlay(won);
        });

        addHandler('chatMessage', (data) => {
            this.addChatMessage(data);
        });
    }

    initializeBoard({ rows, cols, mines }) {
        this.rows = rows;
        this.cols = cols;
        this.mines = mines;
        this.board = [];
        
        const oldCells = this.boardElement.children;
        for (let i = oldCells.length - 1; i >= 0; i--) {
            const cell = oldCells[i];
            cell.removeEventListener('click', cell._clickHandler);
            cell.removeEventListener('contextmenu', cell._contextHandler);
            cell.remove();
        }
        
        this.boardElement.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

        this.cellElements = [];

        for (let i = 0; i < rows; i++) {
            this.board[i] = [];
            this.cellElements[i] = [];
            for (let j = 0; j < cols; j++) {
                this.board[i][j] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    count: 0
                };

                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                
                cell._clickHandler = (e) => this.handleClick(e, i, j);
                cell._contextHandler = (e) => this.handleRightClick(e, i, j);
                
                cell.addEventListener('click', cell._clickHandler);
                cell.addEventListener('contextmenu', cell._contextHandler);
                this.boardElement.appendChild(cell);
                this.cellElements[i][j] = cell;
            }
        }

        this.updateMinesLeft();
    }

    handleClick(event, row, col) {
        if (!this.gameStarted || !this.playerId) return;
        
        if (!this.board[row][col].flagged) {
            this.socket.emit('revealCell', { row, col });
        }
    }

    handleRightClick(event, row, col) {
        event.preventDefault();
        if (!this.gameStarted || !this.playerId) return;

        if (!this.board[row][col].revealed) {
            this.socket.emit('toggleFlag', { row, col });
        }
    }

    updateCell(row, col, player) {
        const cell = this.cellElements[row][col];
        const cellData = this.board[row][col];
        
        const classList = ['cell'];
        
        if (cellData.revealed) {
            classList.push('revealed');
            if (cellData.mine) {
                classList.push('mine');
                requestAnimationFrame(() => {
                    cell.innerHTML = '💣';
                    if (player) {
                        cell.style.borderBottom = `3px solid ${player.color}`;
                    }
                });
            } else if (cellData.count > 0) {
                requestAnimationFrame(() => {
                    cell.textContent = cellData.count;
                    if (player) {
                        cell.style.borderBottom = `3px solid ${player.color}`;
                    }
                });
            } else if (player) {
                requestAnimationFrame(() => {
                    cell.style.borderBottom = `3px solid ${player.color}`;
                });
            }
        } else if (cellData.flagged) {
            classList.push('flagged');
            requestAnimationFrame(() => {
                cell.innerHTML = '🚩';
            });
        } else {
            requestAnimationFrame(() => {
                cell.textContent = '';
                cell.style.borderBottom = '';
            });
        }
        
        cell.className = classList.join(' ');
    }

    updateMinesLeft() {
        let flaggedCount = 0;
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                if (this.board[i][j].flagged) flaggedCount++;
            }
        }
        this.minesLeftElement.textContent = String(this.mines - flaggedCount).padStart(3, '0');
    }

    updateRoomStatus(state) {
        this.playerCount.textContent = `${this.players.size}/8`;
        this.gameStatus.textContent = this.gameStarted ? 'プレイ中' : '待機中';
    }

    updatePlayerList() {
        if (!this.playerListElement) {
            console.error('Player list element not found');
            return;
        }

        const fragment = document.createDocumentFragment();
        
        Array.from(this.players.values()).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-item${player.id === this.playerId ? ' current-player' : ''}`;

            const playerHTML = `
                <div class="player-info">
                    <span class="player-color" style="background-color: ${player.color}"></span>
                    <span class="player-name">${player.name}${player.id === this.playerId ? ' (あなた)' : ''}</span>
                </div>
                <span class="player-status ${player.isHost || (player.id === this.playerId && this.isHost) ? 'host' : this.gameStarted ? 'playing' : 'waiting'}">
                    ${player.isHost || (player.id === this.playerId && this.isHost) ? 'ホスト' : this.gameStarted ? 'プレイ中' : '待機中'}
                </span>
            `;
            
            playerDiv.innerHTML = playerHTML;
            fragment.appendChild(playerDiv);
        });

        requestAnimationFrame(() => {
            this.playerListElement.innerHTML = '';
            this.playerListElement.appendChild(fragment);
            this.updatePlayerCount();
        });
    }

    updatePlayerCount() {
        const playerCount = this.players.size;
        this.playerCount.textContent = `${playerCount}/8`;
    }

    addGameLog(type, message) {
        const logDiv = document.createElement('div');
        logDiv.className = `log-message ${type.toLowerCase()}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        logDiv.innerHTML = `<span class="message-time">${time}</span> ${message}`;
        
        this.gameLogMessages.appendChild(logDiv);
        this.gameLogMessages.scrollTop = this.gameLogMessages.scrollHeight;
    }

    sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (message && this.playerId) {
            this.socket.emit('chatMessage', message);
            this.chatInput.value = '';
        }
    }

    addChatMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        if (data.system) {
            messageDiv.innerHTML = `<span class="system-message">${data.message}</span>`;
        } else {
            const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            messageDiv.innerHTML = `
                <span class="message-time">${time}</span>
                <span class="message-name" style="color: ${data.player.color}">${data.player.name}:</span>
                <span class="message-text">${data.message}</span>
            `;
        }

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showOverlay(won) {
        this.overlay.classList.remove('success', 'fail');
        this.overlay.classList.add(won ? 'success' : 'fail');
        
        this.overlayIcon.innerHTML = won ? '🎉' : '💣';
        
        if (won) {
            const minutes = Math.floor(this.timerValue / 60);
            const seconds = this.timerValue % 60;
            const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            this.overlayMessage.textContent = `チーム勝利！おめでとうございます！\nクリアタイム: ${timeStr}`;
        } else {
            this.overlayMessage.textContent = 'ゲームオーバー... みんなで次は頑張ろう！';
        }
        
        requestAnimationFrame(() => {
            this.overlay.style.display = 'flex';
            requestAnimationFrame(() => {
                this.overlay.classList.add('visible');
            });
        });
    }

    hideOverlay() {
        this.overlay.classList.remove('visible');
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300); // トランジションの時間と合わせる
    }

    dispose() {
        this.stopTimer();
        
        this.boundSocketHandlers.forEach((handler, event) => {
            this.socket.off(event, handler);
        });
        this.boundSocketHandlers.clear();

        if (this.cellElements) {
            this.cellElements.forEach(row => {
                row.forEach(cell => {
                    if (cell._clickHandler) cell.removeEventListener('click', cell._clickHandler);
                    if (cell._contextHandler) cell.removeEventListener('contextmenu', cell._contextHandler);
                });
            });
        }

        if (this.socket) {
            this.socket.disconnect();
        }

        this.boardElement = null;
        this.playerListElement = null;
        this.chatMessages = null;
        this.gameLogMessages = null;
        this.cellElements = null;
    }
}

let game;
window.addEventListener('load', () => {
    game = new Minesweeper();
});

window.addEventListener('unload', () => {
    if (game) {
        game.dispose();
        game = null;
    }
});