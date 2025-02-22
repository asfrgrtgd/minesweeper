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

        // DOM要素
        this.joinSection = document.getElementById('join-section');
        this.roomInfo = document.getElementById('room-info');
        this.boardElement = document.getElementById('game-board');
        this.difficultySelect = document.getElementById('difficulty');
        this.newGameButton = document.getElementById('new-game');
        this.timerElement = document.getElementById('timer');
        this.minesLeftElement = document.getElementById('mines-left');
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

    joinGame() {
        const name = this.playerNameInput.value.trim();
        if (name) {
            this.playerName = name;
            this.socket.emit('join', name);
            this.playerId = this.socket.id;
            
            // 参加後にコントロールを有効化
            this.playerNameInput.disabled = true;
            this.joinGameButton.disabled = true;
            this.difficultySelect.disabled = false;
            this.newGameButton.disabled = false;
            this.chatInput.disabled = false;
            this.sendMessageButton.disabled = false;

            this.addChatMessage({
                system: true,
                message: 'ゲームに参加しました'
            });
        } else {
            alert('プレイヤー名を入力してください');
            this.playerNameInput.focus();
        }
    }

    setupSocketListeners() {
        // ルーム関連のイベント
        this.socket.on('roomCreated', ({ roomCode }) => {
            this.enterRoom(roomCode, true);
        });

        this.socket.on('roomJoined', ({ roomCode }) => {
            this.enterRoom(roomCode, false);
        });

        this.socket.on('roomError', (error) => {
            alert(error);
        });

        // ゲーム状態の同期
        this.socket.on('gameState', (state) => {
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
                
                // 自分自身の場合
                if (p.id === this.playerId) {
                    player.isHost = this.isHost;
                }
                // 既存のホストの場合
                else if (currentHost && p.id === currentHost.id) {
                    player.isHost = true;
                }
                // 新規参加で他にホストがいない場合
                else if (!currentHost && oldPlayers.size === 0 && this.players.size === 0) {
                    player.isHost = true;
                    currentHost = player;
                }
                
                this.players.set(p.id, player);
            });
            
            console.log('Updated players:', {
                playerCount: this.players.size,
                players: Array.from(this.players.entries()).map(([id, p]) => ({
                    id,
                    name: p.name,
                    isHost: p.isHost,
                    isCurrent: id === this.playerId
                }))
            });
            
            // 途中参加時のボード状態の同期
            if (state.currentGame) {
                this.initializeBoard(state.currentGame);
                this.gameStarted = true;
                
                // 既存のセル状態を適用
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

                    console.log('Board state synced:', {
                        rows: this.rows,
                        cols: this.cols,
                        totalRevealed: state.currentGame.totalRevealed
                    });
                }
                
                // 進捗状況の更新
                this.totalRevealed = state.currentGame.totalRevealed || 0;
                this.updateMinesLeft();
            }

            // UI更新
            this.updatePlayerList();
            this.updateRoomStatus(state);
        });

        // プレイヤーの参加/退出
        this.socket.on('playerJoined', (player) => {
            this.players.set(player.id, player);
            this.updatePlayerList();
            this.updatePlayerCount();
            this.addGameLog('システム', `${player.name} が参加しました`);
        });

        this.socket.on('playerLeft', (playerId) => {
            const player = this.players.get(playerId);
            if (player) {
                this.addGameLog('システム', `${player.name} が退出しました`);
                this.players.delete(playerId);
                this.updatePlayerList();
                this.updatePlayerCount();

                // ホストが退出した場合、新しいホストを設定
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

        // ゲームプレイ関連のイベント
        this.socket.on('gameStarted', (config) => {
            this.gameStarted = true;
            this.totalRevealed = 0;
            this.initializeBoard(config);
            this.addGameLog('システム', '新しいゲームが開始されました！');
            this.gameStatus.textContent = 'プレイ中';
        });

        this.socket.on('cellsRevealed', ({ cells, playerId }) => {
            const player = this.players.get(playerId);
            cells.forEach(({ row, col, cell }) => {
                if (!this.board[row][col].revealed && cell.revealed) {
                    this.totalRevealed++;
                }
                this.board[row][col] = cell;
                this.updateCell(row, col, player);
            });

            // 協力プレイの進捗を表示
            const totalCells = this.rows * this.cols;
            const safeCells = totalCells - this.mines;
            const progress = Math.floor((this.totalRevealed / safeCells) * 100);
            this.addGameLog('進捗', `${progress}% (${this.totalRevealed}/${safeCells}マス)`);
        });

        this.socket.on('flagToggled', ({ row, col, flagged, playerId }) => {
            const player = this.players.get(playerId);
            this.board[row][col].flagged = flagged;
            this.updateCell(row, col, player);
            this.updateMinesLeft();
            
            this.addGameLog('アクション',
                `${player.name} が (${row+1}, ${col+1}) に${flagged ? '旗を立てました' : '旗を外しました'}`
            );
        });

        this.socket.on('gameOver', ({ won }) => {
            this.gameStarted = false;
            this.gameStatus.textContent = '待機中';
            
            const message = won ?
                'チーム勝利！おめでとうございます！🎉' :
                'ゲームオーバー... みんなで次は頑張ろう！';
            
            this.addGameLog('システム', message);
            setTimeout(() => alert(message), 100);
        });

        // チャットメッセージ
        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data);
        });
    }

    updateRoomStatus(state) {
        this.playerCount.textContent = `${this.players.size}/8`;
        this.gameStatus.textContent = this.gameStarted ? 'プレイ中' : '待機中';
    }

    addGameLog(type, message) {
        const logDiv = document.createElement('div');
        logDiv.className = `log-message ${type.toLowerCase()}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        logDiv.innerHTML = `<span class="message-time">${time}</span> ${message}`;
        
        this.gameLogMessages.appendChild(logDiv);
        this.gameLogMessages.scrollTop = this.gameLogMessages.scrollHeight;
    }

    initializeBoard({ rows, cols, mines }) {
        this.rows = rows;
        this.cols = cols;
        this.mines = mines;
        this.board = [];
        this.boardElement.innerHTML = '';
        this.boardElement.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

        for (let i = 0; i < rows; i++) {
            this.board[i] = [];
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
                cell.addEventListener('click', (e) => this.handleClick(e, i, j));
                cell.addEventListener('contextmenu', (e) => this.handleRightClick(e, i, j));
                this.boardElement.appendChild(cell);
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
        const cell = this.boardElement.children[row * this.cols + col];
        const cellData = this.board[row][col];
        
        cell.className = 'cell';
        if (cellData.revealed) {
            cell.classList.add('revealed');
            if (cellData.mine) {
                cell.classList.add('mine');
                cell.innerHTML = '💣';
            } else if (cellData.count > 0) {
                cell.textContent = cellData.count;
            }
            
            if (player) {
                cell.style.borderBottom = `3px solid ${player.color}`;
            }
        } else if (cellData.flagged) {
            cell.classList.add('flagged');
            cell.innerHTML = '🚩';
        } else {
            cell.textContent = '';
        }
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

    updatePlayerList() {
        if (!this.playerListElement) {
            console.error('Player list element not found');
            return;
        }

        // デバッグ出力
        console.log('Updating player list with:', {
            currentPlayerId: this.playerId,
            isHost: this.isHost,
            playerCount: this.players.size,
            players: Array.from(this.players.entries()).map(([id, p]) => ({
                id,
                name: p.name,
                isHost: p.isHost,
                color: p.color
            }))
        });

        // プレイヤーリストをクリア
        this.playerListElement.innerHTML = '';

        // プレイヤー情報を表示
        Array.from(this.players.values()).forEach(player => {
            // プレイヤー要素の作成
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            
            if (player.id === this.playerId) {
                playerDiv.classList.add('current-player');
            }

            // プレイヤー情報の作成
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';

            // カラードット
            const colorDot = document.createElement('span');
            colorDot.className = 'player-color';
            colorDot.style.backgroundColor = player.color;

            // プレイヤー名
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.name;
            if (player.id === this.playerId) {
                nameSpan.textContent += ' (あなた)';
            }

            playerInfo.appendChild(colorDot);
            playerInfo.appendChild(nameSpan);

            // ステータス表示
            const statusSpan = document.createElement('span');
            statusSpan.className = 'player-status';

            if (player.isHost || (player.id === this.playerId && this.isHost)) {
                statusSpan.classList.add('host');
                statusSpan.textContent = 'ホスト';
            } else if (this.gameStarted) {
                statusSpan.classList.add('playing');
                statusSpan.textContent = 'プレイ中';
            } else {
                statusSpan.classList.add('waiting');
                statusSpan.textContent = '待機中';
            }

            // 要素を組み立て
            playerDiv.appendChild(playerInfo);
            playerDiv.appendChild(statusSpan);
            this.playerListElement.appendChild(playerDiv);
        });

        // プレイヤー数を更新
        this.updatePlayerCount();

        // スタイルの再適用を強制
        this.playerListElement.style.display = 'none';
        this.playerListElement.offsetHeight; // reflow
        this.playerListElement.style.display = '';
    }

    updatePlayerCount() {
        const playerCount = this.players.size;
        this.playerCount.textContent = `${playerCount}/8`;
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
}

// ゲームの初期化
window.addEventListener('load', () => {
    new Minesweeper();
});