//
// ./controllers/dao.js - construct a router controller for a dao
//
const assert = require('assert');

const { NotFound, NotAcceptable } = require('http-errors');

const express = require('express');

// sanitize the query parameters
const listQueryParser = (req, _, next) => {
  const { skip, limit, include_docs, reduce } = req.query;

  if (typeof skip === 'string') req.query.skip = parseInt(skip);
  if (typeof limit === 'string') req.query.limit = parseInt(limit);

  if (typeof include_docs === 'string')
    req.query.include_docs = !!include_docs === 'true';

  if (typeof reduce === 'string') req.query.include_docs = !!reduce === 'true';

  next();
};

module.exports = dao => {
  const router = express.Router();

  //
  // POST {router}/ - create a new doc (CREATE)
  //
  router.post('/', async (req, res) => {
    if (!Object.keys(req.body).length)
      throw new NotAcceptable('missing body');

    const newDoc = dao.touch({ _id: dao.uuid(), ...req.body }, req.ctx.id);
    const check = dao.validate(newDoc);
    if (!check.valid) {
      check.errors.forEach(err => debug(`req.body ${err.message}`));
      const err = new NotAcceptable(`Invalid ${dao.type}`);
      err.errors = check.errors.map(e => ({
        name: e.name,
        arg: e.argument,
        msg: e.message,
      }));
      throw err;
    }
    const finalDoc = await dao.create(newDoc);
    return res.send(finalDoc);
  });

  //
  // GET {router} - get a list of docs / key values
  //
  router.get('/', listQueryParser, async (req, res) => {
    const docs = await dao.list('natural-order', req.query);
    res.send(docs.filter(doc => dao.cleanse(req.ctx, doc)));
  });

  //
  // GET {router}/:id - get a specific of doc (RETRIEVE)
  //
  router.get('/:id', async (req, res) => {
    const doc = await dao.retrieve(req.params.id);
    if (!doc) throw new NotFound(`${dao.type} not found`);
    res.send(dao.cleanse(req.ctx, doc));
  });

  //
  // PATCH {router}/:id - modify a doc (UPDATE)
  //
  router.patch('/:id', async (req, res) => {
    const modifiedDoc = dao.touch({ ...req.body }, req.ctx.id);
    const check = dao.validate(modifiedDoc);
    if (!check.valid) {
      check.errors.forEach(err => debug(`req.body ${err.message}`));
      throw new NotAcceptable();
    }
    const finalDoc = await dao.update(req.params.id, modifiedDoc);
    res.send(finalDoc);
  });

  //
  // DELETE {router}/:id - delete a doc (DELETE)
  //
  router.delete('/:id', async (req, res) => {
    try {
      const del = await dao.delete(req.params.id, req.body);
      res.send(del);
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      throw new NotFound();
    }
  });

  return router;
};
