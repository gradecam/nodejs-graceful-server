import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as getPort from 'get-port';
import { GracefulServer, makeGraceful } from '../src/graceful-server';

export class Server implements HelloServer {
    server: http.Server | https.Server| GracefulServer;
    port: number;
    type: 'default' | 'graceful';
    closed = 0;

    constructor(config: any = {}) {
        const requestHandler = config.requestHandler || defaultRequestHandler;
        this.server = config.secure ? https.createServer(httpsConfig(), requestHandler) : http.createServer(requestHandler);
        if (config.graceful) {
            this.server = makeGraceful(this.server);
        }
        if (config.port) { this.port = config.port; }
        this.server.on('close', () => this.closed++);
    }

    static create(config?: ServerConfig): StandardHelloServer;
    static create(config?: GracefulServerConfig): GracefulHelloServer;
    static create(config: any = {}): GracefulHelloServer | StandardHelloServer {
        if (config.graceful) {
            return <GracefulHelloServer>new Server(config);
        }
        return <StandardHelloServer>new Server(config);
    }

    async getPort(): Promise<number> {
        if (this.port) { return this.port; }
        return getPort().then(port => this.port = port);
    }

    setPort(port: number): HelloServer {
        this.port = port;
        return this;
    }
}

export interface HelloServer {
    closed: number;
    server: http.Server | https.Server | GracefulServer;
    type: 'default' | 'graceful';
    getPort(): Promise<number>;
    setPort(port: number): HelloServer;
}

export interface GracefulHelloServer extends HelloServer {
    server: GracefulServer;
    type: 'graceful';
}

export interface StandardHelloServer extends HelloServer {
    server: http.Server | https.Server;
    type: 'default';
}

/**
 * Implements the dummy hello handler.
 * @param req
 * @param res
 */
function defaultRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    res.end('hello');
}

/**
 * Returns key and cert configuraiton details.
 */
function httpsConfig() {
    return {
        key: fs.readFileSync(path.join(__dirname, 'fixture.key')),
        cert: fs.readFileSync(path.join(__dirname, 'fixture.cert')),
    };
}

export interface ServerConfig {
    port?: number;
    requestHandler?: (req: any, res: any) => void;
    secure?: boolean;
}

export interface GracefulServerConfig extends ServerConfig {
    graceful: true;
}
