"use strict";
const co               = require('co');
const _                = require('underscore');
const common           = require('duniter-common');
const http2raw         = require('../http2raw');
const constants        = require('../constants');
const AbstractController = require('./abstract');

const Transaction = common.document.Transaction

module.exports = function (server) {
  return new TransactionBinding(server);
};

function TransactionBinding(server) {

  AbstractController.call(this, server);

  const conf = server.conf;

  // Services
  const ParametersService = require('../parameters')();

  // Models
  const Source = require('../entity/source');

  this.parseTransaction = (req) => this.pushEntity(req, http2raw.transaction, constants.ENTITY_TRANSACTION);

  this.getSources = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    const sources = yield server.dal.getAvailableSourcesByPubkey(pubkey);
    const result = {
      "currency": conf.currency,
      "pubkey": pubkey,
      "sources": []
    };
    sources.forEach(function (src) {
      result.sources.push(new Source(src).json());
    });
    return result;
  });

  this.getByHash = (req) => co(function *() {
    const hash = ParametersService.getHash(req);
    const tx = yield server.dal.getTxByHash(hash);
    if (!tx) {
      throw constants.ERRORS.TX_NOT_FOUND;
    }
    if (tx.block_number) {
      tx.written_block = tx.block_number
    }
    tx.inputs = tx.inputs.map(i => i.raw || i)
    tx.outputs = tx.outputs.map(o => o.raw || o)
    return tx;
  });

  this.getHistory = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    return getFilteredHistory(pubkey, (results) => results);
  });

  this.getHistoryBetweenBlocks = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    const from = yield ParametersService.getFromP(req);
    const to = yield ParametersService.getToP(req);
    return getFilteredHistory(pubkey, (res) => {
      const histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
      histo.received = _.filter(histo.received, function(tx){ return tx && tx.block_number >= from && tx.block_number <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  });

  this.getHistoryBetweenTimes = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    const from = yield ParametersService.getFromP(req);
    const to = yield ParametersService.getToP(req);
    return getFilteredHistory(pubkey, (res) => {
      const histo = res.history;
      histo.sent =     _.filter(histo.sent, function(tx){ return tx && tx.time >= from && tx.time <= to; });
      histo.received = _.filter(histo.received, function(tx){ return tx && tx.time >= from && tx.time <= to; });
      _.extend(histo, { sending: [], receiving: [] });
      return res;
    });
  });

  this.getPendingForPubkey = (req) => co(function *() {
    const pubkey = yield ParametersService.getPubkeyP(req);
    return getFilteredHistory(pubkey, function(res) {
      const histo = res.history;
      _.extend(histo, { sent: [], received: [] });
      return res;
    });
  });

  this.getPending = () => co(function *() {
    const pending = yield server.dal.getTransactionsPending();
    const res = {
      "currency": conf.currency,
      "pending": pending
    };
    pending.map(function(tx, index) {
      pending[index] = _.omit(Transaction.fromJSON(tx).json(), 'currency', 'raw');
    });
    return res;
  });

  const getFilteredHistory = (pubkey, filter) => co(function*() {
    let history = yield server.dal.getTransactionsHistory(pubkey);
    let result = {
      "currency": conf.currency,
      "pubkey": pubkey,
      "history": history
    };
    _.keys(history).map((key) => {
      history[key].map((tx, index) => {
        history[key][index] = _.omit(Transaction.fromJSON(tx).json(), 'currency', 'raw');
        _.extend(history[key][index], {block_number: tx && tx.block_number, time: tx && tx.time});
      });
    });
    return filter(result);
  });

  return this;
}
