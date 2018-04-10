import * as http from 'http';
import { makeGraceful, GracefulServer } from '../src/graceful-server';

class Server {
    server: http.Server | GracefulServer;

    constructor(graceful: string) {
        this.server = http.createServer((req, res) => {
            res.end('hello world');
        });
        if (graceful) {
            console.log('making server graceful.');
            this.server = makeGraceful(this.server);
        }
    }

    start() {
        const port = 8000;
        this.server.listen(port, () => {
            console.log('started performce testing server on port:', port);
        });
        return this;
    }

    stop() {
        const shutdownTimeout = 5000;
        const cb = () => {
            console.log('\nstopped performance testing server');
            process.exit();
        }
        if ('graceful' in this.server) {
            (<GracefulServer>(<any>this.server)).graceful.shutdown(cb, shutdownTimeout);
        } else {
            this.server.close(cb);
        }
        return this;
    }
}

const server = new Server(process.argv[2]);
server.start();
setTimeout(() => {
    server.stop();
}, 30000);
