//
// dao-endpoint-controller.test.js
//
const express = require('express');
require('express-async-errors');
const cookieParser = require('cookie-parser');

const DAO = require('dao-couchdb');

const nano = require('nano');

const request = require('supertest');

const { generate: _uuid } = require('short-uuid');

const daoEndpointController = require('./dao-endpoint-controller');

const COUCHDB = process.env.COUCHDB;

describe('dao-endpoint-controller', () => {
  let db;
  let ept; // "end point test" function

  it('GET /widget/known-1', done => {
    ept
      .get('/widget/known-1')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body._id).toBe('WIDGET:known-1');
        expect(body._rev).toBeTruthy();
        expect(body.name).toBe('known-1');
      })
      .end(done);
  });

  it('GET /widget/unknown-id', done => {
    ept
      .get('/widget/unknown-id')
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({ error: 'WIDGET not found', status: 404 })
      .end(done);
  });

  it('GET /widget', done => {
    ept
      .get('/widget')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(3);
        expect(body[0].name).toBe('known-1');
        expect(body[1].name).toBe('known-2');
        expect(body[2].name).toBe('known-3');
      })
      .end(done);
  });

  it('GET /widget?limit=2', done => {
    ept
      .get('/widget?limit=2')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(2);
        expect(body[0].name).toBe('known-1');
        expect(body[1].name).toBe('known-2');
      })
      .end(done);
  });

  it('GET /widget?skip=1', done => {
    ept
      .get('/widget?skip=1')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(2);
        expect(body[0].name).toBe('known-2');
        expect(body[1].name).toBe('known-3');
      })
      .end(done);
  });

  it('GET /widget?skip=1&limit=1', done => {
    ept
      .get('/widget?skip=1&limit=1')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(1);
        expect(body[0].name).toBe('known-2');
      })
      .end(done);
  });

  it('GET /widget?include_docs=false', done => {
    ept
      .get('/widget?include_docs=false')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(3);
        expect(body[0]).toBe('known-1');
        expect(body[1]).toBe('known-2');
        expect(body[2]).toBe('known-3');
      })
      .end(done);
  });

  it('GET /widget?include_docs=false&limit=2', done => {
    ept
      .get('/widget?include_docs=false&limit=2')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(2);
        expect(body[0]).toBe('known-1');
        expect(body[1]).toBe('known-2');
      })
      .end(done);
  });

  it('GET /widget?include_docs=false&skip=1', done => {
    ept
      .get('/widget?include_docs=false&skip=1')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(2);
        expect(body[0]).toBe('known-2');
        expect(body[1]).toBe('known-3');
      })
      .end(done);
  });

  it('GET /widget?include_docs=false&skip=1&limit=1', done => {
    ept
      .get('/widget?include_docs=false&skip=1&limit=1')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body.length).toBe(1);
        expect(body[0]).toBe('known-2');
      })
      .end(done);
  });

  it('POST /widget', done => {
    ept
      .post('/widget')
      .send({
        name: 'new-widget',
        label: 'New Widget',
        type: 'T1',
        status: 'ACTIVE',
      })
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(res => {
        const { body } = res;
        expect(body._id).toMatch(/^WIDGET:.+/);
        expect(body._rev).toBeTruthy();
        expect(body.name).toBe('new-widget');
        expect(body.status).toBe('ACTIVE');
      })
      .end(done);
  });

  it('POST /widget empty body', done => {
    ept
      .post('/widget')
      .expect(406)
      .expect('Content-Type', /json/)
      .expect({ error: 'missing body', status: 406 })
      .end(done);
  });

  ////////////////////////////////////////////////////////////////////////////

  beforeAll(async done => {
    const { protocol, username, password, host, pathname } = new URL(COUCHDB);
    expect(protocol).toMatch(/^https?:/);
    const service = nano(`${protocol}//${username}:${password}@${host}`);
    const baseName = new URL(COUCHDB).pathname.substr(1); // remove leading '/'
    expect(baseName).toMatch(/^[a-z][a-z0-9_-]*$/);
    const name = baseName + '-' + Math.floor(Date.now() / 1000);
    await service.db.create(name, { partitioned: true });
    db = service.use(name);

    const Widget = new DAO('WIDGET', db);

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use('/widget', mockUserCtx, daoEndpointController(Widget));
    app.use(errorController);

    ept = request(app);

    // create a view for testing...
    db.insert({
      _id: '_design/WIDGET',
      views: {
        'natural-order': {
          reduce: '_count',
          map: ({ _id, name }) => name && emit([name.toUpperCase()], name),
        },
      },
      language: 'javascript',
      options: {
        partitioned: true,
      },
    });

    // insert some known documents...
    const docs = [
      {
        _id: `WIDGET:known-1`,
        name: 'known-1',
        label: 'Known 1',
        type: 'T1',
        status: 'ACTIVE',
      },
      {
        _id: `WIDGET:known-2`,
        name: 'known-2',
        label: 'Known 2',
        type: 'T2',
        status: 'ACTIVE',
      },
      {
        _id: `WIDGET:known-3`,
        name: 'known-3',
        label: 'Known 3',
        type: 'T1',
        status: 'INACTIVE',
      },
    ];

    for (let i = 0; i < docs.length; i++) {
      await db.insert(DAO._touch(docs[i], 'admin'));
    }

    try {
      await db.partitionedView('WIDGET', 'WIDGET', 'natural-order');
      done();
    } catch (err) {
      if (err.statusCode !== 404) return done(err); // unexpected error

      // wait for database to finish initial indexing...
      const interval = setInterval(async () => {
        try {
          await db.partitionedView('WIDGET', 'WIDGET', 'natural-order');
          clearInterval(interval);
          done();
        } catch (err) {
          if (err.statusCode !== 404) return done(err); // unexpected error
          // ...not ready yet, sleep for another 10ms...
        }
      }, 10); // Note: duration doesn't really seem to matter...
    }
  });
});

//////////

//
// errorController - converts thrown errors into JSON errors for the client
//
const errorController = (err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  if (err.errors) {
    console.log(err.errors);
  }
  res.status(status).send({
    error: err.message,
    status,
    errors: err.errors,
  });
};

const mockUserCtx = (req, res, next) => {
  req.ctx = { id: 'user', roles: ['USER', 'ADMIN'] };
  next();
};
