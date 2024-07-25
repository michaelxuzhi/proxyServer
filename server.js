const WebSocket = require('ws');

class ServerManager {
    constructor() {
        this.eventBus = new EventBus();

        this.msg_queue = [];
        this.game_client = [];
        this._ws_server = null;
        this._ws_client = null;

        this.isReading = false;
    }

    init() {
        // 连接
        // this.eventBus.on('ClientConnected', this.createWsClient); // 游戏客户端和代理服连接成功-准备创建
        this.eventBus.on('ServerConnected', this.handleClientMsg.bind(this)); // 代理客户端和游戏服连接成功，立即处理游戏客户端发来的消息

        // 消息接收
        this.eventBus.on('ClientMsgRevcieved', this.handleClientMsg.bind(this)); // 游戏客户端发来消息，通知代理客户端去处理
        this.eventBus.on('ServerMsgRevcieved', this.handleServerMsg.bind(this)); // 游戏服务端发来消息，转发给游戏客户端

        // 断连
        this.eventBus.on('ClientDisconnected', this.handleClientDisconnected.bind(this)); // 游戏客户端关闭
        this.eventBus.on('ServerDisconnected', this.handleServerDisconnected.bind(this)); // 游戏服务端关闭/连不上等
    }

    startServer() {
        this._ws_server = new WebSocket.Server({ port: 8001 });
        this._ws_server.binaryType = 'arraybuffer';
        this._ws_server.on('connection', gameClient => {
            // this.eventBus.emit('ClientConnected');
            this.game_client.push(gameClient);
            gameClient.on('message', message => {
                this.msg_queue.push(message);
                this.eventBus.emit('ClientMsgRevcieved');
            });

            gameClient.on('close', () => {
                this.eventBus.emit('ClientDisconnected');
            });
        });
    }

    handleClientMsg() {
        if (this.msg_queue.length == 0) {
            return;
        }
        // 检查锁的状态
        if (this.isReading) {
            return;
        }
        this.isReading = true; // 加锁

        if (!this._ws_client) {
            // 特殊处理第一条消息，也就是客户端传来的真实服务器url
            let url_msg = this.msg_queue.shift();
            let url = JSON.parse(url_msg).url;
            this.createWsClient(url);
            this.isReading = false;
            return;
        }
        let temp_msg = this.msg_queue.shift();
        this.sendToServer(temp_msg);
        this.isReading = false;
        // 递归，一直处理消息队列，直到为空
        this.handleClientMsg();
    }

    createWsClient(url) {
        this._ws_client = new WebSocket(url);
        this._ws_client.binaryType = 'arraybuffer';
        this._ws_client.on('open', () => {
            this.eventBus.emit('ServerConnected');
        });

        this._ws_client.on('message', message => {
            this.eventBus.emit('ServerMsgRevcieved', message);
        });

        this._ws_client.on('close', () => {
            this.eventBus.emit('ServerDisconnected');
        });
    }

    handleServerMsg(msg) {
        this.sendToClient(msg);
    }

    sendToClient(msg) {
        if (this.game_client.length > 0) {
            this.game_client[0].send(msg);
        }
    }
    sendToServer(msg) {
        if (this._ws_client) {
            this._ws_client.send(msg);
        }
    }

    handleClientDisconnected() {
        // 游戏客户端关闭
        if (this.game_client.length > 0) {
            this.game_client = [];
        }
        this.onServerClose();
        this.onClientClose();
    }
    handleServerDisconnected() {
        if (this.game_client.length > 0) {
            this.game_client[0].close(1000);
            this.game_client = [];
        }
        this.onClientClose();
        this.onServerClose();
    }

    onClientClose() {
        // 清空消息队列
        this.msg_queue = [];
        this.isReading = false;
    }
    onServerClose() {
        if (this._ws_client) {
            this._ws_client.close();
        }
        this._ws_client = null;
    }
}
