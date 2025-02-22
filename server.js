import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// 静的ファイルの提供
app.use(express.static(__dirname));

// ゲームの状態管理
const rooms = new Map();

// ランダムなルームコードを生成
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(code));
    return code;
}

// ルーム作成
function createRoom(hostId, hostName) {
    const roomCode = generateRoomCode();
    const room = {
        code: roomCode,
        hostId: hostId,
        players: new Map(),
        game: null,
        totalRevealed: 0
    };

    const hostPlayer = {
        id: hostId,
        name: hostName,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        isHost: true
    };

    room.players.set(hostId, hostPlayer);
    rooms.set(roomCode, room);
    return room;
}

class MinesweeperGame {
    constructor(difficulty = 'beginner') {
        this.setDifficulty(difficulty);
        this.board = this.createBoard();
        this.gameOver = false;
        this.startTime = Date.now();
        this.totalRevealed = 0;
    }

    setDifficulty(difficulty) {
        switch (difficulty) {
            case 'beginner':
                this.rows = 9;
                this.cols = 9;
                this.mines = 10;
                break;
            case 'intermediate':
                this.rows = 16;
                this.cols = 16;
                this.mines = 40;
                break;
            case 'expert':
                this.rows = 16;
                this.cols = 30;
                this.mines = 99;
                break;
        }
    }

    createBoard() {
        const board = [];
        for (let i = 0; i < this.rows; i++) {
            board[i] = [];
            for (let j = 0; j < this.cols; j++) {
                board[i][j] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    count: 0,
                    lastClickedBy: null
                };
            }
        }
        return board;
    }

    placeMines(firstRow, firstCol) {
        let minesPlaced = 0;
        while (minesPlaced < this.mines) {
            const row = Math.floor(Math.random() * this.rows);
            const col = Math.floor(Math.random() * this.cols);
            
            if (!this.board[row][col].mine && 
                (Math.abs(row - firstRow) > 1 || Math.abs(col - firstCol) > 1)) {
                this.board[row][col].mine = true;
                minesPlaced++;
            }
        }

        // 周囲の地雷数をカウント
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                if (!this.board[i][j].mine) {
                    this.board[i][j].count = this.countAdjacentMines(i, j);
                }
            }
        }
    }

    countAdjacentMines(row, col) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const newRow = row + i;
                const newCol = col + j;
                if (newRow >= 0 && newRow < this.rows && 
                    newCol >= 0 && newCol < this.cols && 
                    this.board[newRow][newCol].mine) {
                    count++;
                }
            }
        }
        return count;
    }

    revealCell(row, col, playerId) {
        if (this.gameOver || this.board[row][col].flagged) return null;

        // 最初のクリックの場合
        if (this.totalRevealed === 0) {
            this.placeMines(row, col);
        }

        const revealedCells = [];
        this._revealCell(row, col, playerId, revealedCells);
        
        // 勝利条件：地雷以外のすべてのセルを開く
        const totalSafeCells = (this.rows * this.cols) - this.mines;
        if (this.totalRevealed === totalSafeCells) {
            this.gameOver = true;
            return { cells: revealedCells, won: true };
        }

        return { cells: revealedCells, won: false };
    }

    _revealCell(row, col, playerId, revealedCells) {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols ||
            this.board[row][col].revealed || this.board[row][col].flagged) {
            return;
        }

        this.board[row][col].revealed = true;
        this.board[row][col].lastClickedBy = playerId;
        this.totalRevealed++;
        revealedCells.push({ row, col, cell: this.board[row][col] });

        if (this.board[row][col].mine) {
            this.gameOver = true;
            return;
        }

        if (this.board[row][col].count === 0) {
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    this._revealCell(row + i, col + j, playerId, revealedCells);
                }
            }
        }
    }

    toggleFlag(row, col, playerId) {
        if (this.gameOver || this.board[row][col].revealed) return null;
        this.board[row][col].flagged = !this.board[row][col].flagged;
        return { row, col, flagged: this.board[row][col].flagged };
    }
}

// Socket.IO イベントハンドリング
io.on('connection', (socket) => {
    console.log('プレイヤーが接続しました:', socket.id);
    let currentRoom = null;

    // ルーム作成
    socket.on('createRoom', (playerName) => {
        if (currentRoom) {
            socket.emit('roomError', 'すでにルームに参加しています');
            return;
        }

        const room = createRoom(socket.id, playerName);
        currentRoom = room.code;
        socket.join(room.code);
        socket.emit('roomCreated', { roomCode: room.code });

        // ルーム状態を送信
        socket.emit('gameState', {
            players: Array.from(room.players.values()),
            currentGame: null,
            gameStarted: false
        });
    });

    // ルーム参加
    socket.on('joinRoom', ({ name, roomCode }) => {
        if (currentRoom) {
            socket.emit('roomError', 'すでにルームに参加しています');
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('roomError', 'ルームが見つかりません');
            return;
        }

        if (room.players.size >= 8) {
            socket.emit('roomError', 'ルームが満員です');
            return;
        }

        const player = {
            id: socket.id,
            name: name,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            isHost: false
        };

        room.players.set(socket.id, player);
        currentRoom = roomCode;
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });

        // 全プレイヤーの状態を確認し、同期
        const players = Array.from(room.players.values()).map(p => ({
            ...p,
            isHost: p.id === room.hostId
        }));

        // 新規参加者に完全なゲーム状態を送信
        socket.emit('gameState', {
            players,
            currentGame: room.game ? {
                ...room.game,
                board: room.game.board,
                totalRevealed: room.game.totalRevealed,
                gameStarted: true,
                rows: room.game.rows,
                cols: room.game.cols,
                mines: room.game.mines
            } : null,
            gameStarted: room.game ? true : false
        });

        // 他のプレイヤーには更新された参加者リストとゲーム状態を送信
        socket.to(roomCode).emit('gameState', {
            players,
            currentGame: room.game ? {
                gameStarted: true,
                rows: room.game.rows,
                cols: room.game.cols,
                mines: room.game.mines
            } : null,
            gameStarted: room.game ? true : false
        });

        console.log('Room state updated:', {
            roomCode,
            playerCount: room.players.size,
            host: room.hostId,
            gameInProgress: !!room.game
        });

        // 他のプレイヤーに新しいプレイヤーを通知
        socket.to(roomCode).emit('playerJoined', player);
    });

    // 新しいゲームの開始（ホストのみ）
    socket.on('newGame', (difficulty) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;

        // 新しいゲームを開始
        room.game = new MinesweeperGame(difficulty);
        
        // まずゲーム開始を通知
        io.to(currentRoom).emit('gameStarted', {
            rows: room.game.rows,
            cols: room.game.cols,
            mines: room.game.mines
        });

        // 次に完全なゲーム状態を同期
        io.to(currentRoom).emit('gameState', {
            players: Array.from(room.players.values()),
            currentGame: {
                ...room.game,
                board: room.game.board,
                totalRevealed: 0,
                gameStarted: true
            },
            gameStarted: true
        });
    });

    // セルを開く
    socket.on('revealCell', ({ row, col }) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || !room.game) return;

        const result = room.game.revealCell(row, col, socket.id);
        if (result) {
            io.to(currentRoom).emit('cellsRevealed', {
                cells: result.cells,
                playerId: socket.id
            });

            if (room.game.gameOver) {
                io.to(currentRoom).emit('gameOver', { won: result.won });
            }
        }
    });

    // フラグの設置/解除
    socket.on('toggleFlag', ({ row, col }) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room || !room.game) return;

        const result = room.game.toggleFlag(row, col, socket.id);
        if (result) {
            io.to(currentRoom).emit('flagToggled', {
                ...result,
                playerId: socket.id
            });
        }
    });

    // チャットメッセージ
    socket.on('chatMessage', (message) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player) {
            io.to(currentRoom).emit('chatMessage', {
                player: player,
                message: message,
                timestamp: Date.now()
            });
        }
    });

    // 切断
    socket.on('disconnect', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player) {
            room.players.delete(socket.id);
            io.to(currentRoom).emit('playerLeft', socket.id);

            // ホストが退出した場合、新しいホストを設定
            if (player.isHost && room.players.size > 0) {
                const newHost = Array.from(room.players.values())[0];
                newHost.isHost = true;
                room.hostId = newHost.id;
            }

            // ルームが空になった場合、ルームを削除
            if (room.players.size === 0) {
                rooms.delete(currentRoom);
            }
        }
        console.log('プレイヤーが切断しました:', socket.id);
    });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});