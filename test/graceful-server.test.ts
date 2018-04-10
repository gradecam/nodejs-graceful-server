import { Agent, IncomingMessage, ServerResponse } from 'http';
import * as https from 'https';
import { assert } from 'chai';
import { Server, GracefulHelloServer } from './hello-server';
import { makeGraceful } from '../src/graceful-server';
import a from './awaiting';

const request = require('requisition');

describe('http.Server', () => {
  describe('.close()', () => {
    describe('without keep-alive connections', () => {
      let closed = 0
      it('stops accepting new connections', async () => {
        const hello = Server.create();
        const port = await hello.getPort();
        hello.server.listen(port);
        await a.event(hello.server, 'listening');
        const res1 = await request(`http://localhost:${port}`).agent(new Agent());
        const text1 = await res1.text();
        assert.equal(text1, 'hello');
        hello.server.close();
        const err = await a.failure(request(`http://localhost:${port}`).agent(new Agent()));
        assert.match(err.message, /ECONNREFUSED/)
        closed = hello.closed;
      });
      it('closes', () => {
        assert.equal(closed, 1)
      });
    });
    describe('with keep-alive connections', () => {
      let closed = 0
      it('stops accepting new connections', async () => {
        const hello = Server.create();
        const port = await hello.getPort();
        hello.server.listen(port)
        await a.event(hello.server, 'listening')
        const res1 = await request(`http://localhost:${port}`).agent(new Agent({keepAlive: true}));
        const text1 = await res1.text();
        assert.equal(text1, 'hello')
        hello.server.close();
        const err = await a.failure(request(`http://localhost:${port}`).agent(new Agent({keepAlive: true})));
        assert.match(err.message, /ECONNREFUSED/)
        closed = hello.closed;
      })
      it("doesn't close", () => {
        assert.equal(closed, 0)
      });
    });
  });
  describe('.graceful.shutdown()', () => {
    it('registers the "close" callback', (done) => {
      const server = Server.create({graceful: true});
      server.getPort()
        .then(port => server.server.listen(port))
        .then(() => server.server.graceful.shutdown(done))
      ;
    });
    describe('without keep-alive connections', async () => {
      let closed = 0;
      it('stops accepting new connections', async () => {
        const hello = Server.create({graceful: true});
        const port = await hello.getPort();
        hello.server.listen(port);
        await a.event(hello.server, 'listening')
        const res1 = await request(`http://localhost:${port}`).agent(new Agent());
        const text1 = await res1.text();
        assert.equal(text1, 'hello')
        hello.server.graceful.shutdown(2000);
        const err = await a.failure(request(`http://localhost:${port}`).agent(new Agent()));
        assert.match(err.message, /ECONNREFUSED/)
        closed = hello.closed;
      });
      it('closes', () => {
        assert.equal(closed, 1);
      });
    });
    describe('with keep-alive connections', () => {
      let closed = 0
      let server = Server.create({graceful: true});
      it('stops accepting new connections', async () => {
        const port = await server.getPort();
        server.server.listen(port);
        await a.event(server.server, 'listening')
        const res1 = await request(`http://localhost:${port}`).agent(new Agent({keepAlive: true}));
        const text1 = await res1.text();
        assert.equal(text1, 'hello')
        // server.stop()
        server.server.graceful.shutdown(1000);
        const err = await a.failure(request(`http://localhost:${port}`).agent(new Agent({keepAlive: true})));
        assert.match(err.message, /ECONNREFUSED/)
        closed = server.closed;
      });
      it('closes', () => {
        assert.equal(closed, 1);
      });
      it('empties all sockets once closed', () => {
        assert.equal(server.server.graceful.numConnections(), 0);
      });
    });
    describe('with a 0.5s grace period', () => {
      function requestHandler(req: IncomingMessage, res: ServerResponse) {
        res.writeHead(200);
        res.write('hello');
      }
      let server = Server.create({graceful: true, requestHandler});
      it('kills connections after 0.5s', async () => {
        const port = await server.getPort();
        server.server.listen(port);
        await a.event(server.server, 'listening');
        const res = await Promise.all([
          request(`http://localhost:${port}`).agent(new Agent({keepAlive: true})),
          request(`http://localhost:${port}`).agent(new Agent({keepAlive: true})),
        ]);
        server.server.graceful.shutdown(500);
        const start = Date.now();
        await a.event(server.server, 'close');
        assert.closeTo(Date.now() - start, 500, 50);
      });
      it('empties all sockets', () => {
        assert.equal(server.server.graceful.numConnections(), 0);
      });
    });
    describe('with requests in-flight', () => {
      const server = Server.create({graceful: true, requestHandler: delayedWorldHandler});
      let closed = 0;
      it('closes their sockets once they finish', async () => {
        const port = await server.getPort();
        server.server.listen(port);
        await a.event(server.server, 'listening')
        const start = Date.now()
        const res = await Promise.all([
          request(`http://localhost:${port}/250`).agent(new Agent({ keepAlive: true })),
          request(`http://localhost:${port}/500`).agent(new Agent({ keepAlive: true })),
        ])
        server.server.graceful.shutdown(500);
        const bodies = await Promise.all(res.map(r => r.text()));
        await a.event(server.server, 'close');
        assert.equal(bodies[0], 'helloworld');
        assert.closeTo(Date.now() - start, 500, 50);
      });
    });
    describe('with requests in-flight that must be forcefully closed', () => {
      const server = Server.create({graceful: true, requestHandler: delayedWorldHandler});
      let closed = 0;
      it('should destroy sockets after grace period expires', async () => {
        const port = await server.getPort();
        server.server.listen(port);
        await a.event(server.server, 'listening');
        const start = Date.now();
        const res = await Promise.all([
          request(`http://localhost:${port}/500`).agent(new Agent({keepAlive: true})),
          request(`http://localhost:${port}/300`).agent(new Agent({keepAlive: true})),
        ]);
        server.server.graceful.shutdown(100);
        await a.event(server.server, 'close');
        for (const body of await Promise.all(res.map(r => r.text()))) {
          assert.equal(body, 'hello');
        }
        closed = server.closed;
      });
      it('should close', () => {
        assert.equal(closed, 1);
      })
    });
  });
});

describe('https.Server', () => {
  describe('.graceful.shutdown()', () => {
    describe('with keep-alive connections', () => {
      let closed = 0
      it('stops accepting new connections', async () => {
        const server = Server.create({graceful: true, secure: true});
        const port = await server.getPort();
        server.server.listen(port);
        await a.event(server.server, 'listening');
        const res1 = await request(`https://localhost:${port}`).agent(new https.Agent({
          keepAlive: true,
          rejectUnauthorized: false,
        }));
        const text1 = await res1.text();
        assert.equal(text1, 'hello')
        server.server.graceful.shutdown();
        const err = await a.failure(request(`https://localhost:${port}`).agent(new https.Agent({
          keepAlive: true,
          rejectUnauthorized: false,
        })));
        assert.match(err.message, /ECONNREFUSED/);
        closed = server.closed;
      });
      it('closes', () => {
        assert.equal(closed, 1)
      });
    });
  });
});

function delayedWorldHandler(req: IncomingMessage, res: ServerResponse) {
  const delay = parseInt(req.url.slice(1), 10);
  res.writeHead(200);
  res.write('hello');
  setTimeout(() => res.end('world'), delay);
}