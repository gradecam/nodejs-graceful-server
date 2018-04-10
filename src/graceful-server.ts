import { Server, Socket } from 'net';
import { IncomingMessage, ServerResponse } from 'http';

/**
 * Augments a `Server` to make it a `GracefulServer`.
 * @param server
 */
export function makeGraceful(server: Server): GracefulServer {
    const gracefulServer: GracefulServer = <any>server;
    const socketMap = new Map<Socket, number>();
    let isShutdown = false;
    gracefulServer.graceful = {
        count,
        decrement,
        increment,
        shutdown,
        numConnections,
    };
    gracefulServer.on('connection', onConnection);
    gracefulServer.on('secureConnection', onConnection);
    gracefulServer.on('request', onRequest);
    return gracefulServer;

    /**
     * Returns the count of active requests for a given socket.
     * @param socket
     */
    function count(socket: Socket): number {
        return socketMap.get(socket);
    }

    /**
     * Decrements the request count for a given socket. If shutdown has been called
     * and the the request count is less than `1` either call `end` on the socket or
     * the supplied callback method.
     * @param socket
     * @param cb (optional) if supplied calling method is responsible for socket closure
     */
    function decrement(socket: Socket, cb?: Function): number {
        const cnt = (socketMap.get(socket) || 0) - 1;
        socketMap.set(socket, cnt);
        if (isShutdown && cnt < 1) {
            (cb || (() => socket.end()))();
        }
        return cnt;
    }

    /**
     * Increments the request count for a given socket.
     * @param socket
     */
    function increment(socket: Socket): number {
        const cnt = (socketMap.get(socket) || 0) + 1;
        socketMap.set(socket, cnt);
        return cnt;
    }

    /**
     * Start tracking requests for a socket.
     * @param socket
     */
    function onConnection(socket: Socket) {
        socketMap.set(socket, 0);
        socket.once('close', () => socketMap.delete(socket));
    }

    /**
     * Increments the request count for a given socket. Decrements the request count when
     * response is finished.
     * @param req
     * @param res
     */
    function onRequest(req: IncomingMessage, res: ServerResponse) {
        increment(req.socket);
        res.once('finish', () => decrement(req.socket));
    }

    /**
     * Attempt to gracefully shutdown the server. If `timeout` is not specified then no forceful
     * close will occur. If `timeout` is specified forcefully close connections, if necessary, after
     * the specified timeout. (A timeout of `0` will immediately disconnect clients.) In all cases
     * once any connected clients outstanding requests complete they will be closed.
     * @param cb (optional) callback to call on server close
     * @param timeout (optional) maximum amount of time to wait before forcefully closing connections
     */
    function shutdown(cb?: Function | number, timeout?: number): GracefulServer {
        if (typeof cb !== 'function') {
            timeout = cb;
            cb = () => {};
        }
        if (typeof timeout !== 'number') {
            timeout = Infinity;
        }
        isShutdown = true;
        gracefulServer.close(cb);
        setImmediate(() => {
            // close any currently idle connections
            socketMap.forEach((cnt, socket) => cnt || socket.end());
            if (!socketMap.size) { return gracefulServer.emit('graceful', true); }
            if (timeout < Infinity) {
                setTimeout(() => {
                    gracefulServer.emit('graceful', socketMap.size ? false : true);
                    // forcefully close any remaining connections
                    socketMap.forEach((cnt, socket) => socket.end());
                    setImmediate(() => socketMap.forEach((cnt, socket) => socket.destroy()));
                }, timeout).unref();
            }
        });
        return gracefulServer;
    }

    /**
     * Returns the current size of the socketMap.
     */
    function numConnections(): number {
        return socketMap.size;
    }
}

export interface GracefulServer extends Server {
    graceful: {
        count(socket: Socket): number;
        decrement(socket: Socket): number;
        decrement(socket: Socket, cb: Function): number;
        increment(socket: Socket): number;
        numConnections(): number;
        shutdown(): GracefulServer;
        shutdown(cb: Function): GracefulServer;
        shutdown(timeout: number): GracefulServer;
        shutdown(cb: Function, timeout: number): GracefulServer;
    };
}

export default makeGraceful;
