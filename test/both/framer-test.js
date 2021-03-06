var assert = require('assert');

var transport = require('../../');

describe('Framer', function() {
  var framer;
  var parser;

  function protocol(name, version, body) {
    describe(name + ' (v' + version + ')', function() {
      beforeEach(function() {
        var proto = transport.protocol[name];

        var pool = proto.compressionPool.create();
        framer = proto.framer.create({});
        parser = proto.parser.create({ isServer: true });

        var comp = pool.get(version);
        framer.setCompression(comp);
        parser.setCompression(comp);

        framer.setVersion(version);
        parser.setVersion(version);

        parser.skipPreface();

        framer.pipe(parser);
      });

      body(name, version);
    });
  }

  function everyProtocol(body) {
    protocol('http2', 4, body);
    protocol('spdy', 2, body);
    protocol('spdy', 3, body);
    protocol('spdy', 3.1, body);
  }

  function expect(expected, done) {
    var acc = [];
    if (!Array.isArray(expected))
      expected = [ expected ];
    parser.on('data', function(frame) {
      acc.push(frame);

      if (acc.length !== expected.length)
        return;

      assert.deepEqual(acc, expected);
      done();
    });
  }

  everyProtocol(function(name, version) {
    describe('SETTINGS', function() {
      it('should generate empty frame', function(done) {
        framer.settingsFrame({}, function(err) {
          assert(!err);

          expect({
            type: 'SETTINGS',
            settings: {}
          }, done);
        });
      });

      it('should generate regular frame', function(done) {
        framer.settingsFrame({
          max_concurrent_streams: 100,
          initial_window_size: 42
        }, function(err) {
          assert(!err);

          expect({
            type: 'SETTINGS',
            settings: {
              max_concurrent_streams: 100,
              initial_window_size: 42
            }
          }, done);
        });
      });

      it('should not put Infinity values', function(done) {
        framer.settingsFrame({
          max_concurrent_streams: Infinity
        }, function(err) {
          assert(!err);

          expect({
            type: 'SETTINGS',
            settings: {}
          }, done);
        });
      });
    });

    describe('WINDOW_UPDATE', function() {
      it('should generate regular frame', function(done) {
        framer.windowUpdateFrame({
          id: 42,
          delta: 257
        }, function(err) {
          assert(!err);

          expect({
            type: 'WINDOW_UPDATE',
            id: 42,
            delta: 257
          }, done);
        });
      });

      it('should generate negative delta frame', function(done) {
        framer.windowUpdateFrame({
          id: 42,
          delta: -257
        }, function(err) {
          assert(!err);

          expect({
            type: 'WINDOW_UPDATE',
            id: 42,
            delta: -257
          }, done);
        });
      });
    });

    describe('DATA', function() {
      it('should generate regular frame', function(done) {
        framer.dataFrame({
          id: 42,
          priority: 0,
          fin: false,
          data: new Buffer('hello')
        }, function(err) {
          assert(!err);

          expect({
            type: 'DATA',
            id: 42,
            fin: false,
            data: new Buffer('hello')
          }, done);
        });
      });

      it('should generate fin frame', function(done) {
        framer.dataFrame({
          id: 42,
          priority: 0,
          fin: true,
          data: new Buffer('hello')
        }, function(err) {
          assert(!err);

          expect({
            type: 'DATA',
            id: 42,
            fin: true,
            data: new Buffer('hello')
          }, done);
        });
      });
    });

    describe('HEADERS', function() {
      it('should generate request frame', function(done) {
        framer.requestFrame({
          id: 1,
          path: '/',
          host: 'localhost',
          method: 'GET',
          headers: {
            a: 'b'
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'HEADERS',
            id: 1,
            fin: false,
            priority: {
              weight: 16,
              parent: 0,
              exclusive: false
            },
            path: '/',
            headers: {
              ':authority': 'localhost',
              ':path': '/',
              ':scheme': 'https',
              ':method': 'GET',

              a: 'b'
            }
          }, done);
        });
      });

      it('should generate priority request frame', function(done) {
        framer.requestFrame({
          id: 1,
          path: '/',
          host: 'localhost',
          method: 'GET',
          headers: {
            a: 'b'
          },
          priority: {
            exclusive: true,
            weight: 1
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'HEADERS',
            id: 1,
            fin: false,
            priority: {
              weight: 1,
              parent: 0,

              // No exclusive flag in SPDY
              exclusive: version >= 4 ? true : false
            },
            path: '/',
            headers: {
              ':authority': 'localhost',
              ':path': '/',
              ':scheme': 'https',
              ':method': 'GET',

              a: 'b'
            }
          }, done);
        });
      });

      it('should generate response frame', function(done) {
        framer.responseFrame({
          id: 1,
          status: 200,
          reason: 'OK',
          host: 'localhost',
          headers: {
            a: 'b'
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'HEADERS',
            id: 1,
            fin: false,
            priority: {
              weight: 16,
              parent: 0,
              exclusive: false
            },
            path: undefined,
            headers: {
              ':status': '200',

              a: 'b'
            }
          }, done);
        });
      });
    });

    describe('PUSH_PROMISE', function() {
      it('should generate regular frame', function(done) {
        framer.pushFrame({
          id: 4,
          promisedId: 41,
          path: '/',
          host: 'localhost',
          method: 'GET',
          status: 200,
          headers: {
            a: 'b'
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'PUSH_PROMISE',
            id: 4,
            promisedId: 41,
            fin: false,
            path: '/',
            headers: {
              ':authority': 'localhost',
              ':path': '/',
              ':scheme': 'https',
              ':method': 'GET',
              ':status': '200',

              a: 'b'
            }
          }, done);
        });
      });

      it('should generate priority frame', function(done) {
        framer.pushFrame({
          id: 4,
          promisedId: 41,
          path: '/',
          host: 'localhost',
          method: 'GET',
          status: 200,
          priority: {
            exclusive: false,
            weight: 1,
            parent: 0
          },
          headers: {
            a: 'b'
          }
        }, function(err) {
          assert(!err);

          expect([ {
            type: 'PUSH_PROMISE',
            id: 4,
            promisedId: 41,
            fin: false,
            path: '/',
            headers: {
              ':authority': 'localhost',
              ':path': '/',
              ':scheme': 'https',
              ':method': 'GET',
              ':status': '200',

              a: 'b'
            }
          }, {
            type: 'PRIORITY',
            id: 41,
            priority: {
              exclusive: false,
              parent: 0,
              weight: 1
            }
          } ], done);
        });
      });
    });

    describe('trailing HEADERS', function() {
      it('should generate regular frame', function(done) {
        framer.headersFrame({
          id: 4,
          headers: {
            a: 'b'
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'HEADERS',
            id: 4,
            priority: {
              parent: 0,
              exclusive: false,
              weight: 16
            },
            fin: false,
            path: undefined,
            headers: {
              a: 'b'
            }
          }, done);
        });
      });

      it('should generate frames concurrently', function(done) {
        framer.headersFrame({
          id: 4,
          headers: {
            a: 'b'
          }
        });
        framer.headersFrame({
          id: 4,
          headers: {
            c: 'd'
          }
        });

        expect([ {
          type: 'HEADERS',
          id: 4,
          priority: {
            parent: 0,
            exclusive: false,
            weight: 16
          },
          fin: false,
          path: undefined,
          headers: {
            a: 'b'
          }
        }, {
          type: 'HEADERS',
          id: 4,
          priority: {
            parent: 0,
            exclusive: false,
            weight: 16
          },
          fin: false,
          path: undefined,
          headers: {
            c: 'd'
          }
        } ], done);
      });

      it('should generate continuations', function(done) {
        framer.setMaxFrameSize(10);
        parser.setMaxFrameSize(10);

        framer.headersFrame({
          id: 4,
          headers: {
            a: '+++++++++++++++++++++++',
            c: '+++++++++++++++++++++++',
            e: '+++++++++++++++++++++++',
            g: '+++++++++++++++++++++++',
            i: '+++++++++++++++++++++++'
          }
        }, function(err) {
          assert(!err);

          expect({
            type: 'HEADERS',
            id: 4,
            priority: {
              parent: 0,
              exclusive: false,
              weight: 16
            },
            fin: false,
            path: undefined,
            headers: {
              a: '+++++++++++++++++++++++',
              c: '+++++++++++++++++++++++',
              e: '+++++++++++++++++++++++',
              g: '+++++++++++++++++++++++',
              i: '+++++++++++++++++++++++'
            }
          }, done);
        });
      });
    });

    describe('RST', function() {
      it('should generate regular frame', function(done) {
        framer.rstFrame({
          id: 4,
          code: 'CANCEL'
        }, function(err) {
          assert(!err);

          expect({
            type: 'RST',
            id: 4,
            code: 'CANCEL'
          }, done);
        });
      });
    });

    describe('PING', function() {
      it('should generate regular frame', function(done) {
        framer.pingFrame({
          opaque: new Buffer([ 1, 2, 3, 4, 5, 6, 7, 8 ]),
          ack: true
        }, function(err) {
          assert(!err);

          expect({
            type: 'PING',
            opaque: version < 4 ? new Buffer([ 5, 6, 7, 8 ]) :
                                  new Buffer([ 1, 2, 3, 4, 5, 6, 7, 8 ]),
            ack: true
          }, done);
        });
      });
    });

    describe('GOAWAY', function() {
      it('should generate regular frame', function(done) {
        framer.goawayFrame({
          lastId: 42,
          code: 23
        }, function(err) {
          assert(!err);

          expect({
            type: 'GOAWAY',
            lastId: 42,
            code: 23
          }, done);
        });
      });
    });
  });
});
